# DaemonSet — moi node mot ban sao

Mot `Deployment` noi *"cho toi N ban sao, o dau cung duoc"*. Mot `DaemonSet` noi
*"cho toi dung mot ban sao tren **moi** node"* — so ban sao khong do ban dat ma
do **so node** quyet dinh.

Do la ly do DaemonSet chi chung minh duoc dieu gi do tren cum nhieu node.

Tao file `ds.yaml`:

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

> `tolerations: [{operator: Exists}]` cho phep Pod dat len **ca** node
> control-plane, von thuong mang taint day workload di. Khong co dong do thi
> DaemonSet chi dat 1/2 va con so se khien ban tuong cum hong.

Xem ket qua:

```
kubectl get daemonset probe
kubectl get pods -l app=probe -o wide
```

**Buoc nay dat khi** DaemonSet `probe` bao **desired = 2 va ready = 2**, va hai
Pod nam tren **hai node khac nhau**.
