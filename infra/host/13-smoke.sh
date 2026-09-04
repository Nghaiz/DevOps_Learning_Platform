#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 13-smoke.sh — cổng smoke SAU deploy (P5 / 5.E).
#
# VÌ SAO SCRIPT NÀY TỒN TẠI — nó đóng một khoảng mù, không thêm tiện nghi.
#
# `helm upgrade --wait` chỉ nói "pod Ready". Ba lần trong lịch sử dự án, mọi thứ
# Ready trong khi hệ KHÔNG phục vụ được ai:
#
#   · 3.H — tag không được ghim, `helm upgrade` kéo service về bản cũ. helm
#     "success", `rollout status` xanh, pod Running 1/1, lỗi 500 quay lại.
#   · 3.H — ghim tag mà quên side-load `dlp-sandbox-base`: 4 deployment Running,
#     nhưng MỌI pod warm-pool kẹt ErrImageNeverPull ⇒ không ai vào được terminal.
#   · 2.G — web lên xanh trong khi đường vào thật (Traefik) chưa phục vụ.
#
# Ba chế độ hỏng ấy có chung một hình dạng: **thứ được kiểm không phải thứ người
# học chạm vào**. Nên cổng này kiểm ĐÚNG những thứ họ chạm: pool có pod ấm thật,
# `/api/health` trả 200 qua BIÊN, và một phiên sandbox dựng-rồi-thu-hồi được.
#
# ⛔ NÓ KHÔNG PHỦ: đăng nhập, `lessons.checkStep`, terminal WS. Những thứ đó cần
# một tài khoản thật và một trình duyệt; `reaper-verify.sh` + harness e2e mới là
# chỗ của chúng. Đừng đọc "smoke PASS" thành "bài học chạy được".
#
# Dùng:
#   bash infra/host/13-smoke.sh                     # chạy từ MÁY DEV
#   VM_SSH=nghaiz@192.168.94.130 bash infra/host/13-smoke.sh
#   SKIP_SESSION=1 bash infra/host/13-smoke.sh      # bỏ vế phiên (khi hết khe quota)
#
# Thoát: 0 = qua · 1 = có vế ĐỎ · 2 = không đo được (môi trường), KHÔNG kết luận.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VM_SSH="${VM_SSH:-nghaiz@192.168.94.130}"
RELEASE="${RELEASE:-platform}"
NAMESPACE="${NAMESPACE:-default}"
SANDBOX_NS="${SANDBOX_NS:-dlp-sandbox}"
PROBE_IMAGE="${PROBE_IMAGE:-dlp-lifecycle-probe:dev}"
POOL_WAIT="${POOL_WAIT:-150}"
SKIP_SESSION="${SKIP_SESSION:-0}"

PASS=0
FAIL=0
RESULTS=()

ok()   { PASS=$((PASS + 1)); RESULTS+=("PASS | $1 | $2"); printf '  \033[32mPASS\033[0m %-52s %s\n' "$1" "$2"; }
bad()  { FAIL=$((FAIL + 1)); RESULTS+=("FAIL | $1 | $2"); printf '  \033[31mFAIL\033[0m %-52s %s\n' "$1" "$2"; }
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
info() { printf '     %s\n' "$1"; }
khong_do_duoc() { echo "KHÔNG ĐO ĐƯỢC: $*" >&2; exit 2; }

vm() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$VM_SSH" "$@"; }

ssh -o ConnectTimeout=8 "$VM_SSH" true 2>/dev/null || khong_do_duoc "không ssh được tới $VM_SSH"

printf '\033[1msmoke sau deploy\033[0m · release=%s ns=%s · %s\n' \
  "$RELEASE" "$NAMESPACE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ── 1. Deployment Ready ──────────────────────────────────────────────────────
step "1. Deployment Ready"
for d in web gateway orchestrator; do
  if vm "kubectl -n '$NAMESPACE' rollout status deploy/${RELEASE}-${d} --timeout=180s" >/dev/null 2>&1; then
    ok "deploy/${RELEASE}-${d} rolled out" "Ready"
  else
    bad "deploy/${RELEASE}-${d} rolled out" "rollout không xong trong 180s"
  fi
done

