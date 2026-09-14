---
id: 02-ba-vung
title: Ba vùng của git
gameId: git
readMinutes: 4
usedByLevels:
  - git-02-ba-vung
---

Khi bạn sửa một file rồi gõ `git status`, git trả lời bằng cách so sánh **ba** nơi
chứ không phải hai. Ba nơi đó tồn tại cùng lúc, và mỗi nơi có thể đang giữ một
phiên bản khác nhau của cùng một file.

| Vùng | Chứa gì | Ai ghi vào |
|---|---|---|
| worktree | file bạn đang mở và sửa | trình soạn thảo |
| index | nội dung sẽ đi vào commit tiếp theo | `git add` |
| HEAD | ảnh chụp của commit gần nhất | `git commit` |

```
 ┌───────────────────────────────────────────┐
 │  HEAD       ảnh chụp đã commit            │
 ├───────────────────────────────────────────┤  ↑ git commit
 │  index      đang xếp hàng chờ commit      │
 ├───────────────────────────────────────────┤  ↑ git add
 │  worktree   nơi bạn đang gõ               │
 └───────────────────────────────────────────┘
```

## Hai ranh giới, hai lệnh khác nhau

Ba vùng tạo ra hai ranh giới, và mỗi ranh giới có lệnh riêng để nhìn vào:

- `git diff` so **worktree với index**. Nó trả lời câu hỏi "tôi đã sửa gì mà chưa
  `add`".
- `git diff --staged` so **index với HEAD**. Nó trả lời câu hỏi "commit tiếp theo
  sẽ chứa đúng những gì".

Hệ quả làm rất nhiều người mới hoảng: ngay sau khi `add` một file, `git diff` không
in ra gì cả. Phần sửa không biến mất, nó chỉ không còn nằm ở ranh giới mà `git diff`
đang nhìn. Nó đã chuyển lên một tầng.

`git status` thì đọc cả hai ranh giới một lúc, và đó là lý do nó chia đầu ra thành
hai nhóm: "Changes to be committed" là phần lệch giữa index và HEAD, còn "Changes
not staged for commit" là phần lệch giữa worktree và index. Hai nhóm đó không phải
hai cách nói về một chuyện. Chúng là hai phép so khác nhau.

## Vì sao git cần index

Một hệ quản lý phiên bản hoàn toàn có thể bỏ index đi và commit thẳng mọi thứ trong
thư mục. Nhiều công cụ làm đúng như vậy. Git giữ index vì nó cho bạn **soạn** một
commit thay vì chỉ chụp lại tình trạng hiện tại.

Buổi chiều bạn sửa ba chỗ: một lỗi thật, một dòng log tạm để dò lỗi, và một chỗ đổi
tên biến cho dễ đọc. Ba chỗ đó không nên nằm chung một commit. Với index, bạn `add`
riêng phần sửa lỗi, commit nó, rồi xử phần còn lại sau. Không có index thì lựa chọn
duy nhất là commit tất cả hoặc không commit gì.

Cái giá phải trả là một khái niệm nữa để học, và đó là khái niệm gây vấp nhiều
nhất trong git.

## Một file có thể ở ba trạng thái cùng lúc

Đây là chỗ ba vùng thôi là chưa đủ, phải hiểu rằng chúng **độc lập**:

1. Bạn sửa `app.ts` rồi `git add app.ts`. Index giờ giống worktree.
2. Bạn sửa `app.ts` thêm lần nữa.

Bây giờ ba vùng giữ ba nội dung khác nhau: HEAD giữ bản gốc, index giữ bản lần một,
worktree giữ bản lần hai. `git status` sẽ liệt kê `app.ts` ở **cả hai** nhóm cùng
lúc, và nhiều người đọc đoạn đó tưởng là git đang báo lỗi. Không phải. Nó đang mô tả
đúng sự thật.

Nếu bạn commit ngay lúc này, commit sẽ chứa bản lần một, không phải bản bạn đang
nhìn thấy trên màn hình. Đó là một trong những cách mất công phổ biến nhất, và nó
không sinh ra thông báo nào.

## Trong game này

`Index` là `Record<đường dẫn, Oid>`, còn `Worktree` là `Record<đường dẫn, mảng dòng>`.
Hai kiểu khác nhau, và sự bất đối xứng đó phản ánh đúng git thật: `git add` ghi
blob vào kho object **ngay lập tức**, nên index chỉ cần giữ một con trỏ. Nội dung
bạn đã `add` đã an toàn trong kho từ giây phút đó, kể cả khi bạn chưa commit.

Ba vùng là ba mặt phẳng chồng lên nhau trong khung cảnh 3D, nhìn thấy đồng thời.
`git add` là ô file bay từ tầng thấp lên tầng giữa; `git commit` là cả tầng giữa
đóng lại thành một khối và gắn vào đồ thị ở tầng cao.

**Đơn giản hoá có chủ ý.** Index của git thật còn giữ quyền file, thời điểm sửa
đổi, và một bộ nhớ đệm để `git status` chạy nhanh trên kho lớn. Game bỏ hết, vì
không bài nào trong ba chương dạy tới đó.

## Bẫy thường gặp

- **Sửa tiếp sau khi `add` rồi commit.** Phần sửa sau không vào commit. Xem mục
  trên.
- **Đọc `git diff` trống rỗng là "không có thay đổi nào".** Nó chỉ có nghĩa là
  worktree và index đang giống nhau.
- **Dùng `git commit -a` như mặc định.** Cờ đó `add` mọi file đã được theo dõi rồi
  commit luôn, tức là bỏ qua index. Tiện, nhưng nó xoá mất khả năng soạn commit, và
  nó không đụng tới file chưa được theo dõi nên vẫn có thứ bị bỏ sót.
