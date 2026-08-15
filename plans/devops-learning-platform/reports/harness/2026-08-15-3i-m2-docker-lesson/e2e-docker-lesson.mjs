/**
 * 3.I mắt 2 — chạy bài `dlp-docker-basics` END-TO-END trên phiên THẬT.
 *
 * Đóng vai người học: mở phiên, gõ đúng những lệnh bài bảo gõ vào terminal của
 * pod, và bấm Kiểm tra qua chính tRPC mà UI dùng.
 *
 * ⛔ NGUYÊN TẮC CHI PHỐI FILE NÀY — mỗi step chấm CẢ HAI VẾ.
 * Chấm "đạt" sau khi làm bài, một mình, không chứng minh được gì: một verify
 * luôn-exit-0 (bẫy `prolug` ghi ở content/scenarios/README.md) cũng cho đúng
 * kết quả ấy. Nên với mọi step CÓ HÀNH ĐỘNG, ta chấm TRƯỚC khi làm (phải
 * "chưa đạt") rồi mới làm và chấm lại (phải "đạt"). Step 6 là step QUAN SÁT —
 * không có gì để làm, nên nó không có vế fail; bù lại chính verify của nó mang
 * đối chứng dương bên trong (pypi chặn VÀ mirror thông).
 *
 * Chạy:
 *   O=https://dlp.192.168.94.130.sslip.io:30443
 *   BASE_URL=$O ORIGIN=$O NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e-docker-lesson.mjs
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:8080';
const SCENARIO = 'dlp-docker-basics';

/**
 * Cookie jar GỘP theo tên, không thay thế cả rổ.
 *
 * `startSession` đặt cookie sandbox-token; một rổ cookie kiểu "gán đè" sẽ ném
 * mất cookie phiên đăng nhập ngay ở lượt đó, và mọi lời gọi sau trả
 * UNAUTHORIZED — triệu chứng đọc ra như lỗi authz của server chứ không như lỗi
 * của chính harness. Đã cắn đúng một lần ở lượt chạy đầu.
 */
const jar = new Map();
const results = [];

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function http(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(jar.size > 0 ? { cookie: cookieHeader() } : {}),
      ...(init.headers ?? {}),
    },
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return res;
}

async function trpcQuery(proc, input) {
  const res = await http(`/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`);
  const body = await res.json();
  if (body.error) throw new Error(`${proc}: ${JSON.stringify(body.error)}`);
  return body.result.data;
}

async function trpcMutate(proc, input) {
  const res = await http(`/api/trpc/${proc}`, { method: 'POST', body: JSON.stringify(input) });
  const body = await res.json();
  if (body.error) throw new Error(`${proc}: ${JSON.stringify(body.error)}`);
  return body.result.data;
}

