# images/sandbox-base — image chạy trong pod lab (P1, chặng 1.E-1: E1–E5 + E10).
#
# Nền Ubuntu, không phải Debian: host chạy Debian 13 (design §5b) nhưng phần lớn
# tài liệu DevOps/KillerCoda giả định `apt` trên Ubuntu — host Debian chạy
# container Ubuntu là chuyện bình thường, không phải nghịch lý.
#
# ── VÌ SAO 24.04 (Noble Numbat), không phải 26.04 và cũng không phải 22.04 ────
# Đo trực tiếp bằng `apt-cache policy` trên cả ba base (2026-08-10):
#
#   base    image   eza       fastfetch  zoxide   bat     tmux    hết hỗ trợ
#   22.04   119 MB  THIẾU     THIẾU      0.4.3    0.19    3.2a    2027-04
#   24.04   119 MB  0.18.2    THIẾU      0.9.3    0.24    3.4     2029-04
#   26.04   160 MB  0.23.4    2.57.1     0.9.8    0.25    3.6a    2031-04
#
# 24.04 nhẹ hơn 26.04 **41 MB** mà vẫn giữ được `eza` trong repo; 22.04 cùng cỡ
# 119 MB nhưng mất CẢ `eza` LẪN `fastfetch` và `zoxide` tụt về bản 2021, nên nó
# trả thêm hai món nợ để đổi lấy đúng 0 MB. `tmux 3.4` còn là **chính version mà
# D17 đo hành vi hai-client** — chạy đúng bản đã đo thì kết luận đó còn giá trị.
#
# ⚠ Kích thước image là ĐĨA, không phải RAM — và hai con số dưới đây KHÔNG thay
# thế cho nhau. Với `INCLUDE_DOCKER=0`, pod lab lúc rảnh tốn ~7.5 MB RSS (PID 1)
# và RAM thật do zsh + tmux + oh-my-posh quyết định, như nhau trên cả ba base.
# Với mặc định `INCLUDE_DOCKER=1` thì KHÁC HẲN: entrypoint bật dockerd ngay lúc
# container start (không phải lúc claim), nên pod "lúc rảnh" đo được **153 MiB**
# trên cgroup host — gấp ~20×. Vẫn nằm dưới `requests` 512Mi nên trần 4 session
# của D16 không đổi, nhưng ai tính sức chứa node phải dùng con số 153 MiB.
# Dù sao, đừng chọn BASE vì lý do RAM: base không phải thứ quyết định nó.
#
# Chặng 1.E-2 đóng E6–E9: `INCLUDE_DOCKER` (mặc định 1) và `INCLUDE_PWSH` (mặc
# định 0) nay là ARG THẬT, mỗi cái có đúng một nhánh RUN đọc nó. Ở 1.E-1 chúng
# cố tình chưa khai báo vì một ARG khai sẵn mà không nhánh nào đọc là lời hứa
# suông — buildx chỉ CẢNH BÁO khi nhận build-arg lạ chứ không đỏ, nên nó sẽ im
# lặng vô nghĩa cho tới khi có người tin vào nó.
#
# `--platform=linux/amd64` GHIM CÓ CHỦ Ý: cả CI runner lẫn VM lab đều amd64, và
# hai binary tải thẳng ở dưới cũng là amd64. Không ghim thì build trên máy arm64
# (Apple Silicon) cho image **xanh nhưng hỏng âm thầm**: base thành arm64, binary
# vẫn là amd64, `sha256sum -c` VẪN KHỚP (nó kiểm đúng file nó tải, không kiểm
# arch), rồi trong pod mỗi lần mở shell là `exec format error` và prompt biến mất.
FROM --platform=linux/amd64 ubuntu:26.04

