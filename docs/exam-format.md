# Chế độ thi — đồng hồ, cổng, bảng điểm

SSOT của chế độ thi (P18 — 18.G). Khi tài liệu này và mã nguồn bất đồng, **mã nguồn thắng
và tài liệu này là bug**.

| Thứ | Ở đâu |
|---|---|
| Bảng | `apps/web/src/server/db/schema.ts` § `exams`, `exam_attempts` |
| Đồng hồ (thuần) | `apps/web/src/server/exams/clock.ts` |
| Cổng soạn đề | `apps/web/src/server/exams/compose-gate.ts` |
| Cổng nộp bài | `apps/web/src/server/exams/attempt-seed.ts` |
| Mở / nộp lượt | `apps/web/src/server/exams/crud.ts` |
| Bảng điểm | `apps/web/src/server/exams/scoreboard.ts` |
| Xuất CSV | `apps/web/src/server/exams/csv.ts` |
| Router | `apps/web/src/server/trpc/routers/exams.ts`, `exam-sitting.ts` |
| Đếm ngược phía client | `apps/web/src/app/(session)/exams/countdown.ts` |
| Màn thi / quản trị | `apps/web/src/app/(session)/exams/`, `apps/web/src/app/admin/exams/` |

Đọc cùng [`oj-format.md`](oj-format.md): kỳ thi **không** có mô hình chấm riêng — nó dùng
nguyên hệ bài OJ, và mọi thứ về verdict, testcase, seed đều nằm ở tài liệu đó. Tài liệu này
chỉ ghi ra những gì kỳ thi **thêm vào**, và vì sao.

## Ranh giới

⛔ Một kỳ thi là **một lớp, một danh sách bài, một khoảng thời gian**. Không có giám sát màn
hình, không có khoá trình duyệt, không có chứng chỉ. Nó khác quiz ở đúng một chỗ:
[`quiz-format.md`](quiz-format.md) mở đầu bằng *"quiz là công cụ kiểm hiểu giữa các bài,
không phải hệ thống thi cử"* — chế độ thi **là** phần thi cử đó, nên nó có những thứ quiz cố
ý không có: đồng hồ, một lượt duy nhất, seed do máy chủ cấp, bảng điểm cho giảng viên.

Một sinh viên có **đúng một lượt** cho mỗi kỳ thi. Khoá chính gộp `(exam_id, user_id)` nói ra
điều đó bằng lược đồ; một `uuid` riêng sẽ cho phép hai lượt song song tồn tại, và lúc ấy
*"sinh viên này được mấy điểm"* có hai câu trả lời.

---

## 1. Đồng hồ lấy từ MỘT nguồn duy nhất là máy chủ

Đây là ràng buộc số một của cả chế độ thi, và nó là lý do `clock.ts` là một module riêng chứ
không phải vài phép cộng rải rác.

Hai ô nghiệm thu đo đúng chuyện này, và cả hai hỏng theo cùng một kiểu nếu phép tính hạn nằm
ở ba chỗ và một chỗ quên `closes_at`:

> Đổi giờ hệ thống máy khách lên 2 tiếng ⇒ **đếm ngược KHÔNG đổi**.
> Đóng tab lúc còn một phút, mở lại ⇒ **đã hết giờ**.

### Phía client: trừ bằng đồng hồ ĐƠN ĐIỆU

⛔ **KHÔNG dùng `deadline - Date.now()`.** Nó đúng ở máy có giờ chuẩn và **sai im lặng** ở mọi
máy khác — và "sai im lặng" ở đây nghĩa là một sinh viên thấy còn 20 phút trong khi máy chủ đã
đóng bài.

Cách duy nhất giữ được ô nghiệm thu: máy chủ cấp một **KHOẢNG** (`remainingMs`), client trừ
dần bằng `performance.now()` — một đồng hồ đơn điệu không liên quan gì tới giờ hệ thống.
Người dùng chỉnh đồng hồ máy, đổi múi giờ, hay máy đồng bộ NTP giữa chừng đều **không tham
gia vào phép tính nào**.

```ts
// countdown.ts
remainingFrom(anchor: { remainingMsAtSync, monotonicAtSync }, monotonicNow): number
```

