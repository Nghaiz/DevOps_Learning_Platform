# Ghi công nguồn cảm hứng của trụ cột ③ Games

Bốn game của nền tảng này lấy **ý tưởng** từ [`rohitg00/k8sgames`](https://github.com/rohitg00/k8sgames).
Toàn bộ code, dữ liệu level, văn xuôi và mô phỏng là do dự án tự viết.

Tài liệu này ghi công vì **lịch sự và minh bạch học thuật**, không phải vì Apache-2.0
bắt phải làm. Phần dưới nói rõ vì sao, kèm dữ kiện đã xác minh, để không ai đọc nhầm
thành một nghĩa vụ đang tồn tại.

---

## 1. Dữ kiện đã xác minh

| Việc | Kết quả |
|---|---|
| Repo | `github.com/rohitg00/k8sgames` |
| Commit đọc tại thời điểm nghiên cứu | `af5dbc19b3a41dcb42822572dd766bdf225a1860` (nhánh `main`) |
| License | Apache License, Version 2.0 (bản boilerplate chuẩn, 190 dòng) |
| Dòng bản quyền | `Copyright 2026 Rohit Ghumare`, nằm ở dòng 178 trong phần APPENDIX |
| Phân loại của GitHub API | `spdx_id = Apache-2.0` (khớp với nội dung file) |
| File `NOTICE` | **Không tồn tại.** Quét toàn bộ cây 41 file: không path nào chứa chuỗi `notice`, không phân biệt hoa thường |

Nguồn của bảng này: `plans/devops-learning-platform/reports/2026-09-08-p14-k8sgames-upstream-study.md` §0 và §1.1.
Báo cáo đó tải license và cây file qua GitHub API, không clone vào working tree.

Sự vắng mặt của `NOTICE` là dữ kiện quyết định, không phải một chi tiết nhỏ: điều
khoản 4(d) của Apache-2.0 chỉ kích hoạt khi *"the Work includes a NOTICE text file"*.
Không có file đó thì 4(d) không có gì để áp.

---

## 2. Ta lấy gì

Ba nhóm, tất cả đều là **ý tưởng**, không phải vật thể:

1. **Bộ game mode.** Chiến dịch theo level, chaos mode sinh tồn, sandbox xây tự do,
   thử thách bấm giờ. Bốn cách chơi này là cấu trúc sản phẩm, không phải code.
2. **Vòng lặp chẩn đoán sự cố.** Trình tự triệu chứng quan sát được → lệnh điều tra
   dẫn tới bằng chứng → nhiều đường sửa có độ khó khác nhau. Đây là điều đáng học
   nhất từ upstream và nó định hình `IncidentKind` trong `packages/games/src/k8s/contract.ts`.
3. **Ý tưởng một cluster nhìn thấy được.** Cụm hiện ra như một không gian có node, pod,
   và đường nối, thay vì một bảng chữ.

Ta cũng học từ **những chỗ upstream làm sai**, và đó là phần hữu ích không kém:
ngưỡng chấm sao của challenge mode là hằng số toàn cục không đọc ngân sách của từng
bài (§2.4 của báo cáo), điều kiện achievement là closure JavaScript nên không
serialize được (§5.1), `chapter` là field suy ra được lưu ở ba nơi (§3.4b), và mô phỏng
gọi `Math.random()` 15 lần mà không có RNG có hạt giống nên không phát lại được (§6).
Bốn điều đó nằm trong hợp đồng của ta như bốn ràng buộc **cấm**, không phải như thứ
được mượn. Một quyết định thiết kế ngược lại với upstream không nợ upstream điều gì,
nhưng nó vẫn đến từ việc đọc upstream, nên nó được ghi ở đây.

---

## 3. Ta KHÔNG lấy gì

| Thứ | Trạng thái |
|---|---|
| Source code (bất kỳ file `.js` nào) | Không copy, không port, không dịch |
| Asset (ảnh, model, âm thanh, font) | Không lấy file nào |
| Văn xuôi (`description`, `hints`, mô tả bài học) | Không dịch câu nào; mọi văn bản tiếng Việt viết mới |
| Dữ liệu level | Không copy; level của ta có schema khác và nội dung khác |
| Tên sản phẩm | Xem §5 |

Trong repo này **không có một file nào vendored từ upstream**. Kiểm được bằng cách
duy nhất đúng: `content/games/` chỉ chứa đúng file bạn đang đọc, và `packages/games/`
là code viết mới.

---

## 4. Vì sao đây là lịch sự, không phải nghĩa vụ

Ba vế, cả ba đều cần đúng thì kết luận mới đứng:

**(a) Điều khoản 4 chỉ kích hoạt khi phân phối.** Nguyên văn: *"You may reproduce and
distribute copies of the Work or Derivative Works thereof [...] provided that You meet
the following conditions"*. Ta không phân phối Work, và code ta tự viết không phải
Derivative Work của code họ. Không có hành vi nào kích hoạt 4(a), 4(b), hay 4(c).

**(b) 4(d) không áp được vì không có `NOTICE`.** Xem §1.

**(c) Ý tưởng và sự thật kỹ thuật không được bảo hộ bản quyền.** *"CrashLoopBackOff do
sai image tag, đọc `kubectl logs --previous` vì log hiện tại thường rỗng"* là một sự
thật về Kubernetes. Nó không phải sáng tạo của tác giả upstream, và nó cũng có trong
tài liệu chính thức của Kubernetes lẫn trong đầu mọi người đã vận hành một cụm.

Vậy nghĩa vụ pháp lý theo Apache-2.0 trong tình huống hiện tại là **không có**.

Ba lý do vẫn ghi công: (1) đây là đề tài nghiên cứu khoa học, minh bạch nguồn cảm hứng
là chuẩn học thuật; (2) nếu sau này có ai hỏi *"sao giống thế"*, một dòng ghi công có
sẵn tốt hơn một lời giải thích muộn; (3) nó rẻ.

⚠ **Đừng đọc tài liệu này thành lời thú nhận một nghĩa vụ.** Nói quá lên cũng sai
như nói thiếu đi: nếu văn bản này hàm ý ta đang tuân thủ điều khoản 4, thì lần sau
có ai đọc lại sẽ tưởng dự án có một ràng buộc phân phối mà nó không có, và sẽ đưa ra
quyết định sai dựa trên đó.

---

## 5. Cảnh báo về tên gọi, và một xung đột chưa giải quyết

Điều khoản 6 của Apache-2.0 **không** cấp quyền dùng tên thương mại. Luật nhãn hiệu là
một trục độc lập với license: license mở không đồng nghĩa với tên mở.

Kế hoạch đang gọi game Kubernetes là **"Kubernetes Game"** (`phase-14-exec.md` §1 quyết định 2,
§6), và route là `/games/k8s`. Báo cáo nghiên cứu §1.3 khuyến nghị ngược lại: *"Tránh
đặt tên sản phẩm gần 'Kubernetes Games' / 'k8sgames'"*. Hai tài liệu mâu thuẫn nhau và **lane
viết tài liệu này không có thẩm quyền đổi tên sản phẩm**, nên nó được ghi lại ở đây
thay vì được sửa lặng lẽ.

Route `/games/k8s` thì an toàn: `k8s` là tên viết tắt phổ thông của Kubernetes, không
phải nhãn hiệu của ai. Rủi ro nằm ở **nhãn hiển thị** trên thẻ catalog nếu nó đọc ra
gần với tên upstream. Đề xuất cho lead: đặt nhãn tiếng Việt (ví dụ *"Cứu hộ Cluster"*)
và giữ `k8s` chỉ như một `GameId` kỹ thuật. Quyết định thuộc về lead.

---

## 6. Vì sao quy ước `LICENSE.upstream` không áp được ở đây

`content/scenarios/loki-quickstart/` mang hai file mà thư mục này không có:
`LICENSE.upstream` (bản copy Apache-2.0 của upstream) và khối `source` trong `dlp.json`
ghi `repo` + `commit` + `path` + `licenseUrl`.

Quy ước đó tồn tại vì scenario là **file vendored ghim theo byte**:
`scripts/vendor-scenarios.mjs --check` đối chiếu byte-với-byte theo đúng commit upstream.
Ở đó, điều khoản 4(a) *thật sự* kích hoạt vì ta phân phối lại chính Work của họ, nên
bản copy license là bắt buộc chứ không phải trang trí.

Games không ở trong tình huống đó:

| Vế của quy ước | Có áp được không |
|---|---|
| `LICENSE.upstream` (bản copy license) | **Không.** 4(a) không kích hoạt vì ta không phân phối Work của họ |
| `source.commit` (ghim byte) | **Không có gì để ghim.** Không file nào vendored, nên không có byte nào để đối chiếu |
| `source.repo` + `source.licenseUrl` (con trỏ về nguồn) | **Có**, và đó là §1 của tài liệu này |
| `notes` (ghi lại điều bất thường) | **Có**, và đó là §2, §3, §5 |

Nói cách khác: ta giữ **nửa truy vết** của quy ước và bỏ **nửa tuân thủ**, vì nửa sau
không có việc gì để làm. Bảng trên tồn tại để lần sau không ai nhìn thư mục này rồi
kết luận là quên mất `LICENSE.upstream`.

---

## 7. Điều gì làm câu trả lời này đổi

Bốn tình huống. Gặp bất kỳ cái nào thì **dừng và đọc lại §1.3 của báo cáo nghiên cứu**
trước khi viết tiếp:

1. **Copy, port, hay dịch một file code bất kỳ từ upstream.** Kích hoạt đủ 4(a) + 4(b)
   + 4(c): kèm bản copy license, ghi rõ file nào đã sửa, giữ nguyên mọi copyright
   notice. 4(d) vẫn không kích hoạt vì vẫn không có `NOTICE`.
2. **Copy nguyên văn văn xuôi trong `description` hoặc `hints` của họ.** Đây là vùng
   rủi ro thật: tên field thì không được bảo hộ, nhưng câu văn thì có. Viết lại bằng
   tiếng Việt là né được, nhưng phải **viết lại thật**, không phải dịch máy từng câu.
3. **Lấy một file ảnh, model, hay âm thanh.** Cùng nhóm với (1).
4. **Đặt tên sản phẩm gần tên của họ.** Không phải chuyện Apache-2.0 mà là chuyện nhãn
   hiệu. Xem §5.

---

## 8. Nguồn

| URL | Dùng cho |
|---|---|
| `https://github.com/rohitg00/k8sgames` | repo gốc |
| `https://raw.githubusercontent.com/rohitg00/k8sgames/main/LICENSE` | nội dung license nguyên văn |
| `https://www.apache.org/licenses/LICENSE-2.0` | đối chiếu bản boilerplate chuẩn |

⚠ **Ba URL này được kiểm bằng `curl -sIL -w %{http_code}` ngày 2026-09-08 trong báo cáo
nghiên cứu (13/13 trả 200), KHÔNG phải bởi lane viết tài liệu này** (lane docs không có
công cụ mạng). Nêu ra vì một dòng "đã kiểm" không nói ai kiểm thì lần sau không truy
được. URL nào 404 về sau thì sửa tại đây và ghi ngày kiểm mới.

Bản đọc đầy đủ về upstream, gồm nguyên văn điều khoản 4, danh mục 34 loại sự cố, và
các quyết định thiết kế ta cố ý làm ngược lại:
`plans/devops-learning-platform/reports/2026-09-08-p14-k8sgames-upstream-study.md`.
