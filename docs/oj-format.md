# Định dạng bài OJ và hợp đồng plugin theo game

SSOT của hệ bài tập kiểu OJ (P18 — 18.A/18.B/18.C/18.D). Khi tài liệu này và mã nguồn
bất đồng, **mã nguồn thắng và tài liệu này là bug**.

| Thứ | Ở đâu |
|---|---|
| Hợp đồng miền, không phụ thuộc game | `packages/games/src/core/problem.ts` |
| Hợp đồng plugin | `packages/games/src/core/problem-plugin.ts` |
| Plugin K8s | `packages/games/src/k8s/problem-plugin.ts` |
| Plugin Git | `packages/games/src/git/problem-plugin.ts` |
| DTO của kho lưu | `apps/web/src/server/problems/dto.ts` |
| Biên GHI (Zod) | `apps/web/src/server/problems/validate.ts` |
| Cổng xuất bản | `apps/web/src/server/problems/publish-gate.ts` |
| Biên đọc testcase + phép che | `apps/web/src/server/problems/testcases.ts` |
| Phép che gợi ý | `apps/web/src/server/problems/solver.ts` |
| Chấm lại phía máy chủ | `apps/web/src/server/problems/submit.ts`, `replay.ts` |
| Bảng | `apps/web/src/server/db/schema.ts` § `problems`, `problem_submissions`, `problem_hint_reveals` |

Đọc cùng [`docs/quiz-format.md`](quiz-format.md) và [`docs/lab-format.md`](lab-format.md):
ba loại nội dung này có chung kỷ luật "không lưu field suy ra được" và chung cách tách
đường-người-học khỏi đường-người-soạn, nhưng chúng trả lời ba câu hỏi khác nhau.

---

## 1. Ba khái niệm cạnh nhau, rất dễ lẫn

Bảng này chép từ khối mở đầu `core/problem.ts` vì nó là thứ phải đọc trước mọi thứ khác:

| Khái niệm | Có dạy không | Chấm bằng gì | Ở đâu |
|---|---|---|---|
| `Level` | **CÓ** | vị từ trên thế giới mô phỏng | `packages/games/src/*/levels/` |
| `Problem` | **KHÔNG** | testcase trên thế giới mô phỏng | DB (`problems`) |
| `Lab` | **KHÔNG** | `verify.sh` trong sandbox THẬT | `packages/scenario` |

Một bài OJ **không dạy**. Đó không phải một nhận xét về giọng văn mà là một ràng buộc có
số: `statement` có trần cứng **150 từ**, gác bằng mã ở `publish-gate.ts`
(`STATEMENT_MAX_WORDS`), không bằng lời khuyên. Con số là phản ứng đo được với `Level` —
brief trung bình 189 từ cộng primer 193 từ bắt người chơi đọc ~382 từ trước lệnh đầu tiên.

---

## 2. HAI thang độ khó, cố ý khác nhau — đừng ánh xạ ngầm

Đây là chỗ sai đầu tiên mà một người mới đọc hệ này sẽ mắc, nên nó đứng trước mọi thứ khác.

| Hằng | Giá trị | Dùng cho |
|---|---|---|
| `PROBLEM_DIFFICULTIES` (`core/problem.ts`) | `easy` `medium` `hard` `expert` — **bốn** | bài OJ |
| `Difficulty` (`core/types.ts`) | `basic` `intermediate` `advanced` — **ba** | level của game |
| `SCENARIO_DIFFICULTIES` (`packages/scenario`) | `beginner` `intermediate` `advanced` — **ba** | lesson / lab |

Ba thang cùng tồn tại trong repo này và **không thang nào là bản đổi tên của thang kia**.
Lý do bốn bậc cho OJ: bài lab và level là nội dung dạy nên ba bậc là đủ; một OJ thì cần
tách "khó" khỏi "rất khó", vì đó là ranh giới người dùng dựa vào để chọn bài kế tiếp.

⛔ **TUYỆT ĐỐI không ánh xạ ngầm.** Chỗ nào cần đổi qua lại thì viết hàm đổi tường minh và
đặt tên nói rõ nó làm mất thông tin. Trong repo có đúng một hàm như vậy:

```ts
// apps/web/src/server/problems/replay.ts
problemDifficultyToLevelDifficultyLossy(difficulty: ProblemDifficulty): Difficulty
```

`hard` và `expert` gộp lại thành `advanced`, và phép gộp đó **không đảo ngược được**. Hàm
này chỉ dùng cho `Level` tổng hợp phục vụ phát lại — **không** dùng để hiển thị, để lọc,
hay để lưu. Ở những chỗ đó bốn bậc là bốn bậc.

---

## 3. Objective = Testcase (quyết định #20)

> **Verdict `AC` chỉ khi qua HẾT. Không thì `WA (n/m)`.**

`Testcase` (`core/problem.ts`) mang đúng năm trường:

```ts
interface Testcase {
  readonly id: string;
  readonly label: string;                              // tiếng Việt, một câu, nói phải ĐẠT gì
  readonly check: string;                              // tên vị từ, tập hợp lệ do plugin khai
  readonly args?: Readonly<Record<string, unknown>>;
  readonly visible: boolean;                           // §5
}
```

### Hai thứ cố ý KHÔNG có, và cả hai là lựa chọn

- **Trọng số.** Chủ dự án bỏ khái niệm đó tường minh. Thêm lại một `weight` là làm hỏng
  chính định nghĩa verdict — với trọng số thì "qua 4/5" không còn nói lên điều gì, vì 4
  case nhẹ khác 4 case nặng. Đây là chỗ `Testcase` **khác** `LabTask`, vốn CÓ `weight`
  (xem [`lab-format.md`](lab-format.md) §1.4): lab chấm theo phần trăm trọng số, OJ chấm
  theo "qua hết hay chưa".
- **`required`.** `Objective` của LEVEL có `required: boolean` để tách mục tiêu thưởng khỏi
  mục tiêu chặn. Một testcase thì **luôn** chặn — đó là nghĩa của `AC`. Ai muốn "mục tiêu
  thưởng" trong một bài OJ đang muốn một thứ khác (bậc sao theo `parMoves`), và thứ đó đã
  có chỗ riêng.

`Objective` ở `k8s/contract.ts` **không** bị thay thế — level vẫn dùng nó. Hai kiểu sống
cạnh nhau vì chúng trả lời hai câu hỏi khác nhau.

### Verdict — ba giá trị, không hơn

`PROBLEM_VERDICTS = ['AC', 'WA', 'CE']`, và phép suy là **một hàm thuần duy nhất**:

```ts
problemVerdictOf(passedCount, total)   // total <= 0 ⇒ 'CE'; passed >= total ⇒ 'AC'; còn lại 'WA'
```