# ─────────────────────────────────────────────────────────────────────────────
# Hai binary tải thẳng — GHIM VERSION + SHA256.
#
# Tuyệt đối KHÔNG `curl … install.sh | bash`: script kiểu đó kéo `releases/latest`
# từ CDN, nên hai lần build cách nhau một ngày cho ra hai binary khác nhau và
# không có checksum nào để phát hiện.
#
# oh-my-posh: sha256 lấy từ `checksums.txt` CỦA CHÍNH RELEASE (nhà phát hành ký).
# fastfetch: release **không publish checksum nào** (đã kiểm — không có asset
#   sum/sha nào), nên con số dưới đây là digest của đúng artifact đã tải và kiểm
#   ngày 2026-08-10 (6.176.110 byte). Nó vẫn ghim build về một artifact bất biến
#   — nhưng phải đọc đúng bản chất: đây là trust-on-first-use, KHÔNG phải chữ ký
#   của nhà phát hành. Nâng version thì phải tính lại digest bằng tay.
ARG OMP_VERSION=v30.6.4
ARG OMP_SHA256=5477f9b110e4165676600630bf4e7b903ee5d176c004b29bdd6b5d64d3ef9074
ARG FASTFETCH_VERSION=2.67.0
ARG FASTFETCH_SHA256=d27b68638d49ae109294b47e7328b7868f5c5568e9cd2be83514eb0d674c863e

