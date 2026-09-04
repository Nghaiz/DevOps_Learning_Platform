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
# entrypoint.sh); chờ ở đây là chờ NỐT phần còn lại nếu boot chậm hơn thường
# lệ — 240s là trần rộng có chủ ý, vì lượt gọi NÀY chạy nền, không tính vào
# trần 120s của một lượt Chấm.
if ! dlp-k8s-wait 240; then
  echo "Cum Kubernetes con khong san sang sau 240s — khong dung duoc lab nay" >&2
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
