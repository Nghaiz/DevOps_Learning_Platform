#!/usr/bin/env node
/**
 * Cổng gác **lõi trung lập** của game Đường ống CI/CD (19.C.6), kèm **khoá tên
 * `clone`** (19.C.5).
 *
 * Ràng buộc kiến trúc, chép từ `packages/games/src/cicd/contract.ts` §1:
 *
 *   > LÕI TRUNG LẬP. File này và `cicd/engine.ts` KHÔNG được mang tên riêng của
 *   > bất kỳ nhà cung cấp CI nào — không tên khoá YAML của họ, không tên hành
 *   > động dựng sẵn của họ, không tên nhãn máy chạy của họ. Chỉ tầng đọc/ghi
 *   > YAML (19.C) biết nhà cung cấp; thêm một nhà cung cấp thứ hai là thêm một
 *   > bộ đọc, không đụng lõi.
 *
 * Đó là ô nghiệm thu AC-4. Trước cổng này, ràng buộc chỉ tồn tại dưới dạng một
 * đoạn văn trong chú thích — tức là nó đúng đúng chừng nào còn có người nhớ đọc.
 *
 * VÌ SAO Ở `scripts/` CHỨ KHÔNG Ở `packages/games`
 * ------------------------------------------------
 * `packages/games/tsconfig.json` cố ý bỏ `types: ["node"]` và package không khai
 * `@types/node` — mã game chạy trong bundle trình duyệt. Một cổng đọc file từ
 * đĩa cần `node:fs`, nên nó không đặt được ở đó. `contract.ts` §1 đã ghi trước
 * điều này để lane 19.C.6 không mất một vòng CI mới phát hiện.
 *
 * DANH SÁCH FILE LÕI ĐƯỢC SUY RA, KHÔNG CHÉP TAY
 * ----------------------------------------------
 * Cổng **duyệt cả thư mục** `packages/games/src/cicd/` và mặc định coi MỌI file
 * là lõi. Tầng YAML là NGOẠI LỆ và phải tự khai ra (xem `phanTang()` ở dưới).
 *
 * Chiều fail của quy ước này là chiều đúng: một file thêm sau mà không khai gì
 * thì **được gác**, không phải **bị bỏ quên**. Một danh sách chép tay thì ngược
 * lại — nó mù đúng với file viết sau nó, và mù trong im lặng. Đó là hình dạng
 * lỗi `rules/green-that-proves-nothing.md` gọi tên: "checks the wrong artifact".
 *
 * ĐỐI CHỨNG NẰM TRONG CHÍNH SCRIPT
 * --------------------------------
 * Mỗi lần chạy, cổng tự kiểm nó BẮT được tập mẫu vi phạm đã biết và KHÔNG kêu
 * trên tập mẫu sạch đã biết — TRƯỚC khi quét cây. Tự kiểm hỏng thì thoát 2 và
 * không quét gì. Khuôn này mượn nguyên từ `scripts/check-no-commerce.mjs`; một
 * cổng chỉ biết xanh thì không gác gì.
 *
 * Dùng:
 *   node scripts/check-cicd-vendor-neutral.mjs              # tự kiểm rồi quét
 *   node scripts/check-cicd-vendor-neutral.mjs --self-test  # chỉ tự kiểm
 *
 * Mã thoát: 0 sạch · 1 có vi phạm · 2 tự kiểm hỏng / sai cấu hình.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');

/** Cây duy nhất được gác. Thiếu nó là hỏng cấu hình, không phải "sạch". */
const CICD_DIR = 'packages/games/src/cicd';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', '.turbo', '.artifacts',
  'dist', 'build', 'coverage', 'gen', 'test-results', '__snapshots__',
]);

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.wasm',
  '.zip', '.gz', '.tar', '.br', '.mp4', '.webm', '.mp3', '.zst',
]);

