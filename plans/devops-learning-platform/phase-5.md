# Phase 5 — Engine v2: đưa bản vá lên cụm, deploy lặp lại được, đóng vòng đo

**Mức chi tiết:** DETAILED · **Effort:** M · **Blocks:** P6–P14 (mọi phase sau đều deploy qua đường này) · **Blocked by:** PR đóng nợ sau P3 (đã merge)

> Phase này KHÔNG thêm tính năng người dùng nào. Nó tồn tại vì một lý do đo được: **cụm đang chạy `sha-0941471`, main đã đi trước, và mọi bản vá của lượt trước chưa từng chạy trên cụm.** Một bản vá chưa deploy là một bản vá chưa tồn tại.

## Objective

1. Bản vá nợ-sau-P3 (trần chấm 120s, pod-alive sau claim, `endSession`, probe 5s, `POOL_TARGET=3`) **chạy trên cụm** và được đo lại bằng chính harness đã đo ra lỗi.
2. Deploy từ repo → cụm là **một lệnh lặp lại được**, có cổng smoke, không còn `--set` gõ tay.
3. Ba khoảng trống engine còn lại được đóng: gia hạn phiên từ FE, warm-pool rollout theo image, và `reaper-verify` phủ ca hỏng mới.

## Bối cảnh đo được (đừng đo lại, đọc ở đây)

| Đại lượng | Giá trị | Nguồn |
|---|---|---|
| Cụm | 1 node, 8 vCPU, 11.6Gi, kubeadm v1.34.10, containerd 2.3.3, Sysbox | `infra/host/` |
| Quota `dlp-sandbox` | pods 26 · requests 5400m/5500Mi · limits 44/22Gi ⇒ **21 pod** | `values-selfhost.yaml` §quota |
| Trần phiên đồng thời | 21 − `POOL_TARGET` = **18** (sau khi pool đi 1→3) | D16 |
| Trần chấm | `GATEWAY_EXEC_TIMEOUT` **120s** (was 30s), BFF 135s | PR nợ-sau-P3 |
| Đo N=18 cùng build | build p50 27.4s · claim 23–45s · workingSet đỉnh 3139Mi (27%) · CPU đòi 20 core / 8 | `reports/2026-08-16-concurrent-build-load.md` |
| Đường deploy | `infra/host/11-sideload-images.sh` (đọc tag từ values) → `12-helm-deploy.sh` (ship chart tươi) | 3.I mắt 1 |

⛔ **Bẫy đã dẫm hai lần, đừng dẫm lần ba:** `~/dlp-deploy` trên VM là bản chép tay của chart và đã bị đánh dấu DEPRECATED. Mọi `helm upgrade` đi qua `12-helm-deploy.sh`, không đi qua thư mục đó.

## Trạng thái 5.A — ✅ XONG 2026-09-02, cụm chạy `sha-4b7e553` (helm rev 79)

> ⚠ Mục này đã bị viết SAI **hai lần** trong cùng ngày trước khi đúng. Giữ lại vết
> đó ở §"Hai chẩn đoán sai" vì nó đắt hơn kết quả.

### Khẳng định trên đối tượng sống

| # | Đại lượng | Trước | Sau | Đọc từ đâu |
|---|---|---|---|---|
| 1 | image 3 service | `sha-0941471` | **`sha-4b7e553`** | `kubectl get deploy -o custom-columns` |
| 2 | `GATEWAY_EXEC_TIMEOUT` | `30s` | **`120s`** | spec của POD đang chạy |
| 3 | `POOL_TARGET` | `1` | **`3`** | spec Deployment |
| 4 | redis liveness `timeoutSeconds` | `1` | **`5`** | spec Deployment |
| 5 | helm revision | 78 | **79** | `helm list` |

Kèm: **3 pod ấm** (trước 1) · **6/6 pod Running, 0 restart** · quota 3/26 ·
`/api/health` → **200 `{"status":"ok"}`** và `/login` → **200**, đi qua Traefik
`:30443` chứ không qua port-forward.

