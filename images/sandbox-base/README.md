# `images/sandbox-base`

Image chạy trong pod lab của sinh viên. **1.E-1** (E1–E5 + E10) và **1.E-2**
(E6–E9) đều đã dựng xong — lane 1.E đóng.

**Nền image là Ubuntu, không phải Debian.** Host chạy Debian 13 (design §5b)
nhưng phần lớn tài liệu DevOps/KillerCoda giả định `apt` trên Ubuntu — host
Debian chạy container Ubuntu là chuyện bình thường.

## Vì sao 24.04 (Noble Numbat)

Đo bằng `apt-cache policy` trên chính ba base image, 2026-08-10:

| base | image | `eza` | `fastfetch` | `zoxide` | `bat` | `tmux` | hết hỗ trợ |
|---|---|---|---|---|---|---|---|
| 22.04 | 119 MB | **THIẾU** | **THIẾU** | 0.4.3 (2021) | 0.19 | 3.2a | 2027-04 |
| **24.04** | **119 MB** | **0.18.2** | THIẾU | **0.9.3** | **0.24** | **3.4** | **2029-04** |
| 26.04 | 160 MB | 0.23.4 | 2.57.1 | 0.9.8 | 0.25 | 3.6a | 2031-04 |

24.04 nhẹ hơn 26.04 **41 MB** mà vẫn có `eza` trong repo. 22.04 cùng cỡ 119 MB
nhưng mất cả `eza` lẫn `fastfetch` và `zoxide` tụt về bản 2021 — nó trả thêm hai
món nợ để đổi lấy đúng 0 MB. `tmux 3.4` còn là **chính version mà D17 đo hành vi
hai-client**, nên kết luận đó còn nguyên giá trị.

> ⚠ **Kích thước image là ĐĨA, không phải RAM** — và hai con số này không thay
> thế cho nhau. `INCLUDE_DOCKER=0`: pod lúc rảnh **~7.5 MB RSS** (PID 1), RAM
> thật do zsh + tmux + oh-my-posh quyết định. Mặc định `INCLUDE_DOCKER=1`:
> **~153 MiB**, vì entrypoint bật dockerd ngay lúc container start chứ không
> phải lúc sinh viên claim. Vẫn dưới `requests` 512Mi nên trần 4 session của
> D16 không đổi — nhưng ai tính sức chứa node phải dùng 153 MiB.
> Dù vậy đừng chọn **base** vì lý do RAM: base không phải thứ quyết định nó.

## Có gì trong image

| Nhóm | Nội dung |
|---|---|
| Shell | `zsh` (mặc định qua tmux `default-shell`), `bash` ngang hàng |
| Multiplexer | `tmux` 3.4 — **cơ chế reconnect** (D3), không phải công cụ cho sinh viên |
| Prompt | `oh-my-posh` v30.6.4 (ghim + sha256) với theme của repo `/etc/dlp/dlp.omp.json` |
| CLI hiện đại | `eza` `bat` `fzf` `zoxide` `fastfetch` `jq` `git` `less` `unzip` `xxd` |
| Editor | `vi` (qua `vim-tiny`) — `EDITOR=vi`, thiếu nó thì `git commit` không mở được |
| **Docker (E7)** | `docker-ce` + `docker-ce-cli` + `containerd.io` + `docker-buildx-plugin` (29.7.2). DinD qua Sysbox: **không** privileged, **không** mount `docker.sock` của host |
| **PowerShell (E6)** | Sau `--build-arg INCLUDE_PWSH=1` — mặc định **0** |
| Init | `tini` làm PID 1 → `dlp-entrypoint.sh` → `sleep infinity` |
| Locale/màu | `en_US.UTF-8`, `TERM=xterm-256color`, `COLORTERM=truecolor` |

Số đo (2026-08-12, `linux/amd64`, `INCLUDE_DOCKER=1`): **809 MB** image /
**194 MB** tarball — Docker cộng thêm **+430 MB**.