# ── 2. Image ĐANG CHẠY khớp image chart RENDER ra ────────────────────────────
#
# Kiểm trên đối tượng SỐNG, không trên file: đây chính là chế độ hỏng của 3.H —
# values đúng mà cụm chạy tag khác thì không có gì đỏ lên.
#
# ⛔ SỬA Ở P12/12.A (2026-09-04). Bản cũ đọc DUY NHẤT `image.tag` (tag chung) rồi
# đòi MỌI deployment mang đúng tag đó. Từ khi values-selfhost ghim tag theo từng
# thành phần (web `p10a`, orchestrator `p7`, gateway tag chung), phép so ấy sai
# theo hai chiều cùng lúc:
#   · BÁO ĐỎ OAN — web/orchestrator chạy đúng tag chart định, vẫn bị đếm là lệch.
#   · BỎ LỌT THẬT — nó không biết CHART định gì cho từng thành phần, nên một
#     `web.image.tag` sai trong values sẽ khớp "cụm = values" và đi qua êm.
# Bản mới so từng deployment với image CHART RENDER RA cho chính nó. Đó mới là
# câu hỏi cần trả lời: "cụm có đang chạy thứ repo mô tả không?"
step "2. Image đang chạy khớp chart"
REPO_ROOT_SMOKE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Render trên VM, nơi chart tươi + live-values (bí mật) đã có sẵn. Chỉ lấy dòng
# image; KHÔNG in manifest thô — nó chứa PKI/secret.
RENDER_MAP="$(vm "helm get manifest '$RELEASE' -n '$NAMESPACE' 2>/dev/null" \
  | awk '
      /^kind:[[:space:]]*Deployment/ { la_deploy = 1 }
      /^kind:/ && $2 != "Deployment"  { la_deploy = 0 }
      la_deploy && $1 == "name:" && ten == "" { ten = $2 }
      la_deploy && $1 == "image:" && ten != "" {
        gsub(/['"'"'"]/, "", $2); print ten " " $2; ten = ""; la_deploy = 0
      }
    ' | grep "ghcr.io" | sort -u)"
if [ -z "$RENDER_MAP" ]; then
  khong_do_duoc "không đọc được image từ manifest của release (đừng đọc thành 'không có image')"
fi
LECH=0
while read -r ten img_chart; do
  [ -n "$ten" ] || continue
  img_song="$(vm "kubectl -n '$NAMESPACE' get deploy '$ten' -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null" || true)"
  if [ "$img_song" != "$img_chart" ]; then
    info "LỆCH ${ten}: cụm=${img_song:-<không đọc được>} chart=${img_chart}"
    LECH=$(( LECH + 1 ))
  fi
done <<< "$RENDER_MAP"
if [ "$LECH" -eq 0 ]; then
  ok "mọi deployment chạy đúng image chart định" "$(wc -l <<< "$RENDER_MAP" | tr -d ' ') deployment khớp"
else
  bad "mọi deployment chạy đúng image chart định" "${LECH} deployment lệch chart"
fi

# ── 3. Warm pool có pod THẬT ─────────────────────────────────────────────────
#
# Đây là vế bắt được ca "quên side-load dlp-sandbox-base": 4 deployment Running
# mà pool rỗng vì mọi pod kẹt ErrImageNeverPull.
step "3. Warm pool đạt POOL_TARGET"
POOL_TARGET="$(vm "kubectl -n '$NAMESPACE' get deploy ${RELEASE}-orchestrator -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name==\"POOL_TARGET\")].value}'" || true)"
POOL_TARGET="${POOL_TARGET:-1}"
info "POOL_TARGET=${POOL_TARGET}, chờ tối đa ${POOL_WAIT}s"
DEADLINE=$(( $(date -u +%s) + POOL_WAIT ))
NAM=0
while :; do
  NAM="$(vm "kubectl -n '$SANDBOX_NS' get pods -l app=sandbox --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l" || echo 0)"
  [ "${NAM:-0}" -ge "$POOL_TARGET" ] && break
  [ "$(date -u +%s)" -gt "$DEADLINE" ] && break
  sleep 5
done
if [ "${NAM:-0}" -ge "$POOL_TARGET" ]; then
  ok "warm pool đạt POOL_TARGET" "${NAM}/${POOL_TARGET} pod Running"
else
  KET="$(vm "kubectl -n '$SANDBOX_NS' get pods -l app=sandbox --no-headers 2>/dev/null | awk '{print \$3}' | sort | uniq -c | tr '\\n' ' '" || true)"
  bad "warm pool đạt POOL_TARGET" "chỉ ${NAM}/${POOL_TARGET} sau ${POOL_WAIT}s — trạng thái: ${KET:-∅}"
fi

# ── 4. /api/health QUA BIÊN ──────────────────────────────────────────────────
#
# Qua Traefik, không qua port-forward: 2.G đã tốn một chặng để học rằng "web lên
# xanh" và "đường vào thật phục vụ được" là hai khẳng định khác nhau.
step "4. /api/health qua Traefik"
HOST="$(vm "kubectl -n '$NAMESPACE' get ingress -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null" || true)"
if [ -z "$HOST" ]; then
  info "không có ingress — bỏ vế này (deploy self-host không bật ingress là hợp lệ)"
