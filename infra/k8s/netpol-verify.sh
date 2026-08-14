#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# netpol-verify.sh — kiểm TỪNG CHIỀU của NetworkPolicy namespace nền tảng (P3/3.B)
#
# Kiểm CẢ HAI VẾ, và vế thứ hai mới là vế có giá trị:
#   · PASS  — chiều BẮT BUỘC phải thông. Đứt một chiều ở đây là tính năng chết,
#             trong khi mọi pod vẫn Running 1/1 và không cổng nào khác đỏ.
#   · BLOCK — chiều BẮT BUỘC phải bị chặn. Thiếu vế này thì "đã áp default-deny"
#             chỉ chứng minh có một object tồn tại, KHÔNG chứng minh có hàng rào:
#             trên cụm mà CNI không thực thi NetworkPolicy, mọi vế PASS vẫn xanh
#             y hệt. Vế BLOCK là thứ duy nhất phân biệt hai trường hợp đó.
#
# ⛔ CÁCH PROBE — VÀ VÌ SAO KHÔNG PHẢI `kubectl exec` VÀO POD THẬT.
# Ba service Go chạy image distroless: KHÔNG shell, không nc, không curl — `exec`
# vào đó không chạy được gì. Nên script dựng pod probe mang ĐÚNG BỘ NHÃN của
# component nguồn. NetworkPolicy phân biệt theo NHÃN, nên pod probe chịu đúng
# policy mà pod thật chịu.
#
# ⛔ VÀ VÌ SAO POD PROBE PHẢI VĨNH VIỄN NOT-READY.
# Selector của Service `platform-web` là đúng ba nhãn đó. Một pod probe mang nhãn
# `component=web` mà Ready sẽ được thêm vào endpoint của Service và NHẬN LƯU
# LƯỢNG NGƯỜI DÙNG THẬT — tức script chẩn đoán tự làm hỏng site nó đang chẩn.
# `readinessProbe: exec false` giữ nó ngoài endpoint (Service chỉ định tuyến tới
# endpoint Ready) trong khi NetworkPolicy vẫn áp bình thường: policy không quan
# tâm readiness.
#
# ⛔ PHÂN BIỆT "BỊ CHẶN" VỚI "BỊ TỪ CHỐI".
# `nc` trả về cùng exit code 1 cho cả hai. Script vì thế ĐO THỜI GIAN: bị policy
# chặn = gói bị THẢ = chờ tới hết timeout (≈ TIMEOUT giây); bị từ chối = RST về
# ngay (≈ 0s). Một ô BLOCK "xanh" nhờ dịch vụ chết chứ không nhờ hàng rào sẽ lộ
# ra ở cột thời gian. Không có cột đó thì hai nguyên nhân đọc ra giống hệt nhau.
#
# Dùng:
#   bash netpol-verify.sh                 # namespace default
#   NS=foo bash netpol-verify.sh
# Thoát 1 nếu bất kỳ chiều nào lệch mong đợi.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

NS="${NS:-default}"
RELEASE="${RELEASE:-platform}"
CHART_NAME="${CHART_NAME:-platform}"
IMAGE="${IMAGE:-busybox:1.36}"
TIMEOUT="${TIMEOUT:-3}"
PROBE_PREFIX="netpol-probe"

# Endpoint THẬT của apiserver — không phải ClusterIP. NetworkPolicy được đánh giá
# sau DNAT nên đây mới là đích policy nhìn thấy (xem chú thích khối 2 của
# templates/platform-networkpolicy.yaml).
APISERVER="$(kubectl get endpoints kubernetes -n default \
  -o jsonpath='{.subsets[0].addresses[0].ip}:{.subsets[0].ports[0].port}' 2>/dev/null)"
if [[ -z "$APISERVER" || "$APISERVER" == ":" ]]; then
  echo "LỖI: không đọc được endpoint apiserver — không thể kiểm chiều quan trọng nhất." >&2
  exit 1
fi
API_HOST="${APISERVER%:*}"
API_PORT="${APISERVER##*:}"

PASS=0
FAIL=0
ROWS=()

