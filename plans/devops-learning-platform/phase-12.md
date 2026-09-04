# Phase 12 — Chứng minh quy mô: 40 người, qua Traefik, và chạy dài

**Trạng thái:** ✅ ĐÓNG 2026-09-05 (10/11 ô; ô "mất pod giữa phiên" 3/4 — xem report) · **Report:** [`reports/2026-09-05-verify-p12.md`](reports/2026-09-05-verify-p12.md)

**Mức chi tiết:** DETAILED · **Effort:** M · **Blocks:** P13 (FE dựng trên trần đã biết), go-live · **Blocked by:** P5, P6, P7, P8 (đo trên hệ đã đủ tính năng, không đo trên bộ khung)

> Đây là chỗ trả nốt bốn món nợ đo mà P3 để lại và ghi thẳng ra: **chưa đo ở 40** · **chưa đo qua Traefik** · **chưa chạy dài (soak)** · **chưa tách CPU của riêng bước build**. Cộng thêm hai món của 3.G/3.H: cluster-autoscaler chưa từng scale thật, spot interruption chưa có gì.

## Ràng buộc, nói trước để không ai đọc nhầm kết quả

- **Hạ tầng KHÔNG đổi**: vẫn 1 node, 8 vCPU, 11.6Gi (chủ dự án chốt 2026-09-02). Nên "vài trăm session" của thiết kế §12 **không đo được ở đây và sẽ không được khẳng định** — P3 đã hạ mục tiêu ấy về "trần thật của VM" và phase này giữ nguyên cách nói đó.
- **40 là mục tiêu, không phải hằng số vật lý.** Số học từ N=18: workingSet 3139Mi cho 18 pod ⇒ 40 pod ≈ 6.5GiB, còn vừa 11.6Gi; nhưng CPU đòi ~44 core trên 8 ⇒ **quá tải 5.5×**. Vậy câu hỏi của phase này **không phải "có sập không"** mà là **"ở mức nào thì nó còn dùng được"** — và "dùng được" phải được định nghĩa bằng số trước khi đo.
- **cluster-autoscaler vẫn không chứng minh được ở đây** (`cluster.x-k8s.io` và `metrics.k8s.io` đều RỖNG). Đừng lặp lại vòng đó; ô AC ấy ở lại mở, có lý do.

## Định nghĩa "dùng được" — chốt TRƯỚC khi chạy

| Đại lượng | Ngưỡng đề xuất | Vì sao |
|---|---|---|
| Tỉ lệ lượt chấm thành công | **≥ 99%** | 17/18 hỏng là chuyện của lượt trước; đây là ô phải xanh |
| `claim` p95 | ghi số, **không** đặt ngưỡng | Ngưỡng 1s của thiết kế dành cho warm-pool đủ lớn; ở đây pool là 3 |
| Người học gõ → ký tự hiện (p95) | **≤ 250ms** | Đây là đại lượng người dùng CẢM được, và chưa ai đo nó dưới tải |
| Pod bị OOMKill/evict | **0** | Vượt là hỏng, không phải chậm |
| WS rớt ngoài ý muốn | **0** ngoài các lượt rollout có chủ đích | |

## Task list

### 12.A — Nâng trần lên 40, bằng phép tính chứ không bằng cảm giác

1. Tính lại **min của năm ràng buộc** (`quota-ceiling-is-min-of-five`) cho mục tiêu 40 + `POOL_TARGET`. Ghi phép tính vào `values-selfhost.yaml` như bộ số 21-pod đang làm.
2. ⚠ Hạ `requests.memory` để nhét 40 pod là **cược trực tiếp vào eviction**. Đỉnh workingSet đo được là 163Mi (bài Docker); dưới đó là under-request và pod bị đuổi đúng lúc người học đang build. Nếu phép tính đòi xuống dưới mức đó ⇒ **40 không đạt được an toàn trên node này**, và đó là một kết luận hợp lệ phải viết ra.
3. Kiểm trần mới bằng `infra/k6/ceiling.js` (đã có) trước khi chạy tải thật.

### 12.B — Đo 40 người **qua Traefik**

4. Lượt N=18 trước đi ClusterIP **có chủ ý** để né rate-limit. Lượt này đi **đúng đường người dùng**: `:30443` → Traefik → web/gateway.
5. Trần biên `/ws` hiện **20/1m, burst 10**. Bốn mươi người vào cùng lúc **sẽ** ăn 429. Hai việc, theo thứ tự: (a) nới trần dựa trên số đo, (b) **chạy lại pentest luật 5** — nới trần là thay đổi bề mặt tấn công, không phải một con số cấu hình.
6. Harness: mở rộng `reports/harness/2026-08-16-3i-concurrent-build/` (giữ rào chắn "cùng bấm GO"), thêm đường qua Traefik và giữ header `Origin` thật.
7. ⚠ **Đo từ ngoài hệ đang đo**: gọi từ chính VM làm SNAT và làm hỏng cả phép đo IP lẫn rate-limit (`measure-from-outside-the-system`). Chạy driver từ máy Windows.
8. ⚠ **Đồng hồ VM lệch ~59s so với Windows** — mọi số trộn timestamp hai bên đều sai. Đồng bộ hoặc quy về một nguồn thời gian, và ghi cách làm trong report.

