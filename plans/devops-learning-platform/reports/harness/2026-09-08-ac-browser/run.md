# Đóng bốn ô AC bằng trình duyệt thật — 2026-09-08

Bốn ô `[~]` cùng một lý do: mã xong, test tầng dưới xong, **chưa ai bấm bằng trình duyệt**.
Lượt này lái Chrome thật (Playwright MCP) trên cụm đang chạy để đóng chúng.

## Bối cảnh phép đo

| Thứ | Giá trị |
|---|---|
| URL | `https://dlp.192.168.94.130.sslip.io:30443` (chứng chỉ tự ký, đã bỏ qua lỗi TLS) |
| Ảnh đang chạy | web `p13d` · gateway `p13e` · orchestrator `p13` · sandbox `p13ide` |
| Tài khoản | `AC613 Probe` — đã đăng nhập sẵn trong profile trình duyệt |
| Ngày | 2026-09-07/08 (giờ UTC trong ảnh chụp) |

⛔ **SỬA LẠI MỘT KHẲNG ĐỊNH CỦA CHÍNH TÔI.** Bản đầu của mục này ghi tài khoản có
"lịch sử RỖNG lúc bắt đầu". **Sai.** Lúc đó tôi mới nhìn khối "Lộ trình đang dở" (trống) và
tab "Bài học" (trống) rồi suy ra cả trang trống — chưa mở tab **Lab** và tab **Quiz**. Khi mở
ra ở phần P10:98 thì có hai dòng CŨ từ 7/9: một lượt lab `Chưa đạt` (16:55:10) và một lượt
quiz `Chưa đạt` (16:57:39). Không phải của lượt này.

Điều đó KHÔNG làm hỏng phép đo nào, và lý do đáng ghi hơn bản thân lỗi: cả hai lượt cũ đều
**Chưa đạt**, nên chúng không sinh tiến độ lộ trình — đó chính là vì sao khối "Lộ trình đang
dở" trống trước lượt này. Cú chuyển **0 lộ trình → 1 lộ trình (1/6)** vẫn quy được về đúng
một nguyên nhân: lượt quiz mà tôi vừa làm. Nhưng "trang này trống" là một khẳng định về
những gì tôi đã NHÌN, và tôi đã nhìn thiếu hai tab.

Tham số cụm liên quan (đọc từ env của `platform-orchestrator`):
`SESSION_TTL=1h` · `HARD_CAP=2h` · `EXTEND_DEFAULT=300s` · `CAPACITY_HARD_LIMIT=23`.

---

## P10:85 — quy tắc chấm câu nhiều đáp án hiện TRƯỚC khi làm → **ĐẠT**

`plans/devops-learning-platform/phase-10.md:85`

Trang: `/quiz/dlp-quiz-tu-container-toi-cum` (6 câu: 5 `single`, 1 `multiple`).

### 1. Quy tắc đứng trước câu hỏi đầu tiên, khi chưa chọn gì

Ảnh: `p10-85-quiz-rule-before-answering.png` (full page, chụp trước cú bấm đầu tiên).

Thứ tự trong cây a11y — thẻ "Cách chấm" nằm TRƯỚC `list` chứa các câu hỏi:

```
generic  "Cách chấm"
generic  "Câu nhiều đáp án: phải chọn ĐÚNG và ĐỦ mọi đáp án đúng mới được tính điểm
          — không có điểm một phần."
generic  "Đạt từ 70% số câu. Làm lại bao nhiêu lần cũng được."
status   "Đã chọn đáp án cho 0/6 câu"      ← 0/6: chưa thao tác gì
list     [6 listitem câu hỏi]
```

`0/6 câu` là vế "TRƯỚC khi người học làm": ảnh chụp ở trạng thái chưa có lựa chọn nào.

### 2. Đối chứng per-question — cùng lượt, cùng trang

| Câu | Nhãn hiển thị | Vai trò a11y |
|---|---|---|
| 1, 2, 3, 4, 6 | `Chọn một đáp án` | `radiogroup` / `radio` |
| 5 | `Chọn nhiều đáp án` | nhóm `checkbox` |

Câu một-đáp-án KHÔNG mang câu chữ all-or-nothing; nó mang một câu chữ khác hẳn.
Vế "hiện khác" của ô AC được thoả bằng chính bảng này.

### 3. Câu chữ đến TỪ payload, không viết cứng ở FE

