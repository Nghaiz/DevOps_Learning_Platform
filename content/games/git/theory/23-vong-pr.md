---
id: 23-vong-pr
title: Vòng đời một pull request
gameId: git
readMinutes: 2
usedByLevels:
  - git-23-vong-pr
---

Điều đầu tiên cần biết về pull request: **git không có khái niệm đó.**

Không lệnh git nào tạo ra PR, không object nào lưu nó, và bạn clone một kho về thì không có PR nào đi theo. PR là một tầng dịch vụ đặt lên trên git, do GitHub, GitLab hay công cụ tương đương cung cấp. Nó gồm hai thứ: một lời đề nghị merge nhánh A vào nhánh B, và một chỗ để bàn về lời đề nghị đó.

Game này mô phỏng tầng đó bằng một lệnh giả lập `pr`, để bạn tập vòng làm việc mà không cần mạng.

## Vòng đi một lượt

```
git push origin feat/gio-hang    # day nhanh len origin
pr open feat/gio-hang -> main    # mo loi de nghi
# dong doi doc va de lai review
git commit                       # sua theo gop y
git push                         # PR tu cap nhat
pr merge                         # gop vao main
```

Review có ba dạng: `approve` (đồng ý), `request-changes` (yêu cầu sửa), và `comment` (nói mà không chặn). Trạng thái PR chạy từ `open` sang `merged` hoặc `closed`.

## Điểm dễ hiểu nhầm nhất

**PR trỏ vào một NHÁNH, không phải vào một tập commit cố định.**

Đây là lý do bước "sửa theo góp ý" ở trên không cần mở PR mới. Bạn push thêm commit lên `feat/gio-hang`, và PR tự thấy nội dung mới, vì nó vốn chỉ giữ tên nhánh.

Và đây cũng là lý do force-push giữa lúc đang review gây khó chịu. Người review đã đọc tới commit thứ ba; bạn rebase rồi force-push; commit thứ ba cũ không còn tồn tại; những gì họ đã đọc và những gì họ đã bình luận trỏ vào một lịch sử không còn ai giữ. Bài G20 và G21 vừa nói về cơ chế, đây là chỗ hậu quả rơi xuống người thật.

## Vì sao vòng này đáng tập

PR không phải thủ tục hành chính. Nó là chỗ duy nhất trong quy trình mà một người thứ hai nhìn vào thay đổi **trước khi** nó thành một phần của nhánh chính. Mọi thứ sau đó, gồm cả việc cứu hộ ở chương 3, đều đắt hơn.
