# Bản đồ biến môi trường

Mọi biến môi trường của dự án: nằm ở file nào, ai nạp nó, và lấy giá trị ở đâu.

## 1. Khởi động nhanh (máy vừa clone repo)

```bash
cp .env.example                              .env
cp apps/web/.env.example                     apps/web/.env
cp services/orchestrator/.env.example        services/orchestrator/.env
cp services/terminal-gateway/.env.example    services/terminal-gateway/.env
```

Rồi sửa **ba** giá trị (mọi thứ khác chạy được với default):

| Sửa ở đâu | Biến | Lấy thế nào |
|---|---|---|
| `.env` | `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | tự sinh — [01-generate-secrets.md](01-generate-secrets.md) |
| `apps/web/.env` | `DATABASE_URL`, `REDIS_URL` | dán **đúng** hai mật khẩu vừa sinh vào chuỗi kết nối |
| `apps/web/.env` | `BETTER_AUTH_SECRET` | tự sinh — [01-generate-secrets.md](01-generate-secrets.md) |
| `services/orchestrator/.env` | `DATABASE_URL`, `REDIS_URL` | cùng hai chuỗi như của web |

Sau đó:

```bash
make up          # Postgres + Redis
pnpm env:check   # phải xanh
make smoke       # xác nhận CẢ hai client (TS + Go) nối được
```

> **Bẫy phổ biến nhất:** đổi mật khẩu ở `.env` nhưng quên đổi trong `DATABASE_URL`
> của `apps/web/.env`. Triệu chứng là `password authentication failed for user
> "dlp"` (SQLSTATE 28P01). Hai file là hai tiến trình khác nhau; không có gì tự
> đồng bộ chúng.

## 2. Tất cả file env

| File | Có commit? | Ai nạp | Chứa gì |
|---|---|---|---|
| `.env` | ✗ | `docker compose` tự nạp | credential Postgres + Redis của compose |
| `.env.example` | ✓ | — | template cho file trên |
| `apps/web/.env` | ✗ | `next`, `vitest.setup.ts`, `node --env-file-if-exists` | app + test |
| `apps/web/.env.example` | ✓ | — | template |
| `services/orchestrator/.env` | ✗ | **`make run-orchestrator` / `make smoke`** (shell, không phải Go) | orchestrator |
| `services/terminal-gateway/.env` | ✗ | **`make run-gateway`** | gateway |
| `.github/ci.env` | ✓ **cố ý** | CI (`>> $GITHUB_ENV`) và `make test-ci` | credential GIẢ của runner |
| `infra/helm/platform/values-secrets.yaml` | ✗ | `helm -f` | secret lúc deploy |
| `...values-secrets.example.yaml` | ✓ | — | template |

**Go KHÔNG tự nạp `.env`.** `services/shared/envx` chỉ đọc `os.Getenv`; trong k8s
biến đến từ Secret/Deployment chứ không từ file. `go run ./cmd/orchestrator` trần
sẽ không thấy `.env` — đó là hành vi đúng. Dùng target Makefile, chúng source file
ở tầng shell.

## 3. Biến ở đâu → chảy tới đâu

```
                  .env.example ──(cp)──► .env ──────► docker compose ──► container Postgres/Redis
                                                              │
                              mật khẩu PHẢI TRÙNG ────────────┘
                                                              ▼
apps/web/.env.example ──(cp)──► apps/web/.env ──────► next dev / vitest / drizzle-kit

.github/ci.env ─────────────► GitHub Actions ($GITHUB_ENV) ──► turbo lint build test
        └────────────► make test-ci (tái tạo CI ở máy mình)

values.yaml + values-secrets.yaml ──► helm ──► Deployment env / Secret ──► pod
```

Cả bốn nhánh được ép khớp nhau bởi **một cổng**: `pnpm env:check`
([scripts/env-check.mjs](../../scripts/env-check.mjs)), chạy trong CI. Nó fail khi:

- code đọc một biến mà `.env.example` không khai
- `.env.example` khai một biến không code nào đọc
- Helm cấp cho pod một biến mà `.env.example` không khai
- `.github/ci.env` thiếu biến mà code gọi `requireEnv()`
- `turbo.json` thiếu biến trong `tasks.test.env` / `tasks.build.env` (turbo chạy
  envMode STRICT — biến không khai bị **lột** khỏi tiến trình con, và lỗi chỉ lộ
  ra trên CI)

### Cú pháp trong `.env.example`

```bash
FOO=bar                     # ACTIVE — bắt buộc phải có code đọc nó
# FOO=bar                   # OPTIONAL — được phép chưa ai đọc (biến của phase sau)

