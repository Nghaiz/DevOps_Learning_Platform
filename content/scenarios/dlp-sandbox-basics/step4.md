# Sandbox bị cô lập mạng

Bước này không yêu cầu bạn sửa gì — nó yêu cầu bạn **quan sát**.

Pod chạy bài học nằm dưới một `NetworkPolicy` mặc định từ chối, chỉ mở đúng hai
đường: DNS đi ra, và kết nối vào từ terminal gateway. Nghĩa là không có Internet,
và cũng không truy cập được các dịch vụ nội bộ của cụm.

Thử gọi endpoint metadata của máy chủ — địa chỉ mà một container thoát ra ngoài
sẽ nhắm tới đầu tiên để lấy thông tin đám mây:

```
curl -s --max-time 3 http://169.254.169.254/ ; echo "exit=$?"
```{{exec}}

Lệnh sẽ hết giờ và trả mã khác 0. Đó là kết quả **đúng**.

Vì sao điều này quan trọng: bạn có quyền root trong sandbox, và có cả Docker. Nếu
pod ra được mạng nội bộ của cụm, quyền root đó sẽ với tới được những thứ không
thuộc về bài học. Lớp cô lập là thứ khiến việc phát root cho người học trở nên an
toàn.

Bấm **Kiểm tra** — phép kiểm ở bước này khẳng định rằng kết nối **thất bại**.
