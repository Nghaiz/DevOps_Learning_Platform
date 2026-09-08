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
} from './games-harness';

const CATALOG_PATH = '/games';
const GAME_PATH = '/games/k8s';

/** §11.3 — trần draw call ở quy mô 200 pod. Vượt nghĩa là chưa instancing. */
const MAX_DRAW_CALLS = 25;
/** §11.3 — quy mô phải đạt được TRƯỚC khi trần draw call nói lên điều gì. */
const POD_SCALE_TARGET = 200;
/** §11.3 — số lần sinh/xoá pod để bắt rò rỉ geometry/texture. */
const SPAWN_CYCLE_TARGET = 500;
/** Cửa sổ đo "cảnh tĩnh" của §11.3. */
const STATIC_WINDOW_MS = 3_000;

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
        [...document.querySelectorAll('select')].some(
          (el) => (el.labels?.[0]?.textContent ?? '').trim() === 'Level',
        ),
      );
      await attachJson(testInfo, 'games-keyboard-preconditions.json', {
        engineWired: wired,
        levelSelectPresent: hasLevelSelect,
      });

      expect(wired && hasLevelSelect, ENGINE_NOT_WIRED).toBe(true);

      // Level 1 là mục đầu của `<select>`; xác nhận thay vì tin.
      const selected = await page.evaluate(() => {
        const el = [...document.querySelectorAll('select')].find(
          (s) => (s.labels?.[0]?.textContent ?? '').trim() === 'Level',
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
      await expect(page.getByText('Hoàn thành level')).toBeVisible({ timeout: 90_000 });

      const focusPath = await readFocus(page);
      await attachJson(testInfo, 'games-keyboard-run.json', {
        manifest,
        finalFocus: focusPath === null ? null : describeFocus(focusPath),
      });
    });

    // ══════════════════════════════════════════ 5. cổng hiệu năng §11.3

    test(`≤ ${MAX_DRAW_CALLS} draw call với ~${POD_SCALE_TARGET} pod (§11.3)`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(240_000);

      await openScreen(page, GAME_PATH, 'anon');
      await waitForSceneChannel(page);

      expect(await engineIsWired(page), ENGINE_NOT_WIRED).toBe(true);

      // Đưa cluster lên quy mô §11.3 qua đường bàn phím: chọn một workload đổi
      // được replica rồi đặt lại số bản.
      const scalable = await page.evaluate(() =>
        [...document.querySelectorAll('button[data-resource]')]
          .map((el) => el.textContent ?? '')
          .find((text) => /deployment\/|statefulset\/|replicaset\//i.test(text)),
      );
      expect(
        scalable,
        `Cluster hiện tại không có workload nào đổi được replica, nên không dựng được ` +
          `${POD_SCALE_TARGET} pod. Trần draw call chỉ nói lên điều gì Ở QUY MÔ ĐÓ — đo nó ` +
          `trên một cluster nhỏ sẽ XANH và không chứng minh gì.`,
      ).toBeDefined();

      const target = await tabUntil(
        page,
        `tài nguyên ${scalable ?? ''}`,
        (info) => info.tag === 'button' && info.text.includes((scalable ?? '').trim()),
      );
      await activate(page);
      void target;

      await tabUntil(
        page,
        'ô Số replica',
        (info) => info.tag === 'input' && info.label.includes('Số replica'),
      );
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(String(POD_SCALE_TARGET));
      await tabUntil(page, 'nút Đặt lại replica', isButtonNamed('Đặt lại replica'));
      await activate(page);

      await expect
        .poll(async () => (await readSceneStats(page)).objects, { timeout: 120_000 })
        .toBeGreaterThanOrEqual(POD_SCALE_TARGET);

      // Ép một lượt vẽ mới rồi đọc: `renderer.info.render.calls` là số của KHUNG
      // HÌNH GẦN NHẤT, nên đọc lúc cảnh đang ngủ sẽ ra số của một cảnh cũ.
      await page.mouse.move(4, 4);
      await page.waitForTimeout(500);
      const stats = await readSceneStats(page);
      await movePointerAwayFromCanvas(page);

      await attachJson(testInfo, 'games-drawcalls.json', { target: POD_SCALE_TARGET, stats });

      expect(
        stats.calls,
        `${stats.objects} object trên cảnh mà tốn ${stats.calls} draw call (trần ${MAX_DRAW_CALLS}). ` +
          `§11.1 mục 1: mỗi mesh riêng là một lệnh vẽ, nên vượt trần gần như luôn nghĩa là ` +
          `chưa dùng \`InstancedMesh\` — khoản lời lớn nhất trong cả danh sách hiệu năng.`,
      ).toBeLessThanOrEqual(MAX_DRAW_CALLS);
    });

    test(`geometries/textures không tăng qua ${SPAWN_CYCLE_TARGET} lần sinh/xoá (§11.3)`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(300_000);

      await openScreen(page, GAME_PATH, 'anon');
      await waitForSceneChannel(page);
      expect(await engineIsWired(page), ENGINE_NOT_WIRED).toBe(true);

      const scalable = await page.evaluate(() =>
        [...document.querySelectorAll('button[data-resource]')]
          .map((el) => el.textContent ?? '')
          .find((text) => /deployment\/|statefulset\/|replicaset\//i.test(text)),
      );
      expect(
        scalable,
        'Không có workload nào đổi được replica, nên không tạo được chu kỳ sinh/xoá pod. ' +
          'Ô này đo RÒ RỈ, và không có gì sinh ra thì không có gì rò.',
      ).toBeDefined();

      await tabUntil(
        page,
        `tài nguyên ${scalable ?? ''}`,
        (info) => info.tag === 'button' && info.text.includes((scalable ?? '').trim()),
      );
      await activate(page);

      const perCycle = 50;
      const rounds = Math.ceil(SPAWN_CYCLE_TARGET / perCycle);
      const samples: { round: number; geometries: number; textures: number; objects: number }[] = [];

      for (let round = 0; round < rounds; round += 1) {
        for (const replicas of [perCycle, 0]) {
          await tabUntil(
            page,
            'ô Số replica',
            (info) => info.tag === 'input' && info.label.includes('Số replica'),
          );
          await page.keyboard.press('ControlOrMeta+a');
          await page.keyboard.type(String(replicas));
          await tabUntil(page, 'nút Đặt lại replica', isButtonNamed('Đặt lại replica'));
          await activate(page);
          await page.waitForTimeout(1_200);
        }
        const stats = await readSceneStats(page);
        samples.push({
          round,
          geometries: stats.geometries,
          textures: stats.textures,
          objects: stats.objects,
        });
      }

      await attachJson(testInfo, 'games-leak-cycles.json', {
        spawnsAttempted: rounds * perCycle,
        perCycle,
        samples,
      });

      const first = samples[0];
      const last = samples[samples.length - 1];
      expect(first, 'Không lấy được mẫu nào').toBeDefined();
      expect(last, 'Không lấy được mẫu nào').toBeDefined();

      expect(
        last?.geometries,
        `geometries đi từ ${first?.geometries} lên ${last?.geometries} sau ${rounds * perCycle} ` +
          `lần sinh pod. Đây là rò rỉ geometry — nguyên nhân của kiểu giật xuất hiện sau vài ` +
          `phút chơi chứ không phải ngay từ đầu, và là kiểu khó truy nhất nếu không có ô này.`,
      ).toBeLessThanOrEqual(first?.geometries ?? 0);

      expect(
        last?.textures,
        `textures đi từ ${first?.textures} lên ${last?.textures} sau ${rounds * perCycle} lần sinh pod.`,
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
