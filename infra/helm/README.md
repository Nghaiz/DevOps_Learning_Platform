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

```bash
helm lint infra/helm/platform
helm template infra/helm/platform -f infra/helm/platform/values-selfhost.yaml
helm upgrade --install platform infra/helm/platform -f infra/helm/platform/values-selfhost.yaml
kubectl get pods   # web/orchestrator/gateway Running
```

Không có ingress controller ở P0 (Traefik tới ở P3) — Service `ClusterIP`, trừ
`web` là `NodePort` trong `values-selfhost.yaml` để poke thủ công từ máy dev.
