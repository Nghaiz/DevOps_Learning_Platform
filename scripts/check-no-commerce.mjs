#!/usr/bin/env node
/**
 * Cổng gác lệnh cấm thương mại — nền tảng này KHÔNG bán khoá học.
 *
 * Không màn hình, route, chuỗi, cột DB, hay procedure nào về giá / gói cước /
 * thanh toán / nâng cấp / paywall. Đây là ràng buộc nặng nhất của dự án, nêu
 * hai lần bởi chủ dự án. Ô nghiệm thu cuối 13.H.
 *
 * VÌ SAO LÀ MỘT SCRIPT, KHÔNG PHẢI MỘT DÒNG `grep` DÁN TRONG PLAN
 * ---------------------------------------------------------------
 * Bản cũ là một chuỗi `grep -rniE ... | grep -v ... | grep -v ... | grep -v ...`
 * nằm trong `plans/devops-learning-platform/phase-13-exec.md` §5. Hai hệ quả
 * đo được ngày 2026-09-06:
 *
 *   1. KHÔNG job CI nào chạy nó (grep toàn bộ `.github/workflows/`: 0 kết quả).
 *      Cổng chỉ chạy khi có người nhớ chạy — tức là không chạy.
 *   2. Mẫu bắt lọt. Bơm 9 dòng paywall giả qua đúng chuỗi lệnh đó thì 4 LỌT:
 *        "Nâng cấp để mở khoá — 199.000đ/tháng"
 *        "Học phí trọn gói 1.500.000đ"
 *        "Mua khoá học"
 *        "Bản Pro — 99k/tháng"
 *      Lỗ nằm ở MẪU BẮT (chỉ có từ tiếng Anh + ba cụm tiếng Việt), không ở bộ
 *      lọc trừ — ba bộ lọc kia không nuốt dương tính thật nào.
 *
 * VÌ SAO NODE CHỨ KHÔNG PHẢI `.sh`
 * --------------------------------
 *   - Repo có tiền sử script `.sh` CRLF chết từng dòng (`$'\r': command not
 *     found`) — xem `.gitattributes`. Node đọc CRLF không sao.
 *   - `grep -E` của GNU (CI Linux) khác BSD; `\d`, `\b`, non-greedy đều không
 *     di động. Regex của JS thì giống hệt nhau ở mọi nền.
 *   - Đối chứng dương chạy trên fixture TRONG BỘ NHỚ, không ghi file rác.
 *   - Chuẩn hoá NFC được: tiếng Việt tổ hợp (NFD) và dựng sẵn (NFC) trông
 *     giống nhau trên màn hình nhưng khác byte, nên một phép so thô bỏ lọt.
 *
 * ĐỐI CHỨNG DƯƠNG NẰM TRONG CHÍNH SCRIPT
 * --------------------------------------
 * Mỗi lần chạy, script tự kiểm nó BẮT được tập mẫu vi phạm đã biết và KHÔNG
 * kêu trên tập mẫu sạch đã biết — TRƯỚC khi quét cây. Tự kiểm hỏng thì thoát 2
 * và không quét gì cả. Một cổng không tự chứng minh được là nó biết kêu thì
 * chỉ là trang trí (`green-that-proves-nothing`).
 *
 * KHÔNG CÓ LỐI THOÁT INLINE (kiểu `// commerce-gate: allow`). Cố ý: allow-list
 * là thứ phải có cơ chế chống ôi, và ở đây nó không đáng giá. Cổng kêu thì
 * hoặc là vi phạm thật, hoặc là mẫu sai và phải sửa mẫu ngay tại đây.
 *
 * Dùng:
 *   node scripts/check-no-commerce.mjs              # tự kiểm rồi quét cây
 *   node scripts/check-no-commerce.mjs --self-test  # chỉ tự kiểm
 *
 * Mã thoát: 0 sạch · 1 có vi phạm · 2 tự kiểm hỏng / sai cấu hình.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');

// ─────────────────────────────────────────────────────────────── vùng quét
//
// `content/` NẰM TRONG vùng quét: `scripts/vendor-scenarios.mjs` kéo scenario
// từ upstream về, và một scenario upstream quảng cáo bản trả phí là đúng thứ
// cổng này phải bắt.
const ROOTS = [
  'apps/web/src',
  'apps/web/e2e',
  'apps/web/drizzle',
  'packages/ui/src',
  'packages/scenario/src',
  'packages/shared-types/src',
  'packages/terminal/src',
  'content',
];

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.turbo', '.artifacts',
  'dist', 'build', 'coverage', 'gen', 'test-results',
  'playwright-report', '__snapshots__',
]);

// Nhị phân: bỏ theo đuôi cho nhanh, rồi vẫn đánh hơi byte NUL cho chắc.
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.wasm',
  '.zip', '.gz', '.tar', '.br', '.mp4', '.webm', '.mp3', '.zst',
]);

const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

// ─────────────────────────────────────────────────────────────── luật
//
// scope 'all'  — áp cho MỌI vùng, kể cả `content/`.
// scope 'code' — KHÔNG áp cho `content/`.
//
//   Vì sao phải tách: `content/` dạy DevOps nên văn xuôi bài học nói "nâng cấp
//   cluster", "nâng cấp gói phần mềm bằng apt" một cách hoàn toàn hợp lệ. Ép
//   hai cụm đó thành cấm ở mọi nơi là mua một trận báo động giả, và một cổng
//   kêu oan thì bị tắt trong hai tuần. Ở MÃ NGUỒN thì ngược lại: "nâng cấp" đi
//   kèm "gói"/"Pro" chính là hình dạng CTA paywall đã lọt.
//
// KHÔNG dùng biên từ `\b` bao quanh: `_` cũng là ký tự từ nên `\bprice\b`
// trượt `MONTHLY_PRICE_VND` — đúng cái bẫy bản grep cũ đã tránh.
const RULES = [
  {
    id: 'en-thương-mại',
    scope: 'all',
    why: 'từ khoá thương mại tiếng Anh',
    src: String.raw`price|pricing|paywall|checkout|billing|invoice|stripe|paddle|sepay|entitlement|sku|subscription|is_?paid|premium|freemium|payment|purchase|refund|coupon|discount|momo|vnpay|zalopay|paypal|mastercard|shopping[ _-]?cart|add[ _-]?to[ _-]?cart`,
  },
  {
    id: 'vi-thương-mại',
    scope: 'all',
    why: 'cụm thương mại tiếng Việt (rõ nghĩa, không phụ thuộc ngữ cảnh)',
    // HAI LỚP CHẶN DƯƠNG TÍNH GIẢ, cả hai đều do đối chứng ép ra:
    //
    //   `(?!\p{L})` sau `phí`  — "phí" là TIỀN TỐ của "phía". Không có nó thì
    //   "Phần nội dung bài học phía trên" (dòng thật ở narrow-screen-notice.tsx)
    //   bị kêu oan vì chứa chuỗi con "học phí".
    //
    //   `(?!\s*trị)` sau `giá` — "giá trị" (value) là từ thường gặp nhất trong
    //   mã. "bảng giá trị mặc định", "giảm giá trị timeout" đều hợp lệ.
    //
    // Đây là chỗ đắt nhất của cổng: tiếng Việt viết rời âm tiết nên gần như mọi
    // cụm thương mại đều là tiền tố của một cụm vô hại. Thêm cụm mới thì phải
    // thêm luôn một dòng vào CLEAN chứng minh cụm vô hại gần nhất không bị kêu.
    src: String.raw`học\s*phí(?!\p{L})|gói\s*cước|thanh\s*toán(?!\p{L})|trả\s*phí(?!\p{L})|thu\s*phí(?!\p{L})|tính\s*phí(?!\p{L})|phí\s*dịch\s*vụ|mua\s*kho[áa]\s*học|mua\s*gói(?!\p{L})|bảng\s*giá(?!\s*trị)|giá\s*bán|giá\s*tiền|mức\s*giá(?!\s*trị)|đơn\s*giá(?!\s*trị)|khuyến\s*mãi|giảm\s*giá(?!\s*trị)|h[oó]á\s*đơn(?!\s*giản)|chuyển\s*khoản|ví\s*điện\s*tử|thẻ\s*tín\s*dụng|trọn\s*gói(?!\p{L})|đăng\s*ký\s*gói(?!\p{L})|gia\s*hạn\s*gói(?!\p{L})|giỏ\s*hàng`,
    // `nâng cấp gói` CỐ Ý không nằm ở đây mà ở `vi-cta-paywall` (scope 'code').
    // Đối chứng dương bắt được lý do: "nâng cấp gói phần mềm bằng apt-get" là
    // câu hợp lệ trong bài học Linux. Ở mã nguồn nó vẫn bị cấm, và "nâng cấp
    // gói cước" thì bị `gói cước` bắt ở mọi vùng — không mất gì.
  },
  {
    id: 'tiền-tệ',
    scope: 'all',
    why: 'con số kèm đơn vị tiền — dấu hiệu mạnh, ĐỘC LẬP với từ khoá',
    // Bốn hình dạng, mỗi cái tự đứng được:
    //   1.500.000đ · 199.000 ₫      (nhóm nghìn + ký hiệu)
    //   50000 VND · 12345₫          (số + mã tiền)
    //   99k/tháng · 199.000đ/tháng  (giá theo kỳ)
    //   $9.99 · 49.00 USD           (ngoại tệ)
    //
    // `(?!\p{L})` chứ không phải `\b`: sau `đ` (không phải ký tự từ ASCII) thì
    // `\b` KHÔNG khớp trước dấu `/`, nên `199.000đ/tháng` sẽ tuột.
    // Bản `\d+\s*đ` trần bị loại: nó khớp "1 đơn vị" — `đ` rồi `ơ`.
    // `$` ngoại tệ BẮT BUỘC có phần xu: `content/**/*.sh` đầy `$1`, `$2`.
    src:
      String.raw`\d{1,3}(?:\.\d{3})+\s*(?:đ|₫)(?!\p{L})` +
      String.raw`|\d+\s*(?:vnđ|vnd|₫)(?!\p{L})` +
      String.raw`|\d{4,}\s*đ(?!\p{L})` +
      String.raw`|\d+(?:[.,]\d{3})*\s*(?:đ|₫|k|vnđ|vnd)\s*\/\s*(?:tháng|năm|thang|nam|month|mo|year|yr)(?!\p{L})` +
      String.raw`|\$\s?\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)` +
      String.raw`|\d+(?:[.,]\d+)?\s*(?:usd|eur)(?!\p{L})`,
  },
  {
    id: 'vi-cta-paywall',
    scope: 'code',
    why: 'hình dạng lời mời trả tiền trong MÃ NGUỒN (không áp cho content/)',
    // "Nâng cấp" một mình là hợp lệ (nâng cấp cluster). Chỉ cấm khi đi cùng
    // một danh từ thương mại trong vòng 30 ký tự — đúng hình dạng đã lọt.
    // `bản pro` an toàn: `\b` sau `pro` nên KHÔNG khớp "bản production".
    src:
      String.raw`nâng\s*cấp[^\n]{0,30}?(?:mở\s*kho[áa]|gói|tài\s*khoản|pro\b|premium|ngay)` +
      String.raw`|bản\s*pro\b`,
  },
];

// ──────────────────────────────────────────────────── che định danh lành
//
// Che TRƯỚC khi so mẫu, thay bằng đúng số khoảng trắng để giữ nguyên số cột.
// Che ở mức TỪ KHỚP chứ không bỏ cả dòng như bản grep cũ: một dòng có
// `CheckOutcome` vẫn phải bị bắt nếu chỗ khác trên dòng đó có chuỗi giá thật.
//
// `CheckOutcome` / `checkOutcomes` là KIỂU KẾT QUẢ CHẤM BÀI của P2, không dính
// gì tới `checkout` thương mại. `git checkout` / `actions/checkout` là lệnh git.
const MASKS = [
  String.raw`check[_\s]*outcomes?`,
  String.raw`check[_\s]*result[_\s]*panel`,
  String.raw`git\s+checkout`,
  String.raw`actions\/checkout`,
].map((s) => new RegExp(s.normalize('NFC'), 'giu'));

const COMPILED = RULES.map((r) => ({ ...r, re: new RegExp(r.src.normalize('NFC'), 'giu') }));

// ─────────────────────────────────────────────────────── bỏ dòng chú thích
//
// Chỗ ghi lại chính lệnh cấm (chú thích trong schema.ts, path.ts) phải chứa từ
// cấm để làm tài liệu. Chú thích không phải chuỗi giao diện nên bỏ qua được.
//
// PHÂN BIỆT THEO LOẠI FILE — bản grep cũ chỉ nhắm file TS nên bỏ mọi dòng mở
// đầu bằng `#` hoặc `*`. Áp nguyên si sang markdown là mù: `#` là TIÊU ĐỀ và
// `*` là GẠCH ĐẦU DÒNG, nên "# Mua khoá học" sẽ tuột.
function isCommentLine(trimmed, ext) {
  if (trimmed.startsWith('<!--')) return true;
  if (ext === '.md' || ext === '.mdx') return false; // `#`/`*` là cú pháp, không phải chú thích
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (trimmed.startsWith('#')) return true;
  if (ext === '.sql' && trimmed.startsWith('--')) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────── quét
function scanText(text, { isContent, ext }) {
  const hits = [];
  const lines = text.normalize('NFC').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isCommentLine(trimmed, ext)) continue;

    let masked = raw;
    for (const m of MASKS) masked = masked.replace(m, (s) => ' '.repeat(s.length));

    for (const rule of COMPILED) {
      if (isContent && rule.scope === 'code') continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(masked)) !== null) {
        hits.push({
          line: i + 1,
          col: m.index + 1,
          rule: rule.id,
          why: rule.why,
          match: m[0],
          text: trimmed,
        });
        if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
      }
    }
  }
  return hits;
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      yield* walk(join(dir, e.name));
    } else if (e.isFile()) {
      yield join(dir, e.name);
    }
  }
}

