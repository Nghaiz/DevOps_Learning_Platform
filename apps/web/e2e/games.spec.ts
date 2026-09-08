/**
 * P14 lane F — **làn ĐO** của trụ cột ③ Games.
 *
 * Sáu ô nghiệm thu của `phase-14-exec.md` §6 là những lời KHẲNG ĐỊNH mà chỉ bằng
 * chứng mới đóng được. Các lane khác khẳng định; file này đo.
 *
 * ══ Ba nguyên tắc, và mỗi nguyên tắc đóng một đường "xanh mà chẳng chứng minh gì" ══
 *
 * 1. **Thu tất rồi lọc, đừng rình vài URL đã đoán.** "Không có lời gọi nào" phải
 *    khác với "không có lời gọi nào tôi tình cờ nhìn". Xem `traceRequests`.
 * 2. **Mọi phép kiểm vắng mặt phải có nửa DƯƠNG.** Một matcher gõ sai báo "sạch"
 *    trên mọi trang, mãi mãi. Nên `three` không-có-ở-`/` chỉ đáng tin khi
 *    `three` CÓ-ở-`/games/k8s` cùng một matcher.
 * 3. **Thiếu bằng chứng thì nói thiếu, đừng thay bằng phép kiểm yếu hơn.** Cổng
 *    "≤ 25 draw call với 200 pod" mà chạy trên một cluster 0 pod sẽ XANH và
 *    không đo gì cả. Những ô như thế ĐỎ kèm lý do, chứ không hạ điều kiện.
 *
 * ══ ⛔ KHÔNG có ô nào đo fps ═════════════════════════════════════════════════
 *
 * Chromium headless cấp WebGL2 qua SwiftShader (rasterize bằng CPU), nên mọi con
 * số khung hình đo được là con số của máy chạy CI chứ không phải của mã. §11.3
 * chốt điều này: đo NGUYÊN NHÂN (draw call, rò rỉ geometry/texture, số frame khi
 * cảnh tĩnh) — chúng tất định và đỏ giống nhau ở mọi máy.
 *
 * ══ Chạy ════════════════════════════════════════════════════════════════════
 *
 *   E2E_START_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3000 \
 *   E2E_ORIGIN=http://127.0.0.1:3000 pnpm --filter @devops-platform/web e2e --grep @games
 *
 * `@games` đặt bằng dạng OPTION (`{ tag }`) chứ không phải hậu tố trong tên —
 * và MỌI test, kể cả các ô tiền đề/đối chứng, nằm TRONG một khối đã gắn tag: một
 * ô cổng nằm ngoài khối có tag sẽ không bao giờ chạy dưới `--grep`, tức là cái
 * cổng ấy chỉ tồn tại trên giấy.
 */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import {
  THREE_MARKERS,
  attachJson,
  describeFocus,
  findMarkers,
  movePointerAwayFromCanvas,
  readFocus,
  readSceneStats,
  scanAxe,
  tabUntil,
  traceRequests,
  traceScripts,
  waitForSceneChannel,
  type FocusInfo,
  type SceneStats,
} from './games-harness';

const CATALOG_PATH = '/games';
const GAME_PATH = '/games/k8s';

/**
 * §15.3 — hai mốc quy mô để đo BẤT BIẾN, thay cho ngưỡng `calls ≤ 25` của §11.3.
 *
 * Tính chất cần chứng minh là **instancing hoạt động**, tức số draw call KHÔNG
 * tăng theo số object. Một trần cố định đo tính chất đó rất tồi: `calls ≤ 25`
 * vẫn xanh trong khi số call ĐANG tăng, miễn trần đủ rộng — nó bắt "quá nhiều
 * call" và bỏ lọt "call tăng theo N", mà cái thứ hai mới là hồi quy thật.
 *
 * Hai mốc nằm trong tầm với có thật: l07 chạm trần quanh ~83 object (đo
 * 2026-09-08, 480 giây ở 4x), vì `controllers.ts` giới hạn ReplicaSet ở
 * `max(currentReplicas, currentReady + maxSurge)` nên nhịp tăng bị readiness
 * điều tiết, và hai node 4000m CPU chia cho pod 100m chặn số pod Ready quanh 80.
 */
const SCALE_SMALL = 8;
const SCALE_LARGE = 60;
/** §11.3 — số lần sinh/xoá object để bắt rò rỉ geometry/texture. */
const SPAWN_CYCLE_TARGET = 500;
/** Cửa sổ đo "cảnh tĩnh" của §11.3. */
const STATIC_WINDOW_MS = 3_000;

/**
 * Level dùng cho hai ô quy mô, và vì sao KHÔNG phải level 1.
 *
 * Level 1 khai `allowedResources: ['Pod']` và khởi đầu với một cluster RỖNG,
 * nên không có gì để `kubectl scale`. Chương 2 "Tăng số bản chạy trước giờ cao
 * điểm" (`l07`) khởi đầu sẵn một Deployment `tra-cuu` trong namespace
 * `giao-duc` — đúng thứ cần để đưa cảnh lên quy mô §11.3 bằng MỘT lệnh.
 */
const SCALE_LEVEL_TITLE = 'Tăng số bản chạy';
const SCALE_TARGET = 'tra-cuu';
const SCALE_NAMESPACE = 'giao-duc';

