# Rà soát lại lựa chọn IDE của P6 — Theia hay code-server

**Ngày:** 2026-09-04 · **Loại:** brainstorm / rà soát quyết định
**Đối tượng rà soát:** [`docs/ide-choice.md`](../../docs/ide-choice.md) · [`phase-6.md`](../devops-learning-platform/phase-6.md) · [report 6.A](../devops-learning-platform/reports/2026-09-03-verify-6a-ide-measure.md)

## 0. Kết luận

**Giữ Theia.** Quyết định 6.A đứng vững, và hai thông tin mới đều đẩy về cùng
hướng đó. Lấy Theia bằng **image upstream ghim digest** ở P6, mở sẵn cửa chuyển
sang bản dựng riêng cho P13/P9.

## 1. Vì sao rà soát

Chủ dự án nêu bốn nghi vấn: (a) Theia "không available"; (b) Theia tốn RAM hơn;
(c) Theia custom được, code-server không; (d) cần cái khả thi nhất cho hạ tầng
8 vCPU / 11.6Gi, chưa có tiền thuê VPS.

## 2. Đối chiếu từng tiền đề với bằng chứng

| Tiền đề | Kết luận | Bằng chứng |
|---|---|---|
| Theia tốn RAM hơn | **SAI ở trạng thái quyết định** | 6.A: 1 client mở workspace — Theia 451Mi / code-server 572Mi; thường trực — 446 / 719–753. Theia chỉ thua ở "IDE bật, chưa ai mở", trạng thái không tồn tại trong sản phẩm |
| code-server nhẹ và nhanh hơn | **ĐÚNG một nửa** | Nhanh hơn thật (809ms vs 1916ms tới HTTP; tarball nhỏ hơn 111 MiB). Nhẹ hơn chỉ đúng lúc chưa ai dùng |
| Theia không available | **SAI — do gõ thiếu một đoạn path** | xem §3 |
| code-server không cho custom | **ĐÚNG ở tầng shell, SAI ở tầng extension** | xem §4 |

## 3. Sửa lỗi: image prebuilt VẪN CÒN

Kiểm trực tiếp bằng registry API, ẩn danh, 2026-09-04:

```
ghcr.io/eclipse-theia/theia-ide/theia-ide   HTTP 200   ← đường ĐÚNG (2 đoạn)
ghcr.io/eclipse-theia/theia-ide             HTTP 403   ← đường 6.A đã kiểm
```

`docs/ide-choice.md` §5 và report 6.A §6 kết luận **"Theia không còn bản dựng sẵn
nào cho trình duyệt"**. Kết luận đó **sai**: package trên GHCR có **hai đoạn**
(`<org>/<repo>/<package>`), 6.A chỉ kiểm một đoạn và đọc 403 thành "không có".
Đối chứng dương: cùng phương thức ẩn danh, `ghcr.io/coder/code-server` cấp token
bình thường — nên 403 kia là *sai đường*, không phải *thiếu quyền*.

Image dùng được: `1.74.100` + `latest`, multi-arch amd64/arm64, `EXPOSE 3000`,
entrypoint `node .../browser/lib/backend/main.js --hostname=0.0.0.0` (đúng browser
mode, không phải Electron), publish 2026-08-11, digest index
`sha256:595d34047d91223b5d55fd5b611bb10981154c4b28de9271b2578f996f323751`.
Đây **đúng bản 1.74.100 mà 6.A đã đo**, nên mọi số RAM áp thẳng vào nó.

Rủi ro còn lại, đã xác minh: workflow publish là `on: workflow_dispatch` (chạy
tay), nên image chậm hơn framework một nhịp minor (image 1.74.100 vs framework
v1.75.0 ngày 2026-08-27) và **không ai cam kết bản sau được publish**. Bịt bằng
cách ghim digest bản đã kiểm — upstream ngừng publish thì image mình vẫn chạy.

⛔ **Chưa chứng minh:** chưa pull image đó về cụm. "Manifest trả 200" chưa bằng
"chạy được sau side-load". Đây là việc đầu tiên của 6.B.

## 4. Trục thứ tư: khả năng custom (Phase-6 chưa từng đo)