function scanTree() {
  const hits = [];
  let files = 0;

  // Một root biến mất (đổi tên thư mục) làm vùng quét co lại TRONG IM LẶNG —
  // cổng vẫn xanh vì không còn gì để quét. Thiếu root là hỏng cấu hình.
  const missing = ROOTS.filter((r) => !existsSync(join(REPO, r)));
  if (missing.length) {
    console.error(`LỖI CẤU HÌNH: vùng quét không tồn tại: ${missing.join(', ')}`);
    console.error('Thư mục bị đổi tên/di chuyển ⇒ sửa ROOTS trong scripts/check-no-commerce.mjs.');
    process.exit(2);
  }

  for (const root of ROOTS) {
    for (const abs of walk(join(REPO, root))) {
      if (abs === SELF) continue;
      const rel = relative(REPO, abs).split('\\').join('/');
      const ext = extname(abs).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      if (IS_TEST_FILE.test(abs)) continue; // file test PHẢI chứa từ cấm để gác
      if (statSync(abs).size > 2 * 1024 * 1024) continue;

      const buf = readFileSync(abs);
      if (buf.subarray(0, 8192).includes(0)) continue; // nhị phân không đuôi

      files++;
      const isContent = rel.startsWith('content/');
      for (const h of scanText(buf.toString('utf8'), { isContent, ext })) {
        hits.push({ ...h, file: rel });
      }
    }
  }
  return { hits, files };
}

