# Smoke bài học `dlp-docker-basics` — TRƯỢT

- Tiêu đề: Docker căn bản: kéo, chạy, dựng image
- Lúc chạy: 2026-10-02T22:58:48.237Z · tổng 306.8s
- Image: `ghcr.io/nghaiz/dlp-sandbox-base:sha-6f19cbe` · profile: `(mặc định)` · pod: `smoke-lesson-dlp-docker-basics-4b5909`
- Hạ tầng: pod Ready 9.8s · dockerd 7.1s · terminal 16.2s · loadavg node: 14.46 10.96 8.84 17/1808 4634

## Độ lệch (3)

- **step6** `pre-pass` — verify ĐẠT trước khi người học làm gì — nó không phân biệt được trước/sau
- **step6** `slow` — verify mất 25.9s (> 20s của §C1)
- **step6** `slow` — verify mất 24.3s (> 20s của §C1)

## Cảnh báo (1)

- intro `shell-error` — foreground «#!/bin/bash»: zsh: event not found: /bin/bash

## Từng bước

| Đơn vị | Verify trước (phải trượt) | Thao tác | Verify sau (phải đạt) |
|---|---|---|---|
| intro — Giới thiệu | — | 3 lệnh · 8.4s | — |
| step1 — Kéo image đầu tiên từ Docker Hub | exit 1 · 1.6s | 3 lệnh · 51.5s | exit 0 · 2.1s |
| step2 — Chạy container và mở cổng | exit 1 · 1.6s | 3 lệnh · 21.8s | exit 0 · 1.5s |
| step3 — Xem log và chui vào trong container | exit 1 · 2.0s | 4 lệnh · 14.0s | exit 0 · 4.0s |
| step4 — Dựng image của riêng bạn | exit 1 · 3.3s | 4 lệnh · 33.8s | exit 0 · 12.0s |
| step5 — Tag là con trỏ, không phải bản sao | exit 1 · 3.4s | 4 lệnh · 15.8s | exit 0 · 3.0s |
| step6 — Vì sao `pip install` không chạy được ở đây | exit 0 · 25.9s (chậm) ⚠ | 2 lệnh · 30.6s | exit 0 · 24.3s (chậm) |
| finish — Kết thúc | — | — | — |

## Chi tiết các đơn vị có vấn đề

### intro — Giới thiệu

foreground (rc 0, 2.7s):

```text
❯  #!/bin/bash
zsh: event not found: /bin/bash

  dlp   ~                                                                                                                                                                                23:01:08
❯  # Chạy TRONG terminal người học đang nhìn — đó là toàn bộ khác biệt với
zsh: command not found: #
  dlp   ~                                                                                                                                                                                23:01:08
❯  # background.sh. Nó phải nói cho người ta biết chuyện gì đang xảy ra.
zsh: command not found: #
  dlp   ~                                                                                                                                                                                23:01:08
❯  echo "Dang chuan bi moi truong lab..."
Dang chuan bi moi truong lab...
  dlp   ~                                                                                                                                                                                23:01:08
❯  while [ ! -f /root/lab-docker/.setup-done ]; do sleep 1; done
  dlp   ~                                                                                                                                                                                23:01:08
❯  echo "San sang. Thu muc lam viec: /root/lab-docker"
San sang. Thu muc lam viec: /root/lab-docker
  dlp   ~                                                                                                                                                                                23:01:08
❯
```

### step6 — Vì sao `pip install` không chạy được ở đây

verify trước — exit 0, 25.9s:

```text
Dat — pypi.org:443 bi chan, trong khi mirror Docker Hub van thong.
Do la bang chung mang bi LOC co chon loc, khong phai mang chet.
```

verify sau — exit 0, 24.3s:

```text
Dat — pypi.org:443 bi chan, trong khi mirror Docker Hub van thong.
Do la bang chung mang bi LOC co chon loc, khong phai mang chet.
```

---
"chậm" = verify quá 20s (§C1). Bản máy đọc: cùng tên, đuôi `.json`.
