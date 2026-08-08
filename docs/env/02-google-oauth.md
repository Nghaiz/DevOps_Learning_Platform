# Lấy `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`

**Chỉ cần khi bạn thật sự muốn thử nút "Đăng nhập với Google".** App chạy bình
thường với giá trị `placeholder-...` trong `.env.example`; chỉ luồng Google mới
hỏng, và nó hỏng ở màn hình của Google chứ không phải trong app.

Thời gian: ~10 phút. Miễn phí.

## Bước 1 — Tạo project

Vào [Google Cloud Console](https://console.cloud.google.com/). Chọn project có
sẵn hoặc tạo mới (menu chọn project ở góc trên bên trái → **New Project**).

Đặt tên gì cũng được — `dlp-dev` chẳng hạn. Không cần bật billing cho OAuth.

## Bước 2 — Cấu hình màn hình đồng ý (consent screen)

Google **bắt buộc** làm bước này trước khi cho tạo credential.

1. Menu trái → **APIs & Services** → **OAuth consent screen**
2. **User Type**: chọn **External** (Internal chỉ có nếu bạn dùng Google Workspace
   và chỉ cho phép người trong tổ chức)
3. Điền phần bắt buộc:
   - **App name** — tên user sẽ thấy, vd `DevOps Learning Platform`
   - **User support email** — email của bạn
   - **Developer contact information** — email của bạn
4. **Scopes**: bấm Save mà không thêm gì. Better Auth chỉ xin `openid`, `email`,
   `profile` — đều là scope không nhạy cảm, không cần Google duyệt.
5. **Test users**: khi app còn ở trạng thái *Testing*, **chỉ email nằm trong danh
   sách này mới đăng nhập được**. Thêm email của bạn vào đây. Bỏ qua bước này là
   nguyên nhân số một của lỗi `access_blocked` sau khi đã làm đúng mọi thứ khác.

## Bước 3 — Tạo OAuth client

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
2. **Application type**: **Web application**
3. **Name**: gì cũng được (chỉ hiện trong console)
4. **Authorized JavaScript origins** — thêm:
   ```
   http://localhost:3000
   ```
5. **Authorized redirect URIs** — thêm **chính xác** chuỗi này:
   ```
   http://localhost:3000/api/auth/callback/google
   ```

> Đường dẫn `/api/auth/callback/google` do Better Auth quyết định: nó dựng từ
> `BETTER_AUTH_URL` + `/api/auth/callback/` + tên provider (`google` trong
> `socialProviders` ở [apps/web/src/server/auth/config.ts](../../apps/web/src/server/auth/config.ts)).
> Google so khớp **từng byte** — thừa dấu `/` cuối, dùng `https` thay `http`, hay
> `127.0.0.1` thay `localhost` đều ra `redirect_uri_mismatch`.

6. **Create**. Google hiện **Client ID** và **Client secret** một lần trong hộp
   thoại. Client secret xem lại được sau (nút hiện giá trị trong trang credential),
   nhưng cứ copy ngay cho gọn.

## Bước 4 — Điền vào `apps/web/.env`

```bash
GOOGLE_CLIENT_ID=123456789012-abc...xyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Khởi động lại `next dev` — Next chỉ đọc `.env` lúc khởi động.

## Cho môi trường deploy

Mỗi môi trường cần **thêm redirect URI của nó** vào cùng OAuth client (hoặc tạo
client riêng, sạch hơn):

```
https://dlp.example.com/api/auth/callback/google
```

Và `BETTER_AUTH_URL` của môi trường đó phải khớp origin tương ứng. Giá trị đi vào
cluster qua Secret, không phải `.env` — [05-helm-secrets-deploy.md](05-helm-secrets-deploy.md).

## Xử lý sự cố

| Lỗi | Nguyên nhân |
|---|---|
| `redirect_uri_mismatch` | Redirect URI không khớp **từng byte**. So sánh chuỗi trong console với `BETTER_AUTH_URL` + `/api/auth/callback/google` |
| `access_blocked` / "App chưa được xác minh" | Email bạn dùng không nằm trong **Test users** (app đang ở Testing) |
| `invalid_client` | Client ID/secret sai, hoặc đang còn giá trị `placeholder-...` |
| Bấm nút không có gì xảy ra | Khởi động lại dev server — `.env` chỉ đọc lúc boot |
| Chạy được ở local, hỏng khi deploy | Chưa thêm redirect URI của production, hoặc `BETTER_AUTH_URL` ở prod vẫn là localhost |

## Bảo mật

- Client secret **là** secret. Không commit, không dán vào issue.
- Lộ rồi thì xoay ngay: trang credential → **Reset Secret**. Client ID không phải
  secret (nó xuất hiện trong URL redirect của trình duyệt), nhưng secret thì có.
- Mỗi môi trường một client riêng thì lộ ở dev không kéo theo prod.