cleanup() {
  kubectl delete pod -n "$NS" -l "netpol-probe=true" --force --grace-period=0 \
    --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

# probe_pod <name-suffix> <component|NONE>
# Dựng pod probe. component=NONE ⇒ pod LẠ: không nhãn release nào, dùng cho AC-B2.
probe_pod() {
  # ⛔ BA DÒNG `local` RIÊNG, KHÔNG GỘP MỘT DÒNG. Bash khai triển TẤT CẢ tham số
  # của builtin `local` TRƯỚC khi builtin chạy, nên `local a="$1" b="${a}"` đọc
  # `a` lúc nó còn chưa được đặt — dưới `set -u` là "unbound variable", còn
  # không có `set -u` thì lặng lẽ ra chuỗi rỗng (tệ hơn nhiều).
  local suffix="$1"
  local component="$2"
  local name="${PROBE_PREFIX}-${suffix}"
  local labels="    netpol-probe: \"true\""
  if [[ "$component" != "NONE" ]]; then
    labels="${labels}
    app.kubernetes.io/name: ${CHART_NAME}
    app.kubernetes.io/instance: ${RELEASE}
    app.kubernetes.io/component: ${component}"
  fi
  kubectl delete pod -n "$NS" "$name" --force --grace-period=0 >/dev/null 2>&1 || true
  cat <<EOF | kubectl apply -f - >/dev/null
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: ${NS}
  labels:
${labels}
spec:
  restartPolicy: Never
  # Không cầm token ServiceAccount: pod probe không cần gọi apiserver bằng danh
  # tính nào, và một token thừa trong pod chẩn đoán là một token thừa.
  automountServiceAccountToken: false
  containers:
    - name: probe
      image: ${IMAGE}
      imagePullPolicy: Never
      command: ['sh', '-c', 'sleep 900']
      # ⛔ Giữ pod VĨNH VIỄN NOT-READY để Service không bao giờ định tuyến tới nó.
      # Xem chú thích đầu file — thiếu dòng này, pod probe mang nhãn component=web
      # sẽ nhận lưu lượng người dùng thật.
      readinessProbe:
        exec:
          command: ['false']
        periodSeconds: 5
EOF
  # Chờ container chạy (KHÔNG chờ Ready — nó sẽ không bao giờ Ready, có chủ đích).
  for _ in $(seq 1 60); do
    local phase
    phase="$(kubectl get pod -n "$NS" "$name" -o jsonpath='{.status.phase}' 2>/dev/null)"
    [[ "$phase" == "Running" ]] && return 0
    sleep 1
  done
  echo "LỖI: pod probe ${name} không lên Running" >&2
  kubectl describe pod -n "$NS" "$name" 2>&1 | tail -15 >&2
  return 1
}

# check <mô tả> <pod-suffix> <host> <port> <PASS|BLOCK>
check() {
  local desc="$1"
  local suffix="$2"
  local host="$3"
  local port="$4"
  local expect="$5"
  local name="${PROBE_PREFIX}-${suffix}"   # tách dòng — xem probe_pod
  local start end dur rc got mark
  start="$(date +%s%N)"
  kubectl exec -n "$NS" "$name" -c probe -- \
    nc -z -w "$TIMEOUT" "$host" "$port" >/dev/null 2>&1
  rc=$?
  end="$(date +%s%N)"
  dur=$(( (end - start) / 1000000 ))
  [[ $rc -eq 0 ]] && got="PASS" || got="BLOCK"

  if [[ "$got" == "$expect" ]]; then
    mark="OK  "; PASS=$((PASS + 1))
  else
    mark="LỆCH"; FAIL=$((FAIL + 1))
  fi
  ROWS+=("$(printf '%s | %-46s | %-5s | %-5s | %6sms' "$mark" "$desc" "$expect" "$got" "$dur")")
  printf '%s %-46s muốn=%-5s được=%-5s %6sms\n' "$mark" "$desc" "$expect" "$got" "$dur"
}

echo "namespace=$NS  release=$RELEASE  apiserver=$APISERVER  timeout=${TIMEOUT}s"
echo "dựng pod probe…"
probe_pod web web           || exit 1
probe_pod gw gateway        || exit 1
probe_pod orch orchestrator || exit 1
probe_pod migrate migrate   || exit 1
probe_pod stray NONE        || exit 1
echo

echo "── VẾ 1/2: các chiều BẮT BUỘC THÔNG ──────────────────────────────────────"
# Mọi ô dưới đây gọi bằng TÊN Service, nên một ô xanh đồng thời chứng minh DNS
# tới CoreDNS còn thông — không cần ô DNS riêng, và nếu DNS đứt thì TẤT CẢ đỏ
# cùng lúc, tự nó là một dấu hiệu phân biệt được.
check "web → gateway:8082 (chấm bài)"           web  "${RELEASE}-gateway"      8082 PASS
check "web → orchestrator:9090 (gRPC session)"  web  "${RELEASE}-orchestrator" 9090 PASS
check "web → postgres:5432 (Better Auth)"       web  "${RELEASE}-postgres"     5432 PASS
check "web → redis:6379"                        web  "${RELEASE}-redis"        6379 PASS
check "gateway → web:3000 (JWKS)"               gw   "${RELEASE}-web"          3000 PASS
check "gateway → orchestrator:9090 (extend)"    gw   "${RELEASE}-orchestrator" 9090 PASS
check "gateway → redis:6379 (authz phiên)"      gw   "${RELEASE}-redis"        6379 PASS
check "gateway → apiserver (pods/exec)"         gw   "$API_HOST"        "$API_PORT" PASS
check "orchestrator → postgres:5432 (audit)"    orch "${RELEASE}-postgres"     5432 PASS
check "orchestrator → redis:6379 (pool)"        orch "${RELEASE}-redis"        6379 PASS
check "orchestrator → apiserver (tạo/xoá pod)"  orch "$API_HOST"        "$API_PORT" PASS
check "migrate → postgres:5432 (helm hook)"     migrate "${RELEASE}-postgres"  5432 PASS
echo

echo "── VẾ 2/2: các chiều BẮT BUỘC BỊ CHẶN (vế làm cho vế trên có nghĩa) ──────"
# AC-B2: pod LẠ trong chính namespace nền tảng không được chạm datastore.
check "POD LẠ → postgres:5432   [AC-B2]"        stray "${RELEASE}-postgres"    5432 BLOCK
check "POD LẠ → redis:6379      [AC-B2]"        stray "${RELEASE}-redis"       6379 BLOCK
check "POD LẠ → web:3000"                       stray "${RELEASE}-web"         3000 BLOCK
check "POD LẠ → apiserver"                      stray "$API_HOST"       "$API_PORT" BLOCK
# Phân quyền ngang: gateway/migrate không có việc gì với các đích này.
check "gateway → postgres:5432 (không phận sự)" gw   "${RELEASE}-postgres"     5432 BLOCK
check "migrate → redis:6379 (không phận sự)"    migrate "${RELEASE}-redis"     6379 BLOCK
check "orchestrator → web:3000 (không phận sự)" orch "${RELEASE}-web"          3000 BLOCK
# web KHÔNG được nói chuyện với apiserver: nó là pod đứng trước internet.
check "web → apiserver (leo thang)"             web  "$API_HOST"        "$API_PORT" BLOCK
# Rò egress ra ngoài cụm (webExternalEgress mặc định tắt).
check "web → internet 1.1.1.1:443"              web  "1.1.1.1"                  443 BLOCK
echo

echo "════════════════════════════════════════════════════════════════════════"
printf '%s\n' "${ROWS[@]}"
echo "════════════════════════════════════════════════════════════════════════"
echo "PASS-đúng-mong-đợi: $PASS    LỆCH: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo
  echo "CÓ CHIỀU LỆCH MONG ĐỢI."
  echo "  · Ô 'muốn=PASS được=BLOCK' ⇒ thiếu một rule allow: tính năng tương ứng"
  echo "    đang chết trong khi pod vẫn Running 1/1."
  echo "  · Ô 'muốn=BLOCK được=PASS' ⇒ hàng rào KHÔNG có thật. Nếu TẤT CẢ ô BLOCK"
  echo "    đều PASS thì nghi CNI không thực thi NetworkPolicy chứ đừng sửa policy."
  exit 1
fi
echo "Mọi chiều khớp mong đợi."
