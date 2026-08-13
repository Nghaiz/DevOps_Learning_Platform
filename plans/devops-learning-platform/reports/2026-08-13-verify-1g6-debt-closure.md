# 1.G-6 — Bốn món nợ P1 nằm ngoài mọi ô AC

**Ngày:** 2026-08-13 · **Chặng:** 1.G-6 (chặng đóng phase) · **Nhánh:** `feat/p1-1g6-debt-closure`
**Artifact:** [`harness/2026-08-13-1g6-debt-closure/`](harness/2026-08-13-1g6-debt-closure/)

---

## Kết quả một dòng

Bốn nợ đóng, **bốn ô AC mới**, và hai phát hiện mà chính phép đo lôi ra — cả hai cùng một họ: **đo đúng đại lượng nhưng sai điểm quy chiếu**. Không phát hiện nào là lỗi của hệ thống đang chạy; cả hai là lỗi của *cách đo* và của *bản ghi trước đó*.

| | Nợ | Kết quả |
|---|---|---|
| **R1** | Nhánh Safari < 16 không có gì gác | Gác bằng **nhánh THẬT của vendor** trong Chromium, không mock — project `safari15` 6/6 |
| **R2** | Thứ tự `open()`/`loadAddon()` không có gì gác | Gác bằng **hành vi** (`activate` thấy `element` chưa), kèm đối chứng âm |
| **R3** | Cổng Trivy chạy SAU `push` | Đảo thành build→quét→push; cổng "quét đã thật sự chạy" kiểm trên 4 ca |
| **R4** | Cửa sổ web-500 chưa ai đo (**nợ mồ côi**) | **12.3s** — dưới ngưỡng 60s đã chốt ⇒ giữ `post-install`, **không sửa file nào** |

**Số đo cuối**

```
packages/terminal · node       →  91 PASS / 0 FAIL
packages/terminal · gpu-on     →  12 PASS
packages/terminal · gpu-off    →  11 PASS / 1 skip có chủ ý (xem §3)
packages/terminal · safari15   →   6 PASS          ← project MỚI
turbo run lint typecheck build test → 16/16   (apps/web 95 PASS)
kiểm đột biến (R1+R2)          →  4 phép / 4 bị bắt · 1 đối chứng dương xanh
cổng shell Trivy (R3)          →  4 ca / 4 đúng
cửa sổ web-500 (R4)            →  12.3s   (ngưỡng chốt trước: ~60s)
```

---

## 0. Vì sao có chặng này: một ô AC không tồn tại thì không có gì đỏ

Sau 1.G-5 phase **hết ô AC trống**. Nhưng bốn món nợ ghi rành mạch trong report và §"Còn để ngỏ" **không nằm trong ô nào** — tức chúng đã được *sửa* hoặc *biết*, mà không được *gác*.

