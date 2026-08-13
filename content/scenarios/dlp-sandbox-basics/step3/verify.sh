#!/bin/bash
set -uo pipefail

if ! command -v docker > /dev/null 2>&1; then
  echo "Khong tim thay docker trong image sandbox."
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

if ! docker image inspect dlp-lab:1 > /dev/null 2>&1; then
  echo "Chua thay image dlp-lab:1. Hay chay: cd /root/lab/img && docker build -t dlp-lab:1 ."
  exit 1
fi

echo "Dat — image dlp-lab:1 da duoc dung tai cho, khong can mang."
