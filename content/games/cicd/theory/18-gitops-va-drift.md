---
id: 18-gitops-va-drift
title: GitOps và drift
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c23-git-la-nguon-that
  - cicd-c24-drift-giua-hai-nhip
---

**GitOps** đặt một quy ước: trạng thái mong muốn của hệ thống nằm trong Git. Một bộ **đối soát** (reconciler) chạy trong cụm, định kỳ so trạng thái khai trong Git với trạng thái sống, rồi đưa trạng thái sống về theo. Argo CD và Flux là hai công cụ phổ biến làm việc này.

Muốn đổi phiên bản ảnh, bạn không chạy lệnh vào cụm. Bạn commit vào Git, và bộ đối soát lo phần còn lại.

## Hai trạng thái, hai đồng hồ

Commit đổi **trạng thái khai** ngay lập tức. **Trạng thái sống** chỉ theo ở lần đối soát kế tiếp. Nhìn thấy ảnh cũ vài chục giây sau khi commit không có nghĩa phát hành thất bại; có thể bộ đối soát chỉ chưa tới nhịp.

Khoảng thời gian hai trạng thái khác nhau gọi là **drift**. Drift sinh ra theo hai cách:

- **Từ Git**: khai đã đổi, sống chưa kịp theo. Đây là độ trễ bình thường.
- **Từ người**: ai đó sửa tay trạng thái sống, chẳng hạn `kubectl set image` lúc nửa đêm. Git không biết gì về thay đổi đó.

## Đồng bộ và tự sửa là hai cơ chế

**Đồng bộ** áp một commit mới lên trạng thái sống. **Tự sửa** (self-heal) đưa một thay đổi tay về lại trạng thái khai. Tắt tự sửa không tắt đồng bộ: commit mới vẫn lên, nhưng chỉnh tay thì nằm lại cho tới khi có gì đó đè lên nó.

Ở chế độ chỉ phát hiện, bộ đối soát vẫn **thấy** lệch và báo lên, chỉ là không sửa.

## Drift dài bao lâu

Đối soát chạy theo **nhịp**, không chạy theo sự kiện. Với chu kỳ P, một thay đổi tay ở giây t sống tới nhịp kế tiếp. Ví dụ không thuộc level nào: chu kỳ 20 giây, sửa tay ở giây 13, tự sửa bật, thì drift dài 7 giây. Sửa tay ở giây 27 thì dài 13 giây. Chu kỳ không phải độ dài của mọi drift; vị trí của thay đổi trong chu kỳ mới quyết định.

## Trong game này

- Bộ mô phỏng GitOps đếm bằng **giây nguyên** và chạy trên một kịch bản cố định: mốc commit, mốc sửa tay và giá trị ban đầu là dữ liệu level, độc lập với thời gian chạy của workflow.
- Nhịp đối soát là P, 2P, 3P... **Giây 0 không phải nhịp**, nên thay đổi ở giây 0 lệch đúng P giây. Với t > 0 và tự sửa bật, drift từ người dài `ceil(t / P) × P − t`.
- Trong cùng một giây, mọi thay đổi được áp **trước**, đối soát chạy **sau**. Thay đổi tay rơi đúng nhịp bị phát hiện và sửa ngay ở giây đó, dài 0 giây.
- Mỗi đoạn drift ghi bốn mốc: bắt đầu, lần đối soát đầu tiên **thấy** nó, lúc kết thúc, và cách kết thúc (do đối soát, hoặc do một thay đổi khác làm sống khớp khai). Đoạn chưa kết thúc được tính tới hết kịch bản.
- Một thay đổi giữ trường vẫn lệch không cắt đoạn drift thành hai. Đồng bộ một commit đóng đoạn đang mở **bất kể ai gây ra**, vì giá trị khai mới đè lên cả chỉnh tay.
- Commit rồi hoàn tác trước nhịp kế tiếp thì không có gì để đồng bộ: khai được so theo **giá trị**.
- Mục tiêu giới hạn drift đo đoạn dài nhất trên một trường, và đòi nó **ngắn hơn** ngưỡng.
