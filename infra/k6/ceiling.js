// ─────────────────────────────────────────────────────────────────────────────
// ceiling.js — P3/3.F kịch bản `ceiling`: đo TRẦN SESSION ĐỒNG THỜI (AC-F1, F2, F4).
//
// ⛔ TUẦN TỰ CÓ NHỊP, KHÔNG RAMP — và đây là quyết định trung tâm của chặng.
// Mọi VU dùng chung MỘT bucket IP (NodePort SNAT + một máy nguồn), nên một ramp
// song song sẽ đụng trần RATE-LIMIT (20/1m ở /ws, 120/1m ở web) rất lâu trước
// khi đụng trần QUOTA — và triệu chứng nó tạo ra là LỖI KẾT NỐI, không phải 429.
// 3.E đã đo đúng ca đó. Trộn hai trần vào một phép đo là cách chắc chắn nhất để
// ra một con số trông hợp lý mà không đo thứ nó tự nhận là đang đo.
//
// Vì thế: một VU, tạo session lần lượt cách nhau PACE_MS. Session giữ pod tới
// khi hết TTL hoặc bị reap, nên độ ĐỒNG THỜI vẫn tăng dần dù lệnh đi tuần tự.
//
// ⛔ KHÔNG MỞ WebSocket Ở KỊCH BẢN NÀY. Pod được cấp lúc `session.create`; giữ
// socket không giữ thêm gì. Mở WS ở đây chỉ đưa trần rate-limit /ws (burst 10)
// vào đúng phép đo đang cố tránh nó. WS là việc của `edge.js`.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import {
  TARGET, MAX_ATTEMPTS, TTL_SECONDS, PACE_MS, HOLD_SECONDS,
  OUTCOME, classify, sessionIdOf, jsonHeaders,
} from './lib/config.js';

// ⛔ COLD PATH DÀI HƠN TIMEOUT MẶC ĐỊNH CỦA k6 (60s) — review đối kháng bắt được.
// `POOL_TARGET=1`, nên từ session thứ 2 trở đi MỌI claim rẽ cold path: tạo pod
// Sysbox đồng bộ, boot systemd > 20s. `infra/pentest/lib/common.sh` đã phải dùng
// `-m 120` và ghi rõ hậu quả của timeout ngắn: client bỏ cuộc TRONG KHI
// orchestrator vẫn tạo pod ⇒ đẻ pod mồ côi. Với mặc định 60s, một hệ đang chạy
// ĐÚNG thiết kế sẽ làm ô AC-F4 đỏ oan VÀ ô AC-F2 đỏ vì pod mồ côi do chính phép
// đo sinh ra — hai ô đỏ vì một mặc định của công cụ.
const CREATE_TIMEOUT = __ENV.CREATE_TIMEOUT || '120s';

// ⛔ `open()` chỉ chạy được ở init context, và nó NÉM nếu thiếu file. Bọc lại để
// `k6 inspect` (cổng CI tĩnh) lint được kịch bản trên máy không có pool user.
// Dung sai dừng ở ĐÂY: thiếu user vẫn phải hỏng TO ở runtime — xem guard trong
// `default()`. Init im lặng + runtime im lặng mới là xanh giả.
let users = [];
try {
  users = JSON.parse(open(__ENV.USERS_FILE || './.users.json'));
} catch (e) {
  users = [];
}

const mCreated = new Counter('dlpk6_sessions_created');
const mDistinct = new Counter('dlpk6_sessions_distinct');
const mQuota = new Counter('dlpk6_refused_quota');
const mOther = new Counter('dlpk6_refused_other');
const m5xx = new Counter('dlpk6_refused_5xx');
const mQuotaAs5xx = new Counter('dlpk6_quota_reported_as_5xx');
const mConnErr = new Counter('dlpk6_conn_errors');
const mCreateMs = new Trend('dlpk6_create_ms', true);

