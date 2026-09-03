# Chọn IDE cho lane Theia/6.A — SSOT

**Ngày đo:** 2026-09-03 · **Lab:** 1 node / 8 vCPU / 11.6Gi, Sysbox, k8s v1.34.10
**Harness:** [`2026-09-03-6a-ide-measure/`](../plans/devops-learning-platform/reports/harness/2026-09-03-6a-ide-measure/)
**Report:** [`2026-09-03-verify-6a-ide-measure.md`](../plans/devops-learning-platform/reports/2026-09-03-verify-6a-ide-measure.md)

## 0. Quyết định

**Chọn Eclipse Theia (bản browser, `eclipse-theia/theia-ide` v1.74.100).**

Nó **thua** code-server ở hai tiêu chí dễ nhìn nhất — kích thước image và
"RAM lúc rảnh" theo nghĩa hẹp — và **thắng ở tiêu chí duy nhất quyết định trần
đồng thời**: RAM khi có một người học thật đang mở nó. Chênh lệch ở trạng thái
đó là **~310Mi mỗi pod**, tức khoảng **ba khe quota** theo chính thước đo mà
phase-6 đặt ra ("mỗi 100Mi thêm vào pod là một khe quota mất đi").

⚠ Quyết định này **đảo ngược** thứ tự mà đọc lướt bảng số sẽ gợi ra. Lý do nằm ở
§2 — và nó là phần quan trọng nhất của tài liệu này.

## 1. Bảng số

Mọi số RAM là **workingSet = `memory.current` − `inactive_file`**, đọc ở cgroup
**trên host**, không đọc trong pod. Đây là đúng công thức kubelet dùng, nên nó so
được với con số 163Mi của P3 và với `requests`. Đọc `memory.current` trần sẽ thổi
phồng vì nó gộp page cache.

### 1a. RAM (MiB) — ba pod chạy đồng thời trên cùng node

| Trạng thái | **đối chứng**<br>(không IDE) | **code-server**<br>4.135.0 | **Theia**<br>1.74.100 |
|---|---:|---:|---:|
| pod rảnh, chưa bật IDE | 55.0 | 47.7 | 50.9 |
| IDE đã phục vụ được HTTP, **chưa có client** | 55.1 | **128.0** | **253.3** |
| **1 client trình duyệt đang mở workspace 50 file** | 55.1 | **571.6** | **451.4** |
| sau vài lượt tải lại trang (ổn định) | 55.1 | **719–753** | **446–447** |
| đỉnh quan sát được (`memory.peak`) | 81.2 | **763.5** | **546.6** |
| CPU cộng dồn sau ~25 phút | 4.2s | **42.1s** | **13.1s** |

**Phần CỘNG THÊM so với chính pod đó lúc chưa bật IDE:**

| | code-server | Theia |
|---|---:|---:|
| chưa có client | **+80.3** | +202.4 |
| 1 client đang mở | +523.9 | **+400.5** |
| sau tải lại (ổn định) | +705.2 | **+395.8** |
| đỉnh | +689.9 | **+467.7** |

### 1b. Thời gian, kích thước, license

| | code-server | Theia |
|---|---|---|
| tới lúc trả HTTP | **809ms** (302) | 1916ms (200) |
| tarball `docker save` (thứ đi qua scp mỗi lần bump tag) | **424.0 MiB** (+220.7) | 535.4 MiB (+332.1) |
| image bung ra trên đĩa node | **1.84 GB** (+1.01) | 2.20 GB (+1.37) |
| base để so | 203.3 MiB tarball / 831 MB đĩa | — |
| license sản phẩm | MIT (code-server) trên VS Code OSS (MIT) | MIT (`theia-ide`) trên framework Theia (**EPL-2.0**) |
| marketplace mặc định | **Open VSX** (`open-vsx.org/vscode/gallery` trong `product.json`) | **Open VSX** (mọi URL trong `theiaPlugins` trỏ open-vsx.org) |
| có bản dựng sẵn cho browser | có, tarball ghim được checksum | **KHÔNG** — phải tự build từ nguồn |

## 2. Vì sao chọn cái thua ở "RAM lúc rảnh"

Phase-6 xếp tiêu chí số một là *"RAM lúc rảnh"*. Phép đo cho thấy cụm từ đó có
**hai nghĩa, và hai nghĩa cho hai người thắng ngược nhau**:

- **"IDE đã bật, chưa ai mở"** → code-server thắng đậm (+80 so với +202).
- **"một người học đang mở IDE, không gõ gì"** → Theia thắng đậm (+396 so với +705).

