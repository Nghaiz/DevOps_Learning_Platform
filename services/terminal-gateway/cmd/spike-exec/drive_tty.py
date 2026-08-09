#!/usr/bin/env python3
"""Lái client tty của spike-exec qua một PTY THẬT để chứng minh S3.

Vì sao cần: -client đặt terminal vào raw mode và bắt SIGWINCH. Cả hai chỉ có
nghĩa trên pty thật. Script này cấp pty, đổi kích thước cửa sổ giữa phiên
(ioctl TIOCSWINSZ → kernel gửi SIGWINCH cho client), rồi chấm kết quả bằng
chính `stty size` chạy TRONG POD.
"""
import fcntl
import os
import pty
import re
import select
import struct
import sys
import termios
import time

URL = sys.argv[1] if len(sys.argv) > 1 else "ws://127.0.0.1:8090/spike/spike-target"
BIN = "/tmp/spike-exec"

pid, fd = pty.fork()
if pid == 0:
    os.execv(BIN, [BIN, "-connect", URL])

buf = bytearray()


def setsize(cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def pump(seconds):
    end = time.time() + seconds
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if fd in r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                return
            if not data:
                return
            buf.extend(data)


def send(s):
    os.write(fd, s.encode())


# Kích thước ban đầu PHẢI đặt trước khi client gửi frame init.
setsize(100, 30)
pump(2.0)

send("stty size\r")
pump(1.5)

# Đổi kích thước cửa sổ → kernel gửi SIGWINCH → client gửi control resize.
setsize(160, 45)
pump(0.5)
send("stty size\r")
pump(1.5)

send("exit\r")
pump(3.0)

out = buf.decode("utf-8", "replace")
sizes = re.findall(r"^(\d+) (\d+)\s*$", out, re.M)
print("=== kích thước PTY trong pod đọc được (rows cols) ===")
for s in sizes:
    print("  ", s)

ok_init = ("30 100" in out)
ok_winch = ("45 160" in out)
ok_close = ("WS đóng" in out) or ("control" in out)
print(f"[{'PASS' if ok_init else 'FAIL'}] init từ kích thước pty thật → 30 100")
print(f"[{'PASS' if ok_winch else 'FAIL'}] SIGWINCH → resize → 45 160")
print(f"[{'PASS' if ok_close else 'FAIL'}] client thoát sạch, in trạng thái đóng")
print("--- 400 byte cuối ---")
print(repr(out[-400:]))
os.waitpid(pid, 0)
sys.exit(0 if (ok_init and ok_winch and ok_close) else 1)
