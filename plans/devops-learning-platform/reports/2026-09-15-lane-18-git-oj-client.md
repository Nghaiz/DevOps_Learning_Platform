# Lane 18.E — nửa CLIENT của chế độ chơi bài OJ cho game Git

**Ngày:** 2026-09-15 · **Nhánh:** `feat/p18-oj-exam` · **Phạm vi:** khối 4 của
`phase-18-exec.md` §2, nửa CLIENT.

Ba commit: `9fe0d21` (chế độ chơi bài), `7a0e4dc` (bật đường xem trước),
`292c11b` (sửa một ô gác mà chính tôi vừa làm cho mù). SHA có thể lệch sau
rebase — tra bằng `git log --oneline` trên nhánh.

---

## 1. ⛔ Phát hiện quyết định hình dạng của lane, đọc trước mọi thứ khác

Brief giao "nạp bài từ máy chủ, dựng `GitLevel` theo hợp đồng, chấm theo
testcase, nộp". Hợp đồng điểm 2 viết *"`objectives` dựng từ `problem.testcases`"*.
**Đường dây không chở thứ cần để làm việc đó.**

`server/problems/testcases.ts` § `toTestcaseTeasers` cắt `check` và `args` của
**MỌI** testcase trước khi dữ liệu rời máy chủ — kể cả testcase hiện, kể cả với
tác giả bài. Đó là §18.B.4 và khối chú thích của nó nói rõ đây là chốt chặn thật:
*"nhãn là đề bài; tên vị từ và tham số là cách chấm, và cách chấm không phải thứ
người làm cần để làm bài."*

Chuỗi hệ quả, không tránh được:

| Bước | Hệ quả |
|---|---|
| Client không có `check` | `evaluatePredicate` là `switch` không có `default` ⇒ mọi vị từ trả `undefined` |
| Mục tiêu không bao giờ đạt | `session.getStatus().objectivesMet` luôn rỗng |
| Lời khai rỗng | `verifyRun` so `claimed.objectivesMet` với bản phát lại ⇒ `khong-khop` |
| `khong-khop` | `gradeSubmission` trả **`CE`**, `score: 0`, `solved: false` |

Tức một client chỉ có `problems.byCode` **không nộp bài được**, và nó hỏng theo
đúng kiểu hợp đồng cảnh báo: *"mọi lượt nộp hợp lệ đều bị từ chối, và triệu
chứng đọc ra như một hệ thống từ chối người chơi ngẫu nhiên."*

**Đường duy nhất chở đủ dữ liệu hôm nay là `problems.forEdit`** —
`authorProcedure` + cổng chủ sở hữu, trả `StoredProblem` đầy đủ. Nên chế độ NỘP
BÀI hiện mở cho **tác giả bài và admin**; người học vẫn mở bài, đọc đề, gõ lệnh
trên đúng thế giới của bài, nhưng nút nộp tắt và **màn hình nói ra lý do** thay
vì bấm được rồi trả `CE`.

Ba lý do chọn hình dạng này thay vì nộp một lời khai rỗng:

1. Một nút nộp dẫn tới `CE` cho lượt chơi ĐÚNG là lỗi của ta đọc ra như gian lận
   của người dùng — thứ đắt nhất để chẩn đoán từ phía hỗ trợ.
2. Đường xem trước (`problemPreviewHref`, việc thứ ba của brief) phục vụ **tác
   giả**, và đó chính là tập người dùng có đủ dữ liệu. Ô nghiệm thu khối 5 —
   *"bài lưu ra mở được ở `/games/git?problem=` và chơi được"* — đóng được ngay.
3. Mọi bài trong DB hôm nay là K8s (`DEFAULT_AUTHOR_GAME` ghi vậy), nên tập
   người học mở bài Git hiện là rỗng. Khe này chưa chặn ai, nhưng nó sẽ chặn
   đúng lúc bài Git đầu tiên xuất bản.

**Chỗ sửa nằm ở `apps/web/src/server/**`, ngoài quyền ghi của lane.** Xem §7.

## 2. Cái giá của hình dạng đó, nói thẳng

Màn bài gọi **hai** truy vấn: `byCode` (thân bài, cho mọi người) và `forEdit`
(cách chấm, `retry: false`). Một người học vì thế trả thêm **một vòng 403 mỗi
lần mở bài**. Chấp nhận tường minh: đường còn lại là một lời nói dối trên màn.
Khi máy chủ có đường trả cách chấm cho người đang làm bài thì query thứ hai
**biến mất**, không phải được vá.

Phiên chỉ được dựng sau khi **cả hai** truy vấn ngã ngũ. Phiên giữ trong `useRef`
suốt lượt chơi, nên dựng lúc `forEdit` còn đang bay sẽ khoá level ở trạng thái
không có `check` **kể cả khi dữ liệu về sau đó** — một tác giả rơi vào nhánh
người học vì một cuộc đua mạng, không dấu hiệu nào trên màn.

