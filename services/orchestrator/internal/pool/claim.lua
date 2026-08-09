-- claim.lua — claim MỘT pod ấm từ warm-pool (phase-1 1.A-2).
--
-- ATOMIC NGHĨA LÀ GÌ Ở ĐÂY — đọc kỹ, đừng suy ra nhiều hơn:
-- Redis chạy script đơn luồng nên KHÔNG lệnh nào của client khác chen vào giữa
-- (isolation). Nhưng Redis Lua KHÔNG CÓ ROLLBACK: nếu một `redis.call` lỗi ở
-- giữa, mọi ghi TRƯỚC đó được giữ nguyên và replicate. "Chạy trọn hoặc chưa
-- chạy" là SAI nếu chỉ trông vào cơ chế của Redis.
--
-- Vì vậy script này TỰ hoàn tác: mọi ghi đi qua `w()` (dùng `redis.pcall`), và
-- khi có lỗi thì `undo()` đưa pod về lại `pool:free` rồi trả error_reply. Đó là
-- lý do phần thân dài hơn một chuỗi lệnh thẳng — chuỗi lệnh thẳng để lại pod
-- nằm trong `pool:claimed` mà không session nào trỏ tới, đúng loại trạng thái
-- mà reaper phải đoán. (Đo được: EXPIRE lỗi vì ttl quá lớn → session ghi xong
-- mà KHÔNG có TTL, giữ pod vĩnh viễn, trong khi caller nhận error và retry.)
--
-- KEYS[1] = pool:free        (LIST, FIFO — D6)
-- KEYS[2] = pool:claimed     (LIST, index cho reaper dò pod mồ côi)
-- KEYS[3] = session:{id}     (HASH — SSOT trạng thái session)
-- KEYS[4] = session:{id}:pod (STRING — con trỏ SỐNG LÂU HƠN hash, cho reaper)
-- KEYS[5] = pool:quarantine  (LIST, pod hỏng/trùng — KHÔNG tự quay lại pool)
--
-- ARGV[1] = sessionID      ARGV[5] = nowUnix
-- ARGV[2] = userID         ARGV[6] = expiresAtUnix
-- ARGV[3] = namespace      ARGV[7] = ttlSeconds
-- ARGV[4] = tier           ARGV[8] = podKeyPrefix (từ rediskeys — SSOT, không hardcode ở đây)
--                          ARGV[9] = podPointerTTL (> ttlSeconds; xem KEYS[4])
--
-- Trả: podName khi claim được; false/nil khi pool RỖNG (sentinel cho cold-path,
-- KHÔNG phải lỗi); error_reply khi có sự cố thật (đã hoàn tác xong).
--
-- GIỚI HẠN CLUSTER (D10): `pod:{name}` dựng động từ giá trị LMOVE trả về nên
-- không khai báo được trong KEYS. Trên Redis Cluster script này sẽ CROSSSLOT.
-- P1 chạy Redis đơn — chấp nhận có chủ ý; lên Cluster thì hash-tag `{dlp}`.

local podPrefix = ARGV[8]

-- Gọi hai lần với cùng sessionID là LỖI LẬP TRÌNH, không phải idempotency:
-- dedupe theo idempotency_key sống ở tầng trên (`idem:{userId}:{key}`). Không
-- chặn ở đây thì lần hai ghi đè hash và pod của lần một rò VĨNH VIỄN — nó vẫn
-- nằm trong pool:claimed nhưng `session:{id}` TỒN TẠI nên heuristic mồ côi của
-- reaper (pod trong claimed mà không có session) không bao giờ thấy.
if redis.call('EXISTS', KEYS[3]) == 1 then
  return redis.error_reply('claim: session da ton tai, khong claim de len')
end

