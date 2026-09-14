---
id: 17-conflict-dau-tien
title: Conflict đầu tiên
gameId: git
readMinutes: 4
usedByLevels:
  - git-17-conflict-dau-tien
---

Khảo sát của Isomöttönen và Cochez (ICTERI 2014) hỏi 21 sinh viên vừa học xong một môn có dùng git. **32% xếp merge conflict vào nhóm khó nhất.** Đáng chú ý hơn con số đó là cách họ xử lý: nhiều người **clone lại một bản kho sạch** rồi chép tay phần việc của mình vào. Tác giả gọi thẳng đó là "một giải pháp rất không may". Và trong toàn bộ khảo sát, câu trả lời tiêu cực duy nhất về hệ quản lý phiên bản là trải nghiệm **mất việc**.

Hai chi tiết đó dính với nhau. Người ta clone lại vì tin rằng conflict là dấu hiệu kho đã hỏng. Rồi chép tay, rồi sót, rồi mất việc. Bài này tồn tại để tháo niềm tin đó.

## Git trộn theo dòng, và nó cần ba bản

Khi merge, git không so hai bản với nhau. Nó so **ba** bản:

```
          base
         (to tien chung)
        /            \
     ours            theirs
  (phia HEAD)    (phia dang tron vao)
```

Với mỗi đoạn văn bản, git hỏi một câu duy nhất: so với `base`, bên nào đã đổi?

| `ours` so với `base` | `theirs` so với `base` | Kết quả |
|---|---|---|
| giống | giống | giữ nguyên |
| **đổi** | giống | lấy `ours` |
| giống | **đổi** | lấy `theirs` |
| **đổi** | **đổi**, và khác `ours` | **conflict** |

Ba dòng đầu git tự quyết được, vì chỉ có một bên lên tiếng. Dòng cuối thì không: cả hai bên đều sửa cùng chỗ, và sửa khác nhau. Chọn bên nào cũng là vứt bỏ ý định của bên kia.

Đó là toàn bộ cơ chế. Không có phần nào bí ẩn.

## Đọc marker

Khi một đoạn xung đột, git ghi cả hai phiên bản vào file, kèm ba dòng đánh dấu:

```
<<<<<<< HEAD
  const timeout = 30;
=======
  const timeout = 5;
>>>>>>> feat/toc-do
```

- Từ `<<<<<<<` tới `=======` là **phía bạn** (`ours`), nhãn bên phải là ref đang đứng.
- Từ `=======` tới `>>>>>>>` là **phía kia** (`theirs`), nhãn bên phải là thứ bạn đang trộn vào.
- Ba dòng đánh dấu là văn bản thường. Git không hiểu chúng, không tự xoá chúng. Chúng nằm trong file đúng như mọi dòng khác.

Giải conflict tức là sửa đoạn đó thành thứ bạn muốn giữ, **rồi xoá cả ba dòng đánh dấu**. Kết quả có thể là phía bạn, phía kia, cả hai, hoặc một dòng thứ ba mà không bên nào viết. Ví dụ trên rất có thể phải thành `const timeout = 15;` sau khi hai người nói chuyện với nhau, và không công cụ nào đoán ra điều đó.

## Conflict không phải lỗi

Git không báo conflict vì bạn làm sai. Nó báo conflict vì nó **từ chối đoán thay bạn**.

Thử nghĩ theo chiều ngược lại. Nếu git tự chọn một bên, nó sẽ chọn im lặng, và bạn sẽ biết tin vào tuần sau qua một bug. Lời báo conflict là lúc duy nhất git có đủ thông tin để nói cho bạn biết hai ý định đang đè lên nhau. Nó dừng lại đúng chỗ nên dừng.

Phần lớn merge trong một ngày làm việc bình thường trôi qua không ai để ý, đúng vì ba dòng đầu của bảng trên chiếm gần hết. Conflict là phần thiểu số mà máy không quyết được.

## Kho đang ở trạng thái nào

Lúc conflict, kho **không hỏng**. Nó đang ở giữa một thao tác có tên:

- Worktree chứa file kèm marker. Đó là nội dung thật, bạn mở ra sửa được bằng editor.
- Engine vẫn giữ riêng danh sách từng đoạn xung đột, để giao diện cho bạn bấm chọn một bên thay vì gõ tay.
- Commit HEAD lúc bắt đầu merge được nhớ lại, nên có đường lùi.

Vì vậy `git status` lúc này là bạn thân. Nó liệt kê đúng những file đang chờ bạn quyết.

## Ba cái bẫy

**Clone lại kho sạch.** Chính là cái bẫy trong khảo sát. Nó không xoá conflict, nó chỉ hoãn conflict lại tới lần merge sau, và trong lúc đó bạn phải chép tay công việc của mình qua. Chép tay là chỗ việc bị mất.

**Commit luôn cả marker.** Rất dễ xảy ra khi file dài và bạn chỉ sửa đoạn đầu. Mã có dấu `<<<<<<<` thường không chạy được, nhưng file cấu hình hay tài liệu thì vẫn "chạy" và lỗi đi xa hơn nhiều. Trong game có một phép kiểm riêng cho việc này, và nó tồn tại vì lỗi này phổ biến chứ không phải vì nó hiếm.

**Xoá phăng một bên cho nhanh.** Giữ nguyên `ours` là cách kết thúc conflict nhanh nhất, và nó vứt bỏ việc của người khác không kém gì force-push. Khác biệt duy nhất là không ai nhìn thấy.

## Game này đơn giản hoá chỗ nào

Nội dung file ở đây là **mảng dòng**, nên đơn vị nhỏ nhất của conflict là một dòng. Git thật so theo dòng ở mức mặc định nhưng có thêm nhiều tầng: nhận diện file bị đổi tên, nhiều thuật toán diff khác nhau, `rerere` để nhớ cách bạn từng giải một conflict lặp lại, và merge driver riêng cho từng loại file. Không thứ nào trong số đó có ở đây, và bỏ chúng đi không làm sai bài học: cơ chế ba bản `base`/`ours`/`theirs` là như nhau.

## Đường ra

Sửa file, `git add` file đó để nói "tôi đã quyết xong", rồi `git commit`. Hoặc đổi ý và lùi lại bằng `git merge --abort`. Bài kế tiếp đi vào cả hai đường, và vào chuyện vì sao `git add` giữa lúc conflict mang một nghĩa khác hẳn ngày thường.