// ─────────────────────────────────────────────────────────── đối chứng
//
// BẨN: phải bị bắt. Bốn dòng đầu là bốn dòng LỌT qua lệnh grep cũ (đo
// 2026-09-06); bốn dòng sau là bốn hình dạng lệnh cũ ĐÃ bắt được — giữ ở đây
// để một lần "mở rộng mẫu" sau này không lỡ đánh rơi.
const DIRTY = [
  ['lọt-1', 'Nâng cấp để mở khoá — 199.000đ/tháng'],
  ['lọt-2', 'Học phí trọn gói 1.500.000đ'],
  ['lọt-3', 'Mua khoá học'],
  ['lọt-4', 'Bản Pro — 99k/tháng'],
  ['cũ-SNAKE_CASE', 'const MONTHLY_PRICE_VND = 199000;'],
  ['cũ-camelCase', 'const isPaid = user.subscription !== null;'],
  ['cũ-hằng', "export const PAYWALL_COPY = 'Mở khoá tất cả';"],
  ['cũ-đường-dẫn-URL', "router.push('/checkout/success');"],
  ['thêm-gói-cước', '<p>Gói cước Pro cho người học nghiêm túc</p>'],
  ['thêm-thanh-toán', 'Thanh toán qua VNPay hoặc chuyển khoản'],
  ['thêm-giá-bán', 'Giá bán: 50000 VND'],
  ['thêm-stripe', 'await stripe.checkout.sessions.create({});'],
  ['thêm-ngoại-tệ', '<span>$9.99 / month</span>'],
  ['thêm-mua-gói', 'Mua gói 12 tháng để tiết kiệm'],
];

