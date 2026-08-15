#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# reaper-verify.sh — đóng AC-C2 và AC-C3 của P3/3.C bằng phép đo TRÊN CỤM.
#
# Hai ô này là hai ô CUỐI của 3.C còn nợ. Unit test của reaper đã phủ logic
# (`TestTang2cDonPodClaimedMaSessionKhongCon` và cặp đối chứng của nó), nhưng
# KHÔNG test nào để một key hết hạn THẬT theo đồng hồ — chúng dựng trạng thái
# bằng `seedClaimedPod` rồi gọi tay. Nghĩa là ngữ nghĩa "hết hạn theo thời gian"
# chưa từng được đo ở bất kỳ tầng nào; đó là toàn bộ lý do plan đòi phép đo này.
#
# ⛔ VÌ SAO KHÔNG ĐO BẰNG `GetSession` TRẢ NotFound — ĐÂY LÀ CÁI BẪY CHÍNH.
# `GetSession` trả NotFound ngay khi hash `session:{id}` rụng, mà nó rụng vì TTL
# của REDIS — không phải vì reaper làm gì cả. Một ô AC khẳng định trên NotFound
# sẽ XANH y hệt trên một cụm đã gỡ hẳn reaper. Việc của reaper là XOÁ POD và gỡ
# tên khỏi `pool:claimed`. Nên mọi khẳng định ở đây nằm trên trạng thái pod ở
# apiserver và trên index Redis, không nằm trên sự tồn tại của session key.
#
# ⛔ BA VẾ, VÀ HAI VẾ SAU MỚI LÀM VẾ ĐẦU CÓ NGHĨA.
#   1. t0 — MỌI session (sắp hết hạn lẫn còn lâu) đều quan sát được là ĐANG SỐNG.
#      Thiếu vế này thì "t1 thấy pod biến mất" không phân biệt được với một phép
#      quan sát luôn luôn không thấy gì (sai namespace, sai tên, kubectl hỏng).
#   2. t1 — pod của session hết hạn đã biến mất, tên đã rời `pool:claimed`.
#   3. t1 — session CHƯA hết hạn trong CÙNG lượt vẫn còn nguyên. Thiếu vế này thì
#      "dọn 100%" không phân biệt được với "xoá bừa": một reaper xoá sạch mọi pod
#      cũng làm vế 2 xanh.
#
# ⛔ MỌI MỐC THỜI GIAN LẤY TỪ CỤM, KHÔNG TỪ MÁY GỌI. Đồng hồ VM nhanh hơn đồng hồ
# Windows ~59s (đo 3 lượt ở 1.G-6), và bài học ghi rõ: lệch NHỎ mới nguy hiểm vì
# con số vẫn dương và vẫn trông hợp lý. Hạn chót chờ vì thế suy ra từ `EXPIRESAT`
# do chính orchestrator ghi — cùng đồng hồ với Redis đang đếm TTL.
#
# Dùng (chạy TRÊN VM có kubeconfig):
#   bash infra/k8s/reaper-verify.sh                     # cả hai ca
#   bash infra/k8s/reaper-verify.sh --case expiry    # AC-C2
#   bash infra/k8s/reaper-verify.sh --case ghost     # chỗ rò session-ma
#   bash infra/k8s/reaper-verify.sh --case restart   # AC-C3
#
# ⚠ CHẠY CÔ LẬP, VÀ CHỈ MỘT LƯỢT MỖI GIỜ — hai ràng buộc khác nhau:
#
# 1. **Cô lập.** Bất kỳ harness nào claim pod song song đều làm lệch delta đếm
#    `pool:claimed` mà AC-C3 vế 1a dựa vào (đo được 13/14 vì e2e chạy chung).
#
# 2. **Ca `restart` TỰ CHẶN lượt kế của ca `expiry`.** Nó cố ý để lại một session
#    còn sống (đó là điều nó khẳng định: session sống sót qua restart), và session
#    đó mang TTL đầy đủ **1 giờ**. Trong khi ca `expiry` cần **3 khe**, mà
#    warm-pool đã giữ 1 khe. Trên lab CŨ (trần 4) điều đó đủ để lượt kế dừng ở
#    "thiếu khe quota" cho tới khi session kia hết hạn (~1h) — đo được 2026-08-16.
#    Sau khi 3.I mắt 5 nâng trần lên 21, ràng buộc này gần như không còn cắn;
#    nhưng cổng vẫn giữ vì nó là điều kiện môi trường thật, chỉ khác là trần nay
#    ĐỌC TỪ CỤM (`quota_pod_ceiling`) chứ không chép cứng.
#
#    ⛔ Xoá pod KHÔNG giải phóng khe: session vẫn sống nên orchestrator dựng lại
#    pod ngay. Phải chờ TTL, hoặc chạy ca khác trước và để `expiry` sau cùng.
#
# Thoát 1 nếu bất kỳ vế nào đỏ.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CASE=all
NS=default
SANDBOX_NS=dlp-sandbox
IMAGE=dlp-lifecycle-probe:dev
SHORT_TTL=45
LONG_TTL=900
EXPIRE_COUNT=2
RELEASE=platform

while [ $# -gt 0 ]; do
	case "$1" in
	--case) CASE="$2"; shift 2 ;;
	--namespace) NS="$2"; shift 2 ;;
	--sandbox-ns) SANDBOX_NS="$2"; shift 2 ;;
	--image) IMAGE="$2"; shift 2 ;;
	--ttl) SHORT_TTL="$2"; shift 2 ;;
	--long-ttl) LONG_TTL="$2"; shift 2 ;;
	--expire-count) EXPIRE_COUNT="$2"; shift 2 ;;
	-h | --help) sed -n '1,50p' "$0"; exit 0 ;;
	*) echo "cờ lạ: $1" >&2; exit 2 ;;
	esac
done

case "$CASE" in
all | expiry | restart | ghost) ;;
*) echo "--case phải là all|expiry|restart|ghost (đang: $CASE)" >&2; exit 2 ;;
esac

PASS=0
FAIL=0
RESULTS=()

# ok/bad in GIÁ TRỊ QUAN SÁT ĐƯỢC bên cạnh kết luận. Một dòng "PASS" trần là thứ
# không ai kiểm lại được; con số thì kiểm lại được.
ok() {
	PASS=$((PASS + 1))
	RESULTS+=("PASS | $1 | $2")
	printf '  \033[32mPASS\033[0m %-56s %s\n' "$1" "$2"
}
bad() {
	FAIL=$((FAIL + 1))
	RESULTS+=("FAIL | $1 | $2")
	printf '  \033[31mFAIL\033[0m %-56s %s\n' "$1" "$2"
}
step() { printf '\n\033[1m── %s\033[0m\n' "$1"; }
info() { printf '     %s\n' "$1"; }

