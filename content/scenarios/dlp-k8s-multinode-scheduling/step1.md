# Hai node, không phải một

Xem cụm của bạn có gì:

```
kubectl get nodes -o wide
```

Bạn sẽ thấy **hai** dòng. Một node mang vai trò `control-plane` (nơi apiserver,
scheduler và controller-manager chạy), một node không mang vai trò đó. Đó là
node phụ, nơi workload thường được đặt xuống.

Lọc riêng node KHÔNG phải control-plane:

```
kubectl get nodes -l '!node-role.kubernetes.io/control-plane'
```

**Bước này đạt khi cả hai node đều `Ready`.** Không cần tạo gì.

> Nếu chỉ thấy một node: node phụ chưa đăng ký xong. Chờ thêm rồi bấm Kiểm tra.
