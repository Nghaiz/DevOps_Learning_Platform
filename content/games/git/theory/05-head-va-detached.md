---
id: 05-head-va-detached
title: HEAD và detached HEAD
gameId: git
readMinutes: 2
usedByLevels:
  - git-05-head-va-detached
---

HEAD trả lời một câu hỏi duy nhất: **bạn đang ở đâu**. Nó có đúng hai hình dạng.

```
{ type: 'ref',      ref: 'refs/heads/main' }   // bình thường
{ type: 'detached', oid: 'a3f1c9e...'      }   // detached
```

Ở dạng thứ nhất, HEAD trỏ vào một nhánh, và nhánh trỏ vào một commit. Một tầng gián
tiếp. Ở dạng thứ hai, HEAD bỏ qua tầng đó và trỏ thẳng vào commit.

## Khác biệt lộ ra khi bạn commit

Với HEAD gắn vào nhánh, commit mới làm **nhánh** tiến lên, và HEAD đi theo nhánh
một cách tự động.

Với HEAD detached, commit mới chỉ làm **HEAD** tiến lên. Không ref nào theo sau.
Commit vừa tạo tồn tại thật, nằm trong kho object thật, nhưng không có cái tên nào
dẫn tới nó ngoài chính HEAD.

Rời đi là mất dấu. `git switch main` dời HEAD sang chỗ khác, và commit bạn vừa tạo
lập tức không còn đường nào tới được. Git có cảnh báo, nhưng cảnh báo đó dài và
người ta lướt qua nó.

## Vì sao git cho phép detach

Vì nó hữu ích. Bạn muốn xem mã nguồn tại một commit sáu tháng trước để dựng lại một
lỗi; bạn muốn chạy thử bản build tại một tag. Trong những trường hợp đó bạn cần
worktree tại commit ấy mà không muốn tạo nhánh, và không muốn nhánh nào bị dời.

Detached HEAD không phải một trạng thái hỏng. Nó là một trạng thái bạn phải biết là
mình đang ở trong đó.

## Lối ra

Nếu bạn đã commit khi detached và muốn giữ lại, hãy **đặt tên** trước khi đi:

```
git branch cuu-ho
git switch main
```

Còn nếu đã lỡ đi rồi thì commit vẫn chưa mất. `git reflog` giữ mọi lần HEAD đổi chỗ,
và chương cứu hộ dạy cách lần ngược lại theo nhật ký đó.

## Trong game này

Trạng thái detached hiện rõ trên HUD chứ không nấp trong một dòng cảnh báo trôi qua,
và các commit không còn ai trỏ tới được vẽ mờ với cờ `reachable: false` thay vì biến
mất khỏi màn hình. Đó là một lựa chọn dạy học có chủ ý: thứ bạn cần nhìn thấy là
"nó còn đó nhưng không ai chỉ tới", chứ không phải "nó đã biến mất".

Đáng nói thêm một điều đo được: trong hai công cụ học git phổ biến nhất hiện nay, có
một công cụ không nhắc tới detached HEAD ở bất kỳ file nào.