Cả client (hiện ngay) và server (chấm lại) đều gọi **chính hàm này**. Đó là điều làm phép
so verdict hai bên có nghĩa: nếu hai bên dùng hai phép suy khác nhau thì một lệch nhau nói
về hai hàm chứ không nói gì về lượt chơi.

`total <= 0 ⇒ CE`, không phải `AC`. "Qua hết 0 testcase" đúng về logic và sai về nghĩa —
nó sẽ phát `AC` cho mọi lượt nộp vào một bài soạn dở.

⚠ **Cố ý KHÔNG có `TLE`/`RE`/`MLE`** như một OJ chấm code. Game chạy trong trình duyệt trên
một thế giới mô phỏng: không có tiến trình để hết giờ, không có bộ nhớ để tràn.

⚠ Tên là `ProblemVerdict`, **không** phải `Verdict`. Cái tên trần đó đã có chủ:
`git/predicates.ts` khai `Verdict` là một *object* `{ accepted, passedCount, totalCount,
failedIds, bonusMet }` cho kết quả chấm một LEVEL Git. Hai khái niệm thật sự khác nhau.

### Điểm KHÔNG được lưu

Điểm là `passed.length / total`, **tính ở chỗ dùng** — quy ước No Derived Fields của repo
(`rules/code-conventions.md`). `Submission` của hợp đồng không có cột điểm, và có một ô
nghiệm thu đo tận nơi bằng grep.

⚠ `total` thì **khác**, và nó KHÔNG vi phạm quy ước trên — đọc kỹ chỗ này vì vế
suy-ra-được hay nấp cạnh vế hợp lệ. `total` **không** suy được từ bài lúc đọc ra, vì bài có
thể đã bị sửa sau lượt nộp. Nó là một **sự thật lịch sử**: *"lúc nộp, bài có bấy nhiêu
testcase"*. Không chốt lại tại thời điểm nộp thì một lượt `WA (4/5)` hôm nay tự đọc thành
`WA (4/7)` sau khi tác giả thêm hai case, và cả lịch sử làm bài của mọi người lặng lẽ đổi
nghĩa. `passed` cũng vậy — và nó lưu **id**, không lưu chỉ số: chỉ số vỡ khi tác giả kéo
một dòng lên trên.

---

## 4. `Submission.seed` là số THẬT mang theo lượt nộp

Đây là một lỗi thiết kế **đã được sửa** (2026-09-14, `ae7ed23`), và nó phải nằm trong tài
liệu vì hình dạng cũ trông hợp lý hơn hình dạng đúng.

Bản đầu khai `seed: number | null`, với `null` nghĩa là "bài không seedable". Engine thì
**bắt buộc** nhận một số để dựng trạng thái đầu, nên `null` buộc mỗi plugin tự công bố một
hằng "không-seed" của riêng nó — và hai hằng đó lệch nhau **ngay từ dòng đầu tiên**:

| Hằng | Giá trị | File |
|---|---|---|
| `K8S_UNSEEDED_REPLAY_SEED` | `0` | `k8s/problem-plugin.ts` |
| `GIT_UNSEEDED_REPLAY_SEED` | `1` | `git/problem-plugin.ts` |

Hai số khác nhau ở đây **không đọc ra thành một lỗi**. Nó đọc ra thành: client chơi trên
một thế giới đầu, server phát lại trên một thế giới đầu KHÁC, và **mọi lượt nộp HỢP LỆ đều
bị từ chối**. Nhìn từ phía người dùng, nó giống hệt một hệ thống từ chối người chơi ngẫu
nhiên.

Cách chặn là bỏ hẳn chỗ cho phép hai bên tự chọn: **lượt nộp mang theo số đã dùng**, server
phát lại bằng đúng số đó. Không phía nào tra hằng lúc chấm, nên không có gì để lệch.
`submit.ts` đọc `log.seed` chứ không đặt một hằng.

⚠ Hai hằng trên **không biến mất**, chúng **đổi vai**: nay là số client nạp vào
`createSession` / `createGitSession` khi MỞ một bài không seedable, rồi ghi vào
`Submission.seed`. Mặc định lúc chơi, không còn là mặc định lúc chấm. Với Git giá trị phải
là `1` vì `createGitSession` đã lấy `1` làm mặc định của chính nó — đặt số khác nghĩa là
một lượt OJ dựng thế giới khác mọi đường git còn lại của repo.

⚠ Hệ quả còn lại, nói thẳng: **ngoài kỳ thi, người nộp tự chọn seed của mình.** Đó là hành
vi CỐ Ý của hợp đồng. Cổng so seed chỉ tồn tại trong phạm vi một lượt thi — xem
[`exam-format.md`](exam-format.md) §4.

---

## 5. Testcase ẩn — che ở giao diện KHÔNG đủ

`visible: false` nghĩa là người làm **chỉ thấy nhãn sau khi nộp**. Nó chặn kiểu dò đáp án
bằng cách nộp nhiều lần: nếu mọi testcase đều hiện thì người làm đọc được toàn bộ điều kiện
chấm và lập trình ngược nó mà không cần hiểu bài.

⛔ **Đường của người học KHÔNG được gửi `check`/`args` xuống trình duyệt.** Che ở tầng giao
diện không cứu được, vì dữ liệu đã nằm trong phản hồi rồi — ai mở tab Network đều đọc được.

Chốt chặn là một **kiểu dữ liệu**, không phải một điều kiện `if`:

```ts
interface TestcaseTeaser {
  readonly id: string;
  readonly label: string | null;   // null khi testcase ẩn và người làm CHƯA nộp
  readonly visible: boolean;
}
```

`check` và `args` **không có mặt trong kiểu này ở bất kỳ trường hợp nào** — kể cả với
testcase hiện, kể cả khi người gọi là tác giả. Nhãn là đề bài; tên vị từ và tham số là cách
chấm, và cách chấm không phải thứ người làm cần để làm bài.

`toTestcaseTeasers` (`server/problems/testcases.ts`) dựng object mới với đúng ba trường thay
vì `{ ...testcase, label: … }`, và khác biệt đó là toàn bộ vấn đề: một phép rải sẽ mang theo
mọi trường tương lai ai đó thêm vào `Testcase`, im lặng, và không ô test nào biết tên trường
mới để mà đỏ.

Hai luật đi kèm:

- **Phần tử KHÔNG bị bỏ khỏi mảng khi ẩn.** Người làm phải biết bài có bao nhiêu testcase để
  hiểu `WA (4/5)` nghĩa là còn cách bao xa. Giấu cả sự tồn tại thì mẫu số nói dối.
