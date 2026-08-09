-- extend.lua — đẩy idle-deadline của một session đang chạy về phía trước (B5).
--
-- ⛔ VÌ SAO PHẢI LÀ MỘT SCRIPT, KHÔNG PHẢI ĐỌC-RỒI-GHI BẰNG HAI LỆNH GO:
-- `revision` tồn tại để chặn ĐÚNG cái race này — gateway gia hạn TTL trong khi
-- reaper của orchestrator có thể đang reap cùng session. Đọc revision bằng một
-- lệnh rồi ghi bằng lệnh thứ hai là tự dựng lại khoảng hở giữa hai lệnh, tức là
-- kiểm một giá trị đã cũ. Redis chạy script đơn luồng nên kiểm-và-ghi ở đây
-- không có ai chen vào giữa.
--
-- KEYS[1] = session:{id}        (HASH — SSOT)
-- KEYS[2] = session:{id}:pod    (STRING — con trỏ sống lâu hơn hash, cho reaper)
--
-- ARGV[1] = userId              (chủ sở hữu; server điền từ token đã verify)
-- ARGV[2] = expectedRevision    (0 = bỏ qua kiểm)
-- ARGV[3] = nowUnix
-- ARGV[4] = extendSeconds
-- ARGV[5] = hardCapSeconds      (tính TỪ createdAt, không gia hạn được)
-- ARGV[6] = podPointerGraceSeconds
--
-- Trả: { expiresAt, revision, hardCapReached(0|1), status }
-- error_reply cho mọi nhánh từ chối — Go phân loại bằng tiền tố.

local sess = redis.call('HMGET', KEYS[1],
  'userId', 'status', 'createdAt', 'expiresAt', 'revision')

local userId    = sess[1]
local status    = sess[2]
local createdAt = tonumber(sess[3])
local revision  = tonumber(sess[5]) or 0

-- HMGET trên key không tồn tại trả mảng toàn false — KHÔNG phải lỗi, KHÔNG phải
-- nil reply. Không kiểm ở đây thì "session đã hết hạn" đi tiếp dưới dạng một
-- session rỗng và mọi so sánh authz bên dưới là so với false.
if not userId then
  return redis.error_reply('extend: notfound: session khong ton tai')
end

-- ⛔ CHỦ SỞ HỮU LỆCH TRẢ ĐÚNG MÃ VỚI "KHÔNG TỒN TẠI" (notfound), KHÔNG PHẢI
-- MỘT MÃ RIÊNG. Một mã riêng XÁC NHẬN session đó có thật, biến RPC này thành
-- oracle dò id — cùng lý do GetSession trả NotFound thay vì PermissionDenied.
if userId ~= ARGV[1] then
  return redis.error_reply('extend: notfound: session khong ton tai')
end

-- Trạng thái cuối đời không gia hạn được. Đây là vế thứ hai của thứ mà revision
-- bảo vệ: reaper vừa chuyển session sang EXPIRED/REAPED thì gateway KHÔNG được
-- hồi sinh nó, kể cả khi nó cầm đúng revision cũ.
if status ~= 'CLAIMED' and status ~= 'RUNNING' then
  return redis.error_reply('extend: state: trang thai ' .. tostring(status) .. ' khong cho gia han')
end

local expected = tonumber(ARGV[2]) or 0
if expected ~= 0 and expected ~= revision then
  return redis.error_reply('extend: revision: client thay ' .. expected .. ', hien tai ' .. revision)
end

local now      = tonumber(ARGV[3])
local extend   = tonumber(ARGV[4])
local hardCap  = tonumber(ARGV[5])
local podGrace = tonumber(ARGV[6])

-- HAI ĐỒNG HỒ: idle-deadline gia hạn được, hard cap tính từ createdAt thì không.
-- min() ở đây là thứ khiến RPC này KHÔNG BAO GIỜ là đường giữ pod sống vĩnh
-- viễn: một client bị chiếm quyền spam heartbeat cũng chỉ tới được trần cứng.
local wanted   = now + extend
local capAt    = createdAt + hardCap
local newExpiresAt = wanted
local hardCapReached = 0
if wanted >= capAt then
  newExpiresAt = capAt
  hardCapReached = 1
end

-- Trần cứng đã qua ⇒ không còn gì để gia hạn. Trả về trạng thái hiện tại kèm
-- cờ, để FE hiện "phiên đã tới hạn tối đa" thay vì thấy terminal chết đột ngột.
if newExpiresAt <= now then
  return redis.error_reply('extend: hardcap: da qua tran cung, khong the gia han')
end

revision = revision + 1

redis.call('HSET', KEYS[1],
  'expiresAt', newExpiresAt,
  'lastActiveAt', now,
  'revision', revision)

-- TTL của key phải đi theo expiresAt, nếu không hash biến mất trước hạn (hoặc
-- sống quá hạn) và reaper tầng 1 nghe nhầm thời điểm.
local ttl = newExpiresAt - now
redis.call('EXPIRE', KEYS[1], ttl)
-- Con trỏ pod sống LÂU HƠN hash có chủ ý: lúc `session:{id}` hết hạn thì hash đã
-- biến mất và không còn chỗ nào đọc được podName để xoá pod. Đặt bằng nhau là
-- reaper mù. (Cùng lý do với claim.lua.)
redis.call('EXPIRE', KEYS[2], ttl + podGrace)

return { newExpiresAt, revision, hardCapReached, status }
