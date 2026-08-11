// @ts-check
/**
 * F3 — sinh `src/assets/dlp-terminal-nf.woff2` từ Nerd Font gốc.
 *
 * Chạy TAY khi cần nâng version font, KHÔNG chạy trong CI: kết quả được commit
 * vào repo. Lý do là hermetic build — CI và `next build` không được phụ thuộc
 * một release GitHub còn sống. Cùng lý lẽ với "theme oh-my-posh là tài sản của
 * repo, không phải asset tải về" ở 1.E-1.
 *
 *   node scripts/build-font.mjs
 *
 * ## Vì sao bản Mono
 * `CaskaydiaCoveNerdFontMono-*` ép MỌI glyph (kể cả icon) về đúng một ô. Bản
 * không-Mono vẽ icon rộng 2 ô, trong khi phía server `wcwidth` tính PUA là 1 —
 * hai bên lệch nhau đúng một cột mỗi icon, và prompt oh-my-posh sẽ trôi dần.
 *
 * `CaskaydiaCove` là tên Nerd Fonts đặt cho **Cascadia Code** đã vá glyph (dự án
 * không được phép phát hành lại dưới tên gốc). Asset là `CascadiaCode.tar.xz`,
 * KHÔNG phải `CascadiaMono.tar.xz` — bản Mono-của-Microsoft là một font khác
 * (đã bỏ ligature ở nguồn), còn hậu tố `Mono` mà ta cần là hậu tố NerdFont
 * (bề rộng icon), nằm sẵn trong archive của CascadiaCode.
 *
 * ## Vì sao chỉ Regular, không Bold
 * Bộ PUA đầy đủ tốn ~635 KB mỗi face. Ship thêm Bold là gấp đôi để đổi lấy một
 * khác biệt mà trình duyệt tự tổng hợp được (faux bold) trên monospace. Khai
 * đúng MỘT `@font-face` ở `font-weight: normal` còn tránh được bẫy phủ-glyph
 * lệch nhau: nếu face Bold thiếu một icon mà face Regular có, trình duyệt rơi
 * xuống font TIẾP THEO trong stack chứ không rơi về Regular cùng họ — tức chữ
 * đậm và chữ thường hiện hai kiểu icon khác nhau.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import subsetFont from 'subset-font';

const RELEASE = 'v3.5.0';
const ASSET = 'CascadiaCode.tar.xz';
const DOWNLOAD_URL = `https://github.com/ryanoasis/nerd-fonts/releases/download/${RELEASE}/${ASSET}`;
/**
 * Tự tính 2026-08-11. Nerd Fonts **không publish checksum cho từng asset**, nên
 * đây là trust-on-first-use — GIỐNG HỆT trường hợp `fastfetch` ở 1.E-1, và cùng
 * hệ quả: nâng `RELEASE` thì phải tính lại bằng tay và ghi lại ngày.
 */
const SHA256 = 'f30f67f203f9da78df857ebe558321bdfd8fc313662c72fd9e9fef9d4f4c96e7';
const FACE = 'CaskaydiaCoveNerdFontMono-Regular.ttf';

/**
 * Dải codepoint được giữ. Mỗi dải phải có LÝ DO — subset là nơi một dòng thừa
 * tốn hàng trăm KB trên đường tải của mọi sinh viên.
 */
const RANGES = [
  [0x0020, 0x00ff], // Latin-1: chữ + dấu câu ASCII và Tây Âu
  [0x0100, 0x017f], // Latin Extended-A: tiếng Việt KHÔNG nằm ở đây, xem 0x1ea0
  [0x0300, 0x036f], // dấu kết hợp — tiếng Việt tổ hợp (NFD) cần dải này
  [0x1ea0, 0x1ef9], // Latin Extended Additional: ạ ả ấ ầ … — chữ Việt dựng sẵn (NFC)
  [0x2000, 0x206f], // dấu câu chung, kể cả – — … và zero-width
  [0x20a0, 0x20bf], // ký hiệu tiền tệ, có ₫
  [0x2190, 0x21ff], // mũi tên — oh-my-posh, git status
  [0x2500, 0x257f], // box drawing — khung của tmux/eza tree
  [0x2580, 0x259f], // block elements — thanh tiến trình dạng ký tự
  [0x25a0, 0x25ff], // hình khối — bullet, tam giác
  [0x2600, 0x27bf], // ký hiệu linh tinh + dingbat (có ❯ 0x276f của theme)
  [0xe000, 0xf8ff], // PUA — TOÀN BỘ icon Nerd Font mà eza/oh-my-posh phát
];

