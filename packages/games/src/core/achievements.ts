/**
 * Bộ máy đánh giá thành tựu.
 *
 * Luật là DỮ LIỆU + một vị từ thuần, không phải một `switch` khổng lồ: thêm một
 * thành tựu là thêm một dòng vào bảng, và mỗi luật test được độc lập. Đây cũng là
 * chỗ nghiên cứu upstream cảnh báo — bộ 45 thành tựu của họ mỗi cái một nhánh
 * `if` viết tay, và có nhánh chết mà không ai phát hiện.
 *
 * ⚠ §8.3 của `phase-14-exec.md`: thành tựu CHỈ tính trên lượt đã xác minh. Bộ máy
 * này không tự biết lượt nào đã xác minh — bên gọi lọc trước rồi truyền vào. Lý
 * do giống `stats.ts`: nhét `verified` vào đây tạo vòng phụ thuộc `core/` →
 * `verify.ts` → reducer.
 *
 * ⚠ Bộ máy nhận `LevelFacts` chứ không phải `Level` của `k8s/contract.ts`. `core/`
 * là tầng dùng chung cho CẢ BỐN game; kéo kiểu của riêng game K8s vào đây là đảo
 * chiều phụ thuộc, và ba game sau sẽ phải import kiểu của game K8s để tính thành
 * tựu của chính chúng.
 */

import type { Achievement, Difficulty, GameId, RunResult } from './types.ts';
import { durationSeconds, isPassed } from './stats.ts';

/** Phần metadata level mà luật thành tựu THẬT SỰ đọc. Bên gọi ánh xạ từ `Level`. */
export interface LevelFacts {
  readonly id: string;
  readonly chapter: number;
  readonly parMoves: number;
  readonly difficulty: Difficulty;
  /**
   * Id các objective `required: false`. Bên gọi lấy từ
   * `level.objectives.filter((o) => !o.required).map((o) => o.id)`.
   *
   * Có mặt ở đây vì `RunResult` chỉ mang `objectivesMet` (một mảng id) và
   * `objectivesTotal` (một con số) — không có gì phân biệt mục tiêu bắt buộc với
   * mục tiêu thưởng. Không có field này thì không luật nào diễn đạt được "đã làm
   * cả việc mà level không đòi", mà đó chính là loại hành vi chủ dự án muốn
   * thưởng: tò mò, chứ không phải cày.
   */
  readonly bonusObjectiveIds: readonly string[];
}

export interface AchievementContext {
  /** ⚠ CHỈ lượt đã xác minh. Bên gọi lọc trước. */
  readonly runs: readonly RunResult[];
  readonly levels: readonly LevelFacts[];
}

export interface AchievementRule {
  readonly achievement: Achievement;
  readonly check: (ctx: AchievementContext) => boolean;
}

// ── Trợ giúp dùng chung cho các luật ────────────────────────────────────────

function passedRuns(ctx: AchievementContext): readonly RunResult[] {
  return ctx.runs.filter(isPassed);
}

function clearedLevelIds(ctx: AchievementContext): ReadonlySet<string> {
  return new Set(passedRuns(ctx).map((run) => run.levelId));
}

function levelsInChapter(ctx: AchievementContext, chapter: number): readonly LevelFacts[] {
  return ctx.levels.filter((level) => level.chapter === chapter);
}

/**
 * `false` khi chương RỖNG — chưa có level nào thì chưa hoàn thành được.
 *
 * ⚠ Không phải bắt bẻ vô ích: `[].every(...)` trả `true`, nên một chương lane C
 * chưa viết sẽ tự động mở khoá thành tựu "hoàn thành chương N" cho mọi người
 * chơi. Đây đúng là dạng lỗi mà một bảng luật khai báo dễ mắc nhất.
 */
function chapterCleared(ctx: AchievementContext, chapter: number): boolean {
  const levels = levelsInChapter(ctx, chapter);
  if (levels.length === 0) {
    return false;
  }
  const cleared = clearedLevelIds(ctx);
  return levels.every((level) => cleared.has(level.id));
}

function parByLevel(ctx: AchievementContext): ReadonlyMap<string, number> {
  return new Map(ctx.levels.map((level) => [level.id, level.parMoves]));
}

