---
id: 04-nhanh-la-con-tro
title: Nhánh là con trỏ, không phải thư mục
gameId: git
readMinutes: 4
usedByLevels:
  - git-04-nhanh-la-con-tro
---

Isomöttönen và Cochez khảo sát 26 sinh viên sau một môn học có dùng git (ICTERI
2014). Trong 21 bài trả lời thu được, nhầm lẫn nổi bật nhất không phải về lệnh nào
khó nhớ. Nó là về **nhánh là cái gì**: sinh viên tin rằng nhánh là một thư mục, và
họ gõ `cd` để đi vào nhánh.

Kết luận của hai tác giả nói thẳng: phải giải thích nhánh là **con trỏ vào lịch sử
commit**, và phải giải thích bằng sơ đồ trực quan. Bài đọc này và level đi kèm tồn
tại chính vì câu đó.

## Vì sao niềm tin đó rất hợp lý

Không nên cười nhầm lẫn này, vì mọi tín hiệu bề mặt đều ủng hộ nó:

- Tên nhánh trông hệt đường dẫn: `feature/dang-nhap`, `release/2.1`.
- Giao diện đồ hoạ vẽ nhánh trong một cây có thể bung ra thu vào, y như cây thư mục.
- Và quan trọng nhất: **chuyển nhánh thì file trên đĩa thật sự đổi**. Bạn gõ
  `git switch feature`, nhìn vào thư mục, và thấy nội dung khác. Còn bằng chứng nào
  thuyết phục hơn thế cho giả thuyết "tôi vừa đi sang chỗ khác"?

Cái bẫy nằm ở chỗ giả thuyết đó dự đoán đúng thứ bạn quan sát được, nhưng dự đoán
sai gần như mọi thứ khác.

## Nhánh thật sự là gì

Một nhánh là **một dòng dữ liệu**: một cái tên trỏ tới một Oid.

```
refs/heads/main     →  a3f1c9e
refs/heads/feature  →  a3f1c9e
```

Hết. Không có bản sao nào của mã nguồn, không có thư mục nào được tạo ra. Tạo một
nhánh là ghi thêm đúng một dòng như vậy.

Từ đó suy ra vài điều mà mô hình "thư mục" không giải thích nổi:

**Tạo nhánh tốn thời gian không đổi.** Trên một kho 2 GB, `git branch feature` vẫn
xong tức thì, vì nó chỉ ghi một dòng. Nếu nhánh là thư mục thì lệnh đó phải chép
2 GB.

**Hai nhánh trỏ chung một commit là chuyện bình thường.** Ngay sau khi tạo,
`main` và `feature` trỏ vào cùng một chỗ. Không có gì trên đĩa phân biệt chúng, và
không có gì cần phân biệt.

**Xoá nhánh không xoá commit.** `git branch -D feature` xoá một dòng trong bảng ref.
Các commit vẫn nằm nguyên trong kho object. Chúng chỉ mất đường đi tới, và chương
cứu hộ sống hoàn toàn nhờ sự khác biệt giữa "mất đường tới" và "bị xoá".

## Vậy vì sao file trên đĩa lại đổi

Chuyển nhánh là hai việc, không phải một:

1. Dời HEAD sang trỏ vào ref mới.
2. Dựng lại worktree và index từ tree của commit mà ref đó đang trỏ tới.

Việc thứ hai là thứ bạn nhìn thấy. Nó là **hệ quả** của việc dời con trỏ, không phải
là một cú di chuyển vào thư mục khác. Thư mục dự án của bạn từ đầu tới cuối vẫn là
một thư mục duy nhất, ở một đường dẫn duy nhất.

Đây cũng là lý do git từ chối chuyển nhánh khi bạn còn thay đổi chưa lưu: nó sắp
phải ghi đè lên chính những file đó.

## Commit thì nhánh tự tiến lên

Khi bạn commit trong lúc HEAD đang trỏ vào `refs/heads/feature`, git tạo commit mới
rồi **ghi lại** `refs/heads/feature` thành Oid của commit mới. Con trỏ đi theo bạn.

Đó là toàn bộ cơ chế "nhánh dài ra". Không có danh sách commit nào thuộc về nhánh
được lưu ở đâu cả. Câu hỏi "commit này thuộc nhánh nào" thật ra là câu hỏi "từ đầu
nhánh nào đi ngược theo cha thì tới được commit này", và câu trả lời có thể là
nhiều nhánh cùng lúc.

## Trong game này

`Refs` là `Record<tên ref, Oid>`, và tên luôn ở dạng đầy đủ (`refs/heads/main`).
Nhãn nhánh trong khung cảnh 3D bám vào commit mà ref đang trỏ tới, và khi bạn
commit, bạn sẽ thấy nhãn **trượt sang** node mới thay vì thấy một nhánh mới mọc ra.

Nhãn được lặp lại ở nhiều chỗ dọc theo làn của nhánh chứ không chỉ đặt một cái ở
đầu. Đó là điều VR-Git (ICSEA 2022) đo được và nó hơi nghịch lý: lặp nhãn lại đỡ
rối mắt hơn là một nhãn duy nhất mà người xem phải ghi nhớ.

## Tự kiểm tra

Trả lời trước khi chơi level: nếu nhánh là thư mục, thì hai nhánh cùng trỏ vào một
commit sẽ là hai thư mục hay một? Và `git branch feature` trên kho 2 GB sẽ mất bao
lâu? Hai câu hỏi đó đủ để phân biệt hai mô hình.
