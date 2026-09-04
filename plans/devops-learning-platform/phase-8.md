# Phase 8 — Trụ cột ②: Labs / Playground và bộ chấm điểm nhiều task

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** P10 (lộ trình gom lab), P13 (FE labs) · **Blocked by:** P5, P7 (lab K8s cần cluster-in-pod)

> Trụ cột ② của thiết kế (§1): môi trường thật + **chấm điểm task**, kiểu KodeKloud. Khác Lessons ở đúng một điểm bản chất: Lessons **dẫn** người học qua từng bước có sẵn đáp án; Labs **giao việc** rồi chấm kết quả cuối. Mọi thứ khác — engine, terminal, verify script — tái dùng nguyên vẹn.

## Objective

Người học mở một lab, nhận N task độc lập, làm theo thứ tự tuỳ ý, bấm "Chấm" và nhận **điểm từng task + tổng**, có mốc đạt/không đạt và thời gian làm. Điểm lưu được, xem lại được, và **không ai xem được điểm của người khác** trừ khi bảng xếp hạng cho phép công khai.

## Ranh giới — đọc trước khi thiết kế bảng

⛔ **KHÔNG dựng phần thương mại.** Ràng buộc dài hạn của chủ dự án: không pricing, không thanh toán, không paywall, không `entitlement`, không "chứng chỉ như hàng hoá". "Khoá học" nếu có chỉ là **cách nhóm nội dung** (P10). Quyền truy cập vẫn chỉ là đăng nhập.

⛔ **KHÔNG lưu field suy ra được.** Ba lần trong hai chặng P2 plan đã đòi lưu thứ tính được và cả ba đều bị bác (`no-derived-fields-killed-three-plan-assumptions`). Áp thẳng vào đây:
- **KHÔNG** cột `score` tổng — tính từ các task đã đạt × trọng số.
- **KHÔNG** cột `status` (passed/failed) — tính từ `(số task đạt, mốc đạt)`.
- **KHÔNG** cột `durationSeconds` — tính từ `(startedAt, submittedAt)`.
- **CÓ** những thứ không tính được: task nào đạt, lúc nào, ở lần thử thứ mấy, exit code và output đã cắt cỡ.

## Task list

### 8.A — Format lab (mở rộng scenario, không tạo format thứ hai)

1. `packages/scenario` thêm `lab.ts`: một lab = metadata + `tasks[]`, mỗi task có `id`, `title`, `markdown`, `verifyScript`, `weight` (mặc định 1), `hint?`.
2. **Tái dùng** `scenarioSchema` cho phần chung (tier, capabilities, assets, setup scripts). Lab **không** phải một cây DTO song song — nếu thấy mình chép field, dừng lại và tách phần chung.
3. Zod strict, field lạ ⇒ từ chối kèm tên field (luật 3), y như loader hiện tại.
4. Loader đọc `content/labs/**`; `ScenarioSource` mở rộng thành `ContentSource` với `listLabs()`/`getLab()` — **cùng một seam**, để bản DB-backed của P9 cắm vào một chỗ chứ hai.

### 8.B — Chấm nhiều task

5. `labs.checkTask` — chấm **một** task, tái dùng nguyên `runScriptInSession` (BFF → gateway `/exec`). Không viết đường exec thứ hai.
6. `labs.submit` — chấm **tất cả** task còn lại rồi chốt lần nộp. ⚠ N task × thời gian mỗi script: với trần `GATEWAY_EXEC_TIMEOUT=120s` và 8 task, một lượt submit có thể chạm 16 phút. **Chạy tuần tự trong một lần gọi là sai thiết kế** — mỗi task là một lời gọi riêng, FE gom kết quả, và server chỉ chốt khi đủ.
7. Phân loại lỗi giữ nguyên bài học của `validate.ts`: script hỏng / hết hạn / pod chết ⇒ **lỗi**, không phải `passed:false`. Một lab chấm sai vì hạ tầng là một lab dạy sai.
8. Lưu `lab_attempts` (một dòng mỗi lần thử) + `lab_task_results` (một dòng mỗi task trong lần thử đó). Không có cột nào suy ra được — xem ranh giới trên.

### 8.C — Bảng xếp hạng, và luật 1 ở dạng mạnh

