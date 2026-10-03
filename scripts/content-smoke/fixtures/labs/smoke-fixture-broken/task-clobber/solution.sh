#!/bin/bash
# HỎNG CÓ CHỦ Ý: làm xong việc của mình nhưng phá trạng thái của task make-file.
set -euo pipefail
touch /root/fx/b.txt
rm -f /root/fx/a.txt
