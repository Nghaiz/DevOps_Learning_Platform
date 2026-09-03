#!/bin/bash
# Chạy file TRỰC TIẾP (`"$f"`), KHÔNG `bash "$f"` — đó là toàn bộ điểm của bài
# này. `bash healthcheck.sh` thành công NGAY CẢ KHI file thiếu bit thực thi
# (bash tự đọc nội dung, không cần hệ điều hành cấp quyền "chạy"), nên một
# grader gọi qua `bash` sẽ "đạt" mà không kiểm tra được đúng thứ bài dạy.
set -uo pipefail

f=/root/lab-linux/healthcheck.sh

if [ ! -f "$f" ]; then
  echo "Khong tim thay $f."
  exit 1
fi

if [ ! -x "$f" ]; then
  echo "$f chua co quyen thuc thi. Hay chay: chmod +x $f"
  exit 1
fi

out=$("$f" 2>&1)
code=$?
if [ "$code" -ne 0 ] || [ "$out" != "OK" ]; then
  echo "Chay $f nhung ket qua khong dung mong doi (exit=$code, output='$out')."
  exit 1
fi

echo "Dat — $f da thuc thi duoc va tra ve dung ket qua."
