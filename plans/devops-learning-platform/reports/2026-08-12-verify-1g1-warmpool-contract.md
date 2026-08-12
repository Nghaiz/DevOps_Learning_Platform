# 1.G-1 — Vá warm-pool + đóng hợp đồng + kế toán AC

**Ngày:** 2026-08-12 · **Nhánh:** `p1-g1-close-debt` · **Chặng:** 1.G-1 (W1–W5)
**Bằng chứng của chặng này là TEST ĐƠN VỊ + KIỂM ĐỘT BIẾN, không phải phép đo trên cụm.** Phần đo cụm nằm ở 1.G-2 và được liệt kê nguyên vẹn ở §"Chưa đo" — đọc mục đó trước khi tin bất kỳ dòng nào ở trên.

---

## Vì sao có chặng này

Soát lại toàn P1 hôm 2026-08-12: mọi lane đã đóng và **không lane nào còn task chưa chạm**, nhưng acceptance mới ở **57/69 ô** và §"Còn để ngỏ" tích được **bốn** mục ghi thẳng chữ *"chưa task nào sở hữu"*. Hai trong bốn mục đó là bản vá warm-pool, và chúng sẽ cắn vào P2 chứ không nằm yên — P2 đổi image (setup-script theo scenario) và deploy liên tục, đúng hai điều kiện kích hoạt.

## Đã làm gì

| # | Việc | Nhà của nó |
|---|---|---|
| **W1** | `POOL_TARGET` thành **TRẦN**, không chỉ là sàn | `internal/pool/trim.lua` + `trim.go`, gọi trong vòng `Run` |
| **W2** | Tầng 4 reaper mở rộng: pod ấm **lệch image** cũng là pod không dùng được | `internal/reaper/reaper.go` |
| **W3** | Test read-limit → close **`1009`** | `internal/podexec/heartbeat_test.go` |
| **W4** | **Bỏ `4408`** khỏi contract §6 + FE | `docs/`, `packages/terminal/src/` |
| **W5** | Kế toán AC: sửa 2 ô sai câu chữ, tick 1 ô + nửa ô, gán chủ 4 nợ | `plans/` |

### W1 — và một vế nặng hơn bản ghi gốc

