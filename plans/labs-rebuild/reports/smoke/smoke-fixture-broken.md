# Smoke lab `smoke-fixture-broken` — TRƯỢT

- Tiêu đề: Fixture của content-smoke: CỐ Ý hỏng
- Lúc chạy: 2026-10-02T22:56:47.924Z · tổng 61.5s
- Image: `ghcr.io/nghaiz/dlp-sandbox-base:sha-6f19cbe` · profile: `(mặc định)` · pod: `smoke-lab-smoke-fixture-broken-3e3caa`
- Hạ tầng: pod Ready 10.8s · dockerd 4.4s · terminal 15.2s · loadavg node: 8.91 9.16 7.65 4/1650 966

## Độ lệch (6)

- **task:always-pass** `pre-pass` — verify ĐẠT trước khi người học làm gì — nó không phân biệt được trước/sau
- **task:no-solution** `missing-solution` — thiếu task-no-solution/solution.sh (§C2: BẮT BUỘC)
- **task:wrong-answer** `post-fail` — verify TRƯỢT sau khi đã làm (exit 1): ✗ /root/fx/answer.txt chứa 42 (hiện: '41')
- **final:make-file** `regress` — verify TRƯỢT sau khi đã làm (exit 1): ✗ /root/fx/a.txt tồn tại
- **final:no-solution** `regress` — verify TRƯỢT sau khi đã làm (exit 1): ✗ /root/fx/c.txt tồn tại
- **final:wrong-answer** `regress` — verify TRƯỢT sau khi đã làm (exit 1): ✗ /root/fx/answer.txt chứa 42 (hiện: '41')

## Từng bước

| Đơn vị | Verify trước (phải trượt) | Thao tác | Verify sau (phải đạt) |
|---|---|---|---|
| setup — Dựng cảnh | — | — | — |
| task:make-file — Tạo a.txt (đúng, nhưng sẽ bị task sau phá) | exit 1 · 0.8s 0/1✓ | 1 lệnh · 3.7s | exit 0 · 1.0s 1/1✓ |
| task:clobber — Tạo b.txt (lời giải xoá luôn a.txt) | exit 1 · 1.6s 0/1✓ | 1 lệnh · 1.4s | exit 0 · 0.9s 1/1✓ |
| task:always-pass — Verify không kiểm gì | exit 0 · 0.9s 1/1✓ ⚠ | 1 lệnh · 1.4s | exit 0 · 0.6s 1/1✓ |
| task:no-solution — Thiếu solution.sh | exit 1 · 0.6s 0/1✓ | — | — |
| task:wrong-answer — Lời giải làm sai yêu cầu | exit 1 · 0.8s 0/1✓ | 1 lệnh · 1.4s | exit 1 · 1.7s 0/1✓ ⚠ |

## Chấm lại mọi task sau khi giải xong

| Task | Kết quả |
|---|---|
| make-file | exit 1 · 3.8s 0/1✓ ⚠ |
| clobber | exit 0 · 1.4s 1/1✓ |
| always-pass | exit 0 · 0.9s 1/1✓ |
| no-solution | exit 1 · 0.7s 0/1✓ ⚠ |
| wrong-answer | exit 1 · 0.7s 0/1✓ ⚠ |

## Chi tiết các đơn vị có vấn đề

### task:make-file — Tạo a.txt (đúng, nhưng sẽ bị task sau phá)

verify trước — exit 1, 0.8s:

```text
✗ /root/fx/a.txt tồn tại
```

verify sau — exit 0, 1.0s:

```text
✓ /root/fx/a.txt tồn tại
```

### task:always-pass — Verify không kiểm gì

verify trước — exit 0, 0.9s:

```text
✓ luôn đạt
```

verify sau — exit 0, 0.6s:

```text
✓ luôn đạt
```

### task:no-solution — Thiếu solution.sh

verify trước — exit 1, 0.6s:

```text
✗ /root/fx/c.txt tồn tại
```

### task:wrong-answer — Lời giải làm sai yêu cầu

verify trước — exit 1, 0.8s:

```text
✗ /root/fx/answer.txt chứa 42 (hiện: '')
```

verify sau — exit 1, 1.7s:

```text
✗ /root/fx/answer.txt chứa 42 (hiện: '41')
```

---
"chậm" = verify quá 20s (§C1). Bản máy đọc: cùng tên, đuôi `.json`.
