import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import type { ContentBodyRow } from '@devops-platform/scenario';
import { mintAccessTokenFor } from '../auth/jwt';
import type { Database } from '../db/client';
import { contentAssets, contentItems, contentSteps } from '../db/schema';
import { callOrchestrator, orchestratorClient } from '../grpc/orchestrator-client';
import { tierToProto } from '../labs/session';
import { profileForCapabilities } from '../lessons/catalog';
import { runScriptInSession } from '../lessons/validate';
import { validateForPublish } from './validate';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
  type SandboxTierName,
  type ScenarioCapability,
} from '@devops-platform/shared-types/scenario';

/**
 * Xuất bản = validate đầy đủ + **một lượt chạy thử THẬT** trong sandbox, rồi mới
 * đổi state (P9 9.F task 18).
 *
 * > *"Xuất bản một bài chưa từng chạy là cách nhanh nhất mất niềm tin của người
 * > học."*
 *
 * ## Vì sao có state `publishing` (không có trong bản phác của phase-9)
 *
 * Lượt chạy thử KHÔNG vừa trong một request. Dựng sandbox mất tới ~49 s cho bài
 * `kubernetes` (đo ở P7, `docs/k8s-in-pod.md`), rồi còn setup + verify của TỪNG
 * bước, mỗi lượt exec có trần BFF 135 s. Một bài 6 bước chạm trần bất kỳ tầng
 * nào ở giữa, và người soạn nhận "lỗi mạng" cho một lượt xuất bản có thể đã
 * thành công. Nên `publish` đặt `publishing` rồi TRẢ NGAY; hàm
 * `runPublishTrial` dưới đây chạy ngoài request.
 *
 * ## Giới hạn đã biết, ghi thẳng ra
 *
 * Lượt chạy thử là một promise trong TIẾN TRÌNH của pod đã nhận request. `web`
 * chạy 2 replica; pod đó chết giữa chừng (rollout, OOM, node reboot) thì không
 * có ai tiếp tục, và bài kẹt ở `publishing`.
 *
 * Lưới an toàn là `publish_started_at` + `PUBLISH_TRIAL_STALE_MS`: một bài
 * `publishing` quá hạn được ĐỌC là đã treo (`isPublishTrialStale`), và
 * `publish` cho phép khởi động lại. Đó là một lưới, không phải một hàng đợi —
 * đường đúng khi cần chắc chắn là một job queue có leader election, và nó là
 * việc của một chặng sau chứ không phải một dòng lén ở đây.
 *
 * ⚠ **Không dùng `state = 'publishing'` làm khoá phân tán.** Hai pod nhận hai
 * lời gọi `publish` cùng lúc có thể cùng thấy `draft` rồi cùng ghi — kết quả là
 * hai sandbox chạy thử cho một bài. Câu `UPDATE … WHERE state <> 'publishing'`
 * bên dưới thu hẹp cửa sổ đó xuống một câu lệnh nguyên tử của Postgres, nhưng
 * nó không thay thế được một khoá thật.
 */

/** Quá mốc này mà vẫn `publishing` ⇒ ĐỌC là đã treo. Rộng hơn tổng trần thật để không cắt oan. */
export const PUBLISH_TRIAL_STALE_MS = 15 * 60 * 1000;

/** TTL của sandbox chạy thử — đủ cho một bài dài, và tự chết nếu ta không kịp reap. */
const TRIAL_TTL_SECONDS = 900;

export interface PublishOutcome {
  readonly published: boolean;
  /** `null` khi đạt. */
  readonly error: string | null;
}

/**
 * Bài `publishing` đã treo chưa?
 *
 * TÍNH từ `publishStartedAt`, không lưu thành cột `stale`: một cột như vậy sẽ
 * cần ai đó chạy để cập nhật, và "ai đó" chính là thứ vừa chết.
 */
