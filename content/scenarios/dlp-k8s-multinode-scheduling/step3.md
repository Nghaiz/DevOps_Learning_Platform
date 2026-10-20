# DaemonSet: mỗi node một bản sao

Một `Deployment` nói *"cho tôi N bản sao, ở đâu cũng được"*. Một `DaemonSet` nói
*"cho tôi đúng một bản sao trên **mọi** node"*: số bản sao không do bạn đặt mà
do **số node** quyết định.

Đó là lý do DaemonSet chỉ chứng minh được điều gì đó trên cụm nhiều node.

Tạo file `ds.yaml`:

```
cat > ds.yaml <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: probe
spec:
  selector:
    matchLabels: { app: probe }
  template:
    metadata:
      labels: { app: probe }
    spec:
      tolerations:
        - operator: Exists
      containers:
        - name: probe
          image: nginx:1.29.0
EOF
kubectl apply -f ds.yaml
```

> `tolerations: [{operator: Exists}]` cho phép Pod đặt lên **cả** node
> control-plane, vốn thường mang taint đẩy workload đi. Không có dòng đó thì
> DaemonSet chỉ đạt 1/2 và con số sẽ khiến bạn tưởng cụm hỏng.

Xem kết quả:

```
kubectl get daemonset probe
kubectl get pods -l app=probe -o wide
```

**Bước này đạt khi** DaemonSet `probe` báo **desired = 2 và ready = 2**, và hai
Pod nằm trên **hai node khác nhau**.
