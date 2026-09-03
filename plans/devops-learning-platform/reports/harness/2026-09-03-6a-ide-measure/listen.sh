echo "ss: $(command -v ss || echo MISSING)  netstat: $(command -v netstat || echo MISSING)"
echo "--- /proc/net/tcp state 0A (LISTEN) — cot local_address dang HEX little-endian"
echo "    0100007F = 127.0.0.1   00000000 = 0.0.0.0   port hex: 0FA1=4001 0FA2=4002"
awk 'NR>1 && $4=="0A" {print "   local=" $2}' /proc/net/tcp
echo "--- /proc/net/tcp6 state 0A"
awk 'NR>1 && $4=="0A" {print "   local=" $2}' /proc/net/tcp6 2>/dev/null