Nghĩa thứ nhất mô tả một trạng thái **không tồn tại trong sản phẩm**. Pod sandbox
chỉ sống khi có người claim nó; nếu bài có `layout: ide` thì người ấy đang mở IDE.
Đặt `requests` theo nghĩa thứ nhất là đặt theo một trạng thái mà hệ không bao giờ
ở trong đó — pod sẽ bị OOM hoặc node bị over-commit ngay lượt đầu.

Nghĩa thứ hai là **cái quyết định trần**, vì `requests` là thứ scheduler dùng, và
`requests` phải phủ được mức dùng thật ở trạng thái thường trực.

Nói cách khác: bảng số không đổi, nhưng **chọn sai population thì đọc ra người
thắng ngược lại**. Đây đúng lớp lỗi mà `green-that-proves-nothing` mô tả, chỉ là
nó xảy ra ở tiêu chí quyết định thay vì ở một ô AC.

### 2b. Hai điều làm khoảng cách rộng thêm

**code-server tích luỹ theo số lần kết nối, Theia thì không.** Đo trực tiếp:

| | phiên 1 | +phiên 2 | +phiên 3 |
|---|---:|---:|---:|
| code-server | 571.6 | 748.8 | 752.9 |
| Theia | 451.4 | 445.9 | 446.7 |

code-server **không trả lại** RAM khi tab đóng (đo được: 571.6 → 530.7 sau khi
client ngắt — chỉ nhả 41Mi), rồi cộng thêm ~180Mi cho phiên kế. Nó **có** chững
lại quanh ~750Mi chứ không rò tuyến tính — đừng gọi đây là leak. Nhưng nền tảng
này có người học tải lại trang, nên mức thường trực phải đọc là **~750Mi**, không
phải 571Mi.

**CPU chênh hơn ba lần** (42.1s so với 13.1s cộng dồn). Ở một node 8 vCPU chứa
hàng chục pod, `throttle-zero-hides-node-level-starvation` đã ghi rằng tranh chấp
CPU ở tầng node không hiện ra trong `nr_throttled` của pod. Con số này không quyết
định lựa chọn, nhưng nó đi cùng chiều.

## 3. Hệ quả lên trần đồng thời (đầu vào cho 6.E)

Trần hiện tại **21 pod**, là `min` của năm ràng buộc với `requests` 250m/256Mi.
Với IDE, `requests` phải phủ mức thường trực đo được ở §1a:

| | `requests.memory` cần | `5500Mi ÷ requests` | trần mới |
|---|---|---:|---:|
| không IDE (hiện tại) | 256Mi | 21.5 | **21** |
| Theia | 512Mi | 10.7 | **10** |
| code-server | 768Mi | 7.2 | **7** |

⚠ **Cả hai đều tụt QUÁ NỬA**, nên điều kiện của 6.E task 17 đã kích hoạt: phải
**tách profile** (bài-có-IDE dùng `requests` riêng) chứ không nâng đều cho mọi
bài. Nâng đều thì bài không dùng IDE — phần lớn giáo trình — cũng mất 11 khe.

⛔ **Bảng trên là ƯỚC LƯỢNG, chưa phải phép đo.** Nó lấy số của pod chạy **IDE và
không chạy gì khác**. Người học thật chạy IDE **cộng** bài học; đỉnh đo được của
bài Docker là 163Mi. Cộng thẳng hai số là giả định chúng không chồng lấn, mà điều
đó chưa ai đo. Phép đo còn thiếu, và 6.E phải làm: **một pod chạy đồng thời bài
Docker và IDE**. Ước lượng cộng thẳng cho ra ~559Mi (Theia) và ~868Mi
(code-server) — số sau nằm sát trần `limits` 1Gi hiện tại, tức code-server có thể
buộc phải nâng cả `limits`, làm trần tụt thêm một nấc nữa.

## 4. Điều kiện ĐẢO quyết định

Chọn lại code-server nếu **bất kỳ** điều nào dưới đây được chứng minh bằng số:

1. **Phép đo "IDE + bài học cùng lúc"** (§3) cho thấy phần cộng thêm của
   code-server **không quá Theia +50Mi**. Lúc đó tiêu chí 1 hết là yếu tố phân
   định và tiêu chí 3 (kích thước, khởi động nhanh hơn 2.4×) thắng.
2. **code-server nhả RAM khi client ngắt** ở bản mới, đưa mức thường trực sau vài
   lượt tải lại xuống **dưới 500Mi**. Đo lại bằng đúng harness này.
3. **Chi phí build Theia thành vật cản thật**: build từ nguồn hết >20 phút trong
   CI, hoặc không ghim lại được thành một artifact bất biến. Xem §5.
4. Theia bỏ Open VSX hoặc đổi sang một marketplace có điều khoản hạn chế.