// ───────────────────────────────────────────── ranh giới lõi ↔ tầng YAML
//
// HAI kênh khai báo, cả hai ĐỌC ĐƯỢC TỪ CHÍNH FILE. Cố ý không có kênh thứ ba
// là "một mảng đường dẫn trong script này": một danh sách như thế ôi đi trong
// im lặng, và nó đặt sự thật ở xa file mà nó mô tả.
//
//   1. TÊN FILE — `cicd/yaml-*.ts`, hoặc bất cứ thứ gì dưới `cicd/yaml/`.
//      Đây là quy ước đã chốt ở phase-19 cho 19.C.1/C.2. Tên file là một sự
//      thật CẤU TRÚC: người đọc `ls` thấy ngay ranh giới mà không mở file nào.
//
//   2. KHAI BÁO TƯỜNG MINH — chuỗi `@cicd-layer vendor` trong file (thường đặt
//      ở khối chú thích đầu). Kênh này tồn tại cho trường hợp tầng YAML được
//      đặt tên khác dự kiến (`github-actions.ts`, `emit.ts`, ...). Khi đó file
//      tự nói ra nó là tầng nào, ngay tại chỗ.
//
// ⚠ Kênh 2 là một LỜI KHAI của con người, nên nó có hạn dùng: một file khai
// `vendor` mà không chứa nổi một token nhà cung cấp nào là một lời khai chết,
// và cổng bắt nó (xem `khaiBaoChet` ở cuối). Kênh 1 KHÔNG bị kiểm như vậy —
// tên file là sự thật cấu trúc, không phải lời khai, và một `yaml-emit.ts` còn
// đang dựng dở thì rỗng là chuyện bình thường.
const VENDOR_THEO_TEN_FILE = /^yaml[-.]/i;
const VENDOR_THEO_THU_MUC = /(^|\/)yaml\//i;
const VENDOR_THEO_KHAI_BAO = /@cicd-layer\s+vendor/;

/** @returns {{lop: 'loi'|'vendor', boi: string}} */
function phanTang(rel, text) {
  const ten = basename(rel);
  if (VENDOR_THEO_THU_MUC.test(rel)) return { lop: 'vendor', boi: 'thư-mục yaml/' };
  if (VENDOR_THEO_TEN_FILE.test(ten)) return { lop: 'vendor', boi: 'tên-file yaml-*' };
  if (VENDOR_THEO_KHAI_BAO.test(text)) return { lop: 'vendor', boi: 'khai-báo @cicd-layer vendor' };
  return { lop: 'loi', boi: 'mặc định (không khai gì)' };
}

// ───────────────────────────────────────────────────────────────── luật
//
// Dấu nháy ngược phải dựng bằng `fromCharCode`: trong lớp ký tự của một RegExp
// có cờ `u`, `\`` là escape KHÔNG hợp lệ và ném SyntaxError ngay lúc nạp file.
// Viết thẳng ký tự đó vào một `String.raw` thì lại kết thúc template literal.
const NHAY_NGUOC = String.fromCharCode(96);
const MO_CHUOI = `['"${NHAY_NGUOC}]`;
const TRONG_CHUOI = `[^'"${NHAY_NGUOC}\\n]`;

