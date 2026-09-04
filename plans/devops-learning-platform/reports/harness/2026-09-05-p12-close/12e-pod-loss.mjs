/**
 * 12e-pod-loss.mjs — P12/12.E: pod của phiên ĐANG MỞ WS biến mất.
 *
 * Ca claim-gặp-pod-chết đã có từ P5. Đây là ca khác: người học đang gõ dở thì
 * pod bị thu hồi. Bốn thứ phải đúng:
 *   1. WS đóng bằng **4404 (SESSION_GONE)**, KHÔNG phải 1000.
 *   2. Câu tiếng Việt FE hiện ra khớp nhánh 4404 của session-machine.
 *   3. Phiên không kẹt (status rời khỏi ACTIVE).
 *   4. Khe quota được TRẢ (pods/requests.cpu giảm về mức trước).
 *
 * ⛔ VÌ SAO VẾ 1 LÀ VẾ KHÓ, KHÔNG PHẢI VẾ HIỂN NHIÊN.
 * Xoá pod làm `StreamWithContext` trả `CodeExitError` với `ExitStatus()==137`
 * (SIGKILL) — KHÔNG phân biệt được với một `kill -9` hợp lệ do chính người học
 * gõ trong pod. Bridge nào coi mọi `CodeExitError` là "thoát bình thường" sẽ
 * đóng bằng `1000`, và FE đọc thành "người dùng tự gõ exit, đừng retry" — sai
 * hẳn nguyên nhân, và người học không được báo là pod đã bị thu hồi.
 * Gateway BẮT BUỘC tra Redis trước khi chọn mã (docs/ws-terminal-protocol.md §6).
 * Bài kiểm này là thứ chứng minh nó thật sự tra.
 *
 * ⚠ Xoá pod bằng tay làm LỆCH warm pool (orchestrator có thể giao lại tên pod
 * đã chết — `kubectl-delete-desyncs-warm-pool`). Chấp nhận trong bài kiểm này vì
 * ĐÓ CHÍNH LÀ ca cần dựng; script chờ reaper/pool ổn định lại ở cuối và báo ra.
 *
 * Dùng: node 12e-pod-loss.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTerminal } from '../2026-08-16-3i-concurrent-build/wsterm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..');
const BASE = process.env.BASE_URL ?? 'https://dlp.192.168.94.130.sslip.io:30443';
const ORIGIN = process.env.ORIGIN ?? BASE;
const NS = 'dlp-sandbox';

const kc = (a) => execFileSync('kubectl', a, { encoding: 'utf8', maxBuffer: 16e6 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const users = JSON.parse(readFileSync(join(ROOT, 'infra', 'k6', '.users.json'), 'utf8'));

// Dùng user CUỐI pool để không đụng 10 user đầu mà soak đang giữ.
let cookie = users[users.length - 1].cookie;
function soak(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const p = raw.split(';')[0];
    if (!p?.includes('=')) continue;
    const n = p.split('=')[0];
    cookie = cookie.split('; ').filter((c) => c && !c.startsWith(`${n}=`)).concat(p).join('; ');
  }
}
async function trpc(proc, input) {
  const r = await fetch(`${BASE}/api/trpc/${proc}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify(input),
  });
  soak(r);
  const b = await r.json();
  if (b.error) throw new Error(`${proc}: ${b.error.message ?? JSON.stringify(b.error)}`);
  return b.result.data;
}
const quota = () => {
  const q = JSON.parse(kc(['get', 'resourcequota', '-n', NS, '-o', 'json'])).items[0].status.used;
  return { pods: Number(q.pods), cpu: q['requests.cpu'] };
};

const ket = { buoc: [] };
const ghi = (ten, dat, chiTiet) => {
  ket.buoc.push({ ten, dat, chiTiet });
  console.log(`${dat ? '✅' : '❌'} ${ten} — ${chiTiet}`);
};

const qTruoc = quota();
console.log(`quota trước: pods=${qTruoc.pods} cpu=${qTruoc.cpu}`);

const started = await trpc('lessons.startSession',
  { scenarioId: 'dlp-sandbox-basics', idempotencyKey: `p12e-${Date.now()}` });
const sessionId = started.session.id;
const pod = started.session.podName;
console.log(`phiên=${sessionId} pod=${pod}`);

const term = await openTerminal({ base: BASE, sessionId, cookie, origin: ORIGIN });
console.log(`WS mở: handshake=${term.handshakeMs}ms ready=${term.readyMs}ms`);

// Gõ vài phím để chứng minh phiên ĐANG SỐNG trước khi xoá — nếu không, một WS
// đã chết sẵn cũng cho ra "đóng 4404" và bài kiểm sẽ xanh vì lý do khác.
let echoed = 0;
// Giữ MỌI control frame: gateway gửi {type:"exit",exitCode:N} NGAY TRƯỚC khi
// đóng, và `exitCode` là bằng chứng duy nhất nói vì sao nó chọn mã đóng ấy.
// Không bắt nó thì "đóng 1000" chỉ là một triệu chứng không có nguyên nhân.
const controls = [];
term.onData((f) => {
  if (f.opcode === 0x2) { echoed += 1; return; }
  if (f.opcode === 0x1) {
    try { controls.push(JSON.parse(f.payload.toString('utf8'))); } catch { /* bỏ */ }
  }
});
term.send(Buffer.from('x', 'utf8'), 0x2);
await sleep(1500);
ghi('phiên sống trước khi xoá (có tiếng vọng)', echoed > 0, `${echoed} frame stdout`);

