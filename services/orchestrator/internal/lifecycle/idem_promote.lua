-- idem_promote.lua — nâng khoá idempotency từ "pending:{id}" lên "{id}".
--
-- KEYS[1] = idem:{userId}:{key}
-- ARGV[1] = giá trị pending mà lời gọi này đã SETNX ("pending:" .. sessionID)
-- ARGV[2] = sessionID (giá trị cuối)
--
-- VÌ SAO CÓ HAI PHA:
-- Giá trị "pending:" cho đường replay phân biệt được "một lời gọi khác đang
-- xử lý" với "session đã kết thúc" — hai ca cùng cho ErrSessionNotFound nếu chỉ
-- lưu sessionID. Không phân biệt được thì cú double-click nút Start sẽ khiến
-- lời gọi thua nhận thông báo "session này đã kết thúc; dùng idempotency_key
-- mới" — một khẳng định SAI SỰ THẬT, và làm theo nó chính là tạo pod thứ hai.
--
-- KEEPTTL: giữ nguyên hạn còn lại. Không có nó thì khoá mất TTL và sống vĩnh
-- viễn, chặn user dùng lại đúng idempotency_key đó mãi mãi.
--
-- CAS chứ không SET trần: chỉ chủ của pha pending mới được nâng.
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 1
end
return 0
