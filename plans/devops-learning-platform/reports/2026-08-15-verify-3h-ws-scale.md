# 3.H — WS scale layer: drain êm, lease khe tự lành, hai replica

**Ngày:** 2026-08-15 · **Chặng:** P3 / 3.H · **Plan:** [`phase-3-detailed.md` §3.H](../phase-3-detailed.md#3h--ws-scale-layer)
**Cụm:** kubeadm 1.34.10 + Sysbox, 1 node (8 vCPU, 11.5 Gi allocatable), `192.168.94.130`

> Ba phần tư sketch task 5 đã xong hoặc không có đối tượng. Việc thật nằm ở ba
> khuyết tật sketch không nhìn tới — và một trong ba cái đó chỉ lộ ra khi đo trên
> cụm, sau khi unit test đã xanh.

---

## 1. Sketch task 5 sai ở đâu

Sketch viết bốn vế. Scout bác ba.

| Sketch nói | Đo được | Kết luận |
|---|---|---|
| "session→pod ở Redis" | Đã có từ P1. `wsroute.go:194` đọc hash `session:{id}` **mỗi lần connect**; `Target` mang sẵn pod. | Không có gì để dựng. |
| "gateway scale ngang (đã stateless từ P1)" | Khẳng định ĐÚNG, và đã kiểm chứ không tin: grep toàn bộ `*.go` cho `sync.Map`/`map[string]`/`var (` package-level — không map/registry session→conn nào. `connState` cấp phát trên **stack** của `Serve` (`bridge.go:311`). State in-memory duy nhất là cache JWKS, deny-limiter của log, và gauge. | `replicaCount` là một con số, không phải một dự án. |
| "session-affinity ở Traefik" | Bề mặt trống ở cả hai đường (`gateway-service.yaml` không có `sessionAffinity`; không `TraefikService`, không annotation sticky nào). | **BỎ có lý do** — xem §2. |
| "tune WS ping/idle" | Ping 20s/pong 10s **cố ý hardcode** (`heartbeat.go:54-55`, lý do G11). Idle-window tầng app **không tồn tại**: mã `4408` đã gỡ khỏi contract ở 1.G-1. Traefik chạy **không một arg timeout nào** (đọc trên deployment sống). | Nhánh này gần như rỗng. |

### Vì sao BỎ sticky thay vì dựng

Affinity không cần cho tính đúng đắn — mọi state per-session nằm ở Redis. Tệ hơn:
**nó che mọi lỗi cross-replica**, làm ô AC "scale ngang chạy đúng" xanh kể cả khi
hệ không thực sự stateless. Thay bằng AC-H3, ô **ép** client nối lại trúng replica
khác và đòi attach đúng pod cũ. Đó là bằng chứng cho tính stateless; sticky chỉ là
bằng chứng cho việc ta đã tránh phải chứng minh.

---

## 2. Ba khuyết tật, một chuỗi

**Khuyết tật 1 — `http.Server.Shutdown` không đụng kết nối đã hijack.**
WS sau 101 chính là hijack. Lúc SIGTERM, `Shutdown` trả về gần như tức thì, `main`
return, process thoát, mọi goroutine phiên chết giữa chừng ⇒ `defer` trả khe WS
**không chạy**. `SHUTDOWN_GRACE=15s` chỉ che các request HTTP thường; nó chưa bao
giờ bảo vệ WS.

Khe kẹt lại với TTL = `expiresAt − now` (`store.go:208`) và **không heartbeat nào
làm mới nó**. `acquire_ws.lua:9-15` đã ghi đúng chế độ hỏng này ("session của sinh
viên khoá VĨNH VIỄN ở trạng thái đang mở ở tab khác") — nó chỉ chưa lường rằng một
TTL dài bằng cả phiên thì "đường thoát duy nhất" ấy dài ngang việc không có đường thoát.

**Khuyết tật 2 — contract hứa `1012` mà gateway chưa bao giờ phát.**
`docs/ws-terminal-protocol.md` §6 khai `1012 SERVICE_RESTART`, FE nên retry: **có**.
FE đã implement **và có test** (`protocol.ts:99,134`, `protocol.test.ts:152`,
`backoff.test.ts:37`). Grep `1012|SERVICE_RESTART` trong `services/` → **0 hit**.

Cùng loại khuyết tật với `4408` mà 1.G-1 đã gỡ, **khác kết luận**: `4408` bị gỡ vì
hệ không có khái niệm đó; `1012` thì hệ có (rollout xảy ra mỗi lần deploy) — nên
đường đúng là nối dây, không phải gỡ mã.

**Khuyết tật 3 — FE không jitter, dựa trên tiền đề mà rollout làm sai.**
`backoff.ts:5-8` bỏ jitter với lý do ghi rõ: *"trần D17 là 1 WS trên một session…
**Không có đàn client nào cùng nối lại một lúc** để mà phải rải ra."* Tiền đề đúng
cho đứt mạng lẻ tẻ, **sai chính xác vào lúc rollout**: drain đóng mọi phiên cùng một
khoảnh khắc nên mọi client chạy cùng lịch 1/2/4/8/15s **không lệch pha**. Và
`values.yaml:349-353` — chú thích của chính trần rate-limit WS — đã tự cảnh báo đúng
ca đó, kèm ghi nhận trần **chưa đo trên tải thật**.

**Chuỗi:** rollout → WS bị cắt cứng (1) → client nối lại đồng pha (3) → đâm trần WS
20/1m burst 10 dùng chung **một** bucket vì SNAT → mà khe WS của họ đang kẹt (1).

---

## 3. Baseline — đo TRƯỚC khi sửa bất cứ thứ gì

Ô AC-H1 đòi đối chứng dương phải đo trước chặng; đo sau khi vá thì vĩnh viễn mất vế đó.
Dùng `rollout restart` (không đụng helm values, nên tránh luôn bẫy image tag).

```
phiên close        đóng sau   nối lại  429 trước  pod khớp
s1    đứt-trần     16.36s     429      true       false
s2    đứt-trần     16.36s     429      true       false

TỔNG: 1012=0/2 · đứt-trần=2/2 · nối lại được=0/2 · pod khớp=0/2 · 429-lượt-đầu=2/2
```

**Đọc:** mỗi lần deploy hôm nay là mọi người đang học bị văng, **và không vào lại
được** — không phải "chậm một nhịp", mà `dialChoNha` retry đủ 10s vẫn 429.

---

## 4. Lỗi mà unit test KHÔNG THỂ thấy

Bản đầu đặt `WaitGroup` + kênh drain ngay trong `podexec.Bridge`, `Serve` tự
`wg.Add(1)` / `defer wg.Done()`. **Ba unit test xanh.** Trên cụm:

```
phiên close   nối lại  429 trước
s1    1012    429      true
s2    1012    429      true
```

Close code đã đúng `1012`, mà khe vẫn còn — đo thẳng Redis:

```
session:d8426118…:ws   val=1   pttl=19131      ← lease ĐANG chạy (còn 19s)
```

Nguyên nhân: `release` (DECR khe) là **defer của HANDLER trong `wsroute`**, chạy
SAU khi `Serve` trả về. `wg.Done()` bắn lúc `Serve` trả về ⇒ `Drain` báo "xong" quá
sớm ⇒ `main` return ⇒ process thoát ⇒ defer chết giữa chừng.

**Vì sao unit test mù:** nó gọi `Serve` **trực tiếp**. Tầng `wsroute` — nơi cái defer
quan trọng sống — không tồn tại trong ca test. Một test có thể xanh trọn vẹn cho một
hàm và vẫn không nói gì về đường chạy thật, nếu ranh giới nó test không phải ranh
giới nơi bất biến sống.

**Sửa:** tách `internal/drain.Coordinator` dùng chung; `wsroute` gọi `Enter()` ở
**đầu handler** (trước cả bước authz đầu tiên), `podexec` chỉ **đọc** tín hiệu.
Test hồi quy `TestDrainDoiCaDeferCuaHandler` mô phỏng đúng hình dạng đó, và đã
**đột biến để chứng minh nó đỏ được**.

---

## 5. Acceptance criteria

| Ô | Kết quả | Bằng chứng |
|---|---|---|
| **AC-H1** drain phát `1012` | ✅ **2/2** | Đối chứng dương: baseline cùng phép đo cho **đứt-trần 2/2**. |
| **AC-H2** khe được trả | ✅ **0/2 ăn 429**, nối lại 101 sau **59–179ms** | Trước: 2/2 ăn 429, 0/2 vào lại được trong 10s. |
| **AC-H3** nối lại trúng replica KHÁC vẫn đúng pod | ✅ **2/2 pod khớp**; `m9`: 10 lượt phân bố **4/6** trên hai replica | `docPodCuaSession` hỏi lại SERVER, không so với bộ nhớ probe. |
| **AC-H4** khe tự lành sau SIGKILL | ✅ 429 ngay (đối chứng dương) → **101 sau 1m9.8s**, đúng pod cũ | Trước 3.H: kẹt tới `expiresAt − now` = **hàng chục phút**. |
| **AC-H5** hai replica cùng phục vụ | ✅ tổng histogram = 10, **mỗi pod ≥ 1** | `m9` đòi cả hai vế; ô chỉ kiểm tổng sẽ xanh y hệt khi dồn một pod. |
| **AC-H6** bão nối-lại, số tách rời | ⚠ **lab không tạo nổi bão** — xem §6 | Trần phiên đồng thời = 3 < burst 10. |
| **AC-H7** `idleTimeout` Traefik | ⏳ chưa đo | Traefik chạy toàn mặc định (không arg timeout nào). |
| **AC-H8** không hồi quy | ✅ harness e2e **14/14** · `reaper-verify --case all` **14/14** | |
| **AC-H9** nợ image tag | ✅ web/orchestrator/migrator/sandbox-base ở `sha-25cb824`, **không `--set` nào**; khẳng định trên đối tượng sống | Gateway còn override tạm — xem §7. |

---

### AC-H4 chi tiết — và vì sao `m3` không dùng được

Đo bằng `-case drain -n 1 -rollout-cmd "sudo pkill -9 …" -reconnect-wait 150s`:

```
[s1] đóng sau 273ms · KHÔNG kèm close code       ← ĐÚNG: SIGKILL không cho defer chạy
     …vẫn 429 sau 15s / 30s / 46s / 1m1s          ← đối chứng dương: khe THẬT SỰ kẹt
[s1] nối lại: đầu=429 · mất 1m9.777s · pod khớp=true
```

`1m9.8s` khớp lease 90s trừ phần đã trôi từ lượt gia hạn cuối (gia hạn mỗi 30s).

**`-case m3` (công cụ sẵn có cho đúng ca này) KHÔNG chạy được**, và lý do là một
tính chất có thật chứ không phải hồi quy: nó chờ control `expiring`, mà gateway chỉ
phát `expiring` khi `expiresAt` **tiến lên**. Với `SESSION_TTL=1h` và
`EXTEND_DEFAULT=300s`, mỗi lượt gia hạn cho `now+300s` < `now+3600s` ⇒ hạn không
tiến ⇒ không bao giờ có `expiring`. Report 1.G-3 đã ghi "m3 cần TTL nén"; lượt này
chọn đo thẳng thay vì đổi cấu hình cụm giữa chặng.

⚠ Dùng `kubectl delete pod --force` thay cho `pkill -9` sẽ **không** đo được ô này:
force-delete không phải SIGKILL, tiến trình còn sống thêm ~30s và defer vẫn chạy.

---

## 6. AC-H6: ô này lab không đo nổi, và nói thẳng ra thay vì xanh giả

Trần phiên đồng thời của lab là **3** (`requests.cpu 2100m ÷ 500m = 4 pod`, trừ
`POOL_TARGET=1`). Bão nối-lại tối đa vì thế là **3 client**, trong khi trần biên là
`average 20/1m, burst 10`. **Lab không thể tạo ra bão đụng trần.**

Ngưỡng tính được từ chính cấu hình, không cần phép đo lab: lịch backoff không jitter
dồn mọi client vào **cùng một khoảnh khắc**, nên đợt nối lại đầu tiên (t+1s) có đúng
N request. Vượt `burst = 10` khi **N > 10 phiên đồng thời sau một NAT chung**. Với
SNAT, "một NAT chung" = cả lớp học.

⇒ Rủi ro là **thật ở quy mô lớp học**, không quan sát được ở quy mô lab. Quyết định
H-5 (thêm jitter vào `backoff.ts`) vì thế **hoãn sang lượt nâng trần**, khi trần đủ
lớn để phép đo có nghĩa. Nới rate-limit **không** được chọn: nó là nới một lớp phòng
thủ luật 5 mà 3.E vừa chấm 10/10, và nó sửa triệu chứng chứ không sửa nguyên nhân.

---

## 7. Còn nợ

1. **Trần 3 phiên đồng thời là tham số đặt sai, không phải giới hạn phần cứng.**
   Đo ở cgroup trên host: pod sandbox **dùng thật 43–63 Mi** và CPU gần như 0, trong
   khi `requests` đặt **512Mi / 500m** — giữ chỗ gấp ~10 lần. Node còn 5770m CPU và
   ~5.8 GB RAM rảnh. Đây là việc kế tiếp đã chốt với chủ dự án: đo dưới **tải bài học
   thật** (có `docker build` trong Sysbox) rồi đặt lại `requests`, KHÔNG đặt theo số
   idle — under-request gây OOM kill, tệ hơn trần thấp.
2. **Gateway còn `--set gateway.image.tag=3h-drain2`.** Ba service kia đã ghim trong
   `values-selfhost.yaml`; gateway phải đợi CI publish `sha-<commit của 3.H>`. Sau khi
   PR merge: sửa **một dòng** trong values rồi chạy `11-sideload-images.sh`. Tới lúc đó
   AC-H9 mới đóng trọn.
3. **AC-H7 chưa đo.** Traefik chạy không một arg timeout nào ⇒ toàn mặc định v3.7.10.
   Ping 20s của gateway là traffic trên kết nối nên nhiều khả năng không chạm
   `idleTimeout`, nhưng **đó là suy luận, chưa phải phép đo**.
4. **`edge.js`/bão nối-lại chưa chạy qua Traefik thật.** Probe đi ClusterIP nên không
   chạm middleware biên. Đo bão đúng nghĩa cần đi `:30443`.
5. **PDB chỉ gác đường eviction**, không gác rollout (rollout đi qua
   `maxUnavailable`). Ghi trong chính template để người sau không đọc "đã có PDB"
   thành "rollout an toàn rồi".
6. **`~/dlp-deploy` trên VM vẫn lệch repo.** Lượt này né bằng cách đẩy chart tươi vào
   `/tmp/dlp-chart`. Bẫy vẫn còn nguyên cho lượt sau.

---

## 8. Những chỗ suýt sai

1. **preStop `exec: ['/bin/sleep', …]` sẽ hỏng trong im lặng.** Image gateway là
   `gcr.io/distroless/static-debian12:nonroot` — không shell, không `/bin/sleep`.
   kubelet chỉ ghi một Event rồi vẫn tắt pod; `helm upgrade` và `rollout status` đều
   xanh. Dùng `SleepAction` (`sleep: seconds:`) do kubelet thực thi. Và vì apiserver
   **prune field lạ trong im lặng**, "render ra `sleep:`" chưa đủ — phải
   `apply --dry-run=server` rồi **đọc ngược** xem field còn không (còn: `seconds: 5`).
2. **Ghim tag kéo theo image thứ NĂM.** `SANDBOX_IMAGE` suy ra từ tag đang chạy, nên
   `dlp-sandbox-base:sha-25cb824` cũng phải được nạp. Thiếu nó: warm pool kẹt
   `ErrImagePull`, **không ai vào được terminal**, trong khi cả 4 deployment
   `Running 1/1` và `helm upgrade` báo thành công. Đã cắn thật trong lượt này.
3. **`terminationGracePeriodSeconds` phải LỚN HƠN `SHUTDOWN_GRACE`.** Ngược lại thì
   SIGKILL tới trước khi drain xong và ta quay lại đúng chế độ hỏng đang vá — trong
   khi rollout vẫn "thành công".
4. **`refresh_ws.lua` chỉ được `PEXPIRE`.** `PEXPIRE` trên key không tồn tại trả 0 và
   không tạo key; `SET` sẽ **dựng lại khe cho một phiên đã đóng** — khe ma khoá
   session tới hết lease. Đường đua có thật (ticker vs defer). Đã đột biến sang `SET`
   để chứng minh test đối chứng đỏ được.
5. **Suite `sessionstore` mặc định SKIP 10 test** vì thiếu `REDIS_URL` (skip trung
   thực, có ghi "KHÔNG giả vờ xanh"). Chạy `go test ./...` trần sẽ báo `ok` mà không
   chạm dòng Lua nào. Phải dựng Redis thật: 11 PASS / **0 SKIP**.
6. **Đếm `helm get values` không thay được đọc đối tượng sống.** Live-values còn che
   cả `replicaCount` lẫn tag (chúng đến từ bản `values-selfhost` cũ), và bóc `tag:`
   mà để lại khoá cha `image:` rỗng sẽ thành `image: null` — xoá sổ cả map.

---

## 9. Trình tự tái lập

```bash
# 1. nạp image (tag đọc TỪ values-selfhost.yaml, không nhận --tag)
bash infra/host/11-sideload-images.sh

# 2. deploy
ssh nghaiz@<vm> 'helm upgrade platform /tmp/dlp-chart/platform -n default \
    -f /tmp/dlp-chart/platform/values-selfhost.yaml -f /tmp/live-clean.yaml --wait'

# 3. đo drain (chạy TRÊN VM — cần kubectl cho rollout-cmd)
GOOS=linux go build -o /tmp/session-probe ./cmd/session-probe   # trong services/terminal-gateway
scp /tmp/session-probe nghaiz@<vm>:/tmp/
W=http://10.106.75.220:3000; G=ws://10.107.241.125:8082
O=https://dlp.192.168.94.130.sslip.io:30443     # ⚠ Origin đã đổi sau 3.A
/tmp/session-probe -case drain -n 2 -web $W -gateway $G -origin $O -budget 10m \
  -rollout-cmd "kubectl -n default rollout restart deploy/platform-gateway && \
                kubectl -n default rollout status deploy/platform-gateway --timeout=240s"

# 4. phân bố hai replica
IPS=$(kubectl -n default get pods -l app.kubernetes.io/component=gateway \
       -o jsonpath='{range .items[*]}http://{.status.podIP}:8083,{end}' | sed 's/,$//')
/tmp/session-probe -case m9 -n 10 -web $W -gateway $G -origin $O -pod-metrics "$IPS"

# 5. ô gác hồi quy
bash infra/k8s/reaper-verify.sh --case all
cd plans/devops-learning-platform/reports/harness/2026-08-13-2d-lessons-e2e && \
  BASE_URL=$O ORIGIN=$O NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e-lessons.mjs

# unit test — PHẢI có Redis thật, nếu không 10 test tự SKIP
docker run -d --rm --name dlp-test-redis -p 16379:6379 redis:7-alpine \
  --requirepass testpw --notify-keyspace-events Ex
REDIS_URL="redis://:testpw@127.0.0.1:16379" go test ./... -count=1
```

**Điều kiện trước:** quota sandbox phải còn khe (`kubectl -n dlp-sandbox get pods
-l app=sandbox` ≤ 1). Phiên probe cũ không tự rụng nhanh — cho hết hạn bằng
`PEXPIRE session:<id> 1000` rồi đợi reaper tầng 1 (nghe keyspace expiry; **sửa
field `expiresAt` KHÔNG kích hoạt nó**).