# env-check: allow-unused   # miễn trừ cho biến ngay dưới (framework/container đọc)
PORT=3000
```

## 4. Giá trị phải lấy từ bên ngoài

| Biến | Nguồn | Bắt buộc khi | Hướng dẫn |
|---|---|---|---|
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `BETTER_AUTH_SECRET` | tự sinh trên máy bạn | ngay bây giờ | [01-generate-secrets.md](01-generate-secrets.md) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console | khi cần đăng nhập Google thật | [02-google-oauth.md](02-google-oauth.md) |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Azure Portal (Entra ID) | khi cần đăng nhập Microsoft thật | [03-microsoft-entra.md](03-microsoft-entra.md) |
| Branch protection, merge, Copilot review, Dependabot | GitHub repo Settings | **đã cấu hình sẵn** — kiểm bằng `pnpm repo:check` | [04-github-repo-settings.md](04-github-repo-settings.md) |
| Private vulnerability reporting | GitHub repo Settings | mục duy nhất còn phải bấm tay | [04-github-repo-settings.md](04-github-repo-settings.md) §5 |
| Secret lúc deploy Helm | tự tạo trên cluster | khi deploy lên k8s | [05-helm-secrets-deploy.md](05-helm-secrets-deploy.md) |

**Placeholder OAuth chạy được.** App boot và mọi thứ trừ nút "Đăng nhập với
Google/Microsoft" hoạt động bình thường với giá trị `placeholder-...`. Chỉ lấy
credential thật khi bạn thật sự cần thử luồng đó.

## 5. `NEXT_PUBLIC_*` — vòng đời khác hẳn

Next **nướng** biến `NEXT_PUBLIC_*` vào bundle **lúc build**, không đọc lúc chạy.
Hệ quả trực tiếp:

- Đặt `NEXT_PUBLIC_FOO` trong Deployment/Secret của k8s là **vô tác dụng** — image
  đã được build với giá trị cũ nướng sẵn bên trong.
- Đổi nó = build lại image, không phải `helm upgrade`.
- Đường đúng là `ARG` + `ENV` trong Dockerfile, truyền qua `--build-arg`, và CI
  phải truyền nó ở bước build image.

Vì vậy **P0 không có biến `NEXT_PUBLIC_` nào**: mọi URL hiện tại đều same-origin,
nên phía trình duyệt không cần biết origin tuyệt đối. Cần một biến runtime cho
URL? Dùng biến server-side như `APP_URL` — chart đổi được bằng `helm upgrade` mà
không build lại.

Lần đầu thật sự cần là **P1**: URL WebSocket của terminal-gateway, thứ trình duyệt
buộc phải biết. Lúc đó nó đi qua build-arg, và `.env.example` đã có sẵn dòng
comment giữ chỗ.

## 6. Xử lý sự cố

| Triệu chứng | Nguyên nhân gần như chắc chắn |
|---|---|
| `POSTGRES_PASSWORD chưa đặt` lúc `make up` | chưa `cp .env.example .env` |
| `password authentication failed` (28P01) | mật khẩu trong `.env` ≠ mật khẩu trong `DATABASE_URL` |
| `Thiếu biến môi trường bắt buộc: X` | `apps/web/.env` thiếu `X` — xem `.env.example` |
| `env DATABASE_URL: bắt buộc nhưng chưa đặt` (Go) | đang chạy `go run` trần; dùng `make run-orchestrator` |
| Test xanh ở local, đỏ trên CI | thiếu biến trong `turbo.json tasks.test.env` (envMode STRICT lột nó). Tái hiện bằng `make test-ci` |
| Pod CrashLoop sau `helm upgrade` | Helm cấp một biến `.env.example` không khai, hoặc thiếu biến bắt buộc — `pnpm env:check` bắt cái đầu |
| `WRONGPASS` từ Redis | `REDIS_PASSWORD` trong `.env` ≠ mật khẩu trong `REDIS_URL` |
| `BetterAuthError: Failed to decrypt private key` | `BETTER_AUTH_SECRET` đã đổi nhưng bảng `jwks` vẫn giữ private key mã hoá bằng secret **cũ**. Hoặc trả lại secret cũ, hoặc xoá sạch hàng trong `jwks` (`psql -c 'DELETE FROM jwks;'`) để Better Auth sinh lại. Xem thêm chú thích ở target `test-ci` trong Makefile |

> **`BETTER_AUTH_SECRET` không phải một biến bình thường** — nó là khoá mã hoá của
> một thứ đã nằm trong DB. Đổi nó mà không dọn `jwks` là hỏng, và thông báo lỗi
> không hề nhắc tới env. Đây là lý do `make test-ci` cố ý **không** nạp secret của
> CI đè lên secret local.