export const options = {
  insecureSkipTLSVerify: true,
  vus: 1,
  iterations: 1,
  // Không đặt `maxDuration`: nó là option của SCENARIO, không phải top-level —
  // k6 v2.2.0 cảnh báo `unknown field` rồi bỏ qua, tức một trần tưởng là có mà
  // không có. Executor `shared-iterations` mặc định 10m; lượt này ~1.5 phút.
  thresholds: {
    // ⛔ AC-F8 — ô gác chống XANH GIẢ. Không có ngưỡng này thì một script trỏ sai
    // địa chỉ, hoặc thoát sớm, vẫn "xanh" vì nó không khẳng định gì. Dự án này đã
    // bị cắn đúng kiểu đó (`ckad-configmap-as-files` verify luôn `command not
    // found` ⇒ vế PASS bất khả).
    //
    // Ngưỡng để ở `>=1`, KHÔNG phải `>=3`: 3 là con số ta đang ĐO, không phải con
    // số ta khẳng định trước. Nướng dự đoán vào cổng thì cổng không còn đo được
    // nữa — nó chỉ xác nhận dự đoán. Trần thật do report ghi lại.
    // Cận dưới ĐỘC LẬP với N: quota 2100m/500m = 4 pod, nên 2 session đồng thời
    // là khả thi bất kể N thật là mấy. `>=2` vì thế ràng buộc thật, khác `>=N`
    // (tự tham chiếu) và khác `>=1` (quá lỏng, một hệ gần chết vẫn qua).
    dlpk6_sessions_created: ['count>=2'],
    // ⛔ Chống replay idempotent: `CreateSession` cùng `(userId, idempotencyKey)`
    // TRẢ LẠI session cũ với 200 OK và KHÔNG claim thêm pod (service.go
    // `replayIdempotent`). Đếm "lượt 2xx" mà không đếm "session id phân biệt"
    // thì N lượt lặp trên MỘT pod vẫn đọc ra "N session đồng thời".
    dlpk6_sessions_distinct: ['count>=2'],
    iterations: ['count>0'],
    // AC-F4 — lỗi kết nối ở nhánh tuần tự nghĩa là PHÉP ĐO hỏng, không phải hệ
    // chạm trần. Hai thứ này phải không bao giờ được cộng chung.
    dlpk6_conn_errors: ['count==0'],
    // ⛔ AC-F2 — lượt bị từ chối phải là QUOTA, không phải 401/400/429. Một lượt
    // chạy mà mọi claim chết ở tầng auth cũng "có lượt bị từ chối"; ngưỡng này
    // là thứ phân biệt "chạm trần" với "phép đo hỏng ở chỗ khác".
    dlpk6_refused_other: ['count==0'],
    dlpk6_refused_5xx: ['count==0'],
    // ⛔ AC-F2 vế "hỏng ĐÚNG KIỂU": chạm trần là trạng thái BÌNH THƯỜNG của một
    // nền tảng đầy chỗ, nên nó phải tới như một lỗi có ngữ nghĩa, không phải 500.
    // Orchestrator đã trả `codes.ResourceExhausted` kèm câu tiếng Việt cho người
    // dùng; ô này gác chỗ ngữ nghĩa ấy có sống sót qua biên BFF hay không.
    dlpk6_quota_reported_as_5xx: ['count==0'],
  },
};

function createSession(user, idx) {
  const body = JSON.stringify({
    userId: user.userId,
    tier: 1, // SANDBOX_TIER_SYSBOX
    ttlSeconds: TTL_SECONDS,
    // Key phải phân biệt tới từng LƯỢT, không tới từng giây: `common.sh` dùng
    // `$(date +%s)` (độ phân giải giây) và hai lượt trong cùng giây sẽ dùng
    // chung key ⇒ replay idempotent ⇒ "N session" thật ra là một session lặp N lần.
    idempotencyKey: `k6c-${idx}-${__VU}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`.slice(0, 64),
  });
  const t0 = Date.now();
  const res = http.post(`${TARGET}/api/trpc/session.create`, body, {
    headers: jsonHeaders(user.cookie),
    timeout: CREATE_TIMEOUT,
    tags: { op: 'session.create' },
  });
  mCreateMs.add(Date.now() - t0);
  return res;
}

function reap(user, sessionId) {
  const body = JSON.stringify({ sessionId, reason: 'k6-3f-cleanup', userId: user.userId });
  return http.post(`${TARGET}/api/trpc/session.reap`, body, {
    headers: jsonHeaders(user.cookie),
    tags: { op: 'session.reap' },
  });
}

