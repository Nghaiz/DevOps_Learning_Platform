-- idem_release.lua — nhả khoá idempotency CHỈ KHI ta còn là chủ của nó.
--
-- KEYS[1] = idem:{userId}:{key}
-- ARGV[1] = sessionID mà lời gọi này đã SETNX vào đó
--
-- VÌ SAO KHÔNG PHẢI MỘT LỆNH `DEL`: khoá có TTL 600s. Một `DEL` trần trong
-- nhánh dọn-dẹp sẽ xoá nhầm khoá của một CreateSession KHÁC — kịch bản thật:
-- lời gọi A SETNX rồi treo lâu tới mức khoá hết hạn; user bấm lại, lời gọi B
-- SETNX thành công và claim xong; A tỉnh dậy, thất bại, và `DEL` khoá của B.
-- Retry tiếp theo của user khi đó tạo POD THỨ HAI — đúng thứ idempotency_key
-- tồn tại để chặn.
--
-- Trả 1 nếu đã xoá, 0 nếu khoá không còn là của ta (hoặc đã biến mất).
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
