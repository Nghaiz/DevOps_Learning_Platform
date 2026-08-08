# Placeholder — nội dung thật (oh-my-posh, fastfetch, terminal-icons, eza,
# zoxide, fzf, bat; shell bash/zsh, chọn được pwsh + PSReadLine — xem README.md
# cùng thư mục và design §4b) dựng ở P1. File này tồn tại NGAY từ P0 chỉ để job
# `images` trong CI (0.G, phase-0.md task 29) có gì đó build & push thật — không
# phải vì image đã sẵn sàng dùng cho lab.
#
# Nền Ubuntu, không phải Debian: host chạy Debian 13 (design §5b) nhưng phần lớn
# tài liệu DevOps/KillerCoda giả định `apt` trên Ubuntu — host Debian chạy
# container Ubuntu là chuyện bình thường, không phải nghịch lý.
# 26.04 là LTS hiện hành (LTS → LTS, không phải nhảy sang bản interim). An toàn
# tuyệt đối lúc này vì image còn là placeholder — không cài gói nào. P1 khi thêm
# oh-my-posh/eza/pwsh PHẢI kiểm lại: một số kho của bên thứ ba lên bản LTS mới
# chậm vài tháng, và đó là lúc chuyện này mới thật sự có hệ quả.
FROM ubuntu:26.04

LABEL org.opencontainers.image.description="DevOps Learning Platform — sandbox base (placeholder P0, nội dung thật ở P1)"

CMD ["/bin/bash"]