---

## 3. Hợp đồng sáu điểm — đã khớp, và đo bằng SỐ

`problem-level.ts` là bản dựng level phía client, đối xứng với `problemAsGitLevel`.
Từng điểm có ô gác riêng:

| # | Điểm | Ở đâu |
|---|---|---|
| 1 | `GitLevel.id` = `problem.code` | `gitOjLevel`, ô `id level LÀ mã bài` |
| 2 | `objectives` từ `testcases`, `required: true` | ô `objectives dựng từ testcases` |
| 3 | `allowedCommands: null` | ô `toBeNull`, **không** `toHaveLength(0)` |
| 4 | `seed` là số THẬT (`GIT_UNSEEDED_REPLAY_SEED = 1`) | `getLog()` chở sẵn; ô kiểm cả `log.seed` lẫn `claim.seed` |
| 5 | `gameId: 'git'` ở gốc `runLog` + `claimed` | khai tường minh ở `git-problem.tsx`; action thừa kế ở tầng schema |
| 6 | Điểm khớp `scoreProblemRun` | ô đòi **350** (nửa-giải) và **1000** (trọn-vẹn) |

Điểm 6 là vế đắt nhất và nó được đo chứ không được hứa: ô gác ép bản dựng
CLIENT qua **chính fixture JSON** mà `git-replay.test.ts` của lane máy chủ dùng,
rồi đòi ra đúng hai con số lane đó đo được. Hai số viết thành hằng, không gọi
lại `scoreProblemRun` tại chỗ — tính lại bằng chính hàm cổng đang dùng là một ô
tự điều chỉnh, xanh kể cả khi công thức đổi.

### Hai chỗ CỐ Ý khác đấu trường K8s

**`commandsUsed`/`hintsUsed` đếm từ `tallyLog(log)`, không từ `status`.**
`buildRunResult` của K8s lấy `status.movesUsed`. `verifyRun` so lời khai với
`tallyLog(log)` — với chính nhật ký. Hai con số đồng nghĩa do hai đoạn mã tính
là hai cơ hội lệch; đếm từ nhật ký thì hai bên cùng đọc một mảng.

**`score` gọi `scoreProblemRun`, không gọi `computeScore`.** `computeScore` trừ
điểm gợi ý theo tỉ lệ `hintsUsed/hintsAvailable`; `scoreProblemRun` truyền 0/0
vào đó rồi trừ thẳng `penaltyPoints`. Hai công thức ra hai số **ngay khi bài có
gợi ý**, và máy chủ dùng cái thứ hai. Đấu trường K8s hôm nay dùng cái thứ nhất —
xem §7 món (2).

---

## 4. Quyết định kiến trúc, và cái giá từng cái

**`GitLevelScreen` tách khỏi `git-game.tsx`.** Không vì file dài, mà vì một
ràng buộc cơ học: chế độ OJ phải dùng LẠI đúng màn chơi đó (một bản sao làm câu
"bài này chơi được" chỉ đúng với bản sao), mà `git-game.tsx` là chỗ chọn giữa ba
đường vào — để chung một file là một vòng import. Giá: một lượt di chuyển 300
dòng trên cây dùng chung. `builder-promises.test.ts` (file lane kia giữ) đòi
`git-game.tsx` chứa `<GitLevelScreen … trial={` — call site đó **ở lại**, nên ô
đó không bị chạm. `objective-source.test.ts` (của lane này) phải đổi đích, và
lý do được ghi trong chính nó: để nguyên đích cũ thì vế `not.toMatch` xanh vĩnh
viễn trên một tập rỗng.

**Provider tRPC sống trong cây con OJ, nạp bằng `next/dynamic`.**
`app/games/layout.tsx` CỐ Ý không cấp `TrpcQueryProvider` và nói rõ vì sao: game
phải chạy với 0 lời gọi backend trong lúc chơi (AC-2, đo bằng network trace).
Sửa layout là phá ô đó cho cả trụ cột. Chế độ làm bài thì ngược lại — nó không
chạy được nếu không gọi máy chủ. Nên provider ở đúng cây con này, và `git-game`
nạp nó bằng `next/dynamic` để tầng mạng không vào bundle của người chơi level.

⚠ **AC-2 vẫn đúng cho `/games/git` không có `?problem=`; nó KHÔNG còn đúng cho
`/games/git?problem=`**, theo định nghĩa. Ai đo AC-2 bằng Playwright phải đo
đường không có tham số.

