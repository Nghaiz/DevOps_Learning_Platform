# 3.C — đóng nợ AC-C2 + AC-C3, và một chỗ rò mà plan đã khẳng định là không có

**Ngày:** 2026-08-15 · **Chặng:** P3/3.C (nợ còn lại) · **Nhánh:** `p3-3c-debt-3f-k6`
**Bằng chứng:** [`harness/2026-08-15-3c-debt/reaper-verify-all.txt`](harness/2026-08-15-3c-debt/reaper-verify-all.txt)
**Chạy trên:** cụm lab 1 node, orchestrator `3c2-3f9f6c8`, helm revision 67

| Ô | Kết quả |
|---|---|
| **AC-C2** reaper dọn 100% session hết hạn + đối chứng âm | ✅ đóng |
| **AC-C3** restart không rò, session vẫn dùng được | ✅ đóng cả hai vế |
| *(ngoài plan)* chỗ rò session-ma trong `pool:claimed` | ✅ tìm ra, vá, đo trước/sau |

`reaper-verify.sh --case all`: **14/14**.

---

## 1. Plan §0.2 sai ở tiền đề, và cái sai đó che một chỗ rò thật

Plan viết: *"Reaper đã cứng từ P1 … Task 8 co từ 'hardening reaper' xuống **một
knob + một phép đo**."* Đi làm phép đo ấy thì đo ra cái này, trước khi sửa gì:

```
pool:claimed   → 6 tên pod
kubectl -n dlp-sandbox get pods → 1 pod thật trong số đó
5 session còn lại: status=FAILED, pod đã biến mất khỏi apiserver
```

Không tầng nào của reaper nhặt được năm mục thừa:

