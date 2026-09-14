/**
 * Harness đo P15 trên cụm thật.
 *
 * Chạy TỪ MÁY DEV. Nó đăng nhập qua đường sản phẩm (Better Auth), rồi gọi đúng
 * các procedure tRPC mà trình duyệt gọi — không có đường tắt nào vào server.
 *
 * Ba phép đo, tương ứng ba ô AC:
 *
 *   quota   — khe ResourceQuota trước/sau MỘT lượt setup hỏng (15.A).
 *   curve   — thời gian lượt `startAttempt` + thời gian tới khi setup xong, ở
 *             nhiều mức load (15.C). Bảng cơ sở nằm ở đầu `phase-15.md`.
 *   refuse  — `checkTask` có TỪ CHỐI chấm trong cửa sổ setup chưa xong không.
 *
 * ⚠ Đọc `load average` 1 phút NGAY TRƯỚC mỗi lượt, không đọc một lần rồi dùng
 * cho cả loạt: tải do chính harness sinh ra cũng trôi, và một con số đọc từ đầu
 * loạt sẽ gán sai mức tải cho các lượt sau.
 *
 * ⚠ Mọi mốc thời gian đo bằng `Date.now()` TRÊN MÁY DEV. Đồng hồ VM lệch ~59s so
 * với Windows (đã đo ở chặng trước), nên TUYỆT ĐỐI không trộn mốc của hai máy
 * trong một phép trừ. Các số dưới đây đều là hiệu của hai mốc cùng máy.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

// Chứng chỉ của cụm lab là self-signed (sslip.io + cert sinh tại chỗ bởi
// `08-tls-entrypoint.sh`). Tắt xác thực cho ĐÚNG tiến trình đo này; không dùng
// `@playwright/test` vì script nằm ngoài `apps/web` nên Node phân giải module
// theo vị trí SCRIPT, không theo cwd.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = process.env.E2E_BASE_URL ?? 'https://dlp.192.168.94.130.sslip.io:30443';
const VM = process.env.VM_SSH ?? 'nghaiz@192.168.94.130';
const OUT = process.env.OUT_DIR ?? '.';

const ssh = (cmd) => execFileSync('ssh', [VM, cmd], { encoding: 'utf8', timeout: 120_000 }).trim();

/** Load average 1 phút trên VM — đọc ngay trước mỗi lượt. */
const load1 = () => Number(ssh("cut -d' ' -f1 /proc/loadavg"));

/** Khe quota ĐANG BỊ CHIẾM trong namespace sandbox. */
function quotaUsed() {
  const raw = ssh(
    'kubectl -n dlp-sandbox get resourcequota -o jsonpath=' +
      "'{.items[0].status.used.pods} {.items[0].status.used.requests\\.memory}'",
  );
  const [pods, memory] = raw.split(/\s+/);
  return { pods: Number(pods), memory };
}

/** Pod sandbox đang sống, bỏ pha terminal (Succeeded/Failed) — xem metric-readings-lag-and-reset. */
const sandboxPods = () =>
  ssh(
    'kubectl -n dlp-sandbox get pods -l app=sandbox ' +
      '--field-selector=status.phase!=Succeeded,status.phase!=Failed ' +
      '-o jsonpath=\'{range .items[*]}{.metadata.name} {.status.phase}{"\\n"}{end}\'',
  )
    .split('\n')
    .filter((l) => l.trim() !== '');

/**
 * Cookie jar tối thiểu: Node `fetch` không có jar, và phiên Better Auth là một
 * cookie. Chỉ giữ `name=value`, bỏ mọi thuộc tính — ta không mô phỏng trình
 * duyệt, chỉ gửi lại đúng thứ server vừa đặt.
 */
const jar = new Map();