⛔ **`kubectl exec deploy/platform-gateway -- env` TRẢ RỖNG, và rỗng ở đây KHÔNG
nghĩa là "biến không được đặt".** Image gateway là **distroless** — không có
`/bin/sh`, nên `exec` hỏng và `grep` nhận vào một dòng trống, im lặng. Đọc từ spec
của pod (`kubectl get pods … -o json | jq`) mới là nguồn đúng. Verify command của
chính plan này đã sai vì lý do đó và đã được sửa ở §Verify dưới.

### Đường đã đi được (và số đo của nó)

`sudo ctr -n k8s.io images pull` **thẳng trên VM**, không qua `docker save`:

| Image | Thời gian |
|---|---|
| `dlp-web` | 22 m 33 s |
| `dlp-orchestrator` | 5 m 19 s |
| `dlp-terminal-gateway` | 2 m 07 s |
| `dlp-sandbox-base` | **31 s** — layer đã có sẵn vì `images/` không đổi giữa hai commit |
| `dlp-migrator` | ~17 m |

Băng thông thật đo bằng byte của content store: **175–230 KB/s**.

### Hai chẩn đoán sai, và vì sao chúng đứng vững một lúc

**Sai #1 — "mạng đứng, 93 B/s".** Số đó đến từ
`curl -w '%{speed_download}'` chạy trên `https://ghcr.io/v2/`, một phản hồi **401
dài 73 byte**. Nó đo độ trễ của một request rỗng, không đo băng thông. Bằng chứng
bác bỏ đã nằm sẵn trong log lúc đó: dòng `scp 70M` nghĩa là 73 MB **đã tải xong
và đã sang tới VM**.

**Sai #2 — "`docker save` xuất tarball sai digest".** Có thật một blob tên
`a0f82f…` băm ra `2fc66109…`, và `ctr import` từ chối nó hai lần. Nhưng lượt kiểm
ngay sau đó **không tái hiện được**: `docker save` tươi của đúng image ấy cho
**17/17 blob khớp digest**, scp sang VM giữ nguyên `sha256`, `ctr import` **exit
0**. ⇒ Đó là **một artefact hỏng cá biệt**, không phải thuộc tính của `docker
save`. Nghi phạm: ba thao tác docker chạy đồng thời trên cùng image lúc đó, cộng
một `taskkill` rơi vào cửa sổ ấy — nhưng artefact đã bị xoá trước khi soi được,
nên đây là **giả thuyết chưa chứng minh**.

**Điểm chung của cả hai lần:** một nguyên nhân được viết vào repo mà **chưa chạy
lại trên một artefact tươi**. Cả hai lần triệu chứng đều khớp thuyết phục với câu
chuyện sai. Kỷ luật rút ra: *tái hiện trước khi đặt tên cho nguyên nhân* — và khi
log đã có sẵn kết quả, đọc log trước khi đi đo.

Cổng chặn sinh ra từ lượt này (`kiem_tarball` trong `11-sideload-images.sh`) vì thế
kiểm **điều kiện hỏng** ("tarball có blob sai digest không"), không kiểm nguyên
nhân phỏng đoán.

### Còn lại của 5.A

5.A/5.C/5.D/5.E/5.F đã đóng. Còn lại của P5:

- **5.B chưa đóng trọn** — xem ô AC đầu tiên: bản vá `timeout 90` chưa được đo dưới
  tải, vì lượt đo sau khi vá rơi đúng vào một node vừa reboot.
- **`orchestrator gRPC: Premature close` ~5–10%** — lỗi mới nổi lên khi trần timeout
  hết che nó: 1/18 (lượt A) và 2/18 (lượt B) lượt `checkStep` trả HTTP 500. Đã lần
  được đường (`sessionExpiry` → `GetSession` → `callOrchestrator`, kết nối h2 đứt
  giữa chừng; orchestrator KHÔNG có log lỗi và KHÔNG restart). **Chưa vá có chủ ý:**
  retry trong `callOrchestrator` sẽ che triệu chứng thay vì giải thích nó, và hàm ấy
  bọc cả những RPC không idempotent.

