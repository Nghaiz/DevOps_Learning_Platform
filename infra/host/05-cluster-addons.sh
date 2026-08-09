#!/usr/bin/env bash
# 05-cluster-addons.sh — addon cấp CLUSTER, không thuộc Helm chart của nền tảng.
#
# Ba thứ, cả ba đều là điều kiện để P1 chạy được:
#
#   1. local-path-provisioner — kubeadm KHÔNG cài StorageClass nào. Không có nó
#      thì PVC của Postgres/Redis (infra/helm/platform/templates/datastore-*.yaml)
#      Pending vĩnh viễn với "no persistent volumes available".
#   2. CronJob vá token CNI Calico 12h  (infra/k8s/cni-token-refresh.yaml, R0)
#   3. Canary tạo-pod 30 phút           (infra/k8s/cni-canary.yaml)
#
# VÌ SAO KHÔNG NHÉT VÀO HELM CHART: chart `platform` deploy ứng dụng. StorageClass
# là hạ tầng cluster, và ds/calico-node nằm trong kube-system — cả hai đều sống
# lâu hơn và độc lập với vòng đời release của ứng dụng. `helm uninstall platform`
# không được phép gỡ CNI của cluster.
#
# Chạy lại được nhiều lần (kubectl apply idempotent).
#
#   bash 05-cluster-addons.sh
#   SKIP_STORAGE=1 bash 05-cluster-addons.sh    # cluster đã có StorageClass rồi

set -euo pipefail
cd "$(dirname "$0")"

K8S_DIR="../k8s"
SKIP_STORAGE="${SKIP_STORAGE:-0}"

# Ghim version. `master`/`latest` nghĩa là hai lần chạy cách nhau một tuần dựng
# ra hai cluster khác nhau, và bản dựng lại sau sự cố sẽ không giống bản đang hỏng.
LOCAL_PATH_VERSION="${LOCAL_PATH_VERSION:-v0.0.37}"
LOCAL_PATH_URL="https://raw.githubusercontent.com/rancher/local-path-provisioner/${LOCAL_PATH_VERSION}/deploy/local-path-storage.yaml"
# sha256 của manifest tại ĐÚNG version trên. Đổi version = phải đổi dòng này.
LOCAL_PATH_SHA256="${LOCAL_PATH_SHA256:-9781b39c24f3f651bd6d6e41b561e04e4904bbdb6d4f8c7a6009df3a702dcd65}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

if [ "$SKIP_STORAGE" = "1" ]; then
  step "BỎ QUA local-path-provisioner (SKIP_STORAGE=1)"
else
  step "local-path-provisioner ${LOCAL_PATH_VERSION} — StorageClass 'local-path'"
  # Tải rồi VERIFY CHECKSUM, không `kubectl apply -f <URL>` thẳng: tag Git là
  # mutable, và manifest này tạo ClusterRole + Deployment chạy trên node. Ghim
  # version giải quyết tính tái lập, không giải quyết tính toàn vẹn — cùng lý do
  # phase-1 E3 từ chối `curl … | bash` và bắt ghim version + sha256.
  #
  # Đổi version thì phải đổi cả hash. Lấy hash mới:
  #   curl -sL <URL> | sha256sum
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  curl -fsSL "$LOCAL_PATH_URL" -o "$tmp"
  echo "${LOCAL_PATH_SHA256}  ${tmp}" | sha256sum -c - \
    || { echo "CHECKSUM KHÔNG KHỚP — manifest đã đổi kể từ lần ghim. DỪNG."; exit 1; }
  kubectl apply -f "$tmp"
  kubectl -n local-path-storage rollout status deploy/local-path-provisioner --timeout=180s
fi

step "CronJob vá token CNI Calico (mỗi 12h)"
kubectl apply -f "$K8S_DIR/cni-token-refresh.yaml"

# ÉP CHẠY NGAY MỘT LẦN. `kubectl apply` chỉ tạo lịch — lần chạy đầu có thể tới
# 12h sau. Chạy script này trên một cluster đã sống > 24h (token đã hết hạn) mà
# không ép chạy nghĩa là mọi thứ tạo pod sau đó — gồm cả cổng P0.F ở bước 4 của
# setup-all.sh — vẫn đỏ với FailedCreatePodSandBox, đúng thứ bước này sinh ra để
# tránh.
step "Ép chạy job vá NGAY (không chờ lịch)"
BOOTSTRAP_JOB="bootstrap-$(date +%s)"
kubectl -n kube-system create job --from=cronjob/dlp-calico-token-refresh "$BOOTSTRAP_JOB"
kubectl -n kube-system wait --for=condition=Complete "job/$BOOTSTRAP_JOB" --timeout=180s
kubectl -n kube-system rollout status daemonset/calico-node --timeout=180s
kubectl -n kube-system delete job "$BOOTSTRAP_JOB" --ignore-not-found

# Canary tạo pod TRONG dlp-sandbox, nên namespace đó phải tồn tại trước — nó do
# Helm chart tạo. Chạy script này trước `helm install` là chuyện bình thường
# (thứ tự đúng của lần dựng đầu tiên), nên bỏ qua có thông báo rõ thay vì fail.
step "Canary tạo-pod (mỗi 30 phút)"
if kubectl get namespace dlp-sandbox >/dev/null 2>&1; then
  kubectl apply -f "$K8S_DIR/cni-canary.yaml"
else
  printf '\033[33m  namespace dlp-sandbox chưa tồn tại — bỏ qua canary.\n'
  printf '  Chạy lại script này SAU `helm upgrade --install platform ...`.\033[0m\n'
fi

step "Kiểm lại"
kubectl get storageclass
kubectl -n kube-system get cronjob dlp-calico-token-refresh
kubectl -n dlp-sandbox get cronjob dlp-cni-canary 2>/dev/null || true

printf '\n\033[1;32mAddon đã cài.\033[0m\n'
printf 'Ép chạy ngay để kiểm (không cần chờ lịch):\n'
printf '  kubectl -n kube-system create job --from=cronjob/dlp-calico-token-refresh refresh-now\n'
printf '  kubectl -n dlp-sandbox create job --from=cronjob/dlp-cni-canary canary-now\n\n'
