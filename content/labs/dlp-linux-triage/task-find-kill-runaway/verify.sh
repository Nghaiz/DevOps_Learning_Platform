#!/bin/bash
# Hai giá trị THẬT: trượt khi tiến trình còn chạy, đạt khi nó đã bị dừng.
#
# `pgrep -f` — không phải `pgrep` trần — vì tên nhận diện (`runaway-worker`)
# nằm trong dòng lệnh do `exec -a` gán cho argv[0], và `-f` khớp trên toàn bộ
# dòng lệnh chứ không chỉ tên binary thật (`bash`).
set -uo pipefail

if pgrep -f 'runaway-worker' > /dev/null 2>&1; then
  echo "Van con tien trinh 'runaway-worker' dang chay."
  echo "Hay chay: pkill -f runaway-worker"
  exit 1
fi

echo "Dat — khong con tien trinh 'runaway-worker' nao dang chay."