// BẨN trong content/: chứng minh `content/` THẬT SỰ được gác, chứ không chỉ
// được đi qua. Chỉ dùng luật scope 'all'.
const DIRTY_CONTENT = [
  ['content-mua-khoá-học', 'Mua khoá học để xem tiếp'],
  ['content-học-phí', 'Học phí trọn gói 1.500.000đ'],
  ['content-thanh-toán', 'Thanh toán qua VNPay'],
  ['content-tiền-theo-kỳ', 'Chỉ 99k/tháng'],
];

// SẠCH: không được kêu. Phần lớn lấy từ dòng THẬT trong cây, phần còn lại từ
// danh sách dương-tính-giả tiếng Việt đã biết.
const CLEAN = [
  "import { CheckResultPanel, type CheckOutcome } from './check-result-panel';",
  'const [checkOutcomes, setCheckOutcomes] = useState({});',
  'setCheckOutcomes((prev) => ({ ...prev, [taskId]: { kind: running } }));',
  'const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);',
  'function subscribe(listener) { return () => {}; }',
  'giá trị mặc định là 30 giây',
  'đánh giá kết quả bài làm của người học',
  'nút nằm phía trên bàn phím ảo',
  'đóng gói ứng dụng thành container image',
  'đăng ký tài khoản bằng email của trường',
  'mở khoá bài học tiếp theo khi hoàn thành',
  'nhấn phím Esc hai lần để rời terminal',
  'trần body 1.048.576 byte cho mỗi request',
  'tier ratelimit-ide 600/1m burst 300',
  'helm upgrade --install dlp ./charts/dlp',
  "'upgrade-insecure-requests',",
  'git checkout -b feat/p13-frontend',
  '- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'const plan = await buildLearningPlan(userId);',
  "READY=$(kubectl get nodes --no-headers | awk '{print $1}')",
  'echo "dùng: $0 <email> <user|author|admin>" >&2',
  'gateway INCR trước upgrade và giảm khi đóng',
  'phiên bản 1.34 của Kubernetes',
  'sandbox dùng 512Mi RAM, giới hạn 8 phiên',
  'thử lại sau 30 giây nếu pod chưa sẵn sàng',
  // Ba dòng dưới là DƯƠNG TÍNH GIẢ THẬT đã xảy ra, ghim lại để không tái phát.
  // Dòng đầu lấy nguyên văn từ apps/web/src/components/shell/narrow-screen-notice.tsx
  // — "học phía" chứa chuỗi con "học phí".
  'thiết bị hoặc mở lại trang này trên máy tính. Phần nội dung bài học phía trên vẫn',
  'bảng giá trị mặc định của biến môi trường',
  'giảm giá trị timeout xuống 10 giây',
];