**Ba trạng thái mục tiêu, không hai.** Khi engine không chấm được, danh sách
mục tiêu hiện `•` + `sr-only "chấm ở máy chủ"`, và dòng verdict của engine bị
**giấu hẳn**. `☐` khẳng định *"chưa đạt"*, và trong ngữ cảnh này lời khẳng định
đó SAI theo kiểu người chơi tin được — họ sửa bài mãi vì màn hình nói họ chưa
đạt. Một `0/n` từ engine cũng vậy.

**Ghép `check` theo `id`, không theo chỉ số.** Hai truy vấn riêng, không gì bảo
đảm thứ tự; ghép theo vị trí sẽ gán `check` của testcase này cho nhãn của
testcase kia — im lặng, và bài vẫn chấm được (sai).

**Không thêm khoá copy nào.** `packages/copy/src/surfaces/catalog.ts` là surface
của lane này nhưng `ui-source-coverage.test.ts` chỉ quét năm thư mục và
`components/games` không nằm trong đó — toàn bộ `git-game.tsx`/`git-sandbox.tsx`
hiện dùng chữ tiếng Việt nội tuyến. Thêm khoá cho riêng màn này là để game Git
nói bằng hai giọng. Không đụng `catalog.ts` ⇒ không chạm cổng rule-of-three.

---

## 5. Ô gác — bốn lượt phá, kết quả đo được

`problem-level.test.ts`, 10 ô, **10/10 xanh**. Chạy ở env node (file không khai
docblock jsdom), fixture là CHUỖI JSON đi qua `JSON.parse` — cùng hai vế kỷ luật
lane máy chủ đã thi hành.

| Phá gì | Ô đỏ |
|---|---|
| `allowedCommands: null` → `[]` | **3** đỏ: ô `toBeNull`, cộng CẢ HAI ô điểm |
| `id: problem.code` → một hằng riêng | **2** đỏ: ô id, cộng ô `log.levelId` |
| `gitOjGradable` luôn `true` | **2** đỏ: ô "bài đã che check", ô "bài không testcase" |
| Route thôi đọc tham số (sau khi sửa §6) | **2** đỏ ở `arena-preview.test.ts` |

Khôi phục sau mỗi lượt ⇒ `git diff --stat` rỗng, suite xanh lại.

Lượt (1) đáng đọc kỹ: `[]` làm đỏ **cả hai ô điểm**, vì cấm mọi lệnh ⇒ không mục
tiêu nào đạt ⇒ điểm khác. Đúng cái bẫy hợp đồng mô tả ("trượt trong im lặng"),
và ô bắt nó ở hai đường độc lập.

---

## 6. ⛔ Chú thích của chính tôi làm một ô gác mù, và nó suýt lọt

`arena-preview.test.ts` dò bằng **chuỗi trên toàn văn bản** `page.tsx`. Chú
thích tôi vừa viết ở đó nhắc `params.problem` nguyên văn để giải thích ô gác —
và **chính nó thoả phép dò**. Đối chứng dương đầu tiên (gỡ phép đọc thật khỏi
route) cho **5/5 XANH**.