- **`afterSubmit` phải tới từ MÁY CHỦ** (đã có lượt nộp nào của chính người này chưa), không
  bao giờ từ input của client. Nhận cờ này từ client là hỏi kẻ tấn công xem họ đã nộp bài
  chưa.

Người soạn cần bản đầy đủ thì đi `problems.forEdit` — đường đó trả `Problem` đầy đủ và có
cổng chủ sở hữu riêng. Trang chi tiết là MỘT trang cho cả hai vai nên nó có MỘT kiểu trả về;
thêm trường cho tác giả ở đúng chỗ đó nghĩa là kiểu trên dây lại có chỗ chứa cách chấm.

### Biên đọc: `visible` mặc định `true` cho dòng cũ

`problemTestcases(raw: readonly unknown[])` nhận `unknown[]` chứ không nhận `Testcase[]`:
dữ liệu tới từ một cột jsonb, và kiểu TypeScript của cột là một **lời khai** chứ không phải
một phép kiểm (Drizzle không kiểm gì lúc chạy).

Luật: **chỉ một `false` TƯỜNG MINH mới làm testcase ẩn** (`row.visible !== false`). Mọi dòng
viết trước 18.B đều đã được gửi nguyên văn xuống trình duyệt, nên `true` giữ đúng hành vi cũ
từng bit. `false` là năng lực MỚI và phải được ghi tường minh.

⚠ `required` **KHÔNG** ánh xạ sang `visible`. Hai trường gần nhau về hình dạng và ngược nhau
về nghĩa:

| | `Objective.required` | `Testcase.visible` |
|---|---|---|
| Trả lời | không đạt thì có chặn không | người làm có được XEM trước khi nộp không |
| Ai đọc | bộ chấm | tầng gửi dữ liệu xuống trình duyệt |

Phần tử hỏng (thiếu `id` hoặc `check`) bị **BỎ**, không ném: một bài soạn dở không được làm
sập cả trang danh sách của mọi người. Cổng xuất bản mới là chỗ từ chối hình dạng đó.

---

## 6. Gợi ý CÓ GIÁ — cùng cơ chế che, cùng lý do

Khác hẳn `hints: string[]` của `Level` (miễn phí, vì level dạy). Ở một OJ, mở gợi ý là đánh
đổi: được chỉ đường, mất điểm.

```ts
interface ProblemHint      { id; text; penaltyPoints }          // chỉ ở server
interface ProblemHintTeaser{ id; penaltyPoints; revealed; text: string | null }
```

`text` chỉ khác `null` khi `revealed === true`, và **máy chủ quyết, không phải client**.
`revealedIds` phải tới từ bảng `problem_hint_reveals` của chính người đang gọi.

Bảng đó bịt một lỗ mà nhật ký một mình không bịt được: điểm trừ vốn tính từ các action
`kind: 'hint'` trong `RunLog`, mà nhật ký thì do client dựng — nên gọi thẳng
`problems.revealHint` bằng tab công cụ nhà phát triển và **không** ghi action tương ứng sẽ
đọc được gợi ý mà không mất điểm. `submit.ts` vì thế lấy **HỢP** của hai tập:

```
revealedIds = (bảng problem_hint_reveals)  ∪  (action `hint` trong RunLog)
```

Chiều ngược lại cũng cần: một action `hint` trong nhật ký mà không có dòng tương ứng vẫn
phải bị trừ, vì nội dung gợi ý có thể đã tới từ một phiên trước trên máy khác.

Khoá chính của bảng là bộ ba `(problem_code, user_id, hint_id)`: mở lại một gợi ý đã mở
không phải một sự kiện mới, và một `uuid` riêng sẽ cho phép hai dòng cùng nghĩa tồn tại song
song — lúc đó "đã mở chưa" có hai câu trả lời. Bảng **không** lưu nội dung hay điểm trừ: cả
hai đọc được từ `problems.hints` theo `hint_id`, và chép sang đây là lưu trường suy ra được.

---

## 7. Hợp đồng plugin — một chỗ cắm, không một `switch`

`GameProblemPlugin<Spec, A>` (`core/problem-plugin.ts`) là chỗ một game cắm phần riêng của
mình vào hệ OJ.

```ts
interface GameProblemPlugin<Spec, A extends GameAction = GameAction> {
  readonly gameId: GameId;
  readonly codePrefix: string;                      // 'K8S' | 'GIT'
  readonly topics: readonly ProblemTopicOption[];   // tập ĐÓNG của game này
  readonly predicateNames: readonly string[];
  initialSpec(): Spec;                              // HÀM, không phải hằng
  readonly authorFields: readonly AuthorField[];    // mô tả form dạng DỮ LIỆU
  grade(input): GradeResult;                        // thuần + tất định
  seedSpec?(base: Spec, seed: number): Spec;        // vắng ⇒ mọi bài phải seedable: false
}
```

**Vì sao là plugin chứ không phải `switch (gameId)`:** một `switch` sẽ nằm rải ở tầng UI,
tầng chấm, tầng soạn bài, tầng seed — và thêm game thứ ba nghĩa là tìm cho đủ mọi chỗ đã
`switch`. Cái nào sót thì **không đỏ**, chỉ im lặng rơi vào nhánh `default` của game khác.
Một bảng đăng ký thì thiếu một nhánh là **thiếu một khoá**, và đó là thứ kiểu dữ liệu bắt
được.

### Hai ràng buộc cứng của `core/`

1. **Không JSX.** `authorFields` là mô tả form dạng **dữ liệu**, không phải component. JSX ở
   `core/` kéo React vào một package cấm React — nhưng cái giá thật nặng hơn một dòng
   import: `packages/games` khai `sideEffects: false` và chạy TRONG bundle client; P17 đã
   một lần rò engine sang 6 route không liên quan chỉ vì một barrel (631KB ở hai chỗ). Tầng
   UI đọc mô tả này rồi tự dựng widget.
2. **Không `import node:*`.** `packages/games/tsconfig` bỏ `types: ["node"]` cố ý, để một
   lần lạc tay là đỏ ngay ở typecheck.

Cùng một ràng buộc ở tầng kiểu: `core/` **không được biết** `ClusterSpec`, `WorldSpec`, hay
bất kỳ kiểu nào của một game cụ thể. Cách giữ nó mà vẫn mô tả được "trạng thái ban đầu của
bài" là **tham số kiểu `Spec`** — `core/` khai *bài tập có một trạng thái ban đầu*; game nào
điền kiểu nấy.

### `AuthorField` — bảy nhánh

`text` · `number` (có `integer`) · `boolean` · `select` (có `multiple`) · `list` (lặp một
NHÓM trường con) · `string-list` (danh sách chuỗi phẳng) · `json`.