> Mốc so sánh là **379 MB** = tag `sha-1530c13`, bản đang chạy trên lab. Con số
> **369 MB** ghi ở `phase-1.md` là bản 1.E-1 **gốc**, trước khi `sudo` được thêm
> ngày 2026-08-11 (`dev-sudo` 373 MB → 379 MB). Cả hai đều đúng cho build của
> mình; đừng trừ chéo hai con số đó với nhau.
Side-load host→VM đo được **3.3s** cho 194 MB (~58 MB/s trên mạng host-only;
con số "~52 KiB/s" trong các report trước là tốc độ VM ra **Internet**, không
phải host→VM — đừng lẫn hai thứ khi ước lượng).

Trivy: **0 CRITICAL** ⇒ **không cần `.trivyignore`**. HIGH: 14 ở `oh-my-posh`
(CVE **stdlib Go**, như 1.E-1) + 3 ở `docker-buildx`. Tầng gói Ubuntu **0** ở cả
CRITICAL lẫn HIGH, và ba binary `docker`/`dockerd`/`docker-proxy` cũng **0**.

**`fastfetch` KHÔNG có trong repo 24.04** ⇒ cài từ `.deb` chính chủ, ghim
version + digest. Đã kiểm chạy thật trên Noble (glibc 2.39): `fastfetch 2.67.0
(x86_64)`, tự nhận `OS: Ubuntu 24.04.4 LTS`. Cố ý **không** rơi về `neofetch`
(archive từ 2024 — dạy sinh viên một công cụ đã chết là món nợ trả bằng thời
gian của người khác).

## Tám ràng buộc dễ phá khi sửa hai file này

**0. `dlp-entrypoint.sh` PHẢI kết bằng `exec "$@"`, và PHẢI giữ dòng
`[ "$#" -gt 0 ] || set -- sleep infinity` ngay trên nó.**
Chuỗi đích là tini(PID 1) → `sleep infinity`. Bỏ `exec` là chèn một tiến trình
bash làm cha của CMD, mà bash đó KHÔNG forward tín hiệu ⇒ SIGTERM của
`kubectl delete pod` dừng ở nó và pod nằm `Terminating` hết grace 30s, giữ 1
trong 4 khe quota (D16). Đúng hồi quy mà ràng buộc #1 mô tả cho `sleep` trần,
quay lại qua một cửa khác.
Còn dòng `set --` là vì `set -u` **không** bắt `"$@"` rỗng (bash miễn trừ hai
special param `$@`/`$*`), nên `exec "$@"` với 0 tham số **không exec gì cả** và
script trả 0 ⇒ tini thoát ⇒ pod `Succeeded`. Đo được: `docker run --entrypoint
/usr/local/bin/dlp-entrypoint.sh IMG` → `rc=0`. Ca đó xảy ra thật nếu ai đó đặt
`containers[].command` trong `podspec.go` — một refactor rất tự nhiên. Default
của dòng này phải TRÙNG với `CMD` của Dockerfile.
Cùng lý do đó, nhánh dockerd chạy **nền** và **không được phép** làm hỏng chuỗi:
dockerd chết (ví dụ chạy ngoài Sysbox, như trên runner CI) chỉ ghi log rồi đi
tiếp. Nếu nó fatal thì mọi pod warm-pool chết theo một tiến trình phụ.

