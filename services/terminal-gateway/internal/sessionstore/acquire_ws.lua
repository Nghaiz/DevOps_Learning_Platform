-- Chiếm một khe WS của session, ATOMIC cùng việc đặt TTL.
--
-- KEYS[1] = session:{id}:ws
-- ARGV[1] = trần WS đồng thời (GATEWAY_MAX_WS_PER_SESSION, D17 = 1)
-- ARGV[2] = TTL còn lại của session, tính bằng mili-giây (> 0)
--
-- Trả: số khe đang giữ sau khi chiếm (≥ 1), hoặc -1 khi đã chạm trần.
--
-- ⛔ VÌ SAO PHẢI LÀ LUA CHỨ KHÔNG PHẢI INCR RỒI EXPIRE TỪ GO:
-- gateway chết giữa hai lệnh đó để lại một bộ đếm KHÔNG CÓ TTL, và vì DECR nằm
-- trong defer của một tiến trình đã chết nên nó không bao giờ chạy. Kết quả:
-- session của sinh viên khoá VĨNH VIỄN ở trạng thái "đang mở ở tab khác" và
-- không lỗi nào nói vì sao. TTL ở đây không phải tối ưu, nó là đường thoát duy
-- nhất khỏi chế độ hỏng đó.
--
-- ⛔ VÀ VÌ SAO CÓ pcall + HOÀN TÁC: Redis Lua có ISOLATION, KHÔNG có ROLLBACK —
-- một redis.call lỗi ở giữa thì mọi ghi TRƯỚC đó vẫn được giữ và replicate. Đây
-- là bài học đo được ở spike 1.A-2 (internal/pool/README.md): chính `EXPIRE` ở
-- lệnh CUỐI lỗi đã để lại một session không TTL. Cùng cái bẫy, cùng cách vá.

local n = redis.call('INCR', KEYS[1])

if n > tonumber(ARGV[1]) then
  -- Trả lại khe vừa chiếm. Không đụng TTL: khe đầu tiên (n == 1) đã đặt TTL
  -- rồi, nên key không thể ở trạng thái "có đếm mà không có hạn" tại đây.
  redis.call('DECR', KEYS[1])
  return -1
end

local ok = redis.pcall('PEXPIRE', KEYS[1], ARGV[2])
if type(ok) == 'table' and ok.err then
  redis.call('DECR', KEYS[1])
  return redis.error_reply('acquire_ws: PEXPIRE that bai: ' .. ok.err)
end

return n
