# `infra/k8s` — manifest thô, ngoài Helm chart

Thứ nằm đây là **hạ tầng cấp cluster**, sống lâu hơn và độc lập với vòng đời
release của ứng dụng. `helm uninstall platform` không được phép gỡ chúng.

| File | Nội dung | Vì sao ngoài chart |
|---|---|---|
| [`cni-token-refresh.yaml`](cni-token-refresh.yaml) | CronJob 12h `rollout restart ds/calico-node` + RBAC hẹp | Sửa `ds/calico-node` trong `kube-system` — CNI của cluster, không phải của app |
| [`cni-canary.yaml`](cni-canary.yaml) | CronJob 30 phút tạo một pod sandbox thật để chứng minh cluster còn tạo được pod | Là phép kiểm hạ tầng, phải sống kể cả khi chart bị gỡ để debug |

Cài cả hai (kèm StorageClass): [`../host/05-cluster-addons.sh`](../host/05-cluster-addons.sh).

## Vì sao hai file, không phải một

`kubectl rollout restart` xanh **không chứng minh** cluster tạo được pod. Nó chỉ
nói pod `calico-node` mới đã Ready — không nói token trong
`/etc/cni/net.d/calico-kubeconfig` đã được ghi mới. Chế độ hỏng của R0 là **im
lặng**: node `Ready`, `calico-node` 1/1, mọi pod đang chạy vẫn chạy, và **chỉ pod
mới** mới chết với `FailedCreatePodSandBox … ClusterInformation: connection is
unauthorized`.

Nên bản vá và chuông báo là hai thứ khác nhau: một cái *ngăn*, một cái *phát
hiện khi ngăn không thành*. Có bản vá mà không có canary thì ta chỉ biết mình sai
đúng vào lúc một sinh viên bấm "Start".

## Ép chạy ngay, không chờ lịch

```bash
kubectl -n kube-system create job --from=cronjob/dlp-calico-token-refresh refresh-now
kubectl -n dlp-sandbox  create job --from=cronjob/dlp-cni-canary          canary-now

# Đọc kết quả
kubectl -n dlp-sandbox get jobs -l app.kubernetes.io/component=cni-canary
kubectl -n kube-system logs job/refresh-now
```

## Kiểm token còn bao lâu

```bash
sudo awk '/token:/{print $2}' /etc/cni/net.d/calico-kubeconfig \
  | cut -d. -f2 | base64 -d | tr ',' '\n' | grep exp
date +%s     # exp PHẢI lớn hơn số này
```

## Đây là bản vá, không phải fix

Fix thật là chuyển sang `tigera-operator` — nó chạy `install-cni` như container
thường nên kubelet xoay token bình thường. Bản vá này giữ cluster sống cho tới
lúc đó. Xem `plans/devops-learning-platform/phase-1.md` D5 + R0.

## Chỗ dành sẵn

`RuntimeClass` gVisor/Kata (tier 2) và phần hardening đầy đủ vào ở **P3**.

`RuntimeClass sysbox-runc` **không** thuộc về đây — daemonset cài Sysbox tự tạo nó
([`../host/03-sysbox-install.sh`](../host/03-sysbox-install.sh)); dựng tay bản thứ hai
sẽ đá nhau với daemonset.

`NetworkPolicy` / `ResourceQuota` / `LimitRange` của namespace sandbox cũng **không**
ở đây — chúng do Helm chart quản (`infra/helm/platform/templates/sandbox-*.yaml`),
vì giá trị của chúng thay đổi theo môi trường (`values-selfhost.yaml` vs
`values-cloud.yaml`), tức là chúng là cấu hình của release chứ không phải hằng số
của cluster.
