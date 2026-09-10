# Phase 15 — Setup của lab phải sống được dưới tải

**Mức chi tiết:** DETAILED · **Effort:** M · **Blocks:** không · **Blocked by:** P8 (lab), và commit `4a67043` + `5b83f14` đã có trên `main`

> Chặng này sinh ra từ một bản sửa của chính chúng ta. `4a67043` cho `labs.startAttempt` chạy
> `lab.setup` — trước đó nó **không bao giờ chạy**, nên mọi `verify.sh` chấm trên sandbox trắng
> ([[report 2026-09-09]]). Bản sửa đúng, nhưng nó đặt setup vào trong một request tRPC có trần
> thời gian, và ba khiếm khuyết dưới đây là hệ quả trực tiếp — đo được, tái hiện được, chưa sửa.

## Vì sao chặng này tồn tại — số đo, không phải phỏng đoán

Đo 2026-09-09 trên cụm thật, lab `dlp-k8s-broken-deploy`, đọc `duration` của lượt `exec one-shot`
trong log gateway. **Mọi phiên lab k8s đều đi đường LẠNH** (`pool:free` chỉ chứa pod
default-profile — `pool/claim.go:89`; profile `k8s` mới đặt `DLP_K8S=1`), nên đây là đường đi thật
của người học, không phải ca biên.

| load (1 phút) | setup exec | Kết quả |
|---|---|---|
| 2.0 – 5.2 | 17.1s · 23.7s · 26.1s | OK |
| ~11–16 | 35.1s | OK |
| **~43** | **93.3s** | **HỎNG** (`exit=1`) |

Ngân sách là `gateway.execTimeout: 120s` (BFF 135s). Ngưỡng vỡ nằm trong khoảng **load 16–43**;
ngoại suy thì chạm 120s quanh load 55–60. Con số "dư 5×, chỉ tan ở load 95–105" từng ghi trong
report trước là **sai** — nó tan ở khoảng một phần ba mức đó.

Tải được tạo bằng vòng lặp bash trên host (không cài gì), mỗi tiến trình bọc `timeout` làm lưới an
toàn. Không có lần NIC flap nào rơi vào cửa sổ đo, nên số liệu không nhiễu vì mạng.

## Objective

1. Một lượt setup thất bại **không được ăn khe quota** của lab.
2. Người học đọc được **nguyên nhân thật**, không phải một mã thoát.
3. Lab k8s dùng được ở mức tải mà cụm thật sự gặp — hoặc, nếu chọn hướng B, không còn phụ thuộc vào
   trần thời gian của request nữa.

## Task list

### 15.A — Setup hỏng phải trả lại khe NGAY

1. `labs.startAttempt` hiện tạo phiên → chạy setup → **ném** nếu setup lỗi. Phiên sandbox nằm lại
   cho tới khi reaper thu hồi (TTL 1h). Đã đo: pod `sandbox-0129152d5014` sống với `DLP_K8S=1` và
   `/root/lab-k8s` rỗng sau lượt hỏng.
2. ⛔ Lab k8s **chỉ có 5 khe**. Năm lượt hỏng liên tiếp là lab đóng cửa một tiếng, và người dùng
   không có cách nào biết vì sao "Còn 0 chỗ" trong khi không ai đang học.
3. Sửa: bọc phần setup trong một nhánh dọn — setup lỗi ⇒ reap phiên vừa tạo **rồi mới** ném. Dùng
   đúng đường reap đang có, KHÔNG `kubectl delete` (làm lệch warm pool —
   [[kubectl-delete-desyncs-warm-pool]]).
4. Test phải khẳng định **số khe sau lượt hỏng bằng số khe trước đó**, không chỉ khẳng định có ném
   lỗi. Ô AC chỉ kiểm "ném" sẽ xanh nguyên với bug này.

### 15.B — Câu báo lỗi phải nói ra nguyên nhân

5. Script setup của lab k8s ghi `Cum Kubernetes con khong san sang sau 90s` ra **stderr**, nhưng
   `setupScriptPlan.failureMessage` chỉ dựng thông điệp từ **mã thoát**. Người học nhận đúng một
   câu: *"Script chuẩn bị môi trường thất bại (exit 1). Hãy khởi động lại phiên."*
6. Hệ quả: không phân biệt được "cụm con chưa lên" (chờ thêm là được) với "script của bài hỏng"
   (chờ vô ích). Đây đúng nợ mà 14.C ô 8 đã nêu, ở một chỗ mới.
7. Sửa: đưa stderr (đã cắt ngắn, đã lọc) của bước setup vào thông điệp lỗi. `runScriptInSession`
   đã trả về output; chỗ thiếu chỉ là đường dẫn nó tới `failureMessage`.
8. ⚠ Giữ nguyên nguyên tắc của `validate.ts`: lỗi **hạ tầng** không được biến thành `passed:false`.
   Đây là thông điệp cho một lượt DỰNG, không phải một lượt chấm — đừng gộp hai đường.

### 15.C — Chọn trần cho `dlp-k8s-wait`, hoặc bỏ hẳn trần

9. Hiện là `dlp-k8s-wait 90` (hạ từ 240 ở `5b83f14`, vì 240 vượt trần 120s của `/exec` nên câu báo
   lỗi ở ô 5 thành mã chết). 90 + ~3s cho 5 lượt `kubectl apply` = 93.3s, còn ~27s dư trong 120s.
10. **Hướng A — nới trong khuôn khổ hiện tại:** `90 → 105`. Rẻ, một dòng, đẩy ngưỡng vỡ lên một
    chút. Vẫn hỏng trên load ~50. Chấp nhận rằng lab k8s là bài nặng và cụm quá tải thì nó nghỉ.
