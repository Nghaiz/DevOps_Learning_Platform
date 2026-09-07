# Rà soát đối kháng — hạ tầng triển khai P13

Nhánh `feat/p13-frontend` @ `cf01c44`, đối chiếu `feat/p12-scale-proof..HEAD`.
Chỉ đọc mã. Không chạm cụm. `helm template` chạy cục bộ (không `--dry-run`, không `lookup`).
Không in diff manifest thô (đã từng lộ PKI theo cách đó).

---

## Trả lời câu hỏi chính

**Chạy `infra/host/12-helm-deploy.sh` NGAY BÂY GIỜ ⇒ `platform-orchestrator`
CrashLoopBackOff, và `helm upgrade --wait --timeout 5m` sẽ TREO 5 phút rồi ĐỎ, để
release ở trạng thái `failed`.** §3bis đúng. Nhưng đường đi tới kết luận đó trong §3bis
có một mắt xích ghi sai, và mắt xích ấy suýt làm chính lượt rà soát này kết luận ngược —
xem F1.

Chuỗi sự kiện, theo đúng thứ tự script chạy:

1. `12-helm-deploy.sh:97-101` lọc values live theo danh sách cho phép ⇒ **vứt** mọi
   `orchestrator.env.*` cũ, gồm cả `capacitySoftLimit: '20'` mà release hiện tại đang giữ.
   Vì thế bẫy `fail` ở `orchestrator-deployment.yaml:175` **KHÔNG nổ** — nó chỉ nổ với
   `--reuse-values`.
2. Cổng image (`:207-233`) so render với `ctr images ls`. Chart render ra đúng 5 tag đang
   có trên node (`p10a/p12fix/p12fix/p9/p10a`) ⇒ **cổng XANH**. Nó không thể bắt ca này:
   nó gác *tag có mặt*, không gác *tag đúng đời*.
3. `helm upgrade --wait` áp Deployment orchestrator với `CAPACITY_HARD_LIMIT` (chart P13)
   lên binary `:p12fix` vốn `required` `CAPACITY_SOFT_LIMIT` ⇒ `config.Load` trả lỗi ⇒
   tiến trình thoát ⇒ **CrashLoopBackOff**.
4. `--wait` không bao giờ thấy Ready ⇒ hết 5 phút ⇒ helm đỏ ⇒ `set -euo pipefail`
   (`:31`) giết script ⇒ `13-smoke.sh` **không chạy**.

Thông báo lỗi có nêu đúng tên biến (`env CAPACITY_SOFT_LIMIT: bắt buộc nhưng chưa đặt`),
nên chẩn đoán nhanh — nhưng nền tảng nằm đó cho tới khi có image `:p13`, và release ở
`failed` cần `helm rollback` hoặc một lượt upgrade đúng.

**Kể cả nếu bước 3 không crash, deploy vẫn KHÔNG mang P13 lên cụm** — không tag nào được
bump (F2). Hai lỗi độc lập, phải sửa cả hai.

---

## F1 — §3bis ĐÚNG, nhưng lý lẽ của nó chỉ đứng vững nếu so với ĐÚNG commit

**Mức: Critical. Kèm một cảnh báo phương pháp.**

§3bis viết: *"Binary đang chạy trên cụm là `dlp-orchestrator:p12fix`, và nó ĐÒI biến cũ."*

Phép kiểm hiển nhiên — `git grep CAPACITY feat/p12-scale-proof -- services/orchestrator/` —
trả **0 dòng**, và đọc thẳng nó ra thì §3bis sai. **Đó là một kết luận sai**, vì
`:p12fix` KHÔNG được build từ `feat/p12-scale-proof`. §0bis của chính exec plan đã nói:
*"P12 đóng chồng lên nhánh này"* — các commit P12 nằm **sau** những commit P13 đầu tiên
trên `feat/p13-frontend`.

Bằng chứng đúng:

```
git merge-base --is-ancestor 2c7f36f 4719d85   → true
```

- `2c7f36f feat(p13): orchestrator GetCapacity + ListSessions handlers + CAPACITY_SOFT_LIMIT`
- `4719d85 fix(p12): đóng hai defect còn nợ — referrers treo và mã đóng WS sai khi mất pod`

`4719d85` là commit mà tag `p12fix` mô tả: `values-selfhost.yaml:143-146` ghi *"p12fix
(2026-09-06): pod sandbox mang `hostAliases` trỏ bốn host Docker Hub"* và `:189-192` ghi
*"p12fix: trên đường đóng, exit ∈ {137,143}…"* — hai thay đổi đó **chỉ tồn tại từ
`4719d85`** (`git log -S hostAliasesDockerHub` trả đúng một commit).

Và tại `4719d85`:

