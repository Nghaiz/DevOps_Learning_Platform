#!/bin/bash
# 6.E — chụp một mẫu workingSet + CPU ở cgroup TRÊN HOST cho pod đo.
#
# ⛔ workingSet = memory.current − inactive_file, KHÔNG phải memory.current.
# memory.current gộp page cache; đặt `requests` theo nó là giữ chỗ cho thứ sắp
# bốc hơi khi kernel cần. Đây đúng công thức kubelet dùng, nên số này so được
# với 163Mi của P3 và với `requests` hiện tại.
#
# ⛔ Đo TRÊN HOST, không `kubectl exec`. Sysbox biên tập /proc và /sys/fs/cgroup
# mà exec nhìn thấy — số bên trong không phải số kernel đang áp.
set -uo pipefail
NHAN="${1:-khong-nhan}"
NS=dlp-sandbox
POD=ide-lesson-measure

UID_POD=$(kubectl get pod -n "$NS" "$POD" -o jsonpath='{.metadata.uid}' | tr - _)
CG=$(sudo find /sys/fs/cgroup/kubepods.slice -type d -name "*${UID_POD}*" 2>/dev/null | head -1)
if [ -z "$CG" ]; then echo "{\"nhan\":\"$NHAN\",\"loi\":\"khong-tim-thay-cgroup\"}"; exit 1; fi

cur=$(cat "$CG/memory.current")
peak=$(cat "$CG/memory.peak" 2>/dev/null || echo 0)
inact=$(awk '/^inactive_file /{print $2}' "$CG/memory.stat")
cpu=$(awk '/^usage_usec/{print $2}' "$CG/cpu.stat")
# nr_throttled chỉ đếm khi chạm cpu.max RIÊNG của pod; node đói CPU thì nó im
# lặng (throttle-zero-hides-node-level-starvation), nên ghi cả load average.
thr=$(awk '/^nr_throttled/{print $2}' "$CG/cpu.stat" 2>/dev/null || echo 0)
load=$(awk '{print $1}' /proc/loadavg)

printf '{"ts":"%s","nhan":"%s","workingSetMi":%d,"peakMi":%d,"memCurrentMi":%d,"cpuSec":%.1f,"nrThrottled":%s,"load1":%s}\n' \
  "$(date -Iseconds)" "$NHAN" \
  $(( (cur - inact) / 1048576 )) $(( peak / 1048576 )) $(( cur / 1048576 )) \
  "$(echo "$cpu" | awk '{printf "%.1f", $1/1000000}')" "${thr:-0}" "$load"
