#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run-load.sh — runner của P3/3.F. Chạy hai kịch bản k6, thu bằng chứng từ cụm,
# in bảng ô AC, thoát 1 nếu ô đỏ / 2 nếu KHÔNG ĐO ĐƯỢC.
#
# ⛔ HAI MÃ THOÁT KHÁC NHAU, CÓ CHỦ Ý (khuôn preflight của reaper-verify.sh):
#     exit 1 = đo được, và kết quả SAI.
#     exit 2 = KHÔNG đo được (cụm không tới, Prometheus câm, trạng thái đầu bẩn).
# Gộp hai thứ này là cách một phép đo hỏng đọc thành một hệ hỏng — hoặc tệ hơn,
# thành một hệ tốt.
#
# ⛔ CHẠY TỪ WINDOWS (Git Bash), KHÔNG TỪ VM. Xem `lib/config.js` §F1: generator
# tải nằm cùng chỗ với hệ nó đo sẽ ăn đúng phần CPU nó đang đo.
#
# ⛔ MỌI SỐ CỦA CỤM LẤY QUA `kubectl get --raw` (proxy apiserver), KHÔNG
# port-forward. Dưới NetworkPolicy của 3.B, port-forward tới Prometheus không đi
# được — cùng lý do `infra/observability/verify_observability.py` đã chọn đường này.
#
# ⛔ KHÔNG TRỘN ĐỒNG HỒ (plan 3.F §F4). k6 chạy trên Windows, metric đến từ VM, và
# hai đồng hồ lệch ~59s. Vì thế script này KHÔNG so mốc tuyệt đối giữa hai bên:
# nó lấy MẪU LIÊN TỤC suốt lượt rồi lấy MAX, và mọi khẳng định phía server là một
# HIỆU (delta) chứ không phải một mốc.
#
# ⛔ MỌI PHÉP QUAN SÁT CỤM CÓ BA GIÁ TRỊ: có / không / UNKNOWN. UNKNOWN luôn ĐỎ.
# `kubectl` vắng hoặc kubeconfig sai sẽ trả rỗng, và rỗng đọc thành "0 pod mồ
# côi" là đúng lỗi fail-OPEN mà 3.C vừa phải vá.
#
# Dùng:
#   bash infra/k6/run-load.sh
#   K6=/path/to/k6.exe bash infra/k6/run-load.sh
#   SKIP_EDGE=1 bash infra/k6/run-load.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K6="${K6:-k6}"
TARGET="${TARGET:-https://dlp.192.168.94.130.sslip.io:30443}"
NS_SANDBOX="${NS_SANDBOX:-dlp-sandbox}"
NS_MON="${NS_MON:-monitoring}"
PROM_SVC="${PROM_SVC:-kps-prometheus:9090}"
POOL_TARGET="${POOL_TARGET:-1}"
OUT="$HERE/out"
mkdir -p "$OUT"

fail=0
declare -a AC_ROWS
row() { AC_ROWS+=("$1"$'\t'"$2"$'\t'"$3"); [[ "$2" == "PASS" || "$2" == "SKIP" ]] || fail=1; }
die2() { echo; echo "⛔ KHÔNG ĐO ĐƯỢC: $1"; echo "   (exit 2 — khác hẳn 'đo được và sai')"; exit 2; }

promq() {
  local q="$1" enc
  enc="$(python -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$q")"
  kubectl get --raw \
    "/api/v1/namespaces/$NS_MON/services/$PROM_SVC/proxy/api/v1/query?query=$enc" 2>/dev/null
}

# In giá trị đầu tiên, hoặc RỖNG nếu không có mẫu. "Rỗng" KHÁC "0": một query
# rỗng vì sai tên metric sẽ đọc thành 0 nếu ta gán mặc định, và mọi ô dựa trên nó
# sẽ xanh vì metric KHÔNG TỒN TẠI. Chỗ gọi phải tự xử lý rỗng.
promq_scalar() { promq "$1" | jq -r '.data.result[0].value[1] // empty' 2>/dev/null; }