```
git show 4719d85:services/orchestrator/internal/config/config.go | grep -n CAPACITY
  313: capacitySoftLimitRaw := envx.String("CAPACITY_SOFT_LIMIT", "")
  315: "env CAPACITY_SOFT_LIMIT: bắt buộc nhưng chưa đặt …"
  321/324: lỗi parse / phải > 0
```

⇒ **binary `:p12fix` fail-fast khi thiếu `CAPACITY_SOFT_LIMIT`. §3bis đúng.**

Chart HEAD chỉ đặt `CAPACITY_HARD_LIMIT` (`orchestrator-deployment.yaml:180-181`) và không
còn phát biến cũ ⇒ CrashLoopBackOff.

**Đối chứng — bảng tên env render ra, chart @`4719d85` (đời của `:p12fix`) vs chart HEAD,
cùng một bộ values:**

| workload | delta |
|---|---|
| `platform-orchestrator` | `−CAPACITY_SOFT_LIMIT`, `+CAPACITY_HARD_LIMIT` — đúng MỘT phép đổi |
| `platform-web` | **không đổi** (`ORCHESTRATOR_METRICS_URL` đã có từ `2f6e468`) |
| `platform-gateway` | không đổi |
| `platform-migrate` (Job) | không đổi |

Trong TOÀN chart chỉ có **một** biến bị gỡ, và đúng nó là biến bắt buộc của binary đang chạy.
(So với `feat/p12-scale-proof` thì delta trông "thuần cộng thêm" — đó chính là cái bẫy ở đầu
mục này: sai mốc so sánh cho ra kết luận ngược dấu.)

**Cảnh báo phương pháp, đáng ghi vào runbook:** *"tag `p12fix` ⇒ mã ở nhánh P12"* là một
suy luận SAI trên repo này. Tag là một cái tên, không phải một commit. Phép kiểm rẻ nhất và
đúng nhất chạy **trên cụm, không trên git**:

```bash
kubectl -n default get deploy platform-orchestrator \
  -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' | tr ' ' '\n' | grep CAPACITY
```

Ra `CAPACITY_SOFT_LIMIT` ⇒ khẳng định F1 trên chính cụm. Ra `CAPACITY_HARD_LIMIT` ⇒ ai đó
đã deploy chart mới rồi, tình huống khác hẳn. **Chạy lệnh này trước bước 1 của thứ tự
deploy** (chỉ đọc, an toàn với lane đang đo cụm).

Chiều ngược lại cũng có thật và cũng phải nhớ: `config.go:321-334` (HEAD) fail-fast khi
`CAPACITY_HARD_LIMIT` rỗng/≤0, `:343` fail khi `hard <= POOL_TARGET` ⇒ **image `:p13` + một
bộ values thiếu `capacityHardLimit` cũng CrashLoop.** `values-selfhost.yaml:176` có
`capacityHardLimit: '23'`, và `12-helm-deploy.sh` không dùng `--reuse-values`, nên đường
script an toàn. Đường tay `helm upgrade --reuse-values` thì không.

---

## F2 — Không tag nào được bump: deploy "thành công" sẽ vẫn là deploy P12

**Mức: Critical.**

`helm template` cục bộ với `values-selfhost.yaml` render ra đúng 5 ref ghcr:

```
ghcr.io/nghaiz/dlp-migrator:p9
ghcr.io/nghaiz/dlp-orchestrator:p12fix
ghcr.io/nghaiz/dlp-sandbox-base:p10a
ghcr.io/nghaiz/dlp-terminal-gateway:p12fix
ghcr.io/nghaiz/dlp-web:p10a
```

Nguồn: `values-selfhost.yaml:37` (gốc `sha-2b79fd3`), `:80` migrate, `:97` web, `:148`
orchestrator, `:194` gateway. **Không dòng nào mang `p13`.**

Giả sử F1 được vá (bump orchestrator) mà quên ba tag còn lại: cổng image xanh, helm xanh,
smoke xanh, script in `"Xong."` — và web vẫn là P10, migrator vẫn là P9. Đúng lớp lỗi mà
`values-selfhost.yaml:39-70` mô tả, chỉ đảo chiều: repo mô tả đúng cụm, nhưng cụm không mang
thứ ta vừa viết. Cổng duy nhất có thể bắt là hai ô e2e của §3ter-8 — mà §3ter-8 đã dặn sẵn
"đỏ là đúng vì cụm chạy image trước P13", nên nó sẽ bị đọc thành môi trường.

---

## F3 — Runbook thiếu image thứ tư: `dlp-terminal-gateway`

**Mức: Important.**

§3ter-4 liệt kê BA image (`web`, `orchestrator`, `migrator`). Diff P12→P13 có mã chạy thật
của gateway:

