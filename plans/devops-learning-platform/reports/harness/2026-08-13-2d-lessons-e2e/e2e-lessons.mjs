#!/usr/bin/env node
/**
 * E2E trên CỤM THẬT cho P2 / 2.D + 2.C — đi qua đúng API mà trình duyệt gọi.
 *
 * Đóng bốn ô AC còn hở của phase-2.md:
 *   1. "Check → verifyScript chạy trong pod, trả pass/fail đúng (1 pass + 1 fail)"
 *   2. "Setup script chạy khi start; môi trường step đúng"
 *   3. "Validation isolation — NetworkPolicy"
 *   4. asset-push (tầng mới ở 2.D task 0.6)
 *
 * ⚠ Vì sao dùng `dlp-sandbox-basics` chứ KHÔNG dùng `ckad-configmap-as-files`
 * như plan chỉ định: image sandbox KHÔNG có `kubectl` (đọc
 * `images/sandbox-base/Dockerfile`), nên `verify.sh` của ckad chết ở
 * `command not found` MỌI lượt ⇒ vế "pass" bất khả. Đó đúng là tấm gương của bẫy
 * `/bin/true` mà chính plan cảnh báo ở `prolug-*` (vế "fail" bất khả).
 *
 * Chạy:  node e2e-lessons.mjs            (cần `kubectl port-forward svc/platform-web 3000:3000`)
 */
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const SCENARIO = 'dlp-sandbox-basics';

/**
 * `Origin` BẮT BUỘC trên mọi request.
 *
 * Better Auth từ chối 403 `MISSING_OR_NULL_ORIGIN` khi thiếu header này, và
 * `fetch` của Node (undici) KHÔNG tự đặt nó — trong khi `curl` cùng một request
 * lại đi qua. Hai công cụ cho hai kết quả khác nhau trên cùng một endpoint là
 * đúng chỗ dễ kết luận nhầm rằng "server hỏng".
 *
 * Giá trị phải khớp origin đã cấu hình của release (`web.env.corsAllowedOrigins`
 * = `betterAuthUrl` = http://localhost:8080), KHÔNG phải địa chỉ port-forward.
 */
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:8080';

let cookie = '';
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

async function http(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
    redirect: 'manual',
  });
  // Giữ MỌI cookie, không lọc theo tiền tố.
  //
  // ⚠ Bản đầu chỉ giữ `dlp_*` vì tưởng cookie phiên cũng mang tiền tố đó. Không:
  // cookie phiên Better Auth tên là `better-auth.session_token` (đo bằng
  // `curl -i` trên chính endpoint sign-up). Lọc theo `dlp_` vứt đúng cookie đăng
  // nhập, và triệu chứng là MỌI procedure trả UNAUTHORIZED — trông y hệt lỗi
  // authz của sản phẩm chứ không như lỗi của harness.
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    const pair = raw.split(';')[0];
    if (!pair || !pair.includes('=')) continue;
    const name = pair.split('=')[0];
    const kept = cookie.split('; ').filter((c) => c && !c.startsWith(`${name}=`));
    kept.push(pair);
    cookie = kept.join('; ');
  }
  return response;
}

/** tRPC không dùng transformer (xem lib/trpc.ts) ⇒ input/uutput là JSON trần. */
async function trpcQuery(proc, input) {
  const url = `/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await http(url);
  const body = await response.json();
  if (body.error) throw new Error(`${proc}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result.data;
}

