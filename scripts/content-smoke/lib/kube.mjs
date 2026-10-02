/**
 * Mọi lời gọi `kubectl` của harness. Một chỗ, để thông điệp lỗi hạ tầng có cùng
 * hình dạng và để không file nào tự dựng argv.
 */
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export const NS = 'dlp-content-smoke';
export const CONTAINER = 'sandbox';
export const MANAGED_BY = 'dlp-content-smoke';

/**
 * kubectl 1.36 trên Windows đôi khi chết NGAY LÚC KHỞI ĐỘNG: `fatal error:
 * unexpected signal` trong GC mark worker, khi `NewKubectlCommand` đang liệt kê
 * plugin trên PATH (đo 2026-10-03, lượt smoke đầu tiên của fixture). Hai lớp:
 *
 * 1. `GOGC=off` cho tiến trình kubectl — đời của nó tính bằng giây, bộ nhớ nhỏ,
 *    nên tắt GC là bỏ hẳn đường đi tới chỗ hỏng.
 * 2. Thử lại — CHỈ khi stack cho thấy kubectl chết TRƯỚC khi gửi request
 *    (`NewKubectlCommand`), nên script chưa chạy dòng nào và chạy lại là an toàn.
 *    Chết ở chỗ khác thì KHÔNG thử lại: script có thể đã chạy một nửa.
 */
const KUBECTL_ENV = { ...process.env, GOGC: 'off' };
const STARTUP_CRASH = /^fatal error:[\s\S]*NewKubectlCommand/m;
const MAX_STARTUP_RETRIES = 2;

/** Dòng đầu của một panic Go — đủ để đọc, không đổ 500 dòng goroutine vào báo cáo. */
const shortErr = (text) => {
  const t = text.trim();
  return /^fatal error:|^panic:/m.test(t) ? `kubectl crash: ${t.split('\n')[0]}` : t.slice(0, 500);
};

/** Chạy kubectl, trả { code, stdout, stderr }. Không ném khi exit ≠ 0 — caller quyết. */
export async function kubectl(args, opts = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const r = await kubectlOnce(args, opts);
    if (r.code === 0 || attempt >= MAX_STARTUP_RETRIES || !STARTUP_CRASH.test(r.stderr)) return r;
  }
}

function kubectlOnce(args, { input, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn('kubectl', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: KUBECTL_ENV });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => err.push(Buffer.from(String(e))));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? null : code,
        timedOut,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

/** kubectl phải thành công; ném kèm stderr nếu không. */
export async function kubectlOk(args, opts) {
  const r = await kubectl(args, opts);
  if (r.code !== 0) {
    const why = r.timedOut ? 'quá hạn' : `exit ${r.code}`;
    throw new Error(`kubectl ${args.join(' ')} — ${why}: ${shortErr(r.stderr || r.stdout)}`);
  }
  return r.stdout;
}

export async function kubectlJson(args, opts) {
  return JSON.parse(await kubectlOk([...args, '-o', 'json'], opts));
}

/** Bản đồng bộ — CHỈ dùng trong handler thoát, nơi không còn event loop để chờ. */
export function kubectlSync(args) {
  return spawnSync('kubectl', args, { stdio: 'ignore', windowsHide: true, timeout: 30_000, env: KUBECTL_ENV });
}

const TERMINATED = /\n?command terminated with exit code (\d+)\s*$/;

/**
 * Lượt exec ONE-SHOT, đúng khuôn gateway (`podexec/oneshot.go`): `bash` đọc
 * script từ STDIN, không TTY, stdout+stderr gộp chung theo thứ tự tới.
 *
 * Kết quả tách hai loại hỏng như `validate.ts`: `exitCode` = script chạy xong
 * với mã đó (kể cả ≠ 0 — đó là "chưa đạt", không phải lỗi); `infraError` = lượt
 * exec không chạy được hoặc quá hạn. Trộn hai thứ đó là đọc "cụm hỏng" thành
 * "bài sai".
 */
export async function execScript(pod, script, opts = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const r = await execOnce(pod, script, opts);
    if (r.startupCrash !== true || attempt >= MAX_STARTUP_RETRIES) {
      delete r.startupCrash;
      return r;
    }
  }
}

function execOnce(pod, script, { timeoutMs = 120_000 } = {}) {
  const args = ['exec', '-i', '-n', NS, pod, '-c', CONTAINER, '--', 'bash'];
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn('kubectl', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: KUBECTL_ENV });
    const merged = [];
    const errOnly = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (d) => merged.push(d));
    child.stderr.on('data', (d) => {
      merged.push(d);
      errOnly.push(d);
    });
    child.on('error', (e) => errOnly.push(Buffer.from(String(e))));
    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Math.round(performance.now() - started);
      let output = Buffer.concat(merged).toString('utf8');
      const stderr = Buffer.concat(errOnly).toString('utf8');
      if (timedOut) {
        resolve({ exitCode: null, output, durationMs, infraError: `quá hạn ${timeoutMs / 1000}s` });
        return;
      }
      if (code === 0) {
        resolve({ exitCode: 0, output, durationMs, infraError: null });
        return;
      }
      const m = TERMINATED.exec(stderr);
      if (m !== null) {
        output = output.replace(TERMINATED, '');
        resolve({ exitCode: Number(m[1]), output, durationMs, infraError: null });
        return;
      }
      resolve({
        exitCode: null,
        output: STARTUP_CRASH.test(stderr) ? '' : output,
        durationMs,
        infraError: `kubectl exit ${code}: ${shortErr(stderr)}`,
        startupCrash: STARTUP_CRASH.test(stderr),
      });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(script);
  });
}

/** Script ghi một file vào pod. base64 để nội dung không có lớp trích dẫn nào để hỏng. */
export function writeFileScript(filePath, content, mode = '0644') {
  const b64 = Buffer.from(content, 'utf8').toString('base64');
  const dir = filePath.slice(0, filePath.lastIndexOf('/')) || '/';
  return [
    'set -eu',
    `mkdir -p '${dir}'`,
    `printf %s '${b64}' | base64 -d > '${filePath}'`,
    `chmod ${mode} '${filePath}'`,
    '',
  ].join('\n');
}