function kubectl(args) {
  return execFileSync('kubectl', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

/** Chạy lệnh TRONG pod sandbox — đóng vai "người học gõ vào terminal". */
function inPod(pod, script, timeoutMs = 300_000) {
  return execFileSync('kubectl', ['exec', '-n', 'dlp-sandbox', pod, '-c', 'sandbox', '--', 'bash', '-lc', script], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Số liệu tài nguyên của pod, đọc ở cgroup TRÊN HOST.
 *
 * ⛔ KHÔNG đo trong pod: Sysbox biên tập thứ `kubectl exec` nhìn thấy, nên
 * /proc và /sys/fs/cgroup bên trong không phải trần thật đang áp.
 *
 * RAM: `memory.peak` là đỉnh THẬT do kernel giữ — không cần lấy mẫu.
 * CPU: cgroup v2 KHÔNG có `cpu.peak`. Chỉ có `usage_usec` cộng dồn, nên thứ đo
 * được là TỔNG CPU-giây và mức trung bình, không phải đỉnh tức thời. Nói "đỉnh
 * CPU = X" từ con số cộng dồn này là bịa; đỉnh tức thời thuộc về mắt 3, nơi đo
 * bằng cách lấy mẫu.
 */
function cgroupStats(podUid) {
  const slice = `kubepods-burstable-pod${podUid.replaceAll('-', '_')}.slice`;
  const path = `/sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/${slice}`;
  try {
    // Đọc theo NHÃN, không theo vị trí dòng. Bản đầu nối các lệnh rồi tách theo
    // dòng, nhưng `tr '\n' ' '` bỏ luôn newline cuối ⇒ output lệnh sau dính vào
    // cùng dòng, chỉ số lệch, và kết quả ra `NaN` chứ không ra lỗi.
    const out = execFileSync(
      'ssh',
      ['-o', 'ConnectTimeout=8', process.env.VM_SSH ?? 'nghaiz@192.168.94.130',
        `for k in memory.peak memory.current memory.max cpu.max; do ` +
        `printf '%s=%s\\n' "$k" "$(sudo cat ${path}/$k 2>/dev/null | head -1 | tr ' ' '/')"; done; ` +
        `printf 'usage_usec=%s\\n' "$(sudo awk '/^usage_usec/{print $2}' ${path}/cpu.stat 2>/dev/null)"`],
      { encoding: 'utf8', timeout: 60_000 },
    );
    const kv = new Map(
      out.trim().split('\n').map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
    );
    return {
      peak: Number(kv.get('memory.peak')),
      current: Number(kv.get('memory.current')),
      max: Number(kv.get('memory.max')),
      usageUsec: Number(kv.get('usage_usec')),
      cpuMax: kv.get('cpu.max') ?? '',
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

const mib = (n) => `${(n / 1024 / 1024).toFixed(0)}Mi`;

async function main() {
  // ── 0. Đăng nhập ───────────────────────────────────────────────────────────
  const email = `e2e-docker-${Date.now()}@dlp.local`;
  const signup = await http('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'e2e-Password-123', name: 'E2E Docker' }),
  });
  record('đăng ký + phiên đăng nhập', signup.status < 400 && jar.size > 0, `HTTP ${signup.status}`);

  // ── AC-I9: bài hiện ra qua chính đường app dùng ────────────────────────────
  const list = await trpcQuery('lessons.list', { limit: 100 });
  const found = list.items.find((i) => i.id === SCENARIO);
  record(
    'AC-I9a — lessons.list thấy bài Docker mới',
    found !== undefined,
    `${list.items.length} bài: ${list.items.map((i) => i.id).join(', ')}`,
  );

  const detail = await trpcQuery('lessons.get', { scenarioId: SCENARIO });
  const steps = detail.scenario.steps;
  record(
    'AC-I9b — lessons.get trả đủ 6 step + markdown (chứng minh .md CÓ trong image)',
    steps.length === 6 && steps.every((s) => s.markdown.length > 50),
    `${steps.length} step, độ dài md: ${steps.map((s) => s.markdown.length).join('/')}`,
  );
  record(
    'AC-I9c — không thiếu năng lực nào',
    detail.unsupportedCapabilities.length === 0,
    `unsupportedCapabilities=${JSON.stringify(detail.unsupportedCapabilities)}`,
  );

  // ── Mở phiên ───────────────────────────────────────────────────────────────
  const started = await trpcMutate('lessons.startSession', {
    scenarioId: SCENARIO,
    idempotencyKey: `e2e-docker-${Date.now()}`,
  });
  const sessionId = started.session.id;
  const podName = started.session.podName;
  record('startSession cấp pod', Boolean(sessionId && podName), `session=${sessionId} pod=${podName}`);

  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    try {
      inPod(podName, 'docker info >/dev/null 2>&1', 20_000);
      ready = true;
      break;
    } catch {
      await sleep(2000);
    }
  }
  if (!ready) throw new Error(`pod ${podName}: dockerd không sẵn sàng sau 80s`);

  const podUid = kubectl(['get', 'pod', '-n', 'dlp-sandbox', podName, '-o', 'jsonpath={.metadata.uid}']).trim();
  const baseline = cgroupStats(podUid);

  // ── Setup: asset app.py phải tới nơi ───────────────────────────────────────
  await trpcMutate('lessons.runSetup', { scenarioId: SCENARIO, sessionId, phase: { kind: 'intro' } });
  let assetOk = false;
  try {
    const out = inPod(podName, 'cat /root/lab-docker/app.py', 20_000);
    assetOk = out.includes('DLP docker lab');
  } catch { /* giữ false */ }
  record('setup — background chạy + asset app.py đẩy được', assetOk);

  const check = (index) =>
    trpcMutate('lessons.checkStep', { scenarioId: SCENARIO, sessionId, phase: { kind: 'step', index } });

  /** Chấm hai vế cho một step CÓ hành động. */
  async function bothSides(index, label, action, actionTimeoutMs = 300_000) {
    const before = await check(index);
    record(
      `AC-I11 step${index + 1} vế CHƯA ĐẠT (trước khi làm) — ${label}`,
      before.passed === false && before.exitCode !== 0,
      `passed=${before.passed} exit=${before.exitCode} out=${JSON.stringify(before.output.trim().slice(0, 80))}`,
    );

    const t0 = Date.now();
    let actionErr = null;
    try {
      inPod(podName, action, actionTimeoutMs);
    } catch (e) {
      actionErr = e;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    const after = await check(index);
    record(
      `AC-I11 step${index + 1} vế ĐẠT (sau khi làm) — ${label}`,
      after.passed === true && after.exitCode === 0,
      `passed=${after.passed} exit=${after.exitCode} (hành động ${secs}s)` +
        (actionErr ? ` ⚠ lệnh học viên lỗi: ${String(actionErr).slice(0, 120)}` : ''),
    );
    return after;
  }

  // ── step 1: pull qua mirror (AC-I10) ───────────────────────────────────────
  await bothSides(0, 'docker pull python:3.12-slim', 'docker pull python:3.12-slim');
  let pullOut = '';
  try {
    pullOut = inPod(podName, 'docker image inspect python:3.12-slim --format "{{.Id}}"', 30_000);
  } catch { /* để rỗng */ }
  record('AC-I10 — image python:3.12-slim CÓ THẬT trong sandbox', pullOut.trim().startsWith('sha256:'), pullOut.trim().slice(0, 30));

  // ── step 2: run + publish port ─────────────────────────────────────────────
  await bothSides(1, 'docker run -d --name web -p 8080:80 nginx:alpine',
    'docker run -d --name web -p 8080:80 nginx:alpine && sleep 3 && curl -s -o /dev/null http://localhost:8080/');

  // ── step 3: exec vào container ─────────────────────────────────────────────
  await bothSides(2, 'docker exec tạo mốc trong container',
    `docker exec web sh -c 'echo "toi da o trong container" > /tmp/dlp-marker'`);

  // ── step 4: build image THẬT (AC-I12) — đây là ĐỈNH TẢI cho mắt 3 ─────────
  const buildScript = [
    'cd /root/lab-docker',
    `printf 'FROM python:3.12-slim\\nWORKDIR /app\\nCOPY app.py .\\nCMD ["python", "app.py"]\\n' > Dockerfile`,
    'docker build -t myapp:1 .',
  ].join(' && ');
  await bothSides(3, 'docker build -t myapp:1 .', buildScript);
  let runOut = '';
  try {
    runOut = inPod(podName, 'docker run --rm myapp:1', 60_000);
  } catch { /* để rỗng */ }
  record('AC-I12 — myapp:1 CHẠY và in đúng chuỗi', runOut.includes('DLP docker lab'), JSON.stringify(runOut.trim().slice(0, 70)));

  // ── step 5: tag là con trỏ ─────────────────────────────────────────────────
  await bothSides(4, 'docker tag myapp:1 myapp:stable', 'docker tag myapp:1 myapp:stable', 60_000);

  // ── step 6: QUAN SÁT — không có hành động, nên không có vế fail ────────────
  const isolation = await check(5);
  record(
    'AC-I13 — step6 đạt: pypi CHẶN và mirror THÔNG (đối chứng dương nằm trong chính verify)',
    isolation.passed === true && isolation.exitCode === 0,
    `passed=${isolation.passed} exit=${isolation.exitCode} out=${JSON.stringify(isolation.output.trim().slice(0, 140))}`,
  );

  // ── AC-I16: tải của bài, đo ở cgroup HOST ─────────────────────────────────
  const after = cgroupStats(podUid);
  if (after && baseline) {
    record(
      'AC-I16a — ĐỈNH RAM của bài (memory.peak, đỉnh thật do kernel giữ)',
      after.peak > 0,
      `đỉnh=${mib(after.peak)} (nền lúc mở phiên=${mib(baseline.peak)}) · hiện=${mib(after.current)} · trần=${mib(after.max)} · dùng ${((after.peak / after.max) * 100).toFixed(0)}% trần`,
    );
    const cpuSec = (after.usageUsec - baseline.usageUsec) / 1e6;
    const wallSec = (after.at - baseline.at) / 1000;
    record(
      'AC-I16b — CPU của bài (TỔNG CPU-giây; cgroup v2 KHÔNG có cpu.peak)',
      cpuSec > 0,
      `tổng=${cpuSec.toFixed(1)} CPU-giây trong ${wallSec.toFixed(0)}s tường ⇒ trung bình ${(cpuSec / wallSec).toFixed(2)} core · trần cpu.max=${after.cpuMax} · đỉnh tức thời KHÔNG đo được bằng cộng dồn — việc của mắt 3`,
    );
  } else {
    record('AC-I16 — tải của bài, đo ở cgroup host', false, 'không đọc được cgroup trên host');
  }

  // ── Dọn ────────────────────────────────────────────────────────────────────
  // KHÔNG có procedure `lessons.endSession` — router chỉ có list/get/
  // sessionStatus/startSession/runSetup/saveProgress/checkStep. Phiên kết thúc
  // bằng TTL (1h) rồi reaper dọn. Bản đầu file này gọi `endSession` trong một
  // `try{}catch{}`, tức gọi một thứ KHÔNG TỒN TẠI và nuốt lỗi — chạy vẫn xanh,
  // nên nó không bao giờ tự lộ. Ghi lại ở đây thay vì để lần sau ai đó tưởng
  // đường dọn có sẵn.
  console.log(`\n(phiên ${sessionId} để TTL tự thu hồi — không có đường trả sớm)`);

  console.log('');
  const fails = results.filter((r) => !r.ok);
  console.log(`TỔNG: ${results.length - fails.length}/${results.length} PASS`);
  if (fails.length > 0) {
    console.log('ĐỎ:');
    for (const f of fails) console.log(`  · ${f.name} — ${f.detail ?? ''}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('LỖI HARNESS:', err);
  process.exitCode = 1;
});
