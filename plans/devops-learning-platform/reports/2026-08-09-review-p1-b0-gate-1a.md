# Rà soát độc lập — 1.B0 + Gate 1.A (PR #24, #25)

**Ngày:** 2026-08-09 · **Phạm vi:** commit `2b1b928` (PR #24) → `76a69e2` (HEAD `feat/p1-a-spikes`, PR #25 + 3 commit vá)
**Câu hỏi được hỏi:** giai đoạn đầu P1 đã ổn chưa · có đúng kế hoạch không · có lỗ hổng không · "nhiều lần chắp vá" có phải dấu hiệu xấu không.

---

## Kết luận

**Đủ điều kiện cook tiếp 1.B/1.C.** Không tìm thấy lỗ hổng khai thác được trong phần đã merge.
Ba khoảng trống dưới đây là **nợ chuyển tiếp sang B2/B7/B9**, không phải lỗi của phần đã làm — nhưng phải ghi vào plan trước khi cook, nếu không chúng sẽ biến mất.

Về "chắp vá": 4 commit vá sau PR #25 (`ef8412f`, `2571ca0`, `f1c0dfe`, `76a69e2`) **không** phải sửa lỗi thiết kế. Một cái là review đối kháng bắt 2 lỗi CHẶN của `claim.lua` *sau khi* cổng đã xanh; ba cái còn lại là lệch môi trường Windows↔CI (CRLF, build tag `unix`) — và cả ba đã được đóng bằng **cổng** (`.gitattributes` khoá LF, `GOOS=linux` trong `make go-lint`) chứ không phải sửa tay từng file. Đó là dấu hiệu quy trình đang **hội tụ**, không phải đang trôi.

---

## Đã kiểm chứng độc lập

| Khẳng định trong PR | Cách tôi kiểm | Kết quả |
|---|---|---|
| Mật khẩu không lọt vào Deployment | đọc `datastore-secret.yaml` + `values.yaml` | ✔ `password: ''` không có default; `required` chặn helm; URL ghép trong Secret, tới pod qua `secretKeyRef`; `urlquery` đúng chỗ |
| Datastore không phơi ra ngoài | grep `type:` trong template | ✔ cả hai `ClusterIP`, không NodePort |
| Spike WS không lọt vào image production | đọc `services/terminal-gateway/Dockerfile` | ✔ chỉ build `./cmd/terminal-gateway`; `cmd/spike-exec` (bridge exec **không có authz**) không nằm trong image |
| Test HARD-GATE thật sự chạy trong CI | đọc job Go trong `ci.yml` | ✔ Redis service thật + `-race -count=20` + **chặn skip** (`grep '"Action":"skip"'` → đỏ). Đây là chỗ nhiều dự án tự lừa mình, ở đây đã đóng |
| CI có cổng bảo mật | grep workflow | ✔ gitleaks (full history) · govulncheck (mọi module Go) · Trivy (image) · buf breaking · env-drift · kubeconform |
| CI xanh trên main | `gh run list` | ✔ `d66ff34` success |
| `claim.lua` tự hoàn tác đúng | đọc từng dòng | ✔ `w()`/`undo()`, `pcall` cho `HGET` (chặn WRONGTYPE abort), bắt chuỗi rỗng (Lua `''` là truthy), `EXISTS` chặn claim đè, TTL con trỏ dài hơn hash cho reaper |

---

## Ba khoảng trống — phải ghi vào plan TRƯỚC khi cook 1.B

### G-1 (CAO) — `pool:quarantine` là đường rò quota, chưa ai dọn

`claim.lua` đẩy pod hỏng sang `pool:quarantine` và **không bao giờ trả lại**. Nhưng pod đó vẫn là một Pod đang chạy trong `dlp-sandbox`, vẫn ăn quota.

Trần quota hiệu lực là **4 pod** (D16). Reaper B7 dọn hai loại: *pod mồ côi* (`app=sandbox` mà `pod:{name}` **không tồn tại**) và *session ma*. Pod bị cách ly **vẫn có** hash `pod:{name}` ⇒ không rơi vào loại nào ⇒ không ai xoá nó.

Hệ quả: mỗi pod bị cách ly là **−1 trên tổng 4**. Ba lần cách ly là nền tảng chết, và không có metric nào nói vì sao.

→ **B7 thêm nhánh dọn `pool:quarantine`** (xoá pod + hash + `LREM`), **B9 thêm `dlp_pool_quarantine_size`**. `README.md` của `internal/pool` đã viết "B9 đếm nó" nhưng danh sách metric ở B9 trong `phase-1.md` **không có** — nghĩa vụ đang nằm ở tài liệu không ai đọc lúc code.

### G-2 (CAO) — B2 chưa bị ràng buộc thứ tự ghi khi replenish

`claim.lua` chỉ nhận pod có `pod:{name}.state == 'free'`. Nếu B2 `RPUSH pool:free` **trước** khi `HSET pod:{name} state free`, có một cửa sổ mà claim đồng thời đọc thấy state rỗng → **cách ly một pod hoàn toàn tốt**, vĩnh viễn (xem G-1).

README hiện chỉ ràng buộc *đầu nào của LIST* (RPUSH, giữ FIFO), **không** ràng buộc *thứ tự giữa hash và list*.

→ Ghi thành luật cứng của B2: **`HSET pod:{name} state=free` xong mới `RPUSH pool:free`**; thêm một test đảo thứ tự để chứng minh nó đỏ.

### G-3 (TRUNG BÌNH) — `Claim()` không phân biệt "thất bại" với "thành công nhưng mất phản hồi"

Nếu lời gọi Redis timeout ở tầng mạng *sau khi* script đã chạy trọn, caller nhận error. Retry cùng `sessionID` sẽ đụng guard `EXISTS` → error `"session da ton tai"`. B3 đọc là thất bại → rẽ cold-path → **tạo pod thứ hai** trong khi pod thứ nhất đã bị claim cho đúng session đó.

Đường `idempotency_key` không cứu ca này: nó dedupe ở *ngoài* `Claim()`, còn đây là retry *bên trong*.

→ B3 phải coi `"session da ton tai"` là **tín hiệu đọc-lại**, không phải lỗi: `HGETALL session:{id}` — có `podName` thì trả về nó như claim thành công.

---

## Nợ đã ghi tường minh (không phải phát hiện mới, chỉ nhắc để không quên)

- **R0 / Calico — AC còn mở, sớm nhất đóng 2026-08-11 ~03:35.** Rủi ro score 25 vẫn là rủi ro sống. Cook 1.B/1.C không bị chặn, nhưng **D-19′ (đổi kubelet) thì bị chặn cứng** — đừng chạm kubelet trước khi ô đó xanh (R22).
- **Cookie cùng origin** — nợ đúng: topology đã chứng minh (101 qua Caddy), phần còn lại cần G1+G12.
- **Migration Postgres chưa tự động** — dựng lại cluster từ đầu sẽ làm `/api/auth/jwks` trả 500 và toàn bộ G2 sập. Nên đóng trước khi có người thứ hai dựng lab.
- **R24 (JWKS qua HTTP trần trong ns platform, không NetworkPolicy)** — đây là **điểm tin cậy duy nhất** của luật 6 + luật 10, đang hoãn tới P3. Chấp nhận được ở lab 1-node; phải đóng trước khi có người ngoài chạm cluster.

---

## Về "đúng kế hoạch không"

Đúng, và đúng theo cách khó hơn: plan bị **sửa bởi số đo**, không phải bởi ý kiến. Ba giả định của plan sai và đã được sửa từ thực nghiệm (`tty+stderr` không lỗi mà **im lặng**; read-limit đóng `1009` chứ không `4413`; `exit 137` không phân biệt reap với `kill -9`). Một plan không bao giờ sai khi chạm hạ tầng là một plan chưa ai chạm hạ tầng.

Trình tự cũng đúng: `1.B0 → Gate 1.A → 1.B ∥ 1.C`. Không có task nào vượt gate.