export function isPublishTrialStale(publishStartedAt: Date | null, now: Date): boolean {
  if (publishStartedAt === null) {
    // `publishing` mà không có mốc bắt đầu là một dòng không thể sinh ra bởi
    // code này — đọc là treo, vì không có cơ sở nào để tin nó đang chạy.
    return true;
  }
  return now.getTime() - publishStartedAt.getTime() > PUBLISH_TRIAL_STALE_MS;
}

/** Mọi script phải chạy đúng trong lượt thử, theo thứ tự người học sẽ gặp. */
interface TrialStep {
  readonly label: string;
  readonly script: string;
  /** `true` = phải trả exit 0. `false` = chỉ cần chạy xong (setup không chấm). */
  readonly mustPass: boolean;
}

function phaseScripts(label: string, phase: unknown): TrialStep[] {
  if (phase === null || typeof phase !== 'object') {
    return [];
  }
  const setup = (phase as { setup?: unknown }).setup;
  if (setup === null || setup === undefined || typeof setup !== 'object') {
    return [];
  }
  const { foreground, background } = setup as { foreground?: unknown; background?: unknown };
  const out: TrialStep[] = [];
  if (typeof background === 'string' && background !== '') {
    out.push({ label: `${label}.setup.background`, script: background, mustPass: false });
  }
  if (typeof foreground === 'string' && foreground !== '') {
    // `foreground` bình thường do FE gõ vào terminal, không chạy qua `/exec`.
    // Lượt thử vẫn chạy nó — mục đích ở đây là chứng minh script CHẠY ĐƯỢC,
    // không phải mô phỏng đúng UX. Không bắt nó pass: một script foreground kết
    // thúc bằng lệnh trả khác 0 (ví dụ `grep` không khớp) vẫn hợp lệ.
    out.push({ label: `${label}.setup.foreground`, script: foreground, mustPass: false });
  }
  return out;
}

export function trialPlan(kind: ContentKind, body: ContentBodyRow): readonly TrialStep[] {
  const plan: TrialStep[] = [];
  if (kind === 'lesson') {
    plan.push(...phaseScripts('intro', body.intro));
    for (const step of body.steps) {
      const at = `steps[${String(step.ordinal)}]`;
      if (step.setupBackground !== null && step.setupBackground !== '') {
        plan.push({ label: `${at}.setup.background`, script: step.setupBackground, mustPass: false });
      }
      if (step.setupForeground !== null && step.setupForeground !== '') {
        plan.push({ label: `${at}.setup.foreground`, script: step.setupForeground, mustPass: false });
      }
      if (step.verifyScript !== null && step.verifyScript !== '') {
        // ⛔ Verify PHẢI pass. Đây là toàn bộ điểm của lượt chạy thử: một bài mà
        // bước chấm không bao giờ trả 0 là một bài người học không thể hoàn
        // thành, và không có gì trong hệ thống nói ra điều đó cho tới khi họ mắc
        // kẹt.
        plan.push({ label: `${at}.verifyScript`, script: step.verifyScript, mustPass: true });
      }
    }
    plan.push(...phaseScripts('finish', body.finish));
    return plan;
  }
  if (kind === 'lab') {
    plan.push(...phaseScripts('setup', { setup: body.setup }));
    for (const step of body.steps) {
      if (step.verifyScript !== null && step.verifyScript !== '') {
        // ⚠ KHÁC lesson: task của lab được chấm TRÊN MÔI TRƯỜNG CHƯA LÀM GÌ, nên
        // một verify đúng sẽ TRƯỢT ở đây (người học chưa làm task). Lượt thử chỉ
        // đòi script CHẠY ĐƯỢC — exit code nào cũng chấp nhận; thứ bị bắt là
        // script hỏng cú pháp hay gọi lệnh không có trong image.
        plan.push({ label: `task[${step.taskId ?? '?'}].verifyScript`, script: step.verifyScript, mustPass: false });
      }
    }
    return plan;
  }
  // Playground không có script nào — lượt thử của nó là chính việc sandbox dựng
  // lên được với tier + capabilities đã khai.
  return plan;
}