11. **Hướng B — bỏ setup khỏi đường request:** `startAttempt` phóng setup chạy nền trong pod
    (`nohup`) rồi trả về ngay; UI hiện "đang chuẩn bị" và chờ cờ `/root/lab-k8s/.setup-done`;
    `checkTask` **từ chối chấm** khi chưa có cờ (nếu không sẽ chấm trên cảnh dựng dở — đúng lỗi mà
    `4a67043` vừa sửa, quay lại dưới hình dạng khác).
    - ⛔ Cờ `.setup-done` và `foreground.sh` **đã tồn tại sẵn** cho đúng mô hình này. Hướng B không
      phát minh gì mới, nó dùng thứ nội dung bài học vốn đã được viết cho.
    - Đổi lại: sửa cả server lẫn client, thêm một trạng thái trung gian phải test, và phải xử ca
      "setup chạy nền thất bại" (không còn ai đứng đó để nhận exit code).
12. Chốt MỘT hướng và ghi lý do vào chính chỗ sửa. Đừng làm cả hai.

## Acceptance criteria

- [x] Setup thất bại ⇒ khe quota trả lại **ngay**, đo bằng `resourcequota` trước/sau, không đợi
      reaper. Có test khẳng định **số khe**, không chỉ khẳng định có ném lỗi.
- [x] Người học đọc được nguyên nhân: thông điệp lỗi chứa stderr của bước setup. Kiểm bằng trình
      duyệt thật trên một lượt hỏng có chủ ý (ép bằng tải, cách tạo tải ghi trong report).
- [x] Chốt hướng A hoặc B, có lý do viết tại chỗ sửa. Nếu B: `checkTask` từ chối chấm khi chưa có
      `.setup-done`, và có test cho vế từ chối đó.
- [x] Đo lại đường cong tải sau khi sửa, **cùng phương pháp** (bảng ở đầu file này là đường cơ sở).
      Ngưỡng vỡ mới phải cao hơn cũ, hoặc — với hướng B — không còn ngưỡng theo `execTimeout` nữa.
- [x] ⚠ Vế cuối phải đo trên node ĐÃ LẮNG. Đo ngay sau reboot cho ra số của một node đang ổn định,
      không phải của hệ — [[idle-cluster-timeouts-cascade]].

## Risk Assessment (P15)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Sửa 15.A nhưng test chỉ kiểm "có ném lỗi" ⇒ rò khe vẫn còn, ô AC vẫn xanh | 4 | 4 | **16** | AC ô 1 bắt khẳng định SỐ KHE trước/sau, không phải mã lỗi. |
| Hướng B làm `checkTask` chấm trên cảnh dựng dở | 3 | 5 | **15** | Vế từ chối chấm là AC riêng, có test riêng. |
| Nới trần rồi tưởng đã xong, không đo lại | 4 | 3 | 12 | AC cuối bắt đo lại cùng phương pháp, so với bảng cơ sở. |
| Đưa stderr ra người dùng làm lộ đường dẫn/nội bộ | 2 | 3 | 6 | Cắt ngắn + lọc như `truncateLabOutput` đang làm cho lượt chấm. |
| Đo lại trên node vừa reboot ⇒ số đẹp giả | 3 | 3 | 9 | Ghi thẳng vào AC cuối. |

## Timeline (P15)

| Task | Effort |
|---|---|
| 15.A trả khe | S |
| 15.B thông điệp lỗi | S |
| 15.C hướng A | XS |
| 15.C hướng B (nếu chọn) | M |
| Đo lại đường cong | S |
| **Total** | **M** (S nếu chọn hướng A) |

## Kết quả (2026-09-10)

**XONG** — hướng **B**. Mã: `5d90ad1` + `6d8d2fc`. Image `dlp-web:p15b`.
Report: [`reports/2026-09-10-verify-p15.md`](reports/2026-09-10-verify-p15.md).

⛔ **HAI vế của chính chặng này hoá ra khác điều plan dự đoán — đọc report trước khi
dựa vào bảng ở đầu file:**

1. **Bảng cơ sở ở đầu file KHÔNG tái lập được**, kể cả trên chính image cũ. A/B cùng
   phiên, cùng 160 worker: `p14d` (trước P15) `startAttempt` 59.1s ở load 129 và
   **không hỏng**; `p15b` 17.1s ở load 136. Tức "load ~43 → `exit=1`" không xác nhận
   được, và KHÔNG có "ngưỡng vỡ mới cao hơn cũ" nào được đo — không tìm thấy ngưỡng
   vỡ cho CẢ HAI image tới 11× quá tải CPU. Vế được chứng minh của ô AC 4 là vế thứ
   hai ("không còn ngưỡng theo `execTimeout`"), bằng 59.1s → 17.1s ở cùng tải.

2. **k3s boot ở đây không bị chặn bởi CPU host**, nên một đường cong theo tải CPU là
   sai công cụ cho câu hỏi "lab k8s chịu được bao nhiêu". Muốn ngưỡng thật thì phải
   ép **I/O** (đĩa / etcd). Vì thế ô 10 (hướng A, `dlp-k8s-wait 90 → 105`) **KHÔNG
   được làm**: nới một trần mà không lượt đo nào chạm tới là đổi một con số không có
   số đo nào đỡ. Trần đó nay cũng không còn bị `execTimeout` 120s ràng buộc.

Một chỗ lệch với chữ của plan, có chủ ý: ô 11 chỉ cờ `/root/lab-k8s/.setup-done` của
nội dung; bản cài đặt dùng sentinel của NỀN TẢNG (`/root/.dlp-setup/{rc,log}`) vì
`checkTask` không biết đường dẫn cờ theo-từng-bài mà không thêm field vào lab schema.
