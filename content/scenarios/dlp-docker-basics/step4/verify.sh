#!/bin/bash
# Đạt khi image TỒN TẠI và CHẠY ĐƯỢC, không chỉ khi nó tồn tại.
#
# `docker image inspect` một mình là chưa đủ: một Dockerfile thiếu `CMD`, hoặc
# COPY nhầm tên tệp, vẫn cho ra image hợp lệ — nó chỉ hỏng lúc chạy. Bài này dạy
# "dựng được thứ chạy được", nên phép chấm phải chạy nó.
#
# ⛔ `timeout` DƯỚI ĐÂY LÀ 90, KHÔNG PHẢI 20 — và câu chữ cũ ở đây chính là thứ
# đẻ ra con số sai. Nó viết: "docker run ở đây rẻ … thoát sau chưa tới một giây.
# Trần một lượt chấm là 30s (GATEWAY_EXEC_TIMEOUT) nên vẫn dư." Hai lỗi trong
# một câu:
#
#   1. "chưa tới một giây" là ước lượng, không phải phép đo. Đo thật trên cụm
#      lab lúc RẢNH: `docker run --rm myapp:1` mất **4636ms**.
#   2. Nó chọn hằng số bằng cách so với trần của TẦNG KHÁC (gateway), chứ không
#      so với thời gian thao tác này thật sự tốn dưới tải.
#
# Đo 18 người cùng build (2026-09-03): `docker build` giãn từ 3.7s lên 36.8s
# (~10×). Cùng hệ số ấy áp lên 4.6s ⇒ ~46s, vượt xa `timeout 20`. Kết quả:
# **17/18 nhận `passed=false`** cho một bài đã làm ĐÚNG — chính harness ngay sau
# đó chạy `docker run` với trần rộng hơn và nhận đúng chuỗi mong đợi.
#
# Đây là cùng một lớp lỗi với `GATEWAY_EXEC_TIMEOUT=30s`, chỉ nằm thấp hơn một
# tầng: một hằng số đặt trên thao tác chạy TRONG workload của người học, chọn
# theo cụm rảnh. Sửa trần gateway xong thì trần này thành chỗ nghẽn kế tiếp.
#
# 90s: dưới trần gateway (120s) để gateway không bao giờ là thứ cắt trước — cắt
# ở đây cho ra một câu tiếng Việt người học đọc được, cắt ở gateway cho ra một
# lỗi hệ thống. Con số để chỉnh lần sau là thời gian `docker run` đo dưới tải,
# không phải cảm giác.
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

if ! docker image inspect myapp:1 > /dev/null 2>&1; then
  echo "Chua thay image myapp:1."
  echo "Hay chay: cd /root/lab-docker && docker build -t myapp:1 ."
  exit 1
fi

out=$(timeout 90 docker run --rm myapp:1 2>&1)
rc=$?
if [ $rc -ne 0 ]; then
  echo "Image myapp:1 co ton tai nhung chay THAT BAI (exit=$rc):"
  echo "$out" | head -5
  exit 1
fi

if ! printf '%s' "$out" | grep -q 'DLP docker lab'; then
  echo "myapp:1 chay duoc nhung khong in ra dong mong doi tu app.py. Nhan duoc:"
  echo "$out" | head -5
  echo "Kiem tra lai dong COPY app.py . va CMD trong Dockerfile."
  exit 1
fi

echo "Dat — myapp:1 da duoc dung va chay ra dung ket qua."