need() { command -v "$1" >/dev/null 2>&1 || { echo "thiếu $1" >&2; exit 2; }; }
need kubectl

REDIS_PW="$(kubectl -n "$NS" get secret "${RELEASE}-datastore" -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)"
redis() {
	kubectl -n "$NS" exec "deploy/${RELEASE}-redis" -c redis -- \
		redis-cli --no-auth-warning -a "$REDIS_PW" "$@" 2>/dev/null
}

# vm_now — đồng hồ CỦA CỤM, đọc từ chính node. Xem khối ⛔ ở đầu file.
vm_now() { date -u +%s; }

# ── Metric ───────────────────────────────────────────────────────────────────
# Scrape qua apiserver proxy: image orchestrator là distroless (không wget/curl
# để `kubectl exec` gọi), và cổng /metrics là 8081 chứ không 8080 — hai bẫy đã
# làm hỏng hai lượt đo ở 1.C, cả hai lần đều cho một tập RỖNG trông y hệt "mọi
# counter = 0". Nên hàm này LUÔN in số dòng đọc được trước bảng số.
METRICS_CACHE=""
scrape_metrics() {
	METRICS_CACHE="$(kubectl get --raw \
		"/api/v1/namespaces/${NS}/services/${RELEASE}-orchestrator:8081/proxy/metrics" 2>/dev/null || true)"
	local lines
	lines="$(printf '%s' "$METRICS_CACHE" | grep -c . || true)"
	info "scrape /metrics: ${lines} dòng"
	if [ "$lines" -lt 50 ]; then
		bad "scrape /metrics đọc được nội dung" "chỉ ${lines} dòng — mọi counter dưới đây vô nghĩa"
		return 1
	fi
	return 0
}
metric() {
	printf '%s' "$METRICS_CACHE" | awk -v k="$1" '$1 == k { print $2; found=1 } END { if (!found) print "NA" }' | head -1
}

# ── Probe pod ────────────────────────────────────────────────────────────────
# ⛔ NHÃN PHẢI LÀ NHÃN CỦA `web`. Từ 3.B, ingress vào orchestrator chỉ mở cho pod
# mang `app.kubernetes.io/component` ∈ {web, gateway} (khối 9 của
# platform-networkpolicy.yaml). Một probe pod không nhãn sẽ bị THẢ GÓI và triệu
# chứng là timeout — đọc ra y hệt "orchestrator chết".
#
# ⛔ VÀ VÌ SAO NÓ PHẢI VĨNH VIỄN NOT-READY. Selector của Service `platform-web`
# ĐÚNG BẰNG ba nhãn đó. Một probe pod Ready sẽ được thêm vào endpoint của Service
# và NHẬN LƯU LƯỢNG NGƯỜI DÙNG THẬT trong vài giây nó sống — tức script chẩn đoán
# tự làm hỏng site nó đang chẩn. Sibling `netpol-verify.sh` dùng `exec: false`
# cho việc này; ở đây image là distroless (không có `false` để exec), nên dùng
# `tcpSocket` tới một cổng không ai nghe — độc lập hoàn toàn với nội dung image.
# ⛔ DỌN THEO NHÃN, KHÔNG THEO BIẾN. `logs="$(probe ...)"` chạy probe trong một
# SUBSHELL, nên mọi `MANG_BIEN+=(...)` bên trong chỉ sửa bản sao của subshell —
# trap ở tiến trình cha không bao giờ thấy tên pod nào và rác ở lại cụm, ăn khe
# quota của lượt chạy sau. Nhãn thì sống trong apiserver, không phụ
# thuộc tiến trình nào. (Đo được: lượt chạy đầu để lại 2 pod Completed.)
PROBE_LABEL="dlp.probe=reaper-verify"
probe() {
	local name="$1"; shift
	local args_json="" a
	for a in "$@"; do
		args_json="${args_json}\"${a}\","
	done
	args_json="[${args_json%,}]"

	kubectl -n "$NS" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  labels:
    app.kubernetes.io/name: ${RELEASE}
    app.kubernetes.io/instance: ${RELEASE}
    app.kubernetes.io/component: web
    dlp.probe: reaper-verify
spec:
  restartPolicy: Never
  containers:
    - name: probe
      image: ${IMAGE}
      imagePullPolicy: Never
      args: ${args_json}
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
EOF

	# ⛔ TẠO POD → CHỜ KẾT THÚC → `kubectl logs`. KHÔNG `kubectl run -i`: attach
	# bám vào SAU khi container đã in, nên những dòng đầu biến mất khỏi bản ghi —
	# cơ chế thu thập bằng chứng tự huỷ bằng chứng (đã cắn ở 1.C).
	local phase deadline
	deadline=$(($(vm_now) + 180))
	while :; do
		phase="$(kubectl -n "$NS" get pod "$name" -o jsonpath='{.status.phase}' 2>/dev/null || echo "")"
		case "$phase" in
		Succeeded | Failed) break ;;
		esac
		if [ "$(vm_now)" -gt "$deadline" ]; then
			echo "PROBE-TIMEOUT phase=${phase}" >&2
			break
		fi
		sleep 2
	done
	kubectl -n "$NS" logs "$name" 2>/dev/null || true
}

# kvof <logs> <KEY> — đọc một dòng `  . KEY   value` do probe in ra.
kvof() { printf '%s' "$1" | awk -v k="$2" '$1 == "." && $2 == k { print $3; exit }'; }