# Số pod SANDBOX còn sống. In "UNKNOWN" nếu không hỏi được (fail-CLOSED).
#
# ⛔ BA BỘ LỌC, MỖI CÁI VÌ MỘT LÝ DO ĐO ĐƯỢC — đếm thô "mọi pod trong namespace"
# đã cho kết quả sai ngay lượt chạy đầu:
#   1. `app=sandbox` — namespace này CÒN chạy CronJob `dlp-cni-canary`. Đếm cả
#      chúng thì preflight báo "trạng thái bẩn" trên một cụm hoàn toàn sạch.
#   2. Bỏ pod pha Succeeded/Failed — pod ở trạng thái TERMINAL không tính vào
#      ResourceQuota, nên chúng không chiếm khe session và không được đếm như thể có.
#   3. Bỏ pod có `deletionTimestamp` — pod đang Terminating vẫn hiện trong
#      `get pods` hàng chục giây; đếm nó là tự tạo ra một ô đỏ oan.
live_pods() {
  local j
  j="$(kubectl get pods -n "$NS_SANDBOX" -l app=sandbox -o json 2>/dev/null)" || { echo UNKNOWN; return; }
  [[ -z "$j" ]] && { echo UNKNOWN; return; }
  jq '[.items[]
       | select(.metadata.deletionTimestamp == null)
       | select(.status.phase != "Succeeded" and .status.phase != "Failed")] | length' \
    <<<"$j" 2>/dev/null || echo UNKNOWN
}

echo "══ 3.F — k6 load test tới trần CẤU HÌNH ══"
echo "target=$TARGET"
echo "k6: $($K6 version 2>&1 | head -1)"
echo

# ── 0. Tiền đề ───────────────────────────────────────────────────────────────
echo "── 0. Tiền đề (mọi thứ dưới đây thoát 2 nếu hỏng) ──"
kubectl get ns "$NS_SANDBOX" >/dev/null 2>&1 || die2 "kubectl không tới được namespace $NS_SANDBOX"
[[ -n "$(promq_scalar 'vector(1)')" ]] || die2 "Prometheus không trả lời qua proxy apiserver — kiểm 3.D trước"
[[ -n "$(promq_scalar 'max(dlp_pool_claimed_size)')" ]] \
  || die2 "metric dlp_pool_claimed_size KHÔNG có mẫu — mọi ô dựa trên nó sẽ MÙ"

QUOTA_HARD_CPU="$(kubectl get resourcequota -n "$NS_SANDBOX" -o jsonpath='{.items[0].status.hard.requests\.cpu}' 2>/dev/null)"
QUOTA_HARD_PODS="$(kubectl get resourcequota -n "$NS_SANDBOX" -o jsonpath='{.items[0].status.hard.pods}' 2>/dev/null)"
NODE_CPU_ALLOC="$(kubectl get nodes -o jsonpath='{.items[0].status.allocatable.cpu}' 2>/dev/null)"
NODE_CPU_REQ="$(kubectl describe node 2>/dev/null | grep -A5 'Allocated resources' | grep -oE '^  cpu +[0-9]+m' | head -1 | grep -oE '[0-9]+m')"
echo "quota: requests.cpu=$QUOTA_HARD_CPU pods=$QUOTA_HARD_PODS · node allocatable cpu=$NODE_CPU_ALLOC"