**1. `CMD` phải giữ PID 1 SỐNG, và PID 1 nên là `tini`.**
`internal/k8s/podspec.go` không đặt `Command`/`Args` và đặt `RestartPolicy: Never`.
Đổi `CMD` thành shell (như bản placeholder `CMD ["/bin/bash"]`) là mọi pod
warm-pool thoát ngay về `Succeeded`, `pool:free` vẫn đếm chúng là ấm, và sinh
viên claim trúng một xác. `pause` che được lỗi này vì binary của nó ngủ vĩnh
viễn — nên nó chỉ lộ ra đúng lúc đổi sang image thật.
`tini` (chứ không phải `sleep` trần) vì `sleep` là PID 1 tồi ở hai điểm, và cả
hai đều là **hồi quy so với `pause`**: không `wait()` nên con mồ côi thành zombie
vĩnh viễn (E7 dockerd sẽ đẻ rất nhiều), và không có handler nên **kernel bỏ qua
SIGTERM** ⇒ `kubectl delete pod` phải chờ hết grace 30s, giữ 1 trong 4 khe quota.
Đo được: với `tini`, `docker stop` trả về trong **0s**.

**2. `set -g status off` trong `.tmux.conf` là ràng buộc đo được, không phải
thẩm mỹ** (D17/E4). Status bar ăn đúng 1 dòng: client 200×50 cho window 200×**49**,
nên `stty size` trong pod lệch 1 so với `rows` mà FE gửi và AC resize phải mang
một số magic "trừ 1". Đã đo lại trên tmux 3.4: **200×50 khớp tuyệt đối**.

**3. Theme viết glyph bằng `\uXXXX`, đừng dán ký tự thật.** Toàn bộ là Private
Use Area (Nerd Font); một lần lưu sai encoding là thành `U+FFFD`, và triệu chứng
chỉ là ô vuông trong terminal của sinh viên chứ không có lỗi nào. Font do
`packages/terminal` cấp (F3/E5) — image **cố ý không cài** Nerd Font, vì glyph
render ở trình duyệt chứ không ở container (tiết kiệm ~50–100 MB vô ích).

**3b. Allowlist dotfiles: đừng thêm `-L` vào `find`.**
`load_dotfiles` gọi `find … -type f` KHÔNG có `-L`. Đó là một dòng chặn CẢ HAI
vector thoát ra ngoài `$HOME`: file symlink (`~/.gitconfig → /etc/passwd`) hiện
ra là `-type l` nên bị loại, và thư mục symlink thì `find` không đi xuống. Thêm
`-L` "cho tiện" là mở lại cả hai cùng lúc, trong khi mọi test tên-file vẫn xanh.
Lượt quét `-type l` riêng bên cạnh **không** phải thừa: `-type f` loại symlink
ÂM THẦM, nên thiếu nó thì `.gitconfig` của người dùng biến mất không dấu vết —
an toàn nhưng không chẩn đoán được. (Đo 2026-08-12: trước khi thêm, log ghi
"từ chối 2" trong khi thực tế bỏ 3 file.)

**3c. `..data` là chỗ DUY NHẤT được phép đi theo symlink — đừng gỡ.**
Kubelet **không** ghi ConfigMap/Secret/projected thẳng vào thư mục mount; nó
dựng layout atomic-writer: file thật nằm dưới `..2026_08_12_…/`, còn mọi tên
người dùng thấy (`.zshrc`) là symlink trỏ qua `..data`. Không xử lý thì `find
-type f` cho `rel` = `..2026_…/.zshrc` (lọt guard `..` vì segment đó không PHẢI
`..`, rồi chết ở allowlist) và mọi tên người dùng thấy bị lượt `-type l` gạt ⇒
**chép 0 file**, với log trỏ vào "allowlist" chứ không trỏ vào kiểu volume. Đi
theo `..data` an toàn vì nó do **kubelet** dựng, không phải người dùng.

**3d. Containment cần CẢ khối quét symlink trong `$HOME`.**
`rm -f "$dest"` chỉ bảo vệ thành phần **cuối**; `mkdir -p` và `cp` vẫn đi xuyên
qua symlink ở mọi thành phần **cha**. Một `$HOME/.config` là symlink sẽ đẩy mọi
file `.config/**` ra ngoài `$HOME` **trong khi toàn bộ test tên-file vẫn xanh**.
Hôm nay `$HOME` chỉ có 3 file thường chép từ `/etc/skel`, nhưng đó là bất biến
của một file KHÁC (Dockerfile) — khối `find "$home" -maxdepth 3 -type l` biến nó
thành thứ đo được ngay trong entrypoint.

