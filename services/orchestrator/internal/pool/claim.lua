-- claim.lua — claim MỘT pod ấm từ warm-pool, atomic trọn gói (phase-1 1.A-2).
--
-- VÌ SAO PHẢI LÀ MỘT SCRIPT, KHÔNG PHẢI LMOVE TRẦN + 4 LỆNH GO:
-- LMOVE thì atomic, nhưng 4 lệnh ghi sau nó thì không. Orchestrator crash giữa
-- chừng để lại pod nằm trong pool:claimed mà không có session nào trỏ tới —
-- reaper phải đoán. Script thì hoặc chạy trọn, hoặc chưa chạy.
--
-- KEYS[1] = pool:free        (LIST, FIFO — D6)
-- KEYS[2] = pool:claimed     (LIST, index cho reaper dò pod mồ côi)
-- KEYS[3] = session:{id}     (HASH, field pin ở services/shared/rediskeys)
-- KEYS[4] = session:{id}:pod (STRING)
--
-- ARGV[1] = sessionID
-- ARGV[2] = userID
-- ARGV[3] = namespace
-- ARGV[4] = tier
-- ARGV[5] = nowUnix      (createdAt + lastActiveAt + pod.updatedAt)
-- ARGV[6] = expiresAtUnix
-- ARGV[7] = ttlSeconds   (EXPIRE cho cả session:{id} lẫn session:{id}:pod)
--
-- Trả: podName (string) khi claim được; false/nil khi pool RỖNG — đó là
-- sentinel cho Go rẽ cold-path, KHÔNG phải lỗi.
--
-- GIỚI HẠN CLUSTER (D10, ghi để P3 không bất ngờ): key `pod:{name}` được dựng
-- ĐỘNG bên trong script từ giá trị LMOVE trả về, nên không khai báo được trong
-- KEYS. Trên Redis Cluster script này sẽ CROSSSLOT. P1 chạy Redis đơn — chấp
-- nhận có chủ ý; lên Cluster thì phải hash-tag `{dlp}` toàn bộ namespace.

-- LEFT = đầu cũ nhất (replenish RPUSH vào bên phải). Pop LEFT ⇒ FIFO: pod ngồi
-- lâu nhất được dùng trước, pod hỏng lộ sớm thay vì mục ruỗng cuối hàng.
local pod = redis.call('LMOVE', KEYS[1], KEYS[2], 'LEFT', 'RIGHT')
if not pod then
  return nil
end

redis.call('HSET', 'pod:' .. pod,
  'state', 'claimed',
  'sessionId', ARGV[1],
  'updatedAt', ARGV[5])

-- Field khớp rediskeys.SessionFields — orchestrator ghi, gateway đọc cho authz
-- vế g. Ghi lệch tên field ở đây là authz so sánh với chuỗi rỗng trong im lặng.
redis.call('HSET', KEYS[3],
  'userId', ARGV[2],
  'podName', pod,
  'namespace', ARGV[3],
  'status', 'CLAIMED',
  'tier', ARGV[4],
  'createdAt', ARGV[5],
  'expiresAt', ARGV[6],
  'revision', 1,
  'lastActiveAt', ARGV[5])

redis.call('SET', KEYS[4], pod)
redis.call('EXPIRE', KEYS[3], ARGV[7])
redis.call('EXPIRE', KEYS[4], ARGV[7])

return pod
