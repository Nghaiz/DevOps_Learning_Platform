Đường dẫn `/root/kho/bao-cao-van-hanh-thang-09-ban-chot/doc-truoc.txt` dài 58 ký tự. Gõ tay từng chữ thì chậm, và thế nào cũng sai một gạch nối. Người làm lâu năm chỉ gõ chừng mười phím cho cùng việc đó, phần còn lại để phím **Tab** lo.

Bước này đừng bấm khối lệnh. Đặt con trỏ vào terminal và gõ tay:

1. Gõ `cat ~/kho/b` rồi bấm Tab. Shell điền nốt `bao-cao-van-hanh-thang-09-ban-chot/`, vì trong `kho` chỉ có một thứ tên bắt đầu bằng `b`.
2. Gõ tiếp `d`, bấm Tab lần nữa, rồi Enter.

Tab không điền gì nghĩa là có nhiều thứ cùng đầu. Bấm Tab thêm lần nữa, zsh hiện danh sách để bạn chọn bằng phím mũi tên, hoặc gõ thêm một hai chữ cho rõ.

Ghi chú bảo phải tạo tệp `da-doc.txt` ngay trong thư mục đó. Đừng gõ lại từ đầu: bấm **mũi tên lên** để gọi lại lệnh `cat` vừa chạy, sửa `cat` thành `touch` và `doc-truoc.txt` thành `da-doc.txt`, rồi Enter. Ctrl+A nhảy về đầu dòng, Ctrl+E về cuối dòng, đỡ phải giữ phím mũi tên trái.

Mọi lệnh bạn đã chạy đều nằm trong lịch sử:

`history | tail -n 5`{{exec}}

Lịch sử dài vài trăm dòng thì bấm Ctrl+R rồi gõ vài chữ của lệnh cũ, zsh tìm ngược giúp bạn. Tạo xong `da-doc.txt` thì bấm Kiểm tra.