`quiz.get` trả `"multipleAnswerRule":"all-or-nothing"` và `"passThresholdPercent":70`
— hai giá trị đúng bằng hai câu đang hiển thị. Bản ghi: `quiz-get-response.json`.

### 4. Đáp án KHÔNG có trong payload trước khi nộp — kèm đối chứng dương cho phép grep

Đây là ô AC khác đang xanh (`phase-10.md:78`); lượt này kiểm để chắc không làm nó đỏ.

```
$ grep -o "isCorrect|explanation|correctChoiceIds" quiz-get-response.json    → 0 hit
$ grep -o "isCorrect|explanation|correctChoiceIds" quiz-submit-response.json → correctChoiceIds ×6
                                                                               explanation      ×6
```

⚠ Dòng thứ hai là **đối chứng dương cho chính phép grep**. "0 hit" một mình không phân biệt
được *vắng thật* với *pattern hỏng*; cùng pattern đó bắt được 12 hit trên response sau khi nộp,
nên "0 hit" trên `quiz.get` là vắng thật.

Đối chứng phụ: payload có `"kind":"single"` ×5 và `"kind":"multiple"` ×1 — khớp KHÍT với
`content/quizzes/dlp-quiz-tu-container-toi-cum.json`. Payload không bị cắt bớt.

### 5. Luật đang hiện CHÍNH LÀ luật đang được áp (kiểm chứng động)

Cố ý chọn **thiếu** ở câu 5: chọn 1 trong 2 đáp án đúng (`kubectl describe pod`, bỏ
`kubectl get events`). Nếu có điểm một phần thì câu đó phải được tính một phần.

Kết quả sau khi nộp (`p10-85-quiz-graded-all-or-nothing.png`):

```
5/6 câu — 83%   ·   Đạt (mốc 70%)   ·   Lần làm thứ 1
Câu 5 → "Chưa đúng"
```

`quiz.submit` trả `correctCount=5`, `questionCount=6`, `passed=true`, `attemptNumber=1`.
Chọn đúng-nhưng-thiếu ⇒ 0 điểm câu đó ⇒ **all-or-nothing**, đúng câu chữ đã hiện ở đầu trang
trước khi người học chạm vào bất cứ thứ gì.

**Kết luận P10:85 — ĐẠT.** Bấm thật bằng `browser_click` (7 cú: 6 lựa chọn + Nộp bài),
không dùng `evaluate` để giả lập.

---

## P6:99 — cùng filesystem, CHIỀU GHI (editor → terminal) → **ĐẠT**

`plans/devops-learning-platform/phase-6.md:99`

Bài: `/lessons/dlp-ide-config-edit` (`interface.layout: ide`, ba khoang: nội dung | Theia | terminal).
Phiên: `e26b9159895067021d7f18aef07ddfcd` · pod `sandbox-dd3adc83bb2a`.

Ô cũ đã chứng minh chiều ĐỌC (ghi bằng `kubectl exec` ⇒ Explorer của Theia thấy).
Lượt này đóng chiều GHI, là chiều khó hơn và quan trọng hơn.

### Ba mốc, và chúng phải theo đúng thứ tự này

**Mốc 1 — nền, chạy TRƯỚC khi gõ gì** (`p6-99-b-terminal-baseline.png`, 18:37:38Z):

```
--- BASELINE 2026-09-07T18:37:38Z ---
name=dlp-demo
port=0
log_level=info
0                      ← grep -c 'DLP-WRITE-OK-a7f3c1d9'
MARKER-A-ABSENT-OK
```

⚠ Đối chứng âm chạy **trước**, không phải sau. Đó là điều làm mốc 3 có nghĩa: chuỗi mốc
không tồn tại trong file trước khi tôi gõ nó, nên khi nó xuất hiện thì nó không thể đến
từ chỗ nào khác.

**Mốc 2 — gõ trong Theia** (`p6-99-c-theia-file-opened.png`, `p6-99-d-theia-edited-unsaved.png`):

Mở `/root/lab/app.conf` bằng quick-open (Ctrl+P → `app.conf` → Enter); editor hiện đúng
ba dòng mà terminal vừa in. Sửa `port=0` → `port=8080` và thêm dòng
`marker=DLP-WRITE-OK-a7f3c1d9`.

