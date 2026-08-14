#!/usr/bin/env bash
# Chạy cổng netpol trên chart THẬT rồi trên N bản chart BỊ BÓP MÉO.
# Baseline phải exit=0; mọi bóp méo phải exit=1.
set -uo pipefail
SRC="d:/NCKH/DevOps_Learning_Platform/infra/helm/platform"
GATE="d:/NCKH/DevOps_Learning_Platform/infra/k8s/netpol_render_gate.py"
WORK="$(dirname "$0")/distort"
PY="${PY:-py}"

SETS=(
  --set web.env.betterAuthSecret=d
  --set datastore.postgres.password=p
  --set datastore.redis.password=p
  --set networkPolicy.platform.enabled=true
  --set networkPolicy.platform.denyEnabled=true
  --set 'networkPolicy.platform.apiServerEndpoints[0].cidr=192.168.94.130/32'
  --set 'networkPolicy.platform.apiServerEndpoints[0].port=6443'
  --set 'networkPolicy.platform.nodeCidrs[0]=192.168.94.130/32'
)

render() { # $1 = chart dir
  helm template platform "$1" -f "$1/values-selfhost.yaml" "${SETS[@]}" 2>&1
}

run_case() { # $1=nhãn  $2=chart dir  $3=exit mong đợi  $4=cờ gate
  local label="$1" chart="$2" want="$3" flag="${4:-}"
  local out rc
  out="$(render "$chart" | "$PY" "$GATE" $flag 2>&1)"
  rc=$?
  if [[ $rc -eq $want ]]; then
    printf '  OK   %-46s exit=%s  %s\n' "$label" "$rc" "$(echo "$out" | grep -oE '(✓[^|]*|· [^|]{0,70})' | head -1)"
  else
    printf '  SAI  %-46s exit=%s (muốn %s)\n' "$label" "$rc" "$want"
    echo "$out" | head -6 | sed 's/^/        /'
  fi
}

rm -rf "$WORK"; mkdir -p "$WORK"

echo "── BASELINE (chart thật) ────────────────────────────────────────────────"
run_case "BASELINE deny" "$SRC" 0 --expect-deny

# Nhánh mặc định: enabled=false ⇒ 0 policy nền tảng
out="$(helm template platform "$SRC" --set web.env.betterAuthSecret=d 2>&1 | "$PY" "$GATE" --expect-none 2>&1)"
if [[ $? -eq 0 ]]; then echo "  OK   BASELINE mặc định (enabled=false)         exit=0"; else echo "  SAI  BASELINE mặc định"; echo "$out" | head -4; fi

echo
echo "── BÓP MÉO (mỗi cái PHẢI làm cổng đỏ) ───────────────────────────────────"

mk() { # $1 = tên biến thể -> in ra đường dẫn chart đã copy
  local n="$1"
  cp -r "$SRC" "$WORK/$n"
  echo "$WORK/$n"
}

# A. helper netpolComponent mất `matchLabels:` ⇒ nhãn trần dưới podSelector
#    (ĐÂY LÀ LỖI THẬT tôi đã mắc — apiserver prune ⇒ podSelector:{} = mọi pod)
c="$(mk A)"
python3 - "$c" <<'PY'
import sys,io
p=sys.argv[1]+"/templates/_helpers.tpl"
s=open(p,encoding='utf-8').read()
s=s.replace('''{{- define "platform.netpolComponent" -}}
matchLabels:
  {{- include "platform.selectorLabels" (dict "context" .context "component" .component) | nindent 2 }}
{{- end -}}''','''{{- define "platform.netpolComponent" -}}
{{- include "platform.selectorLabels" (dict "context" .context "component" .component) }}
{{- end -}}''')
open(p,'w',encoding='utf-8').write(s)
PY
run_case "A. podSelector mất matchLabels (prune)" "$c" 1 --expect-deny

# B. một rule mất `ports:` ⇒ mở mọi cổng của đích
c="$(mk B)"
python3 - "$c" <<'PY'
import sys,re
p=sys.argv[1]+"/templates/platform-networkpolicy.yaml"
s=open(p,encoding='utf-8').read()
s=s.replace('''      ports:
        - protocol: TCP
          port: {{ .Values.web.service.port }}
---
# ─────────────────────────────────────────────────────────────────────────────
# 8. INGRESS vào gateway''','''---
# ─────────────────────────────────────────────────────────────────────────────
# 8. INGRESS vào gateway''')
open(p,'w',encoding='utf-8').write(s)
PY
run_case "B. một rule mất ports (mở mọi cổng)" "$c" 1 --expect-deny

