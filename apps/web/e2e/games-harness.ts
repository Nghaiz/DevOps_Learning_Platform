/**
 * Dụng cụ đo của trụ cột ③ Games (P14, lane F).
 *
 * Không có test nào ở đây — chỉ những thứ `games.spec.ts` dùng để BIẾN một lời
 * khẳng định thành một con số. Tách ra vì mỗi món đều có một cái bẫy riêng, và
 * cái bẫy đó phải được ghi cạnh mã chứ không nằm trong đầu người viết.
 *
 * ⚠ `scanAxe` dưới đây LẶP LẠI logic của `a11y.spec.ts`. Đó là một trùng lặp CÓ
 * Ý THỨC, không phải sơ suất: `a11y.spec.ts` thuộc đường sở hữu của lane 13.H và
 * không export gì, còn `games.spec.ts` phải quét đúng cùng một ngưỡng
 * (serious/critical + ba luật landmark) để hai bảng kết quả so được với nhau.
 * Cách sửa đúng là 13.H export helper của nó; cho tới lúc đó, hai bản này phải
 * đổi cùng nhau — nên ngưỡng được chép NGUYÊN VĂN, không "cải tiến".
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Request, type Response, type TestInfo } from '@playwright/test';
import type { Result } from 'axe-core';
import { E2E_BASE_URL } from './env';

// ═════════════════════════════════════════════════════════════ tiện ích chung

export async function attachJson(
  testInfo: TestInfo,
  name: string,
  payload: unknown,
): Promise<void> {
  await testInfo.attach(name, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(payload, null, 2)),
  });
}

// ═══════════════════════════════════════════════════════ máy thu lời gọi mạng

export interface CapturedRequest {
  /** Nhãn giai đoạn do test đặt ('tải trang', 'đang chơi', …). */
  readonly phase: string;
  readonly method: string;
  readonly url: string;
  readonly pathname: string;
  readonly resourceType: string;
  readonly sameOrigin: boolean;
}

export interface RequestTrace {
  /** Đổi nhãn giai đoạn cho mọi request thu được từ đây trở đi. */
  phase(label: string): void;
  all(): readonly CapturedRequest[];
  /** Request tới `/api/**` trên CHÍNH origin của app — thứ ô AC cấm. */
  apiCalls(): readonly CapturedRequest[];
  /** Request ra host khác. Không phải thứ ô AC cấm, nhưng đáng nhìn. */
  crossOrigin(): readonly CapturedRequest[];
  stop(): void;
}

/**
 * Ghi lại **MỌI** request rồi lọc sau — không rình vài URL đã đoán trước.
 *
 * Đây là toàn bộ lý do hàm này tồn tại thay vì một `page.waitForRequest('**\/api/**')`
 * lật ngược: một máy thu chỉ nghe những đường mình đã nghĩ ra sẽ báo "sạch" cho
 * đúng lời gọi mà không ai nghĩ tới — tức là báo sạch chính xác ở tình huống nó
 * được dựng ra để bắt. Thu tất, lọc sau, và đính kèm cả danh sách thô vào report
 * để người đọc tự kiểm được phép lọc.
 */
export function traceRequests(page: Page): RequestTrace {
  const origin = new URL(E2E_BASE_URL).origin;
  const captured: CapturedRequest[] = [];
  let current = 'tải trang';

  const onRequest = (request: Request): void => {
    let parsed: URL;
    try {
      parsed = new URL(request.url());
    } catch {
      // `data:` / `blob:` — không phải lời gọi mạng, bỏ qua nhưng KHÔNG im lặng
      // hoàn toàn: ghi lại với pathname rỗng để nó vẫn hiện trong artifact.
      captured.push({
        phase: current,
        method: request.method(),
        url: request.url().slice(0, 120),
        pathname: '',
        resourceType: request.resourceType(),
        sameOrigin: false,
      });
      return;
    }
    captured.push({
      phase: current,
      method: request.method(),
      url: request.url(),
      pathname: parsed.pathname,
      resourceType: request.resourceType(),
      sameOrigin: parsed.origin === origin,
    });
  };

  page.on('request', onRequest);

  return {
    phase(label) {
      current = label;
    },
    all: () => captured,
    apiCalls: () => captured.filter((r) => r.sameOrigin && r.pathname.startsWith('/api/')),
    crossOrigin: () => captured.filter((r) => !r.sameOrigin && r.pathname !== ''),
    stop() {
      page.off('request', onRequest);
    },
  };
}