⚠ Đây **không** phải một hệ form tổng quát, và đừng để nó lớn thành một hệ như vậy. Phạm vi
của nó đúng bằng phần **trạng thái ban đầu riêng của game** — mọi trường chung của bài (tiêu
đề, đề, độ khó, chủ đề, tag, gợi ý, testcase) đã có form viết tay ở tầng UI và KHÔNG đi qua
đây.

Nhánh `json` là **van an toàn có chủ ý**, không phải chỗ bỏ dở. Plugin Git dùng nó cho gần
như mọi trường, và lý do cụ thể: `commits` là một **đồ thị**, không phải một danh sách —
`CommitSpec.parents` trỏ tới id của các `CommitSpec` khác trong cùng mảng, còn
`branches`/`tags`/`head` trỏ ngược vào những id đó. Một `kind: 'list'` dựng được ba ô text
cho mỗi commit nhưng **không kiểm được** rằng `parents` trỏ tới id có thật, cũng không kiểm
được thứ tự tô-pô mà `buildWorld` đòi. Kết quả là một biểu mẫu trông đầy đủ nhưng cho phép
soạn ra thế giới không dựng được — tệ hơn hẳn một ô JSON nói thẳng rằng đây là dữ liệu có
cấu trúc.

`string-list` thêm 2026-09-14 cho `ClusterSpec.namespaces`: không dựng được bằng `list`
(nhánh đó lặp một NHÓM), và ép qua `json` thì bắt người soạn gõ `["default","kube-system"]`
đúng cú pháp JSON cho một thứ đáng lẽ là ô nhập có nút thêm/xoá.

### `initialSpec` là HÀM, không phải hằng

Trả một hằng dùng chung thì hai tab soạn bài sẽ cùng trỏ vào một object, và sửa tab này đổi
luôn tab kia. Hàm cũng giữ `sideEffects: false` trung thực — không object nào được dựng ở
tầng module.

### Bảng đăng ký và phép ép kiểu có tên

`ProblemPluginRegistry = Readonly<Partial<Record<GameId, ErasedProblemPlugin>>>`.

Xoá kiểu ở đây là **thật**, không phải lười: `grade` nhận `initialState: Spec`, và tham số
thì **nghịch biến** — một hàm nhận `ClusterSpec` không gán được vào chỗ đòi hàm nhận
`unknown`. Không có cách khai nào làm biến mất điều đó. Nên hợp đồng **thừa nhận** phép ép
thay vì giả vờ không cần: `eraseProblemPlugin` là chỗ **DUY NHẤT** được ép, nó có tên, và nó
nói rõ mình đang đánh đổi gì. Phép ép rải rác thì mỗi chỗ là một cơ hội ép nhầm thứ.

Điều này không mất an toàn: `K8S_PROBLEM_PLUGIN` / `GIT_PROBLEM_PLUGIN` vẫn khai bằng kiểu
ĐẦY ĐỦ tại file của chúng, nên mọi sai lệch hợp đồng vẫn đỏ tại nơi sinh ra.

⚠ Bản đầu của bảng khai `Partial<Record<GameId, GameProblemPlugin<never, GameAction>>>` kèm
một lời giải thích tự tin rằng `never` là chỗ chặn. `tsc` nói khác: lỗi thật là **TS2375**,
về `exactOptionalPropertyTypes` ở thuộc tính tuỳ chọn `seedSpec?` — cả hai plugin đều cố ý
không khai nó. Bảng kiểu đó **không nhận nổi plugin nào**.

---

## 8. Mã bài, slug, khoá chính — ba thứ khác nhau

| | Là gì | Đổi được không |
|---|---|---|
| `code` (`K8S-0042`) | thứ người ta đọc cho nhau nghe | **KHÔNG**, vĩnh viễn |
| `slug` | thứ nằm trong URL, sinh từ tiêu đề | CÓ, khi sửa tiêu đề |
| khoá chính DB | = `code` | — |

Khoá chính là `code` vì nó là thứ **duy nhất** không bao giờ đổi. Bốn chữ số
(`PROBLEM_CODE_SUFFIX_DIGITS = 4`) chứ không phải số tự tăng không giới hạn: 9999 bài mỗi
game là trần thực tế xa hơn mọi kế hoạch, và **độ dài cố định làm mã sắp xếp đúng bằng so
sánh chuỗi** — `ORDER BY code` không cần ép kiểu, và cây btree của khoá chính đã phục vụ
luôn thứ tự mặc định của danh sách.

`isProblemCode(value, prefix)` nhận `prefix` **tường minh**, KHÔNG tự suy từ `gameId`. Suy
ngầm (`gameId.toUpperCase()`) trông gọn hơn và sai ngay ở ca thứ hai: `'k8s'` → `K8S` là
trùng nhau tình cờ; `'cicd'` thì tiền tố hợp lý là `CI` chứ không phải `CICD`. Một phép suy
đúng ở ca đầu và sai ở ca sau là thứ không ai kiểm lại.

---

## 9. Chủ đề: tập đóng ĐỔI CHỖ, không biến mất

Ở tầng `core/`, `ProblemTopicId = string` — một chuỗi mờ, **không** phải union đóng. Đây là
chỗ hợp đồng cố ý đi khác bản K8s cũ, vốn khai 9 chủ đề K8s ngay trong `core/`. Chín tên đó
là tri thức về Kubernetes, không phải tri thức về "bài tập" — để chúng ở `core/` thì một bài
Git phải chọn chủ đề trong một danh sách nói về Pod.

Tập đóng chuyển sang plugin: `GameProblemPlugin.topics`, và cổng kiểm là *"chủ đề của bài
phải nằm trong tập của plugin theo `gameId` của bài"* — thi hành ở `refineByGame`
(`validate.ts`). Lý do phải đóng vẫn nguyên vẹn: một trường tự do sẽ đẻ ra `Networking`,
`networking`, `network`, `Mạng` là bốn mục khác nhau cho cùng một thứ, và không ai gộp lại
được sau vài trăm bài.

⛔ Đọc dòng `topics: z.array(z.string()…)` trong `validate.ts` **một mình** sẽ kết luận sai
rằng chủ đề đã thành trường tự do. Phải đọc nó cùng `refineByGame`.

`tags` mới là chỗ cho phân loại tự do: chuẩn hoá thường + gạch nối (cùng `SLUG_PATTERN` với
slug — hai dạng khác nhau cho hai thứ trông giống nhau là chỗ để `Init-Container` và
`init-container` cùng tồn tại), tối đa 20, rỗng là hợp lệ.

---

## 10. Chấm — phát lại phía máy chủ, không tin lời khai

