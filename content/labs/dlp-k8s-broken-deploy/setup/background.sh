#!/bin/bash
# Chạy ẨN, dựng CẢ 5 vật hỏng cùng lúc — mỗi task một Deployment/Service
# RIÊNG, không con nào phụ thuộc con khác. Cùng lý do dlp-linux-triage không
# gắn setup theo từng task: thứ tự làm bài là tuỳ người học, một setup gắn
# với task thứ n sẽ chạy hoặc không chạy tuỳ đường đi.
#
# Toàn bộ dùng `kubectl apply` (không `kubectl create`) để idempotent — script
# này an toàn chạy lại nếu setup bị gọi hai lần.
set -euo pipefail

mkdir -p /root/lab-k8s

# Cụm con dựng NỀN ngay lúc pod khởi động (xem images/sandbox-base/
# entrypoint.sh); chờ ở đây là chờ NỐT phần còn lại nếu boot chậm hơn thường lệ.
#
# ⛔ 90, KHÔNG phải 240. Bản trước để 240 với lý do "lượt gọi NÀY chạy nền,
# không tính vào trần 120s của một lượt Chấm" — tiền đề đó đúng khi setup của
# lab chưa hề được chạy. Từ khi `labs.startAttempt` chạy setup thật, nó đi qua
# ĐÚNG đường `/exec/session/{id}` mà lượt Chấm dùng, nên trần 120s
# (`gateway.execTimeout`) áp vào đây y hệt.
#
# Để 240 thì gateway giết exec ở 120s TRƯỚC khi vòng chờ kịp hết giờ, và câu
# báo lỗi ngay dưới — câu duy nhất nói ra nguyên nhân thật — trở thành mã chết:
# người học chỉ nhận được "Script chuẩn bị môi trường thất bại (exit …)", không
# biết là do cụm con chưa lên. 90s nằm gọn trong 120s và vẫn chừa chỗ cho 5 lượt
# `kubectl apply` bên dưới.
#
# Đo trên cụm thật 2026-09-09, hai lượt pod k8s LẠNH qua đường sản phẩm: toàn bộ
# script này mất 26.1s (node vừa boot 2 phút, load 2.5) và 17.1s (node đã lắng).
# Phần lớn thời gian đó chính là vòng chờ này, nên 90s là dư ~3–5 lần chứ không
# sát nút.
if ! dlp-k8s-wait 90; then
  echo "Cum Kubernetes con khong san sang sau 90s — khong dung duoc lab nay" >&2
  exit 1
fi

# ── Task fix-image-tag: tag image khong ton tai ─────────────────────────────
cat <<'EOF' | kubectl apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken-image
  labels: {app: broken-image}
spec:
  replicas: 1
  selector: {matchLabels: {app: broken-image}}
  template:
    metadata: {labels: {app: broken-image}}
    spec:
      containers:
        - name: web
          image: nginx:1.29.0-khong-ton-tai
EOF

# ── Task fix-configmap-mount: mount mot ConfigMap chua he ton tai ──────────
cat <<'EOF' | kubectl apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken-configmap
  labels: {app: broken-configmap}
spec:
  replicas: 1
  selector: {matchLabels: {app: broken-configmap}}
  template:
    metadata: {labels: {app: broken-configmap}}
    spec:
      containers:
        - name: web
          image: nginx:1.29.0
          volumeMounts:
            - name: html
              mountPath: /usr/share/nginx/html
      volumes:
        - name: html
          configMap:
            name: missing-html-config
EOF

# ── Task fix-service-selector: Service chon nham nhan, Endpoints rong ──────
cat <<'EOF' | kubectl apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken-selector
  labels: {app: broken-selector}
spec:
  replicas: 1
  selector: {matchLabels: {app: broken-selector}}
  template:
    metadata: {labels: {app: broken-selector}}
    spec:
      containers:
        - name: web
          image: nginx:1.29.0
          ports: [{containerPort: 80}]
---
apiVersion: v1
kind: Service
metadata:
  name: broken-selector-svc
spec:
  selector: {app: sai-nhan-hoan-toan}
  ports: [{port: 80, targetPort: 80}]
EOF

# ── Task fix-readiness-probe: probe goi sai duong dan ───────────────────────
cat <<'EOF' | kubectl apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken-probe
  labels: {app: broken-probe}
spec:
  replicas: 1
  selector: {matchLabels: {app: broken-probe}}
  template:
    metadata: {labels: {app: broken-probe}}
    spec:
      containers:
        - name: web
          image: nginx:1.29.0
          ports: [{containerPort: 80}]
          readinessProbe:
            httpGet: {path: /duong-dan-khong-ton-tai, port: 80}
            periodSeconds: 3
            failureThreshold: 2
EOF

# ── Task fix-service-port: Service chon dung Pod nhung sai targetPort ──────
cat <<'EOF' | kubectl apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken-port
  labels: {app: broken-port}
spec:
  replicas: 1
  selector: {matchLabels: {app: broken-port}}
  template:
    metadata: {labels: {app: broken-port}}
    spec:
      containers:
        - name: web
          image: nginx:1.29.0
          ports: [{containerPort: 80}]
---
apiVersion: v1
kind: Service
metadata:
  name: broken-port-svc
spec:
  selector: {app: broken-port}
  ports: [{port: 80, targetPort: 8080}]
EOF

echo ready > /root/lab-k8s/.setup-done
