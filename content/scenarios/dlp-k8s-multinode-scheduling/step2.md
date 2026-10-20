# Nhãn và nodeSelector: ghim Pod xuống node bạn chọn

Trên cụm một node, `nodeSelector` là một dòng YAML không làm gì cả: chỉ có một
chỗ để đặt. Ở đây thì khác.

**1. Tìm node KHÔNG phải control-plane:**

```
kubectl get nodes -l '!node-role.kubernetes.io/control-plane'
```

**2. Gắn nhãn cho nó** (thay `<TEN_NODE>` bằng tên vừa tìm được):

```
kubectl label node <TEN_NODE> dlp-vaitro=worker
```

**3. Tạo một Pod ghim xuống đúng node mang nhãn đó:**

```
kubectl run pinned --image=nginx:1.29.0 --overrides='{"spec":{"nodeSelector":{"dlp-vaitro":"worker"}}}'
```

**4. Xem nó thật sự nằm ở đâu:**

```
kubectl get pod pinned -o wide
```

**Bước này đạt khi** Pod `pinned` đang `Running` **trên node mang nhãn
`dlp-vaitro=worker`**, và node đó **không** phải control-plane.

> Nếu Pod kẹt ở `Pending`: `kubectl describe pod pinned` sẽ nói thẳng
> `didn't match Pod's node affinity/selector`, nghĩa là chưa node nào mang nhãn.