`grade` của plugin phải **thuần và tất định**: cùng đầu vào cho cùng đầu ra, ở cả trình
duyệt lẫn Node, từng byte. Không `Date.now()`, không `Math.random()`, không lặp trên
`Set`/`Map` theo thứ tự chèn.

Nếu bất biến này hỏng thì verdict của client khác verdict của server, và **người làm bị từ
chối một bài họ giải ĐÚNG**. Engine Git có năm test riêng cho đúng chuyện này
(`git/determinism.test.ts` + `determinism.jsdom.test.ts`) và cổng CI
`scripts/check-git-determinism.mjs` gác phần grep.

### Ba ca `CE` — và vì sao chúng không được im lặng thành `WA`

`CE` nghĩa là *"lượt chơi không chạy tới nơi, nên `passed`/`total` không nói lên gì"*.

| Ca | Vì sao là `CE` |
|---|---|
| Bài **không có testcase nào** | `problemVerdictOf(0, 0)` đã trả `CE` sẵn |
| Testcase gọi **vị từ không tồn tại** (tác giả gõ nhầm) | bỏ qua như `evaluateObjectives` của LEVEL làm thì bài đó **không ai giải được** và không ai biết tại sao — một testcase vĩnh viễn đỏ trông y hệt một lời giải sai |
| Engine **ném khi phát lại** | lỗi của TA hoặc của dữ liệu, không phải bằng chứng người làm sai |

Ở level, bỏ qua một vị từ lạ là đúng (hỏng một level, không hỏng phiên chơi); ở một OJ có
chấm điểm thì im lặng là thứ `development-principles.md` § "Errors Over Silent Fallbacks"
cấm thẳng.

Plugin Git có **một ca `CE` thứ tư**: vị từ `graphShapeMatches` cần một cây đích mà bài
không khai `targetState`. `evaluatePredicate` trả `false` khi `target === null`, tức testcase
đó **không bao giờ qua được** — đúng hình dạng lỗi mà quy ước trên cấm: một nhánh trả giá trị
hợp lệ để che một điều kiện không thoả được. Phép kiểm này phải giữ đúng bề rộng: bài **có**
khai `targetState` thì vị từ chạy thật, không `CE`.

### `targetState` — một ô, hai nhu cầu

`ProblemBase.targetState?: Spec` thêm 2026-09-14 vì một vị từ **khai được nhưng dùng không
được**: `graphShapeMatches` vào `predicateNames` của plugin Git rồi mới phát hiện
`ProblemBase` không có ô nào chứa cây đích để so. Một vị từ hợp lệ ở bảng từ vựng mà không
bao giờ chạy được là đúng loại mã chết không đỏ ở đâu cả.

`?` chứ không bắt buộc: phần lớn bài chấm bằng vị từ trên trạng thái cuối và không có khái
niệm "đích". Bài nào dùng `graphShapeMatches` thì phải có ô này, và **cổng kiểm của plugin**
là chỗ khẳng định điều đó — không phải kiểu.

⚠ Cây đích dựng bằng **CÙNG seed** với thế giới đầu. Không phải cho gọn: `buildWorld` nuôi
RNG của bot từ seed, nên hai seed khác nhau cho hai cây đích khác nhau — và một cây đích
lệch làm `graphShapeMatches` trượt trên một lời giải ĐÚNG.

### `PROBLEM_FAILURE_CODES` — cột thứ ba, và vì sao nó không thừa

Hai dòng DB dưới đây khác nhau về nguyên nhân và **giống hệt nhau về dữ liệu**:

| `passed` | `total` | Nguyên nhân thật | Đọc lại bằng `problemVerdictOf` |
|---|---|---|---|
| `[]` | `5` | engine không tất định ⇒ máy chủ bỏ mọi con số | `WA` ❌ sai |
| `[]` | `5` | người làm chạy được nhưng không qua case nào | `WA` ✅ đúng |

⛔ Nên **đừng đoán nguyên nhân từ `passed.length === 0`** — phép đoán đó đúng ở dòng trên và
sai ở dòng dưới, mà hai dòng thì không phân biệt được. Đường ra duy nhất là một cột thứ ba.

Sáu mã: `log-hong` · `phat-lai-loi` · `engine-khong-tat-dinh` · `khong-khop` ·
`chua-co-testcase` · `sai-game`. Bốn mã đầu chép nguyên tên từ `VerifyStatus` — một vốn từ
thay vì hai.

`failedReason` **không** thay được cột này: nó là một câu tiếng Việt viết cho người đọc, sẽ
được sửa chữ lúc nào đó, và so chuỗi tiếng Việt để suy nguyên nhân là đúng cái bẫy mà
`submit.ts` đã tránh khi bắt `UnknownProblemGameError` theo **LỚP** thay vì theo thông điệp.

⚠ `null` ở cột này mang **HAI** nghĩa, và chỗ đọc phải xử cả hai: lượt không phải `CE` (bình
thường), **và** dòng ghi trước migration 0015 (lúc đó cột chưa tồn tại). Phân biệt bằng
`total`: `total > 0` + `null` là một `WA`/`AC` thật; `total === 0` + `null` là dòng cũ.

### Mọi trạng thái không-xác-minh-được đều về `CE` (đổi 2026-09-15)

Bản trước chỉ đặc cách `engine-khong-tat-dinh`. Review đối kháng đo ra chỗ hỏng:
`verdictFromVerify` ánh xạ `khong-khop` → `CE`, trong khi đường nộp để `gradeProblemRun` trả
`AC`. Dòng ghi xuống mang `solved: false, score: 0` cạnh `passed` đầy đủ và `failCode: null`,
nên lịch sử hiện **`AC`** cho một lượt vừa TRƯỢT xác minh. Người học đọc ra *"AC, 0 điểm,
chưa giải"* — ba câu mâu thuẫn nhau trên cùng một dòng.

Hệ quả phụ, đáng có: nhánh không-xác-minh nay **không gọi `gradeProblemRun`** nữa, nên máy
chủ bỏ được một lượt phát lại toàn bộ nhật ký cho đúng những lượt không dùng tới kết quả ấy.

### Chống dò bằng nhịp nộp

`SUBMIT_LIMIT_PER_MIN = 6` — bucket **riêng**, khoá theo `userId` (không theo IP: IP tới từ
header giả mạo được). `protectedProcedure` đã kẹp mọi mutation ở 20/phút, nhưng đó là ngân
sách **chia sẻ** và nó không nhìn thấy rằng MỘT lượt nộp bài đắt hơn hẳn một mutation
thường: máy chủ phát lại toàn bộ nhật ký **hai lần** (`verifyRun` phát hai lượt để bắt engine
không tất định) rồi chạy mọi vị từ.