Không có bước đối chứng thì lane này giao một ô gác không bao giờ đỏ được, kèm
một commit message nói rằng nó gác. Đó là `rules/green-that-proves-nothing.md`
đúng dạng "output format không chở nổi tín hiệu", và nó là chiều NGƯỢC của lời
cảnh báo `objective-source.test.ts` đã ghi ("một ô đỏ vì nhắc tên vấn đề trong
chú thích là một ô đỏ vì lý do sai") — chiều này tệ hơn vì không có gì đỏ để mà
chú ý.

Sửa ở `292c11b`: chú thích không nhắc tên tham số nguyên văn nữa, và nói ra lệnh
cấm đó cho người sau. Đo lại: gỡ phép đọc ⇒ 2 ô đỏ; khôi phục ⇒ 5/5 xanh.

---

## 7. Phép đo cuối

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @devops-platform/web typecheck` | **0** (chạy LẠI sau lần sửa cuối) |
| `pnpm --filter @devops-platform/web lint` | **0** (chạy riêng, không chỉ typecheck) |
| `pnpm --filter @devops-platform/web test` | 205 file / **2421 ô**, 1 đỏ — xem dưới |
| `problem-level.test.ts` | **10/10** |
| `arena-preview.test.ts` | **5/5** |
| `pnpm --filter @devops-platform/copy test` | 1 đỏ — **không phải của lane này**, xem dưới |

### Hai ô đỏ, cả hai đến từ ngoài lane

**(a) Đỏ của suite web đổi chỗ giữa hai lượt chạy.** Lượt 11:21 đỏ
`server/exams/authz.integration.test.ts`; lượt 11:28 ô đó xanh và đỏ
`security/sandbox-token-cookie.test.ts` ở **15026ms** — một lượt hết giờ. Chạy
riêng: exams **22/22**, sandbox **20/20**. Diff của lane chạm **0** file dưới
`src/server/` và `src/security/`. Đây là tranh chấp tài nguyên dưới tải song
song, không phải hồi quy.

**(b) `copy` đỏ vì 13 khoá chết `author.builder.save.*`** — surface `author.ts`,
namespace của Builder, và `git status` lúc đó cho thấy lane kia đang ghi dở
`builder/save-problem-panel.tsx` + `surfaces/author.ts`. Lane này thêm **0**
khoá copy.

⚠ **Mọi con số trên đo lúc lane kia đang sửa dở cây dùng chung**, nên chúng nói
về trạng thái lúc 11:21–11:31 chứ không về trạng thái đã commit. Bài học #3 của
fan-out (`phase-18-exec.md` §3.1) áp đúng ở đây.

---

## 8. CÒN HỞ

1. **Nộp bài chỉ mở cho tác giả/admin** — §1. Chỗ sửa: một đường máy chủ trả
   `check`/`args` cho người đang làm bài, hoặc (tốt hơn) một đường chấm thử ở
   máy chủ để client không bao giờ cầm cách chấm. Cái thứ hai giữ được §18.B.4
   nguyên vẹn; cái thứ nhất phá nó.
2. **`buildRunResult` của đấu trường K8s dùng `computeScore`, không dùng
   `scoreProblemRun`.** Hai hàm ra hai số ngay khi bài có gợi ý được mở ⇒ mọi
   lượt nộp K8s của bài có gợi ý sẽ `CE`. Chưa cắn ai vì đường OJ của K8s chưa
   chạy được (món 3), nhưng nó sẽ cắn đúng lúc món 3 được sửa. File
   `components/k8s-arena/run-result.ts`, ngoài lane.
3. **Đường OJ của K8s hôm nay KHÔNG chạy được, hai lỗi độc lập.**
   (a) `arena-entry.tsx` ở chế độ `problem` vẫn chọn một level trong `LEVELS`,
   nên `log.levelId` không bao giờ khớp `expectedLogLevelId(problem)` ⇒
   `BAD_REQUEST`. (b) `use-problem-submit.ts` gọi `api.*` trong khi
   `app/games/layout.tsx` không cấp `TrpcQueryProvider` ⇒ ném lúc chạy. Đo
   2026-09-15. Cả hai ngoài lane.
4. **`problem-overview.tsx` gắn cứng `/games/k8s?problem=`** cho MỌI bài, nên
   một bài Git từ trang `/problems/[code]` mở sang đấu trường K8s. Nay đã có
   `problemPreviewHref('git', …)` để dùng. File thuộc `(session)/problems/**`
   (lane D), ngoài lane này.
5. **Chú thích của `arena-preview.tsx` nay SAI**: nó viết *"`/games/git` chỉ đọc
   `?level=`"*. File đó không nằm trong danh sách sở hữu của lane (chỉ
   `game-plugin-view.ts` và `arena-preview.test.ts` là), nên không sửa. Ba dòng.
6. **Gợi ý trong chế độ OJ chưa nối.** Cố ý: gợi ý OJ có giá và phải đi qua
   mutation `problems.revealHint` (ghi bảng `problem_hint_reveals`), không phải
   `session.revealHint` cục bộ. `gitOjClaim` đã tính `revealedHintIds` là HỢP
   hai nguồn nên phần khó đã sẵn sàng; còn thiếu nút bấm và lượt gọi.
   ⚠ Kèm một bẫy: `toAuthorProblem` đặt `revealed: true` cho MỌI gợi ý của tác
   giả bất kể bảng, nên một tác giả nộp bài của mình mà bài có gợi ý tính điểm
   sẽ khai điểm thấp hơn máy chủ ⇒ `CE`. Bài không gợi ý không chạm phải; bài
   do Builder dựng hôm nay không có gợi ý.
7. **Chưa có ô gác đi qua HTTP thật cho đường client.** Cùng lý do lane máy chủ
   ghi: một ô integration commit vào mà chưa từng thấy nó xanh là một lời khai.
   Postgres đang chạy trên máy này, nên món đó mở được — hết ngân sách lượt.

## 9. Cần lead

- Quyết §8 món (1): đường máy chủ nào mở cho người học nộp bài Git. Đây là chốt
  chặn duy nhất giữa "tác giả xem trước được" và "người học làm bài được".
- Món (2) và (3) là hồi quy đã nằm sẵn trên đường K8s, không phải việc lane này
  gây ra — nhưng chúng cùng một họ với việc lane này vừa làm, nên sửa một lượt
  thì rẻ hơn.
- Món (4) + (5) là hai sửa nhỏ ở file của lane khác.
- Không thêm migration nào, và lane này cũng không kết luận là cần cột mới.
