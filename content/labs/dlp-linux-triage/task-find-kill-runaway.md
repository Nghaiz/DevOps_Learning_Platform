# Tìm và dừng tiến trình ngốn CPU

Ngay khi phiên lab khởi động, một tiến trình lạ đã bắt đầu chạy nền và ngốn hết
một lõi CPU. Việc của bạn: **tìm ra nó và dừng nó lại.**

## Tìm nó

Liệt kê tiến trình đang tốn CPU nhiều nhất:

```
ps aux --sort=-%cpu | head -10
```{{exec}}

Bạn sẽ thấy một dòng bất thường — CPU gần 100%, và cột lệnh (`CMD`) mang một
cái tên không giống lệnh hệ thống bình thường nào.

Không chắc dòng nào? Tìm trực tiếp theo tên:

```
pgrep -af runaway-worker
```{{exec}}

`pgrep -a` in cả PID lẫn dòng lệnh đầy đủ — hữu ích hơn `pgrep` trần khi bạn
cần xác nhận đúng tiến trình trước khi giết nó.

## Dừng nó

Có hai cách, cả hai đều đúng:

```
kill $(pgrep -f runaway-worker)
```{{exec}}

hoặc gọn hơn:

```
pkill -f runaway-worker
```{{exec}}

Xác nhận nó đã dừng thật — nếu tiến trình tự khởi động lại (một số script tệ
làm vậy), lệnh dưới đây sẽ vẫn thấy nó:

```
pgrep -af runaway-worker ; echo "exit=$?"
```{{exec}}

`exit=1` nghĩa là không tìm thấy tiến trình nào — đúng như bạn muốn.

> **Vì sao tìm theo TÊN chứ không theo PID?** PID chỉ đúng cho đúng một lần
> chạy; tên tiến trình (hoặc một phần dòng lệnh, qua `pgrep -f`) là thứ ổn định
> để mô tả "tiến trình nào" trong tài liệu vận hành, runbook, hay một câu hỏi
> bạn hỏi đồng nghiệp.

Bấm **Kiểm tra** khi bạn tin tiến trình đã dừng.