⚠ Kế thừa nguyên giới hạn của `checkRateLimit`: bucket **in-memory per-process**, nên N
replica web = N bucket. Đủ cho quy mô hiện tại; đường đi khi cần chặt là bucket dùng chung
qua Redis. Cùng cảnh báo với [`quiz-format.md`](quiz-format.md) § "Chống dò đáp án".

---

## 11. Biên ghi và cổng xuất bản — hai câu hỏi khác nhau

| File | Hỏi gì |
|---|---|
| `validate.ts` | dữ liệu này có **ghi xuống** được không |
| `publish-gate.ts` | bài này đã đủ để **người học nhìn thấy** chưa |

Soạn dở được phép chưa đủ, nên hai bộ điều kiện **không được gộp**. Bản nháp lưu tự do; ép
nháp phải hợp lệ là bắt người soạn viết xong mới được lưu (cùng luật
[`quiz-format.md`](quiz-format.md) § "Cổng xuất bản").

### `publishIssues` chặn ba thứ

| Luật | Vì sao |
|---|---|
| `statement` ≤ 150 từ | §1 |
| ≥1 testcase | không có thì bài không chấm được |
| id testcase không trùng | bên chấm khử trùng theo id ⇒ điểm sẽ tính sai |
| id gợi ý không trùng | mở một cái sẽ mở luôn cái kia |

⚠ **Một cổng bị NỚI, không phải một dòng dọn dẹp.** Bản cũ hỏi
`objectives.some(o => o.required)`. Quyết định #20 bỏ hẳn khái niệm mục tiêu-không-bắt-buộc,
nên một vị từ đọc `required` trên dữ liệu mới **luôn ra `undefined`** — cổng sẽ từ chối xuất
bản MỌI bài soạn theo mô hình mới. Giữ nguyên là hỏng, không phải là an toàn.

### `refineByGame` — chỗ duy nhất biết cả `gameId` lẫn phần còn lại

Bốn phép kiểm:

1. **Game phải có plugin.** `GAME_IDS` có sáu giá trị, `PROBLEM_PLUGINS` mới có hai. Bốn game
   còn lại là `gameId` HỢP LỆ mà chưa có engine chấm — lưu một bài cho chúng là lưu một bài
   không ai chấm được.
2. **Chủ đề thuộc tập của plugin** (§9).
3. **`initialState`**: với K8s giữ nguyên độ chặt cũ (`clusterSpecSchema`, từng phép kiểm
   một); với game khác chỉ khẳng định **nó là một object**. Đây là **khoảng trống có chủ ý**,
   đừng đọc nhầm thành một phép kiểm: viết một schema Zod thứ hai cho `WorldSpec` ở đây là
   dựng bản sao thứ hai của một hợp đồng đang sống trong `packages/games`, và bản sao sẽ
   trôi. Chỗ đúng của phép kiểm đó là plugin (một `parseSpec`), và hợp đồng plugin **chưa có
   ô cho nó**.
4. **`seedable` phải khớp `plugin.seedSpec`** — §12.

Viết thành một hàm dùng chung cho cả `create` lẫn `update` chứ không gọi `.superRefine` hai
lần với hai thân hàm: hai bản sao sẽ trôi ở đúng phép kiểm mà ai đó thêm vào một bên.

⚠ Thứ tự `.extend().strict().superRefine().transform()` là **bắt buộc**: `.superRefine()` trả
về một bọc không còn `.extend()`, và `refineByGame` phải chạy TRƯỚC `.transform()` — sau phép
biến hình thì `code` đã tách khỏi `body` và `path` của issue sẽ trỏ vào `body.topics.0` thay
vì `topics.0`, tức client không tìm thấy ô nào để tô đỏ.

### Khoảng trống đã biết ở biên ghi

- **Tên vị từ chưa được kiểm.** `check: z.string().min(1)` — `validate.ts` nay **đã** nhập
  `PROBLEM_PLUGINS` nên phép kiểm "tên vị từ có thật không" đã **với tới được**, chỉ là chưa
  làm. Chưa làm vì nó là một cổng MỚI trên đường lưu nháp: một bài CŨ mang vị từ đã bị gỡ sẽ
  thành bài *"mở ra sửa được nhưng bấm Lưu thì 400"*. Đóng nó là một quyết định về hành vi,
  cần người ra lệnh.
- **Hệ quả mới của việc mở đa-game:** trước đợt này chỉ bài K8s ghi được, nên "vị từ K8s trên
  bài Git" không có đường tồn tại. Giờ thì có — và nó chỉ lộ ra lúc chấm.
- "Vị từ này đòi tham số nào" và ràng buộc "một trong hai" vẫn chỉ sống ở giao diện soạn bài,
  nên gọi thẳng `problems.publish` qua tRPC là đi vòng qua chúng.

### `.readonly()` trên mọi mảng là quyết định về HỢP ĐỒNG DÂY

Kiểu client tRPC phải truyền vào là `z.input` của schema. Không có `.readonly()` thì nó là
mảng **ghi được**, trong khi payload mà tầng UI dựng lên tới từ hợp đồng — nơi mọi mảng là
`readonly`. Mà `readonly T[]` **không gán được** vào `T[]`, nên mỗi call-site phải `as` một
lần. Đo được: hai lane cùng vấp. Trong Zod 4, `.readonly()` làm `readonly` **cả hai chiều**,
nên nó vá đúng chỗ đau.

---

## 12. `seedable` — cờ chặn một kỳ thi không công bằng

`seedSpec` **chỉ có mặt khi game hỗ trợ**; `undefined` nghĩa là mọi bài của game đó buộc phải
`seedable: false`.

⛔ **Đo 2026-09-15: KHÔNG plugin nào khai `seedSpec`.** Cả `K8S_PROBLEM_PLUGIN` lẫn
`GIT_PROBLEM_PLUGIN` đều cố ý vắng mặt nó, và cả hai nói ra lý do:

- **K8s** — không đường nào trong `k8s/` sinh một `ClusterSpec` biến thể theo seed
  (`seededIncident` nằm trong chính spec, do tác giả đặt).
- **Git** — `buildWorld(spec, seed)` nhận seed nhưng dựng **cùng một thế giới** từ cùng một
  spec; seed chỉ nuôi RNG của bot chứ không sinh ra một đề khác.

Khai một `seedSpec` trả thẳng `base` sẽ là **lời nói dối tệ hơn nhiều so với vắng mặt**: cổng
cho kỳ thi `per-student` sẽ cho chạy, và mỗi sinh viên nhận **cùng một đề** trong khi hệ
thống khai là đề riêng.