/**
 * `ContentItemRow.tier` là `string` (port không biết enum của DTO). Thu hẹp ở
 * ĐÂY bằng một phép kiểm thật, không bằng `as`: một tier lạ trong DB phải dừng
 * lượt xuất bản kèm tên nó, chứ không được đi tiếp thành một `SandboxTier`
 * `undefined` rồi hỏng sâu hơn ở orchestrator.
 */
function tierOrThrow(tier: string): SandboxTierName {
  const found = SANDBOX_TIER_NAMES.find((name) => name === tier);
  if (found === undefined) {
    throw new Error(`tier không hợp lệ: ${tier}`);
  }
  return found;
}

function isCapability(value: string): value is ScenarioCapability {
  return (SCENARIO_CAPABILITIES as readonly string[]).includes(value);
}

interface TrialContext {
  readonly userId: string;
  readonly role: string;
  readonly tier: SandboxTierName;
  readonly capabilities: readonly ScenarioCapability[];
}

/**
 * Dựng sandbox, chạy hết `plan`, reap.
 *
 * `reap` nằm trong `finally`: một lượt thử trượt vẫn phải trả pod về, nếu không
 * thì mỗi lần xuất bản hỏng là một pod sống tới hết TTL, và trần đồng thời của
 * cụm (6 phiên cho profile `k8s`) cạn vì những bài không ai học.
 */