9. Bảng xếp hạng **mặc định TẮT** cho mỗi lab; bật là lựa chọn của người tạo lab.
10. Người dùng **chọn hiện tên hay ẩn danh**; mặc định ẩn danh. Không có cột nào lộ email.
11. Truy vấn xếp hạng **không nhận `userId` từ input** — cùng khuôn `lessons.list` đã làm. Pagination cap 100 cứng (luật 4).
12. Test IDOR bắt buộc, kèm **đối chứng dương**: xem được điểm CỦA MÌNH, không xem được của người khác. Thiếu vế dương thì một hàm luôn trả rỗng cũng "xanh".

### 8.D — Lab K8s thật

13. Một lab first-party dùng năng lực `kubernetes` của P7 (vd. "sửa Deployment hỏng cho tới khi Pod Ready"), 4–6 task, verify script đọc trạng thái cluster con.
14. Mỗi task phải có **ca fail chứng minh được** — plan P2 đã dẫm bẫy `prolug` (cả ba `verify.sh` là `/bin/true`, vế fail bất khả). Mỗi verify script mới phải kèm một lượt chạy sai ra `passed:false`.

### 8.E — Playground: môi trường không có bài

15. Playground = sandbox trống, có `capabilities` chọn được, không task, không chấm. Chính là thứ Killercoda gọi là scenario không có `details` — mà loader của ta **cố ý từ chối** (docs/scenario-format.md §1.1).
16. Nên đây là một **loại nội dung riêng**, không phải một lab rỗng: `content/playgrounds/*.json` chỉ có tier + capabilities + TTL. Giữ loader nghiêm như cũ cho lesson/lab.
17. TTL playground ngắn hơn lesson (đề xuất 30 phút) vì không có tiến độ để mất — và nói rõ con số trên UI trước khi người dùng bắt đầu.

## File / dir ownership

`packages/scenario/src/{lab.ts,source.ts,loader.ts}` · `packages/shared-types/src/lab.ts` · `apps/web/src/server/trpc/routers/labs.ts` · `apps/web/src/server/db/schema.ts` (2 bảng mới) + migration · `apps/web/src/server/lessons/validate.ts` (tái dùng, không sửa hợp đồng) · `content/labs/**`, `content/playgrounds/**` · `docs/lab-format.md`

## Dependencies

- **Blocked by:** P5 (deploy), P7 (lab K8s). Lab Linux/Docker thuần **không** cần P7 và có thể làm trước.
- **Blocks:** P10 (lộ trình gom lesson + lab), P13 (FE).

## Acceptance criteria

