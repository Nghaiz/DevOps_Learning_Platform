# Smoke lab `smoke-fixture-ok` — ĐẠT

- Tiêu đề: Fixture của content-smoke: hai task phải xanh
- Lúc chạy: 2026-10-02T23:08:19.691Z · tổng 55.4s
- Image: `ghcr.io/nghaiz/dlp-sandbox-base:sha-6f19cbe` · profile: `(mặc định)` · pod: `smoke-lab-smoke-fixture-ok-31011e`
- Hạ tầng: pod Ready 9.4s · dockerd 6.3s · terminal 14.0s · loadavg node: 16.42 11.56 9.52 6/1837 950

## Độ lệch (0)

Không có.

## Từng bước

| Đơn vị | Verify trước (phải trượt) | Thao tác | Verify sau (phải đạt) |
|---|---|---|---|
| setup — Dựng cảnh | — | — | — |
| task:write-greeting — Tạo file lời chào | exit 1 · 0.9s 0/2✓ | 1 lệnh · 0.4s | exit 0 · 0.8s 2/2✓ |
| task:publish-config — Chuyển cấu hình sang chế độ công bố | exit 1 · 1.3s 1/3✓ | 1 lệnh · 0.8s | exit 0 · 1.5s 3/3✓ |

## Chấm lại mọi task sau khi giải xong

| Task | Kết quả |
|---|---|
| write-greeting | exit 0 · 1.2s 2/2✓ |
| publish-config | exit 0 · 1.7s 3/3✓ |

---
"chậm" = verify quá 20s (§C1). Bản máy đọc: cùng tên, đuôi `.json`.
