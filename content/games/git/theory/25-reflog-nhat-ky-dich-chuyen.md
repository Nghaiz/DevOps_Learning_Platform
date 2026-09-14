---
id: 25-reflog-nhat-ky-dich-chuyen
title: '`reflog` là nhật ký dịch chuyển'
gameId: git
readMinutes: 4
usedByLevels:
  - git-25-reflog-nhat-ky-dich-chuyen
---

Cả chương 3 đứng trên một ý duy nhất, và nếu bạn chỉ nhớ một câu từ toàn bộ game thì nên là câu này:

> **Lưu trữ là một chuyện, với tới được là chuyện khác.**

Commit không biến mất vì bạn chạy `reset --hard`. Nó không biến mất vì bạn xoá nhánh, không biến mất vì rebase, không biến mất vì force-push. Trong tất cả những trường hợp đó, cái biến mất là **cái tên**.

## Kho object không xoá

Trong game này, kho object không bao giờ xoá phần tử trong suốt một phiên chơi. Mọi commit từng được tạo vẫn nằm nguyên đó, tra bằng Oid vẫn ra.

Vậy "mất commit" nghĩa là gì? Nghĩa là không ref nào dẫn tới nó nữa. Bạn biết nó tồn tại nhưng không gọi được tên, giống một cuốn sách còn trên kệ mà thẻ mục lục đã bị rút.

Ở tầng hiển thị, commit như vậy vẫn được vẽ, chỉ mờ đi. Đó là một quyết định có chủ ý: game muốn bạn **nhìn thấy** rằng nó chưa đi đâu cả.

Nếu vậy thì việc cứu hộ rút gọn thành đúng một bài toán: tìm lại Oid, rồi trỏ một cái gì đó vào nó. `reflog` là công cụ cho vế thứ nhất.

## Reflog ghi gì

Reflog là nhật ký các lần **một ref đổi chỗ**. Mỗi ref có nhật ký riêng, và `HEAD` cũng là một ref hợp lệ ở đây, thực tế là cái được dùng nhiều nhất.

Mỗi dòng ghi: đi từ đâu, tới đâu, bằng thao tác gì, và một câu mô tả. Dòng đầu tiên của một ref vừa được tạo có vế "từ đâu" bỏ trống, vì trước đó nó chưa ở đâu cả.

```
$ git reflog
a3f9c21 HEAD@{0}: reset: chuyen ve HEAD~2
7b1e4d8 HEAD@{1}: commit: them kiem tra dau vao
4c2a90f HEAD@{2}: commit: sua loi lam tron
91d5e77 HEAD@{3}: checkout: tu main sang feat/gio-hang
```

Đọc từ trên xuống là đi ngược thời gian. `HEAD@{0}` là chỗ HEAD đang đứng, `HEAD@{1}` là chỗ ngay trước đó.

Và đây là chỗ có giá trị: ở dòng `HEAD@{0}`, thao tác `reset` đã đưa HEAD từ `7b1e4d8` về `a3f9c21`. Cột Oid ở dòng `HEAD@{1}` **chính là** nơi bạn vừa rời khỏi. Bạn không cần nhớ, không cần đoán, nó được ghi lại tự động.

`HEAD@{1}` dùng được ở mọi chỗ dùng được tên một commit:

```
git reset --hard HEAD@{1}
git branch cuu-ho HEAD@{1}
git diff HEAD@{3} HEAD@{0}
```

## Lệnh nào ghi vào reflog

Ghi vào: `commit`, `reset`, `merge`, `rebase`, `checkout`, `branch`, và nói chung mọi thứ làm một ref dịch chỗ.

Không ghi vào: lệnh chỉ đọc. `git log`, `git status`, `git diff` không làm ref nào dịch, nên chúng không để lại dòng nào.

Trong game này có thêm một hệ quả dễ chịu: đồng hồ logic chỉ tăng khi lệnh **có tác dụng**. Nghĩa là bạn nhìn quanh thoải mái mà không làm bẩn nhật ký và cũng không đánh thức bot đồng đội. Một người chơi cẩn thận không bị phạt vì cẩn thận.

## Vì sao Learn Git Branching không thể có reflog

Đây không phải chuyện thiếu thời gian làm. Đo trực tiếp trên mã nguồn Learn Git Branching, 71 file trong `src/js`, có **0 file** nhắc tới reflog. gitmastery.me có 11 file.

Lý do nằm ở mô hình dữ liệu. Learn Git Branching giữ một cây các commit đang sống. Xoá một ref ở đó thì node rời khỏi mô hình. Không có sự tách giữa "đang được lưu" và "đang với tới được", nên sau khi mất ref thì **không còn gì để tra cứu**. Một nhật ký các Oid cũ sẽ chỉ toàn con trỏ vào khoảng không.

Game này tách hai khái niệm đó ngay từ kiểu dữ liệu, và đó là toàn bộ lý do chương 3 tồn tại được.

## Giới hạn, nói thẳng

Ba điều nên biết trước khi tin vào reflog ngoài đời:

**Reflog là của riêng máy bạn.** Nó không được push, không đi theo khi clone. Reflog của đồng đội không cứu được lỗi của bạn, và reflog của bạn không biết gì về chuyện đã xảy ra trên origin.

**Git thật có hạn dùng.** Mục reflog hết hạn sau một khoảng thời gian mặc định, và `git gc` cuối cùng sẽ dọn những object không ai với tới. Game này không làm cả hai việc đó, nên ở đây cứu hộ luôn thành công. Trên một kho thật bỏ quên cả năm thì không chắc.

**Reflog theo dõi ref, không theo dõi file.** Thay đổi bạn chưa commit chưa bao giờ nằm trong ref nào, nên không có dòng nhật ký nào về chúng. Đây là ranh giới thật sự của việc cứu hộ, và bài G26 sẽ chạm vào nó.

## Việc cần tập

Thói quen đáng xây nhất không phải thuộc cú pháp, mà là phản xạ: **làm hỏng thì gõ `git reflog` trước khi làm bất cứ việc gì khác.** Đọc nhật ký không thay đổi gì cả, nên nó luôn là bước rẻ nhất. Bảy bài còn lại của chương này đều bắt đầu từ đó.
