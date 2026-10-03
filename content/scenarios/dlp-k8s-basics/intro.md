# Cụm đầu tiên

Ticket đầu tiên trong ca trực của bạn chỉ có một dòng: "`kubectl get pods -n shop`
báo `CrashLoopBackOff`, xem giúp". Người viết coi như bạn đã biết Pod là gì, `-n`
để làm gì và đọc output ấy ra sao. Bài này lấp đúng khoảng trống đó, trên một cụm
thật chứ không phải ảnh chụp màn hình.

Cụm là của riêng bạn: k3s một node, dựng trong sandbox lúc bạn mở bài và biến mất
khi phiên kết thúc, nên cứ phá thoải mái. Xong bài, bạn đọc được trạng thái của node
và Pod, chui vào một Pod để xem nó đang làm gì, và viết được file YAML đầu tiên thay
vì phải nhớ cờ của từng lệnh. Terminal bên cạnh đang chờ cụm khởi động; khi nó báo
sẵn sàng thì bắt đầu.
