/**
 * student.mjs — MỘT người học chạy bài `dlp-docker-basics`, có RÀO CHẮN trước bước build.
 *
 * Kế thừa kỷ luật của `2026-08-15-3i-m2-docker-lesson/e2e-docker-lesson.mjs`:
 * bước build chấm CẢ HAI VẾ (trước khi làm phải "chưa đạt", sau khi làm phải
 * "đạt"). Một verify luôn-exit-0 cũng cho "đạt" ở vế sau — nên vế trước là thứ
 * duy nhất phân biệt được "đã build thật" với "verify hỏng".
 *
 * ⛔ VÌ SAO CÓ RÀO CHẮN. Nếu mỗi người tự chạy theo nhịp của mình, các lượt
 * `docker build` sẽ TRẢI RA theo thời gian và phép đo sẽ trả lời câu "21 người
 * cùng HỌC" — không phải câu được hỏi ("21 người cùng BUILD"). Rào chắn ép mọi
 * worker dừng ngay trước build, rồi cùng vào trong một giây.
 *
 * ⛔ KHÔNG signup. Better Auth rate-limit đăng ký theo IP (~2-3 lượt rồi 429);
 * 21 worker tự signup sẽ chết ở bước DỰNG và triệu chứng 429 đọc y hệt "hệ đã
 * chặn tải" — phép đo tự nói dối. Cookie đến từ pool `infra/k6/.users.json`.
 *
 * Env: BASE_URL ORIGIN COOKIE SID BARRIER_DIR
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openTerminal, measureKeystrokes } from './wsterm.mjs';

const BASE = process.env.BASE_URL;
const ORIGIN = process.env.ORIGIN;
const COOKIE = process.env.COOKIE;
const SID = process.env.SID ?? '0';
const BARRIER = process.env.BARRIER_DIR ?? '';
const SCENARIO = 'dlp-docker-basics';
const NOBAR = process.env.NO_BARRIER === '1';
// Số mẫu gõ phím mỗi pha. 0 = tắt hẳn pha gõ (giữ đường cũ của lượt N=18 để
// so sánh được). Trần 52 do bảng chữ cái trong `wsterm.mjs` — xem lý do ở đó.
const KS_SAMPLES = Number(process.env.KEYSTROKE_SAMPLES ?? 24);
const KS_PACE_MS = Number(process.env.KEYSTROKE_PACE_MS ?? 200);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = () => Date.now();
const log = (m) => console.error(`[s${SID}] ${m}`);

// Mốc thời gian: TẤT CẢ lấy từ đồng hồ của tiến trình này (Windows). Không trộn
// với timestamp của cụm — đồng hồ VM lệch ~59s so với Windows, và trộn hai
// nguồn ra số sai mà vẫn dương nên không tự lộ.
const marks = {};
const fails = [];
function assert(name, ok, detail) {
  if (!ok) fails.push(`${name} — ${detail ?? ''}`);
  log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * ⛔ RETRY LÀ BẮT BUỘC, KHÔNG PHẢI TỐI ƯU.
 * `kubectl port-forward` là một đường hầm DUY NHẤT và nó rụng sau một khoảng im
 * lặng (đo được: chết trong 68s không có HTTP nào lúc `docker pull`). Không có
 * retry thì `fetch failed` của KÊNH ĐO đọc ra y hệt "hệ từ chối" — phép đo tự
 * nói dối đúng theo hướng làm hệ trông tệ hơn thực tế. Retry chỉ bọc lỗi MẠNG;
 * lỗi tầng ứng dụng (4xx/5xx có thân) vẫn nổi lên nguyên vẹn.
 */
/**
 * Kho cookie của worker. Bắt đầu từ cookie đăng nhập, rồi GOM thêm mọi
 * Set-Cookie nhận được.
 *
 * ⛔ CẦN CHO `/ws`: handshake WebSocket đòi cookie `dlp_sandbox` (Path=/ws,
 * HttpOnly) mà `lessons.startSession` phát ra. Chỉ mang cookie đăng nhập thì
 * gateway trả **401** — và 401 ở đó đọc y hệt ca "token hết hạn", nên nó dẫn
 * người đọc đi soi JWT thay vì soi cookie (đã mất thời gian đúng như vậy khi
 * dựng `keystroke-smoke.mjs`).
 *
 * Giữ MỌI cookie, KHÔNG lọc theo tiền tố `dlp_`: cookie phiên Better Auth
 * không mang tiền tố ấy nên lọc như thế sẽ vứt đúng cookie đăng nhập.
 */
let cookieJar = COOKIE;
function soakCookies(response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0];
    if (!pair?.includes('=')) continue;
    const name = pair.split('=')[0];
    const kept = cookieJar.split('; ').filter((c) => c && !c.startsWith(`${name}=`));
    kept.push(pair);
    cookieJar = kept.join('; ');
  }
}

