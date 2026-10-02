/**
 * Terminal của người học, lái từ ngoài.
 *
 * Sản phẩm gõ khối `{{exec}}` vào MỘT tmux (`tmux new-session -A -s dlp -c /root`,
 * shell zsh — `use-workspace-tabs.ts` gửi `${command}\n`, `lesson-client.tsx` gửi
 * `${foreground}\r`). cwd, biến export, job nền sống qua các khối và các bước.
 * Harness dựng đúng session đó trong pod rồi gõ bằng `tmux send-keys -l`, nên
 * mọi thứ của shell thật — TTY cho `docker exec -it`, typeahead, heredoc nhiều
 * dòng, lỗi cú pháp zsh — đều có mặt.
 *
 * ## Biết lúc nào khối chạy xong mà KHÔNG gõ thêm gì
 *
 * Gõ một dòng "đánh dấu xong" sau khối là sai: nó nằm trong typeahead và bị
 * chính khối nuốt mất (`docker exec -it` đọc stdin), hoặc chạy chen giữa hai
 * dòng của khối. Thay vào đó harness cài một widget `zle-line-init`: zle gọi nó
 * mỗi lần bắt đầu đọc một dòng mới, và widget chỉ tăng bộ đếm khi KHÔNG còn
 * byte nào chờ (`$PENDING == 0`) và không ở dòng nối tiếp (`$PREBUFFER` rỗng) —
 * tức shell đang thật sự rảnh ở dấu nhắc. Mã thoát lấy ở `precmd`.
 */
import { CONTAINER, NS, execScript, writeFileScript } from './kube.mjs';

const DIR = '/root/.dlp-smoke';
const IDLE_FILE = `${DIR}/idle`;
const HOOK_FILE = `${DIR}/hook.zsh`;
const SESSION = 'dlp';
const CAPTURE_MARK = '--dlp-smoke-capture--';

const HOOK = `# dlp content-smoke: báo "shell rảnh" qua ${IDLE_FILE}
typeset -gi __dlp_smoke_seq=0 __dlp_smoke_rc=0
__dlp_smoke_precmd() { __dlp_smoke_rc=$? }
precmd_functions=(__dlp_smoke_precmd \${precmd_functions:#__dlp_smoke_precmd})
__dlp_smoke_line_init() {
  (( PENDING == 0 )) || return 0
  [[ -z $PREBUFFER ]] || return 0
  (( __dlp_smoke_seq++ ))
  print -r -- "$__dlp_smoke_seq $__dlp_smoke_rc $PWD" >| ${IDLE_FILE}.part && command mv -f ${IDLE_FILE}.part ${IDLE_FILE}
}
autoload -Uz add-zle-hook-widget
add-zle-hook-widget line-init __dlp_smoke_line_init
`;

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/** Bỏ khoảng trắng cuối dòng (thanh trạng thái oh-my-posh độn tới 200 cột). */
const tidy = (text) =>
  text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

/** Vị trí tuyệt đối của con trỏ trong lịch sử pane: history_size + cursor_y. */
const POS = `tmux display -p -t ${SESSION} '#{history_size} #{cursor_y}'`;

/** Script bash chờ seq > prev; in dòng idle, rồi (tuỳ chọn) text pane từ dòng `from`. */
function waitScript(prev, timeoutS, from) {
  const lines = [
    `end=$((SECONDS + ${timeoutS})); rc=3; line=`,
    'while :; do',
    `  if [ -f ${IDLE_FILE} ]; then read -r s rest < ${IDLE_FILE}; ` +
      `if [ "\${s:-0}" -gt ${prev} ]; then line="$s $rest"; rc=0; break; fi; fi`,
    '  [ $SECONDS -ge $end ] && break',
    '  sleep 0.1',
    'done',
    'echo "$line"',
  ];
  if (from !== null) {
    lines.push(
      `echo '${CAPTURE_MARK}'`,
      `read -r hs cy <<< "$(${POS})"`,
      `tmux capture-pane -p -J -t ${SESSION} -S "$((${from} - hs))" -E "$cy"`,
    );
  }
  lines.push('exit $rc');
  return lines.join('\n');
}

export class Terminal {
  /** `agent` (tuỳ chọn): kênh exec bền của `agent.mjs`; vắng hoặc chết thì exec từng lượt. */
  constructor(pod, agent = null) {
    this.pod = pod;
    this.agent = agent;
  }

