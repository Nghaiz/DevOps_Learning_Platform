#!/bin/bash
set -uo pipefail

target=/root/lab/config.json

if [ ! -f "$target" ]; then
  echo "Chua thay $target."
  exit 1
fi

# `jq -e` tra exit code theo GIA TRI cua bieu thuc cuoi — false/null thanh exit 1.
# Dung no thay vi so chuoi de khong phu thuoc thu tu key hay khoang trang.
if ! jq -e '.name == "dlp" and .replicas == 3' "$target" > /dev/null 2>&1; then
  echo "JSON chua dung. Can .name == \"dlp\" va .replicas == 3 (so, khong phai chuoi)."
  echo "Dang co:"
  cat "$target"
  exit 1
fi

echo "Dat — config.json dung dinh dang."