**4. `--platform=linux/amd64` ghim có chủ ý.** Không ghim thì build trên arm64
(Apple Silicon) cho image **xanh nhưng hỏng âm thầm**: base thành arm64, hai
binary tải về vẫn amd64, `sha256sum -c` VẪN KHỚP (nó kiểm đúng file nó tải,
không kiểm arch), rồi trong pod mỗi lần mở shell là `exec format error`.

## Verify

```bash
docker build -t ghcr.io/nghaiz/dlp-sandbox-base:dev images/sandbox-base

# 10 binary của AC (+ vi)
docker run --rm ghcr.io/nghaiz/dlp-sandbox-base:dev bash -c \
  'for b in zsh tmux git jq fzf zoxide fastfetch eza bat oh-my-posh vi; do
     command -v $b >/dev/null && echo "$b OK" || echo "$b MISSING"; done'

docker run --rm ghcr.io/nghaiz/dlp-sandbox-base:dev zsh -lic 'echo $COLORTERM'   # → truecolor

# ⚠ HAI điều kiện, cả hai đều bắt buộc:
#  (a) `--icons=always`. `--icons` mặc định là `auto`, và auto TẮT icon khi
#      stdout không phải tty — mà `| grep` luôn là pipe. Lệnh AC bản cũ
#      (`--icons … | xxd`) vì thế KHÔNG BAO GIỜ thấy glyph, kể cả khi image đúng.
#  (b) kiểm CODEPOINT, đừng kiểm hex-dump. `xxd | grep -E "ee|ef"` khớp cả cột
#      offset (`00000ee0:`) lẫn ranh giới byte ghép (`aee1`), nên nó xanh cả khi
#      không có glyph nào — đổi một cái mù lấy một cái tự-sáng.
docker run --rm ghcr.io/nghaiz/dlp-sandbox-base:dev bash -lc \
  'eza --icons=always -la /etc | head -3 | grep -cP "[\x{E000}-\x{F8FF}]"'   # → 3
# đối chứng BẮT BUỘC (phải ra 0, nếu không thì phép kiểm vô nghĩa):
docker run --rm ghcr.io/nghaiz/dlp-sandbox-base:dev bash -lc \
  'eza --icons=never -la /etc | head -3 | grep -cP "[\x{E000}-\x{F8FF}]" || echo 0'

# Trivy cục bộ TRƯỚC khi merge (job `images` của CI chỉ chạy trên main)
docker save ghcr.io/nghaiz/dlp-sandbox-base:dev -o /tmp/sb.tar
docker run --rm -v trivy-cache:/root/.cache -v /tmp:/work aquasec/trivy:latest \
  image --input /work/sb.tar --scanners vuln --severity CRITICAL --exit-code 1
```

> ⛔ **`--exit-code 1` = 0 KHÔNG có nghĩa là "0 CRITICAL".** Trivy FATAL khi
> không tải được DB lỗ hổng, và nếu bạn nuốt stderr (`>/dev/null 2>&1`) thì lượt
> chạy đó trả **0** trong khi nó chưa quét được gì. Dính đúng ca này 2026-08-12.
> Luôn đọc bảng "Report Summary" trước khi tin mã trả về; thêm `--timeout 15m`
> nếu mạng chậm.