cleanup() {
	kubectl -n "$NS" delete pod -l "$PROBE_LABEL" --ignore-not-found --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── Quan sát ─────────────────────────────────────────────────────────────────
#
# ⛔ FAIL-CLOSED. ĐÂY LÀ CHỖ DỄ LÀM Ô AC NÓI DỐI NHẤT TRONG CẢ FILE.
#
# Bản đầu viết `kubectl get pod ... 2>/dev/null` rồi coi output rỗng là "pod đã
# biến mất", và `in_claimed` echo `no` khi lệnh redis hỏng. Cả hai ánh xạ
# **lỗi công cụ → thứ ta đang tìm đã biến mất** — tức đúng chiều làm ô AC XANH.
# Một lượt `kubectl exec` chớp giữa lượt đo là "AC-C2 vế 1b: tên đã rời
# pool:claimed" PASS kèm chú thích "index sạch", trong khi tên vẫn nằm nguyên đó.
#
# Đối chứng dương ở t0 KHÔNG bịt được lỗ này: nó chứng minh phép quan sát thấy
# được "còn" tại t0, không nói gì về t1.
#
# Nên ba hàm dưới trả BA giá trị, và giá trị thứ ba luôn là ĐỎ ở chỗ dùng:
#   · pod_exists  → "<phase>" | MISSING (NotFound thật) | UNKNOWN
#   · in_claimed  → yes | no | unknown
#   · sandbox_pod_count → số | UNKNOWN
pod_exists() {
	local out rc
	out="$(kubectl -n "$SANDBOX_NS" get pod "$1" -o jsonpath='{.status.phase}' 2>&1)"
	rc=$?
	if [ "$rc" -eq 0 ]; then
		printf '%s' "${out:-UNKNOWN}"
		return 0
	fi
	# Chỉ NotFound mới là "đã biến mất". Mọi lỗi khác (apiserver, kubeconfig,
	# context sai, RBAC) là KHÔNG BIẾT — và không biết thì không được tính là đã dọn.
	case "$out" in
	*NotFound* | *"not found"*) printf 'MISSING' ;;
	*) printf 'UNKNOWN' ;;
	esac
}
pod_gone() { [ "$(pod_exists "$1")" = MISSING ]; }

in_claimed() {
	local out rc
	out="$(redis LRANGE pool:claimed 0 -1)"
	rc=$?
	if [ "$rc" -ne 0 ]; then
		printf 'unknown'
		return 0
	fi
	if printf '%s\n' "$out" | grep -qxF "$1"; then printf 'yes'; else printf 'no'; fi
}

sandbox_pod_count() {
	local out rc
	out="$(kubectl -n "$SANDBOX_NS" get pods -l app=sandbox --no-headers 2>/dev/null)"
	rc=$?
	if [ "$rc" -ne 0 ]; then
		printf 'UNKNOWN'
		return 0
	fi
	printf '%s\n' "$out" | grep -c Running || true
}

# ── Trần pod sandbox — TÍNH TỪ ĐỐI TƯỢNG SỐNG, KHÔNG CHÉP CỨNG ───────────────
# ⛔ Bản trước của script này chép cứng số `4` vào ba cổng gác, kèm chú thích
# "requests.cpu 2100m ÷ 500m = 4 pod". Nó đúng đúng một lần: ngay khi 3.I mắt 5
# nới quota (250m/256Mi ⇒ 21 pod), cả ba cổng ấy bắt đầu TỪ CHỐI CHẠY dù cụm còn
# thừa chỗ — và thông điệp lỗi vẫn tự tin in ra "trần 4". Một hằng số chép từ
# cấu hình sang script là một bản sao sẽ trôi, và bản trôi thì im lặng.
#
# Trần thật = số NHỎ NHẤT trong năm ràng buộc (xem values.yaml § sandbox.quota).
# `pods:` gần như không bao giờ là cái nhỏ nhất, nên gác theo mình nó là gác hụt.
#
# In ra một con số; `UNKNOWN` nếu không đọc được — người gọi phải phân biệt
# "không đo được" với "đo được và chật", đúng khuôn `exit 2` sẵn có.
quota_pod_ceiling() {
	local q lr
	q="$(kubectl -n "$SANDBOX_NS" get resourcequota -o jsonpath='{.items[0].spec.hard}' 2>/dev/null)" || true
	lr="$(kubectl -n "$SANDBOX_NS" get limitrange -o jsonpath='{.items[0].spec.limits[0]}' 2>/dev/null)" || true
	if [ -z "$q" ] || [ -z "$lr" ]; then
		printf 'UNKNOWN'
		return 0
	fi
	printf '%s\n%s\n' "$q" "$lr" | awk '
		# Đổi đơn vị k8s → số. CPU về milli, RAM về Mi. Thiếu hàm này thì
		# "4" và "4Gi" so với nhau bằng so chuỗi và ra kết quả vô nghĩa.
		function cpu_m(v) { if (v ~ /m$/) { sub(/m$/, "", v); return v + 0 } return (v + 0) * 1000 }
		function mem_mi(v) {
			if (v ~ /Gi$/) { sub(/Gi$/, "", v); return (v + 0) * 1024 }
			if (v ~ /Mi$/) { sub(/Mi$/, "", v); return v + 0 }
			if (v ~ /Ki$/) { sub(/Ki$/, "", v); return (v + 0) / 1024 }
			return (v + 0) / 1048576
		}
		function get(s, k,   m) {
			m = s; if (match(m, "\"" k "\":\"[^\"]+\"")) {
				m = substr(m, RSTART, RLENGTH); sub(".*:\"", "", m); sub("\"$", "", m); return m
			}
			return ""
		}
		NR == 1 { quota = $0 } NR == 2 { lim = $0 }
		END {
			rc = get(quota, "requests.cpu");    rm = get(quota, "requests.memory")
			lc = get(quota, "limits.cpu");      lm = get(quota, "limits.memory")
			pods = get(quota, "pods")
			# LimitRange lồng hai mức: defaultRequest.* và default.*
			drq = lim; sub(/.*"defaultRequest":\{/, "", drq); sub(/\}.*/, "", drq)
			dfl = lim; sub(/.*"default":\{/, "", dfl); sub(/\}.*/, "", dfl)
			drc = get(drq, "cpu"); drm = get(drq, "memory")
			dfc = get(dfl, "cpu"); dfm = get(dfl, "memory")
			if (drc == "" || drm == "") { printf "UNKNOWN"; exit }
			best = (pods == "" ? 9999 : pods + 0)
			n = int(cpu_m(rc) / cpu_m(drc)); if (n < best) best = n
			n = int(mem_mi(rm) / mem_mi(drm)); if (n < best) best = n
			if (lc != "" && dfc != "") { n = int(cpu_m(lc) / cpu_m(dfc)); if (n < best) best = n }
			if (lm != "" && dfm != "") { n = int(mem_mi(lm) / mem_mi(dfm)); if (n < best) best = n }
			printf "%d", best
		}'
}