// ══════════════════════════════════════════════════════ máy thu script đã tải

/**
 * URL của mọi script trình duyệt THẬT SỰ tải cho trang này.
 *
 * Vì sao không grep thẳng `.next/static/chunks` như §6 gợi ý: một thư mục chunk
 * chứa chunk của MỌI route. `grep -r three .next/static/chunks` luôn có hit (route
 * game nằm trong đó), nên phép đo duy nhất trả lời được câu hỏi "route NÀY có
 * kéo `three` về không" là hỏi chính trình duyệt xem nó đã tải những gì.
 */
export interface ScriptTrace {
  urls(): readonly string[];
  stop(): void;
}

export function traceScripts(page: Page): ScriptTrace {
  const urls = new Set<string>();

  const onResponse = (response: Response): void => {
    const request = response.request();
    if (request.resourceType() !== 'script') {
      return;
    }
    const url = response.url();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      urls.add(url);
    }
  };

  page.on('response', onResponse);

  return {
    urls: () => [...urls],
    stop() {
      page.off('response', onResponse);
    },
  };
}

/**
 * Dấu vết của `three` trong một bundle đã minify.
 *
 * Cả ba đều là thứ minifier KHÔNG đổi được: hai chuỗi ký tự trong thông điệp lỗi
 * của chính `three`, và một tên biến TOÀN CỤC (đổi tên biến toàn cục sẽ phá ngữ
 * nghĩa, nên terser giữ nguyên). Tên class như `WebGLRenderer` thì KHÔNG dùng
 * được — nó bị mangle thành một chữ cái.
 *
 * ⚠ Danh sách này chỉ đáng tin vì `games.spec.ts` có nửa DƯƠNG: nó khẳng định
 * `/games/k8s` PHẢI khớp ít nhất một dấu. Không có nửa đó, một dấu gõ sai sẽ báo
 * "sạch" trên mọi trang, mãi mãi.
 */
export const THREE_MARKERS: readonly string[] = [
  'THREE.WebGLRenderer:',
  'THREE.WebGLProgram:',
  '__THREE_DEVTOOLS__',
];

export interface MarkerHit {
  readonly url: string;
  readonly marker: string;
}

/**
 * Tải từng script rồi tìm dấu. Ném khi KHÔNG tải được — một script không đọc
 * được mà bị bỏ qua trong im lặng là một chỗ `three` trốn được.
 */
export async function findMarkers(
  page: Page,
  urls: readonly string[],
  markers: readonly string[],
): Promise<{ hits: MarkerHit[]; scanned: number; bytes: number }> {
  const hits: MarkerHit[] = [];
  let bytes = 0;

  for (const url of urls) {
    const response = await page.request.get(url);
    if (!response.ok()) {
      throw new Error(
        `Không tải lại được script ${url} (HTTP ${response.status()}). Bỏ qua nó sẽ ` +
          `để lại một chỗ \`three\` có thể nấp mà phép đo không thấy.`,
      );
    }
    const body = await response.text();
    bytes += body.length;
    for (const marker of markers) {
      if (body.includes(marker)) {
        hits.push({ url, marker });
        break;
      }
    }
  }

  return { hits, scanned: urls.length, bytes };
}

// ════════════════════════════════════════════════ cửa sổ đọc số liệu của scene

