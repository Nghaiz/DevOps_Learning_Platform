# Chạy lại phép đo 6.A

Kết quả và quyết định: [`docs/ide-choice.md`](../../../../docs/ide-choice.md).
Thư mục này giữ đúng bộ đã cho ra những con số đó.

## 0. Cần gì

- Máy dev có `docker` + `ssh` tới VM lab (`VM_SSH`, mặc định `nghaiz@192.168.94.130`).
- VM có internet (để clone theia-ide) — hoặc build Theia trên máy dev như dưới đây.
- ~5GB đĩa trống cho build cache của Theia.

## 1. Dựng image Theia (bước dài nhất, ~8 phút)

`Dockerfile.theia` xếp Theia lên `sandbox-base`, nhưng nó cần một stage đã build
sẵn — vì build context của Theia là **repo theia-ide**, không phải thư mục này.

```bash
git clone --depth 1 -b v1.74.100 git@github.com:eclipse-theia/theia-ide.git
cd theia-ide
docker build -f browser.Dockerfile -t dlp-measure-theia:1.74.100 .
```

⚠ Ghim `-b v1.74.100`. Không có artifact nào để ghim digest (xem `ide-choice.md` §5),
nên tag nguồn là toàn bộ thứ ghim được — đừng để nó thành `master`.

## 2. Dựng hai image ứng viên

```bash
cd <repo-root>/plans/devops-learning-platform/reports/harness/2026-09-03-6a-ide-measure
docker build -f Dockerfile.codeserver -t ghcr.io/nghaiz/dlp-ide-measure-codeserver:sha-2b79fd3 .
docker build -f Dockerfile.theia      -t ghcr.io/nghaiz/dlp-ide-measure-theia:sha-2b79fd3 .
```

Tag PHẢI trùng `image.tag` trong `values-selfhost.yaml`: script side-load đọc tag
từ file đó chứ không nhận từ dòng lệnh.

**Smoke ngay trên máy dev trước khi truyền ~960 MiB qua scp** — một image không
khởi động được thì phát hiện ở đây rẻ hơn nhiều:

```bash
docker run --rm --entrypoint sh ghcr.io/nghaiz/dlp-ide-measure-theia:sha-2b79fd3 -c \
  'mkdir -p /root/workspace; /opt/theia/node/bin/node /opt/theia/applications/browser/lib/backend/main.js /root/workspace --hostname=127.0.0.1 --port=4002 >/tmp/t.log 2>&1 &
   sleep 8; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4002/'
```

## 3. Side-load

```bash
cd <repo-root>
bash infra/host/11-sideload-images.sh dlp-ide-measure-codeserver dlp-ide-measure-theia
```

## 4. Đo

```bash
cd plans/devops-learning-platform/reports/harness/2026-09-03-6a-ide-measure
node measure.mjs up
node measure.mjs sample t0-idle-khong-IDE      # chờ ~2 phút cho dockerd ổn định trước
node measure.mjs seed-workspace
node measure.mjs start-ide                     # ghi time-to-serve.json
node measure.mjs sample t4-IDE-chay-chua-co-client
node measure.mjs listen                        # bằng chứng chỉ nghe loopback
```

Rồi **mở bằng trình duyệt thật** — đây là bước không bỏ được (xem §5):

```bash
# trên VM
kubectl port-forward -n dlp-ide-measure --address 0.0.0.0 ide-measure-codeserver 4001:4001 &
kubectl port-forward -n dlp-ide-measure --address 0.0.0.0 ide-measure-theia      4002:4002 &
# trên máy dev, mở:
#   http://<VM>:4001/?folder=/root/workspace
#   http://<VM>:4002/
```

Chờ workbench hiện ra, rồi `node measure.mjs sample <nhãn>`. Mỗi lượt ghi thêm
một dòng vào `samples.jsonl`.

Dọn: `node measure.mjs down`.

## 5. Vì sao PHẢI có trình duyệt thật

Một probe `curl` chỉ chứng minh IDE **đang nghe**. Số đo lúc ấy là 128Mi
(code-server) / 253Mi (Theia). Với một trình duyệt mở workspace, cùng hai pod
đọc ra 572Mi / 451Mi — **và đảo người thắng**.

Một lượt đo chỉ dùng `curl` sẽ xanh trọn vẹn, có bảng số đầy đủ, và **chốt nhầm
ứng viên**.

## 6. Bẫy đã dẫm, đừng dẫm lại

- **Shell trong pod là `dash`, không phải bash.** `$((16#0FA1))`, `strtonum()` của
  gawk, và một số `for … do` nhồi qua `sh -c "<một dòng>"` đều chết với
  `Syntax error`. Đó là lý do `seed-workspace.sh` và `listen.sh` là **file**, chạy
  qua `sh -s < file`, chứ không phải chuỗi một dòng.
- **`ss`/`netstat` KHÔNG có trong sandbox-base.** Dùng `/proc/net/tcp` (đã có sẵn
  trong `listen.sh`). Cột `local_address` là hex little-endian: `0100007F` =
  127.0.0.1, `00000000` = 0.0.0.0.
- **Đừng đọc `memory.current` làm số RAM.** Nó gộp page cache. `measure.mjs` trừ
  `inactive_file` để ra workingSet — đúng công thức kubelet, và là số duy nhất so
  được với `requests`.
- **Ghi lại `uptime`/load của node ở mỗi mốc.** Bài học 5.B: một lượt đo trên node
  vừa reboot không chứng minh được gì về hành vi dưới tải.