const RULES = [
  {
    id: 'tên-nhà-cung-cấp',
    why: 'tên riêng của một nhà cung cấp CI / nhãn máy chạy / hành động dựng sẵn',
    // Nhóm này gồm những chuỗi KHÔNG THỂ là từ vựng miền của một engine DAG
    // trung lập. Trung lập nghĩa là trung lập với MỌI nhà cung cấp, nên GitLab
    // hay Jenkins trong lõi cũng là đúng một lỗi như GitHub.
    //
    // `circle[- ]?ci` / `drone[- ]?ci` / `semaphoreci` chứ không phải `circle`,
    // `drone`, `semaphore` trần: ba từ sau là từ tiếng Anh thường (và
    // `semaphore` còn là thuật ngữ đồng bộ hoá — đúng loại từ một bộ lập lịch
    // được phép dùng). Đây là cùng bài học mà `check-no-commerce.mjs` học được
    // từ `skullbuster`/`striped`: một tiền tố quá rộng mua một trận báo động
    // giả, và một cổng kêu oan thì bị tắt trong hai tuần.
    src: String.raw`github|gitlab|bitbucket|circle[- ]?ci|jenkins|travis|buildkite|teamcity|appveyor|woodpecker|drone[- ]?ci|semaphoreci|azure|actions\/|runs[-_]on|ubuntu-latest|windows-latest|macos-latest|self-hosted|workflow_(?:dispatch|call|run)`,
  },
  {
    id: 'khoá-yaml-trong-chuỗi',
    why: 'khoá YAML của nhà cung cấp nằm TRONG một chuỗi — dấu hiệu lõi tự sinh YAML',
    // ⚠ ĐÂY LÀ CHỖ ĐẮT NHẤT CỦA CỔNG, và hình dạng của nó do phép đo ép ra.
    //
    // Yêu cầu ban đầu là chặn `jobs:` / `needs:` / `steps:` trần. Đo trên cây
    // thật (2026-09-16) thì `steps:` có 13 lần xuất hiện và TẤT CẢ đều hợp lệ:
    //
    //     contract.ts:436   readonly steps: readonly StepSpec[];
    //     contract.ts:759   readonly steps: readonly StepRecord[];
    //
    // `steps` là TỪ VỰNG MIỀN của game, không phải từ vựng GitHub. `jobs:` và
    // `needs:` có ĐÚNG CÙNG HÌNH DẠNG (khoá của một object literal TS) và hôm
    // nay chỉ đang là 0 vì hợp đồng chọn tên `dependsOn`. Chặn chúng trần là
    // đặt một quả mìn dưới chân lane viết sau.
    //
    // Nên bộ phân biệt là DẤU NHÁY: một khoá TS không bao giờ có dấu hai chấm
    // NẰM TRONG dấu nháy, còn một bộ sinh YAML thì luôn luôn:
    //
    //     readonly jobs: readonly JobSpec[];     ← khoá TS, KHÔNG bắt
    //     out += `jobs:\n  build:\n`;            ← sinh YAML, BẮT
    //
    // `steps` cố ý KHÔNG có trong nhóm này: `throw new Error(\`steps: ${n}\`)`
    // là một chuỗi chẩn đoán hợp lệ, và `steps` một mình không nêu tên nhà cung
    // cấp nào. `strategy` / `matrix` cũng bị loại vì `RetryStrategy` (19.A.6)
    // và "ma trận" là từ vựng miền.
    src: `${MO_CHUOI}${TRONG_CHUOI}{0,80}?\\b(?:jobs|needs|uses)\\s*:`,
  },
];

const COMPILED = RULES.map((r) => ({ ...r, re: new RegExp(r.src.normalize('NFC'), 'giu') }));

// ─────────────────────────────────────── 19.C.5 — khoá tên stage `clone`
//
// `scripts/check-no-commerce.mjs` chặn token trần `checkout` trong luật
// `en-thương-mại`, và `packages/games/src` NẰM TRONG `ROOTS` của nó từ commit
// `5c3815c` (2026-09-08). Hiện `cicd/` không có `checkout` nào: engine 19.A đặt
// tên stage đầu là `'clone'`.
//
// Luật này khoá nguyên trạng đó. Vì sao cần một luật RIÊNG thay vì để cổng
// thương mại bắt: THÔNG ĐIỆP. Một người đặt `stage: 'checkout'` trong `cicd/`
// sẽ nhận một lỗi nói về **lệnh cấm bán khoá học** — đúng về mặt cơ chế, vô
// dụng về mặt chỉ đường, và họ sẽ đi tìm một trang thanh toán không tồn tại.
// Ở đây họ nhận đúng hai đường đi, tại đúng file và dòng.
//
// ⛔ Đường sửa KHÔNG BAO GIỜ là gỡ `packages/games/src` khỏi `ROOTS` của cổng
// thương mại. Làm thế là mở toang lại đúng vùng mã mà `5c3815c` vừa đóng, và
// mở trong im lặng — cổng vẫn xanh, chỉ là không quét gì.
//
// Luật áp cho CẢ CÂY `cicd/` (lõi lẫn tầng YAML): cổng thương mại cũng quét cả
// cây, nên một `checkout` trần ở tầng YAML cũng làm nó đỏ y hệt.
const CHECKOUT_RE = /checkout/giu;

// Che TRƯỚC khi so, thay bằng đúng số khoảng trắng để giữ nguyên số cột.
//
// ⚠ BỐN dòng này là BẢN SAO CÓ CHỦ Ý của `MASKS` trong `check-no-commerce.mjs`.
// Coupling được ghi ra đây chứ không giấu đi: nếu cổng này che HẸP hơn cổng kia
// thì nó kêu oan trên thứ cổng kia cho qua (kêu oan ⇒ bị tắt); nếu che RỘNG hơn
// thì nó im trên thứ cổng kia sẽ bắt (mất hết công dụng chỉ đường). Sửa `MASKS`
// bên đó thì sửa cả ở đây — ca CLEAN `CheckOutcome` dưới gác chiều thứ nhất.
//
// `check[_\s]*outcomes?` là bắt buộc chứ không phải cho chắc: chuỗi con của
// `CheckOutcome` viết thường LÀ `checkout` (C-h-e-c-k-O-u-t).
const CHECKOUT_MASKS = [
  String.raw`check[_\s]*outcomes?`,
  String.raw`check[_\s]*result[_\s]*panel`,
  String.raw`git\s+checkout`,
  String.raw`actions\/checkout`,
].map((s) => new RegExp(s, 'giu'));