else
  PORT="$(vm "kubectl -n traefik get svc -o jsonpath='{.items[0].spec.ports[?(@.name==\"websecure\")].nodePort}' 2>/dev/null" || true)"
  PORT="${PORT:-30443}"
  CODE="$(vm "curl -sk -o /dev/null -w '%{http_code}' --max-time 15 --resolve '${HOST}:${PORT}:127.0.0.1' 'https://${HOST}:${PORT}/api/health'" || echo 000)"
  if [ "$CODE" = 200 ]; then
    ok "/api/health qua biên trả 200" "https://${HOST}:${PORT}"
  else
    bad "/api/health qua biên trả 200" "nhận ${CODE} — biên hoặc web không phục vụ"
  fi
fi

# ── 5. Vòng đời phiên: dựng được, thu hồi được ───────────────────────────────
#
# Dùng LẠI `cmd/lifecycle-probe` đã có trong repo — đừng viết đường thứ hai.
# ⛔ Probe pod phải mang nhãn của `web`: từ 3.B, ingress vào orchestrator chỉ mở
# cho component ∈ {web, gateway}; pod không nhãn bị THẢ GÓI và triệu chứng là
# timeout — đọc ra y hệt "orchestrator chết".
# ⛔ Và phải vĩnh viễn NOT-READY: selector của Service `platform-web` đúng bằng
# ba nhãn đó, nên một probe Ready sẽ nhận LƯU LƯỢNG NGƯỜI DÙNG THẬT.
PROBE_NAME="smoke-probe-$(date -u +%s)"
don_probe() { vm "kubectl -n '$NAMESPACE' delete pod '$PROBE_NAME' --ignore-not-found --wait=false" >/dev/null 2>&1 || true; }
trap don_probe EXIT

if [ "$SKIP_SESSION" = 1 ]; then
  step "5. Vòng đời phiên — BỎ QUA (SKIP_SESSION=1)"
else
  step "5. Vòng đời phiên (lifecycle-probe)"
  # `-case create` KHÔNG kèm `-keep`: probe tự reap lúc thoát, nên cổng smoke
  # không để lại phiên nào ăn khe quota của lượt sau. `-keep` là cờ dành cho
  # việc DỰNG CẢNH cho reaper (reaper-verify.sh dùng nó), không phải cho smoke.
  if ! vm "sudo ctr -n k8s.io images ls -q | grep -q '${PROBE_IMAGE}'" 2>/dev/null; then
    info "image ${PROBE_IMAGE} không có trên node — bỏ vế này (không phải lỗi của deploy)"
  else
    LOGS="$(vm "kubectl -n '$NAMESPACE' apply -f - >/dev/null <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: ${PROBE_NAME}
  labels:
    app.kubernetes.io/name: ${RELEASE}
    app.kubernetes.io/instance: ${RELEASE}
    app.kubernetes.io/component: web
    dlp.probe: smoke
spec:
  restartPolicy: Never
  containers:
    - name: probe
      image: ${PROBE_IMAGE}
      imagePullPolicy: Never
      args: ['-case', 'create', '-user', 'smoke-${PROBE_NAME}', '-tag', 'smoke']
      readinessProbe:
        tcpSocket:
          port: 1
        periodSeconds: 3600
      volumeMounts:
        - name: mtls
          mountPath: /etc/dlp/mtls
          readOnly: true
  volumes:
    - name: mtls
      secret:
        secretName: ${RELEASE}-mtls
YAML
for i in \$(seq 1 90); do
  P=\$(kubectl -n '$NAMESPACE' get pod '$PROBE_NAME' -o jsonpath='{.status.phase}' 2>/dev/null || echo '')
  case \"\$P\" in Succeeded|Failed) break ;; esac
  sleep 2
done
kubectl -n '$NAMESPACE' logs '$PROBE_NAME' 2>/dev/null || true" || true)"
    PHASE="$(vm "kubectl -n '$NAMESPACE' get pod '$PROBE_NAME' -o jsonpath='{.status.phase}'" 2>/dev/null || echo '')"
    if [ "$PHASE" = Succeeded ]; then
      ok "vòng đời phiên chạy trọn (create → claim → reap)" "probe Succeeded"
    else
      bad "vòng đời phiên chạy trọn (create → claim → reap)" \
        "probe ${PHASE:-KHÔNG CHẠY} — log cuối: $(printf '%s' "$LOGS" | tail -3 | tr '\n' ' ')"
    fi
  fi
fi

# ── Tổng ─────────────────────────────────────────────────────────────────────
step "TỔNG"
printf '%s\n' "${RESULTS[@]:-(không có vế nào chạy)}"
printf '\npass=%d fail=%d\n' "$PASS" "$FAIL"
if [ "$FAIL" -ne 0 ]; then
  echo "KẾT QUẢ: FAIL — deploy lên xanh nhưng hệ chưa phục vụ được" >&2
  exit 1
fi
echo "KẾT QUẢ: PASS"