```bash
# E8 — allowlist dotfiles. Fixture phải dựng TRONG Linux: Git Bash trên Windows
# biến `ln -s` thành bản sao, nên ca symlink sẽ xanh giả nếu tạo từ host.
docker volume create dlp-fx && \
docker run --rm -v dlp-fx:/mnt/dotfiles --entrypoint /bin/bash IMG -c '
  mkdir -p /mnt/dotfiles/.config/nvim
  echo OK > /mnt/dotfiles/.zshrc
  echo OK > /mnt/dotfiles/.config/nvim/init.lua
  echo NO > /mnt/dotfiles/evil.sh
  ln -s /etc/passwd /mnt/dotfiles/.gitconfig'
docker run --rm -v dlp-fx:/mnt/dotfiles:ro IMG bash -c \
  'head -1 ~/.zshrc; [ -e ~/evil.sh ] && echo LOT || echo "evil: chan"; \
   [ -e ~/.gitconfig ] && echo LOT || echo "symlink: chan"'
# → OK / evil: chan / symlink: chan, kèm 3 dòng WARN nêu TÊN từng file bị bỏ.

# E9 — hai lượt `new-session -A` phải cho CÙNG session_id (không chỉ ls == 1).
docker run --rm --entrypoint /bin/bash IMG -c '
  tmux new-session -d -s dlp; a=$(tmux display-message -p -t dlp "#{session_id}")
  tmux new-session -d -A -s dlp 2>/dev/null || true
  b=$(tmux display-message -p -t dlp "#{session_id}"); echo "$a $b"'   # → $0 $0
```

**AC "DinD offline" (D4) KHÔNG kiểm được bằng `docker run` thường** — nó cần
Sysbox. Chạy trên cụm:

```bash
kubectl -n dlp-sandbox exec POD -- docker info \
  --format 'Client={{.ClientInfo.Version}} Server={{.ServerVersion}}'
kubectl -n dlp-sandbox exec POD -- bash -c '
  mkdir -p /tmp/b && cp /usr/local/bin/oh-my-posh /tmp/b/app   # binary TĨNH
  printf "FROM scratch\nCOPY app /app\nENTRYPOINT [\"/app\"]\n" > /tmp/b/Dockerfile
  docker build -q -t s:probe /tmp/b && docker run --rm s:probe --version'
# Vế bắt buộc đi kèm, nếu không thì "offline" chỉ là lời khẳng định:
kubectl -n dlp-sandbox exec POD -- timeout 6 curl -sS https://registry-1.docker.io/v2/
# → phải HỎNG (NetworkPolicy default-deny)
```

## Đưa image lên cluster lab

Không có registry ở self-host (ghcr private, node không có imagePullSecrets), và
`podspec.go` ghim `ImagePullPolicy: IfNotPresent` ⇒ image **phải có sẵn** trong
containerd của node:

```bash
docker save ghcr.io/nghaiz/dlp-sandbox-base:dev -o sandbox-base.tar
scp sandbox-base.tar nghaiz@192.168.94.130:/tmp/
ssh nghaiz@192.168.94.130 'sudo ctr -n k8s.io images import --all-platforms /tmp/sandbox-base.tar'
```

`orchestrator.env.sandboxImage` để **rỗng** thì chart tự ghép
`<image.registry>/dlp-sandbox-base:<image.tag>` — cùng khuôn với các image khác,
nên đổi `image.tag` một chỗ là pod lab đi theo. Đánh đổi: **mỗi lần bump
`image.tag` đều phải side-load thêm tarball sandbox lên node**, nếu không thì
warm-pool ImagePullBackOff.

> ⛔ **Đổi `SANDBOX_IMAGE` KHÔNG tự thay pod đang ấm.** Warm-pool giữ đủ
> `POOL_TARGET` pod và không có logic rollout theo image: pod ấm dựng từ image
> CŨ nằm lại trong `pool:free` vô thời hạn, `Running`/`Ready` nên nhìn không có
> gì sai, và người claim tiếp theo nhận đúng pod đó. Đây là **món nợ**, chưa có
> task nào sở hữu. Rút tay theo đúng thứ tự sau:
>
> ```bash
> # 1) Rút khỏi LIST TRƯỚC — sau bước này không claim nào grab được nó nữa.
> #    ⛔ LREM PHẢI trả về 1. Trả 0 nghĩa là claim.lua vừa LMOVE nó sang
> #    pool:claimed cho một sinh viên — ĐI TIẾP LÀ XOÁ POD CỦA PHIÊN ĐANG CHẠY.
> redis-cli LREM pool:free 0 "$POD"      # phải in: (integer) 1
> redis-cli HGET "pod:$POD" state        # kiểm lại: phải là "free"
> # 2) rồi mới xoá hash, 3) rồi mới xoá Pod
> redis-cli DEL "pod:$POD"
> kubectl -n dlp-sandbox delete pod "$POD" --grace-period=0 --force
> ```

