# Một cụm hai node, chạy thật

Sandbox của bạn đang chạy một cụm Kubernetes **hai node**: một `server` và một
`agent`, mỗi node là một container riêng, nối với nhau bằng một mạng riêng.

Vì sao điều đó đáng có một bài riêng: rất nhiều thứ trong Kubernetes **trông
như đúng** trên cụm một node rồi hỏng khi lên cụm thật. `nodeSelector` không ghim
gì cả khi chỉ có một chỗ để ghim. Một DaemonSet "chạy trên mọi node" mà chỉ có
một node thì không phân biệt được với một Deployment `replicas: 1`.

Ba bước dưới đây đều **cho ra kết quả khác** nếu cụm chỉ có một node. Đó là chủ
đích: bài này chỉ có nghĩa khi có node thứ hai.

Cụm cần khoảng một phút để cả hai node báo `Ready`. Terminal sẽ chờ giúp bạn.