`deadline` máy chủ gửi kèm chỉ để **HIỆN** ("hết hạn lúc 09:00"), không để trừ.

Memory dự án đã ghi hai vết đúng hình dạng này: VM ngủ làm vỡ ô nghiệm thu treo theo đồng hồ,
và đồng hồ VM lệch ~59 giây so với máy chủ. **Lệch NHỎ nguy hơn lệch lớn**, vì con số vẫn
trông hợp lý.

| Hằng | Giá trị | Vì sao |
|---|---|---|
| `COUNTDOWN_TICK_MS` | `250` | một đồng hồ nhảy đúng mỗi giây sẽ trễ tới gần một giây so với thật ngay sau lần đồng bộ, và ở ba mươi giây cuối thì độ trễ đó là thứ người ta nhìn thấy |
| `COUNTDOWN_RESYNC_MS` | `30_000` | đồng hồ đơn điệu của trình duyệt có thể **DỪNG** khi tab bị treo hoặc máy ngủ, rồi tiếp tục từ chỗ dừng — tức đếm ngược thừa ra đúng khoảng máy ngủ. Ba mươi giây đủ chặt để sai lệch không kịp thành phút, đủ thưa để một phòng thi bốn mươi người không thành bốn mươi request mỗi giây |

`formatCountdown` luôn hai chữ số cho phút và giây: một chuỗi đổi **độ dài** mỗi lần qua mốc
10 giây làm cả khối chữ nhảy ngang, và trên một màn hình mà người ta liếc mỗi vài giây thì
chuyển động đó là thứ duy nhất mắt bắt được.

### Phía máy chủ: `now` là THAM SỐ

Mọi hàm trong `clock.ts` nhận `now: Date` thay vì gọi `Date.now()` bên trong. Không phải để
cho dễ test (tuy nó cũng làm được thế). Lý do thật: **một hàm đọc đồng hồ bên trong thì không
đo được** — mọi ô nghiệm thu về "hết giờ" sẽ phải ngủ thật, và một ô ngủ thật là một ô sẽ
bong tróc dưới tải song song.

### Hạn thật = cái nào TỚI TRƯỚC

```ts
attemptDeadline(attempt, closesAt) = min(started_at + duration_minutes, closes_at)
```

`closesAt = null` nghĩa là kỳ thi **không có hạn tuyệt đối**, chứ không phải "không có hạn":
đồng hồ riêng của lượt vẫn chạy.

⚠ Thiếu vế `closesAt` thì một sinh viên mở lượt **trước lúc đóng đề 1 phút** vẫn được trọn
thời lượng — tức là thi sau khi đề đã đóng. Đó là lý do hàm nhận `closesAt` chứ không chỉ
nhận `attempt`.

### Không có tiến trình nền nào "khoá" lượt thi

Trạng thái hết giờ **suy ra lúc đọc** (`isAttemptClosed`), và đường ghi từ chối dựa trên chính
phép suy đó. Nên đóng tab hay mở tab không đổi gì — đó là vế máy chủ của ô nghiệm thu thứ hai.

---

## 2. Ba thứ `exam_attempts` KHÔNG lưu, mỗi thứ một lý do khác nhau

