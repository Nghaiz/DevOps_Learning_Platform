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

> ✅ **Đổi `SANDBOX_IMAGE` CÓ tự thay pod đang ấm** — reaper tầng 4 lo việc này
> (`internal/reaper/reaper.go`, `sweepDeadFreePods`). Mỗi vòng sweep nó đối chiếu
> `pod.spec.containers[sandbox].image` của từng pod trong `pool:free` với
> `SANDBOX_IMAGE` hiện hành; lệch thì `LREM` khỏi `pool:free` rồi xoá, kèm
> `dlp_reaper_stale_image_pods_total` và một dòng WARN in CẢ HAI image.
>
> ⚠ **Đoạn "rút tay" từng nằm ở đây đã bị xoá** vì nó là văn bản cũ hơn code:
> nó viết ở `d09db86` (2026-08-12 12:52) và cơ chế vào ở `ea73912` (2026-08-12
> 22:05) — cách nhau chín tiếng trong cùng một ngày, nên bản README không được
> cập nhật theo. Ai đọc nó năm 2026-09 sẽ kết luận A8 chưa có chủ, đi dựng lại
> một cơ chế thứ hai, và có HAI thành phần cùng mutate `pool:free`. Đã xảy ra:
> đó là lý do có mục này.
>
> Bằng chứng cơ chế chạy thật, log orchestrator trên cụm lab:
>
> ```
> 2026-09-07T07:37:35.038Z WARN pod ấm chạy image CŨ — đã rút …
>   image_dang_chay=…:p10a  image_muon=…:p13ide  pod=sandbox-6a02e800a9e9
> ```
>
> ### Hai giới hạn CÒN LẠI, đọc trước khi deploy
>
> **1. Cửa sổ `REAP_INTERVAL`.** Phép so image chạy theo nhịp sweep (lab: `60s`),
> KHÔNG chạy ở đường claim. Một pod lệch vào `pool:free` ngay sau một vòng sweep
> sẽ được phát cho tới vòng kế. Đo được cùng ngày: dòng thứ TƯ ở
> `07:38:34.856Z` — một pod `p10a` nữa, đúng **59 giây** sau ba dòng đầu.
>
> **2. Nguồn của pod lệch đó là chính lượt rollout.** `platform-orchestrator`
> chạy `replicas: 1` với `strategy.rollingUpdate.maxSurge: 25%` ⇒ trong lúc
> `helm upgrade`, replica CŨ (mang `SANDBOX_IMAGE` cũ) và replica MỚI cùng sống
> và cùng bơm vào một `pool:free`. Replica cũ dựng pod image cũ SAU vòng sweep
> khởi động của replica mới — đó chính là pod ở dòng thứ tư.
>
> ⇒ Muốn đóng hẳn: đặt `maxSurge: 0` (hoặc `strategy: Recreate`) cho
> orchestrator, để không bao giờ có hai manager mang hai `SANDBOX_IMAGE` khác
> nhau cùng ghi vào một pool. Đây là thay đổi Helm, không phải thay đổi code.
>
> ### Nhịp xoá (từ 2026-09-08)
>
> Rút khỏi `pool:free` là **vô điều kiện** — mọi pod lệch ra khỏi vòng phục vụ
> trong CÙNG một vòng sweep. Xoá khỏi cluster thì **có trần**
> (`maxStaleEvictPerSweep`); phần vượt trần được đẩy sang `pool:quarantine` và
> tầng 3 dọn ở vòng sau. Lý do là số đo ở trên: ba dòng WARN nằm trong 30 mili-
> giây tức ba lượt teardown đồng thời trên một node Sysbox — đúng hình dạng đã
> dẫn tới `FailedKillPod` → sysbox-fs wedge ở P12 §5b.
>
> ⚠ Trần này KHÔNG hứa "pool không bao giờ rỗng". Nếu cả pool đều lệch image thì
> pool rỗng là kết quả ĐÚNG (mọi pod trong đó đều không dùng được) và người claim
> tiếp theo đi cold path. Nó chỉ chặn cơn bão teardown.
>
> ⛔ Pod đang **CLAIMED** không bao giờ bị đụng tới: tầng 4 chỉ đọc `pool:free`.
> Một lượt deploy không được cướp phiên của người đang học. Cổng:
> `TestTang4KhongDungPodLechImageDangClaimed`.

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

## Bộ công cụ theo bài + màn chào (2026-09-07, khung KillerCoda §C4)

### Cài hết, gác bằng PATH

