#!/bin/bash
# Đạt khi tệp mốc tồn tại TRONG container — và KHÔNG tồn tại trên sandbox.
#
# Vế thứ hai mới là bài học của bước này. Thiếu nó, một người tạo /tmp/dlp-marker
# thẳng trên sandbox (gõ nhầm, bỏ `docker exec`) vẫn "đạt", và đi tiếp với đúng
# hiểu lầm mà bước này tồn tại để gỡ.
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' web 2>/dev/null)" != "true" ]; then
  echo "Container 'web' khong con chay — hay lam lai buoc 2 truoc."
  exit 1
fi

inside=$(docker exec web cat /tmp/dlp-marker 2>/dev/null | tr -d '\r\n')
if [ -z "$inside" ]; then
  echo "Chua thay /tmp/dlp-marker BEN TRONG container 'web'."
  echo "Hay chay: docker exec -it web sh -c 'echo \"toi da o trong container\" > /tmp/dlp-marker && cat /tmp/dlp-marker'"
  exit 1
fi

if [ -e /tmp/dlp-marker ]; then
  echo "CANH BAO: /tmp/dlp-marker ton tai ca TREN SANDBOX."
  echo "Tep nay chi duoc nam trong container. Hay xoa ban tren sandbox: rm /tmp/dlp-marker"
  exit 1
fi

echo "Dat — tep moc nam trong container, va khong nam tren sandbox."