---
## Task list

### 5.A — Deploy bản vá và chứng minh nó ĐANG chạy

1. Sau khi CI publish `sha-<main>`, sửa **một dòng** `image.tag` trong `values-selfhost.yaml`. Không `--set` nào cho tag.
2. `11-sideload-images.sh` (đọc tag từ chính values — SSOT) → `12-helm-deploy.sh`.
3. **Khẳng định trên đối tượng sống, không trên file YAML:**
   - `kubectl get deploy -o jsonpath` cho từng image → đúng sha mới, cả 4 service.
   - `kubectl exec deploy/platform-gateway -- env | grep EXEC_TIMEOUT` → `120s`.
   - `kubectl get deploy platform-orchestrator -o json | jq` env `POOL_TARGET` → `3`.
   - `kubectl get pods -n dlp-sandbox -l app=sandbox` → **3 pod ấm** trong ≤ 2 phút.
   - `kubectl get deploy platform-redis -o json | jq .spec…livenessProbe.timeoutSeconds` → `5`.

> ⚠ **Đối chứng âm bắt buộc:** trước khi upgrade, ghi lại 5 giá trị trên ở bản CŨ. Không có vế đó thì "đã thấy 120s" không phân biệt được với "vẫn đang đọc file trong repo".

### 5.B — Đo lại N=18 bằng CHÍNH harness đã đo ra lỗi

4. Chạy lại `reports/harness/2026-08-16-3i-concurrent-build/run.mjs` không sửa gì ngoài số N (18 khe trống mới = 21 − 3).
5. Ba khẳng định, mỗi khẳng định một con số:
   - **N/N hoàn tất bước chấm** (trước: 1/18). Nếu vẫn có lượt 500, đọc `dlp_gateway_exec_oneshot_duration_seconds` p99 rồi chỉnh trần bằng SỐ, không bằng cảm giác.
   - **claim p50/p95** với 3 pod ấm — 3 người đầu phải < 1s; người 4..18 vẫn cold path (đó là kỳ vọng, không phải lỗi).
   - **`dlp_claim_dead_pod_total` = 0** trong suốt lượt đo.
6. Ghi report `reports/2026-XX-XX-verify-5b-rerun-n18.md` **so cột-với-cột** với báo cáo cũ. Cột nào không cải thiện thì nói thẳng.

### 5.C — Warm-pool rollout theo image

7. Đổi `image.tag` KHÔNG tự thay pod ấm đang chạy image cũ. `dlp_reaper_stale_image_pods_total` đã tồn tại (tầng 4 của reaper) — **kiểm nó có thật sự bắn không**, đừng tin vào việc counter tồn tại.
8. Đối chứng dương: side-load một tag mới, `helm upgrade`, đo counter tăng đúng bằng số pod ấm cũ và pool tự dựng lại đủ `POOL_TARGET`.
9. Nếu tầng 4 không bắn: sửa, kèm test. Nếu bắn nhưng chậm hơn một tick sweep: ghi con số, đừng ghi "hoạt động".

### 5.D — Gia hạn phiên từ FE

10. `ExtendSession` RPC **đã có** ở proto và gateway (`internal/extend`), FE **chưa từng gọi**. Thêm `lessons.extendSession` (uỷ quyền như `endSession`) + nút "Thêm giờ" hiện khi `expiresAt` còn < 10 phút.
11. Máy trạng thái: control `expiring` đã cập nhật đồng hồ (1.C-3). Nút chỉ gọi RPC rồi để `expiring` kế tiếp đẩy đồng hồ — **không** tự đặt `expiresAtMs` ở client (đó là derived field của server).
12. `hardCapReached` ⇒ nút disable kèm câu giải thích, không ẩn đi: một nút biến mất không nói được vì sao.

### 5.E — Deploy lặp lại được + cổng smoke