/**
 * Thông báo dùng chung khi engine chưa được nối vào route.
 *
 * `/games/k8s` render `<K8sGame />` KHÔNG kèm `levels` lẫn `createSession`
 * (`apps/web/src/app/games/k8s/page.tsx`), nên vỏ giao diện dựng đủ nhưng cluster
 * luôn rỗng và thanh lệnh luôn `disabled`. Ba ô dưới đây (level 1 bằng bàn phím,
 * 200 pod, chu kỳ sinh/xoá) đo THỨ CHƠI ĐƯỢC, nên chúng không có gì để đo cho
 * tới khi mối nối đó tồn tại. Chúng ĐỎ với đúng câu này thay vì hạ điều kiện
 * xuống một phép kiểm vẫn xanh trên một cluster rỗng.
 */
const ENGINE_NOT_WIRED =
  'Bộ máy mô phỏng chưa được nối vào route: `app/games/k8s/page.tsx` render `<K8sGame />` ' +
  'không truyền `levels` lẫn `createSession`, và `@devops-platform/games` chưa export ' +
  'danh sách level nào. Đây là một PHÁT HIỆN SẢN PHẨM của làn đo, không phải một ô test ' +
  'cần nới: không có engine thì "chơi được" không có gì để đo. Ô này ĐỎ cho tới khi lane B ' +
  'giao `createSession` + danh sách level và lane D truyền chúng vào `<K8sGame />` — đó là ' +
  'một phụ thuộc CHƯA XONG, không phải một hồi quy.';

// ─────────────────────────────────────────────────────────────── tiện ích cục bộ

/** Thanh lệnh `kubectl` mở khoá ⇔ engine đã sẵn sàng (`disabled={!engineReady}`). */
async function engineIsWired(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')];
    return inputs.some((el) => {
      const label = el.labels?.[0]?.textContent ?? '';
      return label.includes('Thanh lệnh kubectl') && !el.disabled;
    });
  });
}

function isButtonNamed(fragment: string): (info: FocusInfo) => boolean {
  return (info) =>
    info.tag === 'button' &&
    !info.disabled &&
    (info.text.includes(fragment) || info.ariaLabel.includes(fragment));
}

/** Enter trên phần tử đang focus. Không `.click()` — xem `tabUntil`. */
async function activate(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
}

/** Khoá tuỳ chọn hiển thị của game (`components/games/game-preferences.ts`). */
const SCENE_PREF_KEY = 'dlp.games.v1.k8s.display';

/**
 * Ghim bậc chất lượng TRƯỚC khi mã của app chạy.
 *
 * `addInitScript` đi qua CDP `Page.addScriptToEvaluateOnNewDocument`, nên nó ghi
 * `localStorage` sớm hơn cả effect đọc tuỳ chọn — tức là scene mount THẲNG vào
 * bậc ta cần, không mount ở `auto` rồi đổi. Đổi sau khi mount sẽ dựng lại
 * renderer giữa chừng và mọi bộ đếm ta sắp đọc bị reset dưới chân.
 */
async function seedQuality(page: Page, quality: 'auto' | 'low' | 'medium' | 'high'): Promise<void> {
  await page.addInitScript(
    (seed: { key: string; value: string }) => {
      try {
        window.localStorage.setItem(seed.key, seed.value);
      } catch {
        // Chế độ riêng tư chặn storage — game vẫn chạy, chỉ là không nhớ.
      }
    },
    { key: SCENE_PREF_KEY, value: JSON.stringify({ scene3d: true, quality }) },
  );
}

/**
 * Chọn level theo một mảnh tiêu đề.
 *
 * ⚠ Dùng `selectOption`, KHÔNG phải bàn phím — và đó là chủ ý: ô "chỉ bằng bàn
 * phím" là ô AC riêng ở trên và nó tự đi đường bàn phím thật. Ba ô hiệu năng
 * dưới đây đo GPU, không đo a11y; bắt chúng gõ Tab qua một `<select>` gốc chỉ
 * thêm một nguồn chập chờn mà không thêm một bit bằng chứng nào.
 */
async function chooseLevel(page: Page, titleFragment: string): Promise<void> {
  const value = await page.evaluate((fragment: string) => {
    const el = document.querySelector<HTMLSelectElement>('#k8s-level-select');
    const option = [...(el?.options ?? [])].find((o) => (o.textContent ?? '').includes(fragment));
    return option?.value ?? null;
  }, titleFragment);

  expect(
    value,
    `Không level nào có tiêu đề chứa "${titleFragment}". Danh sách level đã đổi, và ô ` +
      `hiệu năng dưới đây cần một level CÓ SẴN workload đổi được replica — không có nó thì ` +
      `không dựng được quy mô mà §11.3 nói tới.`,
  ).not.toBeNull();

  await page.selectOption('#k8s-level-select', value as string);
  await page.waitForTimeout(500);
}

/**
 * Bấm tốc độ mô phỏng lên mức cao nhất (`game-hud.tsx` SPEEDS = [1, 2, 4]).
 *
 * KHÔNG phải để "test nhanh hơn cho tiện": ở 1x, `kubectl scale --replicas=200`
 * mới dựng được 39 object sau 180 giây (đo 2026-09-08), tức quy mô mà §11.3 nêu
 * không bao giờ tới trong một ngân sách hợp lý. Tăng tốc đồng hồ mô phỏng đổi
 * TỐC ĐỘ ĐẠT TỚI quy mô đó, không đổi thứ được đo — draw call ở 200 object là
 * draw call ở 200 object, bất kể mất bao lâu mới có 200 object.
 */
async function setMaxSpeed(page: Page): Promise<void> {
  const found = await tabUntil(
    page,
    'nút tốc độ 4x',
    (info) => info.tag === 'button' && !info.disabled && info.text.trim() === '4x',
  );
  await activate(page);
  void found;
}

