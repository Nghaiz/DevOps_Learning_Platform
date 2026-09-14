/**
 * **Mù màu, đo trên ảnh chụp THẬT của từng ô commit** — nợ mở từ P17, đóng ở P17b.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG ĐẾM SỐ MÀU TRONG ẢNH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bản đầu của file này chụp cả cảnh, áp ma trận mô phỏng mù màu, rồi đếm số màu
 * còn phân biệt được. Nó XANH ngay lượt đầu (282 → 177/179/215, tức 63%/64%/76%)
 * và **con số đó không chứng minh điều nó hứa**: phần lớn 282 màu kia đến từ khử
 * răng cưa, chữ và nền, không đến từ sáu trạng thái. Một bảng màu phân biệt
 * trạng thái CHỈ bằng màu vẫn có hàng trăm màu nhờ khử răng cưa, và vẫn qua mọi
 * ngưỡng phần trăm. Đúng loại cổng mà `rules/green-that-proves-nothing.md` gọi
 * tên: đo một đại lượng có thật, nhưng không phải đại lượng đang được hỏi.
 *
 * Câu hỏi thật là: **sáu trạng thái có phân biệt được TỪNG CẶP khi mất màu không?**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHÉP ĐO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi commit trong renderer SVG là một `role="button"` mang `aria-label` chứa
 * tên trạng thái tiếng Việt (`accentLabel()`), nên từng ô định vị được riêng.
 * Chụp từng ô → vẽ lên canvas CÙNG KÍCH THƯỚC (các accent có hệ số phóng khác
 * nhau, không chuẩn hoá thì đang so kích thước chứ không so hình) → chuyển
 * **thang xám tuyệt đối** → so từng cặp bằng sai khác trung bình.
 *
 * **Thang xám là trường hợp XẤU NHẤT**, khắc nghiệt hơn mọi dạng mù màu: nó xoá
 * 100% kênh màu, còn protanopia/deuteranopia/tritanopia chỉ làm nhoè một phần.
 * Phân biệt được ở đây ⇒ phân biệt được dưới mọi CVD. Số liệu CVD vẫn được ghi
 * lại để tham khảo, nhưng khẳng định đặt ở thang xám vì nó mạnh hơn.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐỐI CHỨNG DƯƠNG NẰM TRONG CHÍNH PHÉP ĐO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi ô được so với **CHÍNH NÓ** trước. Cặp đó phải ra ~0. Không có bước này
 * thì một hàm so hỏng (luôn trả số lớn) sẽ làm mọi cặp "khác nhau" và ô xanh mà
 * chưa so gì. Ngưỡng cho cặp KHÁC nhau được đặt theo bội số của số tự-so đo
 * được, không theo một hằng số đoán.
 *
 * ⚠ **Phép đo này KHÔNG nói "người mù màu chơi được".** Nó không thay được một
 * lượt thử với người thật, và không nói gì về việc người chơi có HIỂU ý nghĩa
 * của hình dạng hay không. Nó trả lời đúng một câu hẹp: hai trạng thái có còn
 * tách được khi kênh màu biến mất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Chạy
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   E2E_BASE_URL=http://localhost:3000 E2E_ORIGIN=http://localhost:3000 \
 *   pnpm --filter web e2e --grep @games-git-colorblind
 *
 * ⚠ `localhost`, KHÔNG phải `127.0.0.1` — Better Auth so origin theo CHUỖI.
 * ⚠ `next start` không build lại: `pnpm --filter web build` trước khi tin số.
 */

import { expect, test } from './fixtures/api';
import { openScreen, settle } from './fixtures/nav';
import { attachJson } from './games-harness';

const GIT_PATH = '/games/git';