13. `12-helm-deploy.sh` thêm **cổng smoke sau upgrade** (exit ≠ 0 nếu trượt): 4 deployment Ready, 3 pod ấm, `/api/health` 200 qua Traefik, một lượt `startSession`+`checkStep` end-to-end trên `dlp-sandbox-basics`, rồi `endSession` dọn.
14. Script phải **tự dọn phiên nó tạo** — một cổng smoke để lại rác là một cổng tự làm hỏng phép đo lần sau.
15. Ghi `infra/host/README.md`: đường deploy chuẩn, và một dòng nói `~/dlp-deploy` đã chết.

### 5.F — `reaper-verify` phủ ca hỏng mới

16. Thêm ca **claim-gặp-pod-chết** vào `infra/k8s/reaper-verify.sh`: xoá một pod trong `pool:free` bằng apiserver, gọi `startSession`, khẳng định trả `Unavailable` (không phải một session trỏ pod ma), `dlp_claim_dead_pod_total` +1, và `pool:free`/`pool:claimed` không còn tên đó.
17. Ca này **phải ĐỎ** khi revert bản vá 5.A — chạy một lượt với image cũ để chứng minh, rồi ghi kết quả vào report.

## File / dir ownership

`infra/helm/platform/values-selfhost.yaml` · `infra/host/{11-sideload-images.sh,12-helm-deploy.sh,README.md}` · `infra/k8s/reaper-verify.sh` · `apps/web/src/server/trpc/routers/lessons.ts` · `apps/web/src/app/lessons/[id]/{use-lesson-session.ts,lesson-client.tsx}` · `packages/terminal/src/session-machine.ts` · `plans/devops-learning-platform/reports/`

## Dependencies

- **Blocked by:** CI publish `sha-<main>` sau khi PR nợ-sau-P3 merge.
- **Blocks:** mọi phase sau — chúng đều deploy qua 5.E và đều đo trên trần 5.B.

## Acceptance criteria

- [x] 5 giá trị của 5.A khẳng định trên **đối tượng sống**, kèm giá trị CŨ làm đối chứng.
      → bảng ở §"Khẳng định trên đối tượng sống" trên. `GATEWAY_EXEC_TIMEOUT` đọc từ
      spec của POD (không `kubectl exec` — image distroless).
- [~] N=18 cùng build: **18/18 qua bước chấm** (hoặc con số thật + p99 histogram nếu chưa).
      **Chạy HAI lượt 2026-09-03. Vế trần gateway ĐÓNG; vế "hoàn tất bài" CHƯA đóng
      được vì phép đo thứ hai bị nhiễu.**
      · Lượt A (`sha-4b7e553`): **0/18 chạm `GATEWAY_EXEC_TIMEOUT`** (lượt 08-16 là
        17/18) ⇒ bản vá trần gateway hoạt động. Nhưng vẫn **1/18 hoàn tất**, vì chỗ
        nghẽn **dịch xuống một tầng**: `timeout 20` trong
        `content/scenarios/dlp-docker-basics/step4/verify.sh`. Bằng chứng trực tiếp
        (harness nay giữ `output`): 17× `exit=124` — mã của GNU `timeout` — **kèm
        chuỗi ĐÚNG mà container đã kịp in ra trước khi bị giết**.
      · Đã nâng `20` → `90`, deploy `sha-2b79fd3`, khẳng định `timeout 90` có thật
        trong image ĐANG CHẠY (`kubectl exec … grep`).
      · Lượt B: **16/18 hoàn tất**. ⛔ **Con số này CHƯA chứng minh bản vá.** Node vừa
        reboot (máy dev crash), nên `docker build` p50 đi từ **36.5s xuống 5.3s** —
        nhanh hơn 7 lần, thứ mà một bản vá timeout không thể gây ra. Với `docker run`
        ~4.6s ở node rảnh, **trần 20 cũ cũng sẽ qua**. Lượt B chứng minh "hệ chạy đúng
        khi node rảnh", không chứng minh "90s cứu được ca dưới tải".
      · **Phép đo còn thiếu:** N=18 trên node ĐÃ BỊ TẢI với `timeout 90`; hoặc hai lượt
        liên tiếp trên cùng trạng thái node, một với `20` và một với `90`.
      Báo cáo: `reports/2026-09-03-verify-5b-rerun-n18.md`.
