# 1.G-3 — Đo trên cụm: năm phép đo, tám ô AC đóng

**Ngày:** 2026-08-13 · **Nhánh:** `p1-g3-cluster-proofs` · **Cụm:** `debian-sandbox` (192.168.94.130), k8s v1.34.10 + Sysbox
**Ảnh chạy khi đo:** `sha-0d54bbb` cho cả bốn image (`terminal-gateway`, `orchestrator`, `web`, `migrator`)

---

## Tóm tắt

| # | Ô AC | Kết quả | Bằng chứng chính |
|---|---|---|---|
| N2 | idle → `4404` (3 vế) | ✅ ĐẠT | A đóng `4404` sau 3m1s với **1** `expiring`; B sống 4m57s với **3** |
| N3 | M3 — SIGKILL không khoá vĩnh viễn | ✅ ĐẠT | `429` ở +16s → mở lại OK ở +2m1s |
| N4 | M4 — xoay `kid` Better Auth thật | ✅ ĐẠT | kid đổi thật, `restartCount` **không đổi** |
| N5 | M9 — hai replica sau LB | ✅ ĐẠT | 20 lượt, phân bố **9/11**, tổng histogram khớp 20 |
| N6 | luật 5 (a) — `stty size` khớp chính xác | ✅ ĐẠT | pty = `30 149`, đúng giá trị resize cuối |

**Không có ô nào đỏ.** Phần còn nợ của 1.G-2 sau chặng này: **M8** (hai ô FE, cần harness trình duyệt) và **M1** (quy 0.75s p95 attach về từng thành phần) — cả hai đều KHÔNG cần cụm nên không thuộc chặng này.

---

## 0. Cụm đã lệch năm commit — phải đồng bộ trước khi đo