// ─────────────────────────────────────────────────────── bỏ dòng chú thích
//
// Áp cho luật `tên-stage-checkout` THÔI, và đó là một lựa chọn có lý do đo
// được: `check-no-commerce.mjs` BỎ QUA dòng chú thích. Nếu luật này bắt trong
// chú thích còn cổng kia thì không, nó kêu oan trên thứ nó tự nhận là đang bảo
// vệ — cry-wolf, rồi bị tắt.
//
// Hai luật nhà-cung-cấp thì NGƯỢC LẠI: chúng quét cả chú thích. Ràng buộc §1
// nói "KHÔNG được mang tên riêng của bất kỳ nhà cung cấp nào", không trừ văn
// xuôi, và chú thích chính là chỗ tên ấy len vào tự nhiên nhất. Rằng làm được
// là đo được: `contract.ts` bàn về ràng buộc này suốt một khối 40 dòng mà
// không viết ra một tên nhà cung cấp nào — nó viết "nhà cung cấp CI".
function laDongChuThich(trimmed) {
  if (trimmed.startsWith('<!--')) return true;
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  if (trimmed.startsWith('#')) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────── quét
function scanText(text, { lop }) {
  const hits = [];
  const lines = text.normalize('NFC').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Luật nhà-cung-cấp: chỉ áp cho lõi, áp cả trên dòng chú thích.
    if (lop === 'loi') {
      for (const rule of COMPILED) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(raw)) !== null) {
          hits.push({ line: i + 1, col: m.index + 1, rule: rule.id, why: rule.why, match: m[0], text: trimmed });
          if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
        }
      }
    }

    // Luật tên-stage: áp cho cả cây, bỏ qua chú thích (khớp cổng thương mại).
    if (laDongChuThich(trimmed)) continue;
    let che = raw;
    for (const m of CHECKOUT_MASKS) che = che.replace(m, (s) => ' '.repeat(s.length));
    CHECKOUT_RE.lastIndex = 0;
    let c;
    while ((c = CHECKOUT_RE.exec(che)) !== null) {
      hits.push({
        line: i + 1,
        col: c.index + 1,
        rule: 'tên-stage-checkout',
        why: 'stage đầu tên là `clone`; `checkout` trần làm cổng thương mại đỏ với một thông điệp sai chỗ',
        match: c[0],
        text: trimmed,
      });
      if (c.index === CHECKOUT_RE.lastIndex) CHECKOUT_RE.lastIndex++;
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
  // Thư mục biến mất (đổi tên / dời chỗ) làm vùng quét co về rỗng TRONG IM
  // LẶNG — cổng vẫn xanh vì không còn gì để quét.
  if (!existsSync(join(REPO, CICD_DIR))) {
    console.error(`LỖI CẤU HÌNH: không thấy ${CICD_DIR}`);
    console.error('Thư mục bị đổi tên/di chuyển ⇒ sửa CICD_DIR trong scripts/check-cicd-vendor-neutral.mjs.');
    process.exit(2);
  }

  const hits = [];
  const loi = [];
  const vendor = [];
  const khaiBao = [];

  for (const abs of walk(join(REPO, CICD_DIR))) {
    if (abs === SELF) continue;
    const rel = relative(REPO, abs).split('\\').join('/');
    if (BINARY_EXT.has(extname(abs).toLowerCase())) continue;
    if (statSync(abs).size > 2 * 1024 * 1024) continue;

    const buf = readFileSync(abs);
    if (buf.subarray(0, 8192).includes(0)) continue;

    const text = buf.toString('utf8');
    const { lop, boi } = phanTang(rel, text);
    (lop === 'loi' ? loi : vendor).push({ rel, boi });

    // Lời khai `@cicd-layer vendor` được kiểm hạn dùng ĐỘC LẬP với việc file đã
    // được phân tầng bằng kênh nào — một lời khai chết nấp sau một tên file
    // đúng quy ước vẫn là một lời khai chết.
    if (VENDOR_THEO_KHAI_BAO.test(text)) khaiBao.push({ rel, text });

    for (const h of scanText(text, { lop })) hits.push({ ...h, file: rel, lop });
  }

  return { hits, loi, vendor, khaiBao };
}