// SẠCH chỉ trong content/: ba cụm này hợp lệ trong văn xuôi bài học DevOps, và
// chính vì thế luật `vi-cta-paywall` mang scope 'code'.
const CLEAN_CONTENT = [
  'nâng cấp cluster lên phiên bản 1.34',
  'nâng cấp gói phần mềm bằng apt-get upgrade',
  'nâng cấp tài khoản dịch vụ của Kubernetes',
];

function selfTest() {
  const fails = [];

  for (const [tag, line] of DIRTY) {
    if (scanText(line, { isContent: false, ext: '.tsx' }).length === 0) {
      fails.push(`BẨN KHÔNG BỊ BẮT  [${tag}]  ${line}`);
    }
  }
  for (const [tag, line] of DIRTY_CONTENT) {
    if (scanText(line, { isContent: true, ext: '.md' }).length === 0) {
      fails.push(`BẨN (content/) KHÔNG BỊ BẮT  [${tag}]  ${line}`);
    }
  }
  for (const line of CLEAN) {
    const hits = scanText(line, { isContent: false, ext: '.tsx' });
    if (hits.length) fails.push(`SẠCH BỊ KÊU OAN  [${hits[0].rule} khớp "${hits[0].match}"]  ${line}`);
  }
  for (const line of CLEAN_CONTENT) {
    const hits = scanText(line, { isContent: true, ext: '.md' });
    if (hits.length) {
      fails.push(`SẠCH (content/) BỊ KÊU OAN  [${hits[0].rule} khớp "${hits[0].match}"]  ${line}`);
    }
  }

  const total = DIRTY.length + DIRTY_CONTENT.length + CLEAN.length + CLEAN_CONTENT.length;
  if (fails.length) {
    console.error('✗ ĐỐI CHỨNG HỎNG — cổng không chứng minh được là nó biết kêu:\n');
    for (const f of fails) console.error(`   ${f}`);
    console.error(`\n${fails.length}/${total} mẫu sai. Sửa RULES trong ${relative(REPO, SELF)}.`);
    console.error('KHÔNG nới bộ lọc trừ để dập báo động — sửa mẫu bắt.');
    return false;
  }
  console.log(
    `✓ đối chứng: bắt đủ ${DIRTY.length + DIRTY_CONTENT.length} mẫu vi phạm ` +
      `(gồm 4 dòng từng lọt lệnh grep cũ), không kêu trên ` +
      `${CLEAN.length + CLEAN_CONTENT.length} mẫu sạch.`,
  );
  return true;
}

// ─────────────────────────────────────────────────────────────── main
const onlySelfTest = process.argv.includes('--self-test');

if (!selfTest()) process.exit(2);
if (onlySelfTest) process.exit(0);

const { hits, files } = scanTree();

if (hits.length === 0) {
  console.log(
    `✓ không có chuỗi giá / gói cước / thanh toán / paywall — ` +
      `đã quét ${files} file trong ${ROOTS.length} vùng.`,
  );
  process.exit(0);
}

console.error(`\n✗ ${hits.length} vi phạm lệnh cấm thương mại (AC cuối 13.H):\n`);
for (const h of hits) {
  console.error(`   ${h.file}:${h.line}:${h.col}  [${h.rule}] khớp "${h.match}"`);
  console.error(`      ${h.text.slice(0, 140)}`);
}
console.error('\nNền tảng này KHÔNG bán khoá học: không màn hình, route, chuỗi, cột DB,');
console.error('hay procedure nào về giá / gói cước / thanh toán / nâng cấp / paywall.');
console.error('Nếu đây là báo động giả thì sửa MẪU trong scripts/check-no-commerce.mjs');
console.error('và thêm dòng đó vào mảng CLEAN để lần sau không tái phát.');
process.exit(1);