-- ── Chọn pod: rút tới khi gặp một pod THẬT SỰ đang free ──────────────────────
-- Không tin `pool:free` một cách mù quáng. Một tên pod lọt vào list hai lần
-- (replenish retry sau timeout, reaper trả pod hai lần, hai instance cùng
-- replenish) sẽ được claim hai lần, và HAI sinh viên exec vào CÙNG một pod —
-- cả hai đều qua authz vì hash của mỗi người ghi đúng userId của người đó.
-- Redis LIST không chống trùng, nên chỗ chống phải là đây.
local MAX_SCAN = 16
local pod = nil
for _ = 1, MAX_SCAN do
  local candidate = redis.call('LMOVE', KEYS[1], KEYS[2], 'LEFT', 'RIGHT')
  if not candidate then
    return nil -- pool rỗng thật → cold path
  end

  -- Trong Lua chuỗi rỗng là TRUTHY, nên `if not candidate` KHÔNG bắt được ''.
  -- Bỏ qua thì sinh ra key rác tên đúng `pod:` và một session trỏ vào hư không.
  if candidate == '' then
    redis.call('LREM', KEYS[2], 1, '')
  else
    -- pcall chứ không call: nếu `pod:{name}` sai kiểu (string thay vì hash) thì
    -- `HGET` trả WRONGTYPE và một `redis.call` sẽ ABORT script NGAY — sau khi
    -- LMOVE đã chạy, tức là để lại đúng cái pod mồ côi mà toàn bộ phần hoàn
    -- tác bên dưới tồn tại để ngăn. Sai kiểu ⇒ pod hỏng ⇒ cách ly, như mọi
    -- pod không-free khác.
    local state = redis.pcall('HGET', podPrefix .. candidate, 'state')
    if state == 'free' then
      pod = candidate
      break
    end
    -- Không free (đã claimed / hash biến mất / tên trùng): cách ly.
    -- KHÔNG đẩy lại pool:free — làm thế là vòng lặp vô tận trên cùng pod hỏng.
    redis.call('LREM', KEYS[2], 1, candidate)
    redis.call('RPUSH', KEYS[5], candidate)
  end
end

if not pod then
  -- Quét hết MAX_SCAN mà toàn pod hỏng: coi như pool rỗng (cold path vẫn phục
  -- vụ được sinh viên, còn lỗi thì không). `pool:quarantine` dài ra là tín hiệu
  -- cho ops — B9 đếm nó.
  return nil
end

-- ── Ghi trạng thái, có hoàn tác ──────────────────────────────────────────────
local failed = nil

local function w(...)
  if failed then return end
  local r = redis.pcall(...)
  if type(r) == 'table' and r.err then failed = r.err end
end

local function undo()
  -- Thứ tự ngược lại. Dùng redis.call (không pcall): nếu chính bước hoàn tác
  -- lỗi thì im lặng còn tệ hơn — để nó nổi lên.
  redis.call('DEL', KEYS[3], KEYS[4])
  redis.call('HSET', podPrefix .. pod, 'state', 'free')
  redis.call('LREM', KEYS[2], 1, pod)
  -- LPUSH (không RPUSH): trả pod về ĐẦU TRÁI, đúng chỗ nó vừa bị rút ra, nên
  -- thứ tự FIFO của pool không bị xáo sau một lần abort.
  redis.call('LPUSH', KEYS[1], pod)
end

-- userId/tier ghi CẢ vào hash pod, không chỉ hash session.
--
-- KHÔNG phải nhân bản thừa: khi `session:{id}` hết hạn, hash đó BIẾN MẤT, và
-- reaper cần biết session vừa chết thuộc về ai / tier nào để ghi được dòng audit
-- `expired`. Không có hai field này thì đường đời phổ biến NHẤT (hết hạn tự
-- nhiên) không để lại sự kiện kết thúc nào trong `sessions_audit`, và câu hỏi
-- forensic mà B8 sinh ra để trả lời không trả lời được cho đa số phiên.
-- Cùng lý do với việc `session:{id}:pod` sống lâu hơn hash.
w('HSET', podPrefix .. pod,
  'state', 'claimed',
  'sessionId', ARGV[1],
  'userId', ARGV[2],
  'tier', ARGV[4],
  'updatedAt', ARGV[5])

-- Field khớp rediskeys.SessionFields — orchestrator ghi, gateway đọc cho authz
-- vế g. Ghi lệch tên field ở đây là authz so sánh với chuỗi rỗng trong im lặng.
w('HSET', KEYS[3],
  'userId', ARGV[2],
  'podName', pod,
  'namespace', ARGV[3],
  'status', 'CLAIMED',
  'tier', ARGV[4],
  'createdAt', ARGV[5],
  'expiresAt', ARGV[6],
  'revision', 1,
  'lastActiveAt', ARGV[5])

w('SET', KEYS[4], pod)
w('EXPIRE', KEYS[3], ARGV[7])
-- TTL DÀI HƠN hash có chủ ý: reaper tầng 1 nghe `__keyevent@0__:expired` của
-- `session:{id}`, và lúc event tới thì hash ĐÃ biến mất — không còn chỗ nào đọc
-- được podName để xoá pod. Con trỏ này sống thêm một khoảng grace chính là để
-- trả lời "session vừa hết hạn đang ở pod nào". Đặt bằng nhau là reaper mù.
w('EXPIRE', KEYS[4], ARGV[9])

if failed then
  undo()
  return redis.error_reply('claim: abort roi hoan tac: ' .. failed)
end

return pod