/**
 * CỐ Ý BỎ dải plane 15 (`U+F0001–U+F1AF0`, Material Design Icons của Nerd Fonts
 * v3). Đo được trên CHÍNH face này: thêm nó đẩy file từ **635 KB lên 1063 KB**
 * (+428 KB, +67%).
 * Không thứ gì trong image sandbox phát ra dải này — `etc/dlp.omp.json` dùng 8
 * codepoint và cả 8 đều < U+F8FF, còn bảng icon của `eza` nằm trọn trong PUA.
 * Ngày nào có theme dùng tới nó thì thêm dải này lại và đo lại size.
 */

function buildCharset() {
  let text = '';
  for (const [start, end] of RANGES) {
    for (let cp = start; cp <= end; cp++) {
      text += String.fromCodePoint(cp);
    }
  }
  return text;
}

async function main() {
  const work = join(tmpdir(), `dlp-font-${RELEASE}`);
  await mkdir(work, { recursive: true });
  const archive = join(work, ASSET);

  console.warn(`[font] tải ${DOWNLOAD_URL}`);
  const response = await fetch(DOWNLOAD_URL);
  if (!response.ok) {
    throw new Error(`tải font thất bại: HTTP ${String(response.status)}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());

  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== SHA256) {
    // NÉM chứ không cảnh báo: một archive lệch checksum là archive không rõ
    // nguồn gốc, và nó sẽ được nhúng vào mọi trang session của sinh viên.
    throw new Error(`sha256 lệch:\n  chờ: ${SHA256}\n  nhận: ${digest}`);
  }
  await writeFile(archive, bytes);
  console.warn(`[font] sha256 khớp (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);

  // Đường dẫn TƯƠNG ĐỐI + `cwd`, KHÔNG truyền path tuyệt đối cho tar: GNU tar
  // đọc `C:\...` như một host từ xa (dấu hai chấm là cú pháp `host:path`) và
  // chết với "Cannot connect to C: resolve failed" trên Windows. `--force-local`
  // chữa được nhưng là cờ riêng của GNU tar — bsdtar không có, nên nó chỉ dời
  // chỗ vỡ sang máy khác.
  execFileSync('tar', ['-xJf', ASSET, FACE, 'LICENSE'], { cwd: work, stdio: 'inherit' });

  const source = await readFile(join(work, FACE));
  const subset = await subsetFont(source, buildCharset(), { targetFormat: 'woff2' });

  const assets = new URL('../src/assets/', import.meta.url);
  await mkdir(assets, { recursive: true });
  await writeFile(new URL('dlp-terminal-nf.woff2', assets), subset);
  // OFL bắt buộc phát hành kèm giấy phép — kể cả với bản subset. Archive của
  // Cascadia đặt tên file là `LICENSE` (JetBrains dùng `OFL.txt`) — đổi nguồn font
  // thì phải đổi cả tên này, nếu không `tar` chết ở bước giải nén.
  await writeFile(new URL('LICENSE.txt', assets), await readFile(join(work, 'LICENSE')));

  await rm(work, { recursive: true, force: true });
  console.warn(
    `[font] xong: src/assets/dlp-terminal-nf.woff2 — ${(subset.length / 1024).toFixed(0)} KB ` +
      `(gốc ${(source.length / 1024).toFixed(0)} KB)`,
  );
}

await main();