- [x] `docs/lab-format.md` là SSOT; Zod strict từ chối field lạ kèm tên field. → `lab.json` + `task-<id>.md` + `task-<id>/verify.sh`; Zod strict từ chối field lạ kèm **đường dẫn chấm**, và `verifyScript` **không nullable** (task không chấm được bị từ chối NGAY LÚC NẠP, không phải lúc người học bấm Chấm). [report P7/P8](reports/2026-09-04-verify-p7-p8.md) §2 (8.A).
- [x] Lab 4+ task: chấm từng task độc lập, kết quả từng task hiện riêng. → `dlp-k8s-broken-deploy` **5 task**, mỗi task một Deployment/Service RIÊNG; `labs.submit` chạy **0** verify script (chỉ đóng dấu rồi tính lại) — chấm N task tuần tự trong một lời gọi là thiết kế sai. Bảng 5 task × 2 vế (sau `setup` gieo lỗi ⇒ **EXIT=1**; sau khi sửa ⇒ EXIT=0, task cuối có **HTTP 200 thật qua Service**). Kiểm bằng trình duyệt 2026-09-04: thẻ lab hiện `5 nhiệm vụ`, tab `Nhiệm vụ (5)`. [report P7/P8](reports/2026-09-04-verify-p7-p8.md) §2 (8.B, 8.D).
- [x] **Không cột nào suy ra được** trong 2 bảng mới. → rà từng cột: không `score`, không `status`, không `duration_seconds`, không `passed` (= `exit_code === 0`), không `attempt_no` (= đếm dòng trước đó). [report P7/P8](reports/2026-09-04-verify-p7-p8.md) §2 (8.B).
- [x] Điểm tổng, trạng thái đạt, thời gian làm đều **tính ở chỗ dùng**, có test cho hàm tính. → `computeLabScore` / `computeLabStatus` / `computeAttemptDurationSeconds` + `latestResultPerTask` trong `packages/scenario/src/lab-score.ts`, có `lab-score.test.ts` đi kèm. Đây là mặt kia của ô ngay trên: không lưu cột suy được thì phải có chỗ TÍNH, và chỗ tính phải có test.
- [x] Script hỏng/hết hạn/pod chết ⇒ **lỗi**, không phải `passed:false` (cả ba ca). → mỗi ca một test, và mỗi test khẳng định **số dòng ghi vào DB** chứ không chỉ mã lỗi: verify exit≠0 ⇒ `passed:false` **+1 dòng**; gateway 200 nhưng body sai hợp đồng ⇒ **NÉM, 0 dòng**; gateway 5xx / session không active ⇒ **NÉM, 0 dòng**. Vế *0 dòng* là vế quan trọng: một lỗi hạ tầng ghi thành `passed:false` là ghi vào hồ sơ học viên rằng họ làm sai. [report P7/P8](reports/2026-09-04-verify-p7-p8.md) §2.
- [x] Mỗi verify script của lab first-party có **cả ca pass và ca fail** chứng minh được. → `dlp-k8s-broken-deploy` 5/5 task đo cả hai vế trên cụm thật (bảng ở [report P7/P8](reports/2026-09-04-verify-p7-p8.md) §2). Shellcheck 39 script `dlp-*` sạch ở ngưỡng CI (chạy lại 2026-09-04).
- [x] Xếp hạng: mặc định tắt · mặc định ẩn danh · không lộ email · cap 100 · test IDOR có đối chứng dương. → cả năm vế; truy vấn **không nhận `userId`**, không select cột email; test IDOR có **đối chứng dương trên cả 5 procedure** — thiếu vế dương thì một hàm luôn trả rỗng cũng *xanh*. [report P7/P8](reports/2026-09-04-verify-p7-p8.md) §2 (8.C).
- [x] Playground dựng được, TTL riêng hiện trên UI **trước** khi bắt đầu. → `content/playgrounds/*.json`, TTL 1800 s. **Kiểm bằng trình duyệt thật 2026-09-04** (lần đầu tiên): `/playgrounds` liệt kê 2 sân chơi, mỗi thẻ hiện `Tự đóng sau 30 phút` NGAY TRÊN DANH SÁCH — tức trước cả khi mở trang chi tiết, chứ không chỉ trước khi bấm Bắt đầu. [report đóng nợ](reports/2026-09-04-debt-closure.md) §1.
- [x] 10 luật §6 không suy giảm trên route mới. → `labs-authz.test.ts` + `lessons-authz.test.ts` phủ authz/cap/Zod strict trên 9 procedure `labs.*`; `apps/web` **312/312 test xanh, 0 skip** (2026-09-04). ⚠ Mức UNIT + integration; vế trình duyệt của `/labs`, `/playgrounds` đã chạy 2026-09-04 ([report đóng nợ](reports/2026-09-04-debt-closure.md) §1), vế devtools-network vẫn thuộc P13.

## Verify commands

```bash
pnpm --filter web test -- labs
kubectl exec $POD -- bash /tmp/verify-task-3.sh ; echo $?      # phải phân biệt 0/1/2
psql -c '\d lab_attempts' -c '\d lab_task_results'             # rà từng cột
```

## Risk Assessment (P8)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Submit N task tuần tự chạm nhiều phút, người học tưởng treo | 4 | 3 | 12 | Mỗi task một lời gọi; FE hiện tiến độ từng task; server chỉ chốt khi đủ. |
| Bảng điểm rò dữ liệu người khác (IDOR) | 3 | 5 | **15** | Input không có `userId`; test IDOR + đối chứng dương; mặc định ẩn danh. |
| Verify script không phân biệt được "chưa làm" với "hạ tầng hỏng" | 4 | 4 | **16** | Giữ nguyên phân loại của `validate.ts`; test cả ba ca; **cấm** biến lỗi hạ tầng thành `passed:false`. |
| Lab K8s đắt RAM ⇒ ít người làm được cùng lúc | 3 | 3 | 9 | Trần riêng theo profile P7, hiện số lên UI ("còn N chỗ") thay vì để người dùng gặp 429. |
| Format lab tách đôi khỏi format scenario rồi trôi | 3 | 4 | 12 | Tái dùng schema chung; một seam `ContentSource` duy nhất; review chặn mọi field chép lại. |

## Timeline (P8)

| Task | Effort |
|---|---|
| 8.A format + loader | M |
| 8.B chấm + 2 bảng | L |
| 8.C xếp hạng + authz | M |
| 8.D lab K8s first-party | M |
| 8.E playground | S |
| **Total** | **L** |
