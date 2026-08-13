#!/bin/bash
# Phep kiem NGUOC: dat khi ket noi BI CHAN.
#
# Khong dung `set -e` o day — ca thanh cong cua bai NAY la mot lenh that bai, va
# `set -e` se giet script truoc khi no kip ket luan.
set -uo pipefail

# `--max-time 3` la phan bat buoc: NetworkPolicy default-deny lam goi tin bi
# DROP im lang (khong phai REJECT), nen khong co timeout thi curl treo den khi
# gateway cat o 30s va ca luot cham tra 502 thay vi "dat".
if curl -s --max-time 3 http://169.254.169.254/ > /dev/null 2>&1; then
  echo "CANH BAO: pod GOI DUOC 169.254.169.254 — lop co lap mang khong con hieu luc."
  exit 1
fi

echo "Dat — ket noi toi 169.254.169.254 bi chan dung nhu mong doi."
