# `images/sandbox-base`

Image chạy trong pod lab của sinh viên. Chặng **1.E-1** (E1–E5 + E10) đã dựng
xong; E6–E9 còn nợ (xem §"Chưa làm").

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

> ⚠ **Kích thước image là ĐĨA, không phải RAM.** Pod lab lúc rảnh chỉ tốn
> **~7.5 MB RSS** (PID 1); RAM thật do zsh + tmux + oh-my-posh quyết định và như
> nhau trên cả ba base. Đừng chọn base vì lý do RAM.

## Có gì trong image

| Nhóm | Nội dung |
|---|---|
| Shell | `zsh` (mặc định qua tmux `default-shell`), `bash` ngang hàng |
| Multiplexer | `tmux` 3.4 — **cơ chế reconnect** (D3), không phải công cụ cho sinh viên |
| Prompt | `oh-my-posh` v30.6.4 (ghim + sha256) với theme của repo `/etc/dlp/dlp.omp.json` |
| CLI hiện đại | `eza` `bat` `fzf` `zoxide` `fastfetch` `jq` `git` `less` `unzip` `xxd` |
| Editor | `vi` (qua `vim-tiny`) — `EDITOR=vi`, thiếu nó thì `git commit` không mở được |
| Init | `tini` làm PID 1 |
| Locale/màu | `en_US.UTF-8`, `TERM=xterm-256color`, `COLORTERM=truecolor` |

Số đo (2026-08-10, `linux/amd64`): **369 MB** image / **86 MB** tarball.
Trivy: **0 CRITICAL**, 14 HIGH — cả 14 là CVE **stdlib Go** trong chính binary
`oh-my-posh` (vá ở Go 1.25.10+/1.26.3+, phụ thuộc thượng nguồn build lại); tầng
gói Ubuntu sạch.

**`fastfetch` KHÔNG có trong repo 24.04** ⇒ cài từ `.deb` chính chủ, ghim
version + digest. Đã kiểm chạy thật trên Noble (glibc 2.39): `fastfetch 2.67.0
(x86_64)`, tự nhận `OS: Ubuntu 24.04.4 LTS`. Cố ý **không** rơi về `neofetch`
(archive từ 2024 — dạy sinh viên một công cụ đã chết là món nợ trả bằng thời
gian của người khác).

## Bốn ràng buộc dễ phá khi sửa file này

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

## Chưa làm (E6–E9)

| Task | Nội dung | Vì sao chưa |
|---|---|---|
| **E6** | `pwsh` qua build-arg `INCLUDE_PWSH` | Microsoft chưa publish gói cho 24.04/26.04 |
| **E7** | Docker/DinD qua `INCLUDE_DOCKER` | Chặng sau; AC "DinD offline" (D4) phụ thuộc nó |
| **E8** | `entrypoint.sh` — dockerd + nạp dotfiles có allowlist | Đi cùng E7. Lưu ý `/root` là BẢN SAO của `/etc/skel` lúc build, hai bên có thể đã lệch |
| **E9** | tmux là đường vào mặc định | Vế image đã xong (`new-session -A` hai lần = **1** session); vế gateway thuộc G4 |

`INCLUDE_PWSH`/`INCLUDE_DOCKER` **cố ý chưa khai báo** trong Dockerfile: một
`ARG` khai sẵn mà không nhánh nào đọc là lời hứa suông, và buildx chỉ *cảnh báo*
khi nhận build-arg lạ chứ không đỏ — nên nó sẽ im lặng vô nghĩa cho tới khi có
người tin vào nó.

## Ghi chú nhỏ nhưng dễ mất thời gian

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
