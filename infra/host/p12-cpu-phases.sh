#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# p12-cpu-phases.sh — 12.C: tách CPU của TỪNG GIAI ĐOẠN (dockerd-boot / pull / build).
#
# Nợ §8 của báo cáo cũ: ba giai đoạn bị gộp thành một con số, nên không biết
# phần nào thật sự đắt. Script này lấy mẫu `cpu.stat` ở cgroup mức POD (gộp cả
# container lồng do dockerd bên trong tạo) và cắt theo mốc thời gian từng pha.
#
# ⛔ CHẠY TOÀN BỘ TRÊN VM — MỘT ĐỒNG HỒ DUY NHẤT.
# Đồng hồ VM lệch +2.78s so với Windows (đo 2026-09-04). Nếu mốc pha lấy từ
# Windows còn mẫu cgroup lấy từ VM thì mọi phép cắt đều lệch ~3s — đủ để gán
# nhầm phần đuôi của `pull` sang `build`. Vì thế cả tạo phiên, chạy lệnh, lẫn
# lấy mẫu đều thực hiện tại đây.
#
# ⚠ HẠN CHẾ THẬT — `dockerd-boot` BỊ ĐO THIẾU, đừng đọc nó là "boot rẻ".
# Sampler chỉ khởi động SAU khi cgroup của pod xuất hiện, mà cgroup chỉ xuất
# hiện sau khi pod được tạo. Phần boot xảy ra TRƯỚC mẫu đầu tiên nằm ngoài tầm
# nhìn của script. Thêm nữa: pod lấy từ WARM POOL đã có dockerd chạy sẵn, nên
# với phiên warm thì "boot" gần như bằng 0 một cách chính đáng — chi phí ấy đã
# trả trước lúc pool nạp. Đo được 2026-09-05: pha này chỉ có **2 mẫu**.
# ⇒ Con số dockerd-boot dưới đây là CẬN DƯỚI cho phiên warm, và KHÔNG nói gì về
#   phiên cold-path (người thứ 21–23 khi pool cạn). Muốn số cold thì phải làm
#   cạn pool trước rồi mới tạo phiên.
#
# ⚠ `nr_throttled` KHÔNG phải nguồn sự thật về "có đói CPU không".
# Nó chỉ đếm khi pod chạm `cpu.max` CỦA CHÍNH NÓ. Khi ràng buộc là dung lượng
# node (18 pod tranh 8 core) thì nó đứng im ở 0 trong khi mọi thứ chậm đi
# (throttle-zero-hides-node-level-starvation). Nên script ghi CẢ load average
# của node và thời gian tường — đó mới là thứ nói thật.
#
# Dùng:  bash p12-cpu-phases.sh [--out /tmp/p12c]
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

NS="${NS:-dlp-sandbox}"
TARGET="${TARGET:-https://dlp.192.168.94.130.sslip.io:30443}"
ORIGIN="${ORIGIN:-$TARGET}"
SCENARIO="${SCENARIO:-dlp-docker-basics}"
USERS="${USERS:-$HOME/.p12/users.json}"
OUT="${OUT:-/tmp/p12c}"
SAMPLE_SEC="${SAMPLE_SEC:-0.5}"

while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    *) echo "tham số lạ: $1" >&2; exit 2 ;;
  esac
done
mkdir -p "$OUT"
loi() { echo "✖ $*" >&2; exit 1; }
now() { date +%s.%N; }

[ -f "$USERS" ] || loi "thiếu $USERS (scp infra/k6/.users.json lên)"
COOKIE="$(python3 -c "import json;print(json.load(open('$USERS'))[0]['cookie'])")"
[ -n "$COOKIE" ] || loi "không đọc được cookie"

CURL=(curl -sk --http1.1 -m 180 -H "content-type: application/json" -H "origin: $ORIGIN" -H "cookie: $COOKIE")

# ── Pha 0: tạo phiên. t0 = ngay TRƯỚC lời gọi, vì dockerd bắt đầu boot từ lúc
# pod được tạo chứ không từ lúc ta hỏi tới nó. ───────────────────────────────
T_CREATE=$(now)
RESP="$("${CURL[@]}" -X POST -d "{\"scenarioId\":\"$SCENARIO\",\"idempotencyKey\":\"p12c-$(date +%s)\"}" \
  "$TARGET/api/trpc/lessons.startSession")"
