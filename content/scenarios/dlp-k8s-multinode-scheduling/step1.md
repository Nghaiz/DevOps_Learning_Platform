# Hai node, khong phai mot

Xem cum cua ban co gi:

```
kubectl get nodes -o wide
```

Ban se thay **hai** dong. Mot node mang vai tro `control-plane` (noi apiserver,
scheduler va controller-manager chay), mot node khong mang vai tro do — do la
node phu, noi workload thuong duoc dat xuong.

Loc rieng node KHONG phai control-plane:

```
kubectl get nodes -l '!node-role.kubernetes.io/control-plane'
```

**Buoc nay dat khi ca hai node deu `Ready`.** Khong can tao gi.

> Neu chi thay mot node: node phu chua dang ky xong. Cho them roi bam Kiem tra.
