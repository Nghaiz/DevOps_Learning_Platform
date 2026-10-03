#!/bin/bash
set -uo pipefail
check "/root/fx/a.txt tồn tại" test -f /root/fx/a.txt
