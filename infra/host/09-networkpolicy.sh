#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 09-networkpolicy.sh — bật cô lập mạng cho namespace nền tảng (P3/3.B).
#
# Ba giá trị mà chart bắt buộc phải có đều PHỤ THUỘC CỤM và đều dễ gõ sai:
#   · endpoint THẬT của apiserver (KHÔNG phải ClusterIP 10.96.0.1:443)
#   · IP node — nguồn của probe kubelet
#   · datastore ở trong hay ngoài cụm
# Script này ĐỌC CHÚNG TỪ CỤM ĐANG CHẠY thay vì bắt người vận hành gõ tay. Gõ
# tay ba giá trị đó là ba cơ hội để một lượt deploy hỏng theo kiểu im lặng, và
# hai trong ba cái hỏng theo hướng NỚI LỎNG (xem chú thích của chart).
#
# ⛔ HAI PHA, CHẠY HAI LẦN — KHÔNG GỘP.
#     bash 09-networkpolicy.sh allow    # áp allow-*, hệ bị siết NGAY từ bước này
#     bash infra/k8s/netpol-verify.sh   # xác nhận từng chiều
#     bash 09-networkpolicy.sh deny     # phủ nốt phần còn hở
#     bash infra/k8s/netpol-verify.sh   # xác nhận lại
# Gộp một lần thì mọi nguyên nhân sai đều cho CÙNG một triệu chứng (timeout) và
# không tách được cái nào gây ra cái nào.
#
#     bash 09-networkpolicy.sh off      # gỡ hoàn toàn (đường lùi khi chẩn đoán)
#     bash 09-networkpolicy.sh print    # chỉ IN lệnh, không chạy
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PHASE="${1:-print}"
RELEASE="${RELEASE:-platform}"
NS="${NS:-default}"
CHART="${CHART:-$HOME/dlp-chart-p3b/platform}"
VALUES="${VALUES:-$CHART/values-selfhost.yaml}"

case "$PHASE" in
  allow | deny | off | print) ;;
  *)
    echo "dùng: $0 [allow|deny|off|print]" >&2
    exit 2
    ;;
esac

# ── Đọc giá trị TỪ CỤM ───────────────────────────────────────────────────────
API_IP="$(kubectl get endpoints kubernetes -n default \
  -o jsonpath='{.subsets[0].addresses[0].ip}')"
API_PORT="$(kubectl get endpoints kubernetes -n default \
  -o jsonpath='{.subsets[0].ports[0].port}')"
if [[ -z "$API_IP" || -z "$API_PORT" ]]; then
  echo "LỖI: không đọc được endpoint apiserver." >&2
  exit 1
fi
# Cảnh báo nếu ai đó lại đọc ra ClusterIP: chart sẽ nhận, và hệ sẽ chết im lặng.
CLUSTER_IP="$(kubectl get svc kubernetes -n default -o jsonpath='{.spec.clusterIP}')"
if [[ "$API_IP" == "$CLUSTER_IP" ]]; then
  echo "LỖI: endpoint apiserver đọc ra TRÙNG ClusterIP ($API_IP)." >&2
  echo "      NetworkPolicy được đánh giá SAU DNAT nên rule theo ClusterIP KHÔNG BAO GIỜ khớp." >&2
  exit 1
fi

mapfile -t NODE_IPS < <(kubectl get nodes \
  -o jsonpath='{range .items[*]}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' \
  | grep -v '^$')