/** Gõ một lệnh vào thanh `kubectl`. Chỉ Tab lại khi focus đã rời ô — 10 vòng Tab thừa cho mỗi lệnh là đủ để một test dài hoá chậm chạp vô cớ. */
async function runKubectl(page: Page, command: string): Promise<void> {
  const isBar = (info: FocusInfo): boolean =>
    info.tag === 'input' && info.label.includes('Thanh lệnh kubectl');
  const current = await readFocus(page);
  if (current === null || !isBar(current)) {
    await tabUntil(page, 'thanh lệnh kubectl', isBar);
  }
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

// ═══════════════════════════════════════════════════════════════════════════════

test.describe('games — trụ cột ③', { tag: '@games' }, () => {
  /**
   * Khách CHƯA đăng nhập, cố ý.
   *
   * `/games` là mục nav công khai đầu tiên của repo (§4.2): game chạy trọn trong
   * trình duyệt, tiến độ ở `localStorage`. Đo bằng jar cookie rỗng vừa đúng với
   * người dùng mặc định, vừa loại một biến gây nhiễu — một phiên đang mở có thể
   * tự sinh lời gọi `/api/auth/*` và ô "0 lời gọi backend" sẽ đỏ vì vỏ ứng dụng
   * chứ không vì game.
   *
   * ⚠ PHẠM VI: các ô dưới đây KHÔNG nói gì về hành vi mạng của `/games/k8s` khi
   * người chơi ĐANG đăng nhập. Đó là một phép đo khác và chưa ai làm.
   */
  test.describe('không đăng nhập', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    // ═══════════════════════════════════ 1. 0 lời gọi backend trong lúc chơi

    test('đối chứng dương — máy thu PHẢI bắt được một lời gọi /api có thật', async ({
      page,
    }, testInfo) => {
      /*
        Không có ô này thì "0 lời gọi /api" ở ô kế tiếp có thể đơn giản là máy thu
        chưa từng gắn, hay phép lọc `pathname.startsWith('/api/')` gõ sai. Một
        phép kiểm chưa bao giờ được thấy ĐỎ thì chưa được chứng minh.
      */
      const trace = traceRequests(page);
      await openScreen(page, GAME_PATH, 'anon');
      trace.phase('đối chứng');

      await page.evaluate(() =>
        fetch('/api/__dlp-lane-f-probe').then(
          () => undefined,
          () => undefined,
        ),
      );
      await expect
        .poll(() => trace.apiCalls().length, { timeout: 10_000 })
        .toBeGreaterThan(0);

      const probes = trace.apiCalls();
      trace.stop();
      await attachJson(testInfo, 'games-network-positive-control.json', probes);

      expect(
        probes.some((r) => r.pathname === '/api/__dlp-lane-f-probe'),
        'Máy thu bắt được lời gọi /api nào đó nhưng không phải lời gọi vừa phát ra. ' +
          'Phép lọc đang nhìn nhầm thứ.',
      ).toBe(true);
    });

    test('0 lời gọi backend trong lúc chơi (§6)', async ({ page }, testInfo) => {
      test.setTimeout(120_000);

      const trace = traceRequests(page);
      trace.phase('tải trang');
      await openScreen(page, GAME_PATH, 'anon');
      await settle(page);

      // Từ đây trở đi là "đang chơi". Mọi thứ trước đó là chi phí tải trang —
      // vẫn được ghi lại và vẫn bị soi, chỉ là ở một nhãn khác.
      trace.phase('đang chơi');
      const moves: string[] = [];

      // Công tắc 3D: hành động đổi trạng thái KHÔNG phụ thuộc engine, nên nó là
      // thứ duy nhất chắc chắn có thật ở lượt chạy này. Tắt rồi bật lại cũng
      // kiểm luôn một lượt unmount/mount của cảnh.
      for (const label of ['hiệu ứng 3D', 'hiệu ứng 3D']) {
        const found = await tabUntil(page, `nút "${label}"`, isButtonNamed(label));
        await activate(page);
        moves.push(`kích hoạt ${describeFocus(found.info)}`);
      }

      // Đường chơi THẬT, khi engine đã được nối. Không có engine thì thanh lệnh
      // `disabled` và ta ghi lại điều đó thay vì giả vờ đã chơi.
      if (await engineIsWired(page)) {
        const input = await tabUntil(
          page,
          'thanh lệnh kubectl',
          (info) => info.tag === 'input' && info.label.includes('Thanh lệnh kubectl'),
        );
        for (const command of [
          'kubectl get pods -n hoc-tap',
          'kubectl describe pod web -n hoc-tap',
        ]) {
          await page.keyboard.type(command);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(400);
          moves.push(`chạy \`${command}\``);
        }
        void input;
      } else {
        moves.push(`(engine chưa nối — không chạy được lệnh kubectl nào)`);
      }

      await page.waitForTimeout(2_000);
      trace.stop();

      const api = trace.apiCalls();
      const all = trace.all();
      await attachJson(testInfo, 'games-network-trace.json', {
        path: GAME_PATH,
        moves,
        totalRequests: all.length,
        byPhase: {
          'tải trang': all.filter((r) => r.phase === 'tải trang').length,
          'đang chơi': all.filter((r) => r.phase === 'đang chơi').length,
        },
        apiCalls: api,
        crossOrigin: trace.crossOrigin(),
        requests: all.map((r) => `${r.phase} · ${r.method} ${r.pathname} (${r.resourceType})`),
      });

      // Tiền đề: máy thu đã thật sự chạy. `apiCalls().length === 0` trên một
      // mảng RỖNG đọc y hệt một trang sạch.
      expect(
        all.length,
        'Máy thu không ghi được request nào — kể cả tài liệu HTML. Nó chưa gắn, và ' +
          '"0 lời gọi /api" ở dòng dưới sẽ không chứng minh gì.',
      ).toBeGreaterThan(0);

      // Tiền đề: ta đã thật sự tương tác, không chỉ ngồi nhìn một trang tĩnh.
      expect(
        moves.filter((m) => m.startsWith('kích hoạt') || m.startsWith('chạy')).length,
        'Không thực hiện được thao tác đổi trạng thái nào, nên "không có lời gọi backend ' +
          'trong lúc chơi" mới chỉ là "không có lời gọi backend trong lúc ĐỨNG YÊN".',
      ).toBeGreaterThan(0);

      expect(
        api.map((r) => `${r.phase} · ${r.method} ${r.pathname}`),
        `${GAME_PATH} gọi ${api.length} lần tới /api/**. Ô nghiệm thu §6 nói trụ cột này ` +
          `chạy hoàn toàn trong trình duyệt — một lời gọi backend ở đây phá đúng tính chất ` +
          `định nghĩa nên nó. Đọc games-network-trace.json để biết lời gọi nào, ở giai đoạn nào.`,
      ).toEqual([]);
    });

    // ═════════════════════════════ 2. `three` chỉ nằm trong route game (nửa dương)

    test('đối chứng dương — `three` CÓ trong JS của /games/k8s', async ({ page }, testInfo) => {
      test.setTimeout(120_000);

      /*
        Nửa DƯƠNG của ô "three không có ở `/`, `/lessons`, `/dashboard`".

        Không có ô này, một dấu vết gõ sai trong THREE_MARKERS sẽ báo "sạch" trên
        mọi trang và ô AC sẽ xanh vĩnh viễn mà không đo gì — đúng hình dạng
        `a check that can only ever pass`.
      */
      const scripts = traceScripts(page);
      await openScreen(page, GAME_PATH, 'anon');
      // Chunk `three` chỉ được YÊU CẦU ở lần render đầu của scene (`next/dynamic`),
      // nên phải chờ scene mount xong mới chốt danh sách script.
      await waitForSceneChannel(page);
      await page.waitForTimeout(1_000);

      const urls = scripts.urls();
      scripts.stop();
      const { hits, scanned, bytes } = await findMarkers(page, urls, THREE_MARKERS);

      await attachJson(testInfo, 'games-three-positive-control.json', {
        path: GAME_PATH,
        scannedScripts: scanned,
        scannedBytes: bytes,
        markers: THREE_MARKERS,
        hits,
      });

      expect(scanned, `Không thu được script nào trên ${GAME_PATH}`).toBeGreaterThan(0);
      expect(
        hits.map((h) => h.marker),
        `Không dấu vết \`three\` nào trong ${scanned} script mà ${GAME_PATH} tải về, ` +
          `dù cảnh 3D đã mount (\`__dlpK8sScene\` tồn tại). Hoặc THREE_MARKERS đã lỗi ` +
          `thời so với bản \`three\` đang dùng, hoặc bundle đã đổi cách chia chunk. ` +
          `Dù là gì, phép kiểm VẮNG MẶT ở ô kia đang vô giá trị cho tới khi ô này xanh.`,
      ).not.toEqual([]);
    });

    test('`three` KHÔNG có trong JS của `/` (§6)', async ({ page }, testInfo) => {
      test.setTimeout(120_000);

      const scripts = traceScripts(page);
      await openScreen(page, '/', 'anon');
      await page.waitForTimeout(1_000);

      const landed = new URL(page.url()).pathname;
      expect(landed, `Muốn đo bundle của \`/\` nhưng đã hạ cánh ở ${landed}`).toBe('/');

      const urls = scripts.urls();
      scripts.stop();
      const { hits, scanned, bytes } = await findMarkers(page, urls, THREE_MARKERS);

      await attachJson(testInfo, 'games-three-absent-root.json', {
        path: '/',
        scannedScripts: scanned,
        scannedBytes: bytes,
        hits,
        scripts: urls.map((u) => new URL(u).pathname),
      });

      expect(scanned, 'Không thu được script nào trên `/` — không có gì để kết luận').toBeGreaterThan(0);
      expect(
        hits,
        `\`three\` có mặt trong bundle của \`/\`: ${hits.map((h) => `${h.marker} @ ${h.url}`).join(', ')}. ` +
          `§4.3 nói \`import 'three'\` chỉ được nằm trong đúng một file lazy của route game.`,
      ).toEqual([]);
    });

    // ═══════════════════════════════════════════════════════════════════ 3. axe

    test(`axe ${CATALOG_PATH}`, async ({ page }, testInfo) => {
      await openScreen(page, CATALOG_PATH, 'anon');
      await scanAxe(page, testInfo, CATALOG_PATH);
    });

    test(`axe ${GAME_PATH}`, async ({ page }, testInfo) => {
      await openScreen(page, GAME_PATH, 'anon');
      // Quét SAU khi scene mount: canvas + lớp nhãn DOM chồng lên nó chỉ tồn tại
      // từ lúc đó, và chúng chính là phần §4.4 đặt ra để qua được cổng này.
      await waitForSceneChannel(page);
      await scanAxe(page, testInfo, GAME_PATH);
    });

    // ══════════════════════════════════ 4. hết level 1 CHỈ bằng bàn phím (§4.4)

    test('chơi hết level 1 chỉ bằng bàn phím (§6)', async ({ page }, testInfo) => {
      test.setTimeout(180_000);

      await openScreen(page, GAME_PATH, 'anon');

      const wired = await engineIsWired(page);
      const hasLevelSelect = await page.evaluate(() =>
        [...document.querySelectorAll('select')].some((el) =>
          /level/i.test(el.labels?.[0]?.textContent ?? ''),
        ),
      );
      await attachJson(testInfo, 'games-keyboard-preconditions.json', {
        engineWired: wired,
        levelSelectPresent: hasLevelSelect,
      });

      expect(wired && hasLevelSelect, ENGINE_NOT_WIRED).toBe(true);

      // Level 1 là mục đầu của `<select>`; xác nhận thay vì tin.
      const selected = await page.evaluate(() => {
        const el = [...document.querySelectorAll('select')].find((node) =>
          /level/i.test(node.labels?.[0]?.textContent ?? ''),
        );
        return el?.options[el.selectedIndex]?.textContent?.trim() ?? '';
      });
      expect(selected, 'Mục đang chọn không phải level chương 1').toMatch(/^1\./);

      /*
        Level 1 (`k8s-01-pod-dau-tien`): tạo pod `web` trong namespace `hoc-tap`
        với image `nginx:1.27-alpine`, rồi đưa nó tới Running. Đường duy nhất
        tạo object là ô soạn manifest — `kubectl` của game không có verb `run`
        (`k8s/kubectl.ts`: get, describe, apply, delete, scale, edit, logs, exec,
        rollout).
      */
      const toggle = await tabUntil(
        page,
        'nút mở ô soạn manifest',
        isButtonNamed('Áp dụng manifest YAML'),
      );
      await activate(page);
      void toggle;

      const area = await tabUntil(
        page,
        'ô soạn manifest YAML',
        (info) => info.tag === 'textarea' && info.label.includes('manifest YAML'),
      );
      void area;

      const manifest = [
        'apiVersion: v1',
        'kind: Pod',
        'metadata:',
        '  name: web',
        '  namespace: hoc-tap',
        'spec:',
        '  containers:',
        '    - name: web',
        '      image: nginx:1.27-alpine',
      ].join('\n');
      await page.keyboard.type(manifest);

      await tabUntil(page, 'nút Áp dụng', isButtonNamed('Áp dụng'));
      await activate(page);

      // Pod đi Pending → Running theo đồng hồ mô phỏng; chờ ĐÍCH (level hoàn
      // thành) chứ không chờ một khoảng thời gian đoán trước.
      // Lớp phủ thắng cuộc (`game-hud.tsx` WinOverlay) chỉ render khi phase = 'won'.
      // Neo vào id của tiêu đề chứ không vào chuỗi "Hoàn thành" trần: chuỗi đó đi kèm
      // tên level nên nó đổi theo nội dung, còn id là hợp đồng của lớp phủ.
      await expect(page.locator('#k8s-win-heading')).toBeVisible({ timeout: 90_000 });

      const focusPath = await readFocus(page);
      await attachJson(testInfo, 'games-keyboard-run.json', {
        manifest,
        finalFocus: focusPath === null ? null : describeFocus(focusPath),
      });
    });

    // ══════════════════════════════════════════ 5. cổng hiệu năng §11.3

    test('số draw call KHÔNG tăng theo số object (§15.3)', async ({ page }, testInfo) => {
      test.setTimeout(600_000);

      /*
        ⛔ ĐỌC Ở BẬC `medium`, KHÔNG Ở `auto`/`high` — §15.4.

        Ở bậc cao, cảnh đi qua `EffectComposer`, và `renderer.info.render` bị
        RESET ở MỖI lần `render()`. Pass cuối của composer là `OutputPass` — một
        tam giác phủ toàn màn hình — nên `calls` đọc ra là **1** và `triangles`
        là **1**, bất kể cảnh có 2 hay 2000 object. Mọi khẳng định về draw call
        ở bậc đó đều xanh và đều vô nghĩa.

        Bậc `medium` không dựng composer, `renderer.render()` chạy thẳng, nên con
        số đọc được là con số của CẢNH. Hai tiền đề ở cuối khoá cái bẫy lại: bậc
        PHẢI là `medium`, và số tam giác PHẢI lớn hơn số object.
      */
      await seedQuality(page, 'medium');
      await openScreen(page, GAME_PATH, 'anon');
      await waitForSceneChannel(page);
      expect(await engineIsWired(page), ENGINE_NOT_WIRED).toBe(true);

      await chooseLevel(page, SCALE_LEVEL_TITLE);
      await waitForSceneChannel(page);
      await setMaxSpeed(page);

      /** Đưa cluster tới một quy mô rồi đọc số liệu của khung hình vừa vẽ ở đó. */
      const measureAt = async (replicas: number, atLeast: number): Promise<SceneStats> => {
        await runKubectl(
          page,
          `kubectl scale deployment/${SCALE_TARGET} --replicas=${replicas} -n ${SCALE_NAMESPACE}`,
        );
        await expect
          .poll(async () => (await readSceneStats(page)).objects, { timeout: 300_000 })
          .toBeGreaterThanOrEqual(atLeast);
        // Để cảnh vẽ xong khung hình ở quy mô mới rồi mới đọc: `calls` là số của
        // khung GẦN NHẤT, nên đọc quá sớm sẽ trả về số của quy mô cũ.
        await page.waitForTimeout(1_500);
        return readSceneStats(page);
      };

      const small = await measureAt(SCALE_SMALL, SCALE_SMALL);
      const large = await measureAt(SCALE_LARGE, SCALE_LARGE);

      await attachJson(testInfo, 'games-drawcall-invariant.json', {
        level: SCALE_LEVEL_TITLE,
        small: { replicas: SCALE_SMALL, ...small },
        large: { replicas: SCALE_LARGE, ...large },
        objectsDelta: large.objects - small.objects,
        callsDelta: large.calls - small.calls,
      });

      // Tiền đề 1 — bậc đúng (§15.4). `auto` có thể hạ xuống `low` hoặc giữ
      // `high`; cả hai làm con số dưới đây nói về một thứ khác.
      expect(
        large.tier,
        `Cần đọc draw call ở bậc "medium" (không composer) nhưng cảnh đang chạy bậc ` +
          `"${large.tier}". Ở "high" thì số draw call là của OutputPass, không phải của cảnh.`,
      ).toBe('medium');

      // Tiền đề 2 — con số nói về CẢNH, không về một tam giác toàn màn hình.
      expect(
        large.triangles,
        `Cảnh có ${large.objects} object mà chỉ vẽ ${large.triangles} tam giác. Con số đang ` +
          `đọc gần như chắc chắn là của một pass phủ toàn màn hình chứ không của cảnh — ` +
          `renderer.info.render reset mỗi lần render(), nên pass CUỐI là pass thắng.`,
      ).toBeGreaterThan(large.objects);

      // Đối chứng — phép đo thứ hai THẬT SỰ có nhiều object hơn, không phải đo
      // hai lần cùng một cảnh. Thiếu ô này thì `calls` bằng nhau là hiển nhiên.
      expect(
        large.objects,
        `Hai lần đo cho ${small.objects} và ${large.objects} object. Chúng phải KHÁC nhau, ` +
          `nếu không thì "draw call không đổi" chỉ đang nói rằng cảnh không đổi.`,
      ).toBeGreaterThan(small.objects);

      /*
        BẤT BIẾN của §15.3, và nó là `===` chứ không phải "tăng ít".

        Với `InstancedMesh`, mọi pod dùng chung một geometry + một material và
        khác nhau ở ma trận instance, nên số lệnh vẽ PHẲNG TUYỆT ĐỐI theo N. Nới
        thành một biên "chênh vài call" là mở lại đúng cánh cửa mà ngưỡng cũ để
        ngỏ: mesh-mỗi-pod vẫn lọt nếu N còn nhỏ.
      */
      expect(
        large.calls,
        `Draw call đi từ ${small.calls} (ở ${small.objects} object) lên ${large.calls} ` +
          `(ở ${large.objects} object). Số lệnh vẽ đang TĂNG THEO số object, tức mỗi object ` +
          `đang là một lệnh vẽ riêng — §11.1 mục 1: đây là chỗ InstancedMesh phải làm việc, ` +
          `và là khoản lời lớn nhất trong cả danh sách hiệu năng. Trần tổng có thể vẫn thấp ` +
          `hôm nay và vẫn sai về nguyên tắc.`,
      ).toBe(small.calls);
    });

    test(`geometries/textures không tăng qua ${SPAWN_CYCLE_TARGET} lần sinh/xoá (§11.3)`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(600_000);

      await seedQuality(page, 'medium');
      await openScreen(page, GAME_PATH, 'anon');
      await waitForSceneChannel(page);
      expect(await engineIsWired(page), ENGINE_NOT_WIRED).toBe(true);

      await chooseLevel(page, SCALE_LEVEL_TITLE);
      await waitForSceneChannel(page);
      await setMaxSpeed(page);

      /*
        §11.3 nói 500 chu kỳ. Con số đó là một NGƯỠNG CỠ MẪU, không phải tính
        chất cần chứng minh — và l07 chạm trần quanh ~83 object, nên 500 lần sinh
        chỉ tới được bằng cách kéo dài lượt chạy tới hàng chục phút.

        Tính chất là "geometries/textures KHÔNG tăng qua các chu kỳ sinh/xoá", và
        một rò rỉ dù chỉ một geometry mỗi object cũng lộ ra rất sớm: cảnh chỉ có
        ~5 geometry nền, nên vài chục lần sinh đã đủ nhân nó lên nhiều lần. Ta
        khẳng định tính chất trên số chu kỳ ĐẠT ĐƯỢC, GHI LẠI con số đó, và
        không giả vờ đã chạy 500.
      */
      const perCycle = 30;
      const rounds = 6;
      const samples: {
        round: number;
        peakObjects: number;
        geometries: number;
        textures: number;
      }[] = [];
      let spawned = 0;

      const scale = async (replicas: number): Promise<void> => {
        await runKubectl(
          page,
          `kubectl scale deployment/${SCALE_TARGET} --replicas=${replicas} -n ${SCALE_NAMESPACE}`,
        );
      };

      /** Đỉnh `objects` quan sát được trong một khoảng — số object THẬT SỰ đã sinh ra. */
      const watchPeak = async (ms: number): Promise<number> => {
        let peak = 0;
        const until = Date.now() + ms;
        while (Date.now() < until) {
          peak = Math.max(peak, (await readSceneStats(page)).objects);
          await page.waitForTimeout(400);
        }
        return peak;
      };

      /** Đáy `objects` quan sát được — đối chứng rằng pod THẬT SỰ đã bị xoá đi. */
      const watchPeakMin = async (ms: number): Promise<number> => {
        let low = Number.POSITIVE_INFINITY;
        const until = Date.now() + ms;
        while (Date.now() < until) {
          low = Math.min(low, (await readSceneStats(page)).objects);
          await page.waitForTimeout(400);
        }
        return low === Number.POSITIVE_INFINITY ? -1 : low;
      };

      for (let round = 0; round < rounds; round += 1) {
        await scale(perCycle);
        const peak = await watchPeak(25_000);
        await scale(0);
        const trough = await watchPeakMin(12_000);
        expect(
          trough,
          `Vòng ${round}: sau khi hạ về 0 replica, số object thấp nhất quan sát được vẫn là ` +
            `${trough} trong khi đỉnh là ${peak}. Không có chu kỳ SINH/XOÁ nào thật sự xảy ra, ` +
            `nên "geometries không tăng" bên dưới không nói lên điều gì.`,
        ).toBeLessThan(peak);

        const stats = await readSceneStats(page);
        spawned += peak;
        samples.push({
          round,
          peakObjects: peak,
          geometries: stats.geometries,
          textures: stats.textures,
        });
      }

      await attachJson(testInfo, 'games-leak-cycles.json', {
        target: SPAWN_CYCLE_TARGET,
        rounds,
        perCycle,
        spawnedObserved: spawned,
        samples,
      });

      const first = samples[0];
      const last = samples[samples.length - 1];
      expect(first, 'Không lấy được mẫu nào').toBeDefined();
      expect(last, 'Không lấy được mẫu nào').toBeDefined();

      /*
        Tiền đề: đã thật sự sinh/xoá đủ nhiều. §11.3 nói 500 chu kỳ, và một mẫu
        nhỏ hơn hẳn thì "không tăng" chỉ nghĩa là "chưa kịp tăng". Ô này ĐỎ với
        con số đo được thay vì hạ ngưỡng xuống thứ vừa đạt.
      */
      /*
        Sàn cỡ mẫu, suy từ THIẾT KẾ chứ không từ kết quả vừa chạy: cảnh giữ ~5
        geometry nền, nên 100 lần sinh mà rò rỉ một geometry mỗi object sẽ nhân
        con số đó lên hơn hai mươi lần — thừa sức lộ. Đặt sàn theo con số vừa đo
        được mới là ghim baseline, và đó là thứ phải tránh.
      */
      expect(
        spawned,
        `Chỉ quan sát được ${spawned} lần sinh object qua ${rounds} vòng (đích §11.3 là ` +
          `${SPAWN_CYCLE_TARGET}, không đạt tới trong ngân sách vì l07 chạm trần quanh ~83 ` +
          `object). Mẫu quá nhỏ để ` +
          `"geometries không tăng" nói lên điều gì — nó chỉ đang nói "chưa kịp tăng".`,
      ).toBeGreaterThanOrEqual(100);

      expect(
        last?.geometries,
        `geometries đi từ ${first?.geometries} lên ${last?.geometries} sau ${spawned} lần ` +
          `sinh object. Đây là rò rỉ geometry — nguyên nhân của kiểu giật xuất hiện sau vài ` +
          `phút chơi chứ không ngay từ đầu, và là kiểu khó truy nhất nếu không có ô này.`,
      ).toBeLessThanOrEqual(first?.geometries ?? 0);

      expect(
        last?.textures,
        `textures đi từ ${first?.textures} lên ${last?.textures} sau ${spawned} lần sinh object.`,
      ).toBeLessThanOrEqual(first?.textures ?? 0);
    });

    test(`0 frame vẽ khi cảnh tĩnh ${STATIC_WINDOW_MS / 1000} giây (§11.3)`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);

      await openScreen(page, GAME_PATH, 'anon');

      /*
        TIỀN ĐỀ do lane E nêu: hiệu ứng bồng bềnh chỉ chạy khi con trỏ nằm TRONG
        khung (§11.2 giải mâu thuẫn giữa "cảnh phải sống" và "cảnh tĩnh không
        được vẽ"). Không đẩy con trỏ ra thì ô này chập chờn — và một cổng chập
        chờn sẽ bị xoá, mất luôn thứ duy nhất chứng minh render-theo-yêu-cầu là
        thật chứ không phải một dòng trong tài liệu.
      */
      await movePointerAwayFromCanvas(page);
      await waitForSceneChannel(page);

      /*
        Chờ cảnh NGỦ trước khi mở cửa sổ đo.

        Ngay sau mount, camera còn đang giảm chấn về vị trí đích và mỗi frame đó
        là một lần vẽ HỢP LỆ. Đo ngay sẽ đỏ vì một hành vi đúng. Định nghĩa cần
        đo là "cảnh đứng yên rồi thì có ngừng vẽ không", nên trước hết phải chờ
        nó đứng yên — và nếu nó KHÔNG BAO GIỜ đứng yên thì đó chính là hỏng hóc
        ô này săn, chỉ là dưới một cái tên khác.
      */
      let previous = -1;
      let settledFrames = -1;
      for (let i = 0; i < 30; i += 1) {
        await page.waitForTimeout(500);
        const current = (await readSceneStats(page)).frames;
        if (current === previous) {
          settledFrames = current;
          break;
        }
        previous = current;
      }
      expect(
        settledFrames,
        'Cảnh không bao giờ ngừng vẽ trong 15 giây dù con trỏ ở ngoài khung và không có ' +
          'gì thay đổi. §11.2 nói vòng lặp phải DỪNG khi không có thứ gì động — một vòng ' +
          'lặp quay vô ích là pin, là quạt, và là ngân sách 16.6ms bị tiêu vào việc vẽ lại ' +
          'đúng cái vừa vẽ.',
      ).toBeGreaterThanOrEqual(0);

      await page.waitForTimeout(STATIC_WINDOW_MS);
      const after = await readSceneStats(page);
      const drawn = after.frames - settledFrames;

      await attachJson(testInfo, 'games-static-frames.json', {
        windowMs: STATIC_WINDOW_MS,
        framesAtRest: settledFrames,
        framesAfter: after.frames,
        framesDrawnInWindow: drawn,
        tier: after.tier,
        objects: after.objects,
      });

      expect(
        drawn,
        `Cảnh vẽ ${drawn} khung hình trong ${STATIC_WINDOW_MS}ms đứng yên, với con trỏ ` +
          `NGOÀI khung và bậc chất lượng "${after.tier}". Render-theo-yêu-cầu (§11.2) chưa ` +
          `hoạt động, hoặc có thứ gì đó tự đánh dấu "cần vẽ lại" mỗi frame.`,
      ).toBe(0);
    });

    // ═══════════════════════════════════════════ 6. bậc chất lượng tự dò (§9.5)

    test('bậc chất lượng tự hạ xuống `low` dưới SwiftShader (§9.5)', async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);

      await openScreen(page, GAME_PATH, 'anon');
      await waitForSceneChannel(page);

      // Chuỗi mô tả GPU, đọc bằng CHÍNH cách `scene-quality.ts` đọc. Không có nó
      // thì một ô đỏ chỉ nói "bậc sai" mà không nói vì sao.
      const renderer = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (gl === null) {
          return null;
        }
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const unmasked = ext === null ? null : gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        return {
          unmasked: typeof unmasked === 'string' ? unmasked : null,
          plain: String(gl.getParameter(gl.RENDERER)),
          version: String(gl.getParameter(gl.VERSION)),
        };
      });

      const stats = await readSceneStats(page);
      await attachJson(testInfo, 'games-quality-tier.json', { tier: stats.tier, renderer, stats });

      expect(
        renderer,
        'Trình duyệt của lượt chạy này không cấp được WebGL nào. Cảnh 3D không thể mount, ' +
          'nên mọi ô hiệu năng ở trên đang đo một thứ khác với thứ người dùng thấy.',
      ).not.toBeNull();

      const software = /swiftshader|llvmpipe|softpipe|mesa offscreen|basic render|software/i.test(
        `${renderer?.unmasked ?? ''} ${renderer?.plain ?? ''}`,
      );

      /*
        §9.5 dự đoán `low` dưới SwiftShader. Ô này khẳng định thứ ĐO ĐƯỢC, và hai
        chiều đều là tin tức:
          - renderer là phần mềm mà bậc KHÔNG phải `low` ⇒ bộ dò hỏng, và e2e sẽ
            chạy bloom + bóng mềm trên CPU cho tới khi hết giờ;
          - renderer KHÔNG phải phần mềm ⇒ lượt chạy này có GPU thật, và bậc `high`
            là đúng — nhưng khi đó ô này không còn nói gì về SwiftShader nữa, nên
            nó phải nói ra điều đó thay vì im lặng xanh.
      */
      if (software) {
        expect(
          stats.tier,
          `GPU báo "${renderer?.unmasked ?? renderer?.plain}" (rasterize bằng phần mềm) mà ` +
            `bậc chất lượng đang là "${stats.tier}". §9.5 đòi hạ về "low": bóng mềm + bloom + ` +
            `env map trên CPU tốn hàng trăm ms mỗi khung hình và suite e2e sẽ hết giờ.`,
        ).toBe('low');
      } else {
        testInfo.annotations.push({
          type: 'ngoài-phạm-vi',
          description:
            `Lượt chạy này có GPU thật ("${renderer?.unmasked ?? renderer?.plain}"), nên nó ` +
            `KHÔNG kiểm được nhánh SwiftShader của §9.5. Bậc đo được: "${stats.tier}".`,
        });
        expect(['low', 'medium', 'high']).toContain(stats.tier);
      }
    });
  });

  // ═════════════════ 2 (tiếp). Màn hình bị gác — cần phiên đăng nhập thật

  test.describe('màn hình bị gác', () => {
    /*
      KHÔNG dùng jar rỗng ở đây, và đó là điểm mấu chốt của ô này: `/lessons` và
      `/dashboard` nằm trong `PROTECTED_PATHS`, nên một khách chưa đăng nhập bị
      đá về `/login` TRƯỚC khi Next kịp render. Quét bundle lúc đó là quét
      `/login` — và `/login` chắc chắn không có `three`, nên ô AC sẽ XANH mà chưa
      từng nhìn vào trang nó nêu tên.
    */
    for (const path of ['/lessons', '/dashboard']) {
      test(`\`three\` KHÔNG có trong JS của ${path} (§6)`, async ({ page }, testInfo) => {
        test.setTimeout(120_000);

        const scripts = traceScripts(page);
        await openScreen(page, path, 'user');
        await page.waitForTimeout(1_000);

        const landed = new URL(page.url()).pathname;
        expect(
          landed,
          `Muốn đo bundle của ${path} nhưng đã hạ cánh ở ${landed}. Nếu đó là /login thì ` +
            `phiên của lượt chạy không dùng được, và "không có three" bên dưới sẽ là một ` +
            `kết luận về trang đăng nhập chứ không về ${path}.`,
        ).not.toBe('/login');

        const urls = scripts.urls();
        scripts.stop();
        const { hits, scanned, bytes } = await findMarkers(page, urls, THREE_MARKERS);

        await attachJson(testInfo, `games-three-absent-${path.replace(/\W+/g, '-')}.json`, {
          requested: path,
          landed,
          scannedScripts: scanned,
          scannedBytes: bytes,
          hits,
          scripts: urls.map((u) => new URL(u).pathname),
        });

        expect(scanned, `Không thu được script nào trên ${path}`).toBeGreaterThan(0);
        expect(
          hits,
          `\`three\` có mặt trong bundle của ${landed}: ` +
            `${hits.map((h) => `${h.marker} @ ${h.url}`).join(', ')}.`,
        ).toEqual([]);
      });
    }
  });
});
