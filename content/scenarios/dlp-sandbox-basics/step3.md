Có những lệnh không bao giờ tự kết thúc: theo dõi một tệp log, chờ kết nối, một vòng lặp viết hỏng. Máy này có sẵn một lệnh như thế tên `dong-ho`, in giờ mỗi giây. Khối dưới đây chỉ để chép, không chạy khi bấm. Gõ hoặc dán nó vào terminal rồi Enter:

```
dong-ho
```{{copy}}

Dấu nhắc biến mất và terminal không nhận lệnh mới: shell đang chờ `dong-ho` chạy xong, mà nó thì không bao giờ xong. Bấm **Ctrl+C**. Phím này gửi tín hiệu `SIGINT` tới chương trình đang chạy ở phía trước, và chương trình tử tế sẽ dừng. `dong-ho` in một dòng xác nhận trước khi thoát, rồi dấu nhắc quay lại.

Người quen Windows hay vấp chỗ này: trong terminal, Ctrl+C là dừng lệnh, không phải chép chữ. Bấm nó để chép một dòng output là ngắt luôn thứ đang chạy.

Giờ làm màn hình rối lên một chút:

`ls -la /usr/bin | head -n 40`{{exec}}

Bấm **Ctrl+L**. Màn hình được lau sạch, dấu nhắc lên đầu, còn lịch sử lệnh vẫn nguyên. Lệnh `clear` làm đúng việc đó, chỉ dài hơn bốn phím.

Còn một phím nên biết để tránh: Ctrl+D ở dấu nhắc trống nghĩa là "hết dữ liệu vào", và shell hiểu đó là lệnh thoát.