if [[ ${#NODE_IPS[@]} -eq 0 ]]; then
  echo "LỖI: không đọc được InternalIP của node nào — probe kubelet sẽ bị chặn." >&2
  exit 1
fi

echo "── đọc từ cụm ──────────────────────────────────────────────────────────"
echo "  apiserver endpoint : ${API_IP}:${API_PORT}   (ClusterIP là ${CLUSTER_IP}, KHÔNG dùng)"
echo "  node InternalIP    : ${NODE_IPS[*]}"
echo "  release/namespace  : ${RELEASE} / ${NS}"
echo "  chart              : ${CHART}"
echo

SETS=()
if [[ "$PHASE" == "off" ]]; then
  SETS+=(--set "networkPolicy.platform.enabled=false")
else
  SETS+=(--set "networkPolicy.platform.enabled=true")
  SETS+=(--set "networkPolicy.platform.apiServerEndpoints[0].cidr=${API_IP}/32")
  SETS+=(--set "networkPolicy.platform.apiServerEndpoints[0].port=${API_PORT}")
  for i in "${!NODE_IPS[@]}"; do
    SETS+=(--set "networkPolicy.platform.nodeCidrs[${i}]=${NODE_IPS[$i]}/32")
  done
  if [[ "$PHASE" == "deny" ]]; then
    SETS+=(--set "networkPolicy.platform.denyEnabled=true")
  else
    SETS+=(--set "networkPolicy.platform.denyEnabled=false")
  fi
fi

# ⛔ `--reset-then-reuse-values`, KHÔNG PHẢI `--reuse-values`.
# `--reuse-values` KHÔNG nạp key mới thêm vào values.yaml, nên toàn bộ khối
# `networkPolicy` sẽ là nil và template phát ra giá trị rỗng — Kubernetes bỏ
# qua, helm vẫn xanh, và không gì báo. Đây là bài học đã trả giá ở 1.C-4
# (mtlsFsGroup) — xem chú thích platform.mtlsPodSecurityContext.
CMD=(helm upgrade --install "$RELEASE" "$CHART"
  --namespace "$NS"
  -f "$VALUES"
  --reset-then-reuse-values
  "${SETS[@]}")

printf 'lệnh:\n  '
printf '%q ' "${CMD[@]}"
printf '\n\n'

if [[ "$PHASE" == "print" ]]; then
  echo "(chế độ print — không chạy gì)"
  exit 0
fi

"${CMD[@]}"
echo

# ── KHẲNG ĐỊNH TRÊN ĐỐI TƯỢNG SỐNG ───────────────────────────────────────────
# ⛔ KHÔNG tin `helm get values`. Bài học `service.spec.type` (P2/3.A): một key
# `--set` gõ sai được helm nhận TRONG IM LẶNG, và `helm get values` in lại chính
# giá trị sai đó — nên nó xác nhận "tôi đã gõ gì", không xác nhận "cụm có gì".
# Chỉ đối tượng sống mới trả lời được câu hỏi thứ hai.
echo "── khẳng định trên đối tượng sống ──────────────────────────────────────"
COUNT="$(kubectl get netpol -n "$NS" -l app.kubernetes.io/component=platform-networkpolicy \
  --no-headers 2>/dev/null | wc -l)"
echo "  NetworkPolicy của 3.B đang sống: ${COUNT}"

if [[ "$PHASE" == "off" ]]; then
  if [[ "$COUNT" -ne 0 ]]; then
    echo "LỖI: đã yêu cầu off mà vẫn còn ${COUNT} policy." >&2
    exit 1
  fi
  echo "OK: đã gỡ sạch."
  exit 0
fi

# Rule apiserver phải mang ĐÚNG IP endpoint, không phải ClusterIP, không rỗng.
GOT_API="$(kubectl get netpol -n "$NS" "${RELEASE}-allow-egress-apiserver" \
  -o jsonpath='{.spec.egress[0].to[0].ipBlock.cidr}:{.spec.egress[0].ports[0].port}' 2>/dev/null)"
echo "  allow-egress-apiserver → ${GOT_API}"
if [[ "$GOT_API" != "${API_IP}/32:${API_PORT}" ]]; then
  echo "LỖI: rule apiserver trên cụm là '${GOT_API}', muốn '${API_IP}/32:${API_PORT}'." >&2
  echo "      Rule sai ở đây = gateway không exec được và orchestrator không tạo được pod," >&2
  echo "      mà mọi pod vẫn Running 1/1 nên không có gì đỏ để mà nhìn." >&2
  exit 1
fi

# Rule probe phải có `from` KHÔNG RỖNG. `from` rỗng nghĩa là KHỚP MỌI NGUỒN —
# hỏng theo hướng nới lỏng, tức không triệu chứng nào cả.
GOT_FROM="$(kubectl get netpol -n "$NS" "${RELEASE}-allow-ingress-kubelet-probes" \
  -o jsonpath='{.spec.ingress[0].from[*].ipBlock.cidr}' 2>/dev/null)"
echo "  allow-ingress-kubelet-probes from → ${GOT_FROM:-<RỖNG>}"
if [[ -z "$GOT_FROM" ]]; then
  echo "LỖI: rule probe có 'from' RỖNG ⇒ mở cổng 3000/8083/8081 cho MỌI nguồn." >&2
  exit 1
fi

DENY="$(kubectl get netpol -n "$NS" "${RELEASE}-default-deny" \
  -o jsonpath='{.metadata.name}' 2>/dev/null || true)"
echo "  default-deny → ${DENY:-<chưa áp>}"
if [[ "$PHASE" == "deny" && -z "$DENY" ]]; then
  echo "LỖI: pha deny mà không có object default-deny." >&2
  exit 1
fi
if [[ "$PHASE" == "allow" && -n "$DENY" ]]; then
  echo "LỖI: pha allow mà default-deny đã tồn tại — hai pha đang bị gộp." >&2
  exit 1
fi

echo
echo "OK. Bước tiếp theo BẮT BUỘC: bash infra/k8s/netpol-verify.sh"