- **tầng 2b** bỏ qua mọi status cuối ([`reaper.go:610`](../../../services/orchestrator/internal/reaper/reaper.go#L610)).
  Đây là hành vi **đúng** — đánh dấu lại một session đã ở trạng thái cuối là tăng
  revision vô cớ, và một gateway đang cầm revision đúng sẽ bỗng thấy lệch.
- **tầng 2c** chỉ dọn khi `EXISTS session:{id}` == 0 ([`reaper.go:498`](../../../services/orchestrator/internal/reaper/reaper.go#L498)),
  mà hash `FAILED` **vẫn còn** tới hết TTL. Chú thích tại chỗ đọc là *"session còn
  sống — pod đang phục vụ nó"*; với một session `FAILED` thì cả hai vế của câu đó
  đều sai.

Chỗ rò **tự lành** sau `SESSION_TTL` (1h): key rụng, tầng 2c nhặt. Nhưng trong
cửa sổ đó `dlp_pool_claimed_size` — panel "pod pool" của 3.D, và là đại lượng
3.F định dùng để khẳng định *"0 pod rò"* — báo **sai gấp 6 lần**. Một gauge sai
không phải phiền toái nhỏ; nó làm mọi phép đo dựa trên nó vô nghĩa, và 3.F định
dựa vào nó.

**Vá:** `MarkFailed` gọi luôn `cleanupPod` — hàm đã idempotent, `pods.Delete` đã
nuốt `NotFound` nên không sinh log lỗi giả cho một pod đã biến mất. **Không**
chạm hash session: FE vẫn đọc được lý do phiên chết.

### Trước/sau trên cụm, cùng một script

Chạy `--case ghost` trên bản **chưa vá**:

```
PASS  t0: cả hai pod nằm trong pool:claimed
PASS  tầng 2b nhận ra session ma                        status=FAILED
FAIL  session ma KHÔNG để lại tên trong pool:claimed    pool:claimed=yes, pod:{name}=1
PASS  hash session ma VẪN còn (FE đọc được lý do)
PASS  đối chứng âm: session còn sống KHÔNG bị đụng      pod=Running, vẫn trong pool:claimed
```

Bốn vế xanh **quanh** một vế đỏ — nên vế đỏ không thể là "script chạy sai địa
chỉ". Sau khi vá, cùng script: **5/5**. Unit test
`TestMarkFailedDonIndexPoolCuaSessionMa` cũng có mutation đỏ đúng dòng khẳng định.

---

## 2. AC-C2 — và vì sao phép đo KHÔNG đặt trên `GetSession`

Cái bẫy chính của ô này: `GetSession` trả `NotFound` ngay khi hash `session:{id}`
rụng — mà nó rụng vì **TTL của Redis**, không vì reaper làm gì. Một ô AC khẳng
định trên `NotFound` sẽ **xanh y hệt trên một cụm đã gỡ hẳn reaper**. Việc của
reaper là xoá **pod** và gỡ tên khỏi `pool:claimed`, nên mọi khẳng định nằm ở
apiserver và ở index Redis.

Ba vế trong **cùng một lượt đo**, và hai vế sau mới làm vế đầu có nghĩa:

| Vế | Đo được |
|---|---|
| t0 — đối chứng dương | 3/3 pod SỐNG và nằm trong `pool:claimed` ⇒ phép quan sát có khả năng thấy "còn" |
| t1 — vế chính | **2/2** pod của session hết hạn bị XOÁ, **9s** sau mốc hết hạn `05:02:59Z` (poll 5s) |
| t1 — đối chứng âm | session `ttl=900s` trong cùng lượt **còn nguyên**: pod `Running`, vẫn trong `pool:claimed` |

Thiếu vế cuối thì "dọn 100%" không phân biệt được với "xoá bừa" — một reaper xoá
sạch mọi pod cũng làm vế chính xanh.

**Tầng nào đã làm việc:** `keyspace_events 2→4`, `claimed_orphan 0→0`. Tức **tầng 1**
(nghe keyspace event) dọn, tầng 2c chưa phải đỡ lần nào. 9s ≈ độ trễ event + hạt
poll, không phải chờ hết một chu kỳ `REAP_INTERVAL=60s`.

**Mốc thời gian lấy từ server.** `expires_at` do chính orchestrator ghi, cùng đồng
hồ với Redis đang đếm TTL — không để script tự cộng `now + ttl`, vì đồng hồ VM
nhanh hơn đồng hồ Windows ~59s và một mốc cộng nhầm vẫn trông hợp lý.

**TTL ngắn là thứ làm ô này đo được trong một lượt.** `SESSION_TTL` của cụm là 1h.
Server đã nhận `ttl_seconds` từ đầu ([`session.proto:70`](../../../proto/orchestrator/v1/session.proto#L70));
`lifecycle-probe` chỉ thiếu đường truyền xuống — nay có cờ `-ttl`, và cờ đó bị
**chặn ở các ca khác** (ép TTL ngắn vào ca `hardcap` làm nó đỏ vì phép đo sai chứ
không vì hệ sai).

---

## 3. AC-C3 — vế "session vẫn dùng được" mà lượt trước không đo được

Lượt đo 3.C trước đóng được vế pool nhưng bỏ ngỏ vế *"session vẫn dùng được"*, vì
lúc đo **không có session sống nào để hỏi**. Nay `lifecycle-probe -case check
-session <id>` hỏi được một session đã tồn tại.

Ca này kiểm **cả đọc lẫn ghi**. Chỉ `GetSession` là chưa đủ: nó xanh cả khi
orchestrator vừa khởi động lại đã mất đường ghi Redis — đọc được hash cũ và báo
"vẫn dùng được" về một hệ không nhận thêm được lệnh nào. `ExtendSession` là lời
ghi rẻ nhất chứng minh đường ghi còn sống; `revision` tăng đúng 1 chứng minh lời
ghi ấy tới đúng session này.

| Vế | Đo được |
|---|---|
| trước restart | `GetSession` + `ExtendSession` đều OK |
| sau restart | `GetSession` + `ExtendSession` đều OK |
| đúng pod cũ | `startTime 05:03:26Z` **không đổi** ⇒ không phải một pod mới trùng vai |
| pool | `claimed 1→1`; `phantom=0 orphan=0` |

---

## 4. Ba lỗi của chính phép đo — ghi ra vì cả ba đọc ra là "hệ hỏng"

1. **Trap dọn không bao giờ chạy.** `logs="$(probe ...)"` chạy probe trong
   **subshell**, nên `PROBE_PODS+=(...)` chỉ sửa bản sao của subshell. Lượt đầu
   để lại 2 pod `Completed` ăn khe trên trần 4 pod. Nay dọn theo **nhãn** —
   nhãn sống trong apiserver, không phụ thuộc tiến trình nào.

2. **Khẳng định sai bất biến.** Ô "pool không rò" bắt `free` đứng yên rồi đỏ vì
   `free 0→1` — mà đó là pool manager bổ sung về `POOL_TARGET` sau restart, tức
   **làm đúng việc**. Một ô đỏ vì hành vi đúng sẽ bị người sau nới cho tới khi
   không kiểm gì. "0 pod rò" thật sự nghĩa là index Redis khớp cụm **hai chiều**:
   - `phantom` — tên trong index mà không có pod thật (chỗ rò làm gauge nói dối);
   - `orphan` — pod thật mà không ai đánh index (chỗ rò **ăn quota**).

   Grace 5 phút cho pod cold-path đang sinh, khớp `orphanGrace` của tầng 2a.

3. **`\n` trong jsonpath thành dòng mới thật** qua các lớp escape ⇒
   `cluster_names` trả rỗng ⇒ **mọi** tên trong index bị đọc là phantom. Ô đỏ đó
   nằm ngay cạnh một ô vừa khẳng định chính pod ấy đang `Running` — **hai ô mâu
   thuẫn nhau là dấu hiệu lỗi ở người quan sát, không ở hệ.** Đổi sang
   `custom-columns` + awk: không còn escape nào để hỏng.

---

## 5. Chi tiết vận hành đáng ghi

- **Probe pod phải mang nhãn của `web`.** Từ 3.B, ingress vào orchestrator chỉ mở
  cho `component ∈ {web, gateway}`. Pod không nhãn bị **thả gói**, triệu chứng là
  timeout — đọc ra y hệt "orchestrator chết".
- **Và phải vĩnh viễn NotReady.** Selector của Service `platform-web` **đúng bằng**
  ba nhãn đó, nên một probe pod `Ready` sẽ vào endpoint và **nhận lưu lượng người
  dùng thật**. `netpol-verify.sh` dùng `exec: false`; ở đây image distroless
  không có `false` để exec, nên dùng `tcpSocket` tới cổng không ai nghe.
- **`--dry-run` làm `lookup` trả rỗng** ([`mtls-secret.yaml:18`](../../../infra/helm/platform/templates/mtls-secret.yaml#L18)).
  Diff giữa render dry-run và `helm get manifest` vì thế hiện **toàn bộ PKI mTLS**
  như "khác nhau" — đó là hiện vật của dry-run, **không** phải drift. `helm upgrade`
  thật giữ nguyên PKI: `ca.crt` sha `9bb49315…` trước = sau.
- **Cổng shellcheck bỏ sót `infra/k8s`.** `scandir` chỉ nhận một thư mục, nên hai
  script kiểm-chứng ở đó nằm ngoài cổng suốt từ 3.B. Đã thêm bước thứ hai; cả hai
  script sạch ở `severity: error` nên không mang nợ mới vào.

---

## 6. Cổng đã chạy

```bash
GOOS=linux go build ./... ; go vet ./...            # rc=0
gofmt -l cmd/ internal/                             # rỗng
go test ./... (services/orchestrator)               # ok, SKIP=0
  mutation: vô hiệu hoá cleanupPod                  # FAIL đúng dòng khẳng định
shellcheck -S error infra/k8s/*.sh                  # rc=0
bash /tmp/reaper-verify.sh --case all               # 14/14
```

`SKIP=0` là vế phải đọc, không phải exit code: `go test` trả 0 khi mọi ca tự skip.

---

## 7. Còn lại

1. **Trần đồng thời của lab là 3 session, không phải "vài trăm".** `requests.cpu
   2100m ÷ 500m = 4 pod`, trừ `POOL_TARGET=1` ⇒ **3**. Node còn rảnh (requests
   2730m/8000m CPU) — trần này do **quota** đặt ra, không do phần cứng. Ô AC của
   3.F phải chốt lại trước khi viết k6.
2. **Rate-limit biên sẽ cắn k6 trước khi VM cắn:** web 120/1m burst 60, **WS
   handshake 20/1m burst 10**; và NodePort SNAT làm **mọi VU dùng chung một bucket
   IP**. 3.F cần quyết định đo trần *cấu hình* hay nới ra để tìm trần *phần cứng*.
3. **PKI mTLS và mật khẩu datastore đã lộ ra transcript phiên làm việc** khi tôi
   chạy một lệnh `diff` không lọc trên manifest helm. Cụm lab host-only, CA tự ký,
   nhưng ai cầm khoá thì mạo danh được `web`/`gateway`/`orchestrator` với cổng gRPC.
   Xoay khoá = xoá Secret `platform-mtls` + `helm upgrade` + restart ba service —
   **chưa làm, chờ quyết định.**
4. **`reaper-verify.sh` chưa vào CI** (nó cần một cụm thật). Chỉ shellcheck được
   gác; phần chạy vẫn là thao tác tay trên VM.
