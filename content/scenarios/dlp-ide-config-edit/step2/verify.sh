#!/bin/bash
# Trượt khi chưa có notes.md hoặc file rỗng/không có dòng tiêu đề; đạt khi có ít
# nhất một dòng bắt đầu bằng '#'.
set -uo pipefail

target=/root/lab/notes.md

if [ ! -f "$target" ]; then
  echo "Chua thay $target. Hay tao file do trong khoang editor."
  exit 1
fi

if ! grep -qE '^#' "$target"; then
  echo "$target da co nhung chua co dong nao bat dau bang '#'. Hay them mot dong tieu de."
  exit 1
fi

echo "Dat — $target ton tai va co dong tieu de."
