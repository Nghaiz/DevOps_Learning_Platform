# 19.I — brief viết bài lý thuyết + tài liệu game CI/CD

**Nguồn:** [`phase-19.md`](phase-19.md) §19.I · 28 level ở `packages/games/src/cicd/levels/c01-*.ts` … `c28-*.ts`.

## 1. Sở hữu file — tuyệt đối

Được GHI: `content/games/cicd/theory/*.md` (file mới), `docs/games/cicd.md` (mới), `docs/games/README.md` (thêm mục).
⛔ Không sửa bất kỳ file nào khác — lead đang sửa `apps/web` và sẽ tự nối `theoryId` vào level + viết bộ nạp.
⛔ Không chạy lệnh git nào. Lead commit.

## 2. Hợp đồng ánh xạ — cố định, không tự đổi

Mỗi level thuộc ĐÚNG một bài; mọi level đều có bài (`validateTheoryDocs` trong
`packages/games/src/git/theory.ts` sẽ chạy trên bộ này và đỏ nếu lệch).

| Tên file (= `id`) | `usedByLevels` |
|---|---|
| `01-duong-ong-la-do-thi` | `cicd-c01-mot-job-mot-step`, `cicd-c02-canh-phu-thuoc` |
| `02-song-song-can-may-chay` | `cicd-c03-song-song-tren-may` |
| `03-duong-gang` | `cicd-c04-duong-gang` |
| `04-viec-khong-chan` | `cicd-c05-viec-khong-chan` |
| `05-cache-dat-dung-cho` | `cicd-c06-cache-la-buffer` |
| `06-khoa-cache-rong-va-hep` | `cicd-c07-khoa-cache-qua-rong`, `cicd-c08-khoa-cache-qua-hep` |
| `07-flaky-mot-luot-xanh` | `cicd-c09-mot-luot-xanh-khong-chung-minh-gi` |
| `08-retry-va-loi-that` | `cicd-c10-retry-khong-cuu-duoc-do-that`, `cicd-c11-chay-lai-che-mat-loi-that` |
| `09-ma-tran` | `cicd-c12-ma-tran-quat-ra` |
| `10-gom-ket-qua-nhieu-nhanh` | `cicd-c13-gom-ket-qua-nhieu-nhanh` |
| `11-ba-truc-diem` | `cicd-c14-toi-uu-ba-truc` |
| `12-artifact-co-danh-tinh` | `cicd-c15-artifact-co-danh-tinh` |
| `13-thang-hang-dung-dung-lai` | `cicd-c16-thang-hang-dung-dung-lai` |
| `14-cong-duyet-moi-truong` | `cicd-c17-cong-duyet-prod` |
| `15-rolling-va-blue-green` | `cicd-c18-rolling-tung-dot`, `cicd-c19-blue-green-doi-bo-chon` |
| `16-canary-va-co-mau` | `cicd-c20-canary-gioi-han-luu-luong`, `cicd-c21-doc-tin-hieu-canary` |
| `17-migration-khong-lui` | `cicd-c22-migration-khong-lui` |
| `18-gitops-va-drift` | `cicd-c23-git-la-nguon-that`, `cicd-c24-drift-giua-hai-nhip` |
| `19-tu-sua-va-quyen-so-huu` | `cicd-c25-tu-sua-va-quyen-so-huu` |
| `20-che-bi-mat-trong-log` | `cicd-c26-che-chuoi-da-dang-ky` |
| `21-hotfix-va-ca-truc` | `cicd-c27-hotfix-hai-gio-sang`, `cicd-c28-ca-truc-tong-hop` |

## 3. Khuôn một bài

Bắt chước `content/games/git/theory/01-commit-la-object.md` và `17-conflict-dau-tien.md` (đọc cả hai).

```
---
id: <tên file bỏ .md>
title: <tiêu đề tiếng Việt có dấu>
gameId: cicd
readMinutes: <số nguyên>
usedByLevels:
  - <id level đầy đủ>
---
```

- **LF**, UTF-8, tiếng Việt có dấu; thuật ngữ hạ tầng giữ tiếng Anh (artifact, canary, drift, runner…).
- 300–600 từ văn xuôi mỗi bài. `readMinutes` = `round(từ / 200)`, tối thiểu 1, sai lệch cho phép ±1.
  Từ = token có chữ/số, **không tính** dòng trong khối ```` ``` ````.
- Cấu trúc: mở bằng khái niệm (đời thật), vài mục `##`, và **luôn** có mục `## Trong game này` nói đúng
  cơ chế mô phỏng — đọc file level + engine (`cicd/engine.ts`, `release.ts`, `gitops.ts`, `masking.ts`,
  `cd-contract.ts`) để con số và hành vi khớp mã. Đừng bịa số.
- ⛔ **Không nói lời giải** của level (không nêu giá trị núm / cạnh cần thêm). Dạy khái niệm, không dạy đáp án.
- Ví dụ YAML GitHub Actions ĐƯỢC PHÉP trong `content/` (cổng lõi-trung-lập chỉ quét mã `cicd/`).
- Cổng chống-thương-mại quét `content/`: CẤM "thanh toán", "hoá đơn", "giỏ hàng", "giảm giá", "khuyến mãi",
  "học phí", giá tiền, và tên dịch vụ ví dụ kiểu `payment-service`/`checkout-service`. Dùng
  `dich-vu-dat-lich`, `api-tim-kiem`, `dich-vu-thong-bao`. Bước kéo mã viết đủ `actions/checkout`.
- Không em-dash làm dấu nối câu kiểu "câu — câu" lặp lại; viết tự nhiên như bộ bài Git.

## 4. `docs/games/cicd.md`

Tài liệu kỹ thuật cho người phát triển: mục tiêu game; kiến trúc (lõi trung lập `cicd/contract.ts`,
engine CI, ba bộ mô phỏng CD, tầng YAML là tầng DUY NHẤT biết GitHub Actions, tầng ghép `hydrate.ts`,
khuôn job, bộ chấm OJ `problem-plugin.ts`); hai chương, bảng 28 level (id, chủ đề, bài lý thuyết);
ba trục điểm và vì sao không gộp; cách thêm một level (các ô test ghim gì); quan hệ với `pipeline.md`
(**tham khảo, không phải đặc tả**); việc còn mở (tầng 3D 19.D chưa làm; chế độ làm bài OJ chưa mở vì
`CicdGameAction.evaluate` chỉ chở YAML). Đọc mã để viết, không chép plan.

`docs/games/README.md`: thêm một dòng/mục cho `cicd.md` theo đúng hình dạng các mục đang có, và ghi
`pipeline.md` là tài liệu tham khảo.

## 5. Báo cáo cuối (tin nhắn cuối)

Bảng file × số từ ước lượng × `readMinutes`; mọi chỗ bạn không chắc cơ chế mô phỏng.