POD="$(python3 -c "
import json,sys
try:
    d=json.loads(sys.argv[1]); print(d['result']['data']['session']['podName'])
except Exception as e: print('')
" "$RESP")"
SID="$(python3 -c "
import json,sys
try:
    d=json.loads(sys.argv[1]); print(d['result']['data']['session']['id'])
except Exception: print('')
" "$RESP")"
[ -n "$POD" ] || loi "không tạo được phiên: $(echo "$RESP" | head -c 300)"
echo "pod=$POD session=$SID"

don_phien() {
  [ -n "${SID:-}" ] && "${CURL[@]}" -X POST -d "{\"sessionId\":\"$SID\"}" \
    "$TARGET/api/trpc/lessons.endSession" >/dev/null 2>&1
}
trap 'kill ${SAMPLER_PID:-0} 2>/dev/null; don_phien' EXIT

# ── Tìm cgroup mức POD ───────────────────────────────────────────────────────
UID_POD=""
for _ in $(seq 1 60); do
  UID_POD=$(kubectl get pod -n "$NS" "$POD" -o jsonpath='{.metadata.uid}' 2>/dev/null)
  [ -n "$UID_POD" ] && break
  sleep 0.5
done
[ -n "$UID_POD" ] || loi "không lấy được uid pod"
PAT="pod${UID_POD//-/_}"
CG=""
for _ in $(seq 1 120); do
  CG=$(sudo find /sys/fs/cgroup -maxdepth 4 -type d -name "*${PAT}*" 2>/dev/null | head -1)
  [ -n "$CG" ] && break
  sleep 0.5
done
[ -n "$CG" ] || loi "không tìm được cgroup của pod (pattern $PAT)"
echo "cgroup=$CG"

# ── Sampler: cpu.stat của pod + load average của NODE ───────────────────────
SAMPLES="$OUT/samples.jsonl"
: > "$SAMPLES"
(
  while :; do
    cpu=$(sudo awk '/^usage_usec /{print $2}' "$CG/cpu.stat" 2>/dev/null) || break
    [ -n "$cpu" ] || break
    thr=$(sudo awk '/^nr_throttled /{print $2}' "$CG/cpu.stat" 2>/dev/null)
    thu=$(sudo awk '/^throttled_usec /{print $2}' "$CG/cpu.stat" 2>/dev/null)
    mem=$(sudo cat "$CG/memory.current" 2>/dev/null)
    ina=$(sudo awk '/^inactive_file /{print $2}' "$CG/memory.stat" 2>/dev/null)
    la=$(cut -d' ' -f1 /proc/loadavg)
    printf '{"t":%s,"cpuUsec":%s,"nrThrottled":%s,"throttledUsec":%s,"mem":%s,"workingSet":%s,"load1":%s}\n' \
      "$(now)" "$cpu" "${thr:-0}" "${thu:-0}" "${mem:-0}" "$(( ${mem:-0} - ${ina:-0} ))" "$la" >> "$SAMPLES"
    sleep "$SAMPLE_SEC"
  done
) &
SAMPLER_PID=$!

inpod() { kubectl exec -n "$NS" "$POD" -c sandbox -- bash -lc "$1"; }

# ── Pha 1: dockerd-boot — từ lúc tạo phiên tới lúc `docker info` trả lời ─────
T_BOOT_START="$T_CREATE"
ok=0
for _ in $(seq 1 120); do
  if inpod 'docker info >/dev/null 2>&1'; then ok=1; break; fi
  sleep 1
done
T_BOOT_END=$(now)
[ "$ok" = 1 ] || loi "dockerd không lên"

# ── Pha 2: pull ─────────────────────────────────────────────────────────────
T_PULL_START=$(now)
inpod 'docker pull python:3.12-slim' >/dev/null 2>&1
T_PULL_END=$(now)

# ── Pha 3: build ────────────────────────────────────────────────────────────
inpod 'mkdir -p /root/lab-docker && cd /root/lab-docker && printf "print(\"DLP docker lab\")\n" > app.py && printf "FROM python:3.12-slim\nWORKDIR /app\nCOPY app.py .\nCMD [\"python\", \"app.py\"]\n" > Dockerfile' >/dev/null 2>&1
T_BUILD_START=$(now)
inpod 'cd /root/lab-docker && docker build -t myapp:1 .' >/dev/null 2>&1
T_BUILD_END=$(now)

