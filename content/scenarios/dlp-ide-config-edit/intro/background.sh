#!/bin/bash
# Chạy ẩn trước khi người học thấy bước đầu tiên. Việc duy nhất: dựng thư mục
# làm việc và gieo một file cấu hình SAI sẵn, để step 1 có thứ để sửa.
set -euo pipefail

mkdir -p /root/lab

# `port=0` là lỗi CỐ Ý — step 1 yêu cầu đổi thành 8080. Ghi bằng heredoc trích
# dẫn để shell không nội suy gì.
cat > /root/lab/app.conf <<'CONF'
name=dlp-demo
port=0
log_level=info
CONF

echo ready > /root/lab/.setup-done
