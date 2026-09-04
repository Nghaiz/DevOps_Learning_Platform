#!/bin/bash
# Hai vế phải cùng đúng: user TỒN TẠI, và nó thuộc nhóm 'docker'. Kiểm riêng
# từng vế vì chúng hỏng độc lập — `useradd deploy` không kèm `usermod` để lại
# đúng nửa việc, và một phép kiểm gộp sẽ không nói được nửa nào còn thiếu.
set -uo pipefail

if ! id deploy > /dev/null 2>&1; then
  echo "Chua co user 'deploy'. Hay chay: useradd -m deploy"
  exit 1
fi

if ! id -nG deploy 2>/dev/null | tr ' ' '\n' | grep -qx 'docker'; then
  echo "User 'deploy' ton tai nhung chua thuoc nhom 'docker'."
  echo "Hay chay: usermod -aG docker deploy"
  exit 1
fi

echo "Dat — user 'deploy' ton tai va thuoc nhom 'docker'."
