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
# ─────────────────────────────────────────────────────────────────────────────
# ARG TOÀN CỤC — phải khai TRƯỚC `FROM` đầu tiên thì `FROM ide-${INCLUDE_IDE}`ở
# cuối file mới nội suy được. ARG khai sau một FROM chỉ sống trong stage đó.
ARG INCLUDE_IDE=0
ARG THEIA_IMAGE=ghcr.io/eclipse-theia/theia-ide/theia-ide@sha256:595d34047d91223b5d55fd5b611bb10981154c4b28de9271b2578f996f323751

FROM --platform=linux/amd64 ubuntu:26.04 AS base

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
# E7 — `kubectl` qua `INCLUDE_K8S` (mặc định 1).
#
# ⚠ `kubectl` MỘT MÌNH KHÔNG mở được `capabilities: kubernetes`. Nó là một
# client — nó cần một cluster để trỏ tới, và cluster đó là thứ 7.B/7.C dựng.
# Ghi ở đây vì đó đúng là cách một lời hứa sai ra đời: thấy `kubectl` có trên
# PATH rồi thêm `'kubernetes'` vào `RUNTIME_SUPPORTED_CAPABILITIES`, và người
# học nhận về `The connection to the server localhost:8080 was refused`.
#
# ⛔ KHÔNG nướng `kind` vào đây, dù 7.B có đo nó.
#
# 7.B đo ba đường và chọn **k3s** (589Mi/729MB, so với 922Mi/3553MB của kind —
# `docs/k8s-in-pod.md`). k3s chạy từ một image Docker, KHÔNG cần binary nào trên
# PATH; `kind` thì cần. Nên sau khi chốt, `kind` không còn vai trò lúc chạy.
#
# Và nó không miễn phí: Trivy bắt `usr/local/bin/kind` mang **CVE-2025-68121**
# (stdlib Go 1.25.5, xác thực chứng chỉ sai khi resume phiên TLS; vá ở 1.25.7).
# Đó là CRITICAL **DUY NHẤT** mà P7 thêm vào image — ba cái còn lại
# (dockerd/buildx/oh-my-posh, CVE-2026-56854) đã có từ trước và đã được ghi lý
# do trong `.trivyignore`.
#
# Giữ binary của một đường ĐÃ BỊ LOẠI trong image của MỌI phiên, kèm một
# CRITICAL, chỉ để "biết đâu cần" là không bảo vệ được. Muốn đo lại kind thì
# harness `infra/host/p7-measure.sh` tự tải binary về máy chủ đo — nó không đi
# qua image này.
#
# ⚠ Vì sao phải NƯỚNG VÀO IMAGE chứ không tải lúc chạy: pod sandbox nằm dưới
# NetworkPolicy deny-all, egress duy nhất là DNS + registry mirror docker.io
# (đã đo 2026-09-04: `curl https://github.com` và `https://registry.k8s.io` đều
# TREO rồi timeout). Một `curl -LO .../kind` trong bài học sẽ treo 5 giây rồi
# hỏng, và triệu chứng không trỏ về NetworkPolicy.
#
# `kubectl` GHIM THEO VERSION CỤM (v1.34.10, khớp `kubectl get nodes` của node
# lab), không phải `stable.txt`: `stable.txt` hôm nay trả v1.37.0, và một client
# lệch ba minor so với cluster con là thứ sẽ hỏng ở một field API ngẫu nhiên rồi
# đổ lỗi cho bài học.
#
# sha256 của CẢ HAI lấy từ file checksum CỦA CHÍNH NHÀ PHÁT HÀNH
# (`dl.k8s.io/.../kubectl.sha256`, `.../kind-linux-amd64.sha256sum`), không
# phải digest ta tự tính — cùng chuẩn với E6, mạnh hơn trust-on-first-use.
ARG INCLUDE_K8S=1
ARG KUBECTL_VERSION=v1.34.10
ARG KUBECTL_SHA256=95bd70842bd11a524d24acd5b68726899e3488e153e45e2b4ae846545beda050
RUN if [ "$INCLUDE_K8S" = "1" ]; then \
        set -eux; \
        curl -fsSL -o /tmp/kubectl \
            "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"; \
        echo "${KUBECTL_SHA256}  /tmp/kubectl" | sha256sum -c -; \
        install -m 0755 /tmp/kubectl /usr/local/bin/kubectl; \
        rm -f /tmp/kubectl; \
        kubectl version --client=true >/dev/null; \
    fi