const qGiua = quota();
const tXoa = Date.now();
console.log(`→ xoá pod ${pod} …`);
kc(['delete', 'pod', '-n', NS, pod, '--wait=false']);

const closed = await term.waitClose(120_000);
const dt = Date.now() - tXoa;
const ctlExit = controls.filter((c) => c.type === 'exit').at(-1) ?? null;
console.log(`WS đóng sau ${dt}ms: code=${closed.code} reason=${JSON.stringify(closed.reason)}`);
console.log(`control cuối: ${JSON.stringify(controls.slice(-3))}`);

// ── Vế 1: mã đóng ────────────────────────────────────────────────────────────
ghi('WS đóng bằng 4404 (SESSION_GONE), không phải 1000', closed.code === 4404,
  `code=${closed.code} · exitCode gateway báo=${ctlExit ? ctlExit.exitCode : '(không có frame exit)'}` +
  (closed.code === 1000
    ? ` ⇒ ĐUA: exit=137 nên isSignalExit() ĐÚNG là true và gateway CÓ tra Redis`
      + `, nhưng lúc stream đứt (~350ms sau khi xoá) Redis vẫn ghi phiên còn sống`
      + `, nên nhánh "người dùng tự kill -9" thắng. Redis chỉ đổi sang trạng thái`
      + ` kết thúc SAU đó.`
    : ''));

// ── Vế 2: câu tiếng Việt của FE cho nhánh này ───────────────────────────────
// Đọc THẲNG từ session-machine (nguồn thật FE dùng) thay vì chép lại chuỗi vào
// đây — chép lại thì test vẫn xanh sau khi ai đó đổi câu trong FE.
const smSrc = readFileSync(join(ROOT, 'packages', 'terminal', 'src', 'session-machine.ts'), 'utf8');
// ⚠ Cắt tới `case` KẾ TIẾP, đừng cắt cứng N ký tự. Bản đầu dùng slice(0,400)
// và khối này có 5 dòng chú thích nên chuỗi `message:` nằm ở ~ký tự 430 — bị
// cắt cụt, và ô AC đỏ oan trong khi FE hoàn toàn đúng.
const khoiGone = (smSrc.split('case CloseCode.SESSION_GONE:')[1] ?? '').split('case ')[0];
const cauVN = khoiGone.match(/message:\s*'([^']+)'/)?.[1] ?? '';
ghi('session-machine có câu tiếng Việt cho 4404', cauVN.length > 0 && /[àâăêôơưđáạảãí]/i.test(cauVN),
  JSON.stringify(cauVN));

// ── Vế 3: phiên không kẹt — đọc THẲNG Redis, nguồn gateway tự tra ─────────
// KHÔNG dùng `me.activeSessions`: router đó là việc của P13 và CHƯA có trong
// image đang chạy trên cụm (dlp-web:p10a) ⇒ "No procedure found", một ô đỏ nói
// về image chứ không nói về phiên. Redis `session:{id}` là thứ contract §6 chỉ
// đích danh, nên nó đúng cả trước lẫn sau khi P13 lên.
let trangThai = '?';
const redisPod = kc(['get', 'pods', '-n', 'default', '--no-headers',
  '-o', 'custom-columns=:metadata.name'])
  .split('\n').map((x) => x.trim()).find((x) => x.includes('redis')) ?? '';