Tám công cụ của hợp đồng §C4 (`btop tldr ripgrep fd duf ncdu delta yq`) đều
**nằm sẵn trong image** tại `/opt/dlp/tools/<tool>/`, một thư mục **không** có
trên `PATH`. Bật bằng symlink:

```bash
dlp-tools enable btop yq     # symlink vào /usr/local/dlp-bin (đã ở trên PATH)
dlp-tools list               # danh mục + trạng thái
dlp-tools list --enabled     # chỉ tên các tool đang bật (dlp-motd đọc cái này)
dlp-tools disable btop
```

Hai ràng buộc đẩy tới kiến trúc này, không phải khẩu vị:

- **Không tải lúc chạy được.** Sandbox dưới NetworkPolicy deny-all, egress chỉ
  DNS + mirror docker.io (đo 2026-09-04: `curl https://github.com` treo rồi
  timeout). Nên mọi thứ phải nằm sẵn trong image.
- **Không truyền được qua env lúc tạo pod.** Pod đến từ **warm pool** — sinh ra
  TRƯỚC khi biết bài nào claim nó. Nên việc bật phải xảy ra lúc **setup phiên**,
  đi cùng đường `buildAssetPushScript` trong `lessons.runSetup`.

Danh mục là SSOT ở `etc/toolset.catalog`: Dockerfile sinh danh sách `apt-get
install` **và** vòng lặp dời binary từ chính file đó, `dlp-tools` cũng đọc nó.
Thêm một công cụ = thêm một dòng. Tool lạ ⇒ `dlp-tools` thoát **1** kèm danh mục
hợp lệ (im lặng bỏ qua sẽ hiện ra ở phía người học thành "bài bảo dùng btop mà
command not found", cách nguyên nhân đúng hai thành phần).

`PATH` được đặt ở **tầng image** (`ENV PATH` trong Dockerfile), **không** trong
`.zshrc`/`.bashrc`. Lý do quyết định: lượt chấm bài chạy qua
`gateway.env.execShell` = **bash không tương tác**, mà bash không tương tác
không đọc `.bashrc`. PATH đặt trong rc sẽ có ở terminal của sinh viên nhưng
vắng ở `verify.sh` ⇒ bài bật `yq` rồi dùng `yq` trong verify sẽ chấm sai, với
triệu chứng không trỏ về PATH. Đã đo 2026-09-07 trên `ubuntu:24.04`: `ENV PATH`
sống qua cả `bash -l`, `bash -c`, `zsh -l`, `zsh -c` (24.04 không gán lại PATH
cho root trong `/etc/profile`), nên không cần `/etc/profile.d`.

⛔ Đánh đổi đã chấp nhận: dời binary khỏi `/usr/bin` làm **cơ sở dữ liệu dpkg
nói sai** về vị trí file. Vô hại với một image bất biến, nhưng một
`apt-get install --reinstall` trong pod sẽ dựng lại `/usr/bin/<binary>` và mở
toang cửa gác **trong im lặng**.

### Bốn cái bẫy gói được giao — và cái thứ năm tự lộ ra lúc build

| Bẫy | Thực tế | Xử lý |
|---|---|---|
| `fd` | gói là `fd-find`, binary là **`fdfind`** | dời thành `/opt/dlp/tools/fd/fd`, symlink tên `fd` |
| `delta` | gói là `git-delta`, binary là `delta` | chỉ khác tên gói, binary đúng |
| `yq` | gói `yq` của Ubuntu là **3.1.0 — wrapper Python quanh `jq`**, KHÔNG phải mikefarah/yq | tải binary Go, ghim `YQ_VERSION` + `YQ_SHA256`, và build khẳng định `yq --version` có chuỗi `mikefarah` |
| `tldr` | client cần **tải cache** lần đầu, mà sandbox không có internet | seed cache lúc build + smoke test ngay tại build |

`yq` là cái tệ nhất trong bốn: ba cái kia sai **tên**, cái này sai **cả chương
trình** — nó nhận cú pháp khác hẳn và sẽ hỏng ở đúng lệnh đầu tiên mà một bài
học copy từ tài liệu Kubernetes upstream. Alias trong shell không cứu được cái
nào trong bốn: `verify.sh`, `make`, `ansible` không đi qua alias.

**Bẫy thứ năm, không nằm trong bốn cái được giao — `/usr/bin/fdfind` là một
symlink TƯƠNG ĐỐI** (`../lib/cargo/bin/fd`, lối đóng gói Rust của Debian). `mv`
một symlink tương đối sang thư mục khác giữ nguyên đích tương đối ⇒ **link
chết**, và `mv` vẫn thoát **0**. Build 2026-09-07 đỏ đúng ở
`test -x /opt/dlp/tools/fd/fd`. Nếu khối RUN không có phần khẳng định ở cuối,
image đã **xanh** với một `fd` hỏng, và triệu chứng chỉ hiện ra khi một bài học
bật `fd` — nghĩa là ở phòng máy, trước mặt sinh viên. Cách dời đúng là
`readlink -f` để lấy đích thật, `mv` đích đó, rồi `rm -f` cái symlink còn lại.

### tldr — vì sao phải seed, và vì sao checksum ở đây yếu hơn chỗ khác

Client là **tealdeer** (gói `tealdeer`, binary `tldr`). Không dùng gói `tldr`
của Ubuntu: nó chỉ là metapackage phụ thuộc `tldr-hs` (Haskell).

`tldr --update` **không bao giờ** chạy được, vì hai lý do độc lập:

1. Sandbox deny-all egress.
2. Kể cả có mạng: tealdeer 1.6.1 tải từ `https://tldr.sh/assets/tldr.zip`, mà
   URL đó nay trả **HTML** (đo 2026-09-07: 301 → 200 `text/html`), nên nó chết
   với `invalid Zip archive: Could not find central directory end`. Bản trong
   repo Ubuntu **vĩnh viễn** không tự cập nhật được.

Nên cache được trải tay lúc build vào `/opt/dlp/tldr-cache/tldr-pages/pages/`
(chỉ `common/` + `linux/`; bỏ android/osx/windows/bsd…). Bố cục đó là chi tiết
nội bộ của tealdeer, nên Dockerfile **smoke test** `tldr tar` ngay tại build —
một lần nâng version đổi bố cục sẽ làm build **ĐỎ** thay vì cho image xanh mà
`tldr tar` báo "Page not found in cache" ở phòng máy.

⚠ **Checksum của tldr-pages yếu hơn mọi chỗ khác trong file này, có chủ ý.**
Asset nằm dưới tag cố định `v2.3` nhưng được **tải lại mỗi ngày**, nên một hằng
số `sha256` sẽ làm build đỏ trong vòng 24 giờ. Thay vào đó ta tải kèm
`tldr.sha256sums` của cùng release rồi đối chiếu — đó là **toàn vẹn đường
truyền**, KHÔNG phải tái lập được: nó chặn tải hỏng/đứt, không chặn nội dung
đổi. Chấp nhận ở đúng chỗ này vì payload là markdown được render, không phải mã
chạy. **Đừng nới cùng lý lẽ đó cho một binary** — E3/E6/E7 vẫn ghim hằng.

⚠ tealdeer 1.6.1 cảnh báo ra stderr khi cache quá **30 ngày** tuổi, kèm lời
khuyên `tldr --update` bất khả thi. Ngưỡng đó là **hằng số biên dịch**:
`[updates] auto_update_interval_hours` KHÔNG tắt được (đã đo: đặt 876000 giờ,
cảnh báo vẫn in). Thứ tắt nó là `touch` mtime của đúng một thư mục —
`$CACHE_DIR/tldr-pages` — và `dlp-tools enable tldr` làm việc đó một lần mỗi
phiên. Touch thư mục cache **cha** thì không ăn thua; đã đo cả hai.

### Màn chào `dlp-motd`

In **đúng một lần cho mỗi phiên tmux**, không phải mỗi shell và không phải mỗi
pane. Cờ đánh dấu là một thư mục trong `/tmp` khoá theo `$TMUX`
(`<socket>,<server_pid>,<session_idx>` → lấy hai trường sau).

- ⛔ **Không dùng `$TMUX_PANE`**: nó đổi theo từng pane, tức khoá theo nó là
  quay lại đúng cái nó định chặn. Mở "Terminal 2" của §C6 (`Ctrl-B c`) là một
  window mới ⇒ shell mới ⇒ rc chạy lại.
- Dùng `mkdir` (một syscall nguyên tử) chứ không `[ -e ]` rồi `touch`: chế độ
  tách đôi của §C5 mở hai khoang trong một nhịp, và cặp test-rồi-tạo có cửa sổ
  đua ở giữa.
- Attach lại sau mất mạng không in lại — và điều đó **không** nhờ cờ:
  `tmux new-session -A` trên nhánh attach không sinh shell mới nên rc không
  chạy. tmux server chết rồi lên lại thì `server_pid` đổi ⇒ in lại, đúng, vì đó
  thật sự là phiên mới.
- **Ngoài tmux thì im lặng tuyệt đối.** `execShell` (bash) là đường chấm bài:
  một màn chào lọt vào stdout của lượt đó làm hỏng phép so `passed`, và triệu
  chứng ("bài đúng báo sai") là hạng lỗi tốn giờ nhất.

Dòng **"Phiên"** (thời hạn còn lại) đọc `/run/dlp/session-deadline`, sau đó mới
tới env `DLP_SESSION_DEADLINE`. Thứ tự đó không tuỳ tiện: pod đến từ warm pool
nên env của PID 1 không thể mang mốc hết hạn riêng cho phiên — cùng lý lẽ với
`dlp-tools`. ✅ **Nay đã có người ghi**: `bin/dlp-session-deadline`. Gateway gọi nó qua
`pods/exec` ở **HAI** chỗ — lúc dựng phiên, và sau **mỗi** lượt
`ExtendSession` thành công. Thiếu chỗ thứ hai thì người học bấm "Thêm giờ"
xong vẫn thấy mốc cũ.

Script tự giữ một **luật không-lùi**: nó từ chối ghi một mốc sớm hơn mốc đang
có. Vòng đời phiên chỉ đẩy hạn về sau (extend cộng thêm, `HARD_CAP` chặn trần;
kết thúc sớm thì pod bị xoá luôn), nên bất biến đó mua được một tính chất đáng
giá: **giá trị hiển thị không bao giờ MUỘN hơn sự thật**. Nếu một lượt ghi sau
extend bị lỡ, banner báo THIẾU giờ — sai, nhưng sai về phía người học không mất
bài giữa chừng.

⚠ **Chưa chứng minh được**: hai lượt gọi ở phía gateway thuộc lane khác
(`services/terminal-gateway/**`) và CHƯA được nối. Cái đã chạy thật là vòng
ghi→đọc của hai script (7 ca, gồm luật không-lùi và RFC3339). Dòng "Phiên"
chưa hiện trên cụm cho tới khi lane đó nối xong.

Khi file vẫn vắng (pod dựng bởi bản gateway cũ, hoặc một lượt exec setup hỏng),
nhánh degrade ở lại nguyên: module `command` của fastfetch bỏ hẳn dòng khi output
rỗng. Thà không có dòng "Phiên" còn hơn một đồng hồ đoán bừa.

`etc/fastfetch.jsonc` **cố ý bỏ** `PublicIp`/`LocalIp`: module đó gọi ra
internet, và dưới deny-all nó sẽ **treo tới timeout** ngay đầu mỗi phiên. Cũng
bỏ `Host`/`BIOS` vì trong container chúng là thông số của **node**, không phải
của phiên — in ra là dạy sai về ranh giới cách ly.

### Logo PTIT: ANSI art, KHÔNG phải ảnh

`etc/ptit.ansi` là block character (`█ ▀ ▄`) + escape màu 24-bit, 16 dòng × 34
cột, dùng qua `fastfetch --logo-type file-raw`.

**Vì sao không PNG/sixel:** đường ảnh thật còn phải đo. tmux 3.4 có chuỗi
`sixel` trong binary, nhưng `infocmp tmux-256color` **không** khai capability
sixel, và `TERM` ngoài tmux là `xterm-256color` cũng không. Thêm nữa xterm.js ở
FE cần addon riêng cho sixel. Đó là việc của một chặng khác — **không phải là
quên**. ANSI art chạy ở mọi terminal, không qua cổng nào.

- `file-raw` chứ không `file`: nội dung đã mang escape 24-bit của chính nó, và
  `file` sẽ diễn giải lại chuỗi màu (thay các placeholder màu của fastfetch) —
  tức bảng màu của `dlp.omp.json` bị một tầng thứ hai ghi đè.
- `logo.width`/`logo.height` phải khai **tay** cho `*-raw`: fastfetch không
  phân tích nội dung raw nên không đoán được kích thước, và thiếu hai số này
  thì mọi dòng thông tin bên phải in đè lên logo. Sửa logo ⇒ sửa cả hai số.
- Màu lấy từ `etc/dlp.omp.json` (`#38bdf8` / `#64748b` / `#e5e7eb`) để đồng bộ
  với prompt. **Không** dùng đỏ thương hiệu thật của PTIT: nó lệch khỏi bảng màu
  terminal đang có. Đổi là ba dòng trong file.
- File chứa **byte ESC thật** (0x1B). Đừng "dọn dẹp" nó bằng editor tự động —
  một lần lưu sai encoding là logo thành ô vuông, cùng hạng bẫy với ghi chú
  `_comment` trong `dlp.omp.json`.

### Verify (bổ sung cho khối Verify ở trên)

```bash
# Cửa gác PHẢI đóng khi chưa enable — vế âm bắt buộc, nếu không "bật được"
# chỉ chứng minh binary tồn tại chứ không chứng minh nó từng bị giấu.
docker run --rm dlp-sandbox-base:<tag> bash -lc 'command -v btop rg fd yq; echo "rc=$?"'
# → không in gì, rc=1

docker run --rm dlp-sandbox-base:<tag> bash -lc \
  'dlp-tools enable ripgrep yq >/dev/null && rg --version | head -1 && yq --version'
# → ripgrep 14.1.0 ... / yq (https://github.com/mikefarah/yq/) version v4.53.6

# Tool lạ phải NỔ, không im lặng
docker run --rm dlp-sandbox-base:<tag> dlp-tools enable khong-ton-tai; echo "rc=$?"
# → thông báo + danh mục hợp lệ, rc=1

# tldr offline (không mạng) — vế quan trọng nhất của cả khối này
docker run --rm --network none dlp-sandbox-base:<tag> bash -lc \
  'dlp-tools enable tldr >/dev/null && tldr tar | head -3'

# Màn chào: ngoài tmux phải IM LẶNG (đường chấm bài)
docker run --rm dlp-sandbox-base:<tag> bash -lc 'dlp-motd; echo "rc=$? (khong co dong nao o tren)"'

# Màn chào: trong tmux in ĐÚNG MỘT LẦN dù mở thêm window
docker run --rm -t dlp-sandbox-base:<tag> bash -lc \
  'tmux new-session -d -s t "sleep 5"; tmux new-window -t t "sleep 5"; sleep 1; \
   ls -d /tmp/.dlp-motd-* | wc -l'
# → 1
```

## ⚠ Nợ đã biết: terminal tích hợp của Theia KHÔNG tắt được

Mô hình giao diện chốt cuối là **1 tab Editor + 1 tab Terminal, dùng CHUNG một
phiên terminal của nền tảng**. Nhưng Theia mang theo terminal riêng của nó, và
nút bấm-để-chạy trong bài học **không** điều khiển được terminal đó.

**Không tắt được bằng cấu hình — đã đo trên Theia IDE 1.74.100, không suy luận:**

| Preference thử | Số lần khớp trong bundle |
|---|---|
| `terminal.integrated.enabled` | 0 |
| `terminal.enabled` | 0 |
| `terminal.visible` | 0 |
| `workbench.view.terminal` | 0 |
| `terminal.integrated.showOnStartup` | 0 |

Đọc hết danh sách option CLI của backend cũng không có gì về layout hay tắt
terminal. Bề mặt cấu hình được hỗ trợ (`--set-preference`, `--session-preference`,
`~/.theia-ide/settings.json`) không phủ việc này.

**Đường duy nhất còn lại đã bị từ chối có chủ ý:** seed sẵn file layout nội bộ của
Theia. Bố cục shell là state do chính ứng dụng quản, không có hợp đồng nào bảo
đảm hình dạng của nó — nhét sẵn một file như vậy sẽ vỡ IM LẶNG ở bản nâng Theia
kế tiếp, đúng lúc không ai còn nhớ vì sao file đó ở đó.

**Mức độ thật của nợ:** panel terminal mặc định đang THU (`lm-mod-hidden`), nên
sinh viên phải cố ý mở nó (menu `Terminal`, hoặc nút toggle) mới gặp. Widget
`terminal-0` có sẵn trong layout và tab "Terminal 0" hiện ra khi mở.

**Đường sửa đã cân và KHÔNG chọn (2026-09-07):** đặt
`terminal.integrated.defaultProfile.linux` trỏ vào `tmux new-session -A -s dlp`.
Khi đó terminal Theia LÀ chính phiên của nền tảng, hết chuyện "terminal thứ ba".
Bị loại vì cái giá rơi sai chỗ: hai client tmux trên một phiên thì tmux co cửa sổ
về kích thước client NHỎ NHẤT, nên một panel Theia hẹp sẽ bóp terminal chính của
MỌI phiên. Đổi một rủi ro hiếm (phải cố ý mở) lấy một rủi ro thường trực.

Muốn làm lại đường đó thì phải ĐO trước: dựng hai client trên cùng phiên và xem
kích thước có bị co thật không, thay vì tin vào suy luận ở trên.