- [~] claim p95 của 3 người đầu < 1s; số người đi cold path ghi rõ.
      Đo được: ba người đầu **3.7 / 3.9 / 3.9 s** (lượt trước, pool=1: 23–45s cho MỌI người).
      Cải thiện ~6–12 lần nhưng **không đạt ngưỡng 1s** — pool 3 pod ấm bị 18 người
      tranh nhau ngay ở giây đầu, nên cả ba đều chờ apiserver dưới tải. 15/18 đi cold
      path. Ngưỡng 1s đặt cho một warm-pool đủ lớn; trên hạ tầng này nó đòi `POOL_TARGET`
      cao hơn, và mỗi pod ấm là một khe quota bị giữ thường trực — đánh đổi thuộc P12.
- [x] `dlp_claim_dead_pod_total` = 0 trong lượt đo bình thường, và = 1 trong ca dựng của 5.F.
      → đo qua Prometheus sau deploy: **0**. `reaper-verify.sh --case deadpod`: **0 → 1**.
- [x] Đổi `image.tag` ⇒ pod ấm cũ bị rút, pool tự đủ lại (`dlp_reaper_stale_image_pods_total` tăng đúng số).
      → **thí nghiệm tự nhiên** của chính lượt deploy 5.A: `stale_image=1` (đúng 1 pod
      ấm cũ, vì `POOL_TARGET` trước đó là 1), `dead_free_pods=0` (chứng minh nó bị rút
      vì IMAGE CŨ chứ không vì chết), `pool_free_size=3` (pool tự đủ lại theo target mới).
- [x] Nút "Thêm giờ" gia hạn thật; chạm `hardCap` thì disable kèm lý do.
      **Đóng 2026-09-08 bằng cú bấm thật trên cụm** ([đo](reports/harness/2026-09-08-ac-browser/run.md)):
      chờ 27 phút để đồng hồ CLIENT xuống dưới ngưỡng 10 phút (không rút ngắn được —
      client chỉ nhận `expiresAt` từ `startSession`/`extendSession`, và làm giả
      `Date.now()` cũng vô ích vì độ lệch triệt tiêu giữa hai vế so sánh). Bấm ⇒ Redis
      `expiresAt` **+213s**, `revision` **+1** (đúng một lượt), hạn mới bằng CHÍNH XÁC
      `lúc_bấm + 300`; đồng hồ UI 3→5 phút. **Đối chứng nhiễu nền:** suốt 27 phút chờ với
      terminal rảnh, `revision` đứng yên và `expiresAt` không nhích — nên thay đổi trên là
      do cú bấm, không do heartbeat. Chạm trần: `expiresAt` = đúng `createdAt+7200` (không
      bị cắt thì đã là `now+300`), nút `disabled` + `title` + tooltip Radix MỞ THẬT khi
      hover, câu chữ đọc được ở cả hai đường. ⚠ Vế trần cứng có **dựng cảnh**: lùi
      `createdAt` 7000s để trần 2h bám vào; vế gia hạn thì hoàn toàn tự nhiên.
      Đã có: `lessons.extendSession` · sự kiện `EXTENDED` (nhận `expiresAt` SERVER trả,
      không tự cộng ở client) · đồng hồ đếm ngược 15s/nhịp · nút hiện khi còn <10 phút,
      **disable kèm `title` giải thích** khi `hardCapReached` (không ẩn — một nút biến mất
      không nói được vì sao). 3 test mới, **đối chứng âm đã chạy**: gỡ nhánh `EXTENDED`
      ⇒ 3 test ĐỎ; khôi phục ⇒ 105/105 xanh.
      Đường server: `lifecycle-probe -case extend` trên cụm **4/4 PASS** (revision tăng
      đúng 1, revision cũ → FailedPrecondition, lượt bị từ chối không ghi gì).
      Còn thiếu đúng một vế: một người thật bấm nút trên trình duyệt. Đó là việc của
      harness e2e (P13), không phải của một cổng shell.