// ─────────────────────────────────────────────────────────── đối chứng
//
// BẨN: phải bị bắt. CLEAN: không được kêu. Mỗi dòng CLEAN gác một quyết định
// thu hẹp cụ thể ở trên — xoá dòng nào là mất phép đo chứng minh quyết định đó
// còn đúng.
const DIRTY_LOI = [
  ['nhãn-máy-chạy', "const runner = 'ubuntu-latest';"],
  ['khoá-runs-on', 'runs-on: ubuntu-latest'],
  ['hành-động-dựng-sẵn', "steps.push({ uses: 'actions/checkout@v5' });"],
  ['tên-vendor-trong-chú-thích', '// GitHub Actions gọi nhãn này là runner label'],
  ['vendor-thứ-hai', "// bộ đọc GitLab CI sẽ dùng cùng hợp đồng"],
  ['biến-môi-trường-vendor', 'const sha = process.env.GITHUB_SHA;'],
  ['kích-hoạt-vendor', "on: { workflow_dispatch: {} }"],
  ['jenkins', '// Jenkinsfile dùng khái niệm stage khác hẳn'],
  ['yaml-jobs-trong-chuỗi', 'out += `jobs:\\n  build:\\n`;'],
  ['yaml-needs-trong-chuỗi', "lines.push('  needs: [build]');"],
  ['yaml-uses-trong-chuỗi', 'lines.push("    uses: checkout-action");'],
];

const DIRTY_CHECKOUT = [
  ['stage-trần', "const CHECKOUT: StageId = 'checkout';"],
  ['stage-trong-spec', "stages: [{ id: 'checkout', steps: [] }]"],
  ['hằng-hoa', "const CHECKOUT_STAGE_ID = 'checkout';"],
];

const CLEAN_LOI = [
  // ── gác quyết định loại `steps:` / `jobs:` / `needs:` trần (đo 2026-09-16)
  'readonly steps: readonly StepSpec[];', // contract.ts:436 nguyên văn
  'readonly steps: readonly StepRecord[];', // contract.ts:759 nguyên văn
  'readonly jobs: readonly JobSpec[];',
  'readonly needs: readonly StageId[];',
  'function chang(id: string, steps: readonly StepSpec[]): StageSpec {',
  'throw new Error(`steps: ${n} không khớp số bản ghi`);',
  // ── gác quyết định loại `strategy` / `matrix` / `semaphore` / `circle` trần
  'const strategy: RetryStrategy = { lanToiDa: 3 };',
  'const matrix = buildMatrix(dims);',
  'const sem = new Semaphore(runnerSlots);',
  'const r = circle.radius * 2;',
  'drone.position = next;',
  // ── từ vựng miền phải sống được
  '/** Mỗi job là một đơn vị công việc trên đồ thị. */',
  'const jobId = stage.id;',
  'export function xepLich(spec: WorkflowSpec): ScheduleRecord {',
  'const clone = stages.find((s) => s.id === "clone");',
];

const CLEAN_CHECKOUT = [
  // `CheckOutcome` viết thường CHỨA `checkout` — không che thì kêu oan.
  "import { type CheckOutcome } from './check-result-panel';",
  'const [checkOutcomes, setCheckOutcomes] = useState({});',
  'git checkout -b feat/p19-cicd-game',
  "lines.push('      - uses: actions/checkout@v5');",
  // Tên đúng, phải im.
  "const CLONE: StageId = 'clone';",
  "stages: [{ id: 'clone', steps: [] }]",
];