async function http(path, init = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          cookie: cookieJar,
          ...(init.headers ?? {}),
        },
      });
      soakCookies(res);
      return res;
    } catch (e) {
      lastErr = e;
      netRetries += 1;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`mạng hỏng sau 4 lượt (${path}): ${String(lastErr).slice(0, 120)}`);
}
let netRetries = 0;
// Phiên của worker này, để `donPhien()` dọn được ở MỌI đường thoát.
let sessionIdForCleanup = null;

async function trpcMutate(proc, input) {
  const res = await http(`/api/trpc/${proc}`, { method: 'POST', body: JSON.stringify(input) });
  const body = await res.json();
  if (body.error) throw new Error(`${proc}: HTTP ${res.status} ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.result.data;
}

/**
 * Một lượt đo "gõ → ký tự hiện" qua WS thật (không qua kubectl exec).
 *
 * ⛔ KHÔNG ném khi hỏng. Pha gõ phím là phép đo BỔ SUNG; một WS không mở được
 * không được phép làm hỏng kết luận về build. Trả về object có `error` để báo
 * cáo đọc được "không đo được" — khác hẳn với "đo được và chậm".
 */
async function doKeystroke(sessionId, nhan) {
  if (KS_SAMPLES === 0) return { skipped: true };
  let term = null;
  try {
    term = await openTerminal({ base: BASE, sessionId, cookie: cookieJar, origin: ORIGIN });
    const r = await measureKeystrokes(term, { samples: KS_SAMPLES, paceMs: KS_PACE_MS });
    log(`gõ (${nhan}): p50=${r.p50}ms p95=${r.p95}ms nhận=${r.received}/${r.samples} treo=${r.timeouts}`);
    return { ...r, handshakeMs: term.handshakeMs, readyMs: term.readyMs };
  } catch (e) {
    log(`gõ (${nhan}) KHÔNG ĐO ĐƯỢC: ${String(e.message).slice(0, 120)}`);
    return { error: String(e.message).slice(0, 200) };
  } finally {
    try { term?.close(); } catch { /* đã đóng */ }
  }
}

function inPod(pod, script, timeoutMs = 600_000) {
  return execFileSync(
    'kubectl',
    ['exec', '-n', 'dlp-sandbox', pod, '-c', 'sandbox', '--', 'bash', '-lc', script],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs },
  );
}

/** Rào chắn hai pha trên hệ tệp: báo sẵn sàng, rồi chờ cờ GO của driver. */
/**
 * Rào chắn chung. `flag` cho phép NHIỀU rào trong một lượt chạy (P12/12.B thêm
 * rào thứ hai cho pha gõ phím) — mỗi rào có cờ riêng và file `ready-` riêng,
 * nếu không thì worker nhanh sẽ đọc lại cờ của rào TRƯỚC và vượt rào ngay.
 */
async function barrier(flag = 'GO') {
  if (NOBAR || !BARRIER) return;
  mkdirSync(BARRIER, { recursive: true });
  writeFileSync(join(BARRIER, `ready${flag === 'GO' ? '' : `-${flag}`}-${SID}`), String(t()));
  log(`đã sẵn sàng, chờ cờ ${flag}…`);
  const deadline = t() + 900_000;
  while (t() < deadline) {
    if (existsSync(join(BARRIER, flag))) return;
    await sleep(100);
  }
  throw new Error(`rào chắn ${flag} quá hạn 15 phút — driver không phát cờ`);
}

async function main() {
  const T0 = t();

  // ── Mở phiên ───────────────────────────────────────────────────────────────
  const started = await trpcMutate('lessons.startSession', {
    scenarioId: SCENARIO,
    idempotencyKey: `conc-${SID}-${T0}`,
  });
  const sessionId = started.session.id;
  sessionIdForCleanup = sessionId;
  const pod = started.session.podName;
  marks.claim = t() - T0;
  assert('startSession cấp pod', Boolean(sessionId && pod), `pod=${pod} ${marks.claim}ms`);

  // ── Chờ dockerd ────────────────────────────────────────────────────────────
  const tReady = t();
  let ready = false;
  for (let i = 0; i < 90; i += 1) {
    try { inPod(pod, 'docker info >/dev/null 2>&1', 20_000); ready = true; break; }
    catch { await sleep(2000); }
  }
  marks.dockerdReady = t() - tReady;
  assert('dockerd sẵn sàng', ready, `${marks.dockerdReady}ms`);
  if (!ready) throw new Error('dockerd không lên');

  // ── Pha gõ THỨ NHẤT: trước rào build ─────────────────────────────────────
  //
  // ⚠ ĐÂY KHÔNG PHẢI "NỀN RẢNH", và bản đầu đặt tên nó là `keystrokeIdle` —
  // một cái tên khẳng định sai. Mọi worker khởi động CÙNG LÚC nên tất cả tới
  // pha này trong cùng một cửa sổ, giữa lúc cả lớp đang `docker pull`. Đo được
  // ở N=23 (2026-09-04): p95 của pha này là 177–400ms, trong khi nền THẬT
  // (N=1 smoke, N=2) là 30–37ms. Gọi nó là nền thì con số dưới tải trông như
  // "không tệ hơn nền" — một kết luận sai sinh ra từ một cái nhãn.
  //
  // Nền THẬT lấy từ lượt N=1/N=2, không lấy từ đây.
  marks.keystrokePre = await doKeystroke(sessionId, 'trước rào — lớp đang pull/setup');

  // ── Setup: đẩy asset app.py ────────────────────────────────────────────────
  await trpcMutate('lessons.runSetup', { scenarioId: SCENARIO, sessionId, phase: { kind: 'intro' } });

  const check = (index) =>
    trpcMutate('lessons.checkStep', { scenarioId: SCENARIO, sessionId, phase: { kind: 'step', index } });

  // ── Chuẩn bị: pull + run + exec (bước 1-3 của bài) ────────────────────────
  // Đây là phần TRƯỚC rào chắn: mỗi người tự chạy theo nhịp của mình, đúng như
  // lớp học thật (không ai pull cùng một giây).
  const tPull = t();
  inPod(pod, 'docker pull python:3.12-slim');
  marks.pull = t() - tPull;
  const pulled = inPod(pod, 'docker image inspect python:3.12-slim --format "{{.Id}}"', 30_000);
  assert('image nền có thật sau pull', pulled.trim().startsWith('sha256:'), `${marks.pull}ms`);

  // ⚠ `docker run <image docker.io>` PHÁT MỘT LƯỢT OCI-REFERRERS trực tiếp tới
  // `registry-1.docker.io`, KHÔNG qua registry-mirror (mirror chỉ proxy
  // manifests/blobs của bước PULL, không proxy API referrers). Sandbox chặn
  // egress trực tiếp (luật 10) nên lượt ấy TREO tới hết timeout rồi `docker run`
  // thoát 125 — dù image đã pull xong và chạy được. Nó CHẬP CHỜN (đôi lúc bị bỏ
  // qua/cache) nên số worker chết vì nó nhảy 3→15 giữa hai lượt đo, đầu độc đúng
  // phép đo quy mô mà pha này chỉ là BƯỚC CHUẨN BỊ, không phải thứ đang đo.
  //
  // Đây cũng là một phát hiện THẬT của bài Docker (ghi trong report P12) — người
  // học chạy `docker run nginx:alpine` gặp đúng treo này. Ở harness thì bọc retry
  // để tách nhiễu ngoài-hệ khỏi tín hiệu bão-hoà-control-plane; KHÔNG che nó đi.
  let nginxErr = null;
  for (let k = 0; k < 3; k += 1) {
    try {
      inPod(pod, 'docker rm -f web >/dev/null 2>&1; docker run -d --name web -p 8080:80 nginx:alpine && sleep 2 && curl -s -o /dev/null http://localhost:8080/', 90_000);
      nginxErr = null; break;
    } catch (e) { nginxErr = String(e).slice(0, 120); }
  }
  marks.nginxRetries = nginxErr ? 3 : undefined;
  if (nginxErr) throw new Error(`bước chuẩn bị nginx treo 3 lượt (referrers→docker.io bị chặn?): ${nginxErr}`);
  inPod(pod, `docker exec web sh -c 'echo "toi da o trong container" > /tmp/dlp-marker'`);

  // ── VẾ 1 của build: TRƯỚC khi build phải "chưa đạt" ───────────────────────
  // Không có vế này thì một verify hỏng-luôn-đạt cũng cho kết quả xanh y hệt.
  const before = await check(3);
  assert('build vế CHƯA ĐẠT (trước khi làm)', before.passed === false && before.exitCode !== 0,
    `passed=${before.passed} exit=${before.exitCode}`);

  // Viết sẵn Dockerfile TRƯỚC rào chắn — nó không tốn CPU và không phải thứ
  // đang đo. Sau rào chắn chỉ còn ĐÚNG `docker build`.
  inPod(pod, `cd /root/lab-docker && printf 'FROM python:3.12-slim\\nWORKDIR /app\\nCOPY app.py .\\nCMD ["python", "app.py"]\\n' > Dockerfile`);

  // ══ RÀO CHẮN ══════════════════════════════════════════════════════════════
  await barrier();

  // ── VẾ 2: build, và đây là con số của cả phép đo ──────────────────────────
  const tBuild = t();
  let buildErr = null;
  try { inPod(pod, 'cd /root/lab-docker && docker build -t myapp:1 .'); }
  catch (e) { buildErr = String(e).slice(0, 200); }
  marks.build = t() - tBuild;

  const after = await check(3);
  // ⛔ GIỮ `output` CỦA SCRIPT CHẤM. Bản trước chỉ ghi `passed`/`exitCode`, và
  // hậu quả đo được ở lượt N=18 ngày 2026-09-03: 17/18 trả `passed=false` mà
  // KHÔNG ai biết vì sao — phải đi suy luận từ hai phép đo khác để đoán ra
  // nguyên nhân. Một harness không giữ lời của thứ nó đang chấm thì lượt chạy
  // sau lại phải đoán lần nữa.
  marks.checkOutput = String(after.output ?? '').slice(0, 400);
  marks.checkExit = after.exitCode;
  assert('build vế ĐẠT (sau khi làm)', after.passed === true && after.exitCode === 0,
    `passed=${after.passed} exit=${after.exitCode} build=${marks.build}ms` +
      `${buildErr ? ` ⚠ ${buildErr}` : ''} | output: ${JSON.stringify(marks.checkOutput)}`);

  // Đối chứng cuối: image phải CHẠY được, không chỉ tồn tại.
  let runOut = '';
  try { runOut = inPod(pod, 'docker run --rm myapp:1', 120_000); } catch { /* rỗng */ }
  assert('myapp:1 chạy và in đúng chuỗi', runOut.includes('DLP docker lab'), JSON.stringify(runOut.trim().slice(0, 60)));

  // ══ RÀO CHẮN 2 — N NGƯỜI CÙNG GÕ ═════════════════════════════════════════
  //
  // Đây là đại lượng người học CẢM được, và trước P12 chưa ai đo nó dưới tải.
  // Rào riêng vì thời gian build của mỗi người khác nhau: không đồng bộ lại thì
  // người xong sớm gõ lúc cụm đã rảnh, và con số thu được là con số của nền.
  await barrier('GO2');
  marks.keystrokeLoad = await doKeystroke(sessionId, 'dưới tải');

  // ── Kết quả máy đọc được ───────────────────────────────────────────────────
  const uid = execFileSync('kubectl',
    ['get', 'pod', '-n', 'dlp-sandbox', pod, '-o', 'jsonpath={.metadata.uid}'],
    { encoding: 'utf8' }).trim();

  process.stdout.write(JSON.stringify({
    sid: Number(SID), sessionId, pod, uid, marks, fails, netRetries, ok: fails.length === 0,
  }) + '\n');
}

// ── Tự dọn phiên ─────────────────────────────────────────────────────────────
//
// ⛔ THIẾU KHỐI NÀY LÀ MỘT LỖI ĐO ĐƯỢC, không phải một thiếu sót thẩm mỹ.
// Lượt N=18 ngày 2026-09-03 để lại 18 phiên sống, đẩy quota lên 21/26 và
// cpu 5250m/5400m — tức **trần đã đầy**, và lượt chạy kế tiếp không có khe nào.
// Người chạy nó sẽ thấy `CreateSession` bị quota từ chối và đọc ra là "hệ hết
// chỗ", trong khi thứ chiếm chỗ là rác của chính phép đo trước.
//
// Dùng `lessons.endSession` chứ KHÔNG `session.reap`: `reap` đòi `userId` khớp
// `ctx.user.id`, mà harness chỉ có uid của POD trong tay — dọn bằng nó trả
// FORBIDDEN 17/17 (đã đo). `endSession` suy người dùng từ cookie nên không có
// gì để lệch.
//
// ⛔ VÀ KHÔNG `kubectl delete pod`: xoá pod bằng tay làm lệch warm pool, và
// orchestrator sẽ giao tên pod đã chết cho lượt claim kế (sự cố §6.2).
async function donPhien() {
  if (!sessionIdForCleanup) return;
  try {
    await trpcMutate('lessons.endSession', { sessionId: sessionIdForCleanup });
  } catch (e) {
    // Dọn hỏng KHÔNG được làm hỏng kết quả đo — nhưng phải nói ra, vì khe quota
    // còn bị giữ và lượt sau sẽ trả giá.
    process.stderr.write(`[s${SID}] dọn phiên hỏng: ${String(e).slice(0, 160)}\n`);
  }
}

main().then(donPhien).catch(async (err) => {
  await donPhien();
  process.stdout.write(JSON.stringify({
    sid: Number(SID), marks, fails: [...fails, `HARNESS: ${String(err).slice(0, 300)}`], ok: false,
  }) + '\n');
  process.exitCode = 1;
});