// ── Bảng luật ───────────────────────────────────────────────────────────────

function rule(
  id: string,
  gameId: GameId | 'all',
  title: string,
  description: string,
  check: (ctx: AchievementContext) => boolean,
): AchievementRule {
  return { achievement: { id, gameId, title, description, hidden: false }, check };
}

/**
 * Thành tựu ẩn. `teaser` là THAM SỐ BẮT BUỘC ở đây, không phải tuỳ chọn — hợp
 * đồng `core/types.ts` đòi `hidden: true` phải kèm teaser, và bắt buộc nó ở chữ
 * ký hàm nghĩa là quên nó thành lỗi biên dịch chứ không phải một ô xám câm trên
 * giao diện.
 *
 * ⚠ `teaser` đặt bằng spread có điều kiện vì `exactOptionalPropertyTypes` cấm
 * gán `undefined` cho một field tuỳ chọn — không phải để dành chỗ cho teaser rỗng.
 */
function hiddenRule(
  id: string,
  gameId: GameId | 'all',
  title: string,
  description: string,
  teaser: string,
  check: (ctx: AchievementContext) => boolean,
): AchievementRule {
  return { achievement: { id, gameId, title, description, hidden: true, teaser }, check };
}

export const K8S_ACHIEVEMENTS: readonly AchievementRule[] = [
  rule(
    'k8s-pod-dau-tien',
    'k8s',
    'Pod đầu tiên',
    'Hoàn thành level đầu tiên của Kubernetes Game.',
    (ctx) => passedRuns(ctx).length >= 1,
  ),
  rule(
    'k8s-chuong-1',
    'k8s',
    'Xong chương 1',
    'Hoàn thành mọi level của chương 1.',
    (ctx) => chapterCleared(ctx, 1),
  ),
  rule(
    'k8s-chuong-3',
    'k8s',
    'Xong chương 3',
    'Hoàn thành mọi level của chương 3.',
    (ctx) => chapterCleared(ctx, 3),
  ),
  rule(
    'k8s-muoi-level',
    'k8s',
    'Mười level',
    'Hoàn thành 10 level khác nhau.',
    (ctx) => clearedLevelIds(ctx).size >= 10,
  ),
  rule(
    'k8s-hai-muoi-level',
    'k8s',
    'Hai mươi level',
    'Hoàn thành 20 level khác nhau.',
    (ctx) => clearedLevelIds(ctx).size >= 20,
  ),
  rule(
    'k8s-tron-bo',
    'k8s',
    'Trọn bộ',
    'Hoàn thành mọi level của Kubernetes Game.',
    (ctx) => ctx.levels.length > 0 && clearedLevelIds(ctx).size >= ctx.levels.length,
  ),
  rule(
    'k8s-diem-tuyet-doi',
    'k8s',
    'Điểm tuyệt đối',
    'Đạt 1000 điểm ở một level bất kỳ.',
    (ctx) => passedRuns(ctx).some((run) => run.score >= 1000),
  ),
  rule(
    'k8s-tu-luc',
    'k8s',
    'Tự lực',
    'Hoàn thành 5 level mà không mở gợi ý nào.',
    (ctx) => passedRuns(ctx).filter((run) => run.hintsUsed === 0).length >= 5,
  ),
  rule(
    'k8s-dung-par',
    'k8s',
    'Không thừa một nước',
    'Hoàn thành một level với số lệnh không vượt mốc chuẩn.',
    (ctx) => {
      const par = parByLevel(ctx);
      return passedRuns(ctx).some((run) => {
        const limit = par.get(run.levelId);
        return limit !== undefined && run.commandsUsed <= limit;
      });
    },
  ),
  rule(
    'k8s-chan-doan-nhanh',
    'k8s',
    'Chẩn đoán nhanh',
    'Hoàn thành một level khó trong vòng 3 phút.',
    (ctx) => {
      const advanced = new Set(
        ctx.levels.filter((level) => level.difficulty === 'advanced').map((level) => level.id),
      );
      return passedRuns(ctx).some(
        (run) => advanced.has(run.levelId) && durationSeconds(run) > 0 && durationSeconds(run) <= 180,
      );
    },
  ),
  hiddenRule(
    'k8s-tro-lai',
    'k8s',
    'Trở lại',
    'Qua được một level mà trước đó bạn đã thua.',
    'Một level đã đánh bại bạn. Nó vẫn còn ở đó.',
    (ctx) => {
      // Thua TRƯỚC rồi mới qua — không phải "có cả lượt thua lẫn lượt qua". Hai
      // vế đó khác nhau ở đúng cái đáng thưởng: quay lại sau khi thất bại, chứ
      // không phải qua rồi thử lại cho vui.
      const firstFailure = new Map<string, number>();
      for (const run of ctx.runs) {
        if (isPassed(run)) {
          continue;
        }
        const known = firstFailure.get(run.levelId);
        if (known === undefined || run.startedAt < known) {
          firstFailure.set(run.levelId, run.startedAt);
        }
      }
      return passedRuns(ctx).some((run) => {
        const failedAt = firstFailure.get(run.levelId);
        return failedAt !== undefined && failedAt < run.startedAt;
      });
    },
  ),
  hiddenRule(
    'k8s-ti-mi',
    'k8s',
    'Tỉ mỉ',
    'Đạt trọn cả mục tiêu thưởng của một level, không chỉ mục tiêu bắt buộc.',
    'Không phải mọi việc đáng làm đều bị bắt buộc.',
    (ctx) => {
      const bonus = new Map(ctx.levels.map((level) => [level.id, level.bonusObjectiveIds]));
      return passedRuns(ctx).some((run) => {
        const ids = bonus.get(run.levelId);
        // Level KHÔNG có mục tiêu thưởng thì không tính — `[].every(...)` trả
        // `true`, và nó sẽ mở khoá thành tựu này ở ngay level đầu tiên.
        if (ids === undefined || ids.length === 0) {
          return false;
        }
        const met = new Set(run.objectivesMet);
        return ids.every((id) => met.has(id));
      });
    },
  ),
  hiddenRule(
    'k8s-khong-thua-mot-nuoc',
    'k8s',
    'Không thừa một nước',
    'Qua một level với điểm tuyệt đối, không mở gợi ý, và không vượt mốc chuẩn.',
    'Điểm số không phải thứ duy nhất đếm được trong một ván chơi.',
    (ctx) => {
      const par = parByLevel(ctx);
      return passedRuns(ctx).some((run) => {
        const limit = par.get(run.levelId);
        return (
          limit !== undefined &&
          run.score >= 1000 &&
          run.hintsUsed === 0 &&
          run.commandsUsed <= limit
        );
      });
    },
  ),
];