function nhanCookie(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

const cookieHeader = () =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function goi(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      // Bắt buộc: Better Auth trả 403 MISSING_OR_NULL_ORIGIN khi thiếu, và
      // `fetch` của Node không tự đặt nó.
      origin: BASE,
      ...(jar.size > 0 ? { cookie: cookieHeader() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  nhanCookie(res);
  return res;
}

async function login() {
  const email = `p15-${Date.now()}@dlp.local`;
  const res = await goi('POST', '/api/auth/sign-up/email', {
    email,
    password: 'p15-measure-Aa1!',
    name: 'P15 measure',
  });
  if (res.status === 429) {
    throw new Error(
      'sign-up trả 429 — rate limit ĐĂNG KÝ của Better Auth (~2-3/phút theo IP), ' +
        'KHÔNG phải cụm quá tải. Chờ một phút rồi chạy lại.',
    );
  }
  if (res.status >= 400) throw new Error(`sign-up HTTP ${res.status}: ${await res.text()}`);
  const coPhien = [...jar.keys()].some((n) => n.includes('session_token'));
  if (!coPhien) {
    throw new Error(
      `Không có cookie phiên sau sign-up (HTTP ${res.status}). Cookie nhận được: ` +
        `${[...jar.keys()].join(', ') || '(rỗng)'}. Tên cookie đã đổi thì sửa ở đây, ` +
        `đừng bỏ phép kiểm — mọi lượt gọi sau sẽ 401 với lý do khó hiểu.`,
    );
  }
  return { email };
}

/** tRPC mutation — shape `{"0":{"json":…}}`; lỗi của server nổi lên thành Error có message thật. */
async function mutate(path, input) {
  const res = await goi('POST', `/api/trpc/${path}?batch=1`, { 0: input });
  const body = await res.text();
  if (res.status >= 400 && body.trim() === '') {
    throw new Error(`${path} HTTP ${res.status}: (thân rỗng)`);
  }
  const parsed = JSON.parse(body);
  if (parsed[0]?.error !== undefined) {
    const e = parsed[0].error;
    throw new Error(`${e.data?.code ?? res.status} — ${e.message ?? JSON.stringify(e)}`);
  }
  return parsed[0].result.data;
}

async function query(path, input) {
  const qs = encodeURIComponent(JSON.stringify({ 0: input }));
  const res = await goi('GET', `/api/trpc/${path}?batch=1&input=${qs}`);
  const body = await res.text();
  const parsed = JSON.parse(body);
  if (parsed[0]?.error !== undefined) {
    const e = parsed[0].error;
    throw new Error(`${e.data?.code ?? res.status} — ${e.message ?? JSON.stringify(e)}`);
  }
  return parsed[0].result.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Phóng N tiến trình ăn CPU trên VM, mỗi cái bọc `timeout` làm lưới an toàn. */
function loadOn(n, seconds) {
  if (n === 0) return;
  ssh(
    `for i in $(seq 1 ${n}); do setsid timeout ${seconds} ` +
      `bash -c 'while :; do :; done' </dev/null >/dev/null 2>&1 & done; true`,
  );
}

function loadOff() {
  // `pkill -f 'while :'` KHÔNG dùng được: nó khớp cả phiên ssh đang chạy chính
  // lệnh đó và tự giết mình (8 lượt exit 255 ở chặng trước đọc ra thành "mất
  // mạng"). Khớp theo tiến trình `timeout` đang bọc vòng lặp thay vì theo vòng lặp.
  try {
    ssh("pkill -x timeout || true");
  } catch {
    /* không có tiến trình nào: không phải lỗi */
  }
}

async function main() {
  const mode = process.argv[2] ?? 'all';
  mkdirSync(OUT, { recursive: true });
  const log = [];
  const say = (o) => {
    console.log(JSON.stringify(o));
    log.push(o);
  };

  const { email } = await login();
  // `session.reap` đòi `userId` tường minh (nó phục vụ cả đường admin), nên lấy
  // id thật từ `me.get` — KHÔNG đoán, và cũng không bỏ bước reap.
  const me = await query('me.get', {});
  say({ step: 'login', email, userId: me.id, base: BASE });

  // ───────────────────────────────────────────── 15.A: khe quota trước/sau
  if (mode === 'all' || mode === 'quota') {
    /*
      Ép MỘT lượt setup hỏng ĐỒNG BỘ trên đường sản phẩm, không sửa nội dung:
      tạo `/root/.dlp-setup` dưới dạng FILE trong mọi pod ấm. Lượt phóng mở đầu
      bằng `mkdir -p /root/.dlp-setup`, nên nó thoát non-zero ở đúng bước mà
      15.A bọc — và nó là một lượt hỏng THẬT (cùng đường mã, cùng câu lỗi), chứ
      không phải một nhánh test.

      Dùng `dlp-linux-triage`: không khai capabilities ⇒ profile mặc định ⇒ claim
      từ warm pool, nên pod bị sabotage đúng là pod sẽ được giao. Lab k8s thì
      LUÔN đi cold path (`pool:free` chỉ chứa pod default-profile) nên sabotage
      không với tới nó.
    */
    const free = sandboxPods().map((l) => l.split(' ')[0]);
    for (const pod of free) {
      ssh(`kubectl -n dlp-sandbox exec ${pod} -- sh -c 'rm -rf /root/.dlp-setup; touch /root/.dlp-setup'`);
    }
    say({ step: 'quota:sabotage', pods: free });

    const truoc = quotaUsed();
    /*
      ⛔ TÊN pod, không phải SỐ pod. `pods: 3 → 3` KHÔNG phân biệt được "đã reap
      rồi warm-pool refill" với "chưa reap gì cả" — warm pool tự bù về
      POOL_TARGET trong vài giây, nên một phép đếm luôn đọc ra 3 ở cả hai ca. Đó
      là đúng lớp false-green vừa cắn một lần ở lượt chạy trước. Tập TÊN thì
      phân biệt được: pod bị thu hồi BIẾN MẤT khỏi tập, bất kể có pod mới nào
      xuất hiện thay nó.
    */
    const tenTruoc = new Set(sandboxPods().map((l) => l.split(' ')[0]));
    say({ step: 'quota:before', ...truoc, sandboxPods: [...tenTruoc] });

    let loi = null;
    const t0 = Date.now();
    try {
      await mutate('labs.startAttempt', {
        labId: 'dlp-linux-triage',
        idempotencyKey: `p15quota${Date.now()}`,
      });
    } catch (e) {
      loi = e.message;
    }
    const duration = Date.now() - t0;
    say({ step: 'quota:startAttempt', durationMs: duration, error: loi });

    /*
      ⛔ ĐỐI CHỨNG: một lượt đọc quota chỉ có nghĩa nếu phiên THẬT SỰ đã được tạo
      rồi thu hồi. Lượt chạy đầu của harness này trả BAD_REQUEST ở tầng validate
      input — không phiên nào được tạo — và quota "không đổi" đọc ra thành
      "khe đã trả lại": một ô xanh không chứng minh gì. Nên câu lỗi phải là câu
      của bước PHÓNG, và pod phải đã từng tồn tại.
    */
    const dungDuongHong = loi !== null && /phóng được script chuẩn bị/.test(loi);
    say({
      step: 'quota:guard',
      dungDuongHong,
      ghiChu: dungDuongHong
        ? 'lỗi đúng là lỗi bước phóng ⇒ phiên đã được tạo rồi thu hồi'
        : 'KHÔNG phải lỗi bước phóng ⇒ phép đo quota VÔ GIÁ TRỊ, đọc lại câu lỗi',
    });

    // KHÔNG chờ: ô AC đòi khe trả lại NGAY, không đợi reaper. Một lượt đọc
    // ngay sau khi request trả về là đúng phép đo đó.
    const sau = quotaUsed();
    const tenSau = new Set(sandboxPods().map((l) => l.split(' ')[0]));
    const daBienMat = [...tenTruoc].filter((n) => !tenSau.has(n));
    const moiXuatHien = [...tenSau].filter((n) => !tenTruoc.has(n));
    say({ step: 'quota:after', ...sau, sandboxPods: [...tenSau] });

    // Dấu của CHÍNH orchestrator, không phải suy luận của harness: dòng log
    // `session đã reap` mang `actor` và thời điểm. Đây là vế độc lập với phép
    // đếm pod — nếu hai vế không đồng ý thì đọc lại, đừng chọn vế đẹp hơn.
    let dauReap = '';
    try {
      dauReap = ssh(
        'kubectl logs deploy/platform-orchestrator --since=90s 2>/dev/null | ' +
          "grep 'session đã reap' | tail -2",
      );
    } catch {
      dauReap = '(không đọc được log)';
    }

    say({
      step: 'quota:verdict',
      hopLe: dungDuongHong,
      podsTruoc: truoc.pods,
      podsSau: sau.pods,
      podBienMat: daBienMat,
      podMoi: moiXuatHien,
      khePhucHoi: dungDuongHong && daBienMat.length === 1,
      dauReapTuOrchestrator: dauReap,
    });
  }

  // ───────────────────────────────────── 15.C: đường cong tải, cùng phương pháp
  if (mode === 'all' || mode === 'curve') {
    const muc = (process.env.LOADS ?? '0,8,20,48').split(',').map(Number);
    for (const n of muc) {
      loadOff();
      await sleep(3000);
      loadOn(n, 240);
      // Chờ load average 1 phút BẮT KỊP số tiến trình vừa phóng. `loadavg` là
      // trung bình trượt, nên đọc ngay sau khi phóng cho một con số của quá khứ.
      await sleep(n === 0 ? 5_000 : 75_000);

      const loadTruoc = load1();
      const t0 = Date.now();
      let attemptId = null;
      let sessionId = null;
      let startErr = null;
      try {
        const r = await mutate('labs.startAttempt', {
          labId: 'dlp-k8s-broken-deploy',
          idempotencyKey: `p15curve${Date.now()}`,
        });
        attemptId = r.attemptId;
        sessionId = r.sessionId;
      } catch (e) {
        startErr = e.message;
      }
      const startMs = Date.now() - t0;

      /*
        `LEGACY=1` — đo ĐƯỜNG CŨ (image trước P15, ví dụ `p14d`).
        `labs.setupStatus` KHÔNG TỒN TẠI ở đó, nên mọi lượt poll sẽ lỗi và harness
        chết giữa loạt. Đường cũ cũng không cần poll: setup chạy ĐỒNG BỘ trong
        request, nên `startAttemptMs` ĐÃ LÀ thời gian setup — đúng đại lượng mà
        bảng cơ sở ghi. Bỏ qua phần chờ, giữ nguyên mọi thứ khác để hai nhánh
        so sánh được.
      */
      if (process.env.LEGACY === '1') {
        say({
          step: 'curve',
          legacy: true,
          workers: n,
          load1: loadTruoc,
          startAttemptMs: startMs,
          startError: startErr,
        });
        if (sessionId !== null) {
          try {
            await mutate('session.reap', { sessionId, userId: me.id, reason: 'user_ended' });
          } catch (e) {
            say({ step: 'curve:reapLoi', workers: n, error: e.message.slice(0, 200) });
          }
        }
        continue;
      }

      // Chờ setup xong — đây là đại lượng KHÔNG còn nằm dưới trần 120s của
      // `/exec` sau hướng B, nên nó được phép vượt 120s mà không có gì hỏng.
      let state = startErr === null ? 'running' : 'n/a';
      let msg = null;
      const tSetup = Date.now();
      let refuseCode = null;
      if (attemptId !== null) {
        // Một lượt chấm NGAY, trong cửa sổ setup chưa xong: phải bị TỪ CHỐI.
        try {
          await mutate('labs.checkTask', {
            labId: 'dlp-k8s-broken-deploy',
            attemptId,
            taskId: 'fix-image-tag',
          });
          refuseCode = 'KHONG-TU-CHOI';
        } catch (e) {
          refuseCode = e.message.slice(0, 160);
        }

        while (Date.now() - tSetup < 420_000) {
          const s = await query('labs.setupStatus', { attemptId });
          state = s.state;
          msg = s.message;
          if (state !== 'running') break;
          await sleep(2000);
        }
      }
      const setupMs = Date.now() - tSetup;

      /*
        ⛔ THU HỒI phiên của lượt vừa đo, TRƯỚC lượt sau. Pod profile `k8s` chạy
        một cụm k3s con: để nó sống là (a) tự cộng tải vào lượt đo kế tiếp — tức
        mức load ghi trong bảng không còn là mức ta đặt — và (b) ăn 1Gi trong
        quota 5952Mi, nên tới lượt thứ tư thì `startAttempt` hỏng vì HẾT KHE chứ
        không phải vì tải. Cả hai đều đọc ra như một kết luận về 15.C mà không
        phải.
      */
      if (sessionId !== null) {
        try {
          await mutate('session.reap', { sessionId, userId: me.id, reason: 'user_ended' });
        } catch (e) {
          say({ step: 'curve:reapLoi', workers: n, error: e.message.slice(0, 200) });
        }
      }

      say({
        step: 'curve',
        workers: n,
        load1: loadTruoc,
        startAttemptMs: startMs,
        startError: startErr,
        setupWaitMs: setupMs,
        setupState: state,
        setupMessage: msg,
        checkTaskTrongCuaSo: refuseCode,
      });
    }
    loadOff();
  }

  writeFileSync(`${OUT}/measure.jsonl`, log.map((o) => JSON.stringify(o)).join('\n') + '\n');
}

main().catch((e) => {
  console.error('HARNESS LỖI:', e.message);
  process.exitCode = 1;
});