## E6–E9 (chặng 1.E-2, 2026-08-12)

| Task | Trạng thái | Bằng chứng |
|---|---|---|
| **E6** `pwsh` qua `INCLUDE_PWSH` | Nhánh có, **đã build thử**, mặc định **0** | `.deb` universal 7.6.4, sha256 từ `hashes.sha256` của release. Build với `=1` chạy được thật: `pwsh` → **7.6.4**, `Terminal-Icons` → **0.11.0** |
| **E7** Docker/DinD qua `INCLUDE_DOCKER=1` | **Xong** | `docker info` cho Client=Server=29.7.2 trên pod Sysbox thật |
| **E8** `entrypoint.sh` | **Xong** | dockerd nền + allowlist dotfiles, 5/5 ca (chép đúng 2, từ chối 3 gồm 1 symlink) |
| **E9** tmux là đường vào | **Xong** | `new-session -A` hai lượt cho **cùng `session_id`** (`$0` → `$0`), `tmux ls` = 1 |

**AC "DinD offline" (D4) — đo trên pod Sysbox thật, dưới NetworkPolicy
`default-deny` đang sống**, không phải trong container `--privileged`:

- `curl https://registry-1.docker.io/v2/` **hỏng**, `curl http://169.254.169.254/`
  **hỏng** ⇒ pod thật sự không ra được mạng (vế này biến "không cần mạng" từ một
  lời khẳng định thành một phép đo).
- `docker build` một image `FROM scratch` (COPY binary **tĩnh** `oh-my-posh`) →
  **thành công**, `docker run` nó → in `30.6.4`.
- `docker image ls` sau đó chỉ có **đúng image vừa build** — không gì bị pull.

> ⚠ `FROM scratch` cần một binary **tĩnh** thì `docker run` mới có nghĩa. Trong
> image này chỉ `oh-my-posh` là tĩnh (`ldd` → "not a dynamic executable");
> `tini` và `docker-proxy` đều **động**, chọn nhầm là image build xong nhưng
> `docker run` chết ngay ở loader — và triệu chứng đó nhìn giống hệt "DinD hỏng".

> ⚠ **`docker build` KHÔNG pull `moby/buildkit`.** Builder mặc định là driver
> `docker`, dùng BuildKit **nhúng trong dockerd** (log: `Completed buildkit
> initialization`). Chỉ khi ai đó chạy `docker buildx create` mới sinh driver
> `docker-container`, và driver ĐÓ pull image — tức tự làm hỏng AC offline.

Số đo kèm theo, trên pod thật:

| Đo | Giá trị | Ý nghĩa |
|---|---|---|
| dockerd sẵn sàng | **3.6s** (`Starting up` → `API listen on /var/run/docker.sock`) | Đường warm-pool không thấy độ trễ này (pod ấm hàng phút trước khi ai claim); chỉ cold-path mới có thể gõ `docker` trong vài giây đầu |
| `pids.current` | **30** / trần 4096 | Cảnh báo "dockerd đẻ nhiều con, ăn vào trần pids của D-19′" **không** hiện thực hoá |
| `memory.current` | **153 MiB** / trần 1 GiB | Còn xa trần LimitRange |
| `requests` | **không đổi** (512Mi/500m) | ⇒ **trần 4 session đồng thời của D16 giữ nguyên** |

*(Hai số cgroup đọc trên **host**, không đọc trong pod — Sysbox ảo hoá
`/sys/fs/cgroup` nên số nhìn từ trong pod là số giả.)*