export const CROSS_GAME_ACHIEVEMENTS: readonly AchievementRule[] = [
  rule(
    'all-buoc-vao-cuoc',
    'all',
    'Bước vào cuộc',
    'Hoàn thành level đầu tiên ở bất kỳ game nào.',
    (ctx) => passedRuns(ctx).length >= 1,
  ),
];

export const ALL_ACHIEVEMENT_RULES: readonly AchievementRule[] = [
  ...K8S_ACHIEVEMENTS,
  ...CROSS_GAME_ACHIEVEMENTS,
];

/**
 * Trả về id các thành tựu ĐANG thoả, theo thứ tự khai báo (tất định).
 *
 * ⚠ Đây là "đang thoả", không phải "vừa mở khoá". Thành tựu đã mở rồi thì không
 * đóng lại — việc giữ danh sách đã mở là của `progress.unlockAchievements`, và
 * tách hai việc đó ra là thứ giữ cho hàm này thuần và test được.
 */
export function evaluateAchievements(
  rules: readonly AchievementRule[],
  ctx: AchievementContext,
): readonly string[] {
  return rules.filter((r) => r.check(ctx)).map((r) => r.achievement.id);
}

/** Id trùng nhau sẽ làm hai thành tựu đè lên nhau trong giao diện — test khẳng định không có. */
export function achievementIds(rules: readonly AchievementRule[]): readonly string[] {
  return rules.map((r) => r.achievement.id);
}
