# Secret khi deploy Helm

Cách đưa credential vào cluster mà không để nó nằm lại trong git, trong shell
history, hay trong `helm get values`.

## Hai đường, chọn đúng đường

| | `--set` / `-f values-secrets.yaml` | `existingSecret` |
|---|---|---|
| Dùng cho | dev, VM lab, thử nhanh | **mọi thứ có user thật** |
| Giá trị nằm ở đâu | release Secret của Helm **và** trong `helm get values` | chỉ trong Secret bạn tự tạo |
| Chart có chạm giá trị không | có | **không** |
| Xoay secret | `helm upgrade` lại | `kubectl` sửa Secret, rollout lại |

Lý do `existingSecret` thắng: **`helm get values <release>` in ra nguyên văn mọi
giá trị bạn từng truyền vào**, và ai đọc được release Secret của Helm trong
namespace thì chạy được lệnh đó. Truyền qua `--set` là secret nằm thêm ở một chỗ
nữa — cộng với shell history, và cộng với log CI nếu deploy từ pipeline.

## Đường A — self-host / VM lab (`--set`)

Đủ tốt cho cluster kubeadm 1-node trong `infra/host/`:

```bash
helm upgrade --install platform infra/helm/platform \
  -f infra/helm/platform/values-selfhost.yaml \
  --set web.env.betterAuthSecret="$(openssl rand -hex 32)"
```

`betterAuthSecret` **bắt buộc** (chart khai `required`) — cố ý: không có default
nghĩa là không có cách nào vô tình deploy bằng một secret nằm sẵn trong git.

> `$(openssl rand -hex 32)` sinh secret **mới mỗi lần chạy lệnh**, tức mỗi
> `helm upgrade` là một lần đăng xuất toàn bộ user. Chấp nhận được ở lab. Ở
> bất cứ đâu khác thì sinh một lần, lưu lại, và dùng đường B.

Nhiều giá trị hơn thì dùng file (đã gitignore):

```bash
cp infra/helm/platform/values-secrets.example.yaml \
   infra/helm/platform/values-secrets.yaml
# điền giá trị, rồi:
helm upgrade --install platform infra/helm/platform \
  -f infra/helm/platform/values-selfhost.yaml \
  -f infra/helm/platform/values-secrets.yaml
```

## Đường B — production (`existingSecret`)

### 1. Tạo Secret ngoài băng

```bash
kubectl create secret generic dlp-web-prod \
  --namespace dlp \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  --from-literal=GOOGLE_CLIENT_SECRET='<từ Google Cloud Console>' \
  --from-literal=MICROSOFT_CLIENT_SECRET='<cột Value của Entra>'
```

**Ba tên khoá phải chính xác như trên** — chart tham chiếu đúng chúng qua
`secretKeyRef` ([web-deployment.yaml](../../infra/helm/platform/templates/web-deployment.yaml)).
Sai tên khoá thì pod ở `CreateContainerConfigError` chứ không phải lỗi rõ ràng.

> `kubectl create secret --from-literal` để giá trị lại trong shell history.
> Nghiêm túc hơn thì dùng `--from-file`, hoặc External Secrets Operator / Sealed
> Secrets kéo thẳng từ vault. Ngoài phạm vi P0, nhưng biết trước để không nhầm
> tưởng bước này đã là "đúng chuẩn prod".

### 2. Trỏ chart vào nó

```bash
helm upgrade --install platform infra/helm/platform \
  --namespace dlp \
  --set web.env.existingSecret=dlp-web-prod \
  --set web.env.betterAuthUrl=https://dlp.example.com \
  --set web.env.appUrl=https://dlp.example.com \
  --set web.env.corsAllowedOrigins=https://dlp.example.com \
  --set web.env.googleClientId='<không phải secret>' \
  --set web.env.microsoftClientId='<không phải secret>'
```

Đặt `existingSecret` thì chart **không** sinh Secret và **không** đòi
`betterAuthSecret`. CI kiểm chính xác nhánh này (job `infra` trong ci.yml).

### 3. Kiểm

```bash
kubectl -n dlp get pods
kubectl -n dlp exec deploy/platform-web -- printenv | grep -c BETTER_AUTH_SECRET  # => 1
helm -n dlp get values platform | grep -i secret   # => chỉ thấy TÊN, không thấy giá trị
```

## Giới hạn — nói thẳng

**Secret của Kubernetes là base64, không phải mã hoá.** Ai đọc được Secret trong
namespace thì đọc được giá trị. `existingSecret` giúp giá trị không rò qua
`helm get values` / log CI / shell history của bạn — nó **không** biến k8s Secret
thành vault.

Muốn chặt hơn:

- bật encryption-at-rest cho etcd (cấu hình phía cluster)
- RBAC siết `get secrets` trong namespace
- External Secrets Operator hoặc Sealed Secrets, giá trị thật nằm ở vault ngoài

## Xoay secret

| Secret | Cách xoay | Ảnh hưởng |
|---|---|---|
| `BETTER_AUTH_SECRET` | sửa Secret → `kubectl rollout restart deploy/platform-web` | **mọi user bị đăng xuất ngay** |
| OAuth client secret | xoay ở Google/Azure trước, rồi sửa Secret, rồi rollout | luồng OAuth đang chạy dở sẽ lỗi |
| DB / Redis | đổi ở data store trước, rồi sửa Secret, rồi rollout | pod lỗi kết nối tới khi rollout xong |

Luôn `rollout restart` sau khi sửa Secret: pod đọc biến môi trường **một lần lúc
khởi động**, không theo dõi Secret thay đổi.