**Vì sao `INCLUDE_PWSH` vẫn mặc định 0 dù nó chạy được:** nó cộng **~330 MB**
(build `INCLUDE_PWSH=1 INCLUDE_DOCKER=0` = 706 MB, so với 379 MB nền). Bật cả
hai là image ~1.1 GB, tức mỗi lần bump `image.tag` phải side-load thêm chừng ấy
lên node. Bật khi có bài lab thật cần PowerShell, không bật "cho đủ".

**Còn nợ, có chủ ý:** `/mnt/dotfiles` **chưa có ai mount**. `podspec.go` đặt
`Volumes: nil` và CEL #8 cấm `hostPath`, và P1 cũng chưa có tính năng nào cấp
nội dung dotfiles. Nhánh E8 vì thế được kiểm ở **tầng image** (`docker run -v`),
chưa từng chạy qua đường người dùng thật. Đừng đọc AC dotfiles mạnh hơn thế.

Nhưng nó **đã được kiểm với cả hai kiểu volume sẽ gặp**: thư mục thật (emptyDir,
bind mount) và layout atomic-writer của kubelet (ConfigMap / Secret / projected)
— xem ràng buộc 3c. Vế thứ hai là thứ review đối kháng lôi ra: nếu producer
tương lai chọn ConfigMap, bản đầu tiên của nhánh này sẽ chép **0 file** với log
trỏ sai hướng, và không cổng nào bắt được.

## Ghi chú nhỏ nhưng dễ mất thời gian

- **`tmux new-session -A` ở lượt HAI đòi TTY.** Đo trên tmux 3.4, 2026-08-12:
  không có TTY thì nó trả mã **1** kèm `open terminal failed: not a terminal`.
  Không phải lỗi — với `-A` và session đã tồn tại, tmux chuyển sang ngữ nghĩa
  **attach**, mà `-d` chỉ gác đường TẠO chứ không gác đường attach. Session cũ
  vẫn nguyên vẹn (đó là thứ D3 cần). Đường thật an toàn vì
  `podexec/bridge.go` đặt `Tty: true`; nhưng bất kỳ health-probe hay script dọn
  dẹp nào gọi `tmux new-session -A` KHÔNG qua PTY sẽ nhận mã 1 và rất dễ bị đọc
  nhầm thành "tmux hỏng".
- **`tmux send-keys` cần zsh khởi tạo xong.** Đo trên pod thật: gửi phím sau 6s
  rơi vào khoảng trống (file output rỗng), sau 3s + chờ 12s thì chạy. Đây là
  hiện vật của phép đo, không phải của sản phẩm — oh-my-posh init mất một lúc.
  Một test dùng `send-keys` mà không chờ sẽ đỏ ngẫu nhiên.

- `alias cat='bat --plain --paging=never'` — `--plain` bỏ header tên file + số
  dòng để output khớp mọi tutorial. Vẫn còn một khác biệt không alias nào che
  được: `bat` **từ chối** in file nhị phân, `cat` thì đổ ra.
- `set -g mouse off` có chủ ý: bật mouse là tmux **chiếm** sự kiện chuột, nên
  trong xterm.js kéo chuột sẽ vào copy-mode của tmux thay vì bôi đen của trình
  duyệt ⇒ sinh viên không copy được output (phải giữ Shift). Xem lại khi 1.F đo
  thật.
- `fzf` trên 24.04 là **0.44**, chưa có `fzf --zsh` (từ 0.48) ⇒ hai file rc phải
  `source /usr/share/doc/fzf/examples/*`. Khi base lên bản có fzf ≥ 0.48 thì đổi.
- Cả hai file rc gác `[[ -t 0 ]]` quanh phần fzf: `zsh -lic` / `bash -ic` là
  interactive nhưng KHÔNG có tty, và zle/readline sẽ in cảnh báo vào đúng
  output mà acceptance đang đọc.