Khi bắt đầu, cụm chạy `sha-d09db86` (#41) còn `main` là `0d54bbb` (#46). **Không đo trước khi đồng bộ**, và lý do là kỹ thuật chứ không phải gu sạch sẽ: đường "im lặng → `4404`" **đi xuyên qua reaper**, mà `reaper.go` đổi **+122 dòng** trong đúng khoảng lệch đó (tầng 4 rút pod lệch image, W2 của 1.G-1). Đo trên `d09db86` là đo một reaper khác với reaper đang được khẳng định.

Đã đối chiếu `git diff d09db86..origin/main`: runtime gateway (`internal/extend`, `internal/podexec`) **không đổi**, nên riêng phần heartbeat/close-code thì hai bản giống nhau. Ghi lại để lần sau khỏi đối chiếu lại.

### Ba cái bẫy của lượt deploy này

1. **Có BỐN image, không phải ba.** `migrate-job.yaml` là hook `pre-upgrade` và dùng image thứ tư `dlp-migrator` (stage `--target migrator` của `apps/web/Dockerfile`). Với `imagePullPolicy: Never`, thiếu nó thì hook đỏ `ErrImageNeverPull` và **chặn cả lượt upgrade**. Không có Dockerfile riêng — chỉ CI biết nó là một target, nên `find -name Dockerfile` không tìm ra.
2. **`image.tag` kéo theo `SANDBOX_IMAGE`.** Template suy `SANDBOX_IMAGE` mặc định `= dlp-sandbox-base:{{ image.tag }}`. Đổi `image.tag` sang `sha-0d54bbb` mà không có `dlp-sandbox-base:sha-0d54bbb` trên node ⇒ **mọi pod warm-pool** `ErrImageNeverPull`. `git diff d09db86..origin/main -- images/sandbox-base/` **rỗng** ⇒ nội dung không đổi ⇒ đã `ctr images tag` bản cũ sang tag mới thay vì build lại một image lớn y hệt.
3. **`~/dlp-deploy` không phải checkout git** — không có `.git`, và host **không cài `git`**. Nó là bản chép tay của `infra/`. Không có sha để đối chiếu ⇒ đối chiếu bằng **tag image đang chạy**. Chart luôn `scp` từ repo sang `/tmp/dlp-chart`.

Đã tránh cả hai bẫy helm đã biết (`--reuse-values` đánh rơi key mới; `--reset-then-reuse-values` giữ VALUES chứ không giữ TEMPLATE) bằng cách **dump values hiện tại ra file rồi truyền `-f` tường minh** kèm các `--set` cần thiết. Đường này auditable và không phụ thuộc ngữ nghĩa kế thừa của helm.

---

## N2 — idle → `4404`: ba vế, hai phiên, một phép đo

**Cấu hình khi đo:** `sessionTtl=90s · extendDefault=120s · hardCap=300s` (công thức nén đã có sẵn ở `cmd/verify-heartbeat`). Thứ được đo là **cơ chế**, không phải hằng số.

```
Phiên          | expiring  | close      | sống     | mốc expiring
--------------------------------------------------------------------------
A-im-lặng      | 1         | 4404       | 3m1s     | [1m0s]
B-có-traffic   | 3         | 4409       | 4m57s    | [1m0s 2m0s 3m0s]
```

**Đọc thế nào.** A và B giống hệt nhau **trừ một điều duy nhất**: B gõ một phím mỗi 25s. A chết `4404` ở 3m1s; B sống tới trần cứng và chết `4409` ở 4m57s. Vì B là đối chứng dương, cái giết A quy được về **sự im lặng**, không phải hạ tầng (pod câm / session tạo lỗi / gateway từ chối — cả ba sẽ giết B y như A).

**Vế "ping/pong KHÔNG gia hạn" nằm ở con số 1, không nằm ở close code.** `pingInterval=20s` nên trong 181 giây sống của A có khoảng **9 lượt ping**. Nếu ping đánh dấu activity thì A sẽ có `expiring` ở MỌI tick 60s và **không bao giờ chết**. Đúng một lượt rồi chết = ping không gia hạn.

> ⛔ **Vì sao A vẫn có ĐÚNG MỘT `expiring` — và vì sao đó là ĐÚNG.** Cờ `activity` được đặt bởi cả stdin **lẫn stdout** (`bridge.go:273`), mà `ready` theo định nghĩa phát ở byte stdout **đầu tiên**. Nên mọi phiên attach thành công đều đã bật cờ trước tick 60s đầu; tick đó đọc-rồi-**xoá** cờ (`takeActivity`) nên nó gia hạn đúng một lần rồi thôi. Ai chưa biết điều này sẽ đọc "1 expiring" thành lỗi và đi sửa một thứ đang đúng.

**Mốc đóng không phải `expiresAt`.** Chuỗi thật: `session:{id}` hết TTL → reaper **tầng 1** bắt keyspace notification `expired` → xoá pod → stream exec đứt → `sessionGone` hỏi Redis rồi đóng `4404`. A hết hạn ở ~182s (90s gốc, +120s từ lượt gia hạn duy nhất ở 60s) và đóng ở **181s** — khớp, và cho thấy tầng 1 bắt được sự kiện chứ không phải chờ sweep 60s của tầng dự phòng.

---

## N3 — M3: SIGKILL gateway giữa phiên

**Cấu hình khi đo:** `sessionTtl=90s · extendDefault=240s · hardCap=1800s`.

```
3.  WS#2 mở — khe WS được cấp lúc 00:48:23   (expiresAt lúc đó = 00:52:21)
4.1 heartbeat #2 đẩy expiresAt → 00:53:23
4.2 heartbeat #3 đẩy expiresAt → 00:54:23
5.  GIẾT: sudo pkill -9 -x -f /terminal-gateway
6.  WS#2 đứt sau 2ms (close=-1)          ⇒ giết đúng tiến trình đang giữ phiên
6b. mở lại → 429 SESSION_IN_USE (+16s)   ⇒ khe WS ĐANG kẹt
7.  mở lại THÀNH CÔNG (+2m1s, tức 4m1s kể từ lúc khe được cấp)
```

Khe được cấp lúc 00:48:23 với `expiresAt = 00:52:21` ⇒ TTL khe = 3m58s ⇒ khe tự hết lúc 00:52:21. Mở lại thành công lúc 00:52:24 (nhịp poll 3s). **Số khớp với cơ chế**, không phải khớp với một hằng số ai đó đoán.

> ⛔ **Vế `429` là ĐỐI CHỨNG DƯƠNG, không phải phần phụ.** Không có nó thì "mở lại được sau khi chờ" đúng y hệt với "chưa bao giờ bị khoá" — phép đo sẽ không phân biệt được bản vá đang chạy với việc trần WS không tồn tại.

### Ba thứ chỉ lộ ra khi chạy thật

1. **`kubectl delete pod --force --grace-period=0` KHÔNG phải SIGKILL.** WS vẫn sống **30s** sau lệnh đó; chính output của kubectl nói lý do: *"Immediate deletion does not wait for confirmation that the running resource has been terminated."* Nó xoá object khỏi API rồi trả về, tiến trình chết lúc nào là chuyện khác. Phải `sudo pkill -9 -x -f /terminal-gateway` trên node — và khi đó WS đứt sau **2ms**. Tiến trình platform là container thường (không Sysbox) nên host `pgrep` thấy được.
2. **TTL của `session:{id}:ws` KHÔNG phải hằng số — nó suy ra `= expiresAt(lúc cấp) − now`** và **không heartbeat nào làm mới nó** (`AcquireWS` là nơi ghi duy nhất). Hệ quả: mở WS ngay sau khi tạo session thì khe và **chính phiên** hết hạn **cùng lúc**, và khi đó "mở lại được sau khi TTL khe hết" là điều **không quan sát được** — lúc khe nhả thì phiên cũng chết. Khoảng trống giữa hai mốc **đúng bằng số heartbeat đã chạy sau khi khe được cấp × 60s**, nên probe phải đợi **hai** nhịp chứ không phải một.
3. **Một WS im lặng chỉ gia hạn đúng một lần** — cùng cơ chế đã đóng N2. Lượt chạy đầu treo ở "đợi heartbeat #3" vì WS#2 không gõ gì; phải chủ động gõ đều 20s/lần thì các tick sau mới có activity để gia hạn.

---

## N4 — M4: xoay khoá Better Auth THẬT

```
1. phiên CŨ  · kid=hwAHbjVfA7QDDziWJBsWaZN1dHTNug2c
2. XOAY: UPDATE jwks SET expires_at = now() - interval '1 minute';   → UPDATE 1
3. phiên MỚI · kid=cNlpyuqcAW3vDrlVHtvrGbRDbCrQ0w5f
4. WS bằng token kid MỚI: ready
5. WS bằng token kid CŨ : ready
```

`restartCount` gateway **trước và sau đều = 1**, `startTime` **không đổi** (`17:46:06Z`) ⇒ vế *"không cần restart"* là số đo, không phải lời khẳng định. Bảng `jwks` sau lượt xoay giữ **hai** hàng: kid cũ (`expires_at` đã lùi về quá khứ) và kid mới (`expires_at` NULL) — cả hai vẫn được `/api/auth/jwks` công bố nhờ grace 30 ngày của plugin.

> ⛔ **`UPDATE` chứ tuyệt đối không `DELETE`.** Cả hai đều sinh kid mới, nhưng `DELETE` **xoá kid cũ khỏi JWKS** và do đó làm hỏng đúng **nửa sau** của AC. Hai lệnh trông tương đương và chỉ một lệnh đo được thứ AC hỏi.
>
> **Nửa sau mới là nửa dễ trượt.** Nếu chỉ kiểm "token mới verify được" thì một gateway **xoá sạch cache** mỗi lần refetch cũng qua — và nó sẽ đá văng mọi phiên đang mở mỗi lần khoá xoay. Token cũ còn verify được mới phân biệt *refetch có chọn lọc* với *reset toàn bộ*.

**Rủi ro đã khử, không xảy ra:** nghi vấn `createJwk` ghi field `alg`/`crv` không có cột trong `schema.ts` (⇒ mint chết vì `column "alg" does not exist`). Lượt mint chạy sạch. Đã sao lưu bảng `jwks` trước khi `UPDATE` để lùi được.

---

## N5 — M9: hai replica gateway sau LB

```
pod /metrics                               | attach mới
------------------------------------------------------------
http://10.244.211.71:8083                  | 9
http://10.244.211.120:8083                 | 11
```

20 lượt mở/đóng **tuần tự** (trần là 1 WS/session), **0 lỗi**, **0 lượt** phải chờ khe được nhả.

> ⛔ **"20 lượt, 0 lỗi" MỘT MÌNH nó không chứng minh được gì về hai replica.** LB round-robin hoàn toàn có thể dồn cả 20 vào một pod và phép đo vẫn xanh trong khi replica thứ hai chưa phục vụ byte nào — cùng họ với một suite xanh vì mọi test đều skip. Nên khẳng định thật là: **tổng delta histogram = 20** (không lượt nào rơi ra ngoài) **và mỗi pod > 0** (LB thật sự rải). 9/11 là bằng chứng đó.

`/metrics` ở cổng admin **8083**, **không** đi qua Service, và image gateway là distroless (không `exec curl`) ⇒ scrape theo **IP pod**.

---

## N6 — luật 5 (a): `stty size` khớp chính xác

```
2. gửi 50 resize trong 1.087s (~46/s — dưới trần 100/s), cols 100→149, rows 30
3. kết nối còn sống sau cơn resize
4. stty size trong pod: rows=30 cols=149
```

Khớp **chính xác** giá trị cuối, **không lệch 1** ⇒ status bar tmux đã tắt đúng như E4 chốt.

**Vì sao gửi dưới trần mới đúng.** Bản AC cũ viết *"bão 200 resize/s → coalesce, KHÔNG đóng"*, mâu thuẫn thẳng với trần control 100/s của chính G8 — đo nó như viết là đo một thứ hiện thực **cố tình không làm**. Câu chữ AC đã được tách làm hai vế (quyết định của người dùng 2026-08-12): **(a)** dưới trần → coalesce, không đóng, `stty size` khớp; **(b)** trên trần → `4400`. Vế (b) đã có `TestBaoControlThiDong4400`; vế (a) phần "không đóng" đã có `TestKeoCuaSoBinhThuongKhongBiChan`. **Phần duy nhất chưa có gì gác là `stty size` trong pod thật** — vế phân biệt *"server nhận resize"* với *"pty thực sự đổi kích thước"* — và đó chính là phép đo trên.

---

## Phát hiện phụ đáng giữ

**1. Cookie `dlp_sandbox` hết hạn ĐÚNG BẰNG `expiresAt` của phiên, và chỉ `session.create` mint được nó.**
`jwt.ts` mint với `exp: expiresAtSeconds`, còn `attachSandboxCookie` có **đúng một call-site**: `session.create`. Nên mọi thao tác kéo dài quá `expiresAt` **ban đầu** sẽ ăn `401 UNAUTHENTICATED` ở tầng authz **trước khi** chạm tới thứ nó định đo. Lượt chạy M3 đầu tiên trượt đúng vào đây: gateway log *"sandbox token không hợp lệ: hết hạn lúc …"* suốt 6 phút và **không một lượt 429 nào** — phép đo im lặng đo nhầm sang tầng khác. Đường mint lại là gọi `session.create` **lại với đúng `idempotencyKey` cũ** (trả về phiên cũ, không claim thêm pod). *Không phải lỗi production* (TTL thật là 1h), nhưng là ràng buộc cứng lên mọi probe dài hơi.

**2. Trần sandbox đồng thời cắn khi các ca chạy nối đuôi.** Lượt idle đầu tiên đỏ ở `session.create` với *"đã đạt trần số sandbox đồng thời của cluster"* vì phiên của hai ca trước còn giữ pod. Các ca tạo nhiều phiên phải để pool thoát nước giữa hai lượt, hoặc phép đo sẽ đỏ vì một lý do **không liên quan gì** tới thứ đang đo.

**3. `-origin` phải là `http://localhost:8080`, không phải URL đang gọi.** `GATEWAY_ALLOWED_ORIGINS=http://localhost:8080` trong khi probe gọi web qua ClusterIP `10.106.75.220:3000`. Sai Origin → `403 ORIGIN_NOT_ALLOWED` ở handshake, trông hệt lỗi auth.

**4. Mọi ca phải gửi `init` ngay sau dial.** Thiếu nó, gateway chờ hết hạn rồi mới `dùng 80x24` và stream đứt bằng EOF **không kèm close code** — triệu chứng trông như pod hỏng.

---

## Trạng thái cụm sau khi đo

Đã khôi phục: `sessionTtl=1h · extendDefault=300s · hardCap=2h`, `replicaCount=1` cho gateway + orchestrator (mặc định lab, tiết kiệm RAM).
**Giữ lại `image.tag=sha-0d54bbb`** thay vì lùi về `sha-d09db86` — cụm nay chạy đúng `main`, và `dlp-sandbox-base:sha-0d54bbb` đã được tag nên `SANDBOX_IMAGE` suy ra đúng. Warm pool đã dựng lại pod mới ở tag đó; toàn bộ pod `Running`.

## Cách chạy lại

```bash
GOOS=linux go build -o /tmp/session-probe ./cmd/session-probe   # trong services/terminal-gateway
scp /tmp/session-probe nghaiz@192.168.94.130:/tmp/

W=http://10.106.75.220:3000; G=ws://10.107.241.125:8082; O=http://localhost:8080
/tmp/session-probe -case resize -web $W -gateway $G -origin $O
/tmp/session-probe -case m9 -n 20 -web $W -gateway $G -origin $O \
    -pod-metrics http://<gw-pod-1>:8083,http://<gw-pod-2>:8083
/tmp/session-probe -case idle  -web $W -gateway $G -origin $O -quan-sat 6m -budget 12m
/tmp/session-probe -case m3    -web $W -gateway $G -origin $O -budget 16m \
    -kill-cmd 'sudo pkill -9 -x -f /terminal-gateway'
/tmp/session-probe -case jwks  -web $W -gateway $G -origin $O -budget 8m \
    -rotate-cmd 'sh /tmp/rotate-jwks.sh'
```

`idle` và `m3` cần TTL nén (xem từng mục trên); `resize`/`m9`/`jwks` chạy được với TTL production.
