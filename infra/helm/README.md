# `infra/helm` — chart `platform`

Chart [`platform/`](platform/) deploy web + orchestrator + terminal-gateway lên
cluster kubeadm 1-node (self-host) hoặc cloud multi-node.

Đây là **task 27 của 0.F** trong [phase-0.md](../../plans/devops-learning-platform/phase-0.md).
Bootstrap host + cluster + Sysbox (task 24–26) xong ở [`infra/host/`](../host/README.md),
cổng `04-verify-sysbox.sh` đã xanh. 3 service trong chart này là pod THƯỜNG (không
qua `RuntimeClass sysbox-runc`) — sandbox pod (Sysbox) là chuyện của P1.

## Values

| File | Dùng khi |
|---|---|
| `values.yaml` | Mặc định "cloud-shaped" (replica 2, `imagePullPolicy: IfNotPresent`) |
| `values-selfhost.yaml` | VM kubeadm 1-node lab (`imagePullPolicy: Never` — image import thẳng qua `ctr images import`, không có registry) |
| `values-cloud.yaml` | Giữ chỗ node-pool/toleration cho cloud multi-node — chưa có cluster cloud thật nên gần như trống |

## Deploy (self-host)

Điều kiện trước: [`../host/05-cluster-addons.sh`](../host/05-cluster-addons.sh) đã chạy —
kubeadm **không** cài StorageClass nào, và không có nó thì PVC của Postgres/Redis
Pending vĩnh viễn.

```bash
helm lint infra/helm/platform
helm template infra/helm/platform -f infra/helm/platform/values-selfhost.yaml

# Lần ĐẦU (chưa có release):
helm upgrade --install platform infra/helm/platform \
  -f infra/helm/platform/values-selfhost.yaml \
  --set web.env.betterAuthSecret="$(openssl rand -hex 32)" \
  --set datastore.postgres.password="$(openssl rand -hex 24)" \
  --set datastore.redis.password="$(openssl rand -hex 24)"

kubectl get pods,pvc   # web/orchestrator/gateway/postgres/redis Running, PVC Bound
```

### ⛔ Nâng cấp: `--reset-then-reuse-values`, KHÔNG PHẢI `--reuse-values`

```bash
helm upgrade platform infra/helm/platform --reset-then-reuse-values \
  -f infra/helm/platform/values-selfhost.yaml
```

`--reuse-values` lấy values của release CŨ làm gốc và **không nạp default mới của
chart**. Nên ngay khi chart thêm một khối values mới (`ingress`, `datastore`, …),
`--reuse-values` sẽ nổ:

```
Error: UPGRADE FAILED: template: platform/templates/ingress.yaml:1:14:
  executing … at <.Values.ingress.enabled>: nil pointer evaluating interface {}.enabled
```

Template **cố ý không** có nil-guard cho những khối này. Một `{{- if and .Values.x
.Values.x.enabled }}` sẽ biến "values thiếu" thành "tính năng tắt trong im lặng" —
tức là ingress không được tạo, cookie không tới gateway, và không có thông báo nào.
Nổ ngay lúc `helm upgrade` là hành vi đúng.

`--reset-then-reuse-values` reset về default của chart rồi áp lại values người dùng
đã đặt ở lần release trước — nhờ đó mật khẩu truyền bằng `--set` ở lần đầu vẫn được
giữ qua các lần nâng cấp sau.

### ⛔ Xoay mật khẩu: đừng sinh lại mật khẩu Postgres ở mỗi lần upgrade

`POSTGRES_PASSWORD` chỉ có tác dụng **lúc `initdb`** chạy trên `PGDATA` rỗng. PVC
mang `helm.sh/resource-policy: keep`, nên từ lần thứ hai trở đi DB giữ **nguyên**
mật khẩu cũ. Lặp lại lệnh cài lần đầu (có `--set … "$(openssl rand -hex 24)"`) khi
nâng cấp sẽ:

1. sinh mật khẩu mới → Secret đổi → checksum đổi → orchestrator + web rollout,
2. với `DATABASE_URL` mà DB **không** chấp nhận → `28P01` toàn hệ thống,
3. trong khi `helm upgrade` báo **thành công**.

Nên: lần đầu truyền `--set`, các lần sau dùng `--reset-then-reuse-values` và
**không** truyền lại. Muốn xoay thật thì `ALTER ROLE dlp WITH PASSWORD '…'` trên DB
trước, rồi mới đổi Secret. Redis không dính vì `--requirepass $(REDIS_PASSWORD)`
đọc lại mỗi lần container start.

### Migration schema

Chart **không** chạy migration. Sau khi Postgres in-cluster lên lần đầu:

```bash
kubectl -n default port-forward svc/platform-postgres 15432:5432 &
DATABASE_URL="$(kubectl -n default get secret platform-datastore \
  -o jsonpath='{.data.DATABASE_URL}' | base64 -d \
  | sed 's|@platform-postgres:5432|@127.0.0.1:15432|')" \
  pnpm --filter @devops-platform/web db:migrate
```

Không có bước này thì bảng `jwks` của Better Auth không tồn tại và
`/api/auth/jwks` — nguồn khoá mà terminal-gateway verify sandbox token
(phase-1 D15) — trả 500.

## Ingress

`ingress.enabled` **tắt mặc định**. Nó gộp `/` (web) và `/ws/*` (gateway) về **một
origin** — điều kiện sống của cookie `dlp_sandbox` (`SameSite=Strict`, host-only,
xem [`docs/ws-terminal-protocol.md`](../../docs/ws-terminal-protocol.md) §2), không
phải tiện nghi vận hành.

Cluster lab chưa có ingress controller (Traefik tới ở P3) — bật cờ trên cluster
không có controller thì Ingress được tạo, không báo lỗi, và không định tuyến gì cả.
Ở dev, việc gộp origin do Caddy đảm nhiệm: `docker compose --profile proxy up -d`
([`infra/dev/Caddyfile`](../dev/Caddyfile)).

Service còn lại là `ClusterIP`, trừ `web` là `NodePort` trong `values-selfhost.yaml`
để poke thủ công từ máy dev.