Phase-6 đặt ba tiêu chí: RAM / license / kích thước image. Khả năng tuỳ biến
**không nằm trong đó**. Ranh giới, xác minh bằng tài liệu chính thức:

> VS Code API: *"Extensions have no access to the DOM of VS Code UI. You cannot
> write an extension that applies custom CSS to VS Code or adds an HTML element
> to VS Code UI."*

| Nhu cầu | code-server | Theia |
|---|---|---|
| Bật/tắt panel, mở sẵn file, nạp extension — **theo từng bài, lúc chạy** | ✅ | ✅ |
| Thêm command / tree view / webview / status bar | ✅ | ✅ |
| Đổi bố cục shell, gỡ menu built-in | ❌ phải fork VS Code | ✅ `initializeLayout`, `ContributionFilterRegistry` |
| Widget riêng nằm trong shell (nút "Kiểm tra bước này") | ❌ chỉ tới webview trong sidebar | ✅ |
| Branding / About / màn hình chào | ❌ phải vá `product.json` | ✅ |

**Điểm quan trọng bị bỏ sót lúc đầu:** ba dòng cuối là **Theia extension dạng npm
package biên dịch vào bản dựng** (tài liệu: *"A Theia app is composed of so-called
Theia extensions. Each extension resides in its own npm package"*). Không thả được
vào `/home/theia` của image dựng sẵn lúc chạy. Chỉ dòng đầu là runtime.

## 5. Quyết định, theo đúng tiêu chí chủ dự án nêu

**Hạ tầng thấp** — Theia thắng cả hai chiều:

| trên 8 vCPU / 11.6Gi | code-server | Theia |
|---|---:|---:|
| RAM thường trực / pod | 719–753Mi | **446–447Mi** |
| trần đồng thời (bài có IDE) | 7 | **10** |
| CPU cộng dồn 25 phút | 42.1s | **13.1s** |
| ước tính khi cộng bài Docker (163Mi) | ~868Mi — sát trần `limits` 1Gi | ~559Mi |

Dòng cuối quyết định: code-server có thể buộc phải nâng cả `limits`, làm trần tụt
thêm một nấc. Theia còn khoảng thở.

**Nâng cấp VPS sau này** — lợi thế Theia không mất đi, chỉ bớt gắt.

**Dễ làm / hỗ trợ mạnh** — chỗ code-server thắng thật (45 bản/12 tháng so với 29;
cài bằng `curl` + `sha256sum -c`; 79k sao). Nhưng nỗi lo cụ thể ("không available")
đã bị bác bỏ ở §3, và framework Theia push code hàng ngày, minor hàng tháng.

**Custom** — không đổi kết luận, nhưng giữ cửa mở cho P9/P13 mà không tốn thêm.

## 6. Đường thi hành: hai nhịp

**Nhịp 1 — P6 (6.B–6.E).** `FROM ghcr.io/eclipse-theia/theia-ide/theia-ide@sha256:595d34…`
làm stage, `COPY /home/theia` sang `sandbox-base`. 0 phút build, digest bất biến,
và JDK/Maven/sshd trong image họ không rơi vào image mình. Việc của P6 là chứng
minh IDE **chạy qua gateway, đúng authz, cùng filesystem, trần đồng thời bao
nhiêu** — không việc nào cần shell riêng.

**Nhịp 2 — khi P13/P9 dựng UI thật.** Chuyển sang bản dựng Theia riêng (Yeoman
generator, hoặc `theia-ide` làm template) để làm bố cục shell, widget riêng,
branding. Lúc đó mới có giao diện thật để biết custom cái gì cho đúng.

**Cửa chuyển cài sẵn từ 6.B:** `ARG THEIA_IMAGE` — đổi nhịp là đổi giá trị một
ARG. Harness `Dockerfile.theia` đã viết đúng khuôn đó rồi.

**Giá của nhịp 2, nói thẳng:** một bản dựng Theia riêng nghĩa là tự gánh việc theo
kịp release upstream. Cái giá đó không biến mất khi hạ tầng khoẻ lên.

## 7. Việc phải làm tiếp

1. **Sửa `docs/ide-choice.md`** — §0, §1b (dòng "có bản dựng sẵn cho browser:
   KHÔNG"), §5 toàn phần. Ghi digest + đường path đúng. Điều kiện đảo #3 ("chi phí
   build thành vật cản") **không còn áp dụng ở nhịp 1**, và phải viết lại cho nhịp 2.
2. **Sửa report 6.A §6** — ghi nhận lỗi đường path, giữ nguyên phần số đo (không
   bị ảnh hưởng).
3. **Cập nhật phase-6 6.B** — bỏ giả định build-từ-nguồn, thêm `ARG THEIA_IMAGE`,
   thêm bước đầu tiên: pull + side-load + chạy thử image upstream trên cụm.
4. **6.C** — sửa lệnh verify `ss -ltn` (không có binary trong image; dùng
   `/proc/net/tcp` như `listen.sh`, hoặc thêm `iproute2`).
5. **6.E** — phép đo còn nợ: một pod chạy **đồng thời** bài Docker và IDE. Hai con
   số 10/7 hiện là ước lượng cộng thẳng, chưa ai đo chồng lấn.
6. **Ghi phạm vi custom** vào phase-6 6.D: mức 1 ở nhịp 1; mức 2–4 chuyển sang P13.

## 8. Điều rà soát này KHÔNG chứng minh

- Chưa pull/chạy image upstream trên cụm (§3).
- Chưa đo IDE + bài học cùng lúc (§5, trần 10/7 là ước lượng).
- Chưa đo nhiều người cùng lúc, chưa đo qua gateway.
- Bảng custom §4 dựa trên tài liệu chính thức, chưa dựng thử một Theia app có
  layout tuỳ biến để xác nhận bằng thực nghiệm.

## 9. Chốt bổ sung (2026-09-04, chủ dự án): KHÔNG custom ở giai đoạn này

Chỉ thị: *"đừng custom cái gì cả, dùng mặc định, cần ra sớm; sẽ bảo custom sau."*

**Quyết định IDE không đổi.** Bỏ trục custom ra khỏi bảng thì Theia vẫn thắng ở
đúng ràng buộc đang bó dự án (§5): 10 khe so với 7, CPU thấp hơn 3.2×, và không
có nguy cơ phải nâng `limits` 1Gi. Khoảng cách "dễ làm" đã khép lại nhờ §3 — image
upstream ghim digest chỉ là một stanza Dockerfile, ngang `curl + sha256sum -c`.

Thứ code-server còn thắng ở nhịp này: tarball side-load nhỏ hơn **111 MiB** mỗi
lần bump tag, trên đúng đường `docker save → scp → ctr import` đã từng nghẽn ở 5.A.
Chi phí đó trả theo mỗi lần bump; 3 khe học viên thì mất vĩnh viễn.

**Phạm vi P6 sau chỉ thị:**

| | Trong P6 | Chuyển sang sau |
|---|---|---|
| Theia mặc định, không sửa bản dựng | ✅ | |
| Cấu hình theo từng bài (settings/extension cấp pod) | ✅ chỉ khi bài cần | |
| Đổi bố cục shell, gỡ menu | | ⏸ khi chủ dự án yêu cầu |
| Widget riêng trong shell | | ⏸ |
| Branding | | ⏸ |

Hệ quả lên các task đã ghi:

- **6.B** — chỉ `COPY /home/theia` từ image upstream ghim digest. Không dựng app
  Theia riêng, không thêm extension riêng. Giữ `ARG THEIA_IMAGE` **vì harness đã
  có sẵn**, không thêm cơ chế mới nào.
- **6.D** — IDE là một `<iframe>` editor thuần. Mọi UI của nền tảng (nút chấm bài,
  tiến độ, điều hướng bước) nằm ở **pane ngoài iframe** — đúng bố cục 3 vùng mà
  6.D đã thiết kế, nên không phát sinh việc.
- **§6 nhịp 2** — hoãn vô thời hạn, chờ chủ dự án gọi. Không viết mã đón trước.

**Điều kiện mở lại nhịp 2:** chủ dự án yêu cầu, hoặc P13 chứng minh một UI của nền
tảng bắt buộc phải nằm TRONG khung IDE (chưa có bằng chứng nào như vậy tính tới
2026-09-04).