# ⛔ TRẠNG THÁI ĐẦU PHẢI SẠCH. ResourceQuota tính pod cho tới khi pod biến mất
# HẲN, và session chưa reap giữ pod tới hết TTL (1h). Chạy lượt thứ hai trên một
# cụm còn rác sẽ đo ra trần NHỎ HƠN thật — và ô AC vẫn "tự khai nguyên nhân là
# quota", đúng chữ mà sai số.
# ⛔ CHỜ GAUGE HỘI TỤ TRƯỚC KHI KẾT LUẬN "BẨN".
#
# `dlp_pool_claimed_size` là GAUGE do MỖI replica orchestrator tự publish theo
# nhịp đồng bộ pool của nó, và chart chạy 2 replica ⇒ `max()` lấy phải con số của
# replica chưa kịp làm mới. Đo được: `LLEN pool:claimed` = 0 (sự thật) trong khi
# `max(dlp_pool_claimed_size)` = 1 suốt vài chục giây.
#
# Fail ngay lập tức ở đây là biến ĐỘ TRỄ thành "bẩn" — một exit 2 sai. Nhưng nới
# thành "bỏ qua claimed" thì mất hẳn hàng rào. Đường đúng là **chờ hội tụ**: cụm
# bẩn thật sẽ vẫn bẩn sau khi chờ, cụm chỉ trễ gauge thì tự sạch.
SETTLE_MAX="${SETTLE_MAX:-120}"
t0="$(date +%s)"
while :; do
  PODS_BEFORE="$(live_pods)"
  [[ "$PODS_BEFORE" == "UNKNOWN" ]] && die2 "không đếm được pod trong $NS_SANDBOX"
  CLAIMED_BEFORE="$(promq_scalar 'max(dlp_pool_claimed_size)')"; CLAIMED_BEFORE="${CLAIMED_BEFORE%%.*}"
  CLAIMED_BEFORE="${CLAIMED_BEFORE:-0}"
  [[ "$CLAIMED_BEFORE" -eq 0 && "$PODS_BEFORE" -le "$POOL_TARGET" ]] && break
  el=$(( $(date +%s) - t0 ))
  if [[ "$el" -ge "$SETTLE_MAX" ]]; then
    die2 "trạng thái đầu BẨN sau ${el}s chờ (claimed=$CLAIMED_BEFORE, pod=$PODS_BEFORE, POOL_TARGET=$POOL_TARGET).
   Còn session của lượt trước đang giữ pod ⇒ trần đo được sẽ nhỏ hơn thật.
   Đợi reap/TTL hoặc reap tay, rồi chạy lại."
  fi
  echo "  chờ hội tụ… claimed=$CLAIMED_BEFORE pod=$PODS_BEFORE (${el}s/${SETTLE_MAX}s)"
  sleep 10
done
echo "trạng thái đầu SẠCH: pod sống=$PODS_BEFORE (POOL_TARGET=$POOL_TARGET) claimed=$CLAIMED_BEFORE"

# ⛔ KHÔNG TRỪ HAI MỐC COUNTER — dùng `increase()`.
#
# Bản đầu của bước này lấy `sum(dlp_claim_total{...})` trước/sau rồi trừ, và lượt
# chạy ngay sau một `helm upgrade` cho ra **Δ = −1**: counter của một replica
# orchestrator đã RESET khi pod rollout (chart chạy 2 replica, `sum()` gộp cả
# hai). Một hiệu ÂM đọc ra "server không ghi nhận gì" ⇒ ô AC-F1b đỏ oan trong khi
# hệ hoàn toàn đúng.
#
# `increase()` là hàm DUY NHẤT xử lý đúng counter reset. Cửa sổ suy ra từ THỜI
# LƯỢNG đo phía client (skew-miễn nhiễm — §F4), không từ mốc tuyệt đối.
T_START="$(date +%s)"
echo "mốc thời gian bắt đầu (đồng hồ client, chỉ dùng để tính THỜI LƯỢNG): $T_START"
echo

# ── 1. Pool user ─────────────────────────────────────────────────────────────
echo "── 1. Dựng pool user ──"
bash "$HERE/provision-users.sh" || die2 "không dựng được pool user"
echo

# ── 2. ceiling + lấy mẫu song song ───────────────────────────────────────────
echo "── 2. ceiling.js (đo trần session đồng thời) ──"
rm -f "$OUT/ceiling.rc"
(
  cd "$HERE" && "$K6" run --quiet \
    -e "USERS_FILE=$HERE/.users.json" \
    -e "SUMMARY_OUT=$OUT/ceiling-summary.json" \
    ceiling.js >"$OUT/ceiling.log" 2>&1
  echo "$?" >"$OUT/ceiling.rc"
) &
K6_PID=$!