# Script boot cua cluster con + lenh cho. Chep KHONG DIEU KIEN (khong gac bang
# INCLUDE_K8S): chung la vai KB text, va mot entrypoint di tim file khong co la
# quat min hen gio y het truong hop `command -v dockerd` da chan o E8. Chinh
# entrypoint moi la cho quyet dinh co dung cluster hay khong (DLP_K8S).
COPY k3s-boot.sh /usr/local/lib/dlp/k3s-boot.sh
COPY dlp-k8s-wait.sh /usr/local/bin/dlp-k8s-wait
RUN chmod 0755 /usr/local/lib/dlp/k3s-boot.sh /usr/local/bin/dlp-k8s-wait

# ─────────────────────────────────────────────────────────────────────────────
# §C4 — BỘ CÔNG CỤ THEO BÀI: cài hết vào image, GÁC bằng PATH.
#
# Hợp đồng chốt 8 công cụ (btop tldr ripgrep fd duf ncdu delta yq). Chúng KHÔNG
# nằm trên PATH mặc định: binary ở /opt/dlp/tools/<tool>/, và `dlp-tools enable`
# symlink sang /usr/local/dlp-bin (thư mục duy nhất được thêm vào PATH dưới đây).
#
# ⚠ Vì sao cài sẵn thay vì tải lúc chạy: sandbox dưới NetworkPolicy deny-all,
# egress chỉ DNS + mirror docker.io. Không có đường nào tải lúc chạy.
# ⚠ Vì sao gác thay vì để hết trên PATH: pod đến từ WARM POOL — sinh ra trước
# khi biết bài nào dùng nó — nên không truyền được danh sách qua env lúc tạo pod;
# và một bài dạy `grep` mà sẵn `rg` là bài đã bị trả lời hộ.
#
# ⛔ `mv` binary ra khỏi /usr/bin làm CƠ SỞ DỮ LIỆU dpkg nói sai về vị trí file.
# Chấp nhận có chủ ý: image là bất biến, không ai `apt-get upgrade` trong pod.
# Nhưng nếu một ngày có, `--reinstall` sẽ dựng lại /usr/bin/<binary> và cửa gác
# mở toang trong im lặng. Đó là cái giá của đường này; đường thay thế (tải 7
# binary tĩnh rời + 7 checksum) đắt hơn nhiều mà chỉ mua lại đúng điểm đó.
#
# Danh sách gói + ánh xạ tên đọc từ etc/toolset.catalog (SSOT, xem đầu file đó)
# — KHÔNG gõ lại ở đây, vì hai bản danh sách sẽ lệch nhau đúng vào lần thêm tool
# thứ ba, và triệu chứng là `dlp-tools enable <x>` báo "thiếu trong image".
COPY etc/toolset.catalog /etc/dlp/toolset.catalog
COPY etc/tealdeer.toml /etc/dlp/tealdeer/config.toml
COPY etc/fastfetch.jsonc /etc/dlp/fastfetch.jsonc
COPY etc/ptit.ansi /etc/dlp/ptit.ansi

# yq — GHIM VERSION + SHA256, tải binary Go từ GitHub release.
#
# ⛔ TUYỆT ĐỐI KHÔNG `apt-get install yq`. Gói `yq` của Ubuntu 24.04 là **3.1.0**
# — một wrapper Python quanh `jq`, KHÁC HẲN mikefarah/yq mà mọi tài liệu
# Kubernetes giả định. Nó nhận cú pháp khác và sẽ hỏng ở đúng lệnh đầu tiên mà
# một bài học copy từ tài liệu upstream, với thông báo không gợi ý gì về nguyên
# nhân ("Error: unknown flag"). Cùng hạng bẫy với bat/batcat và fd-find/fdfind,
# nhưng tệ hơn: hai cái kia sai TÊN, cái này sai CẢ CHƯƠNG TRÌNH.
#
# sha256 lấy từ file `checksums` CỦA CHÍNH RELEASE (cột thứ 18 theo
# `checksums_hashes_order` — file đó liệt kê ~20 loại hash mỗi dòng), tức chuẩn
# nhà phát hành, cùng mức với E6/E7 và mạnh hơn trust-on-first-use của fastfetch.
ARG YQ_VERSION=v4.53.6
ARG YQ_SHA256=c5f056448f973ae7d39b5401949648a78f2dc1947d6a8eb65be60d5c504b9385

