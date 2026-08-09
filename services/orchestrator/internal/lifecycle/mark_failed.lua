-- mark_failed.lua — chuyển session sang FAILED (reaper tầng 2, "session ma").
--
-- KEYS[1] = session:{id}
-- ARGV[1] = nowUnix
--
-- Trả: 1 nếu đã đổi, 0 nếu không có gì để đổi (key mất, hoặc đã ở trạng thái cuối).
--
-- VÌ SAO LÀ SCRIPT: `revision` phải tăng CÙNG LƯỢT với việc ghi status. Đọc
-- revision rồi ghi bằng lệnh thứ hai là tự dựng lại đúng cái race mà revision
-- sinh ra để chặn — ở đây là reaper ghi FAILED trong khi gateway đang gia hạn.

local sess = redis.call('HMGET', KEYS[1], 'status', 'revision')
local status = sess[1]
if not status then
  return 0
end

-- Chỉ session ĐANG SỐNG mới chuyển được sang FAILED. Ghi đè một trạng thái cuối
-- (REAPED/EXPIRED/FAILED) là ghi thừa VÀ tăng revision vô cớ, làm một gateway
-- đang cầm revision đúng bỗng thấy lệch rồi tự đóng kết nối.
if status ~= 'CLAIMED' and status ~= 'RUNNING' then
  return 0
end

redis.call('HSET', KEYS[1],
  'status', 'FAILED',
  'revision', (tonumber(sess[2]) or 0) + 1,
  'lastActiveAt', ARGV[1])
return 1
