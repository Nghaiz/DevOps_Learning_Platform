#!/bin/sh
# In mọi socket LISTEN (st==0A). 0100007F=127.0.0.1, 00000000=0.0.0.0
cat /proc/net/tcp /proc/net/tcp6 2>/dev/null | while read -r sl local rem st rest; do
  [ "$st" = "0A" ] || continue
  echo "$local"
done
