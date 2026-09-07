# .bashrc — E4.
#
# zsh là shell mặc định (tmux `default-shell`), nhưng bash phải dùng được y hệt:
# phần lớn tài liệu DevOps/KillerCoda viết cho bash, và sinh viên gõ `bash` là
# chuyện bình thường. Giữ hai file ngang nhau về tiện nghi.

# Thoát sớm khi không tương tác — giữ đúng quy ước của bash.
case $- in
  *i*) ;;
    *) return;;
esac

# ── History ──────────────────────────────────────────────────────────────────
HISTSIZE=10000
HISTFILESIZE=10000
HISTCONTROL=ignoreboth
shopt -s histappend checkwinsize

# ── Prompt (oh-my-posh, cùng theme với zsh) ──────────────────────────────────
if command -v oh-my-posh >/dev/null 2>&1; then
  eval "$(oh-my-posh init bash --config /etc/dlp/dlp.omp.json)"
fi

# ── zoxide ───────────────────────────────────────────────────────────────────
if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init bash)"
fi

# ── fzf ──────────────────────────────────────────────────────────────────────
# Ubuntu 24.04 có fzf 0.44; `fzf --bash` chỉ có từ 0.48 ⇒ dùng đường source cũ.
#
# `[[ -t 0 ]]` đối xứng với .zshrc và cũng cần thật: key-bindings.bash gọi
# `bind -x`, mà readline chỉ bật khi có terminal ⇒ `bash -ic '…'` (không tty)
# in "bind: warning: line editing not enabled" một dòng mỗi binding. Nó ra
# stderr nên AC hiện tại không đỏ, nhưng bất kỳ harness nào gộp 2>&1 sẽ dính.
if [[ -t 0 ]] && command -v fzf >/dev/null 2>&1; then
  [[ -f /usr/share/doc/fzf/examples/key-bindings.bash ]] && \
    source /usr/share/doc/fzf/examples/key-bindings.bash
  [[ -f /usr/share/bash-completion/completions/fzf ]] && \
    source /usr/share/bash-completion/completions/fzf
fi

# ── Alias ────────────────────────────────────────────────────────────────────
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --icons'
  alias ll='eza --icons -la --git'
  alias lt='eza --icons --tree --level=2'
fi
# `--plain` bỏ header tên file + số dòng: giữ `cat` khớp với mọi tutorial mà
# sinh viên đang đọc, chỉ thêm màu. Lưu ý `bat` vẫn TỪ CHỐI in file nhị phân
# (`cat` thì đổ ra) — khác biệt duy nhất không alias nào che được, ghi ở README.
if command -v bat >/dev/null 2>&1; then
  alias cat='bat --plain --paging=never'
fi

export EDITOR=vi

# ── Màn chào một lần mỗi phiên tmux (§C4 / dlp-motd) ─────────────────────────
# File này đã `return` ở đầu khi shell không tương tác, nên tới được đây tức là
# đã ở nhánh tương tác. `dlp-motd` vẫn tự gác thêm ($TMUX + TTY + cờ một lần).
if command -v dlp-motd >/dev/null 2>&1; then
  dlp-motd
fi

# ⚠ CỐ Ý KHÔNG đặt PATH cho /usr/local/dlp-bin ở đây — xem chú thích cùng nội
# dung ở cuối .zshrc. PATH đến từ `ENV PATH` trong Dockerfile.
