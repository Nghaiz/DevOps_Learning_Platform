# Redis key namespace v0 — SSOT

Quy ước này có **hai** bản hiện thực. Đây là bản gốc; code phải theo tài liệu, không ngược lại.

| Ngôn ngữ | File | Test vector |
|---|---|---|
| TypeScript | `packages/shared-types/src/redis-keys.ts` | `redis-keys.test.ts` |
| Go | `services/orchestrator/internal/rediskeys/keys.go` | `keys_test.go` |

Hai bộ test vector được viết **giống hệt nhau một cách cố ý**. Sửa một bên mà quên bên kia
thì test bên đó vẫn xanh nhưng hai service sẽ đọc/ghi hai không gian key khác nhau — dạng
lỗi câm lặng, chỉ lộ ra khi warm-pool "mất" pod.

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
2. Hiện thực ở **cả hai** file.
3. Thêm cùng một test vector vào **cả hai** file test.
