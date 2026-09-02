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

const BASE = process.env.BASE_URL;
const ORIGIN = process.env.ORIGIN;
const COOKIE = process.env.COOKIE;
const SID = process.env.SID ?? '0';
const BARRIER = process.env.BARRIER_DIR ?? '';
const SCENARIO = 'dlp-docker-basics';
const NOBAR = process.env.NO_BARRIER === '1';

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
async function http(path, init = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          cookie: COOKIE,
          ...(init.headers ?? {}),
        },
      });
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

function inPod(pod, script, timeoutMs = 600_000) {
  return execFileSync(
    'kubectl',
    ['exec', '-n', 'dlp-sandbox', pod, '-c', 'sandbox', '--', 'bash', '-lc', script],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs },
  );
}

/** Rào chắn hai pha trên hệ tệp: báo sẵn sàng, rồi chờ cờ GO của driver. */
async function barrier() {
  if (NOBAR || !BARRIER) return;
  mkdirSync(BARRIER, { recursive: true });
  writeFileSync(join(BARRIER, `ready-${SID}`), String(t()));
  log('đã sẵn sàng, chờ cờ GO…');
  const deadline = t() + 900_000;
  while (t() < deadline) {
    if (existsSync(join(BARRIER, 'GO'))) return;
    await sleep(100);
  }
  throw new Error('rào chắn quá hạn 15 phút — driver không phát cờ GO');
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

  inPod(pod, 'docker run -d --name web -p 8080:80 nginx:alpine && sleep 2 && curl -s -o /dev/null http://localhost:8080/');
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
