---
id: 22-stash-khi-chuyen-nhanh
title: Stash khi phải chuyển nhánh
gameId: git
readMinutes: 4
usedByLevels:
  - git-22-stash-khi-chuyen-nhanh
---

Để hiểu `git stash`, phải hiểu trước một chuyện mà rất nhiều người dùng git hàng năm trời vẫn chưa nói thành lời: **worktree chỉ có một, và mọi nhánh dùng chung nó.**

## Nhánh không phải thư mục

Khảo sát ICTERI 2014 ghi lại rằng sinh viên tưởng nhánh là thư mục, và gõ `cd` để "vào" một nhánh. Hiểu nhầm đó không ngớ ngẩn chút nào. Nó chính là mô hình mà các công cụ quản lý phiên bản đời trước dùng thật, và nó là mô hình trực giác hơn.

Git thì khác: nhánh là một con trỏ, và `git switch` **viết đè lên chính thư mục bạn đang mở**. Không có thư mục thứ hai xuất hiện. File trên đĩa đổi nội dung tại chỗ.

Từ đó suy ra ngay một vấn đề. Nếu bạn đang sửa dở vài file và muốn chuyển nhánh, phần sửa dở đó không có chỗ nào để ở lại. Nó không thuộc commit nào, không thuộc nhánh nào, nó chỉ nằm trong thư mục. Mà thư mục thì sắp bị ghi đè.

Git từ chối chuyển nhánh trong trường hợp đó. Sự từ chối ấy đúng, nhưng nó để bạn kẹt lại. `git stash` sinh ra để gỡ đúng chỗ kẹt này.

## Stash làm gì

```
git stash
```

Ba việc, theo thứ tự:

1. Gom nội dung bạn đang sửa lại.
2. Gói nó thành một **commit** và cất vào một danh sách riêng.
3. Trả worktree về đúng trạng thái của HEAD, tức là sạch.

Sạch rồi thì `git switch` chạy được.

```
        stash@{0}
       /
A - B - C  <- main
```

Commit stash treo ra bên cạnh và không nhánh nào trỏ tới nó. Chỉ có danh sách stash biết nó ở đâu.

**Điểm quan trọng nhất của bài này: stash LÀ một commit.** Không phải một vùng nhớ đặc biệt, không phải một file tạm ở đâu đó. Nó là một object cùng loại với mọi commit khác trong kho, chỉ khác ở chỗ được gọi tên bằng một danh sách thay vì bằng một ref. Nhớ điều này, vì bài G30 sống hoàn toàn nhờ nó: khi danh sách stash mất mục, commit vẫn còn, và tìm lại được.

## Lấy ra

```
git stash list      # xem co gi trong danh sach
git stash pop       # ap muc tren cung roi XOA no khoi danh sach
git stash apply     # ap muc tren cung va GIU no lai
```

`pop` gọn hơn. `apply` an toàn hơn, vì nếu bạn áp nhầm nhánh thì mục vẫn còn đó để áp lại chỗ đúng. Khi chưa chắc chắn, `apply` rồi `git stash drop` sau là một thói quen rẻ tiền.

Áp một stash cũng là một phép trộn. Nếu file đã đổi kể từ lúc cất, bạn gặp đúng cơ chế ba bản ở bài G17, với đúng loại marker đó.

## Vì sao stash chạm cả index

Perez De Rosso và Jackson (Onward! 2013, MIT) chỉ ra rằng bản đã `add` và bản đang sửa trong worktree **không trực giao**: chuyện gì xảy ra với chúng còn tuỳ tham số bạn truyền vào. Stash phải xử lý cả hai vùng, và đó là nguồn gốc của một bất ngờ hay gặp: cất rồi lấy ra, những gì bạn đã `add` có thể quay về ở dạng chưa `add`.

Không có gì bị mất trong quá trình đó, nhưng nếu bạn đang giữ một index được sắp xếp cẩn thận để chuẩn bị commit từng phần, hãy biết trước là nó có thể phẳng ra.

## Ba cái bẫy

**Coi stash là chỗ lưu trữ.** Nó là một ngăn xếp, và ngăn xếp thì dễ quên. Một stash cất tháng trước, áp vào một mã nguồn đã đổi khác hẳn, gần như chắc chắn thành một mớ conflict. Nếu việc đáng giữ quá một buổi, nó đáng có một commit và một nhánh.

**Cất mà không đặt tên.** `git stash list` mặc định in ra tên nhánh và commit lúc cất, không in ra bạn đang định làm gì. Với ba mục trở lên thì không ai đoán nổi mục nào là mục nào.

**Quên mất mình đang có stash.** Nó không hiện trong `git status`, không hiện trong đồ thị commit, không chặn bất cứ lệnh nào. Nó im lặng hoàn toàn cho tới lúc bạn nhớ ra.

## Phần game này đơn giản hoá

Git thật có thêm cờ cho file chưa được theo dõi và file bị bỏ qua, vì mặc định stash chỉ gom thứ git đang theo dõi. Nó cũng có `git stash branch` để bung một stash thẳng thành nhánh mới. Những thứ đó không đổi bản chất: dù có cờ nào đi nữa, stash vẫn là một commit không ai trỏ tới, và đó là thứ cần nhớ khi sang chương 3.