MAX_CLAIMED=0; MAX_PODS=0; samples=0
while kill -0 "$K6_PID" 2>/dev/null; do
  c="$(promq_scalar 'max(dlp_pool_claimed_size)')"
  [[ -n "$c" ]] && { c="${c%%.*}"; [[ "$c" -gt "$MAX_CLAIMED" ]] && MAX_CLAIMED="$c"; }
  p="$(live_pods)"
  [[ "$p" != "UNKNOWN" && "$p" -gt "$MAX_PODS" ]] && MAX_PODS="$p"
  samples=$((samples + 1)); sleep 5
done
wait "$K6_PID" 2>/dev/null
CEIL_RC="$(cat "$OUT/ceiling.rc" 2>/dev/null || echo 1)"

echo "(đã lấy $samples mẫu trong lúc k6 chạy)"
sed -n 's/^.*msg="\(##CEILING##.*\)" *source=console.*$/\1/p;s/^.*msg="\( *#[0-9].*\)" *source=console.*$/\1/p' "$OUT/ceiling.log"
echo "k6 ceiling exit=$CEIL_RC · max(claimed)=$MAX_CLAIMED · max pod sống=$MAX_PODS"

m() { jq -r ".metrics.$1.values.count // 0" "$OUT/ceiling-summary.json" 2>/dev/null || echo 0; }
CREATED="$(m dlpk6_sessions_created)"; DISTINCT="$(m dlpk6_sessions_distinct)"
RQUOTA="$(m dlpk6_refused_quota)"; ROTHER="$(m dlpk6_refused_other)"
R5XX="$(m dlpk6_refused_5xx)"; QAS5="$(m dlpk6_quota_reported_as_5xx)"
CONNERR="$(m dlpk6_conn_errors)"
echo "created=$CREATED distinct=$DISTINCT refused{quota=$RQUOTA other=$ROTHER 5xx=$R5XX} quota_as_5xx=$QAS5 conn_err=$CONNERR"
echo