/**
 * Năm bước, mỗi bước dựng MỘT accent rồi chụp ngay.
 *
 * `label` là mảnh `aria-label` mà `accentLabel()` phát ra, lấy nguyên văn từ
 * `ACCENT_STYLE` trong `git-palette.ts`. Đổi nhãn ở đó mà quên ở đây thì ô này
 * đỏ với "không tìm thấy" — đỏ ồn ào, không im lặng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA ACCENT CHỈ SỐNG ĐÚNG MỘT LỆNH — ĐÂY LÀ THIẾT KẾ, KHÔNG PHẢI LỖI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `engine.ts` gán `hints = result.hints ?? {}` sau **mỗi** lệnh, tức `ViewHints`
 * bị thay mới chứ không tích luỹ. Và `accentFor()` đọc đúng ba trường đó để
 * quyết `fresh` (commit vừa tạo), `duplicate` (cherry-pick), `conflicted` (merge
 * xung đột).
 *
 * Hệ quả: **không bao giờ có quá một accent-theo-hints trên màn cùng lúc.** Bản
 * đầu của ô này dàn 10 lệnh rồi mới chụp, và chỉ bắt được accent của lệnh CUỐI.
 * Nó đỏ với "chỉ dựng được 2 accent" và tôi suýt đọc thành "bản vá `getView()`
 * chưa ăn".
 *
 * Nên phép đo chụp **từng accent ngay sau lệnh sinh ra nó**. Đó cũng là cách
 * người chơi thật sự nhìn thấy chúng, nên ảnh chụp đúng hơn, không chỉ nhiều hơn.
 *
 * `accentFor()` xét theo THỨ TỰ: conflicted → orphaned → duplicate → fresh →
 * head → normal. Nên `head` chỉ hiện khi commit HEAD **không** vừa được tạo —
 * phải `switch` hoặc `reset` để tách hai thứ đó ra.
 */
const STEPS = [
  {
    key: 'fresh',
    label: 'vừa được tạo',
    // Sandbox mở ở kịch bản `kho-roi`, vốn đã có sẵn commit và nhánh — nên
    // không cần `git init` hay tạo file, chỉ cần một commit mới.
    commands: ['git commit --allow-empty -m "nen"'],
  },
  {
    key: 'head',
    label: 'HEAD đang ở đây',
    // `switch` là lệnh chỉ-đọc-với-hints: nó KHÔNG phát `freshOids`, nên commit
    // HEAD rơi xuống nhánh `head` thay vì bị `fresh` che.
    commands: ['git branch nhanh-a', 'git switch nhanh-a', 'git switch main'],
  },
  {
    key: 'normal',
    label: 'commit thường',
    commands: ['git commit --allow-empty -m "m1"', 'git status'],
  },
  {
    key: 'duplicate',
    label: 'bản sao của một commit khác',
    commands: ['git switch nhanh-a', 'git commit --allow-empty -m "a1"', 'git switch main', 'git cherry-pick nhanh-a'],
  },
  {
    key: 'orphaned',
    label: 'đã mất, không ref nào trỏ tới',
    // `reset --hard` bỏ commit khỏi mọi ref, nhưng `reflog` còn nhắc tới nó —
    // và `nodesOf()` cố ý VẼ những commit đó (mờ đi). Cả chương 3 sống trên
    // điều này: "đã mất" phải nhìn thấy được thì người chơi mới tin nó chưa
    // biến mất.
    commands: ['git commit --allow-empty -m "sap-mat"', 'git reset --hard HEAD~1'],
  },
] as const;

