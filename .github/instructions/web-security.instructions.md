---
applyTo: 'apps/web/src/server/**/*.ts,apps/web/src/middleware.ts,apps/web/src/app/api/**/*.ts'
---

# Bề mặt bảo mật của apps/web

Đây là lớp **BFF** — mọi request từ trình duyệt vào hệ thống đều đi qua đây. Code
trong mấy đường dẫn này thực thi luật 1–9 (xem [../SECURITY.md](../SECURITY.md)),
và có test tương ứng trong `apps/web/src/security/`.

Review ở đây soi kỹ hơn bình thường:

- **Authz theo từng object.** Mọi truy vấn trả về dữ liệu thuộc về một user PHẢI
  lọc theo `ctx.user.id` phía server. Id đoán được mà không kiểm chủ sở hữu là
  IDOR — kể cả khi id là UUID.
- **Token.** Chỉ nằm trong httpOnly cookie hoặc body POST. Thấy token trong query
  string, path param, hay được trả về cho JS phía trình duyệt → chặn lại. JWT
  phải kiểm `aud` khớp đúng service tiêu thụ nó.
- **Input.** Mọi input qua tRPC phải có schema Zod, và phải từ chối field lạ
  (`.strict()`), không phải lặng lẽ bỏ qua.
- **Pagination.** Cap cứng phía server (tối đa 100). `limit` do client gửi lên mà
  không kẹp trần là đường dump toàn bộ bảng.
- **CORS.** Allowlist theo origin. Không bao giờ phản chiếu lại `Origin` của
  request, không bao giờ `Allow-Credentials` kèm `*`. Danh sách rỗng = từ chối
  hết (fail-closed) — đó là hành vi đúng, đừng đề xuất "mở tạm".
- **Rate limit.** Chỉ tin `x-forwarded-for` khi `RATE_LIMIT_TRUST_PROXY=1`. Đây
  là header client tự đặt được; tin bừa là né được limit. Còn gộp mọi client
  không định danh được vào một bucket chung thì ngược lại — một người spam khoá
  được tất cả. Không định danh được thì SKIP và log, đó là lựa chọn có chủ ý.
- **Khởi tạo lười.** `getAuth()` và `getDb()` cố tình khởi tạo lười, không phải ở
  module scope: đọc env bắt buộc lúc module load sẽ giết `next build` trong Docker
  (lúc đó không có env thật). Đừng đề xuất chuyển chúng thành `const` ở top level.

Đổi bất kỳ thứ nào ở trên thì PR phải nói rõ nó chạm luật số mấy.