### 12.C — Tách CPU của riêng bước build

9. Nợ §8 của báo cáo cũ: `pull`/`dockerd-boot`/`build` bị gộp. Lấy mẫu cgroup theo mốc thời gian của từng giai đoạn để biết phần nào thật sự đắt.
10. ⚠ `nr_throttled` **im lặng** khi ràng buộc là dung lượng node chứ không phải `cpu.max` riêng (`throttle-zero-hides-node-level-starvation`). Dùng load average + thời gian tường làm nguồn sự thật; đừng đọc throttle=0 thành "không đói CPU".

### 12.D — Chạy dài (soak)

11. 2–4 giờ, N vừa phải (≈ nửa trần), WS mở liên tục, gõ định kỳ. Mục tiêu là **rò rỉ chậm**: goroutine, fd, RSS của gateway/orchestrator, `pool:claimed` phình, session mồ côi.
12. Rủi ro score 15 của P3 ("gateway không chịu nổi hàng nghìn WS") **chưa từng được đóng** vì mọi lượt đo đều là burst ngắn. Soak là phép đo duy nhất chạm được nó.
13. Ô đo: `go_goroutines`, `process_open_fds`, `process_resident_memory_bytes`, `dlp_pool_claimed_size` — cả bốn phải **phẳng** sau khi trừ tải, không dốc lên.

### 12.E — Spot / mất node đột ngột

14. Không có API trung lập cho spot interruption (`docs/cost-model.md` đã nói vì sao). Thứ **đo được** ở đây: pod sandbox biến mất đột ngột thì người học thấy gì.
15. Ca dựng: xoá pod của một phiên đang mở WS. Kỳ vọng: WS đóng bằng mã đúng, FE hiện câu tiếng Việt đúng, phiên không kẹt, khe quota được trả. Ca claim-gặp-pod-chết đã có từ P5 — đây là ca **đang giữa phiên**.

### 12.F — Chạy lại toàn bộ cổng bảo mật

16. `secure-test-devops` 10/10 luật + 10/10 đối chứng dương, **trên cấu hình sau khi nới rate-limit**. Một lượt pentest trên cấu hình cũ không nói gì về cấu hình mới.
17. `netpol-verify.sh` 22/22 và `reaper-verify.sh` đầy đủ, chạy **sau** lượt tải (không phải trước) — rác của tải là bối cảnh thật.

## File / dir ownership

`infra/k6/**` · `infra/helm/platform/values-selfhost.yaml` (quota, rate-limit) · `infra/k8s/{reaper-verify.sh,netpol-verify.sh}` · `plans/devops-learning-platform/reports/harness/**` · `secure-test-devops/` · `docs/cost-model.md`

## Dependencies

- **Blocked by:** P5 (bản vá đã chạy), P6/P7 (nếu đo cả bài có IDE/K8s — chúng đổi trần), P8.
- **Blocks:** P13 (FE nên biết trần thật để hiện "còn N chỗ"), go-live.

## Acceptance criteria

