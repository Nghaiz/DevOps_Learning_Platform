# `infra/k8s` — chỗ dành sẵn

Manifest thô không nằm trong Helm chart: `RuntimeClass` gVisor/Kata (tier2),
`NetworkPolicy` deny-all + chặn metadata endpoint, `ResourceQuota`/`LimitRange`
cho namespace sandbox.

`RuntimeClass sysbox-runc` **không** thuộc về đây — daemonset cài Sysbox tự tạo nó
([`infra/host/03-sysbox-install.sh`](../host/03-sysbox-install.sh)); dựng tay bản thứ hai
sẽ đá nhau với daemonset.

Nội dung thật vào ở **P1** (quota, NetworkPolicy) và **P3** (hardening đầy đủ).