# tldr — CACHE PHẢI SEED LÚC BUILD, không có đường nào khác.
#
# Client là `tealdeer` (gói apt `tealdeer`, binary `tldr`). KHÔNG dùng gói
# `tldr` của Ubuntu: nó chỉ là metapackage phụ thuộc `tldr-hs` (Haskell).
#
# ⛔ `tldr --update` KHÔNG BAO GIỜ chạy được ở đây, vì HAI lý do độc lập:
#   (a) sandbox deny-all egress — đã đo 2026-09-04;
#   (b) kể cả có mạng: tealdeer 1.6.1 tải từ https://tldr.sh/assets/tldr.zip, mà
#       URL đó nay trả **HTML** (đã đo 2026-09-07: 301 → 200 text/html), nên nó
#       chết với "invalid Zip archive: Could not find central directory end".
#       Bản trong repo Ubuntu vĩnh viễn không tự cập nhật được.
# Nên ta tự trải cache theo đúng bố cục mà tealdeer đọc, rồi SMOKE TEST ngay tại
# build. Bố cục đó là chi tiết nội bộ của tealdeer nên nó CÓ THỂ đổi khi nâng
# version — smoke test biến ca đó từ "im lặng hỏng ở phòng máy" thành "build ĐỎ".
#
# ⚠ KHÔNG GHIM ĐƯỢC SHA256 THÀNH HẰNG. Asset của tldr-pages nằm dưới tag cố định
# `v2.3` nhưng được **tải lại mỗi ngày** (đã kiểm: `created_at` của
# tldr-pages.en.zip là chính hôm nay), nên một hằng số checksum sẽ làm build ĐỎ
# trong vòng 24 giờ. Thay vào đó ta tải kèm `tldr.sha256sums` của cùng release
# và đối chiếu. Đọc đúng bản chất: đây là **toàn vẹn đường truyền**, KHÔNG phải
# tái lập được (reproducibility) — nó chặn tải hỏng/đứt, không chặn nội dung
# đổi. Chấp nhận được ở ĐÚNG chỗ này vì payload là markdown tài liệu được
# render, không phải mã chạy; đừng nới cùng lý lẽ đó cho một binary.
ARG TLDR_PAGES_TAG=v2.3

# ⚠ ĐẶT PATH TRƯỚC RUN có chủ ý: khối kiểm ở cuối RUN khẳng định các lệnh
# KHÔNG thấy được khi chưa `enable`, và phép khẳng định đó chỉ có giá trị nếu nó
# chạy dưới đúng PATH của lúc chạy thật.
#
# ⛔ Ở TẦNG IMAGE, KHÔNG phải trong .zshrc/.bashrc. Lý do quyết định: `verify.sh`
# chạy qua `gateway.env.execShell` = **bash KHÔNG tương tác**, mà bash không
# tương tác không đọc .bashrc (file đó còn `return` sớm ở đầu). PATH đặt trong rc
# sẽ có ở terminal của sinh viên nhưng KHÔNG có ở lượt chấm — nên một bài bật
# `yq` rồi dùng `yq` trong verify.sh sẽ chấm sai, và triệu chứng ("bài đúng báo
# sai") không trỏ về PATH. Cùng lý lẽ với COLORTERM ở E2.
#
# Đã đo 2026-09-07 trên ubuntu:24.04: PATH sống qua cả bốn đường
# (`bash -l`, `bash -c`, `zsh -l`, `zsh -c`) — /etc/profile của 24.04 KHÔNG gán
# lại PATH cho root, nên không cần thêm /etc/profile.d.
ENV PATH="/usr/local/dlp-bin:${PATH}" \
    TEALDEER_CONFIG_DIR=/etc/dlp/tealdeer

