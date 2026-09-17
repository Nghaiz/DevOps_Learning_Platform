---
id: 02-song-song-can-may-chay
title: Song song cần máy chạy
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c03-song-song-tren-may
---

Đồ thị cho bạn biết việc nào **được phép** chạy cùng lúc. Nó không nói việc nào **sẽ** chạy cùng lúc. Điều đó do số máy chạy quyết định.

Một tổ chức có thể khai sáu job kiểm thử độc lập, mỗi job năm phút, rồi ngạc nhiên vì đường ống vẫn mất mười lăm phút. Lý do nằm ở trang cấu hình runner: cả đội dùng chung hai máy tự quản lý, và bốn job còn lại ngồi trong hàng đợi.

## Sàn cứng là một phép chia

Khi máy khan hiếm, tổng công việc chia cho số máy là giới hạn dưới của phần việc song song. Ba mươi phút việc trên hai máy không thể xong trong ít hơn mười lăm phút, dù đồ thị trông phẳng đến đâu. Cách chia stage không phá được phép chia đó.

Nên khi đường ống chậm, chỉ có ba thứ đổi được:

1. **Tổng công việc**: bỏ việc thừa, hoặc làm mỗi việc rẻ đi.
2. **Số máy**: thêm runner. Lead time giảm, nhưng chi phí máy tăng.
3. **Hình dạng đồ thị**: chỉ giúp khi đường ống đang xếp hàng vô cớ. Khi đồ thị đã phẳng, sửa tiếp không còn đổi được gì.

Cách thứ ba rẻ nhất và cũng hết tác dụng sớm nhất.

## Hàng đợi có luật

Ngoài đời, hàng đợi runner thường là "đến trước chạy trước", kèm nhãn máy (`runs-on`) để chọn hạng. Khi nhiều commit tới gần nhau, job của chúng chồng lên nhau và giành cùng một dàn máy. Đó là lý do một đường ống chạy nhanh lúc vắng lại chậm hẳn vào giờ cả đội đẩy mã.

## Trong game này

- Số máy mỗi hạng là **dữ liệu của level**, không nằm trong YAML. Mỗi stage khai hạng máy nó cần; một stage giữ một chỗ suốt thời gian chạy.
- Mọi commit của một lượt chạy trên **cùng một dàn máy**. Commit không chạy lần lượt từng cái mà chồng lên nhau và giành chỗ.
- Khi nhiều stage cùng sẵn sàng mà thiếu máy, bộ xếp lịch chọn theo đúng thứ tự: sẵn sàng sớm hơn trước, rồi commit tới sớm hơn, rồi mã commit, rồi mã stage (so từng ký tự), rồi chỉ số thực thể. Kết quả vì thế lặp lại được, và bạn so được hai lời giải trên cùng một thế giới.
- Một stage đòi nhiều chỗ hơn số máy đang rảnh sẽ **chặn đầu hàng** của hạng máy đó: stage nhỏ phía sau không được chen lên. Stage đòi nhiều chỗ hơn cả hạng máy có thì workflow báo lỗi không xếp lịch được, thay vì treo im lặng.
- Bản ghi phân biệt hai kiểu chờ. Chờ **phụ thuộc** là đợi một stage khác xong. Chờ **máy** là đã sẵn sàng mà không còn chỗ, và bản ghi nêu tên thực thể vừa nhả chỗ, kể cả khi nó thuộc commit trước.
- Cổng phê duyệt của con người là ngoại lệ duy nhất giữ **không** chỗ máy nào: nó tốn thời gian mà không chiếm runner.