- [x] `12-helm-deploy.sh` có cổng smoke, trượt thì exit ≠ 0, và tự dọn phiên nó tạo.
      → `infra/host/13-smoke.sh`, gọi ở cuối `12-helm-deploy.sh` (opt-out `--no-smoke`).
      Chạy thật: **7/7 PASS**. **Đối chứng âm đã chạy**: `RELEASE=khong-ton-tai` ⇒ 3 vế
      ĐỎ, `exit=1`. Probe dùng `-case create` KHÔNG kèm `-keep` nên tự reap; `trap` xoá
      pod probe ở mọi đường thoát.
- [~] `reaper-verify.sh` xanh toàn bộ, và ca mới ĐỎ trên image cũ (đối chứng âm).
      Ca mới `--case deadpod` chạy trên cụm: **4/4 PASS**, trong đó có sẵn một **đối
      chứng dương** ("claim kế tiếp vẫn nhận pod SỐNG") — thiếu nó thì một cổng
      `podAlive` luôn trả false cũng làm ba vế kia xanh.
      **Vế "ĐỎ trên image cũ" chưa chạy**, có chủ ý: nó đòi deploy lại orchestrator bản
      cũ lên cụm đang phục vụ. Thay bằng một guard TRONG ca: `metric` trả `NA` ⇒ `bad`
      kèm câu "orchestrator đang chạy bản CŨ, chưa có cổng podAlive". Guard đó **cũng
      chưa được thấy đỏ**, nên ô này để `[~]` chứ không tick.
- [x] 10 luật §6 không suy giảm: `endSession`/`extendSession` không nhận `userId` từ input (luật 1), Zod strict (luật 3).
      → cả hai input schema `.strict()` và **không có field `userId`**; `ctx.user.id` là
      nguồn duy nhất. Orchestrator vẫn tự kiểm chủ sở hữu (NotFound cho phiên người khác).

## Verify commands

```bash
bash infra/host/11-sideload-images.sh && bash infra/host/12-helm-deploy.sh   # có cổng smoke
kubectl get deploy -o custom-columns=N:.metadata.name,IMG:.spec.template.spec.containers[*].image
# ⛔ KHÔNG dùng `kubectl exec … -- env`: image gateway là distroless, không có
# /bin/sh ⇒ exec hỏng và grep nhận dòng trống — rỗng đọc ra như "chưa đặt".
kubectl get pods -l app.kubernetes.io/component=gateway -o json  | jq -r '.items[0].spec.containers[0].env[]|select(.name=="GATEWAY_EXEC_TIMEOUT")|.value'
node plans/devops-learning-platform/reports/harness/2026-08-16-3i-concurrent-build/run.mjs --n 18
bash infra/k8s/reaper-verify.sh
```

## Risk Assessment (P5)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| `POOL_TARGET=3` ăn 3 khe quota, trần phiên 20→18 mà chưa ai đo lợi ích thật | 3 | 3 | 9 | 5.B đo tỉ lệ cold-path trước/sau; nếu lợi ích < 1 khe thì trả về 1 và ghi số. |
| Trần 120s vẫn thủng ở 40 người (chưa đo) | 3 | 4 | 12 | Histogram mới cho p99; P12 mới là chỗ đo 40. Không hứa trước. |
| Cổng smoke tự nó tạo rác nếu trượt giữa chừng | 3 | 3 | 9 | `trap` dọn phiên ở mọi đường thoát; ca "smoke trượt" phải được thử tay một lần. |
| Deploy mới làm mất phiên người đang học | 2 | 3 | 6 | Gateway có drain 1012 + PDB (3.H); web/orchestrator rollout ngắn. Ghi vào README rằng deploy giờ học là có phí. |

## Timeline (P5)

| Task | Effort |
|---|---|
| 5.A deploy + khẳng định sống | S |
| 5.B đo lại N=18 + report | M |
| 5.C rollout pool theo image | S |
| 5.D extend từ FE | S |
| 5.E cổng smoke trong deploy | M |
| 5.F reaper-verify ca mới | S |
| **Total** | **M** |
