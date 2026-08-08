# Hướng dẫn cho GitHub Copilot

Copilot code review đọc file này trước mỗi lần review PR. Viết nhận xét **bằng
tiếng Việt**.

## Dự án này là gì

Nền tảng học DevOps tự host. Sinh viên nhận một **pod sandbox có quyền root bên
trong**, và được thiết kế với giả định họ là **tác nhân cố ý đối kháng** — không
phải người dùng bất cẩn. Mọi thứ chạm tới ranh giới sandbox, authz, hay token
đều là code bảo mật, kể cả khi trông như code CRUD bình thường.

Đa ngôn ngữ có chủ đích: **Go** cho hạ tầng nặng (client-go, hàng nghìn WebSocket
long-lived), **TypeScript/Next.js** cho lớp sản phẩm. Ranh giới giữa hai bên là
**contract-first** qua `proto/`.

## Ưu tiên khi review — theo đúng thứ tự này

1. **10 luật bảo mật** (xem [SECURITY.md](SECURITY.md)) là **tiêu chí nghiệm thu
   có thể test**, không phải khuyến nghị. Đặc biệt soi: authz theo từng object
   (IDOR), token chỉ nằm trong httpOnly cookie — không bao giờ ở URL/query, JWT
   phải có `aud` đúng service, và cô lập sandbox.
2. **Fallback im lặng.** Repo này chọn *ném lỗi* thay vì đoán giá trị mặc định.
   Thấy `?? 'localhost'`, `|| 'default'`, hay `catch {}` nuốt lỗi trên đường dữ
   liệu/credential → nêu ra. Fallback được chấp nhận phải có log và có chú thích
   giải thích.
3. **Cổng giả.** Một cổng CI/test luôn xanh còn tệ hơn không có cổng. Thấy
   `if: always()` không kiểm kết quả, `exit-code: 0`, `|| true`, hoặc vòng lặp
   chờ rơi xuyên qua mà không fail → nêu ra.
4. **Giá trị cấu hình bị nhân bản.** Biến môi trường phải khớp ở 4 nơi (code,
   `.env.example`, Helm values, `.github/ci.env`). PR đổi env mà thiếu một trong
   bốn → nêu ra. Cổng `pnpm env:check` bắt việc này, nên hãy nhắc chạy nó.

## Quy ước bắt buộc

- **Chú thích giải thích VÌ SAO, không phải CÁI GÌ.** Repo này chú thích dày có
  chủ ý: mỗi hằng số lạ, mỗi chỗ đi ngược trực giác đều kèm lý do và thường kèm
  cả sự cố đã dính. Đừng đề xuất xoá chú thích cho "gọn". Chú thích viết bằng
  **tiếng Việt**.
- **SSOT.** Không lưu giá trị suy ra được từ giá trị khác. Ánh xạ session→pod chỉ
  sống ở Redis, không nhân bản sang Postgres.
- **Đổi `proto/`** thì phải chạy `make proto` và commit code sinh ra. Không sửa
  tay file trong `gen/`.
- **Không bao giờ** đề xuất commit `.env`, hay nhét giá trị secret vào
  `values.yaml`. Secret đi qua k8s Secret / `existingSecret`.
- **Postgres/Redis phải dùng named volume.** Anonymous volume nhìn y hệt rác
  prune được.
- Ghim version: mọi GitHub Action ghim theo SHA, mọi plugin buf và image base
  ghim theo tag cụ thể.

## Điều KHÔNG cần nêu

- Chú thích tiếng Việt, tên biến tiếng Việt trong chuỗi hiển thị — có chủ đích.
- Chú thích dài dòng giải thích một quyết định — đó là phong cách của repo.
- Đề xuất thêm abstraction/interface cho code chỉ dùng một chỗ (YAGNI).
- Đề xuất bắt lỗi cho tình huống bất khả thi.
- Ý kiến thuần phong cách mà `prettier`/`golangci-lint`/`eslint` đã lo.

## Ngữ cảnh giúp review chính xác hơn

- `apps/web` là **BFF**: nó gọi `services/orchestrator` qua gRPC nội bộ. Trình
  duyệt không bao giờ gọi thẳng service Go.
- `terminal-gateway` mở port công khai cho WebSocket, và tách riêng một port
  admin cho `/healthz` + `/metrics`. `/metrics` **không được** lên Service hay
  ingress — nó không có authz và lộ số session đang chạy.
- Biến `NEXT_PUBLIC_*` bị nướng vào bundle **lúc build**; đặt chúng trong Helm là
  vô tác dụng. Biến URL đọc lúc chạy phải là biến server-side.
- Trạng thái hiện tại là **P0** (nền móng). Nhiều thứ "còn thiếu" là **cố ý hoãn**
  sang P1–P4 và có ghi trong `plans/devops-learning-platform/`. Kiểm plan trước
  khi báo một thứ là thiếu sót.