function selfTest() {
  const fails = [];

  for (const [tag, line] of DIRTY_LOI) {
    const hits = scanText(line, { lop: 'loi' }).filter((h) => h.rule !== 'tên-stage-checkout');
    if (hits.length === 0) fails.push(`BẨN (lõi) KHÔNG BỊ BẮT  [${tag}]  ${line}`);
  }
  // Cùng những dòng đó, ở TẦNG YAML, phải im — nếu không thì ranh giới lõi ↔
  // tầng YAML chỉ là văn xuôi chứ không phải một thứ script thật sự làm.
  for (const [tag, line] of DIRTY_LOI) {
    const hits = scanText(line, { lop: 'vendor' }).filter((h) => h.rule !== 'tên-stage-checkout');
    if (hits.length > 0) {
      fails.push(`TẦNG YAML BỊ KÊU OAN  [${tag}] khớp "${hits[0].match}"  ${line}`);
    }
  }
  for (const [tag, line] of DIRTY_CHECKOUT) {
    // Luật tên-stage áp cho CẢ HAI tầng — kiểm ở tầng YAML để chứng minh điều đó.
    const hits = scanText(line, { lop: 'vendor' }).filter((h) => h.rule === 'tên-stage-checkout');
    if (hits.length === 0) fails.push(`BẨN (checkout) KHÔNG BỊ BẮT  [${tag}]  ${line}`);
  }
  for (const line of CLEAN_LOI) {
    const hits = scanText(line, { lop: 'loi' });
    if (hits.length) fails.push(`SẠCH BỊ KÊU OAN  [${hits[0].rule} khớp "${hits[0].match}"]  ${line}`);
  }
  for (const line of CLEAN_CHECKOUT) {
    // Chỉ lọc luật tên-stage: mỗi tập mẫu gác ĐÚNG luật nó mang tên. Dòng
    // `- uses: actions/checkout@v5` phải im với luật tên-stage (vì `actions/
    // checkout` đã được che) nhưng VẪN phải làm luật nhà-cung-cấp đỏ nếu nó
    // nằm trong lõi — đó là hai phép đo khác nhau, và gộp lại thì phép sau
    // biến phép trước thành tiếng ồn. Tự kiểm bắt đúng chỗ này lần chạy đầu.
    const hits = scanText(line, { lop: 'loi' }).filter((h) => h.rule === 'tên-stage-checkout');
    if (hits.length) fails.push(`SẠCH (checkout) BỊ KÊU OAN  [khớp "${hits[0].match}"]  ${line}`);
  }

  // Ranh giới phải phân loại đúng — nếu `phanTang` hỏng thì mọi phép trên vô nghĩa.
  const CA_PHAN_TANG = [
    ['packages/games/src/cicd/engine.ts', '', 'loi'],
    ['packages/games/src/cicd/contract.ts', '', 'loi'],
    ['packages/games/src/cicd/yaml-read.ts', '', 'vendor'],
    ['packages/games/src/cicd/yaml-emit.test.ts', '', 'vendor'],
    ['packages/games/src/cicd/yaml/github.ts', '', 'vendor'],
    ['packages/games/src/cicd/emit.ts', '/** @cicd-layer vendor */', 'vendor'],
    ['packages/games/src/cicd/yamlish.ts', '', 'loi'], // `yaml` phải có `-`/`.` ngay sau
  ];
  for (const [rel, text, mong] of CA_PHAN_TANG) {
    const { lop } = phanTang(rel, text);
    if (lop !== mong) fails.push(`PHÂN TẦNG SAI  ${rel} ⇒ ${lop}, mong ${mong}`);
  }

  const tong =
    DIRTY_LOI.length * 2 + DIRTY_CHECKOUT.length + CLEAN_LOI.length + CLEAN_CHECKOUT.length + CA_PHAN_TANG.length;
  if (fails.length) {
    console.error('✗ ĐỐI CHỨNG HỎNG — cổng không chứng minh được là nó biết kêu:\n');
    for (const f of fails) console.error(`   ${f}`);
    console.error(`\n${fails.length}/${tong} phép sai. Sửa RULES trong ${relative(REPO, SELF).split('\\').join('/')}.`);
    console.error('KHÔNG nới bộ che để dập báo động — sửa mẫu bắt.');
    return false;
  }
  console.log(
    `✓ đối chứng: bắt đủ ${DIRTY_LOI.length + DIRTY_CHECKOUT.length} mẫu vi phạm, ` +
      `im đúng ${DIRTY_LOI.length} mẫu đó ở tầng YAML, ` +
      `không kêu trên ${CLEAN_LOI.length + CLEAN_CHECKOUT.length} mẫu sạch, ` +
      `phân tầng đúng ${CA_PHAN_TANG.length}/${CA_PHAN_TANG.length} ca.`,
  );
  return true;
}

// ─────────────────────────────────────────────────────────────── main
const onlySelfTest = process.argv.includes('--self-test');

if (!selfTest()) process.exit(2);
if (onlySelfTest) process.exit(0);

const { hits, loi, vendor, khaiBao } = scanTree();

