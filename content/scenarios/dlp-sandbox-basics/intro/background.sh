#!/bin/bash
# Chạy ẩn, người học không thấy. Việc duy nhất: dựng thư mục làm việc và khẳng
# định asset đã tới nơi.
set -euo pipefail

mkdir -p /root/lab

# Asset được đẩy vào TRƯỚC script này (xem lessons.runSetup). Kiểm tường minh
# thay vì để step sau chết với triệu chứng không liên quan: nếu tầng asset-push
# hỏng, ta muốn biết NGAY ở đây chứ không phải ba bước nữa.
if [ ! -f /root/lab-seed.json ]; then
  echo "Khong tim thay /root/lab-seed.json — tang asset-push chua chay" >&2
  exit 1
fi

cp /root/lab-seed.json /root/lab/seed.json
echo ready > /root/lab/.setup-done