- [x] Trần mới tính bằng **min-của-năm**, phép tính ghi trong values; nếu 40 đòi under-request thì **kết luận là "không đạt an toàn"** và viết ra. — **23 pod**; 40 đòi 134m/pod < 150m đã đo ra hại ⇒ kết luận "không đạt an toàn" đã viết vào `values-selfhost.yaml`. RAM KHÔNG phải chỗ chặn (43×163Mi < 9998Mi), CPU mới là.
- [x] Đo N=40 (hoặc trần thật đạt được) **qua Traefik**, driver chạy **ngoài VM**, đồng hồ đã quy về một nguồn. — N=23 qua Traefik từ Windows; lệch đồng hồ đo được **+2.78s** (không phải 59s) và mọi độ trễ là hiệu trên CÙNG một đồng hồ.
- [x] Tỉ lệ lượt chấm thành công **≥ 99%**; con số thật ghi lại dù đạt hay không. — **21/21 = 100%** trong số phiên ĐƯỢC NHẬN; 2/23 bị từ chối ở cửa bằng 429 (hành vi đúng). Lượt chưa tách lỗi egress: 8/23 và 0/23 — cũng ghi lại.
- [x] p95 "gõ → ký tự hiện" đo được và ghi lại (đại lượng này chưa từng có số). — **p95 = 84ms** với 21 người cùng gõ (504/504 vọng, 0 treo); nền N=1/N=2 là 26–37ms.
- [x] **0** OOMKill/evict; **0** WS rớt ngoài rollout có chủ đích. — 0/0 ở mọi lượt; soak giữ ws=10 suốt 118 phút.
- [x] Rate-limit `/ws` nới có cơ sở số, **và pentest luật 5 chạy lại** trên cấu hình mới. — đo ra burst 10 là chỗ chặn (10/20 vào), nới **40/30**; pentest 10/10 + đối chứng dương 10/10 trên cấu hình MỚI.
- [x] CPU tách theo giai đoạn (pull / dockerd / build) — biết phần nào đắt. — **pull 80.0%** (16.01s, cpu/wall 0.23 = chờ I/O), build 18.8% (3.77s, cpu/wall 1.45 = ăn >1 core), dockerd-boot 1.1% (cận dưới, pod warm).
- [x] Soak 2–4h: 4 đại lượng rò rỉ **phẳng**; nếu dốc thì đó là một lỗi, không phải một ghi chú. — soak **2h**, 119/122 mẫu có ws=10: không đại lượng nào dốc lên quá ngưỡng. ⚠ RSS gateway +4.96 MiB/h (sát ngưỡng) — 2h chưa đủ tách "plateau" khỏi "rò chậm", cần lượt 4h.
- [ ] Ca mất pod giữa phiên: mã đóng đúng, câu tiếng Việt đúng, khe quota được trả. — **3/4**. Câu tiếng Việt ✅, phiên không kẹt ✅, khe quota trả ✅. **Mã đóng SAI**: `1000 "exit"` thay vì `4404` do ĐUA giữa stream-đứt và sổ sách reaper (exitCode=137, gateway CÓ tra Redis nhưng Redis còn ghi phiên sống). Người bị thu hồi pod được báo "bạn đã tự gõ exit". Ngoài ownership P12 ⇒ để lại làm defect.
- [x] Sau tải: `secure-test-devops` 10/10 + đối chứng dương 10/10, `netpol` 22/22, `reaper-verify` đầy đủ. — suite thật là `infra/pentest/` (10/10 + 10/10 PC), `netpol-verify` **22/22** dưới tải, `reaper-verify` **18/18** sau tải (phải side-load `dlp-lifecycle-probe:dev` trước — image chưa từng có trên node).
- [x] Ô "autoscaler scale thật" **vẫn mở**, kèm lý do — không tick bằng render/dry-run. — GIỮ MỞ: `cluster.x-k8s.io` và `metrics.k8s.io` đều rỗng trên cụm 1 node; không có gì để scale và không có API trung lập để giả lập.

## Verify commands

```bash
node .../harness/run.mjs --n 40 --via-traefik https://dlp.<ip>.sslip.io
k6 run infra/k6/ceiling.js
bash infra/k6/run-load.sh --soak 4h
bash secure-test-devops/run-all.sh --target https://dlp.<ip>.sslip.io
bash infra/k8s/netpol-verify.sh && bash infra/k8s/reaper-verify.sh
```

## Risk Assessment (P12)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Nới quota tới 40 ⇒ under-request ⇒ evict giữa lúc build | 4 | 5 | **20** | Sàn `requests` = đỉnh đo được (163Mi), không xuống dưới; nếu phép tính đòi thấp hơn thì kết luận "không đạt" và dừng. |
| Nới rate-limit mở lại lỗ luật 5 | 3 | 5 | **15** | 12.F chạy lại pentest trên cấu hình MỚI; không tick luật 5 bằng lượt chạy cũ. |
| Soak không đủ dài để lộ rò rỉ | 3 | 4 | 12 | ≥ 2h, ưu tiên 4h; đo cả bốn đại lượng chứ không chỉ RSS. |
| Phép đo tự nói dối (SNAT, lệch đồng hồ, port-forward rụng) | 4 | 3 | 12 | Driver ngoài VM; quy đồng hồ; retry chỉ bọc lỗi mạng — cả ba bẫy đã trả giá và đã có cách. |
| Kết quả 40 không đạt và bị đọc thành "hệ hỏng" | 3 | 3 | 9 | Report tách rõ "trần hạ tầng" khỏi "lỗi phần mềm", như báo cáo N=18 đã làm. |

## Timeline (P12)

| Task | Effort |
|---|---|
| 12.A trần mới | S |
| 12.B đo 40 qua Traefik | L |
| 12.C tách CPU | S |
| 12.D soak | M |
| 12.E mất pod giữa phiên | S |
| 12.F chạy lại cổng bảo mật | M |
| **Total** | **M** |
