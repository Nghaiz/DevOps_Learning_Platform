# Xong

Ban vua dung ba thu chi co nghia khi cum co nhieu hon mot node:

- **`kubectl get nodes`** — so node la mot con so quan sat duoc, khong phai gia dinh.
- **nhan + `nodeSelector`** — ghim workload xuong dung cho ban chon. Tren cum mot
  node, dong YAML nay khong lam gi ca va ban se khong bao gio biet no sai.
- **DaemonSet + `tolerations`** — "moi node mot ban sao" la mot phep dem; va
  taint cua control-plane la ly do pho bien nhat khien phep dem ay ra thieu.

Dieu dang mang di: rat nhieu cau hinh Kubernetes **trong dung** tren cum mot
node. Cach duy nhat de biet chung co dung khong la chay tren cum nhieu node -
dung viec ban vua lam.