```
services/terminal-gateway/cmd/terminal-gateway/main.go   |  4 +   (bridge.SetPodProbe)
services/terminal-gateway/internal/podexec/bridge.go     | 58 +-
services/terminal-gateway/internal/podexec/podprobe.go   | 71 ++  (file mới)
```

Không phải phụ thuộc CỨNG: không env mới (`platform-gateway` env render ra y hệt hai chart),
không RBAC mới (`podprobe.go:35-37` ghi rõ nó dùng lại `pods: [get, list]` đã có), nên để
`:p12fix` thì gateway vẫn chạy.

**Kịch bản hỏng cụ thể nếu quên bump:** người học bị thu hồi pod (evict / OOMKill / node
pressure / xoá tay) trong lúc mở WS. Redis chưa kịp chuyển phiên sang FAILED (đo được
330–385ms trễ, `podprobe.go:16-24`), nên nhánh cũ kết luận "session còn sống ⇒ người dùng tự
kill" và hiện **"bạn đã tự gõ exit"** cho một người vừa bị lấy mất pod. Không có gì đỏ; chỉ
một thông báo sai ngay trước mặt người dùng. Đó là một trong hai defect `p12fix`/P13 vá,
và nó im lặng biến mất nếu tag không lên.

⇒ **Bump bốn tag, không phải ba.** `dlp-sandbox-base` thì KHÔNG cần (P13 không đổi
`images/sandbox-base/`); giữ `p10a` trong `orchestrator.env.sandboxImage`.

---

## F4 — §3ter-5 ĐÃ CŨ: `11-sideload-images.sh` ĐỌC tag từng thành phần

**Mức: Important (runbook sai ⇒ thao tác thừa hoặc `--set` tay, tức dựng lại bẫy cũ).**

§3ter-5 viết *"`11-sideload-images.sh` chỉ đọc `image.tag` CHUNG, không đọc tag từng thành
phần"*. Không còn đúng ở HEAD. `doc_tag_thanh_phan()`
(`infra/host/11-sideload-images.sh:96-120`) đọc `tag:` trong khối riêng của từng thành phần,
ánh xạ tên qua `duong_khoi()` (`:86-94`), chỉ rơi về tag gốc khi thành phần không có khối
riêng (`:135`). Chạy lại đúng đoạn `awk` đó trên `values-selfhost.yaml` hiện tại cho ra:

```
web → p10a · gateway → p12fix · orchestrator → p12fix · migrate → p9
sandboxImage → ghcr.io/nghaiz/dlp-sandbox-base:p10a
```

khớp từng chữ với 5 ref mà chart render ra (F2).

⇒ **Sửa bốn dòng tag trong `values-selfhost.yaml` là ĐỦ cho cả side-load lẫn cổng image.
Không `--set`, không tham số dòng lệnh** (script cố ý không nhận `--tag`, `:18-22`).

Ba cạnh sắc còn lại:

- `:236-238` — script **`docker pull` từ ghcr** nếu image chưa có ở local. **CI KHÔNG BAO
  GIỜ publish `:p13`**: ma trận `images` trong `ci.yml` chỉ gắn tag `sha-<ngắn>` + `latest`
  (`ci.yml:~1517`). Nên `:p13` phải build tay và tag **đúng dạng
  `ghcr.io/nghaiz/dlp-<tên>:p13`** — khi đó `docker image inspect` ở `:236` khớp và script
  bỏ qua bước pull. Tag sai dạng ⇒ script đi pull một tag không tồn tại và chết ở
  `loi "pull … thất bại"`.
- `:136` — tag `dev` bị từ chối tường minh. Đừng đặt tạm.
- `:44` — chạy không tham số sẽ nạp cả `dlp-sandbox-base` (vô hại, chỉ tốn băng thông).

---

## F5 — Cổng render-vs-`ctr` CÓ THỂ ĐỎ, nhưng gác *sự tồn tại của tag*, không gác *đời mã*

**Mức: Informational.**

Cổng đúng đắn về cấu trúc: nó render bằng **cùng bộ `-f`** sẽ dùng cho `helm upgrade`
(`:208-212` và `:238-241` truyền y hệt), rồi so khớp chuỗi tuyệt đối (`grep -qxF`) với
`ctr -n k8s.io images ls -q`. Hai nguồn độc lập. Có hai cổng chống đọc-nhầm-rỗng (`:214`
render 0 image ⇒ lỗi; `:218` `ctr` rỗng ⇒ lỗi), nên nó không rơi vào "unknown trông như
good". Đây **không** phải cổng không thể đỏ.

Hai điểm mù, cả hai đều đang hoạt động trong ca này:

