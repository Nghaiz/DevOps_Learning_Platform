#!/bin/bash
# Chạy ẩn, người học không thấy. Việc duy nhất: dựng thư mục làm việc và khẳng
# định asset đã tới nơi.
set -euo pipefail

mkdir -p /root/lab-docker

# Asset được đẩy vào TRƯỚC script này (xem lessons.runSetup). Kiểm tường minh
# thay vì để bước 4 chết với triệu chứng không liên quan ("COPY failed") — nếu
# tầng asset-push hỏng, ta muốn biết NGAY ở đây.
if [ ! -f /root/app.py ]; then
  echo "Khong tim thay /root/app.py — tang asset-push chua chay" >&2
  exit 1
fi

cp /root/app.py /root/lab-docker/app.py
echo ready > /root/lab-docker/.setup-done