# Cổng chung cho ba ca: cần thêm `$1` khe trên trần đọc-từ-cụm.
# Trả 0 nếu đủ chỗ, 1 nếu chật, 2 nếu không đọc được trần.
du_khe() {
	local can="$1" running tran
	running="$(sandbox_pod_count)"
	tran="$(quota_pod_ceiling)"
	KHE_RUNNING="$running"
	KHE_TRAN="$tran"
	[ "$running" = UNKNOWN ] && return 2
	[ "$tran" = UNKNOWN ] && return 2
	[ $((running + can)) -gt "$tran" ] && return 1
	return 0
}

# ── "0 pod rò" nghĩa là gì, chính xác ────────────────────────────────────────
# ⛔ KHÔNG phải "mọi con số đứng yên". `pool:free` PHẢI đổi khi orchestrator khởi
# động lại và bổ sung pool về `POOL_TARGET` — đó là nó làm đúng việc, không phải
# rò. Một ô AC khẳng định `free` bất biến sẽ ĐỎ VĨNH VIỄN vì một hành vi đúng, và
# người sau sẽ nới nó cho tới khi nó không kiểm gì. (Đã đỏ đúng như thế ở lượt đo
# 04:57Z: free 0→1 sau restart.)
#
# Bất biến THẬT là index Redis khớp cụm, theo hai chiều:
#   · phantom — tên nằm trong pool:free/claimed mà KHÔNG có pod thật. Đây là chỗ
#     rò làm `dlp_pool_claimed_size` nói dối.
#   · orphan  — pod thật mang nhãn sandbox mà KHÔNG có tên trong index nào. Đây
#     là chỗ rò ĂN QUOTA: không ai biết nó tồn tại để dọn.
# Tầng 2a có grace 5 phút cho pod vừa sinh, nên pod trẻ hơn ngưỡng đó không tính
# là orphan — nếu tính, mọi lượt đo trùng một cold-path đang chạy sẽ đỏ oan.
# ⛔ `|| true` sau `grep .`: dưới `pipefail`, hai list RỖNG làm grep trả 1 ⇒ hàm
# trả 1 ⇒ `idx="$(index_names)"` là simple command thất bại ⇒ `set -e` giết cả
# script giữa phép đo, không in bảng TỔNG. Pool rỗng là trạng thái hợp lệ.
index_names() { { redis LRANGE pool:free 0 -1; redis LRANGE pool:claimed 0 -1; } | grep . | sort -u || true; }

# ⛔ `custom-columns` CHỨ KHÔNG PHẢI `jsonpath`. Không vì jsonpath sai — nó chạy
# đúng — mà vì chuỗi jsonpath cần dấu nháy lồng trong dấu nháy và một `{"\n"}`,
# tức ba lớp escape khi file này được sinh/sửa bằng công cụ. Đúng chỗ đó đã hỏng
# một lần: `\n` biến thành một dòng mới THẬT, `cluster_names` trả rỗng, và mọi
# tên trong index bị đọc thành "phantom" — một ô AC đỏ rực trong khi hệ không
# sao. Dạng dưới không có escape nào để hỏng.
cluster_names() {
	kubectl -n "$SANDBOX_NS" get pods -l app=sandbox --no-headers \
		-o custom-columns=NAME:.metadata.name,PHASE:.status.phase,CREATED:.metadata.creationTimestamp 2>/dev/null |
		awk '$2 == "Running" { print $1, $3 }' | sort -u
}

# phantom_orphan — in "phantom=<n>:<tên...> orphan=<n>:<tên...>"
phantom_orphan() {
	local idx clu now name created age
	local young=300
	local -a phantom=() orphan=()
	idx="$(index_names)"
	clu="$(cluster_names)"
	now="$(vm_now)"

	while read -r name; do
		if [ -z "$name" ]; then continue; fi
		if ! awk -v n="$name" '$1 == n { f = 1 } END { exit !f }' <<<"$clu"; then
			phantom+=("$name")
		fi
	done <<<"$idx"

	while read -r name created; do
		if [ -z "$name" ]; then continue; fi
		local born
		born="$(epoch_of "$created")" || continue
		age=$((now - born))
		if [ "$age" -lt "$young" ]; then continue; fi
		if ! grep -qxF "$name" <<<"$idx"; then
			orphan+=("$name")
		fi
	done <<<"$clu"

	printf 'phantom=%d:%s orphan=%d:%s' "${#phantom[@]}" "${phantom[*]:-∅}" "${#orphan[@]}" "${orphan[*]:-∅}"
}