⚠ **Gõ bằng sự kiện phím thật, không phải `fill()` vào DOM.** Lần đầu tôi nhắm
`browser_type` vào một `textarea` trong cây a11y của Theia — nội dung editor KHÔNG đổi,
chỉ focus đổi. Monaco có hai textarea và cái lộ ra trong snapshot không phải cái nhận
phím. Đường đúng là `page.keyboard.type()` (sự kiện phím qua CDP, cùng cơ chế mà
`browser_type` dùng) sau khi click vào chính dòng văn bản. Ghi lại vì một `fill()` không
báo lỗi khi nó không tới đích — nó "thành công" và không đổi gì.

**Mốc 3 — `cat` ở terminal** (`p6-99-g-terminal-doi-chung-am.png`, 18:43:49Z):

```
name=dlp-demo
port=8080
log_level=info
marker=DLP-WRITE-OK-a7f3c1d9
marker2=DLP-WRITE-SAVE-c4d5e6f7
--- ket qua grep ---
CO    DLP-WRITE-OK-a7f3c1d9        ← gõ trong editor, tự lưu
CO    DLP-WRITE-SAVE-c4d5e6f7      ← gõ trong editor rồi Ctrl+S ngay
VANG  DLP-WRITE-NO-b2e8f04c        ← ĐỐI CHỨNG ÂM: chưa từng gõ vào editor
inode=939963 mtime=2026-09-07 18:43:23.930898009 +0000
```

Marker thứ ba cùng hình dạng, cùng tiền tố, chỉ khác hậu tố — **vắng**. Nên phép `grep`
của tôi đang khớp đúng thứ nó định khớp, không khớp bừa.

### Hai xác nhận độc lập nữa

**(a) Phép kiểm của chính bài.** Bấm nút **Kiểm tra** ⇒ `Đạt — port=8080, phần còn lại của
file vẫn nguyên` (`p6-99-h-ba-khoang-kiem-tra-dat.png`). Script chấm chạy trong sandbox,
đọc file mà editor đã ghi — không đi qua `cat` của tôi.

**(b) Đọc từ NGOÀI trình duyệt.** `kubectl exec` trên host (18:45:29Z) in ra cùng nội dung.
Không mảnh nào của trình duyệt tham gia lượt đọc này, nên không có đường nào để nó giả.

### Phát hiện kèm theo — Theia TỰ LƯU, `Ctrl+S` không bắt buộc

Đo chứ không đoán: gõ `marker3=DLP-WRITE-NOSAVE-e9a0b1c2`, **không** bấm Ctrl+S và
**không** rời focus khỏi iframe, rồi đọc đĩa bằng `kubectl exec` từ host ⇒ marker3 **đã có
trên đĩa**. Vậy là `files.autoSave` theo độ trễ, không phải `onFocusChange` (nếu là
onFocusChange thì lượt đo này phải thấy vắng).

Hệ quả: `step1.md` dặn *"lưu bằng `Ctrl+S`"* — câu đó không SAI (Ctrl+S vẫn lưu, mốc 2 đã
dùng nó), nhưng file cũng tự lưu nếu người học không bấm. Đây là quan sát về nội dung, KHÔNG
phải lỗi, và không đụng tới ô AC này. Ghi lại để lần sau ai đo "chưa lưu thì đĩa chưa đổi"
không kết luận nhầm là đường ghi hỏng.

**Kết luận P6:99 — ĐẠT.** Chiều GHI đã chứng minh bằng bốn nguồn đọc độc lập
(`cat` trong terminal · script chấm của bài · `kubectl exec` từ host · Explorer/editor),
với đối chứng âm chạy trước.

---

## P10:98 — trang "của tôi" → **ĐẠT**

`plans/devops-learning-platform/phase-10.md:98`

Câu chữ của ô: *"mọi con số tính lúc đọc; nhãn không khẳng định thứ không lưu."*

### 1. Bốn khối đều có dữ liệu THẬT, và số khớp với thứ tôi vừa tạo

Ảnh: `p10-98-a-me-lab-tab.png`, `p10-98-b-me-sau-khi-ket-thuc-phien.png`.