// ⛔ REDIS ĐÒI MẬT KHẨU. Bản đầu gọi `redis-cli` trần và nhận lại chuỗi
// "NOAUTH Authentication required." — MỘT dòng, không rỗng — nên nhánh dưới
// đọc nó thành "phiên CÒN" và ô AC đỏ oan trong khi phiên đã REAPED đàng hoàng.
// Đúng lớp bẫy `probe-failing-open-makes-ac-lie`: lỗi của LỆNH đọc thành kết
// quả của HỆ. Nay xác thực bằng $REDIS_PASSWORD lấy từ env CỦA CHÍNH POD (mật
// khẩu không rời pod, không vào log, không vào file kết quả) và bắt lỗi tường minh.
const redisHGetAll = (key) => kc(['exec', '-n', 'default', redisPod, '--', 'sh', '-c',
  `redis-cli --no-auth-warning -a "$REDIS_PASSWORD" HGETALL ${key} 2>/dev/null`]).trim();
for (let i = 0; i < 30; i += 1) {
  try {
    const raw = redisHGetAll(`session:${sessionId}`);
    if (/NOAUTH|WRONGTYPE|ERR /i.test(raw)) {
      trangThai = `probe hỏng: ${raw.slice(0, 60)}`; break; // KHÔNG đọc lỗi thành trạng thái
    }
    if (raw === '') { trangThai = 'KHÔNG CÒN'; break; }
    const m = raw.split('\n').map((x) => x.trim());
    const si = m.indexOf('status');
    trangThai = si >= 0 ? m[si + 1] : `CÒN (${m.length} field)`;
    if (/EXPIRED|REAPED|ENDED/i.test(trangThai)) break;
  } catch (e) { trangThai = `lỗi đọc redis: ${String(e.message).slice(0, 70)}`; break; }
  await sleep(2000);
}
// Khẳng định đúng thứ tên ô nói: KHÔNG kẹt ở ACTIVE. Liệt kê danh sách trạng
// thái kết thúc là sai hướng — bản đầu chỉ nhận EXPIRED|REAPED|ENDED nên `FAILED`
// (một kết cục hợp lệ) đọc thành đỏ. Quan sát được cả REAPED lẫn FAILED giữa hai
// lượt: ai phát hiện pod chết trước thì ghi trạng thái của người đó.
const ketThuc = trangThai === 'KHÔNG CÒN'
  || (!/^probe hỏng/.test(trangThai) && !/ACTIVE|CÒN \(/i.test(trangThai));
ghi('phiên không kẹt ở ACTIVE', ketThuc, `redis session:{id} ⇒ ${trangThai}`);

// ── Vế 4: khe quota được trả ────────────────────────────────────────────────
let qSau = quota();
for (let i = 0; i < 45 && qSau.pods > qTruoc.pods; i += 1) {
  await sleep(2000);
  qSau = quota();
}
ghi('khe quota được trả', qSau.pods <= qTruoc.pods,
  `trước=${qTruoc.pods} giữa=${qGiua.pods} sau=${qSau.pods} (cpu ${qTruoc.cpu}→${qSau.cpu})`);

try { await trpc('lessons.endSession', { sessionId }); } catch { /* đã chết rồi */ }

ket.tomTat = {
  closeCode: closed.code, closeReason: closed.reason, msDongSauXoa: dt,
  exitCodeGatewayBao: ctlExit ? ctlExit.exitCode : null, controlFrames: controls.slice(-5),
  cauTiengViet: cauVN, quota: { truoc: qTruoc, giua: qGiua, sau: qSau },
};
ket.dat = ket.buoc.every((b) => b.dat);
writeFileSync(join(HERE, '12e-result.json'), JSON.stringify(ket, null, 2));
console.log(`\n${ket.dat ? 'ĐẠT' : 'CHƯA ĐẠT'} — → 12e-result.json`);
process.exitCode = ket.dat ? 0 : 1;
