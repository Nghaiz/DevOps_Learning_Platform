#!/bin/bash
# Dựng cảnh một lần cho cả hai task.
set -euo pipefail
mkdir -p /root/fixture
printf 'mode=draft\nowner=dlp\n' > /root/fixture/config.ini
chmod 644 /root/fixture/config.ini
