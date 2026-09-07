#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# netpol-gate-run.sh — gọi `netpol_render_gate.py` cho ĐÚNG.
#
# VÌ SAO CẦN MỘT WRAPPER CHO MỘT LỆNH
#
# Cổng có SÁU cách trả đỏ giả, và cả sáu đều đọc ra như một hồi quy an ninh
# ("thiếu 14 policy", "chiều X mất hàng rào"). Đo 2026-09-08: tôi dẫm đủ năm cái
# đầu trước khi ra được lượt xanh, và không cái nào tự nói ra rằng nó là lỗi lời
# gọi chứ không phải lỗi chart.
#
#   1. Thiếu values phụ-thuộc-máy. `networkPolicy.*`, `ingress.*`, `platform.*`
#      CỐ Ý không nằm trong git (12-helm-deploy.sh §"LUẬT") — chúng chỉ sống
#      trong release trên VM. Render không có chúng ⇒ 0 policy ⇒ "thiếu 14".
#   2. `2>&1` thay vì `2>/dev/null`. Thông báo lỗi của helm chảy vào stdin của
#      cổng, và cổng chết ở `yaml.scanner.ScannerError` — một traceback Python
#      không hề nhắc tới netpol.
#   3. Quên tên release. `helm template <chart>` (không có tên) đặt tiền tố
#      `release-name-` cho mọi policy ⇒ cổng báo thiếu 14 VÀ thừa 17 cùng lúc.
#   4. Quên `--expect-deny` / `--metrics-scrape`. Hai tập đó chỉ render khi cờ
#      chart bật, nên cổng bắt người gọi KHAI thay vì đoán. Release trên VM bật
#      cả hai ⇒ thiếu cờ là "thừa default-deny", nghe như ai lén thêm policy.
#   5. CR cuối dòng. Python trên Windows ghi CRLF, nên một cờ đọc trần ra là
#      `--expect-deny<CR>` — cổng không nhận, VÀ dòng `echo` in ra trông hoàn
#      toàn đúng vì CR vô hình. Wrapper này báo đúng hai cờ rồi vẫn đỏ y như khi
#      không truyền cờ nào. Vì thế có `tr -d` ở bước 2.
#   6. Gọi trần không pipe. Cổng đọc STDIN; không pipe thì nó thấy rỗng.
#      (Và đừng nối `| tail` rồi đọc `$?` — khi ấy `$?` là của `tail`.)
#
# Cách chống lại tất cả: script đọc values thật từ release đang chạy, dựng render
# bằng đúng tên release, và suy cờ từ ĐÚNG thứ release khai — không hardcode.
#
# Dùng:
#   bash infra/k8s/netpol-gate-run.sh
#   VM_SSH=nghaiz@192.168.94.130 RELEASE=platform bash infra/k8s/netpol-gate-run.sh
#
# Thoát: 0 = cổng xanh · 1 = cổng ĐỎ THẬT · 2 = không dựng được render (môi trường)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_SSH="${VM_SSH:-nghaiz@192.168.94.130}"
RELEASE="${RELEASE:-platform}"
NAMESPACE="${NAMESPACE:-default}"
CHART="$GOC/infra/helm/platform"
VALUES="$GOC/infra/helm/platform/values-selfhost.yaml"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── 1. Lấy values phụ-thuộc-máy từ release ĐANG CHẠY ─────────────────────────
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$VM_SSH" \
     "helm get values '$RELEASE' -n '$NAMESPACE' -o json" > "$TMP/all.json" 2>/dev/null; then
  echo "KHÔNG ĐO ĐƯỢC: không đọc được values của release '$RELEASE' từ $VM_SSH." >&2
  echo "  (đây là môi trường, KHÔNG phải cổng đỏ — đừng đọc thành hồi quy netpol)" >&2
  exit 2
fi

python - "$TMP/all.json" "$TMP/vm.yaml" <<'PY' || exit 2
import io, json, sys
src, dst = sys.argv[1], sys.argv[2]
v = json.load(io.open(src, encoding='utf-8'))
keep = {k: v[k] for k in ('ingress', 'networkPolicy', 'platform') if k in v}
if not keep:
    print("KHONG DO DUOC: release khong khai khoi nao trong ingress/networkPolicy/platform.",
          file=sys.stderr)
    sys.exit(2)
io.open(dst, 'w', encoding='utf-8').write(json.dumps(keep))
PY

# ── 2. Cờ suy ra từ chính release, không hardcode ────────────────────────────
# Cổng cố ý bắt người gọi KHAI (`--expect-deny`, `--metrics-scrape`) thay vì
# đoán; ta khai theo thứ release THẬT SỰ bật, nên cờ không thể lệch khỏi chart.
#
# `tr -d` là BẮT BUỘC — xem cách hỏng số 5 ở đầu file.
CO=()
python - "$TMP/all.json" <<'PY' | tr -d '\015' > "$TMP/co.txt"
import io, json, sys
v = json.load(io.open(sys.argv[1], encoding='utf-8'))
p = ((v.get('networkPolicy') or {}).get('platform') or {})
if p.get('denyEnabled'):
    print('--expect-deny')
if ((p.get('metricsScrape') or {}).get('enabled')):
    print('--metrics-scrape')
PY
while IFS= read -r c; do [[ -n "$c" ]] && CO+=("$c"); done < "$TMP/co.txt"

echo "── cờ suy ra từ release: ${CO[*]:-(không có)}"

# ── 3. Render — tên release TƯỜNG MINH, stderr KHÔNG vào stdin ───────────────
# Secret là giá trị giả: cổng chỉ đọc NetworkPolicy, không đọc Secret. Nhưng
# helm TỪ CHỐI render nếu thiếu chúng, nên phải truyền.
if ! helm template "$RELEASE" "$CHART" \
      -f "$VALUES" -f "$TMP/vm.yaml" \
      --set web.env.betterAuthSecret=render-only \
      --set datastore.postgres.password=render-only \
      --set datastore.redis.password=render-only \
      > "$TMP/render.yaml" 2>"$TMP/err.txt"; then
  echo "KHÔNG ĐO ĐƯỢC: helm template thất bại —" >&2
  head -3 "$TMP/err.txt" >&2
  exit 2
fi

SO_DOC="$(grep -c '^---' "$TMP/render.yaml")"
[[ "$SO_DOC" -gt 0 ]] || { echo "KHÔNG ĐO ĐƯỢC: render ra 0 doc." >&2; exit 2; }
echo "── render: $SO_DOC doc"

# ── 4. Chấm ──────────────────────────────────────────────────────────────────
python "$GOC/infra/k8s/netpol_render_gate.py" "${CO[@]}" < "$TMP/render.yaml"
exit $?