Cùng quy ước No Derived Fields của repo mà `lab_attempts` và `quiz_attempts` đã áp
([`lab-format.md`](lab-format.md) §4.1, [`quiz-format.md`](quiz-format.md) § "Không lưu field
suy ra được") — nhưng ba cột dưới đây bị loại vì ba lý do **khác nhau**, và phân biệt được ba
lý do đó là điều kiện để không ai thêm lại chúng:

| Không có | Suy từ | Cái giá nếu lưu |
|---|---|---|
| `deadline` | `min(started_at + duration_minutes, exams.closes_at)` | sửa `closes_at` của kỳ thi xong thì cột lưu sẵn **thành sai mà không gì báo** |
| `auto_submitted` | `submitted_at >= deadline` | một bản sao có thể lệch khỏi hai cột thời gian |
| `score` | gộp từ `problem_submissions` | điểm là `passed.length / total` — xem [`oj-format.md`](oj-format.md) §3 |

**`auto_submitted` suy được vì hai ca không chồng nhau:** nộp tay **luôn** xảy ra TRƯỚC hạn
(máy chủ từ chối sau hạn), còn lượt tự nộp thì mốc hiệu lực **đúng bằng** hạn.

⚠ Ranh giới là `>=`, không phải `>`. Một lượt bấm nộp đúng mili-giây cuối cùng đọc ra là "tự
nộp", và đó là ca **duy nhất** phép suy này không phân biệt được. Cái giá: một dòng trong bảng
điểm mang nhãn sai ở xác suất gần bằng 0. Cái được: không có một cột cờ thứ hai có thể lệch
khỏi hai cột thời gian.

### Còn `duration_minutes` thì CÓ, và nó KHÔNG phải trường suy ra

Nó là **ảnh chụp** thời lượng của kỳ thi tại thời điểm mở lượt, giống giá lúc đặt hàng. Chốt
bởi chủ dự án 2026-09-15.

Đọc thẳng `exams.duration_minutes` thì một giảng viên sửa giờ giữa chừng sẽ **rút ngắn đồng hồ
dưới chân người đang làm bài**, và ở mức rút đủ nhiều thì bài **tự nộp ngay lập tức**.

### `effectiveSubmittedAt` — mốc nộp HIỆU LỰC

Hết giờ mà chưa bấm nộp thì mốc nộp là **đúng HẠN**, không phải `now`. Nếu trả `now` thì cùng
một lượt đọc ra hai mốc khác nhau ở hai lần mở bảng điểm, và cột "nộp lúc" của một bài bỏ dở
sẽ **trôi theo thời điểm giảng viên bấm F5**.

`null` = còn giờ và chưa nộp. Ba trạng thái, không phải hai — và §6 nói vì sao điều đó đi tới
tận cột CSV.

---

## 3. Cổng SOẠN ĐỀ — `composeIssues`

Hàm **thuần, không chạm DB**. Nhận danh sách bài ĐÃ TRA rồi mới phán, thay vì tự truy vấn:
một cổng tự truy vấn thì chỉ đo được bằng một DB thật, và lúc đó mọi ô nghiệm thu về luật soạn
đề sẽ phải dựng dữ liệu thật cho từng ca. Các luật ở đây là luật **suy luận**, nên chúng đo
được bằng dữ liệu bịa.

| Luật | Vì sao |
|---|---|
| ≥1 bài | một đề rỗng không phải một đề |
| không trùng mã | một bài hai lần làm **mẫu số của bảng điểm sai**, và sinh viên thấy cùng một bài hai chỗ mà không hiểu vì sao |
| mã phải tra ra bài | — |
| bài phải `published` | bài nháp thì người học **không mở được** (đường đọc lọc theo `state`), nên một đề chứa nó hiện ra một ô trống mà sinh viên không làm gì được — và họ phát hiện điều đó **trong lúc đang tính giờ** |
| `per-student` ⇒ mọi bài phải `seedable` | §4 |
| `1 ≤ durationMinutes ≤ 720` | dài hơn 12 tiếng thì đó không còn là một kỳ thi |
| `closesAt > opensAt` | hai mốc ngược nhau là một kỳ thi **không bao giờ mở** |

Ca cuối đáng đọc kỹ: nó **không ném ở đâu cả** — `isExamOpen` trả `false` mãi mãi — nên nếu
không chặn ở đây thì triệu chứng duy nhất là sinh viên báo *"em không vào thi được"* và không
ai tra ra vì sao.

⚠ Xoá một bài trong `problems` **không** làm sạch mã của nó khỏi các đề cũ (`problem_codes` là
mảng, không có khoá ngoại). Đường đọc phải chịu được một mã không tra ra bài — đó là lý do
`ExamProblemFacts.state` là `… | null` chứ không phải một enum kín.

### `problem_codes` là MẢNG, và thứ tự của nó có nghĩa

Thứ tự người ra đề xếp là thứ tự sinh viên thấy. Một bảng nối `exam_problems (exam_id, code,
position)` biểu diễn được đúng thứ đó và còn cho khoá ngoại tới `problems`, nhưng nó mua một
bảng và một `position` phải tự giữ liên tục để đổi lấy một ràng buộc mà tầng ứng dụng đã kiểm.
Với một đề vài chục bài thì mảng là câu trả lời đúng.

---

## 4. Seed — hai chiến lược, và cổng thứ hai lúc NỘP

`EXAM_SEED_STRATEGIES = ['fixed', 'per-student']`.

| Chiến lược | Seed lấy từ đâu |
|---|---|
| `fixed` | `exams.fixed_seed` — **một số cho cả kỳ thi** |
| `per-student` | `randomSeed()` lúc mở lượt, ghi vào `exam_attempts.seed` |

`fixed_seed` **không gộp được** vào `exam_attempts.seed`: với `fixed` thì seed phải tồn tại
**TRƯỚC** khi có lượt làm bài đầu tiên, nếu không thì người mở trước và người mở sau nhận hai
đề khác nhau mà cả hai đều tưởng mình thi chung.

### Vì sao `per-student` cần `seedable`

Một kỳ thi `per-student` nhận một bài `seedable: false` thì **mỗi sinh viên nhận một đề khác
độ khó mà không ai biết** — kể cả người chấm. Cờ `seedable` trên chính bài là thứ duy nhất
chặn được chuyện đó.

⛔ **Hôm nay không bài nào vào được kỳ thi `per-student`.** Đo 2026-09-15:
`GameProblemPlugin.seedSpec` là tuỳ chọn và **không plugin nào khai nó**, nên biên ghi
(`refineByGame`) từ chối mọi `seedable: true`, nên `composeIssues` từ chối mọi bài trong một
đề `per-student`. Ba cổng nối tiếp nhau và cả ba đang nói đúng sự thật — chi tiết ở
[`oj-format.md`](oj-format.md) §12.

### Cổng lúc NỘP — `examSubmissionRejection`

Cổng soạn đề gác lúc **soạn**, và một mình nó **không đủ**: thiếu cổng thứ hai thì một đề soạn
đúng luật vẫn bị lách ở bước nộp, vì ngoài kỳ thi người nộp **tự mang seed lên** (hành vi cố ý
của hợp đồng — [`oj-format.md`](oj-format.md) §4).

Ba phép kiểm, trả **câu tiếng Việt** thay vì mã lỗi vì mỗi ca cần một câu khác nhau:

1. Bài có nằm trong `exam.problem_codes` không.
2. Lượt thi đã khoá chưa (`isAttemptClosed`).
3. **`submission.seed === attempt.seed`** — so BẰNG với seed máy chủ đã cấp.

Không nới thành "seed nào cũng được miễn là hợp lệ": cả điểm của cột `exam_attempts.seed` là
để mọi người trong cùng một kỳ thi làm **cùng một đề** (hoặc, với `per-student`, làm đúng đề
đã cấp cho mình).

### ⛔ Vì sao cổng này chỉ gác TRONG một lượt thi, không gác ở mọi lượt nộp

Chốt bởi chủ dự án 2026-09-15 (phương án **(b)** trong plan), và lý do là một **phép đo** chứ
không phải một sở thích.

Bản "hiển nhiên" của cổng này — đòi seed bằng một hằng cho bài `seedable: false` — sẽ **từ chối
MỌI lượt nộp K8s**: `components/k8s-arena/arena-session.ts` sinh seed **ngẫu nhiên** mỗi phiên
(`Math.floor(Math.random() * 2 ** 31)`), nên xác suất qua là **1 trên 2³¹**. Đó đúng là thảm
hoạ mà hợp đồng mô tả: *"nhìn từ phía người dùng, nó giống hệt một hệ thống từ chối người chơi
ngẫu nhiên."*

Và seed ấy **không phải rác**: `classifyObjectives(level, seed)` phân loại mục tiêu theo chính
nó, nên ép nó về một hằng là **đổi lối chơi** chứ không phải siết bảo mật.

### ⚠ Phạm vi thật của cổng seed, nói cho đúng

Vì không plugin nào khai `seedSpec`, **hôm nay seed KHÔNG đổi `initialState` của bài** — nó
chỉ đổi dòng ngẫu nhiên của mô phỏng. Nên câu "người nộp tự chọn thế giới đầu" **chưa đúng
theo nghĩa đen**; thứ họ chọn được là **dòng sự cố**, vẫn làm bài dễ đi nhưng là một mối nguy
khác và **nhỏ hơn**.

Ghi ra để người đọc sau không đánh giá quá tay tác dụng của cổng này.

---

## 5. Mở lượt và nộp lượt — hai phép ghi chống đua

### `startAttempt` không bao giờ tạo lượt thứ hai

`onConflictDoNothing` trên khoá chính gộp `(exam_id, user_id)`, rồi **đọc lại**. Bấm hai lần
nút "Bắt đầu", hai tab cùng mở, hay một lượt F5 đúng lúc — cả ba phải ra **CÙNG một lượt** với
**CÙNG một seed** và **CÙNG một `started_at`**.

Một bản kiểm-rồi-mới-ghi sẽ đua với chính nó ở đây, và **giải thưởng cho người thắng cuộc đua
là một đồng hồ được đặt lại**.

Ba cổng trước khi mở: kỳ thi phải tồn tại · người gọi phải **thuộc lớp** · kỳ thi phải đang
trong cửa sổ (`isExamOpen`).

⚠ Người ngoài lớp nhận **`NOT_FOUND`**, không phải `FORBIDDEN` — họ không cần biết kỳ thi này
có tồn tại hay không.

### `submitAttempt` ghi `submitted_at` MỘT lần

`where submitted_at is null` chứ không đọc-rồi-ghi: hai tab cùng bấm nộp thì mốc nộp phải là
**lần đầu**, không phải lần cuối. Không ném khi đã nộp rồi — người bấm hai lần đang muốn đúng
một kết quả, và họ đã có nó.

### Cổng nộp bài gắn ở ROUTER, không ở `submitProblem`

`submitProblem` trả lời câu *"bài làm này đúng tới đâu"*. Cổng kỳ thi trả lời câu *"lượt nộp
này có được tính không"* — hai câu khác nhau, và gộp chúng sẽ bắt `submitProblem` phải biết về
kỳ thi, tức nó **không dùng lại được** cho đường nộp thường.

Cổng chạy **TRƯỚC**, nên một lượt bị từ chối không tốn một lượt phát lại toàn bộ nhật ký.

Không có `examId` thì **không làm gì cả** — mọi lượt nộp ngoài kỳ thi đi qua đó không đổi một
dòng nào.

⚠ **`FORBIDDEN` chứ không `BAD_REQUEST`.** Người nộp không gửi lên dữ liệu hỏng; họ gửi một
lượt hợp lệ mà luật kỳ thi không nhận. `BAD_REQUEST` sẽ dẫn họ đi sửa bài làm, trong khi thứ
cần sửa là việc họ đã hết giờ, hoặc đang làm một bài ngoài đề.

⚠ `examId` trên dây **không cấp thêm quyền nào**: `getExamForStudent` lọc theo tư cách thành
viên lớp, nên một `examId` của lớp khác trả `NOT_FOUND`.

---

## 6. Bảng điểm

### Lượt nộp NGOÀI cửa sổ thi không được tính — chỗ dễ sai nhất

Một sinh viên có thể đã giải `K8S-0001` từ **tuần trước**. Nếu phép gộp chỉ lọc theo
`problem_code` thì bài làm tuần trước rơi thẳng vào bảng điểm kỳ thi — **không lỗi, không cảnh
báo, và điểm trông hoàn toàn hợp lý**.

Nên mọi lượt nộp phải nằm trong `[started_at, hạn]` của **chính lượt thi đó**. Hạn là một phép
TÍNH chứ không phải một cột, nên SQL phải dựng lại nó:

```sql
least(a.started_at + make_interval(mins => a.duration_minutes),
      coalesce(e.closes_at, 'infinity'::timestamptz))
```

`'infinity'` chứ không phải một ngày xa trong tương lai — `timestamptz` của Postgres có giá
trị vô cực thật, và một hằng "năm 9999" là một **quả bom hẹn giờ có thật**.

### Một lượt thi, nhiều lần nộp: lấy lần TỐT NHẤT của từng bài

`distinct on (user_id, problem_code)` sắp theo số testcase đã qua giảm dần. Cộng dồn mọi lượt
sẽ **thưởng cho việc nộp đi nộp lại**. Hoà thì lấy lượt **mới nhất** — người nộp lại bằng điểm
thường là người vừa sửa xong một thứ khác.

### Sắp theo SỐ, không sắp theo tên

⛔ Postgres bản alpine chạy trên **musl, không có locale**, nên nó xếp mọi ký tự tiếng Việt có
dấu **xuống sau `Z`** — "Đặng" đứng sau "Zulu" và **không lỗi nào báo**. Thứ tự là
`solvedCount` ↓, `passedTotal` ↓, rồi `user_id` phá hoà.

### Ba ô số của mỗi dòng

| Ô | Nghĩa |
|---|---|
| `solvedCount` | số bài giải trọn vẹn |
| `passedTotal` | tổng testcase đã qua |
| `caseTotal` | tổng testcase của **những bài đã thử** — ô chưa nộp góp `0` vào cả hai |

Mỗi bài trong đề là **một ô riêng** (`cells`), theo đúng thứ tự người ra đề xếp.

⚠ Cả `scoreboard.ts` là **dữ liệu của người khác**. Đường vào duy nhất là `adminProcedure`, và
`exams/authz.integration.test.ts` gác điều đó bằng cách **duyệt bảng procedure lúc chạy** chứ
không bằng một lời hứa trong chú thích.

---

## 7. Xuất CSV — BOM UTF-8 là bắt buộc

⛔ **Excel trên Windows KHÔNG đoán UTF-8 cho file `.csv`.** Không có BOM thì nó đọc theo code
page của máy (1252 ở đa số máy Việt Nam) và mọi chữ có dấu vỡ thành ký tự lạ. **Không có lỗi
nào, file vẫn mở** — nên cách duy nhất phát hiện là có người nhìn vào và thấy "Nguyễn" thành
"Nguyá»…n".

Ba byte `EF BB BF` ở đầu file (`UTF8_BOM = '﻿'`) sửa hẳn chuyện đó, và chúng vô hại với
mọi thứ khác đọc CSV (LibreOffice, pandas, `csv` của Python đều nuốt BOM).

Hằng viết dạng thoát `'﻿'` chứ không dán ký tự thật: chính ký tự đó **vô hình trong nguồn**.

### Vì sao xuất CSV không phải một tiện ích

`exams.class_id` và `exams.owner_id` đều **cascade**. Nên **xoá lớp là xoá luôn điểm thi của
lớp đó**, và thứ bù lại KHÔNG phải một khoá ngoại mà là chính hàm này — đây là đường **duy
nhất** để điểm rời khỏi hệ thống trước khi dữ liệu biến mất. Muốn giữ điểm thì **xuất trước
khi xoá**.

Cascade là một lệch **có chủ ý** khỏi ghi chú bàn giao của lane 18.F, vốn đề nghị NO ACTION
với lập luận *"một kỳ thi là bản ghi lịch sử"*. Lập luận đó đúng về giá trị, nhưng thi hành
bằng NO ACTION **ở đây** đẻ ra một đường xoá hỏng: `classes.owner_id` đã là cascade từ 18.F,
nên xoá một tài khoản giảng viên sẽ cascade xuống `classes`, và lượt xoá lớp đó bị NO ACTION
của `exams` **CHẶN**. Kết quả là xoá một người dùng thất bại với một lỗi khoá ngoại thô, ở một
chỗ không ai đoán được — và nó chỉ xảy ra với **những giảng viên đã ra đề**.

### Quy ước định dạng

- **Mỗi bài là MỘT cột**, đúng thứ tự người ra đề xếp. Một cột gộp kiểu `"AC, WA (3/5), ..."`
  sẽ **không lọc được trong Excel**, và lọc theo bài chính là việc người chấm làm nhiều nhất.
- **Luôn bọc mọi ô trong ngoặc kép**, không chỉ bọc khi cần: quy tắc "chỉ khi cần" phải liệt
  kê đúng tập ký tự cần thoát, và tập đó khác nhau giữa các bản cài đặt. Bọc hết là một luật
  **không có ca biên**.
- Dấu nháy kép bên trong **nhân đôi** — cách thoát của chính RFC 4180, không phải backslash.
- **CRLF** giữa các dòng: RFC 4180 quy định thế, và Excel bản cũ trên Windows là bộ đọc kén
  nhất trong số những bộ đọc file này sẽ gặp.
- Cột "Tự nộp" có **ba** trạng thái, không phải hai: `có` / `không` / **ô trống**. Ô trống =
  lượt chưa khoá; ghi "không" ở đó sẽ khẳng định rằng người này đã nộp tay, trong khi họ vẫn
  đang làm bài.

Cột verdict dựng lại từ `(passed, total, solved, failCode)`: `failCode` khác `null` ⇒ `CE`;
`solved` ⇒ `AC`; còn lại `WA (n/m)`. Ô chưa nộp là chuỗi rỗng.

### Tên file

`csvFileName` bỏ dấu tiếng Việt và mọi ký tự Windows cấm — **không phải vì sợ Unicode**, mà vì
tên file đi qua header `Content-Disposition`, nơi ký tự ngoài ASCII cần mã hoá RFC 5987 và
không phải trình duyệt nào cũng làm đúng. **Nội dung bên trong vẫn giữ nguyên dấu.**

---

## 8. Bảng và cột

### `exams`

| Cột | Ghi chú |
|---|---|
| `id` | uuid |
| `class_id` → `classes` | **cascade** — xem §7 |
| `owner_id` → `users` | **cascade** |
| `problem_codes` | `text[]`, **thứ tự có nghĩa**, không có khoá ngoại |
| `duration_minutes` | `1..720` |
| `seed_strategy` | `pgEnum` — `fixed` \| `per-student` |
| `fixed_seed` | `null` khi `per-student` |
| `opens_at` | `null` = mở ngay |
| `closes_at` | `null` = không có hạn tuyệt đối |
| `created_at` | `precision: 3` — keyset |

### `exam_attempts`

| Cột | Ghi chú |
|---|---|
| **PK gộp** `(exam_id, user_id)` | một người một lượt |
| `seed` | **máy chủ cấp** — §4 |
| `duration_minutes` | **ảnh chụp**, không đọc lại từ `exams` — §2 |
| `started_at` | `precision: 3` |
| `submitted_at` | `null` = chưa bấm nộp. **KHÔNG** có nghĩa là "còn giờ" |

Chỉ mục `exam_attempts_user_idx` trên `user_id` phục vụ câu *"những kỳ thi người này đã vào"*
— khoá chính mở đầu bằng `exam_id` nên nó không phục vụ được chiều tra ngược.

---

## 9. Trạng thái ĐANG LÀM DỞ

Ghi ra vì một tài liệu mô tả thứ chưa tồn tại còn tệ hơn một tài liệu thiếu.

1. **Kỳ thi `per-student` chưa dùng được trên thực tế** (§4). Lược đồ, cổng và đường mở lượt
   đều đã có và đều đúng; thứ thiếu là một plugin khai `seedSpec`. Cho tới lúc đó mọi kỳ thi
   thật phải là `fixed`.
2. **Đề thi chỉ chứa được bài K8s.** Không phải giới hạn của chế độ thi mà của đường nộp bài:
   `submitProblem` ném khi `gameId !== 'k8s'` ([`oj-format.md`](oj-format.md) §15). Một đề
   chứa bài Git sẽ qua `composeIssues` (bài `published` là hợp lệ) rồi hỏng lúc sinh viên bấm
   nộp. **Cổng soạn đề không kiểm `gameId`**, và đó là một khoảng trống đang có, không phải
   một quyết định.
3. **Không có lưu trữ kỳ thi.** Xoá lớp là mất điểm; CSV là đường thoát duy nhất (§7). Nếu sau
   này cần lưu trữ thật (bảng `exam_archive`, hoặc xoá mềm) thì `schema.ts` § `exams` là chỗ
   đọc trước khi đổi.

---

## 10. Verify commands

```bash
# Đồng hồ, cổng soạn đề, cổng nộp, CSV — đều là hàm thuần
pnpm --filter @devops-platform/web test exams

# Đếm ngược phía client
pnpm --filter @devops-platform/web test countdown
```

⚠ **Không thêm `--` trước tên filter.** `pnpm --filter <gói> test -- exams` truyền `--` sang
vitest như một filter nữa, nên lệnh thành `vitest run "--" "exams"` và nó chạy **toàn bộ**
suite thay vì lọc. Đo 2026-09-15: bản có `--` chạy 183 file. Nó không báo lỗi, chỉ chạy lâu
hơn hai bậc và trả lời một câu hỏi khác câu bạn hỏi.
