# Sinh secret (không cần dịch vụ bên ngoài)

Ba giá trị này bạn **tự sinh trên máy mình**. Không đăng ký ở đâu cả.

| Biến | Ở file | Dùng làm gì |
|---|---|---|
| `POSTGRES_PASSWORD` | `.env` (root) | mật khẩu Postgres của compose |
| `REDIS_PASSWORD` | `.env` (root) | `--requirepass` của Redis |
| `BETTER_AUTH_SECRET` | `apps/web/.env` | ký session cookie + JWT |

## Lệnh

**Windows (PowerShell) hoặc bất kỳ máy nào có Node:**

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Linux / macOS / Git Bash:**

```bash
openssl rand -hex 32
```

Chạy **ba lần**, mỗi giá trị cho một biến. Đừng dùng lại cùng một chuỗi cho cả ba
— trong đó `BETTER_AUTH_SECRET` là thứ nguy hiểm nhất: ai có nó thì ký được cookie
session cho **bất kỳ user nào**, kể cả admin, mà không cần biết mật khẩu.

Mỗi lệnh cho ra chuỗi hex 64 ký tự, ví dụ:

```
7f3a9c2e8b1d4056a7c9e2f4b8d1a3c5e7f9b2d4a6c8e1f3b5d7a9c2e4f6b8d1
```

## Điền vào đâu

`.env` ở root:

```bash
POSTGRES_PASSWORD=<chuỗi thứ nhất>
REDIS_PASSWORD=<chuỗi thứ hai>
```

`apps/web/.env` — **cùng hai mật khẩu đó** phải xuất hiện lại trong chuỗi kết nối:

```bash
DATABASE_URL=postgresql://dlp:<chuỗi thứ nhất>@localhost:5432/dlp
REDIS_URL=redis://:<chuỗi thứ hai>@localhost:6379
BETTER_AUTH_SECRET=<chuỗi thứ ba>
```

Chú ý dấu `:` đứng ngay sau `redis://` — Redis không có username, nên phần đó để
trống và mật khẩu đứng một mình.

`services/orchestrator/.env` cần đúng hai chuỗi kết nối đó (copy y nguyên).

## Nếu mật khẩu chứa ký tự đặc biệt

Chuỗi hex từ lệnh trên chỉ có `0-9a-f` nên luôn an toàn. Nhưng nếu bạn tự đặt mật
khẩu có `@`, `:`, `/`, `#`, `?` thì **phải percent-encode** trước khi nhét vào
URL — không thì chuỗi kết nối bị parse sai và lỗi trông như "sai mật khẩu" trong
khi thật ra là "sai cú pháp URL":

```bash
node -e "console.log(encodeURIComponent('mật/khẩu@của#tôi'))"
```

Cách đơn giản hơn: dùng hex.

## Đổi secret sau này

| Đổi | Hệ quả |
|---|---|
| `POSTGRES_PASSWORD` | Postgres **không** tự nhận mật khẩu mới — biến đó chỉ có tác dụng lúc volume được khởi tạo lần đầu. Phải `ALTER USER dlp PASSWORD '...'`, hoặc `docker compose down -v` (**XOÁ SẠCH DATA**) rồi `make up` |
| `REDIS_PASSWORD` | có hiệu lực sau `docker compose up -d --force-recreate redis` |
| `BETTER_AUTH_SECRET` | mọi user đang đăng nhập **bị đăng xuất ngay** (session và JWT cũ không verify được nữa). Đúng ý khi cần thu hồi khẩn cấp |

## Vệ sinh

- Mật khẩu ở đây là **của máy dev**. Prod dùng giá trị khác, sinh riêng —
  [05-helm-secrets-deploy.md](05-helm-secrets-deploy.md).
- `.env` đã bị `.gitignore` chặn, và `gitleaks` chạy trên mọi commit. Đừng thử
  đối đầu với cả hai.
- Đừng dán secret vào issue, PR, hay chat. Cần chia sẻ thì dùng kênh bí mật —
  và sau đó xoay lại giá trị.
