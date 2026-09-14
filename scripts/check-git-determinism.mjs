#!/usr/bin/env node
/**
 * Cổng gác TÍNH TẤT ĐỊNH của engine game Git — §17.J.2.
 *
 * Điều kiện: **không `Date.now()`, không `Math.random()`** trong đường thực thi
 * của `packages/games/src/git/**`. Thời gian là `logicalTime` tăng theo số lệnh;
 * ngẫu nhiên đi qua `core/rng.ts` có hạt giống.
 *
 * VÌ SAO ĐÂY LÀ MỘT CỔNG CI, KHÔNG PHẢI MỘT GHI CHÚ
 * --------------------------------------------------
 * Hỏng tính tất định không làm gì đỏ. Engine vẫn chạy, người chơi vẫn qua bài,
 * và mọi test đơn vị vẫn xanh — vì mỗi test chỉ chạy engine MỘT lần. Nó chỉ lộ
 * ở P18, khi máy chủ chấm lại một nhật ký và ra con số khác con số client khai.
 * Lúc đó triệu chứng là "hệ thống từ chối người chơi ngẫu nhiên", và không ai
 * nối được nó về một dòng `Date.now()` thêm vào ba tuần trước.
 *
 * Rủi ro (design §4, điểm 15/25): xác suất 3, tác động 5.
 *
 * ĐỐI CHỨNG DƯƠNG NẰM TRONG CHÍNH SCRIPT
 * ---------------------------------------
 * Mỗi lần chạy, script tự kiểm nó BẮT được tập mẫu vi phạm đã biết và KHÔNG kêu
 * trên tập mẫu sạch đã biết — TRƯỚC khi quét cây. Tự kiểm hỏng thì thoát 2 và
 * không quét gì cả. Một cổng không tự chứng minh được là nó biết kêu thì chỉ là
 * trang trí (`rules/green-that-proves-nothing.md`).
 *
 * VÌ SAO BỎ QUA CHÚ THÍCH, VÀ VÌ SAO ĐIỀU ĐÓ CẦN THIẾT
 * -----------------------------------------------------
 * `git/hash.ts` và `core/layout/dag-layout.ts` **giải thích** vì sao chúng không
 * dùng `Math.random`, nên chuỗi đó xuất hiện trong chú thích của chính những
 * file tuân thủ tốt nhất. Một cổng grep thô sẽ kêu oan đúng vào đó, và một cổng
 * mà 100% đầu ra là báo động giả thì bị tắt trong hai tuần — đúng số phận của
 * bản grep một dòng mà `check-design-tokens.mjs` đã thay thế.
 *
 * VÙNG QUÉT
 * ---------
 * `packages/games/src/git/**` là vùng BẮT BUỘC. `packages/games/src/core/layout/**`
 * cố ý NẰM NGOÀI: lane layout đã bù bằng một test hành vi (thay `Date.now`/
 * `Math.random` bằng bản ném lỗi rồi chạy `layoutDag`), và test đó mạnh hơn grep
 * vì nó bắt được cả lời gọi gián tiếp. Ghi ra đây để người sau không tưởng là
 * quên.
 *
 * Dùng:
 *   node scripts/check-git-determinism.mjs              # tự kiểm rồi quét cây
 *   node scripts/check-git-determinism.mjs --self-test  # chỉ tự kiểm
 *
 * Mã thoát: 0 sạch · 1 có vi phạm · 2 tự kiểm hỏng / sai cấu hình.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');

const ROOT = 'packages/games/src/git';
const SCAN_EXT = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.turbo', 'dist']);

/**
 * File test ĐƯỢC PHÉP gọi cả hai — và đó không phải một lỗ hổng.
 *
 * `determinism.jsdom.test.ts` **thay** `Date.now` và `Math.random` bằng bản ném
 * lỗi để chứng minh engine không chạm chúng. Cổng này mà cấm luôn file test thì
 * chính phép đo mạnh nhất của điều kiện J.2 không viết được nữa.
 */
const IS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

const RULES = [
  {
    id: 'dong-ho-that',
    why: 'đồng hồ treo tường — thời gian phải là logicalTime truyền vào từ chỗ gọi',
    src: String.raw`\bDate\s*\.\s*now\s*\(|\bnew\s+Date\s*\(|\bperformance\s*\.\s*now\s*\(`,
  },
  {
    id: 'ngau-nhien-khong-hat-giong',
    why: 'ngẫu nhiên không hạt giống — phải đi qua core/rng.ts',
    src: String.raw`\bMath\s*\.\s*random\s*\(|\bcrypto\s*\.\s*getRandomValues\s*\(|\bcrypto\s*\.\s*randomUUID\s*\(`,
  },
  {
    id: 'lap-khong-sap',
    why: 'lặp trên Record mà không qua deterministic.ts — thứ tự khoá chuỗi là thứ tự CHÈN',
    // `for (const k in x)` là dạng duy nhất KHÔNG có đường sắp xếp xen vào.
    // `Object.keys(x)` thì có (`.sort()` ngay sau), nên không bắt ở đây — bắt nó
    // sẽ kêu oan trên chính `deterministic.ts`.
    src: String.raw`\bfor\s*\(\s*(?:const|let|var)\s+\w+\s+in\s+`,
  },
];

