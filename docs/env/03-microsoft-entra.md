# Lấy `MICROSOFT_CLIENT_ID` và `MICROSOFT_CLIENT_SECRET`

Cùng tính chất với Google: **chỉ cần khi muốn thử nút "Đăng nhập với Microsoft"**.
Placeholder chạy được cho mọi thứ khác.

Microsoft đổi tên "Azure Active Directory" thành **Microsoft Entra ID**. Tài liệu
cũ trên mạng vẫn gọi tên cũ — cùng một thứ.

Thời gian: ~10 phút. Tài khoản Azure miễn phí là đủ; App registration không cần
subscription trả phí.

## Bước 1 — Tạo App registration

1. Vào [Azure Portal](https://portal.azure.com/), tìm **Microsoft Entra ID**
2. Menu trái → **App registrations** → **New registration**
3. **Name**: `DevOps Learning Platform` (user sẽ thấy tên này lúc đồng ý)
4. **Supported account types** — chọn theo ai được đăng nhập:

   | Lựa chọn | Ai đăng nhập được | Khi nào chọn |
   |---|---|---|
   | Chỉ tổ chức này (single tenant) | chỉ tài khoản trong tenant của bạn | nền tảng chỉ dùng nội bộ trường |
   | **Nhiều tổ chức (multitenant)** | tài khoản công việc/trường học ở bất kỳ tổ chức nào | **mặc định — hợp với cấu hình hiện tại** |
   | Multitenant + tài khoản cá nhân | thêm cả Outlook/Xbox cá nhân | muốn nhận cả email cá nhân |

   > Cấu hình hiện tại **không đặt `tenantId`**, nên Better Auth dùng mặc định
   > `common` — endpoint chấp nhận tài khoản đa tenant. Nếu bạn chọn **single
   > tenant** ở đây thì phải sửa
   > [apps/web/src/server/auth/config.ts](../../apps/web/src/server/auth/config.ts)
   > để truyền `tenantId`; không thì login báo lỗi cấu hình sai tenant.

5. **Redirect URI**: chọn platform **Web**, giá trị:
   ```
   http://localhost:3000/api/auth/callback/microsoft
   ```
   (Chuỗi này = `BETTER_AUTH_URL` + `/api/auth/callback/` + tên provider trong
   `socialProviders`. Khớp từng byte.)
6. **Register**

## Bước 2 — Lấy Client ID

Trang **Overview** của app vừa tạo hiện **Application (client) ID** — một GUID:

```
a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Đó là `MICROSOFT_CLIENT_ID`. Không phải secret.

## Bước 3 — Tạo Client secret

1. Menu trái của app → **Certificates & secrets** → tab **Client secrets**
2. **New client secret**
3. **Description**: `dlp-dev`
4. **Expires**: chọn thời hạn. Azure **không cho** vô hạn.

   > **Ghi ngay ngày hết hạn vào lịch.** Secret hết hạn = tính năng đăng nhập
   > Microsoft chết đúng ngày đó, và triệu chứng (`invalid_client`) trông hệt như
   > cấu hình sai chứ không như "đã hết hạn". Đây là lỗi vận hành phổ biến nhất
   > của Entra.

5. **Add**. Bảng hiện cột **Value** và cột **Secret ID**.

> **Copy cột `Value`, KHÔNG phải `Secret ID`.** Rời khỏi trang là `Value` bị che
> vĩnh viễn, không xem lại được — phải tạo secret mới. Nhầm hai cột này là lỗi
> phổ biến nhất khi lấy credential Entra.

## Bước 4 — Điền vào `apps/web/.env`

```bash
MICROSOFT_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
MICROSOFT_CLIENT_SECRET=<cột Value>
```

Khởi động lại `next dev`.

## Cho môi trường deploy

**Authentication** → **Add URI**, thêm redirect URI của môi trường đó:

```
https://dlp.example.com/api/auth/callback/microsoft
```

Một app registration mang được nhiều redirect URI, nên dev và prod dùng chung
client được. Tách riêng vẫn sạch hơn.

## Xử lý sự cố

| Lỗi | Nguyên nhân |
|---|---|
| `AADSTS50011: redirect URI không khớp` | Redirect URI trong Authentication khác chuỗi app gửi lên. So từng byte |
| `AADSTS7000215: Invalid client secret` | Đã copy nhầm **Secret ID** thay vì **Value**, hoặc secret đã hết hạn |
| `AADSTS700016: Không tìm thấy application` | Client ID sai, hoặc app đăng ký ở tenant khác tenant đang đăng nhập |
| `AADSTS50020: Tài khoản user không tồn tại trong tenant` | Chọn single tenant nhưng đăng nhập bằng tài khoản ngoài. Đổi sang multitenant hoặc truyền `tenantId` |
| Đang chạy tự dưng hỏng | Client secret hết hạn. Kiểm ở **Certificates & secrets** |

## Bảo mật

- Đặt lời nhắc **trước hạn 30 ngày**. Xoay secret là thao tác vài phút; phát hiện
  ra nó hết hạn qua báo lỗi của sinh viên thì đắt hơn nhiều.
- Client secret không bao giờ tới trình duyệt — nó chỉ được dùng phía server, ở
  bước đổi authorization code lấy token.
- Ở prod, giá trị đi vào cluster qua Secret —
  [05-helm-secrets-deploy.md](05-helm-secrets-deploy.md).