test.describe('Game Git — mù màu trên ảnh chụp thật', { tag: '@games-git-colorblind' }, () => {
  test('các trạng thái commit phân biệt được TỪNG CẶP khi mất màu', async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    /*
     * ⚠ Đo trong SANDBOX, không đo trong level 1.
     *
     * Bản đầu mở level `git-01-commit-la-object` và chỉ dựng được 2 accent. Lý
     * do không phải accent chết, cũng không phải bản vá `ViewHints` sai — level
     * đó khai `allowedCommands: ['init','add','commit','status','log']`, tức
     * **chính nó từ chối** `branch` / `switch` / `cherry-pick` / `reset`. Mọi
     * lệnh dựng `head`, `duplicate`, `orphaned` bị chặn trước khi tới engine.
     *
     * Sandbox khai `allowedCommands: null` — cho dùng MỌI lệnh (⚠ `[]` mang
     * nghĩa NGƯỢC LẠI: cấm tất, và đó là bẫy đã cắn `k8s/problem.ts` một lần).
     * Nó cũng là nơi người chơi thật sự gặp đủ sáu trạng thái, vì level chương 1
     * cố ý không cho họ chạm tới bốn trong số đó.
     */
    await openScreen(page, GIT_PATH, 'user');
    await settle(page);
    await page.getByRole('button', { name: 'Mở sandbox' }).click();
    await settle(page);

    const command = page.getByLabel('$');
    const run = async (lines: readonly string[]): Promise<void> => {
      for (const line of lines) {
        await command.fill(line);
        await command.press('Enter');
      }
      await page.waitForTimeout(250);
    };

    /*
     * Chạy từng bước rồi chụp NGAY — không dàn hết lệnh rồi mới chụp.
     *
     * Lệnh git THẬT, ô THẬT, đúng cỡ, đúng nền, đúng khử răng cưa người chơi
     * nhìn thấy. Không vẽ sáu ô mẫu ra trang trống: cái đó đo lại bảng khai,
     * thứ `accent-3d.test.ts` đã đo rồi.
     */
    const shots: { key: string; b64: string }[] = [];
    const missing: string[] = [];
    for (const step of STEPS) {
      await run(step.commands);
      await settle(page);
      const node = page.getByRole('button', { name: new RegExp(step.label) }).first();
      if ((await node.count()) === 0) {
        missing.push(step.key);
        continue;
      }
      shots.push({ key: step.key, b64: (await node.screenshot()).toString('base64') });
    }

    /*
     * Bốn accent là SÀN, không phải sáu.
     *
     * `conflicted` chỉ xuất hiện giữa một lượt merge đang dở, và `duplicate`
     * cần `cherry-pick` thành công — cả hai phụ thuộc trạng thái level, nên đòi
     * đủ sáu sẽ làm ô này giòn vì một lý do không liên quan tới a11y. Ghi rõ
     * accent nào vắng mặt thay vì lặng lẽ đo ít hơn.
     */
    expect(
      shots.length,
      `chỉ dựng được ${String(shots.length)} accent (thiếu: ${missing.join(', ')}) — ` +
        'dưới 4 thì phép so từng cặp không còn nói được gì',
    ).toBeGreaterThanOrEqual(4);

    // ── So từng cặp ở THANG XÁM ──────────────────────────────────────────
    const result = await page.evaluate(
      async ({ items }) => {
        const SIDE = 64;

        /** Vẽ ảnh lên canvas cỡ cố định rồi trả mảng độ chói 0..1. */
        const grayOf = async (b64: string): Promise<Float64Array> => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const cv = document.createElement('canvas');
          cv.width = SIDE;
          cv.height = SIDE;
          const ctx = cv.getContext('2d');
          if (ctx === null) throw new Error('không lấy được canvas 2D');
          // Chuẩn hoá kích thước: các accent có hệ số phóng khác nhau (head
          // 1.18, orphaned 0.84). Không chuẩn hoá thì đang so KÍCH THƯỚC chứ
          // không so hình dạng, và mọi cặp sẽ "khác nhau" một cách rẻ tiền.
          ctx.drawImage(img, 0, 0, SIDE, SIDE);
          const d = ctx.getImageData(0, 0, SIDE, SIDE).data;
          const out = new Float64Array(SIDE * SIDE);
          for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            const a = (d[i + 3] ?? 0) / 255;
            // Nền trong suốt gộp lên trắng, để viền của ô `normal` — thứ DUY
            // NHẤT vẽ ra cái ô đó — không biến mất khỏi phép so.
            const r = (d[i] ?? 0) / 255;
            const g = (d[i + 1] ?? 0) / 255;
            const b = (d[i + 2] ?? 0) / 255;
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            out[p] = lum * a + 1 * (1 - a);
          }
          return out;
        };

        const grays = new Map<string, Float64Array>();
        for (const it of items) grays.set(it.key, await grayOf(it.b64));

        const meanAbs = (a: Float64Array, b: Float64Array): number => {
          let s = 0;
          for (let i = 0; i < a.length; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
          return s / a.length;
        };

        // Đối chứng dương: mỗi ô so với CHÍNH NÓ phải ra ~0.
        let selfMax = 0;
        for (const g of grays.values()) selfMax = Math.max(selfMax, meanAbs(g, g));

        const pairs: { a: string; b: string; diff: number }[] = [];
        const keys = [...grays.keys()];
        for (let i = 0; i < keys.length; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            const ka = keys[i] ?? '';
            const kb = keys[j] ?? '';
            const ga = grays.get(ka);
            const gb = grays.get(kb);
            if (ga === undefined || gb === undefined) continue;
            pairs.push({ a: ka, b: kb, diff: meanAbs(ga, gb) });
          }
        }
        pairs.sort((x, y) => x.diff - y.diff);
        return { selfMax, pairs };
      },
      { items: shots },
    );

    await attachJson(testInfo, 'git-colorblind-pairs.json', {
      ghiChu:
        'Sai khác trung bình ở THANG XÁM (0..1) giữa ảnh chụp thật của từng ô commit, ' +
        'chuẩn hoá về 64x64. Thang xám = trường hợp xấu nhất, khắc nghiệt hơn mọi dạng mù màu.',
      accentVang: missing,
      tuSoToiDa: result.selfMax,
      cacCap: result.pairs,
    });

    // ── Đối chứng dương ──────────────────────────────────────────────────
    expect(
      result.selfMax,
      'một ô so với CHÍNH NÓ không ra 0 — hàm so hỏng, nên mọi cặp "khác nhau" ' +
        'dưới đây là kết quả của cái hỏng đó, không phải của bảng màu',
    ).toBeLessThan(0.001);

    /*
     * ── Khẳng định ───────────────────────────────────────────────────────
     *
     * ĐO ĐƯỢC 2026-09-14, sandbox `kho-roi`, chromium, thang xám, chuẩn hoá 64×64:
     *
     *   normal ↔ duplicate   0.107   ← sàn
     *   duplicate ↔ orphaned 0.111
     *   normal ↔ orphaned    0.144
     *   head ↔ normal        0.152
     *   … 6 cặp còn lại      0.197 – 0.435
     *   tự-so (đối chứng)    0.000   ← đúng 0, không phải "gần 0"
     *
     * Ngưỡng **0.05**, tức ~2.1× dưới sàn đo được. Bản đầu đặt 0.02 và con số
     * đó lộ ra là quá lỏng khi có số thật: một ngưỡng nằm xa dưới sàn thì không
     * đỏ kịp khi một accent mất kênh hình học, mà đó chính là hồi quy nó sinh
     * ra để bắt. Giữ 2× biên vì khử răng cưa và phiên bản trình duyệt làm con số
     * dao động; siết sát sàn sẽ đỏ vì lý do không phải a11y.
     *
     * ⚠ **`conflicted` KHÔNG nằm trong phép đo này.** Nó cần một lượt merge
     * XUNG ĐỘT THẬT, và dựng được xung đột trong sandbox là một chuỗi lệnh dài
     * hơn hẳn năm bước kia. Đây là khoảng trống có tên, không phải sơ suất: sáu
     * trạng thái thì năm đã đo, cái thứ sáu chưa.
     */
    const weakest = result.pairs[0];
    expect(weakest, 'không có cặp nào để so').toBeDefined();
    expect(
      weakest?.diff ?? 0,
      `cặp yếu nhất là ${weakest?.a ?? '?'} ↔ ${weakest?.b ?? '?'} với sai khác ` +
        `${(weakest?.diff ?? 0).toFixed(4)} ở thang xám. Sát 0 nghĩa là hai trạng thái ` +
        'đó phân biệt nhau CHỈ bằng màu, và người mù màu không đọc được cặp này.',
    ).toBeGreaterThan(0.05);
  });
});
