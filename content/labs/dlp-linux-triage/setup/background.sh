#!/bin/bash
# Chạy ẨN, dựng MỘT LẦN môi trường cho cả 5 task — lab cố ý không có setup gắn
# với từng task riêng (xem labSchema.setup trong shared-types): thứ tự làm
# task là tuỳ người học, một setup gắn với task thứ n sẽ chạy hoặc không chạy
# tuỳ đường đi, và bài chấm sẽ khác nhau giữa hai người làm cùng một lab.
set -euo pipefail

mkdir -p /root/lab-linux

# ── Task "find-kill-runaway" ────────────────────────────────────────────────
# `exec -a runaway-worker` đổi argv[0] mà `ps`/`pgrep -f` nhìn thấy, để tiến
# trình nhận diện được QUA TÊN chứ không qua PID — PID đổi mỗi lần sandbox khởi
# động lại, một bài dạy "tìm theo PID cụ thể" sẽ không tái lập được.
if ! pgrep -f 'runaway-worker' > /dev/null 2>&1; then
  nohup bash -c 'exec -a runaway-worker bash -c "while :; do :; done"' \
    > /root/lab-linux/runaway.log 2>&1 &
  disown
fi

# ── Task "fix-healthcheck-script" ───────────────────────────────────────────
# Script HỢP LỆ về nội dung nhưng THIẾU bit thực thi — bẫy quen thuộc khi chép
# file qua một kênh không giữ permission (zip, một số client SFTP, git khi
# core.fileMode=false).
cat > /root/lab-linux/healthcheck.sh <<'EOS'
#!/bin/bash
echo "OK"
exit 0
EOS
chmod 644 /root/lab-linux/healthcheck.sh

# ── Task "harden-secret-permissions" ────────────────────────────────────────
# File "bí mật" bị để quyền quá rộng (644 — nhóm và người khác đọc được), mô
# phỏng một token/khoá bị đặt sai chỗ khi ai đó tạo file bằng `>` thay vì
# `install -m 600`.
cat > /root/lab-linux/service.secret <<'EOS'
super-secret-token-do-not-share
EOS
chmod 644 /root/lab-linux/service.secret

# ── Task "create-deploy-user" / "run-published-container" ──────────────────
# Không cần dựng gì thêm: `useradd`/`docker` đã sẵn có trong sandbox-base
# (xem images/sandbox-base/Dockerfile), và nhóm hệ thống `docker` được gói
# docker-ce tự tạo lúc cài — không phải thứ setup này phải dựng.

echo ready > /root/lab-linux/.setup-done