Nếu chênh lệch RAM ở trạng thái quyết định rơi xuống **dưới 50Mi**, chọn theo
**license và chi phí vận hành** — lúc đó code-server thắng, vì nó là một `curl` +
`sha256sum -c` thay vì một lượt build.

## 5. Món nợ mà lựa chọn này mang theo

**Theia không còn bản dựng sẵn nào cho trình duyệt** (kiểm 2026-09-03):

- `theiaide/theia` trên Docker Hub → **404** (repo đã bị xoá).
- `ghcr.io/eclipse-theia/theia-ide` → **404** với token ẩn danh.
- Release của `eclipse-theia/theia-ide` chỉ có artifact **Electron** cho desktop.

Nên 6.B **không** dùng được khuôn `curl + sha256sum -c` mà `fastfetch`/`oh-my-posh`/
`pwsh` đang dùng. Đường duy nhất là build từ nguồn theo `browser.Dockerfile` của
chính repo đó (đo được: bước build 356.5s, tổng ~8 phút kể cả pull base và export; tải 97 plugin từ Open VSX).

Hệ quả phải xử ở 6.B:

- **Ghim gì?** Ghim tag nguồn (`v1.74.100`) chứ không ghim digest artifact — không
  có artifact nào để ghim. Đây là một mức bảo đảm **yếu hơn** hai đường còn lại
  trong image, và phải ghi rõ như vậy thay vì để nó trông giống nhau.
- **Build ở đâu?** Build trong CI rồi publish một image trung gian, hoặc build
  tay rồi side-load. Không có đường thứ ba.
- **`yarn --pure-lockfile` + `download:plugins` cần mạng** lúc build; hai lần build
  cách nhau vài tháng có thể ra hai cây phụ thuộc khác nhau nếu upstream đổi.

## 6. Phát hiện phụ, ảnh hưởng thẳng tới AC của 6.C

**`ss` và `netstat` KHÔNG có trong `sandbox-base`** (đo: cả hai đều MISSING trong
cả ba pod). Lệnh verify mà phase-6 ghi —

```bash
kubectl exec $POD -- ss -ltn | grep -v 127.0.0.1
```

— sẽ **đỏ vì thiếu binary**, không phải vì có cổng mở ra ngoài. Đó đúng là kiểu
"lỗi công cụ đọc ra thành lỗi hệ thống" mà `shell-error-masquerades-as-wrong-answer`
mô tả, và nó sẽ đỏ trên một hệ hoàn toàn lành. 6.B/6.C phải chọn một trong hai:
thêm `iproute2` vào image, hoặc đổi lệnh verify sang `/proc/net/tcp` (harness
`listen.sh` đã có bản chạy được).

Bằng chứng thu được bằng đường thứ hai — **cả hai IDE đều chỉ nghe loopback**,
đúng một socket mỗi pod, không có socket nào trên `0.0.0.0`:

```
codeserver   local=0100007F:0FA1     # 127.0.0.1:4001
theia        local=0100007F:0FA2     # 127.0.0.1:4002
control      (không có socket nào LISTEN)
```

Pod đối chứng không có socket nào — đối chứng âm cho chính phép kiểm này.

## 7. Những gì phép đo này KHÔNG chứng minh

- **Chưa đo IDE + bài học cùng lúc** (§3). Đây là ô chính còn mở.
- **Chưa đo nhiều người cùng lúc.** Mọi số ở trên là một pod, một client. Trần ở
  §3 suy từ `requests`, không từ một lượt tải N=10 thật.
- **Chưa đo qua gateway.** IDE chạy sau `kubectl port-forward`, chưa qua chuỗi
  authz và reverse-proxy của 6.C — thứ sẽ thêm độ trễ và có thể thêm RAM ở
  gateway (không ở pod).
- **"Tới lúc trả HTTP" ≠ "tới lúc dùng được".** 809ms của code-server là lúc nó
  trả 302 — trước khi extension host kịp khởi động. Thời gian tới lúc workbench
  dùng được **chưa được đo**: lượt kiểm bằng trình duyệt chỉ chờ một khoảng cố
  định (25s cho code-server, 30s cho Theia) rồi thấy nó đã sẵn sàng, nên tất cả
  những gì biết được là "dưới ngưỡng đó". Con số 809ms/1916ms chỉ dùng để so hai
  ứng viên với nhau; đừng đem nó hứa với người học. 6.D task 14 (trạng thái "đang
  khởi động") phải dựa trên một phép đo khác.
- **Node lúc đo không rảnh cũng không tải nặng** (load 1.3–1.95, 3 pod warm thật
  đang chạy). Đây không phải điều kiện "cụm đầy" — bài học của 5.B là số đo trên
  node rảnh không chứng minh được hành vi dưới tải.
