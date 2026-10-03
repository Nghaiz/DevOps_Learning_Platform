#!/bin/bash
# Dựng cảnh cho "Ngày đầu với terminal". Chạy ẩn, đồng bộ, trước khi người học
# thấy terminal. Chạy lại nhiều lần vẫn ra cùng trạng thái, và KHÔNG xoá dấu vết
# người học đã tạo (marker Ctrl+C, tệp da-doc.txt): mở lại bài không được làm
# trượt một bước đã đạt.
set -euo pipefail

# Bước 2: một thư mục tên dài đến mức gõ tay từng chữ là khổ, để Tab có việc làm.
report_dir=/root/kho/bao-cao-van-hanh-thang-09-ban-chot
mkdir -p "$report_dir" /root/kho/anh-chup-man-hinh
cat > "$report_dir/doc-truoc.txt" <<'EOF'
Ghi chú bàn giao, ca đêm 30/09:
- Máy này dựng lại mỗi phiên, đừng để thứ quan trọng ở đây.
- Đọc xong thì tạo tệp da-doc.txt ngay trong thư mục này để ca sau biết.
EOF

# Bước 3: một lệnh chạy mãi. Bẫy SIGINT để ghi lại bằng chứng người học đã
# bấm Ctrl+C. Marker nằm ngoài /root để không lẫn vào việc của người học.
mkdir -p /var/lib/dlp-lesson
cat > /usr/local/bin/dong-ho <<'EOF'
#!/bin/bash
# In giờ mỗi giây cho tới khi nhận SIGINT (Ctrl+C).
marker=/var/lib/dlp-lesson/ctrl-c
trap 'printf "\nNhận Ctrl+C (tín hiệu SIGINT). Đồng hồ dừng.\n"; date "+%F %T" > "$marker"; exit 130' INT
echo "Đồng hồ đang chạy. Bấm Ctrl+C để dừng."
while :; do
  date '+%H:%M:%S'
  sleep 1
done
EOF
chmod 755 /usr/local/bin/dong-ho