async function runTrial(ctx: TrialContext, plan: readonly TrialStep[]): Promise<string | null> {
  const headers = { authorization: `Bearer ${await mintAccessTokenFor(ctx.userId, ctx.role)}` };
  const created = await callOrchestrator(() =>
    orchestratorClient().createSession(
      {
        userId: ctx.userId,
        tier: tierToProto(ctx.tier),
        ttlSeconds: TRIAL_TTL_SECONDS,
        idempotencyKey: randomUUID(),
        profile: profileForCapabilities(ctx.capabilities),
      },
      { headers },
    ),
  );

  const session = created.session;
  const expiresAt = session?.expiresAt;
  if (session === undefined || expiresAt === undefined) {
    return 'Không dựng được sandbox để chạy thử';
  }

  try {
    for (const step of plan) {
      const outcome = await runScriptInSession({
        sessionId: session.id,
        userId: ctx.userId,
        expiresAtSeconds: Number(expiresAt.seconds),
        script: step.script,
      });
      if (step.mustPass && !outcome.passed) {
        // Cắt output: nó đi vào cột `publish_error` rồi ra màn hình người soạn.
        const tail = outcome.output.slice(-2000);
        return `${step.label} trượt (exit ${String(outcome.exitCode)}):\n${tail}`;
      }
    }
    return null;
  } finally {
    try {
      await callOrchestrator(() =>
        orchestratorClient().reapSession(
          {
            sessionId: session.id,
            reason: 'publish-trial',
            actor: { case: 'userId', value: ctx.userId },
          },
          { headers },
        ),
      );
    } catch (cause) {
      // Reap hỏng KHÔNG được lật kết quả của lượt thử: pod sẽ tự chết theo TTL.
      // Nhưng nó phải để lại dấu, nếu không thì rò pod là một sự kiện vô hình.
      console.error('[content:publish] reap sandbox chạy thử thất bại', {
        sessionId: session.id,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
}

/**
 * Lượt chạy thử đầy đủ, ngoài request. Tự ghi kết quả vào DB.
 *
 * KHÔNG ném: mọi lỗi thành `publishError` + trả bài về `draft`. Một promise
 * unhandled ở đây sẽ chỉ hiện trong log của pod, và bài vẫn kẹt `publishing`.
 */
/**
 * `published_at` cho lượt xuất bản: giữ mốc CŨ nếu đã có, nếu chưa thì là `now`.
 *
 * Tách thành hàm riêng vì hai lý do, và lý do thứ hai mới là lý do thật:
 *
 * 1. Hai call-site (xuất bản tại chỗ, và đường đổi ngôi trong transaction) phải
 *    dùng CÙNG một biểu thức.
 * 2. Nó TEST ĐƯỢC. Bug dưới đây chỉ lộ khi câu lệnh chạm Postgres thật, nên một
 *    test dùng DB giả không thể bắt — và đó chính là cách nó lọt qua cả P9.
 *
 * ⛔ `${now}`, KHÔNG phải `${now}`.
 *
 * Bên trong một `sql` template, Drizzle bind giá trị THÔ — không qua mapper của
 * cột, khác hẳn một phép gán cột thường như `updatedAt: now`. Một `Date` vì thế
 * ra đường dây dưới dạng TEXT, và Postgres từ chối:
 *
 *     ERROR: COALESCE types timestamp with time zone and text cannot be matched
 *
 * Hậu quả trước khi sửa: **đường THÀNH CÔNG của publish chưa bao giờ chạy được.**
 * Lượt chạy thử ĐẠT → update này ném → bài kẹt vĩnh viễn ở `publishing`. Đường
 * THẤT BẠI thì chạy tốt (nó không có `coalesce`), nên mọi thứ *trông* như hoạt
 * động: bài sai bị từ chối đúng, chỉ bài ĐÚNG là không bao giờ lên được.
 *
 * Đo trên cụm thật 2026-09-04, sau khi ô AC "publish chạy thử thật trong sandbox"
 * cuối cùng cũng được chạy.
 */
export function publishedAtCoalesce(now: Date): SQL {
  return sql`coalesce(${contentItems.publishedAt}, ${now.toISOString()}::timestamptz)`;
}

export async function runPublishTrial(
  db: Database,
  contentId: string,
  kind: ContentKind,
  body: ContentBodyRow,
  actor: { userId: string; role: string },
  /**
   * Id của bài ĐANG CHẠY mà bản nháp này kế nhiệm (task 20). `null` = bài
   * thường, xuất bản tại chỗ.
   *
   * Khi khác `null`, lượt xuất bản KHÔNG đặt bản nháp thành `published` — nó
   * chép nội dung bản nháp đè lên bài gốc rồi XOÁ bản nháp, tất cả trong một
   * transaction. Đặt cả hai thành `published` sẽ cho ra hai bài trong catalog,
   * một cái tên `foo` và một cái tên `foo__draft`.
   */
  promoteTo: string | null = null,
): Promise<PublishOutcome> {
  // Không khởi tạo `= null`: cả ba nhánh dưới đây (hợp lệ / không hợp lệ / ném)
  // đều gán, nên một giá trị khởi tạo chỉ che mất việc TypeScript kiểm hộ ta
  // rằng chúng thật sự phủ hết.
  let error: string | null;
  try {
    const { issues } = await validateForPublish(kind, body);
    if (issues.length > 0) {
      error = `Nội dung không hợp lệ: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}`;
    } else {
      error = await runTrial(
        {
          userId: actor.userId,
          role: actor.role,
          tier: tierOrThrow(body.item.tier),
          capabilities: body.item.capabilities.filter(isCapability),
        },
        trialPlan(kind, body),
      );
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const now = new Date();
  if (error === null) {
    if (promoteTo === null) {
      await db
        .update(contentItems)
        .set({
          state: 'published',
          publishError: null,
          publishStartedAt: null,
          // `coalesce`: `publishedAt` là lần ĐẦU xuất bản. Ghi đè nó ở lần thứ
          // hai làm mất câu trả lời cho "bài này lên từ bao giờ" — `updatedAt`
          // đã trả lời câu còn lại.
          // Câu chuyện đầy đủ của `::timestamptz` nằm ở doc của hàm dưới đây.
          publishedAt: publishedAtCoalesce(now),
          updatedAt: now,
        })
        .where(eq(contentItems.id, contentId));
      return { published: true, error: null };
    }

    /**
     * Đổi ngôi: nội dung bản nháp thay thế bài đang chạy, NGUYÊN TỬ.
     *
     * Người học đang ở bước 4 của bài gốc sẽ thấy nội dung mới ở lượt đọc kế
     * tiếp — đó là điều không tránh được khi bài thật sự đổi. Thứ task 20 chặn
     * là chuyện khác và tệ hơn: nội dung đổi DẦN trong lúc họ đang học, vì
     * update ghi từng bước một ngoài transaction.
     *
     * ⚠ `progress.step_index` của người đang học KHÔNG được điều chỉnh ở đây, và
     * đó là một giới hạn đã biết: một bản nháp rút bài từ 6 bước xuống 3 sẽ để
     * lại những dòng progress trỏ ra ngoài mảng. FE phải kẹp chỉ số theo
     * `steps.length` — cùng phép kẹp nó đã cần cho bài vendored bị đổi ở
     * upstream. Ghi ra đây để nó không thành một phát hiện bất ngờ ở P13.
     */
    await db.transaction(async (tx) => {
      await tx
        .update(contentItems)
        .set({
          title: body.item.title,
          description: body.item.description,
          difficulty: body.item.difficulty,
          estimatedMinutes: body.item.estimatedMinutes,
          // Cùng phép thu hẹp thật như ở `runTrial` — lượt thử đã chạy qua nó
          // rồi, nên tới đây nó không ném; gõ `as` thay vào đây sẽ làm hai chỗ
          // nói hai chuyện khác nhau về cùng một cột.
          tier: tierOrThrow(body.item.tier),
          capabilities: body.item.capabilities.filter(isCapability),
          backendImageId: body.item.backendImageId,
          interfaceLayout: body.item.interfaceLayout,
          // `JSON.stringify` vì cột là `text`, không phải `jsonb` (C4) —
          // `capabilities` ngay trên KHÔNG cần bước này, và đó chính là chỗ dễ
          // chép nhầm sang. Nguồn là `ContentItemRow.toolset`, đã được
          // `repository.toolsetOf` parse về mảng lúc đọc.
          toolset: JSON.stringify(body.item.toolset),
          assets: body.assets,
          intro: body.intro,
          finish: body.finish,
          setup: body.setup,
          passThresholdPercent: body.item.passThresholdPercent,
          leaderboard: body.item.leaderboard,
          ttlSeconds: body.item.ttlSeconds,
          state: 'published',
          publishError: null,
          publishStartedAt: null,
          // Câu chuyện đầy đủ của `::timestamptz` nằm ở doc của hàm dưới đây.
          publishedAt: publishedAtCoalesce(now),
          updatedAt: now,
        })
        .where(eq(contentItems.id, promoteTo));

      await tx.delete(contentSteps).where(eq(contentSteps.contentId, promoteTo));
      if (body.steps.length > 0) {
        await tx.insert(contentSteps).values(
          body.steps.map((step) => ({
            id: randomUUID(),
            contentId: promoteTo,
            ordinal: step.ordinal,
            taskId: step.taskId,
            title: step.title,
            markdown: step.markdown,
            setupForeground: step.setupForeground,
            setupBackground: step.setupBackground,
            verifyScript: step.verifyScript,
            weight: step.weight,
            hint: step.hint,
          })),
        );
      }

      /**
       * Asset của bản nháp CHUYỂN CHỦ sang bài gốc — trước khi xoá bản nháp.
       *
       * ⛔ Không được để cascade dọn chúng. Markdown vừa chép sang tham chiếu
       * ảnh bằng `storageKey`, và `storageKey` là hàng trong `content_assets`;
       * xoá bản nháp trước khi chuyển chủ sẽ cho ra một bài xuất bản thành công
       * với mọi ảnh 404. Cột `storage_key` unique toàn cục nên việc đổi
       * `content_id` không va vào gì, và URL trong markdown không đổi.
       */
      await tx
        .update(contentAssets)
        .set({ contentId: promoteTo })
        .where(eq(contentAssets.contentId, contentId));

      // Giờ mới xoá bản nháp — cascade chỉ còn `content_steps` của nó.
      await tx.delete(contentItems).where(eq(contentItems.id, contentId));
    });
    return { published: true, error: null };
  }

  await db
    .update(contentItems)
    .set({ state: 'draft', publishError: error, publishStartedAt: null, updatedAt: now })
    .where(eq(contentItems.id, contentId));
  return { published: false, error };
}