sleep 1
kill "$SAMPLER_PID" 2>/dev/null
wait "$SAMPLER_PID" 2>/dev/null

# ── Quy CPU về từng pha ─────────────────────────────────────────────────────
python3 - "$SAMPLES" "$T_BOOT_START" "$T_BOOT_END" "$T_PULL_START" "$T_PULL_END" \
  "$T_BUILD_START" "$T_BUILD_END" "$OUT/phases.json" <<'PY'
import json, sys
sam_path, *marks, out = sys.argv[1:]
bs, be, ps, pe, Bs, Be = (float(x) for x in marks)
rows = [json.loads(l) for l in open(sam_path) if l.strip()]
rows.sort(key=lambda r: r["t"])
if len(rows) < 2:
    print("KHÔNG ĐO ĐƯỢC: <2 mẫu"); sys.exit(2)

def slice_cpu(t0, t1):
    """CPU-giây tiêu trong [t0,t1] = hiệu usage_usec giữa mẫu đầu và mẫu cuối
    NẰM TRONG khoảng. Trả None nếu khoảng không đủ 2 mẫu — 'không đo được'
    phải khác 0, nếu không một pha quá ngắn sẽ đọc ra là 'không tốn CPU'."""
    inside = [r for r in rows if t0 <= r["t"] <= t1]
    if len(inside) < 2:
        return None, None, len(inside), None
    cpu = (inside[-1]["cpuUsec"] - inside[0]["cpuUsec"]) / 1e6
    wall = inside[-1]["t"] - inside[0]["t"]
    loads = [r["load1"] for r in inside]
    return cpu, wall, len(inside), (min(loads), max(loads))

phases = [("dockerd-boot", bs, be), ("pull", ps, pe), ("build", Bs, Be)]
res = {}
tot_cpu = 0.0
for name, a, b in phases:
    cpu, wall, n, ld = slice_cpu(a, b)
    res[name] = {
        "cpuSec": None if cpu is None else round(cpu, 2),
        "wallSec": None if wall is None else round(wall, 2),
        "samples": n,
        "cpuPerWall": None if not cpu or not wall else round(cpu / wall, 2),
        "load1_min_max": ld,
    }
    if cpu: tot_cpu += cpu

# nr_throttled: ghi ra để CHỨNG MINH nó im lặng, không để kết luận từ nó.
thr_first, thr_last = rows[0]["nrThrottled"], rows[-1]["nrThrottled"]
res["_throttle"] = {
    "nrThrottled_delta": thr_last - thr_first,
    "throttledUsec_delta": rows[-1]["throttledUsec"] - rows[0]["throttledUsec"],
    "ghi_chu": ("nr_throttled chỉ đếm khi pod chạm cpu.max CỦA CHÍNH NÓ. "
                "Delta 0 KHÔNG có nghĩa là 'không đói CPU' — khi ràng buộc là "
                "dung lượng node thì nó im lặng. Đọc load1 và wall time."),
}
res["_tong"] = {"cpuSecTong": round(tot_cpu, 2),
                "workingSetDinhMi": round(max(r["workingSet"] for r in rows) / 1048576, 1),
                "soMau": len(rows)}
for name, a, b in phases:
    d = res[name]
    if d["cpuSec"] is None:
        print(f"{name:14s} KHÔNG ĐO ĐƯỢC (chỉ {d['samples']} mẫu)")
    else:
        pct = 100 * d["cpuSec"] / tot_cpu if tot_cpu else 0
        print(f"{name:14s} cpu={d['cpuSec']:7.2f}s  wall={d['wallSec']:6.2f}s  "
              f"cpu/wall={d['cpuPerWall']:.2f}  {pct:5.1f}% tổng  load1={d['load1_min_max']}")
print(f"{'TỔNG':14s} cpu={tot_cpu:7.2f}s   workingSet đỉnh={res['_tong']['workingSetDinhMi']}Mi")
print(f"throttle: nr_throttled Δ={res['_throttle']['nrThrottled_delta']} "
      f"(im lặng ≠ không đói CPU — xem ghi chú trong JSON)")
json.dump(res, open(out, "w"), indent=2, ensure_ascii=False)
PY
echo "→ $OUT/phases.json"
