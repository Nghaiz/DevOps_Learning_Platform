---
id: 16-canary-va-co-mau
title: Canary và cỡ mẫu
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c20-canary-gioi-han-luu-luong
  - cicd-c21-doc-tin-hieu-canary
---

**Canary** cho bản ứng viên nhận một phần nhỏ lưu lượng thật trước khi thay cả đội máy. Phần còn lại tiếp tục chạy bản cũ và đóng vai **nhóm đối chứng** trong cùng khoảng thời gian. Nếu tỷ lệ lỗi của canary cao hơn đối chứng quá một ngưỡng, bản ứng viên bị rút; nếu không, nó được thăng hạng dần lên cả đội.

## Rẻ hơn blue-green, và không cần đợi cảnh báo

Canary không dựng đủ một môi trường thứ hai, nên đỉnh tài nguyên chỉ tăng thêm đúng số máy canary. Rút canary là đưa trọng số về không, một thao tác định tuyến có độ dài cố định, không phụ thuộc đã quan sát bao lâu.

Canary quyết **trên số liệu**, không trên sự thật. Nó có thể hủy nhầm một bản tốt, và có thể cho lọt một bản lỗi. Đó là hai loại sai phải cùng giữ thấp.

## Nhiễu đến từ cỡ mẫu

Tỷ lệ lỗi đo được là số lỗi chia số yêu cầu. Với 40 yêu cầu, thêm đúng một lỗi đã làm tỷ lệ nhảy 2,5 điểm phần trăm. Đó không phải bằng chứng bản ứng viên vừa tệ đi, đó là cỡ mẫu nhỏ.

Hạ ngưỡng thật thấp để không bỏ sót bản lỗi thì bản tốt bị hủy vì nhiễu. Nâng ngưỡng cho hết hủy nhầm thì bản lỗi lọt qua. Xoay ngưỡng không tạo ra thêm dữ liệu. Muốn tín hiệu tách khỏi nhiễu, phải **tăng mẫu**, và có hai hướng:

- **Theo bề rộng**: tăng phần lưu lượng vào canary. Quyết sớm, nhưng nhiều người dùng gặp bản chưa xác nhận hơn và cần nhiều máy canary hơn.
- **Theo thời gian**: giữ nhóm nhỏ, quan sát nhiều khoảng đo hơn. Ít người dùng chịu rủi ro hơn, nhưng quyết định đến muộn.

## Trong game này

- Chính sách canary có bốn tham số đi cùng nhau: **trọng số** (số nguyên 1 đến 50 phần trăm), **độ dài một khoảng đo**, **số khoảng đo**, và **ngưỡng chênh lệch** tỷ lệ lỗi.
- Số máy canary là số máy nhân trọng số, làm tròn lên. Bản ứng viên nhận lưu lượng sau khi các máy đó khởi động xong và trọng số đã đổi.
- Mỗi khoảng đo, canary nhận số yêu cầu mỗi giây × độ dài khoảng × trọng số (làm tròn), nhóm đối chứng nhận phần còn lại. Ví dụ không thuộc level nào: 500 yêu cầu mỗi giây, 4%, khoảng 2 giây cho canary 40 yêu cầu và đối chứng 960.
- Số lỗi mỗi nhóm được rút từ một xấp xỉ chuẩn của phân phối nhị thức theo **số yêu cầu thật**, kẹp trong khoảng từ 0 tới số yêu cầu. Nhóm nhỏ nhảy mạnh, nhóm lớn ổn định.
- Cuối cửa sổ, engine **cộng dồn** lỗi và yêu cầu của mọi khoảng rồi so hiệu tỷ lệ với ngưỡng, bằng phép so số nguyên. Hiệu **bằng đúng** ngưỡng thì chưa vượt. Một nhóm không có yêu cầu nào thì không có tỷ lệ để so, và bản ứng viên được thăng hạng.
- Rút thì mất đúng thời gian đổi trọng số. Thăng hạng thì thay nốt đội máy theo kiểu rolling, mỗi đợt bằng số máy canary. Đỉnh là số máy cộng số máy canary.
- Một level có thể chứa **cả bản tốt lẫn bản lỗi**. Cùng một chính sách chạy trên mọi tình huống, mỗi tình huống nhiều lượt với hạt giống cố định, và số lần hủy nhầm cùng số lần lọt lưới được cộng qua tất cả.