// Không còn file lõi nào = vùng quét rỗng. Một cổng quét 0 file luôn xanh, và
// nó xanh vì KHÔNG ĐO GÌ chứ không vì mọi thứ đều đúng.
if (loi.length === 0) {
  console.error(`✗ không thấy file LÕI nào trong ${CICD_DIR}.`);
  console.error('Hoặc cây trống, hoặc mọi file đã tự khai là tầng YAML. Cả hai đều cần người xem.');
  process.exit(2);
}

// CHIỀU XUỐNG của lời khai: `@cicd-layer vendor` mà không chứa token nhà cung
// cấp nào là một lời khai chết. Không có vế này thì khai báo là một cửa sau
// vĩnh viễn: dán một dòng vào file, và file đó ra khỏi tầm cổng mãi mãi.
const khaiBaoChet = khaiBao.filter(
  ({ text }) => scanText(text, { lop: 'loi' }).filter((h) => h.rule !== 'tên-stage-checkout').length === 0,
);
if (khaiBaoChet.length > 0) {
  console.error(`\n✗ ${khaiBaoChet.length} lời khai @cicd-layer vendor đã HẾT HẠN:\n`);
  for (const { rel } of khaiBaoChet) console.error(`   ${rel}`);
  console.error('\nFile không chứa token nhà cung cấp nào ⇒ nó không cần đứng ngoài cổng.');
  console.error('Đó là TIN MỪNG: XOÁ dòng khai báo, đừng thêm token vào cho khớp lời khai.');
  process.exit(1);
}

if (hits.length === 0) {
  console.log(
    `✓ lõi cicd trung lập với nhà cung cấp — ${loi.length} file lõi, ` +
      `${vendor.length} file tầng YAML (${vendor.map((v) => basename(v.rel)).join(', ') || 'chưa có'}).`,
  );
  console.log(`✓ không có tên stage \`checkout\` trần — stage đầu vẫn là \`clone\` (19.C.5).`);
  process.exit(0);
}

const viPhamTang = hits.filter((h) => h.rule !== 'tên-stage-checkout');
const viPhamTen = hits.filter((h) => h.rule === 'tên-stage-checkout');

console.error(`\n✗ ${hits.length} vi phạm trong ${CICD_DIR}:\n`);
for (const h of hits) {
  console.error(`   ${h.file}:${h.line}:${h.col}  [${h.rule}] khớp "${h.match}"`);
  console.error(`      ${h.text.slice(0, 140)}`);
}

if (viPhamTang.length > 0) {
  console.error('\n── LÕI TRUNG LẬP (AC-4, contract.ts §1) ─────────────────────────');
  console.error('Lõi cicd KHÔNG được mang tên riêng của bất kỳ nhà cung cấp CI nào.');
  console.error('Thêm nhà cung cấp thứ hai phải là thêm một BỘ ĐỌC, không đụng lõi.');
  console.error('');
  console.error('Hai đường đi:');
  console.error('  1. Đổi sang từ vựng miền (`runnerTier`, `dependsOn`, `nhà cung cấp CI`).');
  console.error('  2. Nếu file NÀY thật sự là tầng đọc/ghi YAML: đặt tên `yaml-*.ts`,');
  console.error('     hoặc để nó dưới `cicd/yaml/`, hoặc khai `@cicd-layer vendor` trong file.');
}

if (viPhamTen.length > 0) {
  console.error('\n── TÊN STAGE (19.C.5) ───────────────────────────────────────────');
  console.error('`checkout` trần trong cicd/ làm `scripts/check-no-commerce.mjs` đỏ với một');
  console.error('thông điệp về LỆNH CẤM THƯƠNG MẠI — đúng cơ chế, sai chỗ để đi tìm.');
  console.error('');
  console.error('Hai đường đi:');
  console.error('  1. Dùng `clone` (tên stage engine 19.A đã chốt). Đây là đường mặc định.');
  console.error('  2. Bất đắc dĩ: thêm một dòng KEYWORD_EXEMPTIONS hẹp trong');
  console.error('     scripts/check-no-commerce.mjs (pathPrefix + ruleId + đúng một token),');
  console.error('     rồi nới luật này kèm lý do. KHÔNG gỡ `packages/games/src` khỏi ROOTS —');
  console.error('     làm thế là mở toang vùng mã mà commit 5c3815c vừa đóng.');
}

process.exit(1);
