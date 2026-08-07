# `infra/helm` — chỗ dành sẵn

Chart `platform` deploy web + orchestrator + terminal-gateway lên cluster kubeadm
1-node, với `values-selfhost.yaml` và chỗ giữ sẵn cho values cloud node pool.

Đây là **task 27 của 0.F** trong [phase-0.md](../../plans/devops-learning-platform/phase-0.md)
— chưa làm. Bootstrap host + cluster + Sysbox (task 24–26) đã xong ở
[`infra/host/`](../host/README.md) và cổng `04-verify-sysbox.sh` đã xanh.
