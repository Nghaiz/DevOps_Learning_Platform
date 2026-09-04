# Nhan + nodeSelector — ghim Pod xuong node ban chon

Tren cum mot node, `nodeSelector` la mot dong YAML khong lam gi ca: chi co mot
cho de dat. O day thi khac.

**1. Tim node KHONG phai control-plane:**

```
kubectl get nodes -l '!node-role.kubernetes.io/control-plane'
```

**2. Gan nhan cho no** (thay `<TEN_NODE>` bang ten vua tim duoc):

```
kubectl label node <TEN_NODE> dlp-vaitro=worker
```

**3. Tao mot Pod ghim xuong dung node mang nhan do:**

```
kubectl run pinned --image=nginx:1.29.0 --overrides='{"spec":{"nodeSelector":{"dlp-vaitro":"worker"}}}'
```

**4. Xem no that su nam o dau:**

```
kubectl get pod pinned -o wide
```

**Buoc nay dat khi** Pod `pinned` dang `Running` **tren node mang nhan
`dlp-vaitro=worker`**, va node do **khong** phai control-plane.

> Neu Pod ket o `Pending`: `kubectl describe pod pinned` se noi thang
> `didn't match Pod's node affinity/selector` — nghia la chua node nao mang nhan.
