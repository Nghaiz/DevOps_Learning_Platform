-- Trả lại một khe WS.
--
-- KEYS[1] = session:{id}:ws
-- Trả: số khe còn giữ sau khi trả (≥ 0).
--
-- DEL khi về 0 thay vì để một key giá trị "0" nằm lại: key rác đó vẫn ăn TTL và
-- vẫn hiện trong mọi lượt SCAN của người đi chẩn đoán, làm "session này có ai
-- đang mở không" đọc thành có trong khi câu trả lời là không.
--
-- Kẹp sàn ở 0: một DECR thừa (double-release do bug ở caller) sẽ đẩy bộ đếm
-- xuống âm, và số âm thì VĨNH VIỄN nhỏ hơn trần — tức trần WS lặng lẽ biến mất
-- đúng ở session đó. Thà mất một lần release còn hơn mất cái trần.

local n = redis.call('DECR', KEYS[1])
if n <= 0 then
  redis.call('DEL', KEYS[1])
  return 0
end
return n
