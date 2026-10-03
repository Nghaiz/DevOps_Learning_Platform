/**
 * Kênh exec BỀN cho thao tác NỘI BỘ của harness (gõ phím tmux, chờ dấu nhắc,
 * ghi file) — một tiến trình `kubectl exec` sống suốt lượt smoke thay vì một
 * tiến trình mỗi thao tác.
 *
 * Vì sao: trên máy Windows này mỗi lượt `kubectl exec` tốn ~1.1s (0.37s khởi
 * động kubectl + nâng cấp stream tới kubelet), và một bài học cần ~60 thao tác
 * terminal — tức cả phút chỉ để chờ hạ tầng của chính harness.
 *
 * ⛔ KHÔNG dùng kênh này cho verify hay script setup. Hai thứ đó phải chạy đúng
 * như gateway: một lượt exec riêng, `bash` đọc script từ STDIN — xem
 * `execScript`. Kênh này chỉ chở những gì harness tự viết.
 *
 * Kênh chết (kubectl crash, stream đứt) ⇒ `run` trả `null` và caller rơi về
 * `execScript` từng lượt: chậm hơn, không sai hơn.
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { CONTAINER, KUBECTL_ENV, NS } from './kube.mjs';

const LOOP = `d=/root/.dlp-smoke/agent; mkdir -p "$d"; echo DLP-AGENT-READY
while IFS=' ' read -r id t b64; do
  printf %s "$b64" | base64 -d > "$d/$id.sh"
  ( cd / && timeout -k 5 "$t" bash < "$d/$id.sh" ) > "$d/$id.out" 2>&1
  rc=$?
  printf '%s %s %s\\n' "$id" "$rc" "$(base64 -w0 < "$d/$id.out")"
  rm -f "$d/$id.sh" "$d/$id.out"
done`;

export class PodAgent {
  constructor(pod) {
    this.pod = pod;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.dead = false;
  }

  /** `true` khi kênh sẵn sàng; `false` = không dùng được, caller tự rơi về exec từng lượt. */
  start(timeoutMs = 20_000) {
    return new Promise((resolve) => {
      const args = ['exec', '-i', '-n', NS, this.pod, '-c', CONTAINER, '--', 'bash', '-c', LOOP];
      this.child = spawn('kubectl', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: KUBECTL_ENV });
      const timer = setTimeout(() => this.#die(resolve), timeoutMs);
      this.child.stdout.setEncoding('utf8');
      this.child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let nl;
        while ((nl = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, nl);
          this.buffer = this.buffer.slice(nl + 1);
          if (line === 'DLP-AGENT-READY') {
            clearTimeout(timer);
            resolve(true);
          } else {
            this.#onReply(line);
          }
        }
      });
      this.child.stderr.on('data', () => {});
      this.child.on('error', () => this.#die(resolve));
      this.child.on('close', () => {
        clearTimeout(timer);
        this.#die(resolve);
      });
      this.child.stdin.on('error', () => this.#die(resolve));
    });
  }

  #die(resolveStart) {
    this.dead = true;
    resolveStart?.(false);
    for (const { resolve } of this.pending.values()) resolve(null);
    this.pending.clear();
  }

  #onReply(line) {
    const [id, rc, b64 = ''] = line.split(' ');
    const entry = this.pending.get(id);
    if (entry === undefined) return;
    this.pending.delete(id);
    const durationMs = Math.round(performance.now() - entry.started);
    const output = Buffer.from(b64, 'base64').toString('utf8');
    const exitCode = Number(rc);
    // `timeout` trả 124 khi cắt; chỉ coi là quá hạn khi thời gian thật sự chạm trần.
    if (exitCode === 124 && durationMs >= entry.timeoutS * 1000) {
      entry.resolve({ exitCode: null, output, durationMs, infraError: `quá hạn ${entry.timeoutS}s` });
    } else {
      entry.resolve({ exitCode, output, durationMs, infraError: null });
    }
  }

  /** Cùng hình dạng kết quả với `execScript`, hoặc `null` khi kênh đã chết. */
  run(script, { timeoutMs = 30_000 } = {}) {
    if (this.dead || this.child === null) return Promise.resolve(null);
    const id = String(this.nextId++);
    const timeoutS = Math.ceil(timeoutMs / 1000);
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, started: performance.now(), timeoutS });
      const ok = this.child.stdin.write(`${id} ${timeoutS} ${Buffer.from(script, 'utf8').toString('base64')}\n`);
      if (!ok && this.dead) resolve(null);
    });
  }

  close() {
    if (this.child !== null && !this.dead) {
      this.dead = true;
      this.child.stdin.end();
      this.child.kill();
    }
  }
}