| Khối | Hiển thị | Truy về đâu |
|---|---|---|
| Lộ trình đang dở | "Từ container tới cụm" · `Đã đạt 1/6 phần` · `Phần tiếp theo: dlp-sandbox-basics` | lượt quiz tôi vừa nộp; TRƯỚC đó khối này ghi "Chưa có lộ trình nào đang dở" |
| Phiên đang mở | `d9f09e24b7de9db1c73168fae3e765c3` · `Máy đã sẵn sàng` · `Mở lúc 01:54:42 8/9/2026` · `còn 60 phút` | phiên tôi vừa dựng: Redis `createdAt=1788807282` = 01:54:42 (+07) — KHỚP TỪNG GIÂY; `expiresAt-createdAt = 3600` = "60 phút" |
| Lịch sử → Bài học | `dlp-ide-config-edit · Đang học · Đang ở bước 2 · 01:44:17 8/9/2026` | đúng lúc tôi bấm "Kiểm tra" ở P6:99 (18:44Z), bước 1 đã đạt |
| Lịch sử → Quiz | `Kiểm tra: từ container tới cụm · Đạt · 5/6 câu đúng · 83% · 01:34:28 8/9/2026` | đúng lượt nộp ở P10:85 (18:34Z), đúng điểm |

`1/6` không phải "có hiện gì đó": lộ trình có đúng 6 mục
(`content/paths/dlp-path-tu-container-toi-cum.json`), mục thứ 4 là chính quiz tôi vừa đạt, và
`Phần tiếp theo` trỏ về `dlp-sandbox-basics` — mục ĐẦU TIÊN chưa đạt, không phải mục kế sau
quiz. Đó là dấu hiệu của một phép tính lúc đọc, không phải một con trỏ đã lưu.

Hai dòng còn lại (lab 7/9, quiz thứ hai 7/9) là dữ liệu CŨ của tài khoản, không phải của lượt
này — xem ghi chú sửa lỗi ở đầu báo cáo.

### 2. Vế "tính lúc đọc" — chứng minh ở tầng SCHEMA, không phải ở tầng quan sát UI

UI hiện đúng số chỉ chứng minh UI hiện đúng số. Câu hỏi thật là: có cột nào để nó ĐỌC RA
không? Truy vấn `information_schema` trên Postgres của cụm, lọc tên cột theo
`/passed|progress|item_count|next_item|percent|score/`:

```
content_items.pass_threshold_percent
quizzes.pass_threshold_percent
```

Cả hai là **ngưỡng do tác giả đặt**, không phải kết quả của ai. Không có
`passed_count`, `item_count`, `next_item_id`, `percent_complete`, `score`.

⚠ Truy vấn CÓ trả về hai dòng, nên nó không phải một phép đo rỗng khớp-không-gì
(đối chứng dương cho chính regex).

Các bảng lưu lượt làm:

```
quiz_attempts :: id, user_id, quiz_id, submitted_at
lab_attempts  :: id, user_id, lab_id, session_id, started_at, submitted_at,
                 display_name_public, created_at, updated_at
progress      :: id, user_id, lesson_id, step_index, completed_at, created_at, updated_at
learning_path_items :: id, path_id, ordinal, item_kind, item_id, created_at
```

`quiz_attempts` **không có cột điểm nào**. Nên `5/6 câu đúng · 83%` và `Đạt` không thể được
đọc ra từ đâu — chúng phải được tính lúc đọc từ đáp án đã lưu, đối chiếu với nội dung.
Tương tự: `lab_attempts` không có cột kết quả (`0% · đạt 0 task`, `Chưa đạt` là tính ra), và
`19 giây` là `submitted_at - started_at` chứ không phải một cột thời lượng.

Đây là vế mạnh nhất của lượt đo, và nó đóng luôn câu *"mọi con số tiến độ tính lúc đọc"* của
13.E chứ không riêng ô này.

### 3. "Kết thúc được từ đây" — bấm thật, và ĐÚNG phiên đó

Dựng phiên thứ hai (playground `89facea5657a7cdec3d67c66efb0cee6`) để có hai dòng, rồi kết
thúc ĐÚNG một dòng:

```
truoc : 2 dong (89facea5... con 24 phut | d9f09e24... con 49 phut)   ·  "Con 18 cho"
        -> bam "Ket thuc" o dong 89facea5
        -> hop thoai: "Ket thuc phien 89facea5657a...?"   (neu DICH DANH phien)
        -> bam "Ket thuc phien"
sau   : 1 dong (d9f09e24... con 49 phut)                             ·  "Con 19 cho"
```

Ba vế cùng nói một chuyện, mỗi vế ở một tầng khác nhau:

- **UI**: dòng biến mất, dòng KIA còn nguyên (không phải "kết thúc tất cả").
- **Sức chứa**: 18 → 19 chỗ. Một chỗ được trả lại đúng như hộp thoại hứa.
- **Server**: Redis `status` của `89facea5` = `REAPED` (revision 2→3), pod
  `sandbox-c6627e8f4457` **biến mất khỏi `kubectl get pods`**; phiên `d9f09e24` vẫn
  `CLAIMED`.

