# Lộ trình học

SSOT của lộ trình (P10 — 10.A/10.E). Khi tài liệu này và mã nguồn bất đồng, mã nguồn thắng và tài liệu này là bug.

| Thứ | Ở đâu |
|---|---|
| DTO | `packages/shared-types/src/path.ts` |
| Luật mở khoá (thuần) | `packages/scenario/src/path-progress.ts` |
| Nguồn tiến độ | `apps/web/src/server/paths/progress.ts` |
| Bảng | `apps/web/src/server/db/schema.ts` § "LỘ TRÌNH + QUIZ" |
| Router | `apps/web/src/server/trpc/routers/paths.ts` |

## ⛔ Ranh giới — đọc trước mọi thứ khác

Một "lộ trình" (hay "khoá học") ở đây **chỉ là cách nhóm nội dung**: một danh sách có thứ tự.

**Không** `price`, **không** `sku`, **không** `entitlement`, **không** `is_paid`, **không** giỏ hàng, **không** paywall, **không** chứng chỉ-như-hàng-hoá, **không** bảng `enrollments` mang trạng thái thanh toán.

Quyền truy cập vẫn chỉ là **đăng nhập**. `protectedProcedure` là toàn bộ cổng, và không có cổng thứ hai nào kiểm "đã mua chưa".

> Nếu một task bắt đầu cần một trong những thứ trên — **dừng lại và hỏi chủ dự án.** Đó là ranh giới, không phải chi tiết.

Ranh giới này được gác ở ba tầng, không chỉ bằng lời: chú thích ở đầu `paths.ts` và trong `schema.ts`; một test hợp đồng khẳng định **không procedure nào** của `paths.*`/`quiz.*` nhận được field `price`/`sku`/`entitlement`/`isPaid`/`subscription` (`quiz-paths-input.test.ts`); và một lượt `grep` trong AC.

## Ba loại item, và loại thứ tư cố ý vắng mặt

`PATH_ITEM_KINDS = ['lesson', 'lab', 'quiz']`.

⚠ Khác `CONTENT_KINDS` (`lesson | lab | playground`) một cách có chủ ý:

- **`playground` không có** — một sân chơi tự do không có trạng thái "đạt", nên nó không xếp vào một chuỗi tuần tự được.
- **`quiz` có** — nó không phải một `content_items.kind` (xem `docs/quiz-format.md`).

Hai bộ từ vựng gần giống nhau nhưng trả lời hai câu hỏi khác nhau; gộp chúng sẽ ép một trong hai phải nói dối.

## Một item nằm được ở nhiều lộ trình

Không có unique trên `item_id` toàn cục. Nhưng **lặp lại chính nó trong cùng một lộ trình** thì bị chặn (`learning_path_items_path_item_key`): người học "đạt" nó một lần là đạt cả hai chỗ, nên mắt xích thứ hai không đo thêm gì.

`ordinal` cũng unique theo lộ trình — hai item cùng số là một thứ tự không xác định, và luật tuần tự khi đó phụ thuộc vào thứ tự Postgres trả về, tức vào may rủi.

## Luật mở khoá

**Mặc định là học tự do** (`sequential = false`). Trên lộ trình tự do không item nào bị khoá.

Khi `sequential = true`: **item N mở khi N−1 đạt**, và một item chưa đạt khoá **mọi** item phía sau — không chỉ item liền kề. Luật "chỉ khoá item liền sau" cho phép nhảy cóc qua một mắt xích bằng cách bỏ dở nó, tức là luật tự vô hiệu hoá chính mình.

Item **đã đạt** luôn hiện `passed`, kể cả khi item trước nó chưa đạt. Chuyện đó xảy ra thật khi tác giả **bật** `sequential` trên lộ trình người ta đã học dở — hiện đúng thứ đã xảy ra, không viết lại lịch sử. Biến một item đã đạt thành "khoá" là cách nhanh nhất để người học tin hệ thống mất tiến độ của họ.

### Luật chạy Ở SERVER, và ổ khoá là ổ khoá thật

`viewPathItems` được gọi ở **hai** chỗ:

1. `paths.get` — để vẽ ổ khoá cho UI.
2. `paths.openItem` — để **chặn** khi người học thật sự mở item đó.

Chỉ dùng ở (1) thì ổ khoá là một hình vẽ: bất kỳ ai gõ thẳng URL đều vào được. Đó chính là hình dạng lỗi "kiểm ở client" mà bảng rủi ro P10 xếp score 12.

### ⚠ Phạm vi của ổ khoá — nói thẳng vì nó dễ bị đọc rộng hơn thực tế

**Khoá là thuộc tính của một LỘ TRÌNH, không phải của bài.**

- Cùng một lab nằm ở hai lộ trình có thể bị khoá ở lộ trình này và mở ở lộ trình kia.
- Một bài truy cập trực tiếp qua `/lessons/<id>` (ngoài mọi lộ trình) **vẫn mở**.