Hệ quả trực tiếp, **đang có hiệu lực hôm nay**: `refineByGame` từ chối **mọi** `seedable:
true`, nên không bài nào vào được kỳ thi `per-student`. Đó là câu trả lời đúng cho tình trạng
thật, không phải một cổng chặt quá tay.

Mặc định cột là `false`, và **chiều mặc định là phần quan trọng**: sai theo chiều `false` thì
cái giá là một bài không được chọn vào đề thi cho tới khi tác giả bật cờ — ồn ào, sửa được,
không ai mất điểm. Sai theo chiều `true` thì cái giá là một kỳ thi không công bằng, phát hiện
ra sau khi đã chấm.

Giao diện cũng vô hiệu hoá ô đánh dấu, **nhưng giao diện không phải cổng** — một lời gọi API
viết tay không đi qua nó.

---

## 13. Bảng và cột

### `problems`

| Cột | Ghi chú |
|---|---|
| `code` **PK** | `text`, không phải uuid — §8 |
| `game_id` | `text` + enum `GAME_IDS`, default `'k8s'` (migration 0015) |
| `slug` | duy nhất riêng |
| `topics` | **`text[]` + GIN**, không phải jsonb |
| `tags` | `text[]` |
| `initial_state` | `jsonb`, `$type<unknown>()` — **chủ ý** |
| `target_state` | `jsonb`, nullable |
| `objectives` | `jsonb` — tên cột giữ nguyên, **có chủ ý** |
| `allowed_resources` | `jsonb`, ⚠ **K8s-only** |
| `seedable` | `boolean`, default `false` |
| `created_at` / `updated_at` | `timestamptz` **`precision: 3`** |

**`topics` là `text[]` chứ không jsonb** vì bộ lọc danh sách hỏi *"bài nào có BẤT KỲ chủ đề
nào trong tập này"* (`&&`) và *"bài nào có ĐỦ mọi tag này"* (`@>`) — cả hai là toán tử mảng
của Postgres và có chỉ mục GIN phục vụ trực tiếp. Viết cùng câu hỏi đó trên jsonb phải qua
`jsonb_path_exists` hoặc `EXISTS (SELECT … jsonb_array_elements)`, một phép quét không dùng
được chỉ mục nào. Đây là chỗ nó **khác** `content_items.capabilities`, vốn đọc nguyên khối.

Và **không** phải `pgEnum(...).array()` dù tập là đóng: một mảng kiểu enum bắt mọi tham số
truyền vào `&&`/`@>` phải ép sang `problem_topic[]`, trong khi driver `postgres` gửi mảng
chuỗi dưới dạng `text[]` — Postgres từ chối với `operator does not exist: problem_topic[] &&
text[]`, một lỗi chỉ lộ lúc chạy.

**`initial_state` là `$type<unknown>()` có chủ ý**, không phải chỗ chưa làm xong: kiểu đúng
phụ thuộc `game_id` của **chính dòng đó**, và TypeScript không diễn đạt được ràng buộc
liên-cột. Một union `ClusterSpec | WorldSpec` trông hẹp hơn mà **không hẹp thật** — nó vẫn
cho `ClusterSpec` lọt vào một dòng `game_id = 'git'`, chỉ là im lặng hơn.

**`precision: 3` khác mọi bảng khác trong file**, và không phải cho đẹp: `created_at` là một
khoá sắp xếp đi vào con trỏ keyset. `timestamptz` mặc định giữ tới MICRO giây, còn `Date` của
JavaScript chỉ có MILI giây — driver cắt phần dư. Con trỏ vì thế mang một mốc NHỎ HƠN mốc
thật của chính dòng nó trỏ tới, và `created_at > $cursor` nhận lại đúng dòng đó ở đầu trang
sau: **dòng lặp, im lặng**, chỉ lộ khi có người đếm.

**`allowed_resources` là món nợ đã ghi tên**: cột của thời K8s-một-game. Một bài Git mang
`null` vĩnh viễn. Chỗ đúng của nó là bên trong `initial_state` hoặc trong `authorFields` của
plugin K8s. Chưa chuyển vì đó là một migration DỮ LIỆU trên mọi dòng đang có, và nó không
chặn việc gì.

### `problem_submissions`

| Cột | Nguồn |
|---|---|
| `solved` | `objectivesMet` đã phát lại, theo mọi testcase |
| `score` | **mô hình CŨ** (0..1000 theo gợi ý và số nước) — chỉ ghi khi phát lại KHỚP |
| `duration_seconds` | giờ treo tường do client khai — ⚠ **không xác minh được** |
| `moves_used` | đếm từ `log.actions` theo `COMMAND_KINDS` |
| `hints_revealed` | **HỢP** của nhật ký và bảng `problem_hint_reveals` |
| `passed` | `text[]` — id, không phải chỉ số; máy chủ tự chấm |
| `total` | sự thật lịch sử tại thời điểm nộp (§3) |
| `fail_code` | `PROBLEM_FAILURE_CODES` (§10) |

⛔ **Cặp `(passed, total)` KHÔNG được bổ sung một cột điểm-theo-testcase**: điểm là
`passed.length / total`, tính ở chỗ dùng. Cột `score` bên trên là **một đại lượng KHÁC** của
mô hình cũ — đừng gộp hai thứ.

Chỗ tinh tế nhất ở `submit.ts` là dòng `score`: dùng `claimed.score` **trông như** tin client,
nhưng `verifyRun` chỉ trả `da-xac-minh` khi số phát lại ra bằng đúng số đã khai, nên ở nhánh
đó hai giá trị là một. Lấy `claimed.score` khi CHƯA xác minh mới là tin client — và nhánh đó
ghi `0`.

⚠ `passed` **không** đi qua cổng `verifyRun`, và đó là khác biệt có chủ ý:
`gradeProblemRun` không đọc `claimed` một chữ nào — nó phát lại `log.actions` trên
`problem.initialState` rồi chạy vị từ trên trạng thái CUỐI. Kết quả của nó là sự thật của máy
chủ dù client khai gì.

Một lượt **không xác minh được VẪN được ghi**, với `solved: false, score: 0`. Đó vẫn là dữ
liệu của người dùng, nó chỉ mất quyền được tính điểm — và nó vẫn phải đếm vào `attemptCount`,
nếu không thì tỉ lệ giải được sẽ tính trên một mẫu đã bị lọc bỏ đúng những lượt thất bại.

⚠ `duration_seconds` **không dùng làm khoá xếp hạng được**: `startedAt`/`finishedAt` không nằm
trong nhật ký nên phát lại không tái tạo được chúng.

### Xoá và cascade

