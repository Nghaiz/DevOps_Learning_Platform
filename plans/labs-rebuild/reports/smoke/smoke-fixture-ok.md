# Smoke lab `smoke-fixture-ok` — ĐẠT

- Tiêu đề: Fixture của content-smoke: hai task phải xanh
- Lúc chạy: 2026-10-02T22:55:41.963Z · tổng 52.8s
- Image: `ghcr.io/nghaiz/dlp-sandbox-base:sha-6f19cbe` · profile: `(mặc định)` · pod: `smoke-lab-smoke-fixture-ok-6379ea`
- Hạ tầng: pod Ready 9.0s · dockerd 6.8s · terminal 17.4s · loadavg node: 9.18 9.36 7.58 2/1647 961

## Độ lệch (0)

Không có.

## Từng bước

| Đơn vị | Verify trước (phải trượt) | Thao tác | Verify sau (phải đạt) |
|---|---|---|---|
| setup — Dựng cảnh | — | — | — |
| task:write-greeting — Tạo file lời chào | exit 1 · 1.3s 0/2✓ | 1 lệnh · 2.7s | exit 0 · 1.4s 2/2✓ |
| task:publish-config — Chuyển cấu hình sang chế độ công bố | exit 1 · 1.3s 1/3✓ | 1 lệnh · 1.6s | exit 0 · 1.4s 3/3✓ |

## Chấm lại mọi task sau khi giải xong

| Task | Kết quả |
|---|---|
| write-greeting | exit 0 · 1.0s 2/2✓ |
| publish-config | exit 0 · 1.2s 3/3✓ |

---
"chậm" = verify quá 20s (§C1). Bản máy đọc: cùng tên, đuôi `.json`.
