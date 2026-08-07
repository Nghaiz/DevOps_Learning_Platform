# Redis key namespace v0 — SSOT

Quy ước này có **hai** bản hiện thực. Đây là bản gốc; code phải theo tài liệu, không ngược lại.

| Ngôn ngữ | File | Test |
|---|---|---|
| TypeScript | `packages/shared-types/src/redis-keys.ts` | `redis-keys.test.ts` |
| Go | `services/orchestrator/internal/rediskeys/keys.go` | `keys_test.go` |

**Cả hai suite test đọc chung đúng một file dữ liệu: [`redis-key-vectors.json`](redis-key-vectors.json).**

Đây là điểm quan trọng. Bản đầu tiên của tài liệu này bảo "hai bộ vector được viết giống hệt
nhau một cách cố ý" — nhưng hai bản chép tay thì sửa một bên mà quên bên kia sẽ khiến **cả hai
vẫn xanh**. Đó là guard không gác gì, mà còn tệ hơn không có guard vì nó mua sự tự tin bằng
không có gì. Giờ vector nằm ở một file JSON duy nhất:

- Sửa một bản hiện thực → suite bên đó đỏ ngay.
- Thêm key mới → sửa JSON → **cả hai** suite đỏ tới khi cả hai bắt kịp.
- File nằm cạnh tài liệu này, nên "sửa doc" và "sửa vector" là một thao tác.

> Vì sao không codegen từ proto: đây là quy ước đặt tên chuỗi, không phải shape dữ liệu đi
> qua dây. Nhét vào proto sẽ bẻ cong mục đích của contract. Đánh đổi được chấp nhận: 3 hàm,
> gác bằng test vector song sinh.

## Key

| Key | Kiểu | Nội dung | TTL |
|---|---|---|---|
| `pool:free` | set/list | id của pod đang **WARM**, chờ claim | không |
| `session:{id}` | hash | Trạng thái session đang sống — **SSOT** | `SESSION_TTL` (mặc định 1h), đặt lúc claim |
| `session:{id}:pod` | string | session → tên pod đang phục vụ | theo `session:{id}` |

## Ràng buộc

**`{id}` phải khớp `^[A-Za-z0-9_-]{1,64}$`.** Session id đi thẳng vào key, nên `:` trong id
sẽ bẻ được namespace: id `a:pod` biến `session:a:pod` thành key `:pod` của session `a`.
Cả hai bản hiện thực chặn ở biên và **trả lỗi** thay vì tự làm sạch chuỗi — làm sạch âm thầm
thì hai session khác nhau có thể ánh xạ về cùng một key.

**TTL đặt lúc CLAIM, không phải lúc create.** Pod nằm trong warm-pool không được tự hết hạn;
nó chỉ bắt đầu đếm khi có user thật.

**Không nhân bản sang Postgres.** `sessions_audit` ghi chuyện đã xảy ra, không trả lời được
"session X đang chạy ở đâu" (`plan.md` §4 — SSOT & no-derived-fields).

## Khi thêm key mới

1. Thêm dòng vào bảng trên.
2. Thêm vector vào [`redis-key-vectors.json`](redis-key-vectors.json) — làm bước này TRƯỚC,
   cả hai suite sẽ đỏ và chỉ đúng chỗ còn thiếu.
3. Hiện thực ở **cả hai** file (`redis-keys.ts` và `keys.go`) cho tới khi hết đỏ.
