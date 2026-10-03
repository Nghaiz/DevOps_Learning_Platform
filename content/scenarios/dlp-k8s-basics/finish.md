# Xong bài

Giờ bạn đọc được `kubectl get pods -o wide`, tìm nguyên nhân trong phần `Events` của
`describe`, xem log và chạy lệnh trong một Pod, và biến một lệnh `kubectl run` thành
file YAML để đưa vào Git.

Thử thêm, không chấm: tạo một Pod `busybox:1.36` tên `once` với
`--restart=Never -- echo xong`. Cột `STATUS` của nó sẽ dừng ở `Completed` chứ không
phải `Running`, và `kubectl logs once` vẫn đọc được chữ "xong" sau khi container đã
thoát. Đoán trước xem vì sao rồi mới chạy.

Bài tiếp theo: **Deployment: nhân bản, cập nhật, quay lui**, nơi Pod bị xoá sẽ tự
quay lại.
