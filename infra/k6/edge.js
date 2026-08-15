// ─────────────────────────────────────────────────────────────────────────────
// edge.js — P3/3.F kịch bản `edge`: hệ có hỏng ĐÚNG KIỂU ở biên không (AC-F3, F4).
//
// Đo trần rate-limit WS handshake (20/1m, burst 10 — `values.yaml`
// › ingress.middleware.rateLimit) và khẳng định khi vượt thì ra **429 của
// Traefik**, không phải 5xx và không phải đứt kết nối.
//
// ⛔ VÌ SAO KHÔNG DÙNG MODULE WS NÀO CẢ. Ta đang đo BIÊN, không đo terminal:
// middleware rate-limit của Traefik gắn theo ROUTER (đường `/ws`), nên nó bắn
// trước khi request đi tới gateway và trước cả bước upgrade. Một request HTTP
// mang đủ header nâng cấp là đủ để router đếm — và nó trả về MÃ TRẠNG THÁI đọc
// được sạch, trong khi thư viện WS gói mọi thứ hỏng thành "connection failed",
// tức xoá đúng sự phân biệt 429-vs-đứt-kết-nối mà AC-F4 tồn tại để giữ.
//
// ⛔ VÌ SAO KHÔNG CẦN ĐĂNG NHẬP. Không cookie `dlp_sandbox` ⇒ gateway từ chối
// TRƯỚC upgrade bằng mã HTTP thật (ws-terminal-protocol §7). Nên dưới ngưỡng ta
// thấy 4xx-của-gateway, trên ngưỡng ta thấy 429-của-Traefik. Chính sự KHÁC NHAU
// giữa hai mã đó là phép đo — và nó cô lập tầng biên khỏi mọi thứ phía sau.
//
// ⛔ 429 TRÊN ĐƯỜNG `/ws` CHỈ CÓ THỂ LÀ CỦA TRAEFIK. Đường này proxy thẳng tới
// gateway Go; `apps/web` (Next) không nằm trên đường đi, nên lớp rate-limit của
// Next không thể phát ra mã này. Đây là lập luận CẤU TRÚC, chặt hơn cách phân
// biệt bằng body mà AC-A3 phải dùng cho đường `/`. Body vẫn được ghi làm bằng chứng.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'k6/http';
import { sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { TARGET, ORIGIN } from './lib/config.js';

// Bucket refill 20/1m ⇒ ~1 lượt/3s, burst 10. Sau một lượt burst (kể cả của lần
// chạy TRƯỚC), bucket cần thời gian hồi. Không chờ thì pha đối chứng âm sẽ thấy
// 429 và đọc thành "đối chứng âm đỏ" — một kết luận sai từ một bucket chưa hồi.
const SETTLE_S = Number(__ENV.SETTLE_S || 40);
const CONTROL_N = Number(__ENV.CONTROL_N || 4);
const CONTROL_GAP_S = Number(__ENV.CONTROL_GAP_S || 4);
const BURST_N = Number(__ENV.BURST_N || 40);

const mCtlReq = new Counter('dlpk6_edge_control_reqs');
const mCtl429 = new Counter('dlpk6_edge_control_429');
const mBurst429 = new Counter('dlpk6_edge_burst_429');
const mBurstConnErr = new Counter('dlpk6_edge_burst_conn_errors');
const mBurst5xx = new Counter('dlpk6_edge_burst_5xx');

export const options = {
  insecureSkipTLSVerify: true,
  vus: 1,
  iterations: 1,
  maxDuration: `${SETTLE_S + CONTROL_N * CONTROL_GAP_S + BURST_N + 180}s`,
  thresholds: {
    // AC-F3 vế chính — vượt ngưỡng PHẢI thấy 429. Không thấy nghĩa là middleware
    // rate-limit không gắn vào router `/ws`, tức luật 5 thủng ở đúng chỗ 3.A dựng.
    dlpk6_edge_burst_429: ['count>=1'],
    // AC-F3 đối chứng âm — dưới ngưỡng KHÔNG được 429. Thiếu vế này thì "thấy
    // 429" không phân biệt được với "mọi request đều 429" (cấu hình quá tay).
    dlpk6_edge_control_429: ['count==0'],
    // Ô gác chống XANH GIẢ: đối chứng âm phải thật sự có chạy request.
    dlpk6_edge_control_reqs: [`count>=${CONTROL_N}`],
    // AC-F2/F4 — hỏng đúng kiểu: không 5xx.
    dlpk6_edge_burst_5xx: ['count==0'],
  },
};

function handshake(tag) {
  return http.get(`${TARGET}/ws`, {
    headers: {
      origin: ORIGIN,
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-websocket-version': '13',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-protocol': 'dlp.terminal.v1',
    },
    tags: { phase: tag },
  });
}

export default function () {
  console.log(`##EDGE## đợi ${SETTLE_S}s cho bucket rate-limit hồi trước khi đo`);
  sleep(SETTLE_S);

  // ── Pha 1 — đối chứng âm: dưới ngưỡng ─────────────────────────────────────
  const ctlCodes = [];
  for (let i = 0; i < CONTROL_N; i++) {
    const r = handshake('control');
    mCtlReq.add(1);
    ctlCodes.push(r.status);
    if (r.status === 429) mCtl429.add(1);
    sleep(CONTROL_GAP_S);
  }
  console.log(`##EDGE## đối chứng âm (${CONTROL_N} lượt cách ${CONTROL_GAP_S}s): mã = ${ctlCodes.join(',')}`);

  // ── Pha 2 — burst vượt ngưỡng ─────────────────────────────────────────────
  const tally = {};
  let firstBody429 = '';
  for (let i = 0; i < BURST_N; i++) {
    const r = handshake('burst');
    const code = r.status === 0 ? '000' : String(r.status);
    tally[code] = (tally[code] || 0) + 1;
    if (r.status === 429) {
      mBurst429.add(1);
      if (!firstBody429) firstBody429 = String(r.body || '').replace(/\s+/g, ' ').slice(0, 120);
    } else if (r.status === 0) {
      mBurstConnErr.add(1);
    } else if (r.status >= 500) {
      mBurst5xx.add(1);
    }
  }
  console.log(`##EDGE## burst ${BURST_N} lượt không nghỉ: ${JSON.stringify(tally)}`);
  console.log(`##EDGE## body của 429 đầu tiên: "${firstBody429}"`);
  console.log(
    '##EDGE## ghi chú AC-F4: "000" là ĐỨT KẾT NỐI, không phải "bị chặn". ' +
      'Hai con số này cố ý đếm riêng.',
  );
}

export function handleSummary(data) {
  const out = __ENV.SUMMARY_OUT || './out/edge-summary.json';
  const res = {};
  res[out] = JSON.stringify(data, null, 2);
  res.stdout = '\n';
  return res;
}
