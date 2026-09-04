# Mot cum hai node, chay that

Sandbox cua ban dang chay mot cum Kubernetes **hai node** — mot `server` va mot
`agent`, moi node la mot container rieng, noi voi nhau bang mot mang rieng.

Vi sao dieu do dang de co mot bai rieng: rat nhieu thu trong Kubernetes **trong
nhu dung** tren cum mot node roi hong khi len cum that. `nodeSelector` khong ghim
gi ca khi chi co mot cho de ghim. Mot DaemonSet "chay tren moi node" ma chi co
mot node thi khong phan biet duoc voi mot Deployment `replicas: 1`.

Ba buoc duoi day deu **cho ra ket qua khac** neu cum chi co mot node. Do la chu
dich: bai nay chi co nghia khi co node thu hai.

Cum can khoang mot phut de ca hai node bao `Ready`. Terminal se cho giup ban.