# ─────────────────────────────────────────────────────────────────────────────
# E1 — một layer apt duy nhất, xoá index trong CÙNG layer.
#
# `fastfetch` cài trong CHÍNH layer này (không tách RUN riêng) vì `apt-get install
# ./x.deb` cần apt index còn sống để giải dependency — tách ra là phải `apt-get
# update` lần hai, tức tải lại toàn bộ index cho một gói.
#
# BỐN gói ngoài danh sách E1 của plan, thêm có chủ ý:
#
#   ncurses-term — tmux `default-terminal tmux-256color` cần terminfo entry cùng
#     tên, mà entry đó nằm ở đây chứ không phải trong gói `tmux`. Thiếu nó thì
#     tmux chết ngay lúc khởi động ("missing or unsuitable terminal"), tức D3
#     (tmux là cơ chế reconnect) hỏng ở đúng đường mà G4 sẽ đi.
#
#   xxd — AC "Terminal UX" kiểm glyph *trong pod*; thiếu nó thì lệnh acceptance
#     chỉ chạy được sau khi chép byte ra ngoài, và đó là lúc người ta bỏ qua nó.
#
#   sudo — KHÔNG cấp thêm quyền nào: phiên lab vốn đã chạy `uid=0(root)`, và
#     Sysbox map root-trong-container sang một uid không đặc quyền trên host, nên
#     `sudo` ở đây chỉ là một no-op đắt 2 MB. Nó tồn tại vì lý do SƯ PHẠM: gần
#     như mọi hướng dẫn DevOps trên mạng viết `sudo apt install ...`, và
#     `ubuntu:24.04` gốc KHÔNG ship sudo (đo thật: `docker run --rm ubuntu:24.04
#     command -v sudo` → rỗng). Thiếu nó thì mỗi lượt copy-paste của sinh viên
#     chết với `command not found` — một thông báo không hề gợi ý "bạn vốn đã là
#     root". Người dùng gặp đúng ca này 2026-08-11 khi thử phiên đầu tiên.
#     Alias trong shell rc KHÔNG thay thế được: nó chỉ tồn tại trong shell tương
#     tác, còn script `#!/bin/bash`, `make`, `ansible` gọi `sudo` vẫn chết — tức
#     dời lỗi sang chỗ khó hiểu hơn thay vì đóng nó.
#
#   vim-tiny — cung cấp `/usr/bin/vi`. `.zshrc`/`.bashrc` đặt `EDITOR=vi`, mà
#     base Ubuntu KHÔNG có editor nào: thiếu gói này thì `git commit` (không -m)
#     chết với "cannot run vi", và trên một nền tảng DẠY DevOps thì không sửa
#     được YAML/Dockerfile nghĩa là không làm được bài — trong khi AC "10 binary"
#     vẫn xanh trọn vẹn. ~1.5 MB.
#
#   tini — PID 1 tử tế, xem khối ENTRYPOINT ở cuối file.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        zsh \
        tmux \
        git \
        curl \
        ca-certificates \
        less \
        jq \
        unzip \
        locales \
        ncurses-term \
        xxd \
        vim-tiny \
        sudo \
        tini \
        fzf \
        bat \
        zoxide \
        eza && \
    # Ubuntu đóng gói bat với tên binary `batcat` (đụng tên với gói `bat` cũ của
    # ACPI). Alias trong shell là KHÔNG đủ — script và `$EDITOR`-style gọi `bat`
    # không đi qua alias — nên phải là symlink thật trên PATH.
    ln -sf /usr/bin/batcat /usr/local/bin/bat && \
    # fastfetch: KHÔNG có trong repo của 24.04 (chỉ 26.04 mới có). Cài từ .deb
    # ghim version + digest thay vì rơi về `neofetch` — neofetch đã archive từ
    # 2024, và dạy sinh viên một công cụ đã chết là món nợ trả bằng thời gian
    # của người khác.
    curl -fsSL -o /tmp/fastfetch.deb \
        "https://github.com/fastfetch-cli/fastfetch/releases/download/${FASTFETCH_VERSION}/fastfetch-linux-amd64.deb" && \
    echo "${FASTFETCH_SHA256}  /tmp/fastfetch.deb" | sha256sum -c - && \
    apt-get install -y --no-install-recommends /tmp/fastfetch.deb && \
    rm -f /tmp/fastfetch.deb && \
    rm -rf /var/lib/apt/lists/*

# ─────────────────────────────────────────────────────────────────────────────
# E2 — locale + màu.
#
# Thiếu COLORTERM là oh-my-posh tự rơi về 256 màu và AC "truecolor" đỏ DÙ
# terminal phía FE hoàn toàn đúng — lỗi kiểu đó rất tốn thời gian vì mọi thứ
# nhìn "gần đúng". Đặt ở tầng image để mọi đường vào (exec, tmux, zsh, bash)
# đều thấy, không phụ thuộc file rc nào được nạp.
RUN sed -i 's/^# *\(en_US\.UTF-8 UTF-8\)/\1/' /etc/locale.gen && \
    locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    TERM=xterm-256color \
    COLORTERM=truecolor

# ─────────────────────────────────────────────────────────────────────────────
# E3 — oh-my-posh.
#
# `sha256sum -c` đứng GIỮA tải và cài: sai checksum thì `install` không bao giờ
# chạy. Đặt verify sau khi cài là kiểm một thứ đã nằm trên PATH rồi.
RUN curl -fsSL -o /tmp/oh-my-posh \
        "https://github.com/JanDeDobbeleer/oh-my-posh/releases/download/${OMP_VERSION}/posh-linux-amd64" && \
    echo "${OMP_SHA256}  /tmp/oh-my-posh" | sha256sum -c - && \
    install -m 0755 /tmp/oh-my-posh /usr/local/bin/oh-my-posh && \
    rm -f /tmp/oh-my-posh

# ─────────────────────────────────────────────────────────────────────────────
# E3/E4 — theme là TÀI SẢN CỦA REPO, không phải asset tải về.
#
# `themes.zip` của release oh-my-posh KHÔNG có dòng nào trong `checksums.txt`
# (kiểm 2026-08-10: file chỉ liệt kê 10 binary), nên tải nó về là đúng cái "tải
# không checksum" mà E3 vừa cấm ở ngay trên. Theme nằm trong repo thì vừa ghim
# được vừa là thứ ta thật sự muốn kiểm soát — nó là quyết định thiết kế, không
# phải dependency.
COPY etc/dlp.omp.json /etc/dlp/dlp.omp.json

# ─────────────────────────────────────────────────────────────────────────────
# E4 — shell config dùng chung, vào /etc/skel VÀ $HOME.
#
# /etc/skel phục vụ user tạo sau; $HOME (root) phục vụ NGAY phiên này, vì pod
# sandbox chạy bằng root trong user-namespace của Sysbox (podspec.go CỐ Ý không
# đặt RunAsNonRoot — dockerd của E7 cần root đó). Chỉ chép vào skel thôi thì
# phiên đầu tiên vào bằng root sẽ không có prompt, không có alias, không có gì.
#
# ⚠ E8: từ đây /root là BẢN SAO, không phải symlink. Khi E8 thêm entrypoint nạp
# dotfiles của người dùng, nhớ /root đã có thể lệch khỏi /etc/skel.
COPY skel/ /etc/skel/
RUN cp -a /etc/skel/. /root/

# ─────────────────────────────────────────────────────────────────────────────
# E5 — CỐ Ý KHÔNG cài Nerd Font.
#
# Glyph được render ở TRÌNH DUYỆT, không ở container: font là tài sản của
# `packages/terminal` (F3, woff2 subset self-host vì CSP `font-src 'self'`).
# Cài TTF vào đây là ~50–100 MB hoàn toàn vô ích — image chỉ cần PHÁT đúng
# codepoint, và theme ở trên đã làm việc đó.

# ─────────────────────────────────────────────────────────────────────────────
# E7 — Docker/DinD qua `INCLUDE_DOCKER` (mặc định 1, theo D12).
#
# Sysbox chạy `dockerd` TRONG pod mà không cần `privileged` và KHÔNG mount
# `/var/run/docker.sock` của host — đó là toàn bộ lý do nền tảng này dạy được
# Docker mà không phát quyền root của node cho sinh viên.
#
# ⚠ KHOÁ APT GHIM BẰNG SHA256, KHÔNG `curl … | sh`. Cùng kỷ luật với E3 ở trên,
# và ở đây nó nặng hơn: khoá này ký MỌI gói lấy từ download.docker.com, nên
# nhận nhầm một khoá là nhận nhầm cả kho. Docker xoay khoá thì build ĐỎ ở dòng
# `sha256sum -c` — to và đúng chỗ, thay vì âm thầm tin một khoá mới.
#
# Lưu khoá dạng ASCII-armor `.asc` chứ không `gpg --dearmor`: `gnupg` KHÔNG có
# trong ubuntu:24.04 (đã kiểm), nên dearmor sẽ kéo thêm một cây dependency chỉ
# để đổi định dạng — mà apt ≥ 2.4 đọc thẳng được `.asc` qua `signed-by=`.
#
# Codename lấy động từ `/etc/os-release` thay vì gõ cứng `noble`: nếu ai đó nâng
# FROM lên một bản Docker chưa hỗ trợ thì `apt-get update` ĐỎ ngay tại đây. Gõ
# cứng thì nó vẫn cài gói của noble lên base khác và hỏng ở runtime.
#
# KHÔNG cài `docker-compose-plugin`: chưa AC nào đòi, và nó là ~40 MB đi thẳng
# vào tarball phải side-load mỗi lần bump `image.tag`.
ARG INCLUDE_DOCKER=1
ARG DOCKER_GPG_SHA256=1500c1f56fa9e26b9b8f42452a553675796ade0807cdce11975eb98170b3a570
RUN if [ "$INCLUDE_DOCKER" = "1" ]; then \
        set -eux; \
        install -m 0755 -d /etc/apt/keyrings; \
        curl -fsSL -o /etc/apt/keyrings/docker.asc https://download.docker.com/linux/ubuntu/gpg; \
        echo "${DOCKER_GPG_SHA256}  /etc/apt/keyrings/docker.asc" | sha256sum -c -; \
        chmod a+r /etc/apt/keyrings/docker.asc; \
        . /etc/os-release; \
        echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
            > /etc/apt/sources.list.d/docker.list; \
        apt-get update; \
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
            docker-ce docker-ce-cli containerd.io docker-buildx-plugin; \
        rm -rf /var/lib/apt/lists/*; \
    fi

# ─────────────────────────────────────────────────────────────────────────────
# E6 — PowerShell qua `INCLUDE_PWSH` (mặc định 0).
#
# `.deb` universal từ GitHub release, KHÔNG `packages-microsoft-prod`: kho đó
# chưa có kênh cho 24.04 ở thời điểm chốt, và thêm một kho apt nữa là thêm một
# khoá nữa phải ghim.
#
# ⚠ Khác `fastfetch`: sha256 dưới đây lấy từ `hashes.sha256` CỦA CHÍNH RELEASE
# (chữ ký nhà phát hành), không phải digest ta tự tính — mạnh hơn hẳn
# trust-on-first-use. File đó mã hoá **UTF-16LE có BOM**, nên `sha256sum -c` ăn
# thẳng nó sẽ vỡ và `grep` trên nó im lặng trả rỗng; phải `iconv` trước khi đọc.
# Đó là lý do con số được ghim thành hằng ở đây thay vì tải file về mà kiểm.
#
# CHỈ cài `Terminal-Icons`. Plan E6 ghi "Terminal-Icons + PSReadLine", nhưng
# PSReadLine đã ĐI KÈM pwsh 7 — cài thêm một bản từ PSGallery chỉ tạo hai
# version cùng tên trong `$PSModulePath` và bản nào thắng phụ thuộc thứ tự nạp.
ARG INCLUDE_PWSH=0
ARG PWSH_VERSION=7.6.4
ARG PWSH_SHA256=e5688e0569568d48051c49d3e93504cde47af709cdaaabd9a8892bc676b3bdf3
RUN if [ "$INCLUDE_PWSH" = "1" ]; then \
        set -eux; \
        curl -fsSL -o /tmp/powershell.deb \
            "https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell_${PWSH_VERSION}-1.deb_amd64.deb"; \
        echo "${PWSH_SHA256}  /tmp/powershell.deb" | sha256sum -c -; \
        apt-get update; \
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends /tmp/powershell.deb; \
        rm -f /tmp/powershell.deb; \
        pwsh -NoLogo -NonInteractive -Command \
            "Install-PSResource -Name Terminal-Icons -Scope AllUsers -TrustRepository -Quiet"; \
        rm -rf /var/lib/apt/lists/*; \
    fi

# ─────────────────────────────────────────────────────────────────────────────
# E8 — entrypoint: dockerd nền + nạp dotfiles qua allowlist.
#
# `chmod` tường minh vì repo được checkout trên Windows ở máy dev: bit thực thi
# không sống sót qua NTFS, và một ENTRYPOINT mất bit x cho pod
# `CreateContainerError` — lỗi hiện ra ở kubelet chứ không ở build, tức cách xa
# nguyên nhân đúng ba thành phần.
#
# Đặt CUỐI file có chủ ý: nội dung script này thay đổi nhiều hơn hẳn layer apt
# của E7, nên để trên sẽ huỷ cache của một layer mấy trăm MB mỗi lần sửa một
# dòng bash.
COPY entrypoint.sh /usr/local/bin/dlp-entrypoint.sh
RUN chmod 0755 /usr/local/bin/dlp-entrypoint.sh

# ─────────────────────────────────────────────────────────────────────────────
# PID 1 phải SỐNG, và phải là một PID 1 TỬ TẾ.
#
# (a) Vì sao không để CMD thoát: `internal/k8s/podspec.go` KHÔNG đặt Command/Args
#     (pod chạy CMD của image) và đặt `RestartPolicy: Never`. Với
#     `CMD ["/bin/bash"]` của bản placeholder, bash không có TTY nên thoát NGAY,
#     pod về `Succeeded` và warm-pool đầy pod chết mà `pool:free` vẫn tính là ấm
#     — sinh viên claim trúng một xác. `pause` che kín chuyện này vì binary của
#     nó ngủ vĩnh viễn, nên lỗi chỉ lộ đúng vào lúc đổi sang image thật.
#
# (b) Vì sao `tini` chứ không phải `sleep infinity` trần. `sleep` là PID 1 tồi ở
#     hai điểm, và cả hai đều là HỒI QUY so với `pause` (pause làm đúng cả hai):
#       · Không reap: tmux tự daemonize nên tmux server bị reparent về PID 1;
#         `sleep` không bao giờ `wait()` ⇒ tiến trình chết thành zombie vĩnh viễn.
#         Hôm nay vô hại, nhưng E7 (dockerd + `docker build`) đẻ hàng loạt con và
#         zombie ăn thẳng vào pids-cgroup — đúng thứ mà D-19′ sắp đặt trần 4096.
#       · Nuốt SIGTERM: kernel chỉ chuyển tín hiệu cho PID 1 khi có handler tường
#         minh, mà `sleep` không cài ⇒ `kubectl delete pod` (grace mặc định 30s)
#         để pod nằm `Terminating` đủ 30 giây, giữ 1 trong 4 khe quota (D16).
#     `tini -- sleep infinity` reap con mồ côi và chuyển tín hiệu đúng cách.
#
# (c) 1.E-2 chèn `dlp-entrypoint.sh` vào GIỮA tini và CMD, không thay thế tini.
#     Chuỗi vẫn là tini(PID 1) → sleep infinity, vì script kết bằng `exec "$@"`.
#     Nhánh dockerd của nó chạy NỀN và cố ý không được phép làm hỏng chuỗi này:
#     dockerd chết (ví dụ chạy ngoài Sysbox, như trên runner CI) chỉ ghi log rồi
#     đi tiếp — nếu không thì mọi pod warm-pool sẽ chết theo một tiến trình phụ.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/dlp-entrypoint.sh"]
CMD ["sleep", "infinity"]

LABEL org.opencontainers.image.title="dlp-sandbox-base" \
      org.opencontainers.image.description="DevOps Learning Platform — sandbox base (P1 1.E-2, Ubuntu 24.04: zsh/tmux/oh-my-posh + CLI hiện đại + Docker/DinD; pwsh sau build-arg INCLUDE_PWSH=1)" \
      org.opencontainers.image.source="https://github.com/Nghaiz/DevOps_Learning_Platform"
