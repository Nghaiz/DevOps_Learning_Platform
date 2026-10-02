#!/bin/bash
set -euo pipefail
sed -i 's/^mode=.*/mode=published/' /root/fixture/config.ini
chmod 600 /root/fixture/config.ini
