#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# soak-vm-detached.sh — chạy soak.mjs TRÊN VM, tách rời khỏi phiên ssh.
#
# ⛔ ĐÂY LÀ BẢN THỨ HAI BÊN CẠNH `soak-run.sh`, VÀ ĐÓ LÀ CÓ CHỦ Ý. Dùng cái nào:
#
#   · `soak-run.sh`         — chạy TỪ MÁY NGOÀI VM qua port-forward. Đúng cho
#                             lượt NGẮN, và cho mọi phép đo mà việc "đo từ ngoài
#                             hệ" quan trọng (độ trễ, rate-limit, SNAT).
#   · `soak-vm-detached.sh` — chạy TRÊN VM, scrape thẳng pod-IP, `setsid nohup`.
#                             Đúng cho lượt DÀI (≥2h): port-forward chết theo ssh,
#                             và một lượt 4h không được phụ thuộc vào việc laptop
#                             có ngủ hay không.
#
# Đánh đổi phải khai: chạy trên VM nghĩa là client dùng chung node với thứ đang
# đo (thêm chút CPU) và đi qua SNAT của chính VM. Cả hai KHÔNG ảnh hưởng câu hỏi
# rò-rỉ (goroutine/fd/RSS), nhưng làm mọi số về ĐỘ TRỄ ở lượt này vô nghĩa.
#
# Marker `DONE` được ghi trong trap EXIT nên nó xuất hiện khi kết thúc BẤT KỲ
# kiểu nào — xong, lỗi, hay bị kill. Người/agent chờ nó vì thế không phải ngồi
# hết 4 tiếng chỉ để phát hiện tiến trình đã chết ở phút thứ ba.
#
# Ảnh chụp TRƯỚC và SAU gồm image tag + UID + restartCount của pod gateway và
# orchestrator: một pod restart giữa chừng reset gauge về 0, và một lần reset ấy
# kéo hồi quy xuống thành "phẳng" một cách ngoạn mục. Không có hai ảnh chụp đó
# thì không phân biệt được "không rò rỉ" với "đã restart giữa chừng".
#
# Dùng (từ máy dev, sau khi đã copy soak.mjs + wsterm.mjs + .users.json lên VM):
#   scp infra/k6/soak-vm-detached.sh nghaiz@<vm>:~/p12-soak/
#   ssh nghaiz@<vm> 'cd ~/p12-soak && setsid nohup ./soak-vm-detached.sh 10 4 \
#       > out/nohup.log 2>&1 < /dev/null &'
#
# ⚠ soak.mjs trên VM phải sửa import wsterm thành './wsterm.mjs' (bố cục phẳng).
# ─────────────────────────────────────────────────────────────────────────────
# Chay soak DAI, tach roi khoi phien ssh. Ghi marker DONE khi KET THUC BAT KY
# kieu nao (xong, loi, bi kill) — de nguoi cho khong phai doi het 4h vi mot lan
# crash o phut thu 3.
set -u
CD=/home/nghaiz/p12-soak
N="${1:-10}"; HOURS="${2:-4}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RUN="$CD/out/run-$STAMP"
mkdir -p "$RUN"

anh_chup() {
  kubectl get deploy -n default -o custom-columns=N:.metadata.name,I:.spec.template.spec.containers[0].image --no-headers | grep platform
  echo "--- gateway pods ---"
  kubectl get pods -n default -l app.kubernetes.io/component=gateway \
    -o custom-columns=N:.metadata.name,IP:.status.podIP,UID:.metadata.uid,R:.status.containerStatuses[0].restartCount,START:.status.startTime --no-headers
  echo "--- orchestrator pod ---"
  kubectl get pods -n default -l app.kubernetes.io/component=orchestrator \
    -o custom-columns=N:.metadata.name,UID:.metadata.uid,R:.status.containerStatuses[0].restartCount --no-headers
}

ket_thuc() {
  rc=$?
  { echo "exit=$rc"; echo "ket_thuc=$(date -u +%FT%TZ)"; echo "--- sau khi chay ---"; anh_chup; } > "$RUN/DONE" 2>&1
}
trap ket_thuc EXIT

{ echo "bat_dau=$(date -u +%FT%TZ)"; echo "n=$N hours=$HOURS"; echo "--- truoc khi chay ---"; anh_chup; } > "$RUN/meta-truoc.txt" 2>&1

GWIP=$(kubectl get pods -n default -l app.kubernetes.io/component=gateway -o jsonpath="{range .items[*]}http://{.status.podIP}:8083/metrics,{end}")
GWIP="${GWIP%,}"
ORCHIP=$(kubectl get svc -n default platform-orchestrator -o jsonpath="{.spec.clusterIP}")
echo "GW_METRICS=$GWIP" >> "$RUN/meta-truoc.txt"

cd "$CD"
ORCH_METRICS="http://$ORCHIP:8081/metrics" GW_METRICS="$GWIP" NODE_TLS_REJECT_UNAUTHORIZED=0 \
  node soak.mjs --n "$N" --hours "$HOURS" > "$RUN/soak.log" 2>&1
