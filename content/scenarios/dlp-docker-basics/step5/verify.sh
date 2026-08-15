#!/bin/bash
# Đạt khi hai tag TRỎ CÙNG một image — đó chính là điều bước này dạy.
#
# So ID chứ không so tên: `docker images | wc -l` cho 2 dòng kể cả khi người học
# build lại một image MỚI rồi đặt tên myapp:stable. Ca đó là hiểu ngược đúng cái
# hiểu lầm bước này tồn tại để sửa, nên nó phải TRƯỢT.
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

id1=$(docker image inspect -f '{{.Id}}' myapp:1 2>/dev/null)
if [ -z "$id1" ]; then
  echo "Chua thay image myapp:1 — hay lam lai buoc 4 truoc."
  exit 1
fi

id2=$(docker image inspect -f '{{.Id}}' myapp:stable 2>/dev/null)
if [ -z "$id2" ]; then
  echo "Chua thay tag myapp:stable. Hay chay: docker tag myapp:1 myapp:stable"
  exit 1
fi

if [ "$id1" != "$id2" ]; then
  echo "myapp:1 va myapp:stable dang tro vao HAI image khac nhau."
  echo "  myapp:1      -> $id1"
  echo "  myapp:stable -> $id2"
  echo "Tag khong tao ban sao. Hay chay: docker tag myapp:1 myapp:stable"
  exit 1
fi

echo "Dat — hai tag cung tro vao mot image (${id1:0:19}...)."
