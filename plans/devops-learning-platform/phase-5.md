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

## Trạng thái 5.A — ĐÃ THỬ 2026-09-02, HỎNG Ở `docker save`, KHÔNG PHẢI Ở MẠNG

> ⚠ **Bản đầu của mục này chẩn đoán SAI** ("mạng chặn, 93 B/s") và đã được sửa trong
> cùng ngày. Giữ lại cả hai vì bài học nằm ở khoảng cách giữa chúng — xem §"Phép đo
> tự nói dối" dưới.

### Điều thật sự hỏng

`11-sideload-images.sh` chạy `docker pull` → `docker save` → `scp` → `ctr images import`.
Ba bước đầu **THÀNH CÔNG**. Bước bốn hỏng **tất định trong 3.5 giây**:

```
ctr: failed to extract layer (application/vnd.oci.image.layer.v1.tar+gzip
  sha256:a0f82f71477f…) failed to get reader from content store:
  content digest sha256:a0f82f71477f…: not found
```

Blob ĐÓ **có mặt** trong tarball (`tar -tf` thấy nó, 53,377,296 byte). Nhưng:

| | |
|---|---|
| Tên file blob trong tar | `a0f82f71477fc2e453be843cff60ca54b0f44a67df7a3f01fddf121b807826be` |
| `sha256sum` NỘI DUNG của chính nó | **`2fc661092594c6e8b85426a74c564080628765a3251b01284ef4b5046fad5307`** |

⇒ **`docker save` xuất ra tarball có blob sai digest.** `ctr` nạp vào, băm lại, thấy
lệch, không lưu dưới digest được khai — rồi lúc unpack báo "not found". Triệu chứng
đọc như thiếu dữ liệu; thực chất là dữ liệu SAI TÊN.

Nguyên nhân gần như chắc chắn: Docker Desktop bật **containerd image store**, và ở chế
độ đó `docker save` ghi layer đã GIẢI NÉN dưới tên digest của bản NÉN. Đây là lỗi của
máy dev, **không phải** của script, không phải của image trên ghcr.

### Đường đi được, đã đo

`sudo ctr -n k8s.io images pull --user <user>:<token> ghcr.io/nghaiz/<img>:<tag>` chạy
**thẳng trên VM**, bỏ qua `docker save` hoàn toàn. Đo được: content store lớn thêm
**2 MB trong 25 s ≈ 80 KB/s** — chậm nhưng THẬT.

### Phép đo tự nói dối — bài học đắt nhất của lượt này

Bản đầu kết luận "mạng đứng, 93 B/s" từ:

```bash
curl -s -o /dev/null -w '%{speed_download}' https://ghcr.io/v2/    # 401, thân 73 byte
```

`%{speed_download}` trên một phản hồi **401 dài 73 byte** không đo băng thông — nó đo
độ trễ của một request rỗng. Con số 93 B/s là artefact, và nó **khớp một cách thuyết
phục** với triệu chứng đang thấy (pull lâu), nên nó được tin. Bằng chứng bác bỏ đã có
sẵn trong chính log mà lúc đó chưa đọc kỹ: dòng `scp 70M` nghĩa là 73 MB **đã tải
xong và đã sang tới VM**.

⇒ Đo băng thông bằng một lượt tải THẬT (byte của content store, hoặc một blob thật),
không bằng một request trả lỗi. Và khi log đã có sẵn kết quả, đọc log trước khi đo.

### Trạng thái để lại

| | |
|---|---|
| Cụm | vẫn `sha-0941471`, **không đụng gì**, 6/6 pod Running |
| `values-selfhost.yaml` | **KHÔNG bump tag** — cụm chạy `imagePullPolicy: Never`, commit một tag mà node không có image là làm mọi pod kế tiếp không khởi động được |
| ghcr | `sha-4b7e553` có đủ **5/5** image |
| node | 0/5 image ở tag mới |
| `images/` giữa `0941471..4b7e553` | **không đổi một dòng** ⇒ nội dung `dlp-sandbox-base` y hệt, chỉ khác tag (193 MB trên node) |

**Bản chụp đối chứng CŨ** (để lượt deploy sau khẳng định được là đã đổi thật): image
`sha-0941471` · `GATEWAY_EXEC_TIMEOUT=30s` · `POOL_TARGET=1` · 1 pod ấm · redis
liveness `timeoutSeconds=1` · helm revision 78.

### Việc còn lại — hai đường, chọn một

1. **Sửa máy dev** (rẻ nhất nếu làm được): tắt containerd image store trong Docker
   Desktop, rồi `11-sideload-images.sh` chạy như thiết kế.
2. **Đổi script sang `ctr pull` trên VM** cho những image lớn — bỏ hẳn khâu
   `docker save`, đổi lấy việc VM cần credential ghcr. Ở 80 KB/s, 4 image dịch vụ
   (~73 MB mỗi cái) mất ~15 phút/cái; `dlp-sandbox-base` (193 MB) là cái đắt nhất.

Dù chọn đường nào, `image.tag` chỉ được commit SAU khi node có đủ image.

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

- [ ] 5 giá trị của 5.A khẳng định trên **đối tượng sống**, kèm giá trị CŨ làm đối chứng.
- [ ] N=18 cùng build: **18/18 qua bước chấm** (hoặc con số thật + p99 histogram nếu chưa).
- [ ] claim p95 của 3 người đầu < 1s; số người đi cold path ghi rõ.
- [ ] `dlp_claim_dead_pod_total` = 0 trong lượt đo bình thường, và = 1 trong ca dựng của 5.F.
- [ ] Đổi `image.tag` ⇒ pod ấm cũ bị rút, pool tự đủ lại (`dlp_reaper_stale_image_pods_total` tăng đúng số).
- [ ] Nút "Thêm giờ" gia hạn thật; chạm `hardCap` thì disable kèm lý do.
- [ ] `12-helm-deploy.sh` có cổng smoke, trượt thì exit ≠ 0, và tự dọn phiên nó tạo.
- [ ] `reaper-verify.sh` xanh toàn bộ, và ca mới ĐỎ trên image cũ (đối chứng âm).
- [ ] 10 luật §6 không suy giảm: `endSession`/`extendSession` không nhận `userId` từ input (luật 1), Zod strict (luật 3).

## Verify commands

```bash
bash infra/host/11-sideload-images.sh && bash infra/host/12-helm-deploy.sh   # có cổng smoke
kubectl get deploy -o custom-columns=N:.metadata.name,IMG:.spec.template.spec.containers[*].image
kubectl exec deploy/platform-gateway -- env | grep -E 'EXEC_TIMEOUT'
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