1. **Chỉ soi ref `ghcr.io/…`** (regex `:212`). `postgres`/`redis`/`registry:2`/Traefik không
   được kiểm. Hôm nay vô hại — đối chiếu hai bản render cho thấy P13 không thêm image ngoài
   ghcr — nhưng một image `docker.io/...` mới sẽ đi qua trong im lặng.
2. **Nó không biết tag nào là "đời đúng".** Đó chính là lý do nó xanh ở bước 2 của kịch bản
   đầu báo cáo, ngay trước khi orchestrator crash. Đừng đọc "cổng image OK" thành "image
   trên node đúng commit".

---

## F6 — web↔orchestrator lệch NHIỀU HƠN §3bis nói: hai RPC MỚI, không chỉ một nhánh oneof

**Mức: Critical (ràng buộc thứ tự deploy).**

§3bis chỉ nêu nhánh `admin_user_id` của `ReapSession`. `apps/web` P13 thực tế gọi **ba** thứ
mà `:p12fix` không có:

| Web gọi | file:dòng | `:p12fix` trả |
|---|---|---|
| `reapSession({actor:{case:'adminUserId'}})` | `apps/web/src/server/admin/terminate.ts:39-46` | field 5 unknown ⇒ oneof unset ⇒ `InvalidArgument` |
| `getCapacity({})` | `apps/web/src/server/capacity/get-capacity.ts:37` | **`Unimplemented`** |
| `listSessions(...)` | `apps/web/src/server/sessions/list.ts:23` | **`Unimplemented`** |

`listSessions` là đường **dùng chung** của `me.activeSessions`
(`apps/web/src/server/trpc/routers/me.ts:164-166`) và `admin.sessions.list`
(`.../routers/admin.ts:67-69`) — nên không chỉ màn quản trị chết, mà cả trang "phiên của
tôi" của người dùng thường.

⇒ ràng buộc "web và orchestrator lên CÙNG lượt" **đúng, và mạnh hơn** lý do §3bis viện dẫn.
Chiều ngược lại (orchestrator lên trước) vô hại đúng như §3bis nói: nút chưa tồn tại.

**Codegen ĐÃ sync — không còn field/nhánh nào lệch một chiều.** Đối chiếu tự động 15
message + 2 enum + 7 rpc + 44 field của `proto/orchestrator/v1/session.proto` với
`packages/shared-types/gen/orchestrator/v1/session_pb.ts`,
`proto/gen/go/orchestrator/v1/session.pb.go` và `session_grpc.pb.go`: **không thiếu ký hiệu
nào ở cả ba đích.** (Phép kiểm này gác *sự có mặt của ký hiệu*, không gác byte của
descriptor — một lượt `pnpm proto` sạch vẫn là phép kiểm mạnh hơn, nhưng nó ghi file nên
lane này không chạy.)

**Không có RBAC mới:** `GetCapacity` đọc thuần Redis (`lifecycle/capacity.go:32-42`),
`ListSessions` cũng thuần Redis (`lifecycle/list_sessions.go:119,146,158`; 0 tham chiếu
`clientset`). Diff không chạm template Role/RoleBinding nào.

**Metrics:** `metrics.go` khởi tạo sẵn `actor="admin"` ở 0 (`for _, actor := range
[]string{"user","system","admin"}`) ⇒ đọc ra 0, không NO-DATA. §3bis đúng.

---

## F7 — Dockerfile web: theo kịp workspace, và nội dung bài học CÓ vào image

**Mức: Informational (một rủi ro đã loại trừ, kèm phép kiểm phải chạy).**

- `apps/web/Dockerfile` **không đổi** ở P13, và **không cần đổi**: `pnpm-workspace.yaml`
  khai `apps/*` + `packages/*`, và tập package thực tế (`apps/web`, `packages/{ui,
  shared-types,terminal,scenario}`) **giống hệt** giữa `feat/p12-scale-proof` và HEAD
  (`git ls-tree -d`). Dockerfile `:15-19` (manifest) và `:30-34` (source) phủ đủ 5. Không
  có package mới nào bị bỏ quên.
- **`content/` CÓ vào image**: `Dockerfile:139` `COPY content ./content` +
  `:140 ENV SCENARIOS_DIR=/repo/content/scenarios`. `packages/scenario/src/source.ts:478-480`
  suy ra `labsRootDir`/`playgroundsRootDir` = `dirname(SCENARIOS_DIR)/{labs,playgrounds}` ⇒
  `/repo/content/{labs,playgrounds}`, cũng nằm trong lệnh COPY đó.
- **`.dockerignore` KHÔNG bóc mất markdown bài học**: `:27 **/*.md` bị `:40
  !content/**/*.md` ghi đè (Docker lấy luật khớp CUỐI). Cây `content/` có **57 file `.md`**
  ở độ sâu 2/3/4 — `**` khớp cả ba mức. Các đuôi khác trong `content/` (56 `.sh`, 21
  `.json`, 3 `.js`, 1 `.py`, 1 `.png`, 4 `.upstream`) không khớp luật loại trừ nào.