# C. gỡ cổng chặn nodeCidrs ⇒ `from:` rỗng = khớp MỌI nguồn
c="$(mk C)"
python3 - "$c" <<'PY'
import sys,re
p=sys.argv[1]+"/templates/platform-networkpolicy.yaml"
s=open(p,encoding='utf-8').read()
s=re.sub(r'\{\{- if not \$np\.nodeCidrs \}\}.*?\{\{- end \}\}\n', '', s, count=1, flags=re.S)
open(p,'w',encoding='utf-8').write(s)
PY
out="$(helm template platform "$c" -f "$c/values-selfhost.yaml" --set web.env.betterAuthSecret=d --set datastore.postgres.password=p --set datastore.redis.password=p --set networkPolicy.platform.enabled=true --set networkPolicy.platform.denyEnabled=true --set 'networkPolicy.platform.apiServerEndpoints[0].cidr=1.2.3.4/32' --set 'networkPolicy.platform.apiServerEndpoints[0].port=6443' 2>&1 | "$PY" "$GATE" --expect-deny 2>&1)"
rc=$?
[[ $rc -eq 1 ]] && printf '  OK   %-46s exit=1  %s\n' "C. nodeCidrs rỗng ⇒ from rỗng (mở toang)" "$(echo "$out"|grep -oE '· [^|]{0,60}'|head -1)" || { echo "  SAI  C. nodeCidrs rỗng — cổng KHÔNG đỏ (exit=$rc)"; echo "$out"|head -5; }

# D. gỡ HẲN một policy
c="$(mk D)"
python3 - "$c" <<'PY'
import sys,re
p=sys.argv[1]+"/templates/platform-networkpolicy.yaml"
s=open(p,encoding='utf-8').read()
i=s.index('# 6. EGRESS của Job `migrate`')
j=s.index('# 7. INGRESS vào web')
s=s[:i-82]+s[j-82:]
open(p,'w',encoding='utf-8').write(s)
PY
run_case "D. gỡ hẳn allow-egress-migrate" "$c" 1 --expect-deny

# E. default-deny có podSelector KHÔNG rỗng ⇒ không phủ pod lạ
c="$(mk E)"
python3 - "$c" <<'PY'
import sys
p=sys.argv[1]+"/templates/platform-networkpolicy.yaml"
s=open(p,encoding='utf-8').read()
s=s.replace('''spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
{{- end }}''','''spec:
  podSelector:
    {{- include "platform.netpolRelease" (dict "context" .) | nindent 4 }}
  policyTypes:
    - Ingress
    - Egress
{{- end }}''')
open(p,'w',encoding='utf-8').write(s)
PY
run_case "E. default-deny không phủ pod lạ" "$c" 1 --expect-deny

# F. apiserver dùng podSelector thay ipBlock ⇒ rule không bao giờ khớp
c="$(mk F)"
python3 - "$c" <<'PY'
import sys
p=sys.argv[1]+"/templates/platform-networkpolicy.yaml"
s=open(p,encoding='utf-8').read()
s=s.replace('''    - to:
        - ipBlock:
            cidr: {{ .cidr }}
      ports:
        - protocol: TCP
          port: {{ .port }}
    {{- end }}''','''    - to:
        - podSelector:
            {{- include "platform.netpolComponent" (dict "context" $ "component" "orchestrator") | nindent 12 }}
      ports:
        - protocol: TCP
          port: {{ .port }}
    {{- end }}''')
open(p,'w',encoding='utf-8').write(s)
PY
run_case "F. apiserver dùng selector (không khớp)" "$c" 1 --expect-deny

# G. allow-ingress-postgres cấp cho MỌI pod
c="$(mk G)"
python3 - "$c" <<'PY'
import sys
p=sys.argv[1]+"/templates/platform-networkpolicy.yaml"
s=open(p,encoding='utf-8').read()
s=s.replace('''    - from:
        - podSelector:
            {{- include "platform.netpolComponents" (dict "context" . "components" (list "web" "orchestrator" "migrate")) | nindent 12 }}
      ports:
        - protocol: TCP
          port: 5432''','''    - from:
        - podSelector: {}
      ports:
        - protocol: TCP
          port: 5432''')
open(p,'w',encoding='utf-8').write(s)
PY
run_case "G. postgres nhận từ MỌI pod trong ns" "$c" 1 --expect-deny

# H. đổi tên một policy (tham chiếu/tập lệch)
c="$(mk H)"
sed -i 's/-allow-ingress-redis/-allow-ingress-redis-X/' "$c/templates/platform-networkpolicy.yaml"
run_case "H. đổi tên allow-ingress-redis" "$c" 1 --expect-deny

echo
echo "── ĐỐI CHỨNG: cổng có đỏ NHẦM trên chart thật không? ────────────────────"
run_case "BASELINE lại (phải vẫn xanh)" "$SRC" 0 --expect-deny
