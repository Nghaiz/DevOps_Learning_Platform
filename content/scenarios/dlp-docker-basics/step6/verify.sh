#!/bin/bash
# Phép kiểm NGƯỢC — cộng một ĐỐI CHỨNG DƯƠNG trong cùng một lượt.
#
# Vế 1 (PyPI phải BỊ CHẶN) một mình là một phép đo mù: nếu mạng của pod chết
# hẳn, hoặc dockerd không chạy, vế đó cũng "đạt" — và nó sẽ đạt vì lý do hoàn
# toàn khác với lý do ta muốn khẳng định. Vế 2 (mirror PHẢI thông) là thứ phân
# biệt "bị lọc có chọn lọc" với "mạng chết". Thiếu nó, ô này không chứng minh
# được gì về NetworkPolicy.
#
# Không dùng `set -e`: ca thành công của bài NÀY là một lệnh thất bại.
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

# ── Vế 1: PyPI phải bị chặn ─────────────────────────────────────────────────
# `--max-time`/timeout là phần bắt buộc: default-deny làm gói tin bị DROP im
# lặng (không REJECT), nên không có trần thời gian thì lượt chấm treo tới hết
# 30s cua gateway và tra 502 thay vi "chua dat".
if timeout 20 docker run --rm python:3.12-slim \
    python -c "import socket; socket.create_connection(('pypi.org', 443), 3)" > /dev/null 2>&1; then
  echo "CANH BAO: container GOI DUOC pypi.org:443 — lop loc mang khong con hieu luc."
  echo "Sandbox le ra chi duoc mo dung mot chieu toi mirror Docker Hub."
  exit 1
fi

# ── Vế 2 (đối chứng dương): mirror phải thông ───────────────────────────────
mirror="${DLP_REGISTRY_MIRROR:-}"
if [ -z "$mirror" ] && [ -f /etc/docker/daemon.json ]; then
  mirror=$(sed -n 's/.*"registry-mirrors"[^]]*"\([^"]*\)".*/\1/p' /etc/docker/daemon.json | head -1)
fi

if [ -z "$mirror" ]; then
  echo "Khong xac dinh duoc dia chi mirror (DLP_REGISTRY_MIRROR rong va /etc/docker/daemon.json khong khai)."
  echo "Khong the khang dinh 'bi loc' thay vi 'mang chet' — bao cho quan tri vien."
  exit 1
fi

code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "${mirror%/}/v2/" 2>/dev/null)
if [ "$code" != "200" ]; then
  echo "Doi chung duong THAT BAI: mirror $mirror khong tra loi (nhan duoc: '${code:-khong co}')."
  echo "Khi ca hai chieu deu tac, phep kiem nay khong chung minh duoc dieu gi — coi nhu chua dat."
  exit 1
fi

echo "Dat — pypi.org:443 bi chan, trong khi mirror Docker Hub van thong."
echo "Do la bang chung mang bi LOC co chon loc, khong phai mang chet."