- P13 **không thêm/sửa file nào dưới `content/`** (`git diff --stat … -- content/` rỗng),
  nên không có nội dung mới để lọt.

**Nhưng đây là suy luận từ luật, không phải phép đo trên image.** Phép kiểm phải chạy sau
khi build, và phải đếm **FILE**, không `ls` thư mục (`ls` xanh vì thư mục vẫn có thật):

```bash
docker run --rm --entrypoint sh ghcr.io/nghaiz/dlp-web:p13 \
  -c 'find /repo/content -name "*.md" | wc -l'      # phải ra 57
```

---

## F8 — Migration 0007: an toàn tiến, không cần lùi — nhưng migrator PHẢI bump

**Mức: Important.**

`apps/web/drizzle/0007_gigantic_gideon.sql` — 4 câu lệnh, **thuần cộng thêm**:
`CREATE TYPE default_shell_pref`, `CREATE TABLE admin_audit`, `CREATE TABLE
user_preferences` + FK cascade, `CREATE INDEX admin_audit_occurred_at_idx`. Không
`ALTER … DROP`, không đổi kiểu cột cũ.

- **Idempotent?** Không ở mức SQL (không `IF NOT EXISTS`), nhưng drizzle-kit giữ bảng
  `__drizzle_migrations` và chạy mỗi file trong một transaction ⇒ chạy lại là no-op, hỏng
  giữa chừng thì rollback sạch rồi retry được. Job khai
  `hook-delete-policy: before-hook-creation,hook-succeeded` (`migrate-job.yaml:69`) nên helm
  retry an toàn. `Dockerfile:88-90` cũng khẳng định điều này.
- **Rollback?** Không có down-migration (drizzle không sinh). **Không cần**: hai bảng mới
  không được mã P12 đọc, nên hạ web về `p10a` sau khi 0007 đã áp là an toàn — DB không phải
  lùi theo.
- **⛔ Nếu quên bump `migrate` khỏi `p9`:** image `p9` không chứa `0007_*.sql`; hook chạy
  **xanh** (nó chỉ áp những gì nó có), rồi `web:p13` truy vấn `admin_audit` /
  `user_preferences` và trả 500 ở request đầu tiên vào trang quản trị / cài đặt.
  **Hook xanh KHÔNG chứng minh schema đã đủ.**

## F9 — Không resource nào đổi vai thành hook ở P13

**Mức: Informational (rủi ro đã loại trừ).**

Đối chiếu annotation `helm.sh/hook` giữa chart P12 và chart HEAD: **giống hệt**, đúng hai
chỗ (`datastore-secret.yaml:48-53`, `migrate-job.yaml:60-69`), không thêm không bớt. Bẫy
"resource chuyển thành hook thì helm xoá bản cũ" **không áp dụng cho lượt này** — không
cần upgrade hai lần.

---

## F10 — Netpol metrics + `exposeAdminPort: auto`: ràng buộc 6 của §3ter ĐÚNG (có một điều kiện)

**Mức: Informational — khẳng định được kiểm chứng bằng đối chứng hai chiều.**

Render với `networkPolicy.platform.enabled: true`:

- Render **14 policy**, gồm cả hai tên mà `infra/k8s/netpol_render_gate.py:59-65` vừa thêm
  vào `EXPECTED_ALLOW_BASE`: `platform-allow-ingress-metrics-orchestrator-web`
  (`platform-networkpolicy.yaml:787`) và `platform-allow-ingress-metrics-gateway-web`
  (`:736`). Cả hai **có thật trong template**.
- Service `platform-gateway` mọc thêm port `admin/8083`.
- Pod web nhận `ORCHESTRATOR_METRICS_URL=http://platform-orchestrator:8081/metrics` và
  `GATEWAY_METRICS_URL=http://platform-gateway:8083/metrics`.

**Đối chứng ÂM** (cùng chart, netpol tắt): Service gateway chỉ còn `public/8082`, và
`GATEWAY_METRICS_URL` **biến mất khỏi env** (chỉ còn `ORCHESTRATOR_METRICS_URL`). Tức `auto`
thật sự bám theo `networkPolicy.platform.enabled` chứ không bật cứng — khẳng định của §3ter-6
có một phép kiểm có thể đỏ đứng sau nó.

