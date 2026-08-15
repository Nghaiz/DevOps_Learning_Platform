#!/bin/bash
# Hai giá trị THẬT: trượt khi chưa kéo image, đạt khi image đã nằm trên máy.
#
# Chỉ `inspect` — KHÔNG `pull` trong lượt chấm. Một lượt chấm có trần 30s
# (GATEWAY_EXEC_TIMEOUT); vượt trần trả 502 chứ không trả "chưa đạt", nghĩa là
# người học sẽ thấy lỗi hệ thống thay vì thấy bài chấm mình.
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

if ! docker image inspect python:3.12-slim > /dev/null 2>&1; then
  echo "Chua thay image python:3.12-slim. Hay chay: docker pull python:3.12-slim"
  exit 1
fi

echo "Dat — python:3.12-slim da nam tren may."