RUN set -eux; \
    mkdir -p /usr/local/dlp-bin /opt/dlp/tools; \
    \
    pkgs=$(awk '!/^[[:space:]]*#/ && NF >= 3 && $3 != "-" { print $3 }' /etc/dlp/toolset.catalog | sort -u); \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $pkgs; \
    \
    # Dời binary ra khỏi PATH. `mv` chứ không `cp`: một bản sao còn lại ở
    # /usr/bin là cửa gác mở toang mà `dlp-tools list` vẫn báo "tắt".
    #
    # ⚠ BẪY THỨ NĂM, ngoài bốn cái đã biết — `readlink -f` là BẮT BUỘC.
    # Debian đóng gói công cụ Rust theo lối cargo: `/usr/bin/fdfind` KHÔNG phải
    # binary mà là **symlink TƯƠNG ĐỐI** `../lib/cargo/bin/fd`. `mv` một symlink
    # tương đối sang thư mục khác giữ nguyên đích tương đối ⇒ link CHẾT, và
    # `mv` vẫn thoát 0. Build 2026-09-07 đỏ đúng ở `test -x /opt/dlp/tools/fd/fd`;
    # không có khối kiểm ở cuối RUN thì image đã xanh với một `fd` hỏng, và
    # triệu chứng chỉ hiện ra khi một bài học bật `fd`.
    # Dời ĐÍCH THẬT rồi mới gỡ symlink: `readlink -f` trên file thật trả về chính
    # nó (nên nhánh này đúng cho cả hai loại), và `rm -f` sau đó là no-op khi
    # $origin vốn không phải symlink. Cách này cũng không để lại bản sao thứ hai
    # trong /usr/lib/cargo/bin.
    awk '!/^[[:space:]]*#/ && NF >= 4 && $4 != "-" { print $1, $2, $4 }' /etc/dlp/toolset.catalog \
    | while read -r tool cmd origin; do \
        mkdir -p "/opt/dlp/tools/$tool"; \
        real=$(readlink -f "$origin"); \
        test -x "$real"; \
        mv "$real" "/opt/dlp/tools/$tool/$cmd"; \
        rm -f "$origin"; \
      done; \
    \
    # yq — tải + kiểm checksum TRƯỚC khi cài (E3: verify đứng GIỮA tải và cài).
    mkdir -p /opt/dlp/tools/yq; \
    curl -fsSL -o /tmp/yq \
        "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64"; \
    echo "${YQ_SHA256}  /tmp/yq" | sha256sum -c -; \
    install -m 0755 /tmp/yq /opt/dlp/tools/yq/yq; \
    rm -f /tmp/yq; \
    # Khẳng định đúng CHƯƠNG TRÌNH, không chỉ đúng tên file — đây là toàn bộ
    # điểm của việc không dùng gói apt.
    /opt/dlp/tools/yq/yq --version | grep -q 'mikefarah'; \
    \
    # tldr — seed cache. Chỉ `common/` + `linux/`; bỏ android/osx/windows/bsd…
    # (~7.485 file cho cả bộ tiếng Anh). Sandbox là Linux, và mỗi trang là một
    # file nhỏ nên chi phí thật nằm ở SỐ FILE chứ không ở byte.
    cd /tmp; \
    curl -fsSL -o /tmp/tldr-pages.en.zip \
        "https://github.com/tldr-pages/tldr/releases/download/${TLDR_PAGES_TAG}/tldr-pages.en.zip"; \
    curl -fsSL -o /tmp/tldr.sha256sums \
        "https://github.com/tldr-pages/tldr/releases/download/${TLDR_PAGES_TAG}/tldr.sha256sums"; \
    grep ' tldr-pages\.en\.zip$' /tmp/tldr.sha256sums | sha256sum -c -; \
    mkdir -p /opt/dlp/tldr-cache/tldr-pages/pages; \
    unzip -q /tmp/tldr-pages.en.zip -d /opt/dlp/tldr-cache/tldr-pages/pages 'common/*' 'linux/*'; \
    rm -f /tmp/tldr-pages.en.zip /tmp/tldr.sha256sums; \
    # SMOKE TEST bố cục cache. Thiếu bước này, một lần nâng tealdeer đổi bố cục
    # sẽ cho image XANH mà `tldr tar` trả "Page not found in cache" ở phòng máy.
    out=$(/opt/dlp/tools/tldr/tldr tar 2>&1); \
    test -n "$out"; \
    if printf '%s\n' "$out" | grep -q 'not found in cache'; then \
        echo "LOI: bo cuc cache tldr khong khop voi tealdeer nay" >&2; exit 1; \
    fi; \
    \
    # Cửa gác phải THẬT SỰ đóng: sau khi dời, không lệnh nào được thấy trên PATH.
    # `dlp-tools` chưa symlink gì nên mọi `command -v` phải rỗng.
    awk '!/^[[:space:]]*#/ && NF >= 2 { print $1, $2 }' /etc/dlp/toolset.catalog \
    | while read -r tool cmd; do \
        test -x "/opt/dlp/tools/$tool/$cmd"; \
        if command -v "$cmd" >/dev/null 2>&1; then \
            echo "LOI: $cmd van nam tren PATH sau khi doi (cua gac ho)" >&2; exit 1; \
        fi; \
      done; \
    \
    rm -rf /var/lib/apt/lists/*

# `chmod` tường minh — cùng lý do với entrypoint bên dưới: bit thực thi KHÔNG
# sống sót qua NTFS ở máy dev Windows, và một `dlp-tools` mất bit x chỉ lộ ra
# lúc `runSetup` chạy trong pod ("Permission denied"), tức cách xa build.
COPY bin/dlp-tools /usr/local/bin/dlp-tools
COPY bin/dlp-motd /usr/local/bin/dlp-motd
# Nửa GHI của dòng "Phiên" (A6). Gateway gọi nó qua pods/exec lúc dựng phiên và
# sau mỗi lượt ExtendSession; không có nó thì `dlp-motd --field session` đọc một
# file KHÔNG AI GHI và dòng đó không bao giờ hiện ra.
COPY bin/dlp-session-deadline /usr/local/bin/dlp-session-deadline
RUN chmod 0755 /usr/local/bin/dlp-tools /usr/local/bin/dlp-motd \
        /usr/local/bin/dlp-session-deadline && \
    dlp-tools list >/dev/null

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

# ─────────────────────────────────────────────────────────────────────────────
# 6.B — IDE (Eclipse Theia) là layer OPT-IN qua `INCLUDE_IDE` (mặc định 0).
#
# VÌ SAO NHIỀU STAGE CHỨ KHÔNG PHẢI `RUN if`: khuôn `RUN if` của INCLUDE_DOCKER/
# INCLUDE_PWSH không dùng được ở đây, vì thứ cần đưa vào đến từ MỘT IMAGE KHÁC và
# `COPY --from=` không có dạng có điều kiện. Chép rồi `rm` là tệ nhất: file đã xoá
# vẫn nằm trong layer trước, image không-IDE phình lên mà chẳng có IDE — đúng thứ
# ô AC "image không IDE KHÔNG tăng kích thước (so byte với tag trước)" cấm.
#
# Với `INCLUDE_IDE=0`, image cuối là `ide-0`, tức `base` không thêm layer nào ⇒
# GIỐNG HỆT tag trước. BuildKit cũng cắt `theia-src` khỏi đồ thị nên nó KHÔNG pull
# 708 MB cho một build không cần IDE.
#
# NGUỒN THEIA: image upstream ghim DIGEST, KHÔNG build từ nguồn (chốt 2026-09-04,
# `docs/ide-choice.md` §5). Bản trước của 6.A kết luận "Theia không còn bản dựng
# sẵn" sau khi kiểm `ghcr.io/eclipse-theia/theia-ide` → 403; package trên GHCR có
# đường BA đoạn, và `…/theia-ide/theia-ide` trả 200. Digest thay cho `sha256sum -c`
# là cùng một mức bảo đảm, khác cơ chế.
#
# `ARG THEIA_IMAGE` (khai ở đầu file) là cửa lùi: trỏ nó sang một image tự build
# theo `browser.Dockerfile` nếu digest trên biến mất khỏi registry, hoặc khi tới
# ngày cần tuỳ biến bản dựng (bố cục shell/branding là Theia extension biên dịch
# vào bản dựng — không thả được vào /opt/theia lúc chạy).
FROM --platform=linux/amd64 ${THEIA_IMAGE} AS theia-src

FROM base AS ide-0

FROM base AS ide-1
# `/home/theia` mang ứng dụng đã build + plugin tải sẵn từ **Open VSX**.
COPY --from=theia-src /home/theia /opt/theia
# node ĐI KÈM chứ không cài từ apt: image gốc của Theia là `node:24-bookworm-slim`,
# nên `node` nằm ở base image ấy chứ không nằm trong /home/theia. Chép mỗi
# /home/theia sang Ubuntu là được một cây JS không có gì chạy nó — và triệu chứng
# ("exec: node: not found") xuất hiện lúc chạy pod, xa nhất có thể khỏi dòng COPY
# đã thiếu.
#
# Binary link với glibc 2.36 (bookworm) chạy trên Ubuntu 24.04 (glibc 2.39): glibc
# tương thích NGƯỢC theo chiều này. Chiều ngược lại thì không, nên đừng đảo hai base.
COPY --from=theia-src /usr/local/bin/node /opt/theia/node/bin/node
ENV THEIA_DEFAULT_PLUGINS=local-dir:/opt/theia/plugins     USE_LOCAL_GIT=true     DLP_IDE=1

# Image cuối. `INCLUDE_IDE=0` ⇒ `ide-0` ⇒ không một layer nào thêm vào `base`.
FROM ide-${INCLUDE_IDE}