⇒ **"không cần `--set` gì thêm" ĐÚNG**, với đúng một điều kiện lane này không đọc được từ
đây: release đang chạy phải thật sự có `networkPolicy.platform.enabled: true` trong values.
Nếu có thì nó **sống sót** qua `12-helm-deploy.sh` (`networkPolicy` nằm trong
`KEEP_SUBTREES`, `:107`). Nếu không có, mọi thứ vẫn xanh, chỉ là `GATEWAY_METRICS_URL` rỗng
và trang quản trị báo `gateway: reached:false` — **đọc y hệt trạng thái "đúng thiết kế"**.
Kiểm bằng một lệnh đọc trước khi deploy (bước 0 của thứ tự deploy).

**Không có CrashLoop từ hai biến này.** `apps/web/src/server/env.ts:157-163` dùng
`requireEnv` (ném khi rỗng), nhưng `admin/health.ts:137-143` bọc bằng `resolveUrl` bắt
ngoại lệ ⇒ `fetchSource` trả `reached:false, ok:false, error:'chưa cấu hình URL /metrics
cho nguồn này (biến môi trường vắng mặt)'` (`health.ts:144-151`). Trạng thái "chưa cấu
hình" **phân biệt được** với "gateway chết" (`reached:false` + message mạng) và với "với tới
nhưng không có series" (`reached:true, ok:false`). Ba nhánh, ba thông báo. §3bis mô tả đúng.

**Ingress `/ide` + middleware — dây nối ĐÚNG.** Render với `ingress.enabled=true` +
`ingress.middleware.enabled=true` (đúng bộ `--set` mà `08-tls-entrypoint.sh:105-113` in ra):
3 Ingress (`platform-web` `/`, `platform-ws` `/ws`, `platform-ide` `/ide` → cổng 8082), và
Middleware `platform-ratelimit-ide` **tồn tại**, được router `/ide` tham chiếu đúng tên
`default-platform-bodylimit@kubernetescrd,default-platform-ratelimit-ide@kubernetescrd`.
Không có tên treo. `ingress.middleware.enabled` nằm trong subtree `ingress` nên nó cũng
sống sót qua bộ lọc của `12-helm-deploy.sh`.

---

## F11 — `pnpm env:check` ĐANG ĐỎ ⇒ job `ts` đỏ ⇒ `ci-ok` đỏ ⇒ PR không merge được

**Mức: Important (chặn merge; KHÔNG chặn image build tay).**

`node scripts/env-check.mjs` trên cây hiện tại:

```
env-check FAIL — env bị drift:
  ✗ [apps/web] code đọc E2E_REQUIRE_ROLES   (apps/web/e2e/a11y.spec.ts)
  ✗ [apps/web] code đọc E2E_EMAIL           (apps/web/e2e/env.ts)
  ✗ [apps/web] code đọc E2E_PASSWORD        (apps/web/e2e/env.ts)
  ✗ [apps/web] code đọc E2E_REQUIRE_SESSION (apps/web/e2e/keyboard.spec.ts)
  ✗ [apps/web] code đọc E2E_START_SERVER    (apps/web/playwright.config.ts)
  ✗ [apps/web] code đọc CI                  (apps/web/playwright.config.ts)
6 lỗi.
```

Cả sáu là "code đọc, `apps/web/.env.example` không khai". `.github/workflows/ci.yml:154-155`
chạy đúng script này làm bước *Env drift gate* của job `ts`, **trước cả `pnpm install`**.
`ts` đỏ ⇒ `ci-ok` đỏ (`:1437` liệt kê `ts` trong `needs`; bước kiểm `:1455-1462` chỉ chấp
nhận `success|skipped`).

Không chặn đường image, vì CI **không bao giờ** publish `:p13` (nó chỉ gắn `sha-…`/`latest`)
— image `p13` phải build tay. Nhưng nó chặn merge, và nó là một cổng đỏ thật.

Sửa: khai sáu biến trong `apps/web/.env.example` (cú pháp `# FOO=bar` cho optional, hoặc
`# env-check: allow-unused`). **Không phải việc của lane này** — nêu để lane sở hữu file đó
đóng trước khi đợt 3 bắt đầu.

**Phần còn lại của ma trận CI/env: ĐẠT.**

- `web-a11y` **có** trong `ci-ok.needs` (`ci.yml:1437`). ✓
- `turbo.json` `tasks.test.env` **và** task `e2e` mới đều khai `ORCHESTRATOR_METRICS_URL` +
  `GATEWAY_METRICS_URL`. ✓
- `.github/ci.env:96-97` khai cả hai (rỗng, kèm lý do). ✓
- `apps/web/.env.example:142-143` khai cả hai. ✓
- `env-check` **không** báo lỗi nào ở phía Helm ⇒ chart phủ đủ mọi biến bắt buộc mà code
  đọc; không có biến P13 nào bị quên trong template. ✓

---

## Ba con số CHƯA ĐO — nêu là rủi ro, không phải khẳng định