async function trpcMutate(proc, input) {
  const response = await http(`/api/trpc/${proc}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  const body = await response.json();
  if (body.error) {
    const err = new Error(body.error.message ?? JSON.stringify(body.error));
    err.trpcCode = body.error.data?.code;
    throw err;
  }
  return body.result.data;
}

function kubectl(args) {
  return execFileSync('kubectl', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

/** Chạy lệnh TRONG pod sandbox — đóng vai "người học gõ vào terminal". */
function inPod(pod, script) {
  return kubectl(['exec', '-n', 'dlp-sandbox', pod, '--', 'bash', '-lc', script]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ── 0. Đăng nhập ────────────────────────────────────────────────────────────
  const email = `e2e-${Date.now()}@dlp.local`;
  const signup = await http('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'e2e-Password-123', name: 'E2E' }),
  });
  record('đăng ký + phiên đăng nhập', signup.status < 400 && cookie !== '', `HTTP ${signup.status}`);

  // ── 1. Danh sách + chi tiết ─────────────────────────────────────────────────
  const list = await trpcQuery('lessons.list', { limit: 100 });
  const found = list.items.find((i) => i.id === SCENARIO);
  record(
    'lessons.list thấy bài first-party',
    found !== undefined,
    `${list.items.length} bài: ${list.items.map((i) => i.id).join(', ')}`,
  );

  const detail = await trpcQuery('lessons.get', { scenarioId: SCENARIO });
  record(
    'lessons.get trả đủ step + markdown (chứng minh .md CÓ trong image)',
    detail.scenario.steps.length === 4 && detail.scenario.steps.every((s) => s.markdown.length > 50),
    `${detail.scenario.steps.length} step, độ dài md: ${detail.scenario.steps.map((s) => s.markdown.length).join('/')}`,
  );
  record(
    'không có năng lực nào thiếu (bài hợp năng lực thật)',
    detail.unsupportedCapabilities.length === 0,
    `unsupportedCapabilities=${JSON.stringify(detail.unsupportedCapabilities)}`,
  );

  // ── 2. Mở phiên sandbox ─────────────────────────────────────────────────────
  const started = await trpcMutate('lessons.startSession', {
    scenarioId: SCENARIO,
    idempotencyKey: `e2e-${Date.now()}`,
  });
  const sessionId = started.session.id;
  const podName = started.session.podName;
  record('startSession cấp pod', Boolean(sessionId && podName), `session=${sessionId} pod=${podName}`);

  // Chờ pod thật sự chạy được lệnh.
  let ready = false;
  for (let i = 0; i < 30; i += 1) {
    try {
      inPod(podName, 'true');
      ready = true;
      break;
    } catch {
      await sleep(2000);
    }
  }
  if (!ready) throw new Error(`pod ${podName} không exec được sau 60s`);

  // ── 3. AC "Check → fail" khi CHƯA làm bài ───────────────────────────────────
  const before = await trpcMutate('lessons.checkStep', {
    scenarioId: SCENARIO,
    sessionId,
    phase: { kind: 'step', index: 0 },
  });
  record(
    'AC pass/fail — vế FAIL (chưa làm gì)',
    before.passed === false && before.exitCode !== 0,
    `passed=${before.passed} exit=${before.exitCode} output=${JSON.stringify(before.output.trim().slice(0, 90))}`,
  );

  // ── 4. AC setup script + asset-push ─────────────────────────────────────────
  const setup = await trpcMutate('lessons.runSetup', {
    scenarioId: SCENARIO,
    sessionId,
    phase: { kind: 'intro' },
  });
  record(
    'AC setup — background CHẠY + asset ĐẨY được',
    setup.ran === true && setup.assetsPushed === 1,
    `ran=${setup.ran} assetsPushed=${setup.assetsPushed} foreground=${setup.foreground === null ? 'null' : 'có (FE gõ vào WS)'}`,
  );

  const seeded = inPod(podName, 'cat /root/lab-seed.json | head -c 60; echo; stat -c "%a" /root/lab-seed.json');
  record(
    'asset-push — file có thật trong pod, nội dung nguyên vẹn',
    seeded.includes('dlp-sandbox-basics'),
    seeded.trim().replace(/\s+/g, ' ').slice(0, 120),
  );
  const setupSide = inPod(podName, 'cat /root/lab/.setup-done 2>/dev/null || echo MISSING');
  record(
    'setup background để lại dấu vết trong pod',
    setupSide.trim() === 'ready',
    `/root/lab/.setup-done = ${setupSide.trim()}`,
  );

  // ── 5. AC "Check → pass" SAU khi làm bài ────────────────────────────────────
  inPod(podName, 'echo dlp > /root/lab/hello.txt');
  const after = await trpcMutate('lessons.checkStep', {
    scenarioId: SCENARIO,
    sessionId,
    phase: { kind: 'step', index: 0 },
  });
  record(
    'AC pass/fail — vế PASS (sau khi làm đúng)',
    after.passed === true && after.exitCode === 0,
    `passed=${after.passed} exit=${after.exitCode} output=${JSON.stringify(after.output.trim().slice(0, 90))}`,
  );
  record(
    'pass ở step đẩy tiến độ tiến lên',
    after.progress.stepIndex > before.progress.stepIndex,
    `stepIndex ${before.progress.stepIndex} → ${after.progress.stepIndex}, status=${after.progress.status}`,
  );

  // ── 6. AC NetworkPolicy — verify chạy TRONG pod và mạng bị chặn ──────────────
  const netpol = await trpcMutate('lessons.checkStep', {
    scenarioId: SCENARIO,
    sessionId,
    phase: { kind: 'step', index: 3 },
  });
  record(
    'AC isolation — 169.254.169.254 bị chặn (verify khẳng định NGƯỢC)',
    netpol.passed === true,
    `passed=${netpol.passed} exit=${netpol.exitCode} output=${JSON.stringify(netpol.output.trim().slice(0, 90))}`,
  );

  // Đối chứng ÂM: nếu verify chạy ở nơi CÓ mạng thì ô trên sẽ xanh vì lý do sai.
  let hostReach = 'n/a';
  try {
    hostReach = inPod(podName, 'curl -s --max-time 3 https://example.com > /dev/null 2>&1; echo exit=$?').trim();
  } catch (e) {
    hostReach = `err ${String(e).slice(0, 40)}`;
  }
  record(
    'đối chứng âm — pod cũng KHÔNG ra được internet chung',
    hostReach.includes('exit=') && !hostReach.includes('exit=0'),
    `curl https://example.com trong pod → ${hostReach}`,
  );

  // ── 7. Ô AC "lỗi hệ thống KHÔNG thành passed:false" ─────────────────────────
  let sysErr = null;
  try {
    await trpcMutate('lessons.checkStep', {
      scenarioId: SCENARIO,
      sessionId,
      phase: { kind: 'step', index: 1 },
    });
    // step2 có verify thật (jq) nên đây là fail bình thường, không phải lỗi.
  } catch (e) {
    sysErr = e;
  }
  const bogus = await trpcMutate('lessons.checkStep', {
    scenarioId: SCENARIO,
    sessionId: '00000000-0000-0000-0000-000000000000',
    phase: { kind: 'step', index: 0 },
  }).then(
    (d) => ({ threw: false, data: d }),
    (e) => ({ threw: true, code: e.trpcCode, message: e.message }),
  );
  record(
    'sessionId lạ → NÉM lỗi, KHÔNG trả passed:false',
    bogus.threw === true,
    `threw=${bogus.threw} code=${bogus.code ?? '-'} msg=${String(bogus.message ?? '').slice(0, 70)}`,
  );

  // ── Tổng kết ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length > 0) {
    console.log(failed.map((f) => `  FAIL ${f.name}`).join('\n'));
    process.exitCode = 1;
  }
}

await main();