/**
 * Hình dạng `globalThis.__dlpK8sScene()` trả về (lane E cài, gỡ khi unmount).
 *
 * KHAI LẠI ở đây thay vì `import type` từ `components/games/k8s-scene-lazy.tsx`:
 * file đó `import 'three'` và nằm ngoài `include` của `e2e/tsconfig.json`. Cái
 * giá là hai bản khai có thể lệch nhau — nên `readSceneStats` KIỂM hình dạng lúc
 * chạy và ném khi lệch, thay vì ép kiểu rồi đọc ra `undefined` và so `undefined
 * <= 25` (luôn false, nhưng với thông báo vô nghĩa).
 */
export interface SceneStats {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly frames: number;
  readonly tier: string;
  readonly objects: number;
}

const STAT_KEYS = ['calls', 'triangles', 'geometries', 'textures', 'frames', 'objects'] as const;

/** Chờ scene mount xong. Ném khi hết giờ — "chưa mount" không được đọc thành "sạch". */
export async function waitForSceneChannel(page: Page, timeoutMs = 30_000): Promise<void> {
  await page
    .waitForFunction(
      () => typeof (globalThis as { __dlpK8sScene?: unknown }).__dlpK8sScene === 'function',
      undefined,
      { timeout: timeoutMs },
    )
    .catch(() => {
      throw new Error(
        `Sau ${timeoutMs}ms vẫn không có \`globalThis.__dlpK8sScene\`. Cảnh 3D chưa ` +
          `mount (chunk \`three\` chưa tải, WebGL không dựng được, hoặc công tắc "Tắt ` +
          `hiệu ứng 3D" đang bật). Mọi cổng hiệu năng dưới đây KHÔNG đo được — và đó ` +
          `là "không đo được", không phải "đạt".`,
      );
    });
}

export async function readSceneStats(page: Page): Promise<SceneStats> {
  const raw = await page.evaluate(() => {
    const read = (globalThis as { __dlpK8sScene?: () => unknown }).__dlpK8sScene;
    return typeof read === 'function' ? read() : null;
  });

  if (raw === null || typeof raw !== 'object') {
    throw new Error(
      '`__dlpK8sScene()` không trả về object. Cửa sổ đo của lane E đã bị gỡ hoặc đổi ' +
        'hợp đồng — dừng ở đây thay vì đọc `undefined` rồi so sánh số học với nó.',
    );
  }

  const record = raw as Record<string, unknown>;
  for (const key of STAT_KEYS) {
    if (typeof record[key] !== 'number' || !Number.isFinite(record[key])) {
      throw new Error(
        `\`__dlpK8sScene().${key}\` không phải số hữu hạn (nhận: ${String(record[key])}). ` +
          `Hợp đồng cửa sổ đo đã lệch giữa lane E và lane F.`,
      );
    }
  }
  if (typeof record['tier'] !== 'string' || record['tier'] === '') {
    throw new Error('`__dlpK8sScene().tier` không phải chuỗi bậc chất lượng.');
  }

  return raw as SceneStats;
}

/**
 * Đưa con trỏ ra khỏi khung 3D.
 *
 * TIỀN ĐỀ BẮT BUỘC của cổng "0 frame khi cảnh tĩnh" (lane E, §11.2): hiệu ứng
 * bồng bềnh CHỈ chạy khi con trỏ nằm trong khung. Quên bước này thì cổng đó
 * chập chờn, và một cổng chập chờn sẽ bị ai đó xoá đi — mất luôn thứ duy nhất
 * chứng minh render-theo-yêu-cầu hoạt động thật.
 *
 * `(0, 0)` là góc trên-trái khung nhìn, nơi đang là header của trang chứ không
 * phải canvas — nên nó vừa phát `pointerleave` cho canvas (nếu con trỏ từng ở
 * trong) vừa không phát `pointerenter` cho bất kỳ lượt nào sau.
 */