Lane này **không đo được cái nào** (không chạm cụm), và đọc mã cũng không thay được phép đo:

1. **Trần body 1 MiB trên `/ide`.** `ingress.yaml` (khối `/ide`) tự ghi ra rằng
   `bodylimit` là **một object dùng chung với `-web`**, nên nâng nó là nới trần cho cả `/`.
   Đường lưu file chính của Theia đi WebSocket JSON-RPC (không chạm trần), nên rủi ro nằm ở
   **upload HTTP**. Nếu đợt 3 thấy upload hỏng: thêm `bodylimit-ide` RIÊNG, **đừng** nâng
   `ingress.middleware.bodyLimit.maxRequestBodyBytes`.
2. **Tier `ratelimit-ide` 600/1m burst 300** (`values.yaml:533-536`). `/ide` chưa từng đi
   qua Traefik lần nào (6.A/6.B/6.E đều `port-forward`). Triệu chứng nếu sai là **IDE
   trắng hoặc nạp nửa chừng**, KHÔNG phải một thông báo rate-limit — vì 429 rơi trúng một
   asset chứ không trúng một lời gọi API.
3. **`capacityHardLimit: '8'`** — mặc định dạng cloud trong `values.yaml:244`. Lab dùng
   `'23'` (`values-selfhost.yaml:176`, có phép đo `ceiling.js` 2026-09-04 đứng sau). Con số
   `8` chưa đo và không được dùng để tích ô nghiệm thu nào.

Thêm một thứ chưa đo mà lane này phát hiện: **cổng render-vs-`ctr` không gác được đời mã**
(F5). Sau khi side-load `:p13`, không có phép kiểm tự động nào nói image trên node đúng
commit. Cách rẻ nhất để đóng: đọc `dlp_build_info` từ `/metrics` của orchestrator sau
deploy và so với `git rev-parse --short HEAD`.

---

## THỨ TỰ DEPLOY AN TOÀN

Ràng buộc cứng, theo thứ tự: **(a)** web và orchestrator lên CÙNG một lượt (F6);
**(b)** migrator lên cùng lượt hoặc trước, không sau (F8); **(c)** mọi image phải có trên
node TRƯỚC `helm upgrade` (`imagePullPolicy: Never`); **(d)** tag phải nằm trong
`values-selfhost.yaml` chứ không trong `--set` (F4).

### Bước 0 — ba phép đọc (an toàn với lane đang đo cụm, không đổi trạng thái)

```bash
# 0a. Xác nhận F1 TRÊN CỤM, không chỉ trong git.
kubectl -n default get deploy platform-orchestrator \
  -o jsonpath='{.spec.template.spec.containers[0].env[*].name}' | tr ' ' '\n' | grep CAPACITY
#   ra CAPACITY_SOFT_LIMIT  ⇒ đúng như F1, thứ tự dưới đây bắt buộc
#   ra CAPACITY_HARD_LIMIT  ⇒ ai đó đã deploy chart mới; DỪNG, đọc lại trạng thái

# 0b. netpol nền tảng có bật không (quyết định F10 / ràng buộc 6).
ssh "$VM_SSH" "helm get values platform -n default -o json" \
  | python3 -c "import json,sys;v=json.load(sys.stdin);print('netpol=',v.get('networkPolicy',{}).get('platform',{}).get('enabled'),'| middleware=',v.get('ingress',{}).get('middleware',{}).get('enabled'))"
#   KHÔNG in gì khác từ file này — nó chứa mật khẩu.

# 0c. Tag nào đang thật sự chạy.
ssh "$VM_SSH" "sudo ctr -n k8s.io images ls -q | grep dlp-"
```

### Bước 1 — đóng cổng đỏ (không phải lane này, nhưng chặn merge)

1. Lane sở hữu `apps/web/.env.example` khai 6 biến của F11.
   Verify: `node scripts/env-check.mjs` → im lặng, exit 0.

### Bước 2 — verify toàn cây TRƯỚC khi build image

2. `pnpm turbo run lint typecheck build test` — một lệnh, nhiều task (đừng dùng
   `pnpm --filter web typecheck lint test`: pnpm đẩy `lint test` thành argv của `tsc`).
   **Đọc dòng `Tasks: X/Y` trước khi trích bất kỳ con số test nào** — turbo dừng sau task
   đỏ nên `15/19` nghĩa là bốn task sau CHƯA CHẠY.

### Bước 3 — bump BỐN tag, cùng một commit với mã