# ─────────────────────────────────────────────────────────────────────────────
# CA 1 — AC-C2: reaper dọn session HẾT HẠN, và KHÔNG đụng session chưa hết hạn.
# ─────────────────────────────────────────────────────────────────────────────
case_expiry() {
	step "AC-C2 — reaper dọn session hết hạn (đối chứng âm: session chưa hết hạn)"

	# Preflight quota. Trần thật của lab KHÔNG phải `pods:` mà là số nhỏ nhất
	# trong năm ràng buộc quota×LimitRange — `quota_pod_ceiling` đọc từ cụm.
	# Chạy thiếu chỗ thì `CreateSession` đỏ vì hết quota và ta sẽ đọc nó thành
	# "reaper hỏng".
	# ⛔ THIẾU KHE LÀ ĐIỀU KIỆN MÔI TRƯỜNG, KHÔNG PHẢI MỘT Ô AC ĐỎ. Ghi nó bằng
	# `bad` nghĩa là một lượt chạy trùng lúc cụm bận đọc ra như "reaper hỏng".
	# `exit 2` phân biệt được "không đo được" với "đo được và sai".
	local need_slots rc
	need_slots=$((EXPIRE_COUNT + 1))
	du_khe "$need_slots"
	rc=$?
	if [ "$rc" -eq 2 ]; then
		echo "không đọc được số pod / trần quota (kubectl lỗi) — không đo được, không kết luận" >&2
		exit 2
	fi
	info "sandbox pod đang chạy: ${KHE_RUNNING} · cần thêm ${need_slots} khe (trần ${KHE_TRAN})"
	if [ "$rc" -eq 1 ]; then
		echo "thiếu khe quota: đang ${KHE_RUNNING}, cần ${need_slots}, trần ${KHE_TRAN} — chờ session cũ hết hạn rồi chạy lại" >&2
		exit 2
	fi

	scrape_metrics || true
	local m_claimed0 m_keyspace0
	m_claimed0="$(metric dlp_reaper_claimed_orphan_total)"
	m_keyspace0="$(metric dlp_reaper_keyspace_events_total)"
	info "mốc counter: claimed_orphan=${m_claimed0} keyspace_events=${m_keyspace0}"

	# ── Dựng cảnh ────────────────────────────────────────────────────────────
	local tag i logs ids=() pods=() expires=()
	tag="rv$(vm_now)"

	for i in $(seq 1 "$EXPIRE_COUNT"); do
		logs="$(probe "reaper-probe-short-${tag}-${i}" \
			-case create -keep -ttl "$SHORT_TTL" -user "reaper-short-${tag}-${i}" -tag "s${tag}${i}")"
		ids+=("$(kvof "$logs" SESSIONID)")
		pods+=("$(kvof "$logs" PODNAME)")
		expires+=("$(kvof "$logs" EXPIRESAT)")
	done

	logs="$(probe "reaper-probe-long-${tag}" \
		-case create -keep -ttl "$LONG_TTL" -user "reaper-long-${tag}" -tag "l${tag}")"
	local long_id long_pod long_exp
	long_id="$(kvof "$logs" SESSIONID)"
	long_pod="$(kvof "$logs" PODNAME)"
	long_exp="$(kvof "$logs" EXPIRESAT)"

	if [ -z "${pods[0]:-}" ] || [ -z "$long_pod" ] || [ -z "${expires[0]:-}" ]; then
		bad "dựng được cảnh (${EXPIRE_COUNT} session ngắn + 1 session dài)" \
			"short=${pods[*]:-∅} long=${long_pod:-∅} expiresAt=${expires[0]:-∅}"
		scrub_all "${pods[@]:-}" "$long_pod"
		return
	fi
	info "session ngắn (ttl=${SHORT_TTL}s): ${pods[*]}"
	info "session dài  (ttl=${LONG_TTL}s): ${long_pod} · hết hạn ${long_exp}"

	# ── VẾ 1 (đối chứng dương): t0 — mọi thứ ĐANG SỐNG và quan sát được ──────
	local alive_at_t0=yes p ph
	for p in "${pods[@]}" "$long_pod"; do
		ph="$(pod_exists "$p")"
		case "$ph" in
		MISSING | UNKNOWN) alive_at_t0=no ;;
		esac
		[ "$(in_claimed "$p")" = yes ] || alive_at_t0=no
	done
	if [ "$alive_at_t0" = yes ]; then
		ok "t0: cả ${need_slots} pod đều SỐNG và nằm trong pool:claimed" "phép quan sát có khả năng thấy 'còn'"
	else
		bad "t0: cả ${need_slots} pod đều SỐNG và nằm trong pool:claimed" "không dựng được cảnh — mọi vế sau vô nghĩa"
		return
	fi

	# ── Chờ ──────────────────────────────────────────────────────────────────
	# Hạn chót = EXPIRESAT (đồng hồ server) + REAP_INTERVAL + biên. Tầng 1 nghe
	# keyspace event nên thường xoá trong ~1s; tầng 2c là lưới đỡ khi event lỡ,
	# và nó chỉ chạy mỗi REAP_INTERVAL.
	local reap_interval exp_epoch deadline t_start e
	reap_interval="$(read_reap_interval)"

	# ⛔ NEO VÀO MỐC HẾT HẠN MUỘN NHẤT, KHÔNG PHẢI CÁI ĐẦU TIÊN. Các session ngắn
	# được dựng TUẦN TỰ, mỗi cái một probe pod (chờ tới 180s). Nên
	# `exp[n] ≥ exp[0] + thời-gian-dựng`: neo vào `exp[0]` thì một lần schedule
	# chậm là session cuối chưa kịp hết hạn khi hạn chót đã qua, và ô AC đỏ chỉ
	# thẳng vào reaper cho một lỗi của phép đo.
	exp_epoch=0
	for e in "${expires[@]}"; do
		local t
		t="$(epoch_of "$e")" || continue
		[ "$t" -gt "$exp_epoch" ] && exp_epoch="$t"
	done
	if [ "$exp_epoch" -eq 0 ]; then
		bad "đọc được mốc hết hạn từ server" "expires=${expires[*]:-∅}"
		scrub_all "${pods[@]}" "$long_pod"
		return
	fi
	deadline=$((exp_epoch + reap_interval + 45))
	t_start="$(vm_now)"
	info "chờ tới $(date -u -d "@${deadline}" +%H:%M:%SZ) (hết hạn muộn nhất $(date -u -d "@${exp_epoch}" +%H:%M:%SZ) + REAP_INTERVAL ${reap_interval}s + 45s biên)"

	local gone_at=""
	while [ "$(vm_now)" -le "$deadline" ]; do
		local all_gone=yes
		for p in "${pods[@]}"; do
			pod_gone "$p" || all_gone=no
		done
		if [ "$all_gone" = yes ]; then
			gone_at="$(vm_now)"
			break
		fi
		sleep 5
	done

	# ── VẾ 2: session hết hạn đã bị dọn ──────────────────────────────────────
	local elapsed still=()
	for p in "${pods[@]}"; do
		pod_gone "$p" || still+=("$p [$(pod_exists "$p")]")
	done
	if [ ${#still[@]} -eq 0 ]; then
		[ -n "$gone_at" ] || gone_at="$(vm_now)"
		# Đo từ MỐC HẾT HẠN, không từ lúc bắt đầu chờ. Con số AC quan tâm là "sau
		# khi hết hạn bao lâu thì pod biến mất"; đo từ t_start thì nó gộp cả thời
		# gian dựng cảnh (3 probe pod, mỗi cái ~15s) và đọc ra nhỏ hơn sự thật ở
		# một lượt chạy nhanh, lớn hơn ở lượt chậm — tức một con số không so sánh
		# được giữa hai lượt.
		elapsed=$((gone_at - exp_epoch))
		ok "AC-C2 vế 1: ${EXPIRE_COUNT}/${EXPIRE_COUNT} pod của session hết hạn đã bị XOÁ" \
			"sau ${elapsed}s kể từ mốc hết hạn muộn nhất (độ phân giải poll 5s)"
	else
		bad "AC-C2 vế 1: pod của session hết hạn đã bị XOÁ" "chưa biến mất: ${still[*]}"
	fi

	# `unknown` KHÔNG được tính là "đã rời index" — xem khối fail-closed ở đầu file.
	local still_indexed=() idx
	for p in "${pods[@]}"; do
		idx="$(in_claimed "$p")"
		[ "$idx" = no ] || still_indexed+=("${p}(${idx})")
	done
	if [ ${#still_indexed[@]} -eq 0 ]; then
		ok "AC-C2 vế 1b: tên đã rời pool:claimed" "index sạch — dlp_pool_claimed_size đếm đúng"
	else
		bad "AC-C2 vế 1b: tên đã rời pool:claimed" "còn treo (hoặc không đọc được): ${still_indexed[*]}"
	fi

	# ── VẾ 3 (đối chứng âm): session CHƯA hết hạn phải còn nguyên ────────────
	local long_phase long_idx
	long_phase="$(pod_exists "$long_pod")"
	long_idx="$(in_claimed "$long_pod")"
	if [ "$long_phase" = Running ] && [ "$long_idx" = yes ]; then
		ok "AC-C2 vế 2 (đối chứng âm): session CHƯA hết hạn còn nguyên" "pod=${long_phase}, trong pool:claimed"
	else
		bad "AC-C2 vế 2 (đối chứng âm): session CHƯA hết hạn còn nguyên" \
			"pod='${long_phase}' claimed=${long_idx} — nếu MISSING thì reaper xoá bừa; nếu UNKNOWN thì phép đo hỏng, đừng kết luận"
	fi

	# ── Tầng nào đã làm việc ─────────────────────────────────────────────────
	scrape_metrics || true
	local m_claimed1 m_keyspace1
	m_claimed1="$(metric dlp_reaper_claimed_orphan_total)"
	m_keyspace1="$(metric dlp_reaper_keyspace_events_total)"
	info "counter sau: claimed_orphan=${m_claimed0}→${m_claimed1} keyspace_events=${m_keyspace0}→${m_keyspace1}"
	info "(tầng 1 = keyspace event, xoá gần như tức thì; tầng 2c = lưới đỡ mỗi ${reap_interval}s)"

	# ── Dọn ──────────────────────────────────────────────────────────────────
	# Dọn ĐỦ MỌI DẤU VẾT, không chỉ session key. Xoá mỗi key rồi bỏ đi sẽ để lại
	# đúng cái rác mà chặng này vừa vá — lượt chạy sau sẽ đọc nó thành một chỗ rò
	# mới, và trần quota 4 pod không chịu được vài lượt như thế.
	#
	# ⛔ DỌN CẢ SESSION NGẮN. Bản đầu chỉ dọn session dài, nên khi AC-C2 ĐỎ (đúng
	# lúc ta cần chạy lại nhất) hai pod ngắn ở lại và lượt sau chết ở preflight
	# quota — một ô đỏ hoàn toàn do rác của lượt trước.
	scrub_all "${pods[@]}" "$long_pod"
}

# read_reap_interval — REAP_INTERVAL của orchestrator, ĐÃ kiểm là số.
#
# ⛔ `kubectl get -o jsonpath` THOÁT 0 VÀ IN RỖNG khi field không tồn tại, nên
# `|| echo 60s` chỉ cứu được ca kubectl lỗi, không cứu ca đổi tên env / khác
# RELEASE / orchestrator không phải `containers[0]`. Với chuỗi rỗng,
# `$((exp + reap_interval + 45))` cho ra `exp + 45` mà bash KHÔNG báo gì (nó đọc
# `+ + 45` là cộng-nhị-phân rồi cộng-đơn-phân) ⇒ hạn chờ tụt xuống dưới một chu
# kỳ sweep và AC-C2 đỏ vì phép đo.
read_reap_interval() {
	local v
	v="$(kubectl -n "$NS" get deploy "${RELEASE}-orchestrator" \
		-o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="REAP_INTERVAL")].value}' 2>/dev/null || true)"
	v="${v%s}"
	case "$v" in
	'' | *[!0-9]*)
		info "không đọc được REAP_INTERVAL (nhận '${v}') — dùng mặc định 60s"
		printf '60'
		;;
	*) printf '%s' "$v" ;;
	esac
}

# epoch_of — RFC3339 → epoch; thoát khác 0 nếu không phân giải được.
# `date` lỗi mà không chặn ở đây thì `$((now - ))` giết cả script giữa phép đo.
epoch_of() {
	local t
	[ -n "$1" ] || return 1
	t="$(date -u -d "$1" +%s 2>/dev/null)" || return 1
	[ -n "$t" ] || return 1
	printf '%s' "$t"
}

# scrub_all <pod...> — dọn theo TÊN POD, tra ngược session id từ hash pod.
# Dùng ở các đường thoát sớm, nơi ta có tên pod nhưng không muốn thread session id.
scrub_all() {
	local p sid
	for p in "$@"; do
		[ -n "$p" ] || continue
		sid="$(redis HGET "pod:${p}" sessionId 2>/dev/null || true)"
		scrub_session "${sid:-unknown}" "$p"
	done
}

# scrub_session — gỡ mọi dấu vết của một session dựng-để-đo.
scrub_session() {
	local sid="$1" spod="$2"
	info "dọn session ${sid} (pod ${spod})"
	redis DEL "session:${sid}" >/dev/null 2>&1 || true
	redis DEL "session:${sid}:pod" >/dev/null 2>&1 || true
	redis LREM pool:claimed 0 "$spod" >/dev/null 2>&1 || true
	redis DEL "pod:${spod}" >/dev/null 2>&1 || true
	kubectl -n "$SANDBOX_NS" delete pod "$spod" --ignore-not-found --wait=false >/dev/null 2>&1 || true
}

# ─────────────────────────────────────────────────────────────────────────────
# CA 2 — AC-C3 vế còn thiếu: session ĐANG SỐNG vẫn dùng được sau khi
# orchestrator restart. Lượt đo trước chỉ đóng được vế "pool không đổi", vì lúc
# đo không có session sống nào để hỏi.
# ─────────────────────────────────────────────────────────────────────────────
case_restart() {
	step "AC-C3 — session sống qua được một lần restart orchestrator"

	if ! du_khe 1; then
		bad "đủ khe quota để dựng cảnh" "đang ${KHE_RUNNING}, cần 1, trần ${KHE_TRAN}"
		return
	fi

	local tag logs sid spod
	tag="rr$(vm_now)"
	logs="$(probe "reaper-probe-live-${tag}" \
		-case create -keep -ttl "$LONG_TTL" -user "reaper-live-${tag}" -tag "$tag")"
	sid="$(kvof "$logs" SESSIONID)"
	spod="$(kvof "$logs" PODNAME)"
	if [ -z "$sid" ]; then
		bad "dựng được một session sống trước restart" "probe không in SESSIONID"
		return
	fi
	info "session ${sid} trên pod ${spod}"

	# Mốc TRƯỚC: đọc được, ghi được, pod bao nhiêu tuổi.
	local free0 claimed0 pod_start0 consist0
	free0="$(redis LLEN pool:free)"
	claimed0="$(redis LLEN pool:claimed)"
	consist0="$(phantom_orphan)"
	info "khớp index/cụm trước restart: ${consist0}"
	pod_start0="$(kubectl -n "$SANDBOX_NS" get pod "$spod" -o jsonpath='{.status.startTime}' 2>/dev/null || echo "")"

	logs="$(probe "reaper-probe-before-${tag}" -case check -session "$sid" -user "reaper-live-${tag}")"
	if printf '%s' "$logs" | grep -q "KẾT QUẢ: PASS"; then
		ok "trước restart: session đọc được VÀ ghi được" "GetSession + ExtendSession đều OK"
	else
		bad "trước restart: session đọc được VÀ ghi được" "$(printf '%s' "$logs" | grep '^FAIL' | head -2 | tr '\n' ' ')"
		return
	fi

	# ── Restart ──────────────────────────────────────────────────────────────
	step "restart orchestrator"
	kubectl -n "$NS" rollout restart "deploy/${RELEASE}-orchestrator" >/dev/null
	kubectl -n "$NS" rollout status "deploy/${RELEASE}-orchestrator" --timeout=180s >/dev/null
	info "rollout xong lúc $(date -u +%H:%M:%SZ)"
	# Sweep-lúc-khởi-động chạy NGAY, không chờ hết một chu kỳ — đây chính là thứ
	# có thể ăn nhầm session đang sống, nên phải để nó chạy rồi mới hỏi.
	sleep 20

	# ── Vế chính: session CŨ vẫn dùng được ───────────────────────────────────
	logs="$(probe "reaper-probe-after-${tag}" -case check -session "$sid" -user "reaper-live-${tag}")"
	if printf '%s' "$logs" | grep -q "KẾT QUẢ: PASS"; then
		ok "AC-C3 vế 2: session cũ VẪN dùng được sau restart" "GetSession + ExtendSession đều OK"
	else
		bad "AC-C3 vế 2: session cũ VẪN dùng được sau restart" "$(printf '%s' "$logs" | grep '^FAIL' | head -3 | tr '\n' ' ')"
	fi

	# ── Và pod là CHÍNH pod cũ, không phải một pod mới trùng vai ─────────────
	local pod_phase pod_start1
	pod_phase="$(pod_exists "$spod")"
	pod_start1="$(kubectl -n "$SANDBOX_NS" get pod "$spod" -o jsonpath='{.status.startTime}' 2>/dev/null || echo "")"
	if [ "$pod_phase" = Running ] && [ "$pod_start1" = "$pod_start0" ]; then
		ok "AC-C3 vế 2b: ĐÚNG pod cũ còn chạy, không bị tạo lại" "startTime ${pod_start1} không đổi"
	else
		bad "AC-C3 vế 2b: ĐÚNG pod cũ còn chạy, không bị tạo lại" \
			"phase='${pod_phase:-BIẾN MẤT}' startTime ${pod_start0} → ${pod_start1}"
	fi

	local free1 claimed1 consist1
	free1="$(redis LLEN pool:free)"
	claimed1="$(redis LLEN pool:claimed)"
	consist1="$(phantom_orphan)"
	info "pool: free ${free0}→${free1} (đổi theo POOL_TARGET là ĐÚNG), claimed ${claimed0}→${claimed1}"
	info "khớp index/cụm sau restart: ${consist1}"

	# ⛔ KHÔNG GÁC TRÊN MỖI TỔNG. `LLEN` bằng nhau vẫn đúng khi pod của session này
	# rơi ra và một pod khác lọt vào — ô gác trên TỔNG mù đúng ca nó cần thấy. Nên
	# kèm một khẳng định trên CHÍNH tên pod đang đo.
	local spod_idx
	spod_idx="$(in_claimed "$spod")"
	if [ "$claimed0" = "$claimed1" ] && [ "$spod_idx" = yes ]; then
		ok "AC-C3 vế 1a: pod của session này vẫn trong pool:claimed" "claimed ${claimed0}→${claimed1}, ${spod} còn trong index"
	else
		bad "AC-C3 vế 1a: pod của session này vẫn trong pool:claimed" \
			"claimed ${claimed0}→${claimed1}, ${spod} trong index=${spod_idx}"
	fi
	if [ "$consist1" = "$(printf 'phantom=0:∅ orphan=0:∅')" ]; then
		ok "AC-C3 vế 1b: index Redis khớp cụm — 0 pod rò cả hai chiều" "$consist1"
	else
		bad "AC-C3 vế 1b: index Redis khớp cụm — 0 pod rò cả hai chiều" "$consist1"
	fi

	scrub_session "$sid" "$spod"
}

# ─────────────────────────────────────────────────────────────────────────────
# CA 3 — chỗ rò đo được trên cụm 2026-08-15: session ma bị chuyển FAILED nhưng
# tên pod Ở LẠI `pool:claimed`.
#
# Không tầng nào nhặt được phần rác đó: tầng 2b bỏ qua mọi status cuối, tầng 2c
# chỉ dọn khi `EXISTS session:{id}` == 0 — mà hash FAILED vẫn còn tới hết TTL.
# Hệ quả: `dlp_pool_claimed_size` (panel "pod pool" của 3.D, và là đại lượng 3.F
# định dùng để khẳng định "0 pod rò") báo sai suốt tới một giờ. Đo thật lúc phát
# hiện: `pool:claimed` giữ 6 tên trong khi namespace chỉ có 1 pod.
#
# Ca này dựng lại đúng cảnh đó và khẳng định index sạch — có đối chứng âm là một
# session còn sống trong CÙNG lượt.
# ─────────────────────────────────────────────────────────────────────────────
case_ghost() {
	step "Chỗ rò session-ma — FAILED không được để lại tên trong pool:claimed"

	if ! du_khe 2; then
		bad "đủ khe quota để dựng cảnh" "đang ${KHE_RUNNING}, cần 2, trần ${KHE_TRAN}"
		return
	fi

	local tag logs ghost_id ghost_pod ctl_id ctl_pod
	tag="rg$(vm_now)"
	logs="$(probe "reaper-probe-ghost-${tag}" \
		-case create -keep -ttl "$LONG_TTL" -user "reaper-ghost-${tag}" -tag "g${tag}")"
	ghost_id="$(kvof "$logs" SESSIONID)"
	ghost_pod="$(kvof "$logs" PODNAME)"
	logs="$(probe "reaper-probe-ctl-${tag}" \
		-case create -keep -ttl "$LONG_TTL" -user "reaper-ctl-${tag}" -tag "c${tag}")"
	ctl_id="$(kvof "$logs" SESSIONID)"
	ctl_pod="$(kvof "$logs" PODNAME)"

	if [ -z "$ghost_pod" ] || [ -z "$ctl_pod" ]; then
		bad "dựng được cảnh (1 session sẽ thành ma + 1 đối chứng)" "ghost=${ghost_pod:-∅} ctl=${ctl_pod:-∅}"
		return
	fi
	info "sẽ thành ma: ${ghost_pod} · đối chứng: ${ctl_pod}"

	if [ "$(in_claimed "$ghost_pod")" = yes ] && [ "$(in_claimed "$ctl_pod")" = yes ]; then
		ok "t0: cả hai pod nằm trong pool:claimed" "phép quan sát thấy được 'có trong index'"
	else
		bad "t0: cả hai pod nằm trong pool:claimed" "ghost=$(in_claimed "$ghost_pod") ctl=$(in_claimed "$ctl_pod")"
		return
	fi

	# Làm pod BIẾN MẤT khỏi apiserver — đúng cảnh mà tầng 2b sinh ra để xử lý.
	# `--force --grace-period=0` để object rụng NGAY: thứ tầng 2b hỏi là
	# `pods.Get` trả NotFound, không phải tiến trình bên trong đã chết chưa.
	kubectl -n "$SANDBOX_NS" delete pod "$ghost_pod" --force --grace-period=0 >/dev/null 2>&1 || true
	info "đã xoá ${ghost_pod} khỏi apiserver lúc $(date -u +%H:%M:%SZ)"

	local reap_interval deadline status
	reap_interval="$(kubectl -n "$NS" get deploy "${RELEASE}-orchestrator" \
		-o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="REAP_INTERVAL")].value}' 2>/dev/null || echo 60s)"
	reap_interval="${reap_interval%s}"
	deadline=$(($(vm_now) + reap_interval + 45))
	while [ "$(vm_now)" -le "$deadline" ]; do
		status="$(redis HGET "session:${ghost_id}" status || true)"
		[ "$status" = FAILED ] && break
		sleep 5
	done

	if [ "$status" = FAILED ]; then
		ok "tầng 2b nhận ra session ma" "status=FAILED"
	else
		bad "tầng 2b nhận ra session ma" "status='${status:-∅}' sau ${reap_interval}s+45s — chưa tới bước đo chỗ rò"
		scrub_session "$ghost_id" "$ghost_pod"
		scrub_session "$ctl_id" "$ctl_pod"
		return
	fi

	# ── Vế chính: index PHẢI sạch ────────────────────────────────────────────
	local ghost_idx ghost_hash
	ghost_idx="$(in_claimed "$ghost_pod")"
	ghost_hash="$(redis EXISTS "pod:${ghost_pod}" || echo NA)"
	if [ "$ghost_idx" = no ] && [ "$ghost_hash" = 0 ]; then
		ok "session ma KHÔNG để lại tên trong pool:claimed" "index sạch, hash pod:{name} đã xoá"
	else
		bad "session ma KHÔNG để lại tên trong pool:claimed" \
			"trong pool:claimed=${ghost_idx}, pod:{name} tồn tại=${ghost_hash} — dlp_pool_claimed_size đang đếm một pod không tồn tại"
	fi

	# Hash session PHẢI còn: FE đọc lý do phiên chết ở đây. Ranh giới giữa "dọn
	# index" và "xoá session" — vượt qua nó là đổi hợp đồng với FE.
	if [ "$(redis EXISTS "session:${ghost_id}" || echo NA)" = 1 ]; then
		ok "hash session ma VẪN còn (FE đọc được lý do)" "EXISTS=1, status=FAILED"
	else
		bad "hash session ma VẪN còn (FE đọc được lý do)" "đã bị xoá — FE sẽ thấy 404 trần thay vì lý do"
	fi

	# ── Đối chứng âm ─────────────────────────────────────────────────────────
	local ctl_idx ctl_phase
	ctl_idx="$(in_claimed "$ctl_pod")"
	ctl_phase="$(pod_exists "$ctl_pod")"
	if [ "$ctl_idx" = yes ] && [ "$ctl_phase" = Running ]; then
		ok "đối chứng âm: session còn sống KHÔNG bị đụng" "pod=${ctl_phase}, vẫn trong pool:claimed"
	else
		bad "đối chứng âm: session còn sống KHÔNG bị đụng" \
			"claimed=${ctl_idx} pod='${ctl_phase:-BIẾN MẤT}' — bản vá đang quét bừa chứ không nhắm đúng session ma"
	fi

	scrub_session "$ghost_id" "$ghost_pod"
	scrub_session "$ctl_id" "$ctl_pod"
}

# ─────────────────────────────────────────────────────────────────────────────
printf '\033[1mreaper-verify\033[0m · ns=%s sandbox=%s · %s\n' "$NS" "$SANDBOX_NS" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ⛔ KHÔNG viết `[ x = a ] || [ x = b ] && ca_nay`. Dưới `set -e`, cả biểu thức
# trả non-zero khi cả hai vế sai ⇒ script THOÁT IM LẶNG ngay tại dòng đó, và
# `--case expiry` sẽ kết thúc sau ca đầu mà không in bảng tổng — đọc ra y hệt
# "ca restart chạy xong và không có gì để nói".
if [ "$CASE" = all ] || [ "$CASE" = expiry ]; then
	case_expiry
fi
if [ "$CASE" = all ] || [ "$CASE" = ghost ]; then
	case_ghost
fi
if [ "$CASE" = all ] || [ "$CASE" = restart ]; then
	case_restart
fi

step "TỔNG"
printf '%s\n' "${RESULTS[@]:-(không có vế nào chạy)}"
printf '\npass=%d fail=%d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "KẾT QUẢ: PASS"
