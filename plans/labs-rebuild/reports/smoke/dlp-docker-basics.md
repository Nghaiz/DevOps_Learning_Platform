# Smoke bài học `dlp-docker-basics` — TRƯỢT

- Tiêu đề: Docker căn bản: kéo, chạy, dựng image
- Lúc chạy: 2026-10-02T23:10:08.776Z · tổng 257.2s
- Image: `ghcr.io/nghaiz/dlp-sandbox-base:sha-6f19cbe` · profile: `(mặc định)` · pod: `smoke-lesson-dlp-docker-basics-0cce90`
- Hạ tầng: pod Ready 12.8s · dockerd 6.9s · terminal 17.3s · loadavg node: 15.04 14.17 11.24 4/1844 4854

## Độ lệch (3)

- **step6** `pre-pass` — verify ĐẠT trước khi người học làm gì — nó không phân biệt được trước/sau
- **step6** `slow` — verify mất ~23.5s trong pod (> 20s của §C1; đo 24.8s kể cả exec)
- **step6** `slow` — verify mất ~27.0s trong pod (> 20s của §C1; đo 28.3s kể cả exec)

## Cảnh báo (1)

- intro `shell-error` — foreground «#!/bin/bash»: zsh: event not found: /bin/bash

## Từng bước

| Đơn vị | Verify trước (phải trượt) | Thao tác | Verify sau (phải đạt) |
|---|---|---|---|
| intro — Giới thiệu | — | 3 lệnh · 3.9s | — |
| step1 — Kéo image đầu tiên từ Docker Hub | exit 1 · 2.9s | 3 lệnh · 23.6s | exit 0 · 2.1s |
| step2 — Chạy container và mở cổng | exit 1 · 3.0s | 3 lệnh · 32.4s | exit 0 · 3.7s |
| step3 — Xem log và chui vào trong container | exit 1 · 4.0s | 4 lệnh · 4.7s | exit 0 · 2.3s |
| step4 — Dựng image của riêng bạn | exit 1 · 1.9s | 4 lệnh · 16.6s | exit 0 · 13.5s |
| step5 — Tag là con trỏ, không phải bản sao | exit 1 · 2.6s | 4 lệnh · 5.8s | exit 0 · 4.0s |
| step6 — Vì sao `pip install` không chạy được ở đây | exit 0 · 24.8s (chậm) ⚠ | 2 lệnh · 29.0s | exit 0 · 28.3s (chậm) |
| finish — Kết thúc | — | — | — |

## Chi tiết các đơn vị có vấn đề

### intro — Giới thiệu

foreground (rc 0, 1.3s):

```text
❯  #!/bin/bash
zsh: event not found: /bin/bash

  dlp   ~                                                                                                                                                                                23:12:26
❯  # Chạy TRONG terminal người học đang nhìn — đó là toàn bộ khác biệt với
zsh: command not found: #
  dlp   ~                                                                                                                                                                                23:12:27
❯  # background.sh. Nó phải nói cho người ta biết chuyện gì đang xảy ra.
zsh: command not found: #
  dlp   ~                                                                                                                                                                                23:12:27
❯  echo "Dang chuan bi moi truong lab..."
Dang chuan bi moi truong lab...
  dlp   ~                                                                                                                                                                                23:12:27
❯  while [ ! -f /root/lab-docker/.setup-done ]; do sleep 1; done
  dlp   ~                                                                                                                                                                                23:12:27
❯  echo "San sang. Thu muc lam viec: /root/lab-docker"
San sang. Thu muc lam viec: /root/lab-docker
  dlp   ~                                                                                                                                                                                23:12:27
❯
```

### step6 — Vì sao `pip install` không chạy được ở đây

verify trước — exit 0, 24.8s:

```text
Dat — pypi.org:443 bi chan, trong khi mirror Docker Hub van thong.
Do la bang chung mang bi LOC co chon loc, khong phai mang chet.
```

verify sau — exit 0, 28.3s:

```text
Dat — pypi.org:443 bi chan, trong khi mirror Docker Hub van thong.
Do la bang chung mang bi LOC co chon loc, khong phai mang chet.
```

---
"chậm" = verify quá 20s (§C1). Bản máy đọc: cùng tên, đuôi `.json`.
