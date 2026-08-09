-- reap.lua — kết thúc một session, IDEMPOTENT (B6).
--
-- KEYS[1] = session:{id}        (HASH)
-- KEYS[2] = session:{id}:pod    (STRING, con trỏ cho reaper)
--
-- ARGV[1] = userId hoặc chuỗi rỗng.
--           Rỗng nghĩa là NGƯỜI GỌI LÀ HỆ THỐNG và đã được tầng trên xác thực —
--           script KHÔNG tự quyết định điều đó. Tin một cờ trong ARGV thì bất kỳ
--           ai gọi được RPC cũng tự phong mình là hệ thống; việc phân biệt phải
--           nằm ở interceptor, nơi có thông tin về peer.
-- ARGV[2] = nowUnix
-- ARGV[3] = reapGraceSeconds  (hash sống thêm ngần này để lần gọi thứ hai còn
--                              thấy "session cuối" mà trả OK)
--
-- Trả: { podName, namespace, revision, status, alreadyReaped(0|1) }

local sess = redis.call('HMGET', KEYS[1],
  'userId', 'status', 'podName', 'namespace', 'revision')

local userId    = sess[1]
local status    = sess[2]
local podName   = sess[3] or ''
local namespace = sess[4] or ''
local revision  = tonumber(sess[5]) or 0

if not userId then
  -- Hash đã biến mất hẳn (TTL hết, hoặc reap từ lâu hơn reapGrace). Không bịa ra
  -- một session để trả "OK" — tầng trên dịch thành NotFound. Idempotency mà
  -- plan yêu cầu ("gọi 2 lần đều OK") được phục vụ bởi reapGrace, không phải
  -- bởi việc giả vờ.
  return redis.error_reply('reap: notfound: session khong ton tai')
end

-- Nhánh user: phải khớp chủ sở hữu. Trả ĐÚNG mã với "không tồn tại" — mã riêng
-- sẽ xác nhận session có thật và biến RPC này thành oracle dò id. Đặc biệt quan
-- trọng ở ĐÂY: session_id nằm trong URL /ws/session/{id} nên nó KHÔNG phải bí
-- mật, và nếu reap không kiểm chủ sở hữu thì "biết id = xoá được session của
-- người khác" (chính lý do proto bắt buộc field actor).
if ARGV[1] ~= '' and userId ~= ARGV[1] then
  return redis.error_reply('reap: notfound: session khong ton tai')
end

if status == 'REAPED' then
  -- ĐÃ reap rồi: trả về nguyên trạng, KHÔNG tăng revision, KHÔNG gia hạn lại
  -- hash. Tăng revision ở đây sẽ làm một gateway đang cầm revision đúng bỗng
  -- lệch, và nó sẽ tưởng có ai đó vừa ghi.
  return { podName, namespace, revision, status, 1 }
end

revision = revision + 1

redis.call('HSET', KEYS[1],
  'status', 'REAPED',
  'revision', revision,
  'lastActiveAt', ARGV[2])

-- Rút ngắn TTL xuống reapGrace: đủ để lần gọi thứ hai thấy "session cuối", và
-- không giữ một session đã chết hiện diện hết TTL gốc.
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))

-- Con trỏ pod không còn tác dụng: pod sắp bị xoá ngay trong lời gọi này, nên để
-- lại chỉ khiến reaper tầng 1 làm một vòng thừa khi hash hết hạn.
redis.call('DEL', KEYS[2])

return { podName, namespace, revision, 'REAPED', 0 }
