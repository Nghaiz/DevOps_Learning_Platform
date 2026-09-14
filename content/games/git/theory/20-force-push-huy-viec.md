---
id: 20-force-push-huy-viec
title: Force-push huỷ việc đồng đội
gameId: git
readMinutes: 4
usedByLevels:
  - git-20-force-push-huy-viec
---

Đây là level duy nhất trong chương 2 mà bạn **nhìn thấy** hậu quả xảy ra. Commit của bot đồng đội biến mất khỏi màn hình, ngay trước mắt bạn, do một lệnh bạn vừa gõ.

Trong bảng so sánh ở phần định vị của game, Learn Git Branching có cờ `--force` nhưng không có hậu quả nào đi kèm. Đó là một khoảng trống đo được, và bài này lấp nó.

## Push bình thường là một lời đề nghị kèm một phép kiểm

Khi bạn `git push`, hai việc xảy ra:

1. Kho của bạn gửi commit sang origin.
2. Kho của bạn xin origin dịch `refs/heads/main` tới commit đó.

Origin chỉ đồng ý ở bước 2 khi commit bạn đưa là con cháu của commit nó đang giữ. Phép kiểm ấy **là** toàn bộ cơ chế an toàn của push. Không có gì khác bảo vệ nhánh chung.

`git push --force` nói: bỏ phép kiểm, cứ dịch.

## Chuyện gì xảy ra với commit bị đè

```
Truoc khi ban force-push:

A - B - D  <- origin/main   (D la commit cua dong doi)
     \
      C    <- main cua ban

Sau khi ban force-push:

A - B - D    (khong ref nao tro toi nua, mo di)
     \
      C  <- origin/main, main
```

Commit `D` **không bị xoá**. Trong game này kho object không bao giờ xoá phần tử trong một phiên chơi, nên `D` vẫn nằm nguyên đó. Git thật cũng giữ nó cho tới khi `gc` dọn, thường là hàng tuần sau.

Nhưng không ai nhìn thấy `D` nữa, vì không ref nào trỏ tới nó. Đây đúng là sự tách giữa **lưu trữ** và **với tới được** mà cả chương 3 sống nhờ. "Mất commit" luôn là một câu nói về tên gọi, không phải về dữ liệu.

## Vì sao nó thật sự nguy hiểm

Đọc tới đây dễ nghĩ "commit còn đó thì có gì ghê gớm". Chỗ ghê gớm nằm ở phía đồng đội.

Kho local của họ vẫn còn `D`, vì đó là commit họ tự tạo. Cho tới khi họ chạy một lệnh hoàn toàn bình thường:

```
git pull
```

`fetch` kéo `origin/main` về chỗ mới là `C`. Rồi vế thứ hai của `pull` hợp nhất `main` của họ với thứ vừa kéo về. Tuỳ cấu hình và tuỳ họ có commit gì thêm hay không, kết quả có thể là nhánh của họ bị đưa thẳng về `C`, tức là `D` rơi khỏi lịch sử của chính người viết ra nó.

Thiệt hại không lan qua một lệnh nguy hiểm. Nó lan qua lệnh mà người ta gõ mỗi sáng.

Khảo sát ICTERI 2014 ghi nhận rằng câu trả lời tiêu cực duy nhất về hệ quản lý phiên bản, trong toàn bộ bảng hỏi, là trải nghiệm mất việc. Force-push lên nhánh chung là con đường ngắn nhất tới trải nghiệm đó, và người gây ra thường không biết mình vừa làm gì.

## Khi nào force-push là đúng

Nó không phải lệnh cấm. Nó là lệnh có phạm vi.

Đúng khi: bạn vừa rebase hoặc `--amend` trên **nhánh riêng của bạn**, nhánh đó chỉ mình bạn dùng, và bạn cần origin phản ánh lịch sử mới. Đây là chuyện xảy ra hàng ngày trong vòng đời một pull request, và không có cách nào khác để đẩy một lịch sử đã viết lại.

Sai khi: nhánh có người khác đang làm việc trên đó, kể cả khi bạn nghĩ là không.

Và sai theo một kiểu riêng khi: push bị từ chối, bạn thử `--force` để thông báo lỗi biến đi. Lời từ chối ở bài G16 mang thông tin. Thêm `--force` là cách tắt thông tin đó chứ không phải cách trả lời nó.

## Game này bỏ gì

Không có protected branch, không có hook phía server, không có quyền hạn theo người. Trên một máy chủ thật, nhánh chính thường được khoá và force-push bị từ chối ở tầng dịch vụ trước khi git kịp làm gì. Nếu bạn chưa từng gây ra sự cố này ở nơi làm việc, rất có thể lý do là ai đó đã bật cái khoá đó từ trước.

Game cũng không mô phỏng reflog phía origin. Dịch vụ thật thường giữ một bản, nên trong nhiều trường hợp việc bị đè vẫn lấy lại được qua bộ phận hỗ trợ. Ở đây thì đường cứu nằm ở bài G31, và nó đi qua kho local.

## Bài kế tiếp

`--force-with-lease` giữ nguyên ý định "tôi cần ghi đè lịch sử của nhánh này", nhưng đặt lại một phép kiểm khác vào chỗ phép kiểm vừa bị bỏ. Cùng một mục tiêu, hậu quả khác hẳn.
