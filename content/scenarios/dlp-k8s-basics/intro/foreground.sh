echo "Cụm k3s đang khởi động ngay trong sandbox của bạn, thường mất 20 đến 70 giây. Đọc phần giới thiệu trong lúc chờ."
dlp-k8s-wait 90 && kubectl -n kube-system wait --for=condition=Available deployment/coredns --timeout=60s >/dev/null && echo "Cụm đã sẵn sàng và kubectl đã trỏ vào nó. Sang bước 1 được rồi." || echo "Cụm chưa lên kịp. Gõ dlp-k8s-wait 90 để chờ thêm rồi làm tiếp."
