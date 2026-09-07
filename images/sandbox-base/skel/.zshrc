# .zshrc — E4. Shell mặc định của pod lab.
#
# File này vào CẢ /etc/skel (user tạo sau) LẪN /root (phiên hiện tại) — xem
# Dockerfile. Pod sandbox chạy root trong user-namespace của Sysbox, nên chỉ
# chép vào skel thôi là phiên đầu tiên không có prompt lẫn alias.

# ── History ──────────────────────────────────────────────────────────────────
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt SHARE_HISTORY HIST_IGNORE_DUPS HIST_IGNORE_SPACE HIST_REDUCE_BLANKS

# ── Completion ───────────────────────────────────────────────────────────────
# `-i` (bỏ qua file insecure) chứ KHÔNG phải `-u` (dùng bừa file insecure):
# E8 sắp chép dotfiles do sinh viên cung cấp vào $HOME, và `-u` chính là cờ khiến
# compinit im lặng nạp một thư mục completion world-writable do họ tạo ra.
autoload -Uz compinit && compinit -i
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' menu select

# ── Prompt (oh-my-posh, theme của repo — xem /etc/dlp/dlp.omp.json) ──────────
# Chỉ init khi có TTY: `docker run img zsh -c '…'` và các lời gọi không tương
# tác không cần prompt, và oh-my-posh in escape sequence vào stdout của chúng.
if [[ -o interactive ]] && command -v oh-my-posh >/dev/null 2>&1; then
  eval "$(oh-my-posh init zsh --config /etc/dlp/dlp.omp.json)"
fi

# ── zoxide (cd thông minh) ───────────────────────────────────────────────────
if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init zsh)"
fi

# ── fzf keybinding + completion ──────────────────────────────────────────────
# Ubuntu 24.04 có fzf **0.44**, mà `fzf --zsh` chỉ xuất hiện từ **0.48** (đã kiểm:
# `fzf --zsh` trả lỗi trên 24.04). Nên ở đây phải dùng đường `source` cũ. Khi nào
# base lên bản có fzf ≥ 0.48 thì đổi cả hai file rc sang `eval "$(fzf --zsh)"`.
#
# `[[ -t 0 ]]` là BẮT BUỘC, không phải phòng xa: key-bindings.zsh gọi `zle -N`,
# mà zle chỉ tồn tại khi có terminal thật. `zsh -lic '…'` (đúng dạng mà AC
# COLORTERM dùng) có -i nên `-o interactive` vẫn đúng nhưng KHÔNG có tty ⇒ zsh
# in "can't change option: zle" vào stdout của mọi lời gọi kiểu đó. Không phải
# lỗi chí mạng, nhưng nó nhiễu đúng vào output mà acceptance đang đọc.
if [[ -t 0 ]] && command -v fzf >/dev/null 2>&1; then
  [[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && \
    source /usr/share/doc/fzf/examples/key-bindings.zsh
  [[ -f /usr/share/doc/fzf/examples/completion.zsh ]] && \
    source /usr/share/doc/fzf/examples/completion.zsh
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
# Đặt CUỐI file có chủ ý: nó nằm sau khối oh-my-posh (prompt phải sẵn sàng
# trước) và sau khối alias, vì màn chào có in gợi ý công cụ đang bật.
#
# `dlp-motd` tự gác ba lớp bên trong (phải có $TMUX, phải có TTY, một lần mỗi
# phiên tmux) nên nhánh dưới đây chỉ cần chặn ca rẻ nhất. Xem đầu file
# bin/dlp-motd để biết vì sao khoá theo $TMUX chứ không phải $TMUX_PANE.
if [[ -o interactive ]] && command -v dlp-motd >/dev/null 2>&1; then
  dlp-motd
fi

# ⚠ CỐ Ý KHÔNG đặt PATH cho /usr/local/dlp-bin ở đây. Nó được đặt ở TẦNG IMAGE
# (`ENV PATH` trong Dockerfile) vì lượt CHẤM BÀI chạy `bash` KHÔNG tương tác,
# mà bash không tương tác không đọc rc — PATH đặt trong rc sẽ có ở terminal của
# sinh viên nhưng vắng ở verify.sh. Đừng "sửa thiếu sót" này.
