-- trim.lua — rút MỘT pod thừa khỏi pool:free, nguyên tử cùng phép so trần.
--
-- KEYS[1] = pool:free
-- ARGV[1] = POOL_TARGET (trần)
--
-- Trả tên pod vừa rút; trả nil khi pool KHÔNG vượt trần (ca bình thường, không
-- phải lỗi — Go rẽ nhánh "hết việc" trên redis.Nil, cùng khuôn ErrPoolEmpty của
-- claim.lua).
--
-- ⛔ VÌ SAO PHẢI LÀ LUA CHỨ KHÔNG PHẢI `LLEN` RỒI `RPOP` TỪ GO.
-- Giữa hai lệnh đó một claim có thể lấy đi một pod (claim.lua LMOVE từ đầu
-- TRÁI). Pop tiếp khi đó là rút xuống DƯỚI trần, rồi vòng replenish sau tạo lại
-- — churn do chính ta gây ra, và log sẽ nói "đã rút pod thừa" trong lúc pool
-- đang THIẾU. Ở đây phép so và phép pop nằm trong cùng một lượt nguyên tử nên
-- trạng thái mà ta quyết định trên đó không thể đổi giữa hai bước.
--
-- KHÁC claim.lua ở một điểm quyết định hình dạng của file này: script này ghi
-- ĐÚNG MỘT lệnh. Bài học 1.A-2 ("Redis Lua có isolation, KHÔNG có rollback") chỉ
-- sinh ra nghĩa vụ tự-hoàn-tác cho script NHIỀU ghi — ở đây không có bước nào ở
-- giữa để hỏng, nên không có gì phải hoàn tác. Đừng thêm pcall/undo vào đây cho
-- "đối xứng với claim.lua": nó sẽ là mã chết giả dạng phòng thủ.
--
-- RPOP (đầu PHẢI) chứ không LPOP: claim.lua LMOVE từ đầu TRÁI, nên rút ở đầu
-- phải (a) giữ nguyên FIFO của D6 — pod cũ nhất vẫn ra trước nên pod hỏng vẫn lộ
-- sớm — và (b) bỏ đúng pod MỚI NHẤT, tức pod vừa bị một manager thứ hai tạo
-- thừa. Rút ở đầu trái là tranh trực tiếp với đường claim của người dùng và bỏ
-- đi đúng pod đã ấm lâu nhất.
--
-- RPOP CŨNG CHÍNH LÀ PHÉP GIÀNH QUYỀN SỞ HỮU, cùng luật với `LREM` của reaper
-- tầng 4: trả về một tên = ta vừa rút tên đó khỏi pool ⇒ không claim nào còn
-- grab được nó ⇒ ta được phép xoá pod. Trả nil = không có gì của ta để xoá.

local target = tonumber(ARGV[1])
if target == nil or target < 0 then
  -- Trần vô nghĩa thì KHÔNG rút gì. Fail-closed ở đây quan trọng hơn bình
  -- thường: nhánh này xoá pod, nên một ARGV hỏng mà rơi vào "trần = 0" sẽ vét
  -- sạch warm-pool mỗi vòng và mọi log đều nói "đã rút pod thừa".
  return redis.error_reply('trim: POOL_TARGET khong hop le')
end

if redis.call('LLEN', KEYS[1]) <= target then
  return nil
end

return redis.call('RPOP', KEYS[1])