const COMPILED = RULES.map((r) => ({ ...r, re: new RegExp(r.src, 'gu') }));

/**
 * Sổ cái miễn trừ HAI CHIỀU, cùng khuôn `check-design-tokens.mjs`.
 *
 *   • chiều lên  — file vi phạm mà KHÔNG có trong sổ ⇒ đỏ.
 *   • chiều xuống — file trong sổ mà nay đã SẠCH ⇒ cũng đỏ, và việc phải làm là
 *     XOÁ dòng đó, không phải thêm vi phạm lại cho khớp sổ.
 */
const KNOWN_ALLOWED = [
  // ✅ 2026-09-14 — `packages/games/src/git/deterministic.ts` ĐÃ ĐƯỢC XOÁ khỏi sổ
  // này ngay trong lần chạy đầu tiên, và đó chính là chiều-xuống hoạt động.
  // Nó được miễn trước vì tôi tưởng luật `lap-khong-sap` sẽ kêu ở đó; luật ấy
  // chỉ bắt `for...in`, còn file đó dùng `Object.keys(...).sort(compareKeys)` —
  // tức nó SẠCH, và dòng miễn trừ không gác gì cả.
  //
  // Bài học ghi lại vì nó là chỗ dễ sai: một dòng miễn trừ viết theo phỏng đoán
  // trông y hệt một dòng miễn trừ cần thiết, và không có chiều-xuống thì nó nằm
  // đó mãi, che một file mà ngày nào đó THẬT SỰ vi phạm.
];

/**
 * ⚠ Tự cắt khoảng trắng, KHÔNG giả định chỗ gọi đã cắt.
 *
 * Bản đầu nhận `trimmed` và tin vào tên tham số. Đối chứng dương bắt ngay lần
 * chạy đầu tiên: một dòng chú thích JSDoc thật (`' * Vì sao...'`) có khoảng
 * trắng đầu dòng, nên `startsWith('*')` trả false và `hash.ts` sẽ bị kêu oan ở
 * đúng chỗ nó GIẢI THÍCH vì sao không dùng `Math.random`.
 *
 * Đây là lý do đối chứng dương phải chạy trên dữ liệu có hình dạng THẬT, không
 * phải trên dữ liệu đã được làm sạch cho vừa hàm.
 */
function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--')
  );
}