⚠ Hash `session:89facea5...` vẫn `EXISTS=1` sau khi kết thúc, TTL 248s. Đó KHÔNG phải rò rỉ:
`status=REAPED` + pod đã xoá + chỗ đã trả, tức nó là bia mộ ngắn hạn (để client nối lại nhận
được "phiên đã kết thúc" thay vì "không tìm thấy"). Ghi lại vì `EXISTS=1` đọc thoáng qua rất
giống một phiên chưa chết.

⚠ **Bẫy đo:** nút "Kết thúc" ở bảng chỉ MỞ hộp thoại, không gửi lệnh. Lần bấm đầu tôi tưởng
nó hỏng vì bảng không đổi — `browser_network_requests` cho thấy **không lời gọi nào** được
phát, và snapshot `main` không thấy hộp thoại vì nó render qua portal. Cú bấm thứ hai còn
treo 30s do chính lớp phủ modal chắn nút phía sau. Đọc mạng trước khi kết luận "nút chết".

**Kết luận P10:98 — ĐẠT.**

---

## P13:90 — dark mode: canvas xterm ĐỔI MÀU THẬT → **ĐẠT** (vế còn thiếu đã đo)

`plans/devops-learning-platform/phase-13.md:90` (ô ngoài bốn ô ban đầu, giao thêm giữa lượt)

Vỏ trang đã ĐẠT cả hai chiều từ trước; vế thiếu là *"canvas xterm CHƯA nhìn thấy đổi màu"*.

### Phép đo

Canvas không đọc được bằng DOM (`getComputedStyle` không nói gì về thứ đang được vẽ), nên đo
bằng pixel: in nội dung ổn định vào terminal (`DLP-THEME-PROBE` + 8 dòng), rồi chụp vùng
terminal ở từng theme và so ảnh.

`toDataURL` KHÔNG được dùng: xterm chạy renderer WebGL, và không có `preserveDrawingBuffer`
thì nó trả ảnh trong suốt — một ảnh trống ở đó sẽ là **hạn chế của phép đo**, rất dễ đọc nhầm
thành "màu không đổi". Chụp màn hình tránh hẳn cái bẫy đó.

### Kết quả — đối chứng trước, phép đo sau

```
                                        sai lech tb/kenh    pixel khac ro (>8/255)
DOI CHUNG  A1 vs A2  (cung theme toi)        0.000                 0.00%
DOI CHUNG  B1 vs B2  (cung theme sang)       0.000                 0.00%
PHEP DO    A1 vs B1  (toi <-> sang)        210.626                96.02%
PHEP DO    A2 vs B2  (toi <-> sang)        210.626                96.02%
CHIEU VE   A1 vs A3  (toi->sang->toi)        0.149                 0.23%
```

Đối chứng cùng-theme ra **0.000 tuyệt đối**: không con trỏ nhấp nháy, không hoạt ảnh nào. Nên
96.02% ở dòng dưới không thể là nhiễu. Chiều về cũng đóng: đổi ngược lại thì pixel TRỞ LẠI gần
như y hệt (0.23% dư chính là đồng hồ trên prompt đã nhảy vài giây).

### Quy kết: canvas, không phải nền CSS của khung

96% pixel đổi mới chỉ chứng minh *vùng terminal* đổi màu — nền CSS phía sau một canvas trong
suốt cũng cho đúng kết quả đó. Vế quy kết nằm ở **pixel của CHỮ**:

```
theme toi  (A1): rat toi(<60) 97.97%   trung gian 1.38%   rat sang(>195)  0.65%
theme sang (B1): rat toi(<60)  4.60%   trung gian 1.62%   rat sang(>195) 93.78%
```

Ở theme tối, 0.65% pixel rất sáng = chữ sáng trên nền tối. Ở theme sáng, 4.60% pixel rất tối
= **chữ đã đổi thành màu tối**. Một thay đổi nền thuần CSS không thể đảo màu chữ — chữ do
renderer của xterm vẽ vào canvas. Ảnh `p13-90-B1.png` đọc được bằng mắt: nền trắng, chữ xanh
đậm, rõ ràng — không phải chữ sáng vô hình trên nền sáng.

**Kết luận P13:90 — vế canvas ĐẠT.** Câu "editor của Theia mang theme RIÊNG, độc lập với dark
mode của app" là giới hạn đã chấp nhận và tôi KHÔNG đụng tới — lượt này không đo nó.