  async #exec(script, timeoutMs) {
    const viaAgent = this.agent === null ? null : await this.agent.run(script, { timeoutMs });
    return viaAgent ?? execScript(this.pod, script, { timeoutMs });
  }

  async #run(script, timeoutMs = 30_000) {
    const r = await this.#exec(script, timeoutMs);
    if (r.infraError !== null) throw new Error(`terminal: ${r.infraError}`);
    return r;
  }

  /** Dựng session như gateway (`-c /root`, 200×50 như client FE), cài hook, chờ dấu nhắc đầu. */
  async start() {
    await this.#run(
      [
        writeFileScript(HOOK_FILE, HOOK),
        `rm -f ${IDLE_FILE}`,
        `tmux new-session -d -s ${SESSION} -c /root -x 200 -y 50`,
      ].join('\n'),
    );
    // Chờ zsh vẽ xong dấu nhắc trước khi gõ: input gõ lúc shell còn khởi động
    // có thể bị xả mất (`stty` trong rc file).
    const ready = await this.#run(
      `for i in $(seq 1 100); do c=$(tmux display -p -t ${SESSION} '#{pane_current_command}'); ` +
        `[ "$c" = zsh ] && [ -n "$(tmux capture-pane -p -t ${SESSION} | tr -d '[:space:]')" ] && exit 0; ` +
        'sleep 0.2; done; exit 1',
    );
    if (ready.exitCode !== 0) throw new Error('terminal: zsh không hiện dấu nhắc sau 20s');
    for (const waitS of [15, 30]) {
      // Dấu cách đầu dòng: HIST_IGNORE_SPACE giữ dòng này khỏi lịch sử của người học.
      await this.#send(` source ${HOOK_FILE}`);
      const { idle } = await this.#waitIdle(0, waitS, null);
      if (idle !== null) return;
    }
    throw new Error('terminal: hook zle không cài được (không thấy dấu nhắc rảnh)');
  }

  /** In mốc hiện tại (seq + vị trí con trỏ) rồi chạy `keysScript` — MỘT lượt exec. */
  async #markAndSend(keysScript) {
    const r = await this.#run(
      ['set -eu', `cat ${IDLE_FILE} 2>/dev/null || echo 0 0 /`, POS, keysScript].join('\n'),
    );
    const [idleLine = '0', posLine = '0 0'] = r.output.trim().split('\n');
    const [hs, cy] = posLine.split(' ').map(Number);
    return { seq: Number(idleLine.split(' ')[0]), abs: hs + cy };
  }

  #send(text) {
    return this.#markAndSend(
      [
        `t=$(printf %s '${b64(text)}' | base64 -d)`,
        `tmux send-keys -t ${SESSION} -l -- "$t"`,
        `tmux send-keys -t ${SESSION} Enter`,
      ].join('\n'),
    );
  }

  /** `{ idle: {seq, rc, cwd} | null, output }` — `idle` null khi quá hạn. */
  async #waitIdle(prev, timeoutS, from) {
    const r = await this.#exec(waitScript(prev, timeoutS, from), (timeoutS + 30) * 1000);
    if (r.infraError !== null) throw new Error(`terminal: ${r.infraError}`);
    const at = r.output.indexOf(`${CAPTURE_MARK}\n`);
    const head = at === -1 ? r.output : r.output.slice(0, at);
    const output = at === -1 ? '' : tidy(r.output.slice(at + CAPTURE_MARK.length + 1));
    const m = /^(\d+) (-?\d+) (.*)$/.exec(head.trim());
    const idle = r.exitCode === 0 && m ? { seq: Number(m[1]), rc: Number(m[2]), cwd: m[3] } : null;
    return { idle, output };
  }

  /**
   * Gõ `text` như người học bấm nút chạy, chờ shell rảnh lại.
   * Trả `{ rc, cwd, durationMs, timedOut, output }`.
   */
  async type(text, { interrupt = false, timeoutS = 300 } = {}) {
    const started = Date.now();
    if (interrupt) {
      // Ctrl+C là một sự kiện RIÊNG (như use-workspace-tabs.ts). Ở dấu nhắc rảnh
      // nó sinh một dấu nhắc mới — chờ dấu nhắc đó trước khi gõ lệnh, nếu không
      // mốc seq đọc sau sẽ đua với chính lệnh vừa gõ.
      const mark = await this.#markAndSend(`tmux send-keys -t ${SESSION} C-c`);
      await this.#waitIdle(mark.seq, 5, null);
    }
    const before = await this.#send(text);
    const { idle, output } = await this.#waitIdle(before.seq, timeoutS, before.abs);
    const durationMs = Date.now() - started;
    if (idle === null) {
      // Khối không tự kết thúc (vi phạm C3). Ngắt để bước sau còn một shell dùng được.
      await this.#markAndSend(
        `tmux send-keys -t ${SESSION} C-c; sleep 0.5; tmux send-keys -t ${SESSION} C-c`,
      );
      await this.#waitIdle(before.seq, 10, null);
      return { rc: null, cwd: null, durationMs, timedOut: true, output };
    }
    return { rc: idle.rc, cwd: idle.cwd, durationMs, timedOut: false, output };
  }

  /** Ghi file vào pod (vd. solution.sh) — ngoài terminal. */
  async writeFile(filePath, content) {
    await this.#run(writeFileScript(filePath, content, '0755'));
  }

  /** Lệnh để người debug attach vào ĐÚNG terminal harness đã lái. */
  attachCommand() {
    return `kubectl exec -it -n ${NS} ${this.pod} -c ${CONTAINER} -- tmux attach -t ${SESSION}`;
  }
}

export const SMOKE_DIR = DIR;