function scanText(text) {
  const hits = [];
  const lines = text.normalize('NFC').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || isCommentLine(trimmed)) continue;
    for (const rule of COMPILED) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(raw)) !== null) {
        hits.push({ line: i + 1, col: m.index + 1, rule: rule.id, why: rule.why, match: m[0], text: trimmed });
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

// ─────────────────────────────────────────────────────────── đối chứng
//
// BẨN: phải bị bắt. Bốn dòng đầu là hình dạng THẬT mà một người vội sẽ gõ.
const DIRTY = [
  ['epoch-truc-tiep', 'const now = Date.now();'],
  ['new-date', 'const stamp = new Date().toISOString();'],
  ['performance', 'const t = performance.now();'],
  ['math-random', 'const seed = Math.random() * 1000;'],
  ['crypto-uuid', "const id = crypto.randomUUID();"],
  ['crypto-bytes', 'crypto.getRandomValues(buf);'],
  ['for-in', 'for (const key in repo.refs) {'],
  ['co-khoang-trang', 'const now = Date . now ();'],
];

// SẠCH: KHÔNG được kêu. Bốn dòng đầu là mã THẬT trong cây hôm nay.
const CLEAN = [
  ['const oid = hashObject(makeBlob(lines));'],
  ['for (const [path, value] of sortedEntries(spec.changes ?? {})) {'],
  ['const next = seedRng(seed);'],
  ['logicalTime: index + 1,'],
  ['const d = new DataView(buf);'],
  ['for (const entry of tree.entries) out[entry.path] = entry.oid;'],
  ['const updated = Object.keys(record).sort(compareKeys);'],
  // `randomUUID` là một chuỗi con của `pseudoRandomUUID`? Không — mẫu có `\b`
  // ở `crypto`, nên một hàm tự viết tên khác không bị kêu.
  ['const id = deterministicId(oid);'],
];

function selfTest() {
  const fails = [];

  for (const [tag, lineText] of DIRTY) {
    if (scanText(lineText).length === 0) fails.push(`BẨN KHÔNG BỊ BẮT  [${tag}]  ${lineText}`);
  }
  for (const [lineText] of CLEAN) {
    const hits = scanText(lineText);
    if (hits.length) fails.push(`SẠCH BỊ KÊU OAN  [${hits[0].rule} khớp "${hits[0].match}"]  ${lineText}`);
  }

  // Đối chứng cho CHÍNH bộ lọc chú thích. Không có hai dòng này thì một
  // `isCommentLine` luôn-trả-true sẽ làm mọi mẫu DIRTY đi qua trong im lặng.
  if (isCommentLine('const now = Date.now();')) {
    fails.push('BỘ LỌC CHÚ THÍCH nuốt cả dòng mã thường — mọi mẫu BẨN ở trên trở nên vô nghĩa');
  }
  if (!isCommentLine(' * Vì sao không dùng Math.random: ...')) {
    fails.push('BỘ LỌC CHÚ THÍCH không nhận ra dòng `*` — hash.ts và dag-layout.ts sẽ bị kêu oan');
  }

  const total = DIRTY.length + CLEAN.length + 2;
  if (fails.length) {
    console.error('✗ ĐỐI CHỨNG HỎNG — cổng không chứng minh được là nó biết kêu:\n');
    for (const f of fails) console.error(`   ${f}`);
    console.error(`\n${fails.length}/${total} mẫu sai. Sửa RULES trong ${relative(REPO, SELF)}.`);
    console.error('KHÔNG nới mẫu để dập báo động — sửa cho đúng, rồi thêm dòng vào CLEAN.');
    return false;
  }
  console.log(
    `✓ đối chứng: bắt đủ ${DIRTY.length} mẫu phá tất định, không kêu trên ${CLEAN.length} mẫu sạch ` +
      `(gồm 4 dòng mã thật trong cây), và bộ lọc chú thích được kiểm hai chiều.`,
  );
  return true;
}

// ─────────────────────────────────────────────────────────────── main
const onlySelfTest = process.argv.includes('--self-test');

if (!selfTest()) process.exit(2);
if (onlySelfTest) process.exit(0);

const rootAbs = join(REPO, ROOT);
if (!existsSync(rootAbs)) {
  console.error(`LỖI CẤU HÌNH: vùng quét không tồn tại: ${ROOT}`);
  console.error('Thư mục bị đổi tên/di chuyển ⇒ sửa ROOT trong scripts/check-git-determinism.mjs.');
  console.error('Thiếu vùng quét thì cổng vẫn XANH vì không còn gì để quét — đó là một cái xanh giả.');
  process.exit(2);
}

const hits = [];
const seenAllowed = new Set();
let files = 0;

for (const abs of walk(rootAbs)) {
  const rel = relative(REPO, abs).split('\\').join('/');
  if (!SCAN_EXT.has(extname(abs).toLowerCase())) continue;
  if (IS_TEST_FILE.test(abs)) continue;
  files++;
  const fileHits = scanText(readFileSync(abs, 'utf8'));
  if (fileHits.length === 0) continue;
  if (KNOWN_ALLOWED.some((e) => e.file === rel)) {
    seenAllowed.add(rel);
    continue;
  }
  for (const h of fileHits) hits.push({ ...h, file: rel });
}

const stale = KNOWN_ALLOWED.filter((e) => !seenAllowed.has(e.file)).map((e) => e.file);

if (hits.length === 0 && stale.length === 0) {
  console.log(
    `✓ engine Git tất định — đã quét ${files} file trong ${ROOT}, ` +
      `${seenAllowed.size} file được miễn trừ có ghi lý do.`,
  );
  process.exit(0);
}

if (hits.length > 0) {
  console.error(`\n✗ ${hits.length} chỗ phá tính tất định của engine (§17.J.2):\n`);
  for (const h of hits) {
    console.error(`   ${h.file}:${h.line}:${h.col}  [${h.rule}] khớp "${h.match}"`);
    console.error(`      ${h.text.slice(0, 140)}`);
    console.error(`      ${h.why}`);
  }
  console.error('\nThời gian là `logicalTime` truyền vào từ chỗ gọi. Ngẫu nhiên đi qua');
  console.error('`core/rng.ts` có hạt giống. Lặp trên Record đi qua `git/deterministic.ts`.');
  console.error('Hỏng điều này thì verdict của client khác verdict của server, và người chơi');
  console.error('bị từ chối một bài họ giải đúng — xem đầu file để biết vì sao nó không tự đỏ.');
}

if (stale.length > 0) {
  console.error(`\n✗ ${stale.length} dòng miễn trừ đã HẾT HẠN trong KNOWN_ALLOWED:\n`);
  for (const f of stale) console.error(`   ${f}`);
  console.error('\nFile này nay đã sạch. Đó là TIN MỪNG: XOÁ dòng đó khỏi KNOWN_ALLOWED.');
  console.error('Tuyệt đối không thêm vi phạm lại cho "khớp sổ cái" — sổ cái không có chiều');
  console.error('xuống thì nó là một nghĩa địa.');
}

process.exit(1);