| Quan hệ | Hành vi | Vì sao |
|---|---|---|
| `problem_submissions.problem_code` → `problems` | **NO ACTION** | `crud.ts` từ chối xoá bài đã có lượt nộp, bảo người soạn `archive`. Cascade sẽ biến một cú bấm "xoá" thành xoá lịch sử của mọi người |
| `problem_submissions.user_id` → `users` | **cascade** | xoá tài khoản thì xoá lịch sử làm bài |
| `problems.author_id` → `users` | **NO ACTION** | xoá tác giả khi còn bài sẽ LỖI, buộc người vận hành chuyển chủ hoặc archive trước. Ồn ào là đúng ở đây |

---

## 14. Hai kiểu "lượt nộp", đừng lẫn

| Kiểu | Ở đâu | Có gì |
|---|---|---|
| `Submission` | `core/problem.ts` | hợp đồng miền: `problemCode`, `gameId`, `seed`, `actions[]`, `passed[]`, `total`, `hintsRevealed[]`, `submittedAt`. **KHÔNG có điểm** |
| `ProblemSubmission` | barrel `@devops-platform/games`, dùng ở `dto.ts` | hình dạng **dòng DB** đi qua dây: thêm `id`, `userId`, `solved`, `score`, `durationSeconds`, `movesUsed`, `failedCode` |

`toSubmissionDTO` dựng cái thứ hai. ⛔ **Không thêm một trường `verdict` vào nó**: verdict suy
được từ `(passed.length, total)` qua `problemVerdictOf`, nên gửi kèm là gửi cùng một sự thật
hai lần.

`ReplayRequest` (`core/problem.ts`) cố ý **không có chỗ nào cho verdict của client** — điểm
cuối nộp bài không nhận verdict của client, và kiểu là cách ép điều đó ở tầng biên dịch thay
vì tin vào kỷ luật của người viết điểm cuối.

---

## 15. Trạng thái ĐANG LÀM DỞ — đừng dựng gì trên những dòng này

Ghi ra vì một tài liệu mô tả thứ chưa tồn tại còn tệ hơn một tài liệu thiếu.

1. **Đường nộp bài chỉ chấm được bài K8s.** `submitProblem` ném
   `INTERNAL_SERVER_ERROR` khi `problem.gameId !== 'k8s'`, kèm câu nói rõ. Cổng này là CÓ CHỦ
   Ý: từ migration 0015 một bài Git `published` đã **có đường** đi vào đó, và
   `problemAsLevel` dựng một `Level` của K8s. Chế độ chơi bài OJ cho game Git **đang được
   dựng ở một lane khác** — API của nó chưa chốt, nên tài liệu này không mô tả.
2. **Level Builder (§18.E) đang được dựng.** `ProblemBase.targetState` là ô nó sẽ dùng cho
   hai nút "Đặt làm trạng thái đầu" / "Đặt làm đích" — **một ô cho hai nhu cầu**, đừng thêm ô
   thứ hai cho Builder. Phần còn lại của Builder chưa mô tả được.
3. **`ProblemForSolver<Spec>` của `core/` chưa ra tới barrel.** Tầng web vì thế tự dựng
   `SolverProblem` từ các mảnh đã mở (`TestcaseTeaser`, `ProblemHintTeaser`). Đây là chỗ dọn
   khi 18.A hợp nhất hai bản khai — thêm một trở ngại: `ProblemForSolver` không ôm được
   `allowedResources` (§13).
4. **`Verdict` trần ở `git/predicates.ts`** quá rộng so với thứ nó mô tả (kết quả chấm một
   LEVEL Git). Đổi thành `GitLevelVerdict` là việc đúng nhưng đụng mã đang chạy.

---

## 16. Thêm một game vào hệ OJ

1. Khai `topics` của game (tập ĐÓNG) ở một file **riêng**, không cùng file với plugin. Lý do
   cụ thể đã trả giá: `git/problem-plugin.ts` nhập `createGitSession`, nên mọi route chạm một
   tên trong đó đều **kéo cả engine git** theo — mà trang danh mục bài chỉ cần nhãn chủ đề.
   `git/problem-topics.ts` tồn tại vì đúng chuyện này (2026-09-15).
2. Khai `predicateNames`, kèm test khẳng định **hai chiều**: mọi tên có hiện thực, **và** mọi
   hiện thực có tên. Một chiều thôi thì vị từ chết sống mãi.
3. Viết `grade` — thuần, tất định, dựng một `Level`/`GitLevel` **tổng hợp** chỉ để engine
   chạy. ⚠ Level tổng hợp đó có hai cái bẫy đã cắn thật:
   - `allowedCommands: null` / `allowedResources: ALL_KINDS`, **KHÔNG** phải `[]`. Hai giá trị
     mang nghĩa **ngược nhau** — `[]` là "cấm mọi thứ", và nó làm mọi lượt chấm trượt **trong
     im lặng**, vì một lệnh bị chặn không phải một lỗi phát lại.
   - `objectives: []` là đúng nghĩa: bài OJ chấm bằng `testcases`, chạy thẳng trên trạng thái
     cuối. Đi vòng qua `objectives` sẽ kéo theo `required` — thứ mà `Testcase` cố ý không có.
   - `id` của level tổng hợp phải **khác mọi id level thật**: nó đi vào `getLog()` và vào tiến
     độ lưu ở `localStorage`.
4. Khai `authorFields`. Dùng `json` khi dữ liệu thật sự là đồ thị (§7); đừng dùng nó vì lười.
5. `eraseProblemPlugin(...)` rồi đăng ký vào `PROBLEM_PLUGINS`.
6. Nếu game sinh được đề theo seed thì khai `seedSpec`. **Nếu không thì để vắng** — đừng khai
   một hàm trả thẳng `base` (§12).

Bước 5 chạm file lead sở hữu, nên nó bắt đầu bằng một lời báo.

---

## 17. Verify commands

```bash
# Hợp đồng + hai plugin
pnpm --filter @devops-platform/games test

# Tầng web: biên đọc/ghi, phép che, chấm lại
pnpm --filter @devops-platform/web test problems
```

⚠ **Không thêm `--` trước tên filter.** `pnpm --filter <gói> test -- problems` truyền `--`
sang vitest như một filter nữa, nên lệnh thành `vitest run "--" "problems"` và nó chạy **toàn
bộ** suite thay vì lọc. Đo 2026-09-15: bản có `--` chạy 183 file; bản không có `--` lọc đúng.
Nó không báo lỗi, chỉ chạy lâu hơn hai bậc và cho một con số trả lời câu hỏi khác.

Tính tất định của engine Git có cổng riêng:

```bash
node scripts/check-git-determinism.mjs
```