Bản ghi 2026-08-11 mô tả hiện tượng là hệ quả của `maxSurge` lúc rollout (hai manager cùng sống ~13 giây). Kiểm lại khi vá thì nặng hơn thế: [`values.yaml:91`](../../../infra/helm/platform/values.yaml#L91) đặt orchestrator **`replicaCount: 2`**, nên trên mọi deploy không dùng `values-selfhost.yaml` thì **hai warm-pool manager sống thường trực**. Lab chạy `replicaCount: 1` nên nợ này **đang bị che** — và đó là lý do nó sống tới giờ.

Chốt đường **(a) manager rút bớt**, không phải (b) leader-election. (a) làm hệ thống **tự sửa**: hai manager vẫn có thể cùng tạo, phần thừa bị rút ở vòng sau nên trần luôn quay về đúng. Giá là **churn** — một pod bị tạo rồi xoá mỗi lần hai manager đua; đó là churn, không phải rò. (b) để ngỏ cho P3, và `dlp_pool_trimmed_total` tăng rất nhanh chính là tín hiệu để mở lại câu hỏi đó.

Ba luật của bản vá, mỗi luật có đúng một test gác:

1. **So-rồi-pop phải NGUYÊN TỬ.** `LLEN` rồi `RPOP` bằng hai lệnh Go mở một khe cho claim chen vào; pop tiếp khi đó là rút xuống **dưới** trần rồi vòng sau tạo lại — churn tự gây ra, và log sẽ nói "đã rút pod thừa" trong lúc pool đang **thiếu**.
2. **`RPOP` chứ không `LPOP`.** `claim.lua` `LMOVE` từ đầu TRÁI; rút ở đầu phải giữ FIFO của D6 (pod cũ nhất vẫn ra trước, pod hỏng vẫn lộ sớm) và bỏ đúng pod **mới nhất** — pod vừa bị tạo thừa.
3. **`DEL pod:{name}` TRƯỚC, `pods.Delete` SAU.** Đảo lại thì một lượt Delete hỏng để lại pod **CÓ hash**, không ở list nào, không session nào trỏ tới — và **không tầng reaper nào phủ được ca đó** (2a đòi hash VẮNG, 2b đòi có session, 2c quét `pool:claimed`, 3 quét quarantine, 4 quét `pool:free`). Đó là **điểm mù thứ sáu**, và nó tránh được bằng thứ tự chứ không cần thêm một tầng nữa.

> Khác `claim.lua`: `trim.lua` ghi **đúng một lệnh**, nên bài học 1.A-2 (*"Redis Lua có isolation, KHÔNG có rollback"*) không sinh ra nghĩa vụ tự-hoàn-tác nào — không có bước nào ở giữa để hỏng. Thêm `pcall`/`undo` vào đây "cho đối xứng" sẽ là mã chết giả dạng phòng thủ.

### W2 — nhà của bản vá được chọn bằng số đo, không bằng gu

Bản vá về **tầng 4 của reaper**, không thành một nhánh mới trong `pool.Manager`. Lý do: `sweepDeadFreePods` **đã** `LRANGE pool:free` rồi `pods.Get` từng pod mỗi vòng sweep, nên phép so image tốn **0 lời gọi apiserver thêm**. Đặt ở manager là dựng một loop thứ hai đọc apiserver **và** một thành phần thứ hai mutate `pool:free`.

Hai sửa so với câu chữ của bản ghi gốc, cả hai đều là ranh giới an toàn:

- **So container theo TÊN** `k8s.ContainerName`, KHÔNG phải `.containers[0]`. Index đúng hôm nay và **im lặng sai** ngày spec có sidecar — lúc đó nó so image của sidecar với `SANDBOX_IMAGE`, luôn lệch, và rút sạch pool mỗi vòng.
- **`SANDBOX_IMAGE` rỗng ⇒ TẮT HẲN phép kiểm**, không phải "coi mọi pod là lệch". `config.Load` hiện fail-fast khi rỗng, nhưng nếu một ngày đường đó bị nới thì so với chuỗi rỗng là **rút sạch `pool:free` mỗi vòng, mãi mãi** — một cấu hình sai biến thành xoá liên tục, trong khi mọi dòng log đều nói "đã rút pod lệch image".

Counter **tách**: `dlp_reaper_stale_image_pods_total` ≠ `dlp_reaper_dead_free_pods_total`. Gộp thì sau mỗi lần đổi image ta không phân biệt được *"đã rollout pod ấm"* (đúng, xảy ra một lần) với *"có nguồn đang giết pod ấm"* (sai) — mà vế thứ hai mới là điều counter tầng 4 tồn tại để nói.

### W3 — hằng số đến từ thực nghiệm mà không có gì gác

Soát `services/terminal-gateway`: có test cho byte-rate (`TestVuotTranTocDoStdinThiDong4429`), control-flood, resize — **không có ca nào** cho vế read-limit của luật 5. Đó là vế mà spike 1.A-1 phải **đo thật mới biết** đáp số (`1009` của thư viện, không phải `4413` như plan cũ đoán) và contract §6 đã pin theo. Ngày ai đó nâng `SetReadLimit` lên 1 MiB "cho fastfetch đỡ bị cắt" — đúng thứ `cmd/spike-exec/bridge.go:156` đang làm — thì contract §6 sai mà không test nào đỏ.

Ca mới dùng **đúng một byte quá trần**: một frame to gấp nhiều lần cũng đỏ khi guard mất, nhưng nó không nói được trần nằm ở **đâu**, mà chính vị trí đó là thứ contract pin cho FE. Ca cố ý **không** đòi control `error` đi kèm — thư viện đóng trước khi code ứng dụng thấy gì.

### W4 — `4408` là mã chết, nay đã bỏ

Không đường nào của gateway từng phát nó; 1.C-3 đã ghi nhận rồi hoãn. Nay chốt bỏ khỏi **cả bốn** nơi cùng lượt: contract §6, `protocol.ts`, nhánh `switch` trong `session-machine.ts` (gộp vào `SESSION_GONE`, câu thông báo nay nói cả hai khả năng), và hàng trong `protocol.test.ts`. Kèm một ca gác **chiều ngược lại** — `Object.values(CloseCode)` không được chứa `4408` — để việc bỏ không bị âm thầm hoàn tác.

Ghi lại lý lẽ cho người sau: muốn phân biệt "hết hạn vì không hoạt động" với "bị thu hồi" thì thêm **lý do** vào payload, **đừng thêm mã đóng** — close code chỉ có 123 byte reason và đang gánh cả routing lẫn ngữ nghĩa.

---

## Kiểm đột biến — 6 phép, mỗi phép đỏ đúng chỗ

Đây là phần đáng tin nhất của chặng, vì "test xanh" chỉ chứng minh test chạy được, còn đột biến mới chứng minh test **gác được**.

| Đột biến | Ca đỏ | Khu trú |
|---|---|---|
| `trim.lua`: `LLEN <= target` → `<` (rút quá tay) | 4 ca `TestTrim*` | tràn — đúng, đây là đột biến vào lõi |
| `trim.lua`: `RPOP` → `LPOP` (phá FIFO của D6) | 4 ca `TestTrim*` | tràn |
| `trim.go`: đảo `DEL hash` ↔ `pods.Delete` | **1** — `TestTrimXoaHashTRUOCKhiXoaPod` | ✅ đúng một ca |
| `reaper.go`: vô hiệu guard `wantImage == ""` | **1** — `TestTang4WantImageRongThiKhongKetLuan` | ✅ đúng một ca |
| `reaper.go`: đọc `Containers[0]` thay vì theo TÊN | **1** — `TestTang4KhongThayContainerTheoTenThiKhongKetLuan` | ✅ đúng một ca |
| `reaper.go`: bỏ nhánh `staleImage` khỏi `switch` | **1** — `TestTang4RutPodAmLechImage` | ✅ đúng một ca |

Bốn phép dưới đỏ **đúng một ca** nghĩa là mỗi luật có một điểm gác riêng, không phải một test đỏ tràn che cho mấy luật cùng lúc. Hai phép trên đỏ tràn — chấp nhận được vì chúng đột biến vào chính lõi của hàm, không phải vào một ranh giới.

> ⛔ **Bẫy quy trình gặp phải khi làm chính bảng này, ghi lại vì nó sẽ cắn bất kỳ ai lặp lại kiểu kiểm này:** hoàn nguyên đột biến bằng `git checkout -- <file>` đưa file về **HEAD**, **không** về bản trước đột biến. Với một file đã sửa mà **chưa commit**, nó **xoá sạch** phần sửa đó. Ở đây nó xoá toàn bộ W2 trong `reaper.go`; phát hiện ra vì `reaper_test.go` (không bị checkout) gọi một signature không còn tồn tại. Với file **chưa track** (`trim.lua`) thì `git checkout` báo lỗi và đột biến **ở lại nguyên trong file**. Đường đúng: **lưu nội dung file vào biến rồi ghi lại từ biến** — bảng trên được dựng lại theo cách đó.

## Số đo

| Phép kiểm | Kết quả |
|---|---|
| `go test ./...` 3 module (Redis + Postgres **thật**) | **369 PASS / 0 FAIL / 0 SKIP** |
| `go test -race` trên `pool`, `reaper`, `podexec` | ok, **0 DATA RACE** |
| `GOOS=linux go vet ./...` 3 module | sạch |
| `gofmt -l services/` | rỗng |
| `pnpm turbo run typecheck` | **8/8 task** |
| `vitest` `packages/terminal` | **91 PASS** (4 file) |

Ca mới: **11** (6 `TestTrim*`, 4 `TestTang4*` lệch-image, 1 read-limit `1009`). Đã khẳng định cả 11 **thật sự chạy** bằng `-v` chứ không đọc exit code — `go test` trả 0 khi mọi ca tự skip, và suite này skip sạch nếu thiếu `REDIS_URL`/`DATABASE_URL` (root `.env` không có hai biến đó).

## Chưa đo — đọc mục này trước khi tin phần trên

- **Không có phép đo nào trên cụm ở chặng này.** Cả hai bản vá warm-pool mới chỉ có bằng chứng test đơn vị trên Redis thật. Phép đo với `replicaCount: 2` — tức **cảnh duy nhất tái hiện được nguyên nhân gốc** — thuộc 1.G-2.
- **Một ca đỏ chập chờn, KHÔNG tái hiện được.** Một lượt `go test -v` đếm được `369 PASS / 1 FAIL`; **9 lượt chạy đầy đủ sau đó (4 lượt thường + 3 lượt `-v` + 2 lượt đầu) đều 0 đỏ**, và lượt đỏ không được giữ lại tên ca. Ghi ra đây thay vì gọi suite là sạch. Nghi vấn đầu tiên nên soát ở 1.G-2: `TestScriptSongSotSauScriptFlush` của gateway dùng `SCRIPT FLUSH` — một lệnh **toàn server** — và `trim.lua` nay là script thứ hai sống trong cùng cache đó (bài học đã có từ PR 1.C-1, nay có thêm một script để cắn).
- **`dlp_pool_trimmed_total` và `dlp_reaper_stale_image_pods_total` chưa từng tăng trên cụm** — mới chỉ tăng trong test.
- Vế `4404` cho ca *im lặng → hết `expiresAt` → reaper xoá pod → gateway đóng* chưa chạy end-to-end; **AC đó vẫn không tick**. Sửa được câu chữ không phải là đo được.

## Kế toán AC

57 → **58 ô tick** (`+1`: luật 8 đủ bốn trên bốn, bằng bằng chứng đã nằm sẵn trên đĩa từ G12 hôm 2026-08-11). Hai ô đổi câu chữ cho đo được (`ready`→prompt thành **101→`ready`**; vế `4408` thành `4404`). Một ô chuyển từ "trống" sang **một-trên-hai** (NetworkPolicy: vế IMDS đã đo ở 1.E-2).

Bốn nợ *"chưa task nào sở hữu"* nay **có chủ hết**: hai cái đã vá ở chặng này; cold-path `ImagePullBackOff` giao **P2** (kèm điều kiện kích hoạt cụ thể và một cảnh báo — `ImagePullBackOff` **có thể tự khỏi**, nên coi nó là terminal ngay là đổi một lỗi chậm lấy một lỗi sai); cửa sổ web-500 ở fresh install giao **1.G-2**, kèm **ngưỡng quyết định chốt trước khi đo** để con số đo ra không tự biện minh cho chính nó.
