# Smoke bài học `dlp-k8s-basics` — ĐẠT

- Tiêu đề: Cụm đầu tiên: node, Pod và kubectl
- Lúc chạy: 2026-10-03T00:32:53.362Z · tổng 246.8s
- Image: `ghcr.io/nghaiz/dlp-sandbox-base:labs-b1` · profile: `k8s` · pod: `smoke-lesson-dlp-k8s-basics-4556b3`
- Hạ tầng: pod Ready 9.9s · dockerd 9.1s · cụm k8s 69.3s · terminal 14.1s · loadavg node: 30.68 22.20 17.35 26/1984 7709

## Độ lệch (0)

Không có.

## Từng bước

| Đơn vị | Verify trước (phải trượt) | Thao tác | Verify sau (phải đạt) |
|---|---|---|---|
| intro — Giới thiệu | — | 1 lệnh · 2.1s | — |
| step1 — Cụm của bạn nằm ở đâu | — | 4 lệnh · 4.9s | — |
| step2 — Pod đầu tiên | exit 1 · 2.3s 0/1✓ | 4 lệnh · 35.7s | exit 0 · 3.8s 3/3✓ |
| step3 — Nhìn vào trong Pod | exit 1 · 3.7s 0/1✓ | 5 lệnh · 7.4s | exit 0 · 2.6s 1/1✓ |
| step4 — Xoá Pod, và không ai dựng lại | exit 1 · 2.1s 0/1✓ | 2 lệnh · 5.2s | exit 0 · 3.1s 1/1✓ |
| step5 — Viết YAML thay vì gõ cờ | exit 1 · 2.9s 0/2✓ | 6 lệnh · 37.8s | exit 0 · 2.5s 3/3✓ |
| step6 — Namespace | exit 1 · 3.2s 0/1✓ | 6 lệnh · 17.1s | exit 0 · 3.5s 2/2✓ |
| finish — Kết thúc | — | — | — |

---
"chậm" = verify quá 20s (§C1). Bản máy đọc: cùng tên, đuôi `.json`.
