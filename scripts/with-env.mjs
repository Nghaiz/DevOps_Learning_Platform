#!/usr/bin/env node
/**
 * Chạy một lệnh với biến môi trường nạp từ file .env — KHÔNG qua shell.
 *
 *   node scripts/with-env.mjs <file.env> [--except <regex>] -- <lệnh> [args...]
 *
 * VÌ SAO KHÔNG DÙNG `set -a; . ./file` HAY `eval`: cả hai đều đưa nội dung file
 * cho shell THỰC THI. Một dòng `FOO=$(rm -rf ~)` hay `FOO=`whoami`` trong file
 * env sẽ chạy thật. Với `.github/ci.env` — file NẰM TRONG GIT, tức có thể bị đổi
 * bởi một PR — đó là đường chạy lệnh tuỳ ý trên máy người chạy `make test-ci`.
 * (Copilot code review chỉ ra ở PR #2.)
 *
 * Bonus không nhỏ: parser này xử lý đúng giá trị có dấu cách, dấu `#`, hoặc dấu
 * nháy — những thứ làm `. ./.env` hiểu sai trong im lặng. Mật khẩu có ký tự đặc
 * biệt là trường hợp thật, không phải giả định.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep === -1 || sep === 0) {
  console.error(
    'Dùng: node scripts/with-env.mjs <file.env> [--except <regex>] -- <lệnh> [args...]',
  );
  process.exit(2);
}

const opts = argv.slice(0, sep);
const [envFile, ...rest] = opts;
const exceptIdx = rest.indexOf('--except');
const exceptRe = exceptIdx === -1 ? null : new RegExp(rest[exceptIdx + 1]);
const [cmd, ...args] = argv.slice(sep + 1);

if (!existsSync(envFile)) {
  console.error(`Thiếu ${envFile}`);
  // .env.example nào là bản mẫu của file này — chỉ đúng đường thay vì bắt đi tìm.
  const example = envFile.endsWith('.env') ? `${envFile}.example` : null;
  if (example && existsSync(example))
    console.error(`  Chạy: cp ${example} ${envFile}  rồi điền giá trị`);
  process.exit(1);
}

/**
 * Parse KEY=VALUE thuần văn bản. Không expand biến, không command substitution,
 * không nối dòng — cố ý: file env là DỮ LIỆU, không phải script.
 */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Bóc nháy bao ngoài nếu có. Giá trị không nháy giữ nguyên mọi thứ kể cả
    // dấu '#' — comment cuối dòng KHÔNG được hỗ trợ, vì mật khẩu chứa '#' phổ
    // biến hơn nhiều so với nhu cầu ghi chú cuối dòng gán.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

const parsed = parseEnv(readFileSync(envFile, 'utf8'));
const applied = [];
const skipped = [];
for (const [k, v] of Object.entries(parsed)) {
  if (exceptRe?.test(k)) {
    skipped.push(k);
    continue;
  }
  process.env[k] = v;
  applied.push(k);
}

console.log(
  `[with-env] ${envFile}: nạp ${applied.length} biến${skipped.length ? `, bỏ qua ${skipped.length} (--except): ${skipped.join(', ')}` : ''}`,
);

/**
 * Ưu tiên `shell: false`, dùng shell chỉ khi Windows bắt buộc.
 *
 * LÀM RÕ VỀ BẢO MẬT — `shell: true` ở ĐÂY không mở lại lỗ mà file này sinh ra để
 * đóng. Lỗ đó nằm ở `eval`/`source`, nơi NỘI DUNG FILE ENV trở thành mã shell.
 * Ở đây giá trị env đi qua tham số `env:` của spawn, không bao giờ nằm trên dòng
 * lệnh — shell chỉ thấy lệnh và đối số do Makefile viết ra. Cái mất khi bật shell
 * chỉ là ĐỘ TRUNG THỰC CỦA ĐỐI SỐ: cmd phân tích lại, nên đối số có dấu cách hay
 * xuống dòng bị xé (`node -e "<script nhiều dòng>"` gãy — bắt được lúc test).
 *
 * Vì sao vẫn cần shell trên Windows: Node 20+ TỪ CHỐI spawn file .cmd/.bat khi
 * shell:false (EINVAL — vá cho CVE-2024-27980), mà `pnpm` chính là pnpm.cmd.
 */
function run(command, argv) {
  const isWin = process.platform === 'win32';
  const candidates =
    isWin && !/\.(cmd|bat|exe)$/i.test(command)
      ? [command, `${command}.exe`, `${command}.cmd`, `${command}.bat`]
      : [command];

  for (const c of candidates) {
    // Trên Windows, .cmd/.bat BUỘC phải qua shell — mọi cái khác thì không.
    const needsShell = isWin && /\.(cmd|bat)$/i.test(c);
    const res = spawnSync(c, argv, { stdio: 'inherit', env: process.env, shell: needsShell });
    if (res.error && (res.error.code === 'ENOENT' || res.error.code === 'EINVAL')) continue;
    if (res.error) {
      console.error(`[with-env] không chạy được ${c}: ${res.error.message}`);
      return 1;
    }
    return res.status ?? 1;
  }
  console.error(`[with-env] không tìm thấy lệnh: ${command}`);
  return 127;
}

process.exit(run(cmd, args));