# ── 3. Đối chiếu chéo với server ─────────────────────────────────────────────
# ⛔ Đây là ô DUY NHẤT bắt được "k6 chạy sai địa chỉ": một TARGET sai không làm
# nhúc nhích counter phía server, trong khi mọi con số phía client vẫn đẹp.
sleep 20
WIN=$(( $(date +%s) - T_START + 60 ))  # +60s đệm cho độ trễ scrape
# `increase()` trả số THỰC (nội suy ở hai đầu cửa sổ), nên làm tròn xuống rồi so.
# Ngưỡng là `>= 1`, KHÔNG phải "bằng đúng số k6 báo": mục đích của ô này là bắt ca
# "k6 gọi nhầm hệ" — một TARGET sai cho 0 tuyệt đối — chứ không phải đối chiếu
# từng đơn vị, thứ mà phép nội suy của increase() không đảm bảo được.
D_OK="$(promq_scalar "sum(increase(dlp_claim_total{result=\"ok\"}[${WIN}s]))")"; D_OK="${D_OK%%.*}"; D_OK="${D_OK:-0}"
D_QB="$(promq_scalar "sum(increase(dlp_claim_total{result=\"quota_blocked\"}[${WIN}s]))")"; D_QB="${D_QB%%.*}"; D_QB="${D_QB:-0}"
PODS_AFTER="$(live_pods)"
CLAIMED_AFTER="$(promq_scalar 'max(dlp_pool_claimed_size)')"; CLAIMED_AFTER="${CLAIMED_AFTER%%.*}"
FREE_AFTER="$(promq_scalar 'max(dlp_pool_free_size)')"
echo "── 3. Đối chiếu server (increase over ${WIN}s) ── claim{ok}=$D_OK claim{quota_blocked}=$D_QB"
echo "pod sống sau=$PODS_AFTER (trước=$PODS_BEFORE) claimed=$CLAIMED_AFTER free=$FREE_AFTER"
echo

# ── 4. claim latency — TÁCH THEO path, kèm số mẫu ────────────────────────────
# ⛔ p95 trên 3–4 mẫu chỉ trả BIÊN BUCKET, một con số trông thật mà thực chất là
# lượng tử hoá; và gộp warm+cold thì chính comment ở metrics.go đã cảnh báo là
# "làm AC hoặc đỏ oan, hoặc (tệ hơn) được nới ra cho vừa".
echo "── 4. claim latency (tách theo path, kèm n) ──"
for p in warm cold; do
  n="$(promq_scalar "sum(increase(dlp_claim_duration_seconds_count{path=\"$p\"}[15m]))")"
  q="$(promq_scalar "histogram_quantile(0.95, sum(rate(dlp_claim_duration_seconds_bucket{path=\"$p\"}[15m])) by (le))")"
  echo "  path=$p n≈${n:-0} p95=${q:-<không mẫu>}s"
done
P95_ANY="$(promq_scalar 'histogram_quantile(0.95, sum(rate(dlp_claim_duration_seconds_bucket[15m])) by (le))')"
echo

# ── 5. edge ──────────────────────────────────────────────────────────────────
EDGE_RC=0
if [[ -z "${SKIP_EDGE:-}" ]]; then
  echo "── 5. edge.js (hỏng đúng kiểu ở biên) ──"
  ( cd "$HERE" && "$K6" run --quiet -e "SUMMARY_OUT=$OUT/edge-summary.json" edge.js ) >"$OUT/edge.log" 2>&1
  EDGE_RC=$?
  sed -n 's/^.*msg="\(##EDGE##.*\)" *source=console.*$/\1/p' "$OUT/edge.log"
  echo "k6 edge exit=$EDGE_RC"; echo
else
  echo "── 5. edge.js — BỎ QUA (SKIP_EDGE=1) ──"; echo
fi
me() { jq -r ".metrics.$1.values.count // 0" "$OUT/edge-summary.json" 2>/dev/null || echo 0; }
B429="$(me dlpk6_edge_burst_429)"; C429="$(me dlpk6_edge_control_429)"
BCONN="$(me dlpk6_edge_burst_conn_errors)"; CREQ="$(me dlpk6_edge_control_reqs)"

# ── 6. Bảng ô AC ─────────────────────────────────────────────────────────────
# AC-F1 — trần đo được. Đối chứng dương độc lập với N: session 1 VÀ 2 phải xanh.
if [[ "$DISTINCT" -ge 2 && "$RQUOTA" -ge 1 && "$ROTHER" -eq 0 ]]; then
  row "AC-F1 trần đồng thời" "PASS" \
    "N=$DISTINCT session id phân biệt; lượt #$((CREATED + 1)) bị quota chặn; max pod sống=$MAX_PODS max claimed=$MAX_CLAIMED"
elif [[ "$ROTHER" -gt 0 ]]; then
  row "AC-F1 trần đồng thời" "FAIL" "$ROTHER lượt bị từ chối vì lý do KHÁC quota — phép đo hỏng, không phải chạm trần"
elif [[ "$RQUOTA" -eq 0 ]]; then
  row "AC-F1 trần đồng thời" "FAIL" "tạo được $DISTINCT session, KHÔNG lượt nào bị quota chặn — chưa chạm trần, tăng USERS"
else
  row "AC-F1 trần đồng thời" "FAIL" "chỉ $DISTINCT session id phân biệt (cần ≥2) — xem có replay idempotent không"
fi

# AC-F1b — đối chiếu chéo server (bắt ca "chạy sai địa chỉ").
if [[ "$D_OK" -ge 1 && "$D_QB" -ge 1 ]]; then
  row "AC-F1b đối chiếu server" "PASS" \
    "increase ${WIN}s: claim{ok}=$D_OK (client báo $DISTINCT), claim{quota_blocked}=$D_QB — server CÓ ghi nhận lượt đo"
else
  row "AC-F1b đối chiếu server" "FAIL" \
    "increase ${WIN}s: claim{ok}=$D_OK claim{quota_blocked}=$D_QB (cần ≥1 cả hai) — k6 có đang gọi ĐÚNG hệ này không?"
fi

# AC-F2 — hỏng đúng kiểu + không rác để lại.
f2=""
[[ "$QAS5" -gt 0 ]] && f2+="quota báo về bằng 5xx x$QAS5; "
[[ "$R5XX" -gt 0 ]] && f2+="$R5XX lượt 5xx khác; "
[[ "$PODS_AFTER" == "UNKNOWN" ]] && f2+="KHÔNG đếm được pod sau (UNKNOWN); "
[[ "$PODS_AFTER" != "UNKNOWN" && "$PODS_AFTER" -gt "$PODS_BEFORE" ]] && f2+="pod tồn đọng ($PODS_BEFORE→$PODS_AFTER); "
if [[ -z "$f2" ]]; then
  row "AC-F2 hỏng đúng kiểu (quota)" "PASS" "quota trả lỗi có ngữ nghĩa; pod sống $PODS_BEFORE→$PODS_AFTER (không tồn đọng)"
else
  row "AC-F2 hỏng đúng kiểu (quota)" "FAIL" "$f2"
fi

# AC-F3 — 429 ở biên + đối chứng âm.
if [[ -n "${SKIP_EDGE:-}" ]]; then
  row "AC-F3 hỏng đúng kiểu (biên)" "SKIP" "SKIP_EDGE=1"
elif [[ "$B429" -ge 1 && "$C429" -eq 0 && "$CREQ" -ge 1 ]]; then
  row "AC-F3 hỏng đúng kiểu (biên)" "PASS" "burst→429 x$B429; đối chứng âm $CREQ lượt dưới ngưỡng→0 lượt 429"
else
  row "AC-F3 hỏng đúng kiểu (biên)" "FAIL" "burst429=$B429 (cần ≥1), control429=$C429 (cần 0), control_reqs=$CREQ (cần ≥1)"
fi

# AC-F4 — "bị chặn" ≠ "không kết nối được".
if [[ "$CONNERR" -eq 0 ]]; then
  row "AC-F4 chặn≠đứt kết nối" "PASS" "ceiling: 0 lỗi kết nối; edge burst: $BCONN lỗi kết nối (đếm RIÊNG, không cộng vào 429)"
else
  row "AC-F4 chặn≠đứt kết nối" "FAIL" "ceiling có $CONNERR lỗi kết nối — phép đo hỏng, KHÔNG phải hệ chạm trần"
fi

# AC-F6 — ghi số, không gác ngưỡng.
if [[ -n "$P95_ANY" ]]; then
  row "AC-F6 claim p95 (ghi số)" "PASS" "xem §4 (tách theo path + n); gộp=${P95_ANY}s tại N=$DISTINCT — KHÔNG gác ngưỡng"
else
  row "AC-F6 claim p95 (ghi số)" "FAIL" "không có mẫu dlp_claim_duration_seconds_bucket"
fi

echo "══ Bảng ô AC ══"
printf '%-32s %-6s %s\n' "Ô" "KẾT QUẢ" "Bằng chứng"
for r in "${AC_ROWS[@]}"; do IFS=$'\t' read -r a b c <<<"$r"; printf '%-32s %-6s %s\n' "$a" "$b" "$c"; done
echo
echo "Ô đóng ngoài script này:"
echo "  AC-F5 reaper → bash infra/k8s/reaper-verify.sh   (chạy TRÊN VM, sau lượt tải)"
echo "  AC-F7 e2e    → harness e2e P2 14/14 (chạy SAU khi pool đã về mức trước tải)"
echo "  AC-F8 chống xanh-giả → threshold trong ceiling.js/edge.js · k6 exit: ceiling=$CEIL_RC edge=$EDGE_RC"
[[ "$CEIL_RC" != 0 ]] && { echo "⚠ k6 ceiling thoát khác 0 — có threshold đỏ."; fail=1; }
[[ "$EDGE_RC" != 0 && -z "${SKIP_EDGE:-}" ]] && { echo "⚠ k6 edge thoát khác 0 — có threshold đỏ."; fail=1; }

echo
if [[ "$fail" == 0 ]]; then echo "KẾT LUẬN: mọi ô đo được đều XANH."; else echo "KẾT LUẬN: CÓ Ô ĐỎ (xem bảng)."; fi
exit "$fail"