Điều `paths.openItem` bảo đảm: **không có đường nào đi *qua lộ trình* để lấy một item đang khoá**, kể cả khi client bỏ qua giao diện và gọi thẳng API. Luật được tính lại ở server từ tiến độ thật, không đọc bất cứ thứ gì client gửi.

Điều nó **không** bảo đảm: khoá toàn cục cho một bài. Đó là hành vi đúng — học tự do là mặc định của cả hệ thống — nhưng nó là một giới hạn có thật, không phải một chi tiết bị bỏ sót.

## "Đạt" nghĩa là gì

| kind | đạt ⇔ | nguồn |
|---|---|---|
| `lesson` | `progress.completed_at IS NOT NULL` | `progress` |
| `lab` | **có ít nhất một** lượt đã nộp đạt `lab.passThresholdPercent` | `lab_attempts` + `lab_task_results` |
| `quiz` | **có ít nhất một** lượt nộp đạt `quiz.passThresholdPercent` | `quiz_attempts` + `quiz_answers` |

"Có ít nhất một" chứ không phải "lượt gần nhất": làm lại một lab đã đạt rồi bỏ dở không được biến nó thành chưa-đạt, nhất là khi nó đang mở khoá item kế tiếp.

Khoá tra cứu là cặp **`kind:itemId`**, không phải `itemId` đơn — một lesson và một quiz được phép trùng slug (hai bảng khác nhau, không ràng buộc nào cấm), và dùng riêng `itemId` sẽ khiến "đã đạt lesson X" mở khoá luôn "quiz X" trong im lặng.

## Không lưu field suy ra được

⛔ `learning_paths` **không** có `item_count`, `total_minutes`, `completion_percent`. ⛔ `learning_path_items` **không** có `title`, **không** có `passed`/`completed`.

- Ba cột đầu đếm/cộng được từ `learning_path_items` và từ tiến độ từng item. Chúng vẫn xuất hiện trong **DTO** — tính ở chỗ truy vấn, cùng khuôn `authoringItemSchema.stepCount`. **Cấm là cấm lưu, không phải cấm tính.**
- `title` thuộc về bài, và tác giả bài sửa được nó. Chép vào đây là dựng bản sao thứ hai không có cách nào biết mình đã cũ.
- Tiến độ thuộc về **cặp** (người học, item), không thuộc về mắt xích — và nó đã có ba nguồn ở bảng trên.

⛔ **Cố ý không có bảng `path_progress`.** Nó sẽ là bản sao thứ tư của một sự thật đã có ba nguồn, và nó lệch ngay lần đầu tiên có người làm lại một lab — trừ khi ta viết thêm cơ chế đồng bộ, tức là thêm chỗ để sai.

### Cái giá, và vì sao chấp nhận được

Một lộ trình N item cần nạp N DTO bài để biết mốc đạt của từng cái. `paths.get` cap danh sách ở **100** (luật 4), nên N bounded; nguồn đĩa cache cả vòng đời tiến trình. Nếu về sau một lộ trình 100 item thành đường nóng thật, chỗ tối ưu là **gộp truy vấn** — không phải thêm một cột `passed`.

## Mắt xích thủng hiện ra, không bị giấu

`learning_path_items.item_id` **không có foreign key**, vì ba lý do độc lập:

1. `lesson` có thể tới từ **đĩa** (`content/scenarios/**`), không phải bảng nào.
2. `quiz` nằm ở `quizzes` còn `lab` ở `content_items` — một FK không trỏ được vào hai bảng.
3. Bài bị archive vẫn phải giữ được mắt xích để người soạn thấy lộ trình đang thủng.

Cái giá: một id gõ sai không bị DB chặn. Nên nó **hiện ra** ở DTO với `title: null` và một dòng "Không nạp được nội dung này", thay vì bị lọc đi im lặng.

Cùng lý do, `paths.publish` **không** kiểm rằng mọi item nạp được: một bài bị archive sau khi lộ trình lên là chuyện xảy ra thật, và chặn xuất bản vì nó sẽ biến lỗi của người khác thành cửa chặn của tác giả này.

## Nhãn tiến độ chỉ được nói thứ nó biết

⚠ **Bẫy đã trả giá ở P2**: một nhãn tiến độ từng nói `"4/4 bước"` dựa trên đúng một lượt chấm.

Hệ thống biết đúng ba điều, và trang "của tôi" không nói gì hơn:

- lộ trình nào đang dở (đã đạt ≥1 phần, chưa đạt hết);
- đã đạt bao nhiêu phần trên bao nhiêu (`passedCount` / `itemCount`);
- phần nào nên làm tiếp (`nextItemId`).

Nó **không** biết người học đã bỏ ra bao lâu, học gần nhất ngày nào, hay còn bao nhiêu phút nữa. Không field nào trong `learningPathDetailSchema` cho phép một nhãn khẳng định những điều đó — ràng buộc nằm ở hình dạng DTO, không ở kỷ luật của người viết FE.