export async function movePointerAwayFromCanvas(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

// ═══════════════════════════════════════════════════════════ đường đi bàn phím

export interface FocusInfo {
  readonly tag: string;
  readonly type: string;
  readonly id: string;
  readonly disabled: boolean;
  readonly text: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly placeholder: string;
  readonly value: string;
}

export async function readFocus(page: Page): Promise<FocusInfo | null> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) {
      return null;
    }
    const form = el as HTMLInputElement;
    const labelText = form.labels?.[0]?.textContent ?? '';
    return {
      tag: el.tagName.toLowerCase(),
      type: typeof form.type === 'string' ? form.type : '',
      id: el.id,
      disabled: form.disabled === true,
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
      label: labelText.trim().replace(/\s+/g, ' '),
      ariaLabel: el.getAttribute('aria-label') ?? '',
      placeholder: el.getAttribute('placeholder') ?? '',
      value: typeof form.value === 'string' ? form.value.slice(0, 120) : '',
    };
  });
}

export function describeFocus(info: FocusInfo): string {
  const name = info.label || info.ariaLabel || info.text || info.placeholder || info.id || '(vô danh)';
  return `${info.tag}${info.type === '' ? '' : `[${info.type}]`} "${name}"${info.disabled ? ' (disabled)' : ''}`;
}

/**
 * Bấm Tab cho tới khi focus rơi vào thứ ta cần. **Chỉ bàn phím** — không
 * `.click()`, không `.focus()`.
 *
 * `focus()` lập trình sẽ chứng minh sai thứ: một nút `tabIndex={-1}` vẫn nhận
 * được `focus()` rồi Enter, nên một test dùng `focus()` sẽ báo "chơi được bằng
 * bàn phím" cho một giao diện mà người không dùng chuột không bao giờ với tới.
 */
export async function tabUntil(
  page: Page,
  what: string,
  match: (info: FocusInfo) => boolean,
  maxTabs = 80,
): Promise<{ info: FocusInfo; path: FocusInfo[] }> {
  const path: FocusInfo[] = [];
  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press('Tab');
    const info = await readFocus(page);
    if (info === null) {
      // Vòng qua thanh địa chỉ của trình duyệt rồi quay lại — không phải lỗi.
      continue;
    }
    path.push(info);
    if (match(info)) {
      return { info, path };
    }
  }
  throw new Error(
    `Không Tab tới được ${what} sau ${maxTabs} lần Tab. Nếu điều khiển đó có tồn tại ` +
      `mà không nằm trong đường Tab thì người không dùng chuột không chơi được — đó là ` +
      `một lỗi sản phẩm, không phải một test cần nới.\n` +
      `Đã đi qua: ${path.map(describeFocus).join(' → ')}`,
  );
}

// ════════════════════════════════════════════════════════════════════════ axe

/** Chép nguyên văn từ `a11y.spec.ts` — xem khối chú thích đầu file. */
const MUST_NOT_FIRE = ['landmark-unique', 'landmark-no-duplicate-main', 'landmark-one-main'];

export async function scanAxe(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();

  expect(
    results.passes.length,
    `axe chạy trên ${label} nhưng không luật nào PASS. Gần như chắc chắn nó quét một ` +
      `document rỗng, và "0 vi phạm" khi đó không chứng minh gì.`,
  ).toBeGreaterThan(0);

  const blocking = results.violations.filter(
    (v: Result) => v.impact === 'serious' || v.impact === 'critical' || MUST_NOT_FIRE.includes(v.id),
  );

  await attachJson(testInfo, `axe-${label.replace(/[^a-z0-9]+/gi, '-')}.json`, {
    url: page.url(),
    passes: results.passes.length,
    incomplete: results.incomplete.map((v: Result) => v.id),
    violations: results.violations.map((v: Result) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
    })),
  });

  const detail = blocking
    .map(
      (v: Result) =>
        `  • [${v.impact ?? 'n/a'}] ${v.id} — ${v.help}\n    ${v.helpUrl}\n` +
        v.nodes
          .slice(0, 4)
          .map((n) => `      ${n.target.join(' ')}`)
          .join('\n'),
    )
    .join('\n');

  expect(
    blocking.map((v: Result) => `${v.impact}:${v.id}`),
    `axe tìm thấy ${blocking.length} lỗi CHẶN trên ${label} (${results.passes.length} luật pass):\n${detail}`,
  ).toEqual([]);
}