export default function () {
  const attempts = Math.min(MAX_ATTEMPTS, users.length);
  if (attempts < 2) {
    throw new Error(
      `Cần ít nhất 2 user để đo trần (có ${users.length}). ` +
        'Chạy provision-users.sh trước — xem infra/k6/README.md.',
    );
  }

  const held = []; // {user, sessionId}
  const seenIds = {};
  const log = [];
  let refusedAt = null;
  let refusedKind = null;

  for (let i = 0; i < attempts; i++) {
    const user = users[i];
    const res = createSession(user, i);
    const c = classify(res);
    log.push(`  #${i + 1} ${c.outcome} code=${c.code} http=${c.http || res.status} ${c.detail}`);

    if (c.outcome === OUTCOME.CREATED) {
      mCreated.add(1);
      const sid = sessionIdOf(res.body);
      if (sid) {
        held.push({ user, sessionId: sid });
        if (!seenIds[sid]) { seenIds[sid] = 1; mDistinct.add(1); }
        else log.push(`  #${i + 1} ⚠ session id LẶP LẠI (${sid}) — replay idempotent, KHÔNG phải pod mới`);
      } else {
        log.push(`  #${i + 1} ⚠ 2xx nhưng KHÔNG đọc được session.id — không dọn được`);
      }
    } else {
      if (refusedAt === null) { refusedAt = i; refusedKind = c.outcome; }
      if (c.outcome === OUTCOME.REFUSED_QUOTA) {
        mQuota.add(1);
        // Chạm trần đã đúng, nhưng nó tới bằng mã nào mới là điều AC-F2 gác.
        if (c.http >= 500) {
          mQuotaAs5xx.add(1);
          log.push(
            `  #${i + 1} ⚠ ĐÚNG trần quota nhưng báo về bằng HTTP ${c.http}/${c.code} — ` +
              'ngữ nghĩa "hết chỗ, thử lại" bị xoá ở biên BFF',
          );
        }
      } else if (c.outcome === OUTCOME.REFUSED_5XX) {
        m5xx.add(1);
      } else if (c.outcome === OUTCOME.CONN_ERROR) {
        mConnErr.add(1);
      } else {
        mOther.add(1);
        log.push(
          `  #${i + 1} ⚠ bị từ chối vì lý do KHÁC quota (${c.code}) — ` +
            'đây là PHÉP ĐO HỎNG, không được đọc thành "chạm trần"',
        );
      }
    }

    // Dừng ngay khi gặp lượt bị từ chối ĐẦU TIÊN: trần đã lộ, tạo tiếp chỉ thêm
    // nhiễu và thêm rác phải dọn.
    if (refusedAt !== null) break;
    sleep(PACE_MS / 1000);
  }

  console.log(`##CEILING## giữ ${held.length} session (id phân biệt = ${
    Object.keys(seenIds).length
  }), lượt từ chối đầu tiên = ${
    refusedAt === null ? 'KHÔNG CÓ (hết user để thử)' : `#${refusedAt + 1} (${refusedKind})`
  }`);
  log.forEach((l) => console.log(l));

  if (refusedAt === null) {
    console.log(
      '##CEILING## ⚠ KHÔNG chạm trần: mọi lượt đều thành công. ' +
        'Trần > số user thử được ⇒ tăng USERS/MAX_ATTEMPTS rồi đo lại. ' +
        'Ô AC-F1 KHÔNG được ghi con số từ lượt này.',
    );
  }

  // Giữ đỉnh để `run-load.sh` lấy được mẫu Prometheus rơi vào lúc đông nhất.
  console.log(`##CEILING## giữ đỉnh ${HOLD_SECONDS}s để lấy mẫu metric`);
  sleep(HOLD_SECONDS);

  // Tự dọn: không để lượt đo ghim pod tới hết TTL và làm hỏng lượt chạy sau.
  let reaped = 0;
  for (const h of held) {
    const r = reap(h.user, h.sessionId);
    if (r.status >= 200 && r.status < 300) reaped++;
    else console.log(`##CEILING## reap ${h.sessionId} -> ${r.status}`);
    sleep(0.5);
  }
  console.log(`##CEILING## đã dọn ${reaped}/${held.length} session`);
}

export function handleSummary(data) {
  const out = __ENV.SUMMARY_OUT || './out/ceiling-summary.json';
  const res = {};
  res[out] = JSON.stringify(data, null, 2);
  res.stdout = '\n';
  return res;
}