Một trong bốn đáng gọi tên riêng: mục web-500 mang chữ **"CHỦ: 1.G-2"** từ 2026-08-10. Nhưng 1.G-2 (#46) chỉ ship `cmd/session-probe` + sửa plan, còn 1.G-3 dựng cảnh bằng `helm **upgrade**` chứ không `install`. Chương chủ đóng mà không làm, và **ba chặng sau đó không chặng nào phát hiện**.

> **Nợ *chưa có chủ* thì lượt rà soát nào cũng nhìn thấy. Nợ *có chủ trên giấy* thì mọi lượt rà soát đọc lướt qua.** Cái sau ẩn kỹ hơn và vì thế đắt hơn. Đó là lý do cả bốn nợ ở đây thành **ô AC**, không phải thành một dòng ghi chú tử tế hơn.

---

## 1. R0 — đính chính report 1.G-5 trước khi làm được R1

Report 1.G-5 §6 viết: constructor của `@xterm/addon-webgl@0.19.0` *"có **đúng một** nhánh ném — `isSafari && safariVersion < 16`"*, và kết luận **"harness là Chromium ⇒ không có ca test nào chạy nhánh Safari"**.

Đọc lại dist:

```js
if (n.isSafari && (0, n.getSafariVersion)() < 16) {
  const e = { antialias: !1, depth: !1, preserveDrawingBuffer: !0 };
  if (!document.createElement("canvas").getContext("webgl2", e))
    throw new Error("Webgl2 is only supported on Safari 16 and above")
}
```

**Ba điều kiện, không phải một** — vế thứ ba là một phép dò `webgl2` nằm *bên trong* nhánh. Đo bằng Playwright 1.62.1 + chromium bundled, headless:

| Cờ launch | userAgent | `isSafari` | `Version/` | WebGL2 | Ném? |
|---|---|---|---|---|---|
| *(mặc định)* | *(mặc định)* | false | 0 | có | không |
| *(mặc định)* | **Safari 15** | true | 15 | **có** | **không** |
| `--disable-3d-apis` | *(mặc định)* | false | 0 | không | không |
| `--disable-3d-apis` | **Safari 15** | true | 15 | không | **CÓ** |

Hàng hai là điều bản cũ nói sai. Hàng bốn đảo ngược kết luận của nó: **nhánh Safari đo được trong Chromium**, chỉ cần cộng UA giả vào cảnh `gpu-off` vốn đã có.

> Đây là lần thứ tư trong P1 một kết luận sai vì đọc *một phần* điểm thực thi, sau `--icons=auto`, `pids.max` đọc trong pod, và chính "tắt hardware acceleration" của 1.G-5. Mẫu chung không phải bất cẩn — mà là **dừng đọc ngay khi tìm thấy điều kiện đầu tiên khớp với giả thuyết**.

---

## 2. R1 — gác nhánh Safari bằng nhánh thật, không mock

Project vitest thứ tư `safari15`: chromium `--disable-3d-apis` + `contextOptions.userAgent` Safari 15.6.1.

**Vì sao không `vi.mock('@xterm/addon-webgl')`** — mock chỉ khẳng định lại *niềm tin của ta* về vendor. Ngày addon đổi thông điệp hay bỏ nhánh, mock vẫn ném y như cũ và test vẫn xanh **trong khi thứ nó gác đã biến mất**. Nhánh thật đo được thì không có cớ để mock.

**Tiền đề là assertion, không phải giả định** — ca đầu file khẳng định `new WebglAddon()` *thật sự* ném `/Safari 16 and above/`. Thiếu vế đó thì ngày UA-spoof hoặc cờ launch ngừng tác dụng, file này lặng lẽ chạy cảnh Chrome bình thường và **vẫn xanh**, vì `createTerminalCore` vốn không ném ở cảnh đó.

Bằng chứng nhánh vendor đã chạy thật — stderr của lượt chạy:

```
[dlp-terminal] không khởi tạo được WebGL, dùng DOM renderer:
  [Error: Webgl2 is only supported on Safari 16 and above]
```

File riêng `terminal-core.safari.test.tsx` với glob riêng: UA giả **không được** rò sang `gpu-on`/`gpu-off`, vì nó đổi nhánh code của chính xterm ở hai project đó.

---

## 3. R2 — thứ tự `open()`/`loadAddon()`, và một ca chỉ chạy ở `gpu-on`

Bất biến được gác: tại đúng lúc `WebglAddon.activate()` chạy, `terminal.element` **đã tồn tại**. Đo bằng cách vá `WebglAddon.prototype.activate` (là method thật trên prototype) — **hành vi**, không phải thứ tự dòng trong source.

Đối chứng âm: `Terminal` trần, `loadAddon` **trước** `open()` ⇒ lần activate đầu thấy `element` vắng, lần thứ hai (sau `open()`) mới thấy.

### ⛔ Ca đối chứng âm chỉ chạy ở `gpu-on` — và lý do là một số đo

Bản đầu chạy nó ở **cả hai** project. Kết quả: **30/30 ca PASS nhưng lượt chạy vẫn ĐỎ** vì một *unhandled error*.

Ở `gpu-off`, lượt activate bị hoãn ném `"WebGL2 not supported"` **không** ra ngoài `open()` mà xuyên qua event-emitter của xterm vào `onUnexpectedError` — tức thành lỗi toàn cục, `try/catch` quanh `open()` không bắt được.

Đó **chính là** tác hại mà bất biến này chặn, nhưng ở dạng không quan sát được bằng assertion. Bịt nó bằng một global error handler là dựng đúng thứ nguy hiểm: một cái lưới nuốt luôn mọi lỗi thật khác của file. Nên ca này chạy ở cảnh có WebGL (lượt activate thứ hai thành công, không sinh tiếng ồn), và quan sát ở `gpu-off` được ghi vào đây thay vì bị làm cho im.

*Ghi chú đọc kết quả: "1 skipped" trong output là ca này ở `gpu-off`, có chủ ý và có lý do ở trên — không phải một ca chết lặng.*

---

## 4. R3 — đảo thứ tự cổng Trivy

**Trạng thái trước:** `push: true` ở [`ci.yml:932`](../../../.github/workflows/ci.yml), hai bước Trivy ở 952 và 966 ⇒ image CRITICAL **đã nằm trên ghcr** dưới cả `sha-…` lẫn `latest` trước khi cổng kịp đỏ.

**Phạm vi rộng hơn bản ghi gốc mô tả:** job `sandbox-image` (PR-time, đã đúng khuôn) chỉ gác **`sandbox-base`**. Với `web` · `migrator` · `orchestrator` · `terminal-gateway` thì job `images` là cổng **DUY NHẤT** — và nó đứng sau push.

**Sau:** build (`push:false` + `load:true`, tag cục bộ `<image>:scan`) → Trivy báo cáo → Trivy cổng CRITICAL → assertion "quét đã thật sự chạy" → **push**.

Ba bẫy đã tránh, ghi ra vì mỗi cái đều tạo một cổng-giả:

1. **`image-ref` phải đổi sang tag cục bộ.** Bản cũ quét theo `…@${{ steps.build.outputs.digest }}`; với `push:false` digest ấy **chưa tồn tại**. Quên sửa là bước quét trỏ vào tham chiếu rỗng — "xanh mà chưa quét gì".
2. **`sbom`/`provenance` không đi cùng `load:true`** (docker exporter không nhận attestation). Chúng thuộc lượt push.
3. **`--exit-code 1` trả 0 ≠ "0 CRITICAL"** — Trivy FATAL khi không tải được DB. Assertion đọc nội dung báo cáo, kiểm trên 4 ca:

| Đầu vào | Kỳ vọng | Thực tế |
|---|---|---|
| thiếu file | chặn | chặn ✔ |
| file rỗng | chặn | chặn ✔ |
| FATAL lọt vào output | chặn | chặn ✔ |
| **báo cáo Trivy thật, 0 CRITICAL** | **cho qua** | cho qua ✔ |

*Ca thứ tư là vế phân biệt cổng-thật với một cổng luôn-đỏ.*

**Phép so `imageid` giữa hai lượt build: đã cân nhắc và LOẠI.** Với `load:true` thì `imageid` là config ID của docker; với `push:true` kèm attestation thì iidfile chứa digest của **manifest list**. Hai đại lượng khác loại ⇒ phép so sẽ đỏ ở *mọi* lượt chạy đúng. Và vì job này chỉ chạy trên `main`, cái đỏ đó **không lộ ra ở PR nào cả**. Một cổng luôn đỏ vì lý do sai còn tệ hơn không có cổng.

---

## 5. R4 — cửa sổ web-500 trên fresh install: **12.3s**

Cảnh: `helm install dlp-scratch` vào namespace nháp, tag `sha-a6f6768` (đủ 5/5 image đã side-load sẵn trên node ⇒ không phải build gì).

Hai blocker cluster-scoped đã đọc template trước khi chạy, cả hai vì tên lấy từ `values` chứ không từ `.Release.Name`: `PriorityClass dlp-platform-critical` và `Namespace dlp-sandbox`. Xử lý: **đổi tên** PriorityClass (`dlp-scratch-critical`) và `sandbox.enabled=false`.

> **Không dùng `priorityClassEnabled=false`** dù ngắn hơn: cờ đó gỡ `priorityClassName` khỏi mọi pod nền tảng của release nháp, nên trên VM 1-node pod nháp thành thứ bị evict trước — tức nó nhiễu vào **đúng cái mốc `Ready` đang đo**.

### ⛔ Lượt đo đầu tiên cho cửa sổ ÂM 46.7s

`t0` là `Ready.lastTransitionTime` do **apiserver** ghi (đồng hồ VM); `t1` là lượt 200 đầu tiên do **poller trên Windows** bấm. Đo lệch bằng cách kẹp một lượt SSH giữa hai lần đọc đồng hồ local (RTT < 0.5s), ba lượt:

```
lech = 58968ms · 58995ms · 58971ms   ⇒ VM nhanh hơn Windows 58.98s
```

Sau hiệu chỉnh, **mọi mốc trong events khớp nhau** — kể cả thời điểm Job migration hoàn tất.

> **Cửa sổ âm thì lộ ngay. Ca thật sự nguy hiểm là lệch đồng hồ NHỎ**: con số vẫn dương, vẫn trông hợp lý, và không có gì trong output nói rằng nó sai. Vì thế bộ đo nay **tự đo lệch và ĐỎ nếu không đo được**, thay vì mặc định 0.

### Hình dạng cửa sổ, không chỉ độ dài

```
t0 −21.3s → t0 +4.5s   000  (chưa có endpoint / kube-proxy chưa lập trình xong)
t0  +5.4s → t0 +11.4s  500  ← chín lượt, đây là cửa sổ THẬT
t0 +12.3s              200
```

Chín lượt 500 sau mốc `Ready` chính là **đối chứng dương bắt buộc**: nó phân biệt "cửa sổ ngắn" với "bắt đầu đo quá muộn nên bỏ lỡ cả cửa sổ".

**Ngưỡng chốt từ 2026-08-10** (trước mọi phép đo, nên con số không tự biện minh cho chính nó): dưới ~60s ⇒ giữ `post-install`, chỉ ghi số. **12.3s ⇒ không sửa file nào.**

### Một ranh giới đã lường trước, và nó ĐÃ xảy ra

Job migration không có vế chờ Postgres. Timeline (đồng hồ VM):

```
04:14:54  mọi object được tạo
04:14:58  web container start · migrate lượt #1 start
04:15:04  postgres container mới start   ← muộn hơn migrate #1
04:15:19  migrate lượt #2 được tạo       ← lượt #1 đã HỎNG
04:15:20  web Ready
04:15:34  Job Completed
```

**Fresh install hôm nay sống nhờ `backoffLimit: 2`, không nhờ thứ tự.** Với `backoffLimit: 0` nó đã đỏ.

*Job mang `hook-delete-policy: hook-succeeded` nên tự xoá khi xong — `kubectl logs` sau đó không còn gì, và events chỉ sống khoảng một giờ. Ai điều tra lại phải bắt kịp cửa sổ đó.*

**Dọn dẹp:** `helm uninstall` + `kubectl delete pvc --all` (PVC mang `resource-policy: keep` nên uninstall để lại) + xoá namespace + xoá PriorityClass nháp. Kiểm sau dọn: release `platform` vẫn ở **revision 41**, y như trước.

---

## 6. Ranh giới — những gì chặng này KHÔNG chứng minh

- **Thứ tự Trivy mới chưa từng chạy thật.** Job `images` chỉ chạy trên `main`, nên bằng chứng hiện có là `actionlint` + bộ 4 ca trên cổng shell. Lượt chạy thật đầu tiên là lần merge kế tiếp — và đó đúng là họ lỗi §"Còn để ngỏ" đã ghi thành chữ.
- **Rủi ro tồn dư "hai lượt build": ghi lại, không khử.** Lượt push là lần build thứ hai (cache hit từ `type=gha`); về lý thuyết nó không được *chứng minh* bit-identical với thứ đã quét. Đường khử là `push-by-digest` rồi mới gắn tag — **P3**.
- **Safari THẬT vẫn chưa chạy.** Cảnh `safari15` là Chromium mang UA Safari: nó chạy đúng **nhánh ném của addon**, nhưng không phải WebKit. Thứ được gác là hành vi của `terminal-core.ts` trước một constructor ném, không phải tính tương thích Safari nói chung.
- **R4 đo một lần, không phải phân phối.** 12.3s là một mẫu trên một VM 1-node đang chạy sẵn release `platform`. Nó đủ để quyết định so với ngưỡng 60s (kém một bậc độ lớn), không đủ để gọi là p95.
- **Cửa sổ đo trên cảnh đã TẮT orchestrator/gateway.** Đường `jwks` không đi qua hai service đó, nhưng một fresh install đầy đủ sẽ tranh tài nguyên nhiều hơn, nên 12.3s là cận dưới.

---

## 7. Cổng đã qua

```
actionlint .github/workflows/ci.yml   → sạch
turbo run lint typecheck build test   → 16/16
packages/terminal test:browser        → 29 PASS / 1 skip có chủ ý
kiểm đột biến R1+R2                   → 4/4 bị bắt, đối chứng dương xanh
cổng shell R3                         → 4/4 ca đúng
```

**Ghi chú vận hành:** `apps/web` cần Postgres cục bộ (CI dùng `services: postgres`). Lượt chạy đầu đỏ 20 ca vì cổng 5432 đóng — đã dựng postgres:16-alpine + `pnpm db:migrate` rồi chạy lại thành **95 PASS**. Kết luận "do môi trường" được *chứng minh bằng cách làm nó xanh*, không phải bằng suy luận từ diff.

### ⛔ Bộ kiểm đột biến trượt ở lượt đầu — và nó tự báo

Hai trong bốn đột biến (M1, M4) trả **"LỖI BỘ KIỂM: không tìm thấy đoạn cần đột biến"**. Nguyên nhân: anchor nhiều dòng viết `\n` trong khi file dùng **CRLF**; hai đột biến một-dòng (M2, M3) vẫn chạy nên tổng thể *trông như* vẫn hoạt động.

Điểm đáng ghi không phải cái bug, mà là **nó không lặng lẽ đếm thành "bị bắt"** — đúng thứ bộ kiểm của 1.G-5 đã làm sai. Luật đã mã hoá vào harness: một đột biến chỉ tính là bị bắt khi vitest thoát khác 0 **VÀ** tên ca kỳ vọng xuất hiện trong output; đỏ mà không thấy tên ca thì báo **"ĐỎ SAI LÝ DO"**.
