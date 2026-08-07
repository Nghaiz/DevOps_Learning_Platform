# `images/sandbox-base` — chỗ dành sẵn

Image chạy trong pod lab: oh-my-posh, fastfetch, terminal-icons, eza, zoxide, fzf,
bat; shell bash/zsh, chọn được pwsh + PSReadLine (design §4b). Xây ở **P1**.

**Nền image là Ubuntu, không phải Debian.** Host chạy Debian 13 (design §5b) nhưng
phần lớn tài liệu DevOps/KillerCoda giả định `apt` trên Ubuntu — host Debian chạy
container Ubuntu là chuyện bình thường.
