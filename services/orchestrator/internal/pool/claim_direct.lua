-- claim_direct.lua — ghi trạng thái CLAIMED cho một pod ĐÃ TẠO SẴN (đồng bộ,
-- ngoài warm-pool), dùng cho session mang profile khác mặc định (P7 7.C).
--
-- VÌ SAO CÓ SCRIPT RIÊNG, KHÔNG DÙNG CHUNG claim.lua: `pool:free` chỉ chứa
-- pod default-profile (pool.Manager.replenishOnce luôn dựng bằng m.podCfg gốc,
-- không profile) — một pod profiled KHÔNG BAO GIỜ nằm ở đó để claim.lua LMOVE
-- ra. Pod ở đây do lifecycle.Service tự Create + chờ Ready (pool.Manager.
-- ProvisionWithProfile) NGAY TRƯỚC lúc gọi script này, nên đã BIẾT SẴN tên —
-- không cần bước "chọn pod" (LMOVE + vòng quét pod hỏng) mà claim.lua phải làm.
--
-- Phần GHI TRẠNG THÁI giữ ĐÚNG kỷ luật tự-hoàn-tác của claim.lua (đọc chú
-- thích đầu file đó: Redis Lua KHÔNG CÓ ROLLBACK, nên mọi ghi đi qua `w()` và
-- lỗi giữa chừng phải tự `undo()`).
--
-- ⛔ RPUSH THẲNG vào pool:claimed LÀ BẮT BUỘC, không phải tùy chọn.
-- Nếu bỏ bước này: một session profiled hết hạn ĐÚNG LÚC reaper tầng 1
-- (keyspace notification) lỡ event sẽ không tầng sweep nào thấy được nó —
-- pod:{name} tồn tại (không phải "mồ côi", tầng 2a bỏ qua), không nằm trong
-- pool:quarantine (tầng 3 bỏ qua), và nếu pool:claimed không có tên nó thì tầng
-- 2c (sweepClaimedWithoutSession, internal/reaper/reaper.go) cũng mù — pod ăn
-- quota vĩnh viễn. Đây CHÍNH LÀ "điểm mù thứ tư" mà reaper.go đã ghi lại cho
-- claim.lua; RPUSH ở đây đóng đúng cửa đó cho nhánh profiled.
--
-- KEYS[1] = pool:claimed
-- KEYS[2] = session:{id}     (HASH — SSOT trạng thái session)
-- KEYS[3] = session:{id}:pod (STRING — con trỏ SỐNG LÂU HƠN hash, cho reaper)
--
-- ARGV[1]  = sessionID        ARGV[7]  = ttlSeconds
-- ARGV[2]  = userID           ARGV[8]  = podKeyPrefix (từ rediskeys — SSOT)
-- ARGV[3]  = namespace        ARGV[9]  = podPointerTTL (> ttlSeconds)
-- ARGV[4]  = tier             ARGV[10] = podName (ĐÃ BIẾT — không LMOVE)
-- ARGV[5]  = nowUnix          ARGV[11] = profile
-- ARGV[6]  = expiresAtUnix
--
-- Trả: podName khi ghi xong. error_reply khi có sự cố THẬT (đã hoàn tác).
-- KHÔNG có sentinel "rỗng" như claim.lua — pod đã biết sẵn, không có khái niệm
-- "không tìm thấy pod".
--
-- GIỚI HẠN CLUSTER (D10, y hệt claim.lua): trên Redis Cluster script này sẽ
-- CROSSSLOT vì `pod:{name}` dựng động không khai báo được trong KEYS. P1 chạy
-- Redis đơn — chấp nhận có chủ ý.

local podPrefix = ARGV[8]
local podName = ARGV[10]
local profile = ARGV[11]

-- Gọi hai lần với cùng sessionID là LỖI LẬP TRÌNH — cùng lý lẽ với claim.lua:
-- dedupe theo idempotency_key sống ở tầng trên. Không chặn ở đây thì lần hai
-- ghi đè hash và pod của lần một rò VĨNH VIỄN.
if redis.call('EXISTS', KEYS[2]) == 1 then
  return redis.error_reply('claim_direct: session da ton tai, khong claim de len')
end

local failed = nil

local function w(...)
  if failed then return end
  local r = redis.pcall(...)
  if type(r) == 'table' and r.err then failed = r.err end
end

local function undo()
  -- Thứ tự ngược lại, dùng redis.call (không pcall): nếu chính bước hoàn tác
  -- lỗi thì im lặng còn tệ hơn — để nó nổi lên.
  --
  -- KHÔNG trả pod về pool:free (khác undo() của claim.lua): pod này KHÔNG PHẢI
  -- default-profile, không request warm nào thoả được nó nếu nó nằm ở đó. Xoá
  -- hash + rút khỏi pool:claimed là đủ ở phía Redis; Go (caller) tự xoá Pod
  -- trên cluster khi ClaimDirect trả lỗi ambiguous=false.
  redis.call('DEL', KEYS[2], KEYS[3])
  redis.call('DEL', podPrefix .. podName)
  redis.call('LREM', KEYS[1], 1, podName)
end

-- pod:{name} — pod này CHƯA từng có hash (không đi qua publish() của
-- pool.Manager, cái tồn tại để công bố pod vào pool:free). Ghi thẳng
-- state=claimed: không có pha "free" trung gian nào để lộ ra ngoài, vì
-- không nguồn nào khác biết tên pod này cho tới khi script này chạy xong.
w('HSET', podPrefix .. podName,
  'state', 'claimed',
  'sessionId', ARGV[1],
  'userId', ARGV[2],
  'tier', ARGV[4],
  'updatedAt', ARGV[5])

w('RPUSH', KEYS[1], podName)

-- Field khớp rediskeys.SessionFields (+ "profile", field RIÊNG của nhánh
-- profiled — xem lifecycle/session.go). Lệch tên ở đây là authz vế g của
-- gateway so sánh với chuỗi rỗng trong im lặng, y hệt cảnh báo trong claim.lua.
w('HSET', KEYS[2],
  'userId', ARGV[2],
  'podName', podName,
  'namespace', ARGV[3],
  'status', 'CLAIMED',
  'tier', ARGV[4],
  'createdAt', ARGV[5],
  'expiresAt', ARGV[6],
  'revision', 1,
  'lastActiveAt', ARGV[5],
  'profile', profile)

w('SET', KEYS[3], podName)
w('EXPIRE', KEYS[2], ARGV[7])
-- TTL DÀI HƠN hash có chủ ý — cùng lý do với claim.lua: reaper tầng 1 nghe
-- keyspace expiry của session:{id}, và lúc event tới hash ĐÃ biến mất. Con trỏ
-- này sống thêm một khoảng grace để trả lời "session vừa hết hạn đang ở pod
-- nào". Đặt hai TTL bằng nhau là reaper mù.
w('EXPIRE', KEYS[3], ARGV[9])

if failed then
  undo()
  return redis.error_reply('claim_direct: abort roi hoan tac: ' .. failed)
end

return podName
