# Chẩn đoán VM `debian-sandbox` sau sự cố host — 2026-09-03

**Kết luận: server dùng được, phát triển tiếp bình thường.** Smoke gate 7/7 PASS, và một
bài lab Docker thật chạy trọn trong pod sandbox.

## Nguyên nhân gốc — link-flap card mạng ảo, KHÔNG phải hỏng đĩa

Tràng log `task kubelet/kworker/runc blocked for more than 120 seconds` trên màn hình console
trông như hỏng ổ, nhưng bằng chứng nói khác:

| Giả thuyết | Bằng chứng bác bỏ |
|---|---|
| Đầy đĩa | `df`: 21G/112G, còn 86G |
| Hỏng filesystem | Không một dòng `EXT4-fs error` / `I/O error` / `remount-ro` |
| OOM | `free`: 7.4G available, swap không dùng |

Thủ phạm nằm ở `dmesg`:

```
[20:38:10] e1000: ens33 NIC Link is Up 1000 Mbps Full Duplex
[22:28:10] e1000: ens33 NIC Link is Up 1000 Mbps Full Duplex
[22:28:12] kube-scheduler: dial tcp 192.168.94.130:6443: connect: network is unreachable
[22:28:12] kube-scheduler: Leaderelection lost
```

`NIC Link is Up` chỉ in khi link vừa DOWN. Hai lần đứt/nối; lần 22:28 làm scheduler và
controller-manager mất lease leader-election rồi tự thoát. Số restart 114/110 tích lũy theo
đúng cơ chế này. RX/TX errors = 0 ⇒ link sạch khi lên, tức đứt cả sợi từ phía host Windows
(VMnet8/NAT), không phải lỗi trong guest.

## Hai bẫy đo đã suýt dẫn tới kết luận sai

**1. `dmesg` im lặng không chứng minh đã hết treo.** Kernel in `Future hung task reports are
suppressed` rồi ngừng vĩnh viễn; `hung_task_warnings` khi kiểm đã về `0`. Đã nạp lại canary
(`sysctl -w kernel.hung_task_warnings=20`); sau ~25 phút canary vẫn nguyên **20/20** — đó mới là
bằng chứng không có cơn treo mới.

**2. Ba nguồn giờ mâu thuẫn.** `/proc/uptime` không đếm khoảng VM bị suspend (báo 4:41 trong khi
`who -b` nói boot 05:01); `dmesg -T` quy đổi từ uptime nên lệch theo; log container in UTC còn
shell in +07. Tôi đã đọc `15:28` thành "lúc chiều", thật ra là **22:28 — chỉ 9 phút trước lúc
kiểm**. Chốt đúng bằng `who -b` và `state.running.startedAt` (luôn UTC).

## Trạng thái hiện tại

| Chỉ số | t0 | t1 (+25 phút) |
|---|---|---|
| `restartCount` scheduler / kcm | 114 / 110 | **114 / 110** (đứng yên ⇒ hết crash-loop) |
| `hung_task_warnings` | nạp lại 20 | **20** (không cơn treo mới) |
| loadavg 1/5/15 | 14.45 / 10.80 / 25.43 | **2.12 / 5.77 / 16.37** |
| warm pool | — | **3/3 Running** |

Node `Ready`, không pod nào ngoài `Running`/`Completed`, Postgres `accepting connections`,
Redis trả `NOAUTH` (tức sống, chỉ đòi auth), CronJob `dlp-cni-canary` hoàn thành đúng lịch.

## Smoke — `bash infra/host/13-smoke.sh` → **pass=7 fail=0**

Deployment Ready (web/gateway/orchestrator) · image đúng tag `sha-2b79fd3` · warm pool 3/3 ·
`/api/health` 200 qua Traefik · vòng đời phiên create → claim → reap chạy trọn.

Đo thêm từ Windows (ngoài hệ, tránh SNAT): `https://…:30443/` `/api/health` `/login` đều 200,
độ trễ 0.05–0.47s sau cold-start 2.7s.

## Bề mặt người học — lab Docker thật

Script tự cảnh báo nó không phủ đăng nhập / `lessons.checkStep` / terminal WS, nên đã exec thẳng
vào pod `sandbox-3afada5c6642`:

```
docker version → client=29.7.2 server=29.7.2
docker run --rm hello-world → "Hello from Docker!" · exit=0
```

Image kéo qua registry mirror của cụm (sandbox không có internet).

## Việc còn lại

Không có việc khôi phục nào cần làm trong guest — cụm đã tự đứng dậy. Rủi ro còn lại nằm ở
**phía host**: nếu VMnet8 rớt lần nữa, control-plane sẽ lại mất lease và restart. Đó là triệu
chứng của sự cố máy Windows, không phải lỗi cụm.