3. Sửa `infra/helm/platform/values-selfhost.yaml`, đúng bốn dòng:

   | dòng | khoá | từ | sang |
   |---|---|---|---|
   | `:80` | `migrate.image.tag` | `p9` | `p13` |
   | `:97` | `web.image.tag` | `p10a` | `p13` |
   | `:148` | `orchestrator.image.tag` | `p12fix` | `p13` |
   | `:194` | `gateway.image.tag` | `p12fix` | `p13` |

   **KHÔNG đổi** `image.tag` gốc (`:37`) và **KHÔNG đổi**
   `orchestrator.env.sandboxImage` (`:…p10a`) — P13 không chạm `images/sandbox-base/`.

### Bước 4 — build bốn image, tag ĐÚNG dạng ghcr (CI sẽ không làm hộ)

4. Từ ROOT repo:

```bash
docker build -f apps/web/Dockerfile                     -t ghcr.io/nghaiz/dlp-web:p13              .
docker build -f apps/web/Dockerfile --target migrator   -t ghcr.io/nghaiz/dlp-migrator:p13        .
docker build -f services/orchestrator/Dockerfile        -t ghcr.io/nghaiz/dlp-orchestrator:p13    .
docker build -f services/terminal-gateway/Dockerfile    -t ghcr.io/nghaiz/dlp-terminal-gateway:p13 .
```

   Tag phải là `ghcr.io/nghaiz/…:p13` chính xác — `11-sideload-images.sh:236` dùng
   `docker image inspect` trên đúng ref đó để quyết định có pull hay không.

### Bước 5 — kiểm FILE trong image web (không kiểm thư mục)

5. ```bash
   docker run --rm --entrypoint sh ghcr.io/nghaiz/dlp-web:p13 \
     -c 'find /repo/content -name "*.md" | wc -l'    # phải ra 57
   docker run --rm --entrypoint sh ghcr.io/nghaiz/dlp-migrator:p13 \
     -c 'ls /repo/apps/web/drizzle/0007_gigantic_gideon.sql'   # phải tồn tại
   ```

### Bước 6 — side-load, đừng pull

6. `bash infra/host/11-sideload-images.sh dlp-web dlp-migrator dlp-orchestrator dlp-terminal-gateway`
   Script tự đọc `:p13` từ values (F4), tự băm-kiểm tarball trước khi scp, và tự khẳng định
   lại trên node bằng `ctr images ls`. Bỏ tham số nếu muốn nạp lại cả `dlp-sandbox-base`.

### Bước 7 — deploy (một lượt duy nhất; KHÔNG chia nhỏ)

7. `bash infra/host/12-helm-deploy.sh`
   - Cổng image sẽ so bốn `:p13` với node — **nếu bước 6 sót cái nào, cổng này đỏ TRƯỚC
     upgrade.** Đó là hàng rào thật, dùng nó.
   - **KHÔNG chạy `helm upgrade` tay, và TUYỆT ĐỐI không `--reuse-values`** — nó kéo
     `orchestrator.env.capacitySoftLimit: '20'` của release cũ về và sẽ dính bẫy `fail` ở
     `orchestrator-deployment.yaml:175`. Dùng script; nó lọc theo danh sách cho phép.
   - **KHÔNG deploy web trước orchestrator** (F6): mọi lượt admin kết thúc phiên
     `InvalidArgument`, và `me.activeSessions` + `admin.sessions.list` `Unimplemented`.

### Bước 8 — nghiệm thu sau deploy

8. Theo thứ tự này (mỗi ô chỉ tin sau khi ô trước xanh):
   - `13-smoke.sh` chạy tự động ở cuối bước 7. Nếu đỏ, dừng.
   - Metric: chạy đúng lệnh một-dòng của §3ter-6 **từ trong pod web** (nó kiểm cả ba nửa và
     nói rõ nửa nào thiếu).
   - e2e: promote vai trò bằng `apps/web/e2e/scripts/promote-role.sh` **TRƯỚC**, rồi chạy
     với `E2E_REQUIRE_ROLES=1` (thiếu cờ thì năm màn quản trị SKIP và một lượt SKIP sạch
     trông y hệt một lượt PASS).
   - Hai ô e2e đang đỏ đúng (`frame-src 'self'`, nonce cho script theme) **phải xanh** sau
     bước 7. Còn đỏ = lỗi thật, không phải môi trường.
   - Chạy lại pentest 3.E (P13 nới CSP `frame-src` và phát cookie `dlp_sandbox` thêm
     `Path=/ide` — nới bề mặt thì phải chạy lại đối chứng).
   - Đo ba con số chưa đo ở mục trên. Đừng tích ô nghiệm thu nào dựa vào chúng trước đó.

### Đường lùi

`helm rollback platform -n default` đưa Deployment về đời trước. **Không cần lùi DB**:
migration 0007 thuần cộng thêm và mã P12 không đọc hai bảng mới (F8). Image cũ vẫn còn trên
node (side-load không xoá), nên rollback không chờ pull.
