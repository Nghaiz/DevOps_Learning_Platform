# Phase 18 — kế hoạch thi hành phần CÒN LẠI (18.E + 18.H)

**Ngày:** 2026-09-15 · **Nhánh:** `feat/p18-oj-exam` · **Chạy:** tuần tự một luồng, theo
`phase-18.md` §5 ("Chạy: tuần tự một luồng").

Plan gốc dành cho 18.E đúng bảy dòng và không nói gì về hai quyết định phải chốt trước khi
gõ dòng đầu tiên. File này ghi lại phép đo, hai quyết định đó, và thứ tự thi hành.

---

## 0. Đo trước, vì bảng nợ của plan đã lạc hậu LẦN THỨ BA

`phase-18.md` §0.5 đã tự ghi rằng bảng nợ của nó lạc hậu hai lần. Đo lại hôm nay ra lần thứ ba:

| `phase-18.md` viết | Đo 2026-09-15 |
|---|---|
| §0.4: "Đường GHI vẫn chỉ nhận bài K8s — §18.D.1-nửa-sau, chưa làm" | **Đã xong.** `validate.ts` có `gameId: z.enum(GAME_IDS)`, `initialState: z.unknown()` + `refineByGame` gác theo plugin, `seedable` chặn khi plugin thiếu `seedSpec`. Lane `2026-09-15-lane-18d-write-report.md` làm ở `fbb087b`/`53dbdf7` |
| §0.4: "`problem-validate.ts` client còn `some(o => o.required)`" | **Đã gỡ** |
| AC-A `core/` sạch phụ thuộc game | **xanh** — lệnh đo trả rỗng |

Còn thật đúng ba món: **18.E** (chưa bắt đầu), **18.H** (hai file chưa có), và bộ lọc chủ đề
của `/problems` vẫn chỉ chín chủ đề K8s.

### 0.1 Ba phép đo quyết định hình dạng 18.E

1. **Không có bảng `levels`.** Level Git sống trong file TS đã biên dịch
   (`git/levels/{c1-01-06,c1-07-12,c2,c3}.ts` → `GIT_LEVELS`). E.5 "lưu thẳng vào DB" không có
   nhà nếu nó nghĩa là lưu một *level*.
2. **`/games/git` chỉ nhận `?level=` đã lọc qua `GIT_LEVEL_IDS`** (`page.tsx:41-45`), rồi
   `git-game.tsx:63` tra `GIT_LEVELS.find(...)`. Một level Builder dựng ra **không có đường
   nào chơi được** — cả hai đầu đều khoá vào một hằng biên dịch.
3. **Game Git chưa có chế độ chơi bài OJ.** `gradeGitProblem` (plugin) đã có và chấm được,
   nhưng đường nộp của `apps/web` thì chưa: `problemAsLevel` (`replay.ts:96`) **ném** khi
   `gameId !== 'k8s'`, và `submitProblem` có một cổng game trả câu nói được thay vì chấm.

Tức `GitLevel` và `Problem` là hai hình dạng khác nhau, không phải hai tên của một thứ:

| Chỉ `GitLevel` có | Chỉ `Problem` có |
|---|---|
| `chapter`, `mission`, `teaching`, `theoryId` | `code`, `topics[]`, `tags[]`, `seedable` |
| `allowedCommands`, `solutionCommands`, `altSolutionCommands`, `parCommands` | `testcases[].visible`, `statement` |
| `objectives[].required` | — |

AC-E lại viết bằng từ vựng của `GitLevel` ("level **chương 1**", "`solutionCommand` cho AC"),
còn E.5 viết bằng từ vựng của kho lưu. Plan mơ hồ ở đúng chỗ đắt nhất.

---

## 1. Hai quyết định của chủ dự án (2026-09-15)

### 1.1 Builder xuất CẢ HAI đường

Builder dựng một **cặp `WorldSpec`** (đầu + đích) rồi cho chọn đầu ra:

- **Xuất `GitLevel` JSON** — tải về để dán vào `levels/*.ts` (vĩnh viễn), và nạp lại được
  ngay trong game để chơi thử (đóng AC-E "xuất ra, nạp lại, chơi được").
- **Lưu thành `Problem`** — một dòng `problems` với `gameId: 'git'`,
  `initial_state`/`target_state` là `WorldSpec` (cột đã có từ migration 0015).

**Cái giá, chấp nhận tường minh:** đường thứ hai chỉ có nghĩa nếu bài lưu ra **chơi được**,
nên nó kéo theo một khối plan không ghi tên — chế độ chơi bài OJ cho game Git, thứ lane 18.G
đã đẩy ra ngoài phạm vi và gọi là *"18.C làm lại cho engine Git"*. Khối đó nằm trong phạm vi
đợt này (§2 khối 4).

### 1.2 E.7 đo bằng cách CHẠY LỜI GIẢI MẪU

`checkSolvable(level)` dựng phiên, chạy `solutionCommands`, rồi đòi `verdictOf` chấp nhận.

⛔ **Phải nói thẳng giới hạn trên chính giao diện, không giấu trong tài liệu:** phép này chứng
minh *"đường này đi được"*, **không** chứng minh *"không có đường nào"*. Plan §18.E.7 viết
"cảnh báo nếu trạng thái đích **không với tới được**" — câu đó mô tả một phép dò toàn không
gian lệnh, mà không gian lệnh git là vô hạn (tên nhánh, message, đường dẫn đều là tham số tự
do). Một phép dò cắt tuỳ tiện sẽ trả "không tìm thấy" và bị đọc thành "không giải được" —
đúng hình dạng `rules/green-that-proves-nothing.md`. Nên nhãn trên màn là *"lời giải mẫu có
đạt hết mục tiêu không"*, không phải *"level này có giải được không"*.

### 1.3 Thang độ khó — ánh xạ TƯỜNG MINH, một chiều

`GitLevel.difficulty` là `Difficulty` ba bậc (`basic|intermediate|advanced`, `core/types.ts:36`);
`Problem.difficulty` là `PROBLEM_DIFFICULTIES` bốn bậc. `phase-18.md` §18.A dặn **đừng ánh xạ
ngầm** giữa hai thang, và lời dặn đó vẫn đúng.

Builder giữ thang **ba bậc** (nó là một *level* builder), và đường xuất Problem ánh xạ bằng
một bảng khai tường minh: `basic→easy`, `intermediate→medium`, `advanced→hard`. Bậc `expert`
**không với tới được từ Builder**, có chủ ý — một bài `expert` cần soạn tay, và một ánh xạ
bịa ra bậc thứ tư sẽ là ánh xạ ngầm đúng loại plan cấm.

---

## 2. Thứ tự thi hành

Tuần tự. Thứ tự chọn theo *"đóng AC-E sớm nhất"*: nếu hết giờ ở giữa chừng thì Builder đã
dùng được và chỉ thiếu đường lưu DB.

| # | Khối | Nội dung | Ô gác của chính nó |
|---|---|---|---|
| 1 | **Lõi Builder** (`packages/games`, thuần) | `git/level-draft.ts`: `LevelDraft`, `draftToLevel`, `levelToJson`/`levelFromJson`, `levelDraftIssues`. `git/solvability.ts`: `checkSolvable` (E.7) | Vòng draft→JSON→draft giữ nguyên từng trường · `checkSolvable` ĐỎ trên một level có đích không với tới được (đối chứng dương) |
| 2 | **Nạp level tự dựng** | Đường nạp một `GitLevel` ngoài `GIT_LEVELS` để chơi thử (AC-E "nạp lại, chơi được") | Level nạp vào chơi được và chấm đúng; id level tự dựng KHÁC mọi `git-NN-` để không mồ côi tiến độ |
| 3 | **UI Builder** (`apps/web`) | Builder mode trong sandbox: E.1 đặt đầu/đích · E.2 chế độ so · E.3 đề bài + mục tiêu + theory · E.4 xuất JSON · E.6 chơi thử + chạy lời giải · E.7 nút kiểm | a11y không vi phạm · giới hạn Builder hiện TRÊN MÀN (plan §18.E dặn "không giấu trong tài liệu") |
| 4 | **Chế độ chơi bài OJ cho Git** | Server: `problemAsGitLevel` + replay cho git, gỡ cổng chặn ở `submitProblem`. Client: `/games/git?problem=` nạp bài theo mã, chấm theo testcase, nộp | Một lượt nộp bài Git có verdict client bị sửa tay vẫn ra đúng từ server (AC-3 mở rộng sang game thứ hai) |
| 5 | **E.5 lưu thành Problem** | Draft → `ProblemBody`, qua đúng `problemBodyShape` đã có; ánh xạ độ khó theo §1.3 | Bài lưu ra mở được ở `/games/git?problem=` và chơi được |
| 6 | **Lọc chủ đề theo game** | `problems-toolbar.tsx` thêm bộ chọn game; danh sách chủ đề đổi theo game | Bài Git lọc được theo chủ đề Git |
| 7 | **18.H tài liệu** | `docs/oj-format.md`, `docs/exam-format.md`, cập nhật `docs/games/README.md` | Mọi lệnh/đường dẫn trong tài liệu đo lại được |

---

## 2.1 Fan-out 2026-09-15 — lệch khỏi "tuần tự một luồng", có chủ ý

`phase-18.md` §5 viết **"Chạy: tuần tự một luồng"**. Chủ dự án đổi quyết định trong phiên
(*"spawn ra các subagent để làm song song cùng đẩy nhanh tiến độ, nhớ cẩn thận kẻo xung đột"*),
nên bốn lane chạy song song trên **cùng một cây làm việc**.

Cây dùng chung là chỗ mất việc **im lặng**: hai lane ghi một file thì lane sau ĐÈ lane trước —
không dấu xung đột, không lỗi staging, thường không cả lỗi biên dịch, vì bản sống sót là mã hợp
lệ. Nó chỉ lộ ra sau, khi ai đó nhận ra phần của mình biến mất. Nên quyền sở hữu chia **theo
tên file**, không theo "tính năng", và bản đồ nằm ở đây thay vì tản trong bốn brief.

| Lane | Sở hữu | Surface copy |
|---|---|---|
| **A** Builder UI (khối 2+3) | `apps/web/src/components/games/git/**` | `surfaces/author.ts` |
| **B** OJ server cho Git (khối 4, nửa máy chủ) | `apps/web/src/server/problems/**`, `packages/games/src/git/problem-plugin.ts` | `surfaces/problem.ts` |
| **C** Tài liệu (khối 7) | `docs/oj-format.md`, `docs/exam-format.md`, `docs/games/README.md` | — |
| **D** Lọc chủ đề theo game (khối 6) | `apps/web/src/app/(session)/problems/**`, `packages/games/src/problem-topic-labels.ts`, `packages/games/src/git/problem-topics.ts` | `surfaces/catalog.ts` |

**Lead giữ, không lane nào chạm:** `packages/copy/src/registry.ts` (chính file đó tự dặn "CHỈ L0
SỬA") · `packages/games/src/index.ts` · `packages/ui/src/index.ts` · `apps/web/e2e/routes.ts` ·
`apps/web/src/server/db/schema.ts` + mọi migration · `plans/devops-learning-platform/phase-18*.md`.

**Vì sao chia surface copy một-file-một-lane:** `registry.ts` đã lập sẵn lối này cho bảy lane của
P16 và ghi lý do ngay đầu file. Khoá copy mang tiền tố khớp surface, nên mỗi lane chỉ ghi vào file
của mình; cần khoá ở surface khác thì DỪNG và báo lead, chứ không tự mở.

**Khối 4 nửa CLIENT (chế độ chơi bài OJ trong `GitGame`) và khối 5 (E.5 lưu thành Problem) KHÔNG
giao cho lane nào.** Cả hai đụng vào file mà lane A và lane B đang sở hữu ở hai phía khác nhau,
nên chúng là đuôi tuần tự của lead sau khi A và B hạ cánh. Chia nhỏ hơn nữa để ép song song sẽ
tạo ra đúng loại phụ thuộc vòng mà bản đồ trên dựng ra để tránh.

## 2.2 Nợ chéo lane — `ProblemFilter.topics` còn khoá vào K8s (lane D báo, lead đã tra lại)

Lane D đo được và lead xác nhận từng dòng, 2026-09-15. Ba chỗ chặn ô gác *"bài Git lọc được
theo chủ đề Git"*, và **cả ba đều nằm ngoài vùng sở hữu của lane D**:

| # | Chỗ | Đo được |
|---|---|---|
| 1 | `packages/games/src/k8s/problem.ts` § `ProblemFilter` | `topics?: readonly ProblemTopic[]` — union ĐÓNG 9 chủ đề K8s. `'branching'` không gán được ⇒ đỏ ở `tsc`, trước cả lúc chạy |
| 2 | `apps/web/src/server/problems/list-input.ts:28` | `z.array(z.enum(PROBLEM_TOPICS))`. `safeParse({topics:['branching']})` → `invalid_value` |
| 3 | cùng file, `.strict()` | `{gameId:'git'}` → `unrecognized_keys`. Chỉ cần nếu sau này bộ chọn game LỌC danh sách bài |

**Đây là NỢ của 18.A, không phải một quyết định cần bàn.** `core/problem.ts:81` đã khai
`ProblemTopicId = string` và `:304` đã dùng `readonly ProblemTopicId[]` cho `topics` — hợp đồng
đã chuyển sang tập-đóng-theo-plugin từ 18.A. `ProblemFilter.topics` là mẩu sót lại của chính
lượt chuyển đó, và nó lọt qua vì ô AC-A chỉ đo `packages/games/src/core/` chứ không đo
`k8s/problem.ts`.

**Hoãn có chủ ý, không phải bỏ quên.** (1) và (2) là MỘT thay đổi: `ProblemFilter` được
`list.ts`/`list-where.ts` tiêu thụ, mà lane B đang ghi vào `server/problems/**` cùng lúc. Nới
kiểu giữa chừng có thể làm `tsc` của lane B đỏ vì một thay đổi họ không gây ra — một lỗi đến từ
ngoài lane là thứ đắt nhất để chẩn đoán. **Lead làm cả hai một lượt, sau khi lane B hạ cánh.**

Không mất gì khi hoãn: lane D đã hạ cánh bản **tự khỏi** — bộ chọn game chỉ liệt kê game nào có
chủ đề mà hợp đồng chở được, suy lúc chạy chứ không chốt cứng, nên `/problems` hôm nay không đổi
hình và Git tự hiện khi hợp đồng nới. Kèm một pin `@ts-expect-error` làm `tsc` đỏ đúng lúc (1)
được nới. Pin đó phải được **gỡ**, không được dập cho im — `rules/pinned-baseline-test-companion.md`.

## 3. Ràng buộc mang theo từ các lane trước

Không phải lời khuyên chung — bốn thứ này đã cắn ít nhất một lần trong chính phase này:

1. **Chạy `typecheck` RIÊNG, đừng chỉ chạy `test`.** `phase-18.md` §3: ba ô gác cho bất biến
   nguy hiểm nhất là cổng ở tầng KIỂU, đỏ ở `tsc` và xanh ở `vitest`. Lane 18.G vi phạm đúng
   điều này (`7bf45a3`).
2. **`packages/games` CỐ Ý không khai `@types/node`.** Mọi phép dò đọc đĩa phải đặt ở
   `apps/web`. Thêm `@types/node` vào `games` là mở đường cho engine `import node:fs`.
3. **Đọc `Tasks: X/Y` trước khi trích bất kỳ con số test nào** — turbo dừng sau task đỏ nên
   suite sau CHƯA CHẠY.
4. **Route group không chia sẻ layout.** Một thư mục mới dưới `(session)` thừa hưởng KHÔNG gì
   cả — `/exams` đã 500 vì thiếu `TrpcQueryProvider` trong khi tsc/lint/2315 test/`next build`
   đều xanh (`0ec25ce`).

## 3.1 Kết quả fan-out (2026-09-15, sau khi cả bốn lane dừng)

18 commit. Bốn lane đều **chạm trần lượt** (C ở 20, A và B ở 90) — không lane nào dừng vì
hết việc, nên mọi thứ dưới đây là thứ hạ cánh được trong ngân sách, không phải thứ đã xong.

| Khối | Trạng thái |
|---|---|
| 1 lõi Builder (`level-draft`, `solvability`) | xong, `a495c94` |
| 2+3 UI Builder (E.1–E.4, E.6, E.7, E.2, E.3) | xong, `0af1b26` `0f60d7f` `8ebac96` `a06cc7a` |
| 4 OJ server cho Git | xong, `8e9246e` `9d7947f` `3340420`, cộng đường HTTP `bc18b81` |
| 6 lọc chủ đề theo game | xong, `33d195d` + nới hợp đồng `6df846e` |
| 7 tài liệu 18.H | xong, `ef45614` |
| **5 (E.5 lưu thành Problem)** | **chưa** — cố ý không giao lane |
| **4 nửa client (chơi bài OJ trong GitGame)** | **chưa** — cố ý không giao lane |

### Ba bài học về chính cách chạy song song

1. **Một lane có thể dừng RỖNG.** Lane C tiêu trọn 20 lượt và 288K token để đọc mã rồi dừng
   với **0 file trên đĩa**. Brief của lead nhấn "đọc mã, đừng chép plan" mà không nói "ghi
   sớm rồi tinh sau", và một brief nghiên-cứu-nặng đọc ra thành giấy phép đọc mãi.
2. **Đừng giao lệnh mà bề mặt công cụ của agent không có.** Cùng lane C viết đủ file rồi
   **không commit được vì Bash bị tắt trong phiên của nó**. Lead phải commit hộ. Kiểm công cụ
   của agent trước khi viết phần "kỷ luật git" vào brief.
3. **Cây dùng chung làm phép đo hết hạn trong vài phút.** Lane D đo `tsc` xanh lúc 10:17 rồi
   `next build` đỏ lúc 10:21, vì lane A ghi vào giữa hai lượt. Mọi con số trong báo cáo lane
   phải kèm mốc giờ, và một lượt chạy toàn suite giữa lúc ba lane đang sửa dở **không đo được
   gì** về trạng thái đã commit.

### Bản đồ sở hữu: giữ được, một va chạm duy nhất và nó ở tầng thiết kế

Không lane nào ghi đè lane nào. Va chạm duy nhất là **hai bản của cùng một luật**: lead và
lane B cùng viết phép kiểm "`gameId` của nhật ký phải khớp `gameId` của bài", ở hai tầng khác
nhau. Bản của lane B đặt đúng chỗ hơn (tầng hàm, bảo vệ mọi caller) nên bản của lead bị gỡ.
Loại va chạm này **bản đồ theo tên file không chặn được** — nó cần contract-first, và cái
contract thiếu ở đây là *"luật này sống ở tầng nào"*.

## 3.2 Đợt hai (khối 4 nửa client + khối 5) — xong, và một khe không đoán được

Hai khối cố ý giữ lại ở §2.1 nay đã hạ cánh. Cả hai lane lại **chạm trần 90 lượt**.

| Khối | Trạng thái |
|---|---|
| 4 nửa client — `/games/git?problem=` | xong, `9fe0d21` `7a0e4dc` `292c11b` |
| 5 — E.5 lưu bản nháp thành `problems` | xong, `74707c8` `e6a3375` `d66620a` `1b8e85e` |
| Lead vá theo | `9a8ea17` `65c97e0` (đường mở bài theo game) |

### ⛔ Khe WIRE làm đổi phạm vi giao được của khối 4

`toTestcaseTeasers` cắt `check` và `args` của **MỌI** testcase trước khi dữ liệu rời máy chủ —
kể cả testcase hiện, kể cả với tác giả. Đó là §18.B.4 và nó cố ý.

Hệ quả dây chuyền mà không ai thấy trước khi viết mã: client không có `check` ⇒
`evaluatePredicate` trả `undefined` ⇒ `objectivesMet` luôn rỗng ⇒ `verifyRun` ra `khong-khop`
⇒ **`CE` cho một lượt chơi ĐÚNG**. Tức một client chỉ có `problems.byCode` **không nộp bài
được**, và triệu chứng đọc ra như hệ thống từ chối người chơi ngẫu nhiên.

Đường duy nhất chở đủ dữ liệu hôm nay là `problems.forEdit` (`authorProcedure`). Nên **nộp bài
Git hiện mở cho TÁC GIẢ bài và admin**; người học vẫn mở bài, đọc đề, gõ lệnh trên đúng thế
giới của bài, nhưng nút nộp tắt và màn hình **nói ra lý do** thay vì bấm được rồi trả `CE`.

**Cần chủ dự án quyết** (§4.1 dưới). Hai đường: một điểm cuối trả `check`/`args` cho người đang
làm bài (phá §18.B.4), hay một điểm cuối **chấm thử** ở máy chủ để client không bao giờ cầm
cách chấm (giữ §18.B.4 nguyên vẹn).

### Bốn chỗ nữa vẫn tin mã bài luôn là `K8S-`

Brief của lane nói ba; đo ra bốn. `next-code.ts`, `problemCodeSchema` (kéo theo
`byCode`/`publish`/`archive`/`delete`/`forEdit`/`revealHint`/`submit`), hai chỗ giải mã con
trỏ ở `cursor.ts`, và `[code]/page.tsx` (một bài Git lưu xong trả `notFound()` — lead vá ở
`65c97e0`). Tập tiền tố nay suy từ `PROBLEM_PLUGINS`, không gõ tay.

⚠ `.slice(4)` từng đúng **vì tình cờ**: `len('K8S-') === len('GIT-')`. Tiền tố đầu tiên dài
khác sẽ cho `Number` → `NaN` → `padStart` in `"NaN"`, một mã chèn được mà không cổng nào đỏ.

## 4. Ô nghiệm thu của đợt

- **AC-5** (`phase-18.md` §3): dựng một level chương 1 hoàn chỉnh **chỉ bằng giao diện**, xuất
  ra, nạp lại, chơi được, và `solutionCommands` cho AC.
- **E.7 đối chứng dương:** một level có đích không với tới được bằng lời giải khai ⇒ báo đỏ,
  và câu báo nói đúng testcase nào không đạt.
- **AC-2:** `turbo run build lint typecheck test --force` đọc `Tasks: X/Y`.
- **AC-8:** axe 0 vi phạm trên màn Builder.
- **18.H:** hai file tài liệu tồn tại và mọi đường dẫn trong đó tra lại được.

### Đo được cuối đợt (2026-09-15, cây sạch, `dlp-postgres` chạy)

```
turbo run build lint typecheck test --force --concurrency=2
Tasks: 32 successful, 32 total

web 2448 · games 1334 · ui 932 · scenario 289
terminal 133 · motion 110 · copy 72 · shared-types 48   = 5366 ô, 0 skip
```

⚠ **`--concurrency=2` là bắt buộc để con số này có nghĩa**, không phải một tuỳ chọn cho đẹp.
Ở mức song song mặc định, `scenario#lint` thoát **134** (SIGABRT) và bốn ô `scenario` hết giờ
5000ms trên test đọc đĩa; `packages/ui` rụng một file. Chạy riêng từng gói thì cả ba xanh.
Đây là `rules/turbo-parallel-load-times-out-io-tests.md`, và nó làm `Tasks: X/Y` dừng ở 22–26
— tức **mọi con số trong lượt đó vô giá trị**.

⚠ **Postgres phải chạy.** Không có nó, suite web đỏ 110 ô với 1616 lần `ECONNREFUSED`, và
**184 ô khác SKIP** — một màu xanh chứng minh ít hơn nó trông. Với `dlp-postgres` lên thì
2441/2441, **0 skip**.

## 4.1 Quyết định

### ✅ ĐÃ CHỐT — người học nộp bài Git qua điểm cuối CHẤM THỬ ở máy chủ (2026-09-15)

Chủ dự án chọn giữa ba đường; hai đường kia bị loại vì nguyên tắc chứ không vì công sức. Mở
`check`/`args` cho người đang làm bài **phá** §18.B.4 (ai mở tab Network cũng lập trình ngược
được điều kiện chấm); chỉ trả testcase HIỆN thì client vẫn không khai đủ `objectivesMet` nên
`verifyRun` phải nới, tức đụng đúng cổng chống gian lận.

`problems.tryGrade` (`96bf6ef`) phát lại nhật ký ở máy chủ và trả `passed`; client
(`c3588a0`) bỏ hẳn `forEdit` và không bao giờ cầm cách chấm. §18.B.4 giữ nguyên vẹn.

**Ba cái giá, ghi ra vì không cái nào hiện trên màn:**

1. **Trần nhịp phải DÙNG CHUNG với `submit`.** `passed` chở id của cả testcase ẩn, nên bucket
   riêng biến đây thành máy tra đáp án: gõ thử, đọc case ẩn nào vừa xanh, lặp. Chung bucket làm
   tổng lượt dò (thử + nộp) ≤ 6/phút — không rộng hơn việc dò bằng cách nộp đi nộp lại.
2. **Một lần bấm "Nộp bài" là HAI lượt gọi**, cả hai tiêu một suất ⇒ trần nộp thật 3 lần/phút.
3. **Lời khai nay là tiếng VỌNG của máy chủ**, nên phép so `objectivesMet`/`score` trong
   `verifyRun` **không còn là nhân chứng độc lập** cho bài Git. Thứ vẫn gác thật: hai lượt phát
   lại (tính tất định), cộng `levelId`/`seed`/`commandsUsed`/`hintsUsed` — cả bốn suy từ chính
   NHẬT KÝ chứ không từ máy chủ.

⚠ Dò bằng nộp để lại DÒNG trong `problem_submissions` nên nó nhìn thấy được; dò bằng chấm thử
không ghi gì nên nó **vô hình**. Nếu một ngày cần thấy, chỗ thêm là một bộ đếm, không phải một
dòng `problem_submissions` giả.

### ✅ ĐÃ ĐÓNG — tiền tố mã và `game_id` không lệch được nữa (2026-09-15, `0f086de`)

Mục này từng đặt câu hỏi dưới dạng nhị phân — *"giữ nguyên, hay cấp lại mã khi đổi game (phá
tính ổn định vĩnh viễn)?"* — và **cả hai vế đều không cần thiết**, vì nó bỏ sót đường thứ ba:
**đừng cho đổi game.**

`assertGameIdUnchanged` nay chặn vô điều kiện, bỏ mốc "đã có lượt nộp". Lý lẽ của cổng cũ
(*"thứ không được phá là LỊCH SỬ CỦA NGƯỜI HỌC"*) đúng nhưng chỉ đếm MỘT trong hai thứ bị phá;
thứ thứ hai là chính mã bài, và nó vỡ ở **mọi** lượt đổi game kể cả bài chưa ai nộp. Chú thích
của cổng cũ đã nói ra câu trả lời mà không áp dụng nó: *"đổi ruột dưới một mã cũ là đổi nghĩa
của mọi câu đã nói về nó."*

⚠ **Không siết gì với người dùng:** `problem-editor.tsx` đã truyền `canChange={props.code === null}`
từ trước, nên biểu mẫu vốn cấm; chỉ API là còn rộng hơn màn hình. Cái giá thật: tác giả chọn
nhầm game trên một bản nháp phải tạo bài mới — vài giây, và một số thứ tự bỏ trống trong dãy mã
là chuyện bình thường.

Phép lọc theo TIỀN TỐ MÃ ở `next-code.ts` **giữ nguyên**, không đổi sang `game_id`: một DB đã
chạy trước lượt siết có thể còn dòng lệch, và lọc theo một cột không-phải-khoá-chính để tìm
`max` của khoá chính là đúng nhờ một bất biến ở chỗ khác thay vì đúng tự thân.

## 4.2 Nợ đã ghi tên, không chặn ai hôm nay

- **`allowedCommands` mất khi lưu thành bài.** `ProblemBase` không có ô cho nó; tệp level xuất
  ra thì giữ, bài lưu DB thì mất, và người soạn không được báo. Chỗ đúng là `authorFields` của
  plugin (§18.A.3).
- **Đường OJ của K8s — ba lỗi đã vá (`4bceeb9` `32ea4fa`), nhưng xem §6: nó NỘP được chứ chưa
  CHẤM đúng.** Hai lỗi mục này ghi (`arena-entry` chọn level trong `LEVELS`; `use-problem-submit`
  gọi `api.*` không provider) cộng lỗi công thức điểm ở gạch đầu dòng dưới — cả ba đã đóng.
- **`buildRunResult` dùng `computeScore`, máy chủ dùng `scoreProblemRun`** — đã vá cùng lượt
  (`k8sOjClaim` gọi đúng hàm máy chủ gọi). `buildRunResult` giữ nguyên và vẫn đúng cho chế độ
  LEVEL. Ghi chú của mục này *"chưa cắn ai vì đường trên chưa chạy, nhưng nó sẽ cắn đúng lúc
  đường đó được sửa"* đã đúng y như vậy — nên ba lỗi được vá trong MỘT lượt thay vì ba.
- **Chưa ô nào đo rằng mở Level Builder không gọi mạng.** Lời hứa "0 lời gọi backend" của trụ
  cột game hiện được giữ bằng một ô gác TĨNH đọc nguồn (đòi `await import`), không bằng một phép
  đo lúc chạy.

---

## 5. Đợt ba (2026-09-15) — khối B+C, và một lời tuyên bố phải rút lại

`/t1k:cook` trên khối **B+C** (§4.2: "đường OJ của K8s không chạy được" + công thức điểm lệch),
cộng quyết định §4.1 mà chủ dự án giao lại cho người thi hành tự xử lý.

| Commit | Việc |
|---|---|
| `4bceeb9` | `problem-level.ts` + `arena-problem.tsx` + ô gác so hai bản dựng level |
| `32ea4fa` | Nối chế độ bài tập vào đường chấm máy chủ; gỡ tự-nộp-khi-thắng |
| `0f086de` | Khoá `game_id` sau khi tạo bài (§4.1) |
| `c4fa97a` | Vá C1 (đấu trường ném khi CHỌN level) + siết hai chỗ trong ô gác |

### 5.1 Đo được (cây sạch tại `0f086de`, 13:43:58 → 13:50:39 +07)

```
turbo run build lint typecheck test --force --concurrency=2
Tasks:  32 successful, 32 total      exit 0      6m37s

web 2467 · games 1334 · ui 932 · scenario 289
terminal 133 · motion 110 · copy 72 · shared-types 48   = 5385 ô, 0 skip
```

Ba phép kiểm chống-xanh-giả: `Tasks: 32/32` đọc TRƯỚC mọi con số test · đúng một dòng khớp chữ
`skip` trong toàn log và nó là **tên file** (`me-history-skipped.test.ts`), không phải ô bị bỏ ·
32 dòng khớp `ERROR` đều là chuỗi `INTERNAL_SERVER_ERROR` trong một test cố tình đo phép ánh xạ
lỗi gRPC. So mốc 5366/web 2448: **web +19, đúng bằng số ô thêm vào**, bảy gói còn lại không đổi
một ô — tức bản vá không chạm gì ngoài phạm vi.

⚠ Một phiên Claude KHÁC đang mở trên cùng repo lúc đo. `HEAD` và `git status` giống nhau trước
và sau lượt chạy, nên con số trên mô tả đúng `0f086de` — nhưng phép kiểm đó phải làm, không phải
một thủ tục thừa (§3.1 bài học 3).

### 5.2 ⛔ RÚT LẠI một lời tuyên bố: "đường OJ K8s chạy được" là QUÁ MẠNH

Thông điệp của `4bceeb9` nói đường OJ K8s **chạy được**. Review đối kháng bác bỏ, và phép đo
đứng về phía review. Câu đúng là: **nộp được, chưa chấm đúng.**

Ghi ra đây thay vì sửa lặng lẽ, vì đây đúng hình dạng `rules/green-that-proves-nothing.md` và
người viết chính là người rơi vào: ba loại ô gác của lượt này — so-builder-với-builder, mock trọn
`lib/trpc-react`, và phát-lại-so-phát-lại — **không ô nào có thể phủ định lời tuyên bố đó**. Một
lời tuyên bố mà bộ ô gác của chính nó cấu trúc không thể bác bỏ thì chưa được kiểm.

### 5.3 ✅ ĐÃ ĐÓNG — C2: phép phát lại K8s không bao giờ tua đồng hồ

**Chốt bởi chủ dự án 2026-09-15: ghi nợ chặn, sửa ở chặng riêng.** Không vá trong đợt ba.
Chặng riêng đó là **đợt bốn** — xem §6. Mô tả chuỗi lỗi dưới đây giữ nguyên vì nó
đúng, nhưng **câu về cái giá của bản vá thì sai** (§6.2).

Chuỗi, đọc thẳng từ mã:

| Chỗ | Mã |
|---|---|
| `k8s/session.ts:260` | `const stamped = { ...action, tick: state.tick }` — tick ĐÃ GHI trong nhật ký bị vứt |
| `k8s/reducer.ts:121` | `advance(state, Math.max(0, action.tick - state.tick))` ⇒ luôn `0` |
| `k8s/replay-engine.ts` | phát lại gọi `session.dispatch(action)`, tức đi qua `applyAction` ở trên |
| `k8s/session.ts:175` | `autoTick` mặc định `true` (chơi thật), phát lại truyền `false` |

Chơi thật: đồng hồ chạy, action được đóng dấu tick tăng dần → nhật ký có tick thật. Phát lại:
đồng hồ đứng ở 0, mọi tick bị ghi đè về 0, không tick nào tua. Pod sinh ra `Pending` và chỉ lên
`Running` trong `tick.ts`, nên mọi vị từ đòi `Running` (`deployment-ready`, `all-pods-healthy` —
bài published thật đang dùng) **không bao giờ đạt**.

⚠ **Triệu chứng KHÔNG phải `CE`, mà là `WA` im lặng.** Lời khai của client nay tới từ
`problems.tryGrade`, tức từ chính phép phát lại hỏng đó, nên hai bên **khớp nhau ở một câu trả
lời sai** và `verifyRun` vẫn `da-xac-minh`. Người học giải đúng, nhận `WA`, không có gì nói tại
sao.

Vì sao không vá kèm: bỏ ghi đè tick nghĩa là **tin lại tick do client gửi lên**, mở một đường
DoS (tick khổng lồ ⇒ `advance()` đốt CPU) mà chính phép ghi đè đang đóng. Nó cần một quyết định
về trần, một ô ghè riêng, và một lượt review nữa — `MAX_LOG_ACTIONS` chặn SỐ hành động, không
chặn ĐỘ LỚN của tick.

**Ô phải ĐỎ trước khi vá:** một lời giải đúng cho một bài dùng `deployment-ready` phải ra `AC`.
`replay.test.ts:223` không bắt được C2 vì nó tính kỳ vọng **bằng chính phép phát lại** — một ô
tự điều chỉnh.

### 5.4 Nợ kèm theo, không chặn

- **C3 — mở gợi ý trong đấu trường hiện chuỗi RỖNG.** Wire trả `text: null` cho gợi ý chưa mở,
  và đấu trường **không bao giờ gọi `problems.revealHint`** (`grep "api\." k8s-arena/` ra đúng ba
  lời gọi: `byCode`, `submit`, `tryGrade`). Điểm trừ thì có thật (suy từ nhật ký), nên không `CE`
  — người học mất điểm để đổi lấy một ô trống.
- **`objectivesTotal` KHÔNG nằm trong sáu trường `verifyRun` so.** Hai bên lệch trường đó thì
  không ô nào đỏ.
- **`K8S_UNSEEDED_REPLAY_SEED` là mã chết** — đấu trường luôn sinh seed `Math.random()`
  (`arena-session.ts:133`), nên `seedable` chưa ai đọc ở đường K8s.
- ~~**Không ô nào chứng minh chế độ LEVEL render được.**~~ ✅ **ĐÓNG ở đợt bốn, và câu này
  SAI như đang viết** — `games.spec.ts` đã bấm level ở ba ô từ trước C1. Khe thật thấp hơn một
  tầng: ô đó **chưa bao giờ chạy ở CI**. Xem §6.2.

### 5.5 Bài học về cách đo, không phải về mã

1. **Một ô mock trọn biên ngoài chỉ đo được mã GIỮA hai biên đó.** Ô dom cũ khẳng định "một lượt
   chơi thắng dẫn tới đúng một lời gọi `problems.submit`" và XANH suốt thời gian chế độ bài tập
   hoàn toàn không chạy được — cả ba lỗi thật đều nằm ngoài tầm nó.
2. **Ô gác viết xong xanh ngay đáng ngờ hơn ô đỏ vài lượt.** `problem-level.test.ts` đỏ BỐN lượt
   liên tiếp — `args`, `hints`, `label` testcase ẩn, rồi tên vị từ bịa — mỗi lượt lộ một sự thật
   của wire mà người viết không biết. Bốn khác biệt được phép là số ĐO ĐƯỢC, không phải lời khai.
3. **Fixture nghèo làm đối chứng dương rỗng nghĩa.** Bản đầu dùng `replicasAtLeast`/`noCrashLoop`
   — không tên nào có trong `PREDICATE_NAMES` (32 khoá kebab-case). Hai bản dựng chỉ CHÉP chuỗi
   đó qua nên ô vẫn xanh; nay có một ô đòi mọi `check` của fixture thật sự nằm trong bảng.
4. **Một lane dừng RỖNG vẫn tiêu trọn ngân sách.** Lượt review đầu tiêu 25 lượt rồi để lại một
   file ba dòng *"review in progress"*. Brief lượt sau mang kỷ luật giao hàng — ghi phát hiện đầu
   tiên vào file NGAY sau câu hỏi đầu tiên — và nó giao đủ bảy câu. Đây là §3.1 bài học 1 lặp lại
   lần thứ hai trong cùng một phase.

### 5.6 Đo lại sau `c4fa97a` — và hai sự cố của chính phép đo

Số ở §5.1 đo tại `0f086de`. Sau `c4fa97a` phải đo lại, và hai lượt đầu ĐỎ vì hai lý do khác nhau.

**Lượt 1 — `Tasks: 28/31`, `@devops-platform/web#lint` đỏ.** Một `import { useProblemSubmit }`
sót lại ở `arena-overlays.tsx` sau khi hook chuyển sang panel (vá ở `22cc5a8`).

⚠ Trước lượt đó tôi đã chạy `typecheck` (exit 0) và 211 ô k8s-arena (xanh) rồi báo là xong.
**Cả hai phép ấy mù với một biến thừa** — chỉ `eslint` bắt. Đúng
`rules/lane-work-never-runs-package-lint`, dẫm lại trong cùng phiên đã đọc nó. Và vì turbo dừng
sau task đỏ, `web:test` lượt đó **chưa hề chạy**: ai chỉ đọc "không thấy dòng nào đỏ" mà bỏ qua
`Tasks: X/Y` sẽ trích lại con số test của một HEAD khác.

**Lượt 2 — `Tasks: 28/31`, một ô web đỏ: `lessons-authz.test.ts › phân trang bằng cursor đi hết
danh sách`.** `InvalidCursorError: bai-1789456432419-tfx7q7`.

Không phải hồi quy, và đây là bằng chứng chứ không phải lời khai: ô nằm ngoài mọi file đợt này
chạm, và chạy RIÊNG thì **22/22 xanh**. `composite-source.ts:420` chỉ ném `InvalidCursorError`
khi **không nguồn nào nhận ra cursor VÀ không nguồn nào lỗi** — tức mục cursor trỏ tới đã biến
mất thật giữa hai trang. Mã cursor mang dấu thời gian, tức một fixture: hình dạng
`leaked-fixtures-made-gates-measure-emptiness`, nổi lên khi hai tiến trình cùng ghi vào một DB
(một phiên Claude khác đang mở trên cùng repo, 20 tiến trình node lúc đo).

**Lượt 3 — xanh.** `Tasks: 32 successful, 32 total`, exit 0, 3m46s, cùng bảng số §5.1
(web 2467 · tổng 5385 ô · 0 skip), chạy trên đúng nội dung nay là `22cc5a8`.

⚠ **Ghi flake kèm số lần, không im lặng cho qua:** `lessons-authz` đỏ **1 trong 3** lượt toàn
suite. `git log -S` không thấy lịch sử sửa ô này, nên nó chưa từng được nhận diện là lung lay.
Một ô đỏ dưới tải đồng thời mà xanh khi chạy riêng vẫn là một ô CÓ THẬT sẽ đỏ trong CI — chỗ
đúng để sửa là cách ly fixture, không phải một lượt chạy lại.

---

## 6. Đợt bốn (2026-09-15) — C2 đóng, trần tick, và ô e2e cuối cùng được CHẠY

Phạm vi chốt bởi chủ dự án: **C2 + trần tick + ô e2e chế độ LEVEL**. C3 và ba món
nợ nhỏ ở §5.4 để lại, có chủ ý.

| Commit | Việc |
|---|---|
| `0f5da8d` | C2: phát lại tua đồng hồ; `honorActionTick`; `MAX_REPLAY_TICK = 1_000_000` gác hai tầng |
| `4acfec0` | Ô e2e bấm-level, và nối nó vào lệnh CI thật sự gọi (`e2e:a11y` → `e2e:ci`) |

### 6.1 Đo được (cây sạch tại `4acfec0`, HEAD không đổi trước/sau lượt đo)

```
turbo run build lint typecheck test --force --concurrency=2
Tasks: 32 successful, 32 total      exit 0      5m11s

turbo run test --force --concurrency=2
Tasks: 15 successful, 15 total      exit 0

web 2472 · games 1340 · ui 932 · scenario 289
terminal 133 · motion 110 · copy 72 · shared-types 48   = 5396 ô, 0 skip
```

So mốc §5.1 (5385): **+11, đúng bằng số ô thêm vào** — 6 ở `games` (2 cho C2, 4 cho
trần), 5 ở `web` (cổng wire). **Bảy gói còn lại không đổi một ô**, tức bản vá không
chạm gì ngoài phạm vi. Đúng một dòng khớp chữ `skip` trong toàn log và nó là **tên
file** (`me-history-skipped.test.ts`), cùng đối chứng §5.1 đã dùng.

`e2e:ci` chạy riêng: exit 0, 55 passed, ô mới **không** nằm trong 27 ô skip. 27 ô đó
là các màn role-gated đã biết từ §0.5 (cần `E2E_REQUIRE_ROLES=1` + tài khoản admin
thật) — không phải thứ đợt này gây ra.

### 6.2 ⛔ HAI lời trong plan phải rút lại

**(a) "Bỏ ghi đè tick sẽ mở một đường DoS mà chính phép ghi đè đang đóng" (§5.3) — SAI.**

Phép ghi đè chỉ chạm `tick`, **không** chạm `ticks` của action `wait`, mà
`reducer.apply` gọi thẳng `advance(state, action.ticks)`. Đối chứng chạy với phép ghi
đè **còn nguyên**:

```
tick TRUOC=0 SAU=50000   (client gửi ticks=50000)
```

Lỗ hổng đã mở sẵn qua một cửa khác. Trần tick là **nợ CŨ**, không phải phí tổn của
bản vá C2 — và điều đó làm C2 rẻ hơn plan tưởng, không đắt hơn.

Đáng ghi vì lý do ngoài kỹ thuật: câu sai ấy là thứ **giữ C2 nằm lại làm nợ chặn**.
Một cái giá được ước lượng quá cao cũng hoãn việc y như một rủi ro có thật.

**(b) "Không ô nào chứng minh chế độ LEVEL render được" (§5.4) — SAI như đang viết.**

`games.spec.ts` gọi `chooseLevel(...)` ở ba ô, từ trước C1. Khe thật thấp hơn một
tầng: job CI `web-a11y` gọi `e2e:a11y`, và script đó liệt kê đúng `a11y.spec.ts
csp.spec.ts`. **Không lệnh nào trong repo gọi `games.spec.ts`.** C1 sống sót vì thế,
không vì thiếu người viết ô.

⚠ Đây là lần **thứ tư** trong cùng một phase mà bảng nợ trích một câu đã lạc hậu
(`rules/debt-lists-quote-stale-docs.md`; ba lần trước ở §0.5 và §3.1). Bốn lần thì
không còn là xui — quy tắc rút ra: **một dòng nợ phải được TRA LẠI trước khi giao
việc theo nó**, và lời sửa ghi cạnh dòng cũ chứ không đè lên.

Bài học đắt hơn cả hai bản vá: **một spec không nằm trong lệnh nào CI chạy thì không
phải cổng, nó là tài liệu.** `password-reset.spec.ts` đã tự ghi đúng nhận xét đó về
chính nó từ trước, và không ai đọc. Danh sách spec trong `e2e:ci` **LÀ** ranh giới
giữa cổng và tài liệu.

### 6.3 Ba phép đo đã đổi một quyết định

1. **`advance()` chạy ~927.000 tick/giây** trên level rẻ nhất, và `z.number()` nhận
   `1e12` (chỉ `Infinity`/`NaN` bị chặn) ⇒ **~12 ngày CPU cho một lượt nộp**. Con số
   này chốt trần ở 1.000.000 thay vì con số đối xứng đẹp 20.000 (`MAX_LOG_ACTIONS`):
   ở `TICK_MS = 500` thì 20.000 chỉ là ~2,8 giờ chơi, mà đồng hồ `autoTick` **vẫn
   chạy khi tab nằm nền** — một tab để qua đêm đã ăn hàng chục nghìn tick.
2. **Trần phải đặt trên tick TUYỆT ĐỐI**, không trên khoảng cách mỗi bước. 20.000
   action hợp lệ, mỗi cái nhảy 1e6, vẫn ra 2e10 tick.
3. **C2 có HAI cửa.** `problem-plugin.ts:gradeK8sProblem` cũng dispatch qua session
   với `autoTick: false` và **không** đi qua `sessionReplayEngine`. Vá mỗi cửa kia
   thì `verifyRun` tua đúng còn `grade` vẫn đứng im — hai nửa của cùng một lượt nộp
   trả lời khác nhau. Brief nói một cửa; đo ra hai.

### 6.4 Nợ còn lại, không chặn ai hôm nay

- **C3** (§5.4) — đấu trường không bao giờ gọi `problems.revealHint`; người học mất
  điểm để đổi lấy một ô trống. Chưa làm, ngoài phạm vi đợt.
- **`objectivesTotal`** không nằm trong sáu trường `verifyRun` so. Chưa làm.
- **`K8S_UNSEEDED_REPLAY_SEED` là mã chết.** Chưa làm.
- **`lessons-authz` lung lay** (§5.6) — không tái hiện trong đợt này, nhưng cũng
  không có lượt chạy nào dưới tải đồng thời để bác bỏ. Vẫn mở.
- ⚠ **Một lượt `eslint` OOM** (exit 134) ngay sau `next build` + `e2e:ci`, rồi xanh
  khi chạy lại mà không sửa gì (1 trong 2 lượt). Giả thuyết "eslint duyệt 290MB
  trace của playwright" **đã bị bác bỏ** — `**/e2e/.artifacts/**` vốn nằm trong
  `ignores`. Nguyên nhân **chưa xác định**; ghi kèm số lần thay vì im lặng cho qua.

### 6.5 Về cách đo, không về mã

**Ô gác viết TRƯỚC, và nó đã ĐỎ đúng chỗ** — `expected [] to include
'deploy-san-sang'`, `objectivesMet` rỗng hoàn toàn. Ba quyết định làm nó không thể
xanh-giả, và mỗi cái đóng một đường đã cắn trong phase này:

1. **Chạy trên `createSession` THẬT.** C2 nằm đúng trong phần mà mọi session giả
   thay thế, nên một ô dựng trên session giả **cấu trúc không thể** bác bỏ lời
   tuyên bố nó đang gác (§5.5.1, lặp lại).
2. **Kỳ vọng viết TAY.** `replay.test.ts` lấy kỳ vọng từ `objectivesFrom(...)`, tức
   so phép phát lại với chính nó — nên nó xanh y nguyên suốt thời gian C2 sống.
3. **Fixture dùng đồng hồ, không dùng `wait`.** `wait` là đường DUY NHẤT còn tua
   được khi C2 chưa vá, nên một fixture dùng `wait` sẽ xanh giả và không gác gì.

**Mọi cổng mới đều đã được đo ở trạng thái ĐỎ**, không chỉ ở trạng thái xanh:

| Cổng | Cách làm nó đỏ | Kết quả |
|---|---|---|
| C2 | chạy trước khi vá | `expected [] to include 'deploy-san-sang'` |
| Trần wire | gỡ `superRefine` + `.int().nonnegative()` | 4 ô đỏ đúng tên, ô "tick bình thường đi qua" giữ xanh |
| `phat-lai-loi` | hạ tick xuống dưới trần | `da-xac-minh` — tức ô kia đỏ vì đúng cổng trần, không vì lệch `levelId` |
| e2e bấm-level | tái hiện C1, dựng lại | `Unable to find tRPC Context...` |

Một cổng chỉ được đo ở trạng thái xanh là một cổng chưa biết có chặn được gì không.

### 6.6 CI xanh — và hai chỗ phép đo của §6.1 tự nó không nói được

Lượt đẩy đầu (`14cedd1`) làm CI ĐỎ: hai job hỏng, cả hai truy về `c3115d8` của
lane 18.G, thứ **lần đầu lên `origin`** trong chính lượt đẩy đó. Vá ở `e1dfed7`;
lượt sau `success`, 10/10 job xanh (`Build & push` skipped — nó cũng skipped ở
lượt xanh 2026-09-14, tức bình thường cho event `pull_request`, và nó nằm NGOÀI
`ci-ok` nên đừng đọc nó theo chiều nào).

Ô e2e mới **đã chạy trên runner thật**, không nằm trong nhóm skip:

```
$ playwright test a11y.spec.ts csp.spec.ts games-level-mode.spec.ts
✓ 82 › games-level-mode.spec.ts › bấm vào một level ⇒ đấu trường dựng được (9.1s)
```

9,1s trên runner so với 10,2s trên máy dựng — không có dấu hiệu lung lay.

⛔ **Hai bài học về chính §6.1, và chúng làm yếu đi con số ở đó:**

1. **Phép đo local MẠNH HƠN CI, nên một màu xanh local không nói gì về CI.**
   §6.1 ghi `web 2472 passed, 0 skip`. CI trên **cùng HEAD** cho
   `2450 passed | 22 skipped | 1 file failed` — `exams/authz.integration.test.ts`
   ném ở `beforeAll` vì DB chưa seed. Máy dựng có `dlp-postgres` đã seed từ một
   đợt trước, nên ô đó ở đây xanh **kiểu gì cũng xanh**. Cùng họ với
   `rules/green-that-proves-nothing.md`, chỉ là ở phía ngược lại: không phải cổng
   không biết kêu, mà là môi trường đo đã dọn sẵn cái mà cổng định bắt.

   Hệ quả thao tác: **một ô `*.integration.test.ts` mới phải được đo trên một DB
   CHƯA seed ít nhất một lần**, hoặc coi như chưa biết nó cần gì.

2. **Dòng tóm tắt của một lệnh nền có thể là mã thoát của lệnh CUỐI, không phải
   của lệnh ta quan tâm.** Lượt theo dõi đầu báo `exit code 0` trong khi log ghi
   `CI_EXIT=1` — CI đỏ. Cùng bẫy `| tail` nuốt mã thoát mà §3 đã ghi, chỉ đổi
   hình dạng. Lượt sau kết thúc bằng `exit $W` để mã thoát là của `gh run watch`.

**Trạng thái đợt bốn: đóng.** C2, trần tick, ô e2e chế độ LEVEL — cả ba xong và
xanh trên CI. Nợ §6.4 giữ nguyên, chưa ai chạm.

---

## 7. Đợt năm (2026-09-15) — C3 đóng, và một dòng nợ bị BÁC BỎ thay vì vá

Phạm vi chốt bởi chủ dự án: **C3 + `objectivesTotal`**. Cả hai đều đổi hình dạng
sau khi đo — và lần này là trước khi gõ dòng mã đầu, không phải sau.

| Commit | Việc |
|---|---|
| `d4d4dfd` | C3: nối `problems.revealHint` vào cả hai game; memo hoá `level` ở `arena-problem` |
| `9fdd702` | `objectivesTotal`: đối chứng dương cho K8s, thay cho việc nới `verifyRun` |

### 7.1 C3 rộng hơn §5.4 ghi — và Git hỏng NẶNG HƠN K8s

§5.4 xếp C3 là chuyện của đấu trường K8s. Đo ra là cả hai game, và bản Git tệ hơn:

| Game | Người học thấy gì sau khi bấm "gợi ý" |
|---|---|
| K8s | Ô hiển thị trống — `mission-card` in `hints[i]`, mà `hints[i]` là `''` |
| Git | Đúng dòng **"Gợi ý 1: "** — `engine.ts` nội suy chuỗi rỗng đó vào bản ghi |

Điểm trừ THẬT ở cả hai: `hintsUsed` đếm từ nhật ký, và máy chủ còn hợp thêm
`problem_hint_reveals`. Nên đây không phải lỗi hiển thị — là một lượt mua bán mà
người mua không nhận được hàng.

Kèm theo, không ai ghi: `key={hint}` ở `git-level-screen` làm **mọi `<li>` mang
cùng một key** (chuỗi rỗng) ở chế độ OJ. React dựng lại nhầm node giữa các lần
render và không có gì đỏ.

### 7.2 ⛔ Một bẫy phải vá KÈM, nếu không bản vá tự gây hồi quy

`useArenaSession` dựng lại phiên mỗi khi **định danh** `level` đổi
(`useEffect(..., [level])`), còn `arena-problem.tsx` trả `k8sOjLevel(problem)`
**mới mỗi lần render**. Hôm qua bẫy này nằm im vì `ArenaProblemBody` không có
state nào nên nó gần như không render lại.

Thêm trạng thái gợi ý là đánh thức nó: **mỗi lần mở một gợi ý sẽ xoá sạch tiến độ
người chơi**, không báo gì, không lỗi nào. Nên `level` nay memo hoá.

Git không dính, và lý do đáng ghi: `sessionRef.current ??= createGitSession(...)`
dựng đúng một lần bất kể `level` đổi định danh. Hai game đã khác nhau ở đúng chỗ
này từ trước, và không tài liệu nào nói ra.

### 7.3 `objectivesTotal` — dòng nợ thứ NĂM trích một câu đã lạc hậu

§5.4 và §6.4 ghi *"`objectivesTotal` không nằm trong sáu trường `verifyRun` so.
Hai bên lệch trường đó thì không ô nào đỏ."* Vế đầu ĐÚNG. Kết luận ngầm — rằng đó
là khe hở cần vá — **SAI**:

| Nghi vấn | Đo được |
|---|---|
| Máy chủ tin `claimed.objectivesTotal`? | **Không.** `replay.ts:174` luôn dùng `problem.testcases.length` |
| Có lưu lại? | **Không.** `problem_submissions` không có cột đó |
| Ai đọc? | **Đúng một:** `warnOnVerdictDivergence` — việc của nó là kêu lên khi lệch |
| Chưa ai gác? | **Git đã có** đối chứng dương từ trước |

Thêm trường này vào `verifyRun` sẽ không đóng đường nào, phải nới `ReplayEngine`
ở `core/` cho cả hai plugin, và **làm tắt chính cảnh báo đang bắt nó**: lệch ⇒
`khong-khop` ⇒ `CE`, mà `warnOnVerdictDivergence` thoát sớm ở nhánh `CE`. Đổi một
dòng log **có tên** lấy một `CE` vô danh — kèm rủi ro biến lệch phiên bản của
người học lương thiện thành `CE` (§0.4 đã ghi sẵn cái giá đó).

Việc đã làm thay vào đó: bổ **đối chứng dương cho K8s**, game chưa có ô.

⚠ Đây là lần **thứ năm** trong phase này (`rules/debt-lists-quote-stale-docs.md`).
§6.2 vừa đặt luật *"một dòng nợ phải được TRA LẠI trước khi giao việc theo nó"* —
đây là lượt đầu áp dụng, và nó **đổi việc phải làm**, không chỉ đổi cách diễn đạt.

### 7.4 Đo được (cây sạch tại `d4d4dfd` + `9fdd702`, `HEAD` không đổi trước/sau)

```
pnpm exec turbo run build lint typecheck test --force --concurrency=2
Tasks: 32 successful, 32 total      exit 0

web 2485 · games 1345 · ui 932 · scenario 289
terminal 133 · motion 110 · copy 72 · shared-types 48   = 5414 ô
```

So mốc §6.1 (5396): **+18, đúng bằng số ô thêm vào** — 13 ở `web` (5 hook, 7 thẻ
nhiệm vụ, 1 `objectivesTotal`), 5 ở `games`. **Sáu gói còn lại không đổi một ô.**

Mọi dòng khớp chữ `skip` đã soi từng dòng: một **tên file**
(`me-history-skipped.test.ts`), hai **notice của Postgres**, bốn **dòng log của
chính ứng dụng** về `RATE_LIMIT_TRUST_PROXY`. Không dòng tóm tắt vitest nào báo ô
bị bỏ.

⚠ **Và theo đúng §6.6 bài học 1, con số trên KHÔNG nói gì về CI.** Máy dựng có
`dlp-postgres` đã seed, nên nó mạnh hơn runner. Đợt này không thêm ô
`*.integration.test.ts` nào — bốn file mới đều là unit/dom thuần, không chạm DB —
nên rủi ro đó thấp, nhưng "thấp" không phải "đã đo".

### 7.5 Cả hai cổng mới đều đã được đo ở trạng thái ĐỎ

| Cổng | Cách làm nó đỏ | Kết quả |
|---|---|---|
| hook trả `null` khi hỏng | đổi `return null` → `return ''` | `expected '' to be null` — đúng 1 ô, đúng tên |
| thẻ không trừ điểm khi hỏng | trả lại thứ tự cũ (dispatch trước) | `expected "vi.fn()" to not be called` — đúng 1 ô |

Một ô nữa đỏ **ngoài dự tính** và nó dạy được một điều: ô "chữ không lọt vào nhật
ký" khẳng định `tick: 0` và nhận `tick: 6` — đồng hồ logic của thế giới sandbox đã
chạy 6 nhịp trong lúc dựng. Con số đó là **chi tiết của fixture**, không phải thứ
ô đang gác; nay ô so **tập khoá** của action thay vì một số đoán.

### 7.6 Nợ còn lại

- **`K8S_UNSEEDED_REPLAY_SEED` là mã chết.** Chưa làm.
- **`allowedCommands` mất khi lưu thành bài** (§4.2). Chưa làm.
- **Chưa ô nào đo rằng mở Level Builder không gọi mạng** (§4.2) — vẫn chỉ có ô
  gác tĩnh đọc nguồn.
- **`lessons-authz` lung lay** (§5.6) — đợt này chạy toàn suite một lượt, xanh,
  **có** một phiên Claude khác mở trên cùng cây. Một lượt xanh không bác bỏ được
  một ô đỏ 1/3 lượt. Vẫn mở.
- **`eslint` OOM** (§6.4) — không tái hiện trong đợt này (1 lượt). Nguyên nhân
  vẫn chưa xác định.
- ~~**`objectivesTotal`**~~ — **BÁC BỎ**, xem §7.3. Không phải nợ; đã có ô gác ở
  cả hai game.
- ~~**C3**~~ — **ĐÓNG**, và phạm vi thật rộng gấp đôi lời ghi ở §5.4.

---

## 8. Đợt sáu (2026-09-15) — ba dòng nợ đóng, và cổng e2e hẹp hơn ai cũng tưởng

Phạm vi chốt bởi chủ dự án: **`allowedCommands` mất im lặng** + **ô gác runtime
cho Builder** + **`lessons-authz` cách ly fixture**. Hai món còn lại của §7.6
(`K8S_UNSEEDED_REPLAY_SEED`, `eslint` OOM) để lại, có chủ ý.

| Commit | Việc |
|---|---|
| `ba86f0c` | `problemSaveLosses` + câu trên màn: Builder nói ra thứ nó sắp đánh rơi |
| `99c0bde` | Spec e2e đo mạng của Builder, **và** đưa nó vào `e2e:ci` |
| `fb4dbf0` | Ô phân trang `lessons` tái neo có trần; đua fixture đã định danh |

### 8.1 Trước khi gõ dòng nào: 3 commit của đợt năm chưa hề lên `origin`

`d4d4dfd` `9fdd702` `214086c` còn nằm ở local. PR #137 xanh 11/11 — nhưng ở
`4e0b4eb`, tức **CI chưa chạy trên đợt năm**. Đẩy trước rồi mới làm; CI trên
`214086c` trả `success`.

Đáng ghi vì nó là mặt còn lại của §6.6 bài học 1. Ở đó máy dựng MẠNH HƠN runner
nên một màu xanh local không nói gì về CI. Ở đây đơn giản hơn và dễ sót hơn:
runner **chưa từng nhìn thấy** mã đó. Một PR "xanh" chỉ xanh trên cái SHA nó đã
chạy, và không dòng nào trong `gh pr view` nói ra khoảng cách ấy.

### 8.2 ⛔ Hai dòng nợ nữa trích câu lạc hậu — lần thứ SÁU và thứ BẢY

§6.2 đặt luật *"một dòng nợ phải được TRA LẠI trước khi giao việc theo nó"*, và
§7.3 là lượt đầu áp dụng. Đây là lượt thứ hai, và nó lại **đổi việc phải làm**:

| §7.6 / §4.2 viết | Đo 2026-09-15 |
|---|---|
| "`K8S_UNSEEDED_REPLAY_SEED` là **mã chết**" | **Lạc hậu một phần.** 13 chỗ dùng ở `problem-plugins.test.ts` + export ở `index.ts:454`. "Chết" đúng theo nghĩa *đường chạy thật của K8s không đọc nó*, sai theo nghĩa *không ai tham chiếu* |
| "**Chưa ô nào** đo rằng mở Level Builder không gọi mạng" | **Sai theo HAI chiều.** Phép đo runtime CÓ tồn tại (`games.spec.ts` §1, `games-git-sandbox.spec.ts` AC-2, cả hai kèm đối chứng dương) — nhưng không ô nào chạm Builder, **và** không ô nào chạy ở CI |
| "Chỗ đúng là `authorFields` của plugin (§18.A.3)" | **Chỉ dẫn SAI.** `authorFields` mô tả trường của **Spec** (`commits`, `branches`, `head`…), tức của `WorldSpec`. `allowedCommands` là LUẬT của level, không phải trạng thái thế giới |

Vế thứ ba đắt nhất: nó không chỉ mô tả sai hiện trạng mà còn **kê sẵn một bản vá
sai**. Ai làm theo sẽ nhét một khái niệm chỉ-game-Git vào hợp đồng của `core/`.

### 8.3 Phát hiện lớn hơn cả ba món nợ: `e2e:ci` chạy 3 trong 14 spec

`ls apps/web/e2e/*.spec.ts` ra **14 file**. `e2e:ci` gọi **ba**. Theo đúng luật
§6.2, mười một file còn lại **là tài liệu, không phải cổng** — kể cả
`games.spec.ts`, nơi có phép đo mạng kèm đối chứng dương viết rất kỹ.

Đây là cùng chế độ hỏng đã cho C1 sống sót trọn một đợt (§6.2), chỉ ở quy mô lớn
hơn nhiều: §6.2 sửa MỘT spec (`games-level-mode`) và không ai đếm phần còn lại.
Ô mới của đợt này được thêm vào `e2e:ci` trong **cùng commit** chính vì thế.

⚠ Đây **không** phải lời mời nhét cả 11 file vào `e2e:ci`. Khối `//e2e:ci` trong
`package.json` đã ghi lý do loại từng nhóm (cần phiên sandbox thật, cần GPU, cần
một phép đo thời gian mà runner chia sẻ CPU không đo nổi). Thứ chưa ai làm là
**đọc lại danh sách đó và hỏi từng file một** *"nó không chạy được ở CI, hay chỉ
là chưa ai thêm?"* — `games-git-sandbox.spec.ts` AC-2 là ứng viên đầu tiên: nó
chỉ cần `next start`, y như spec mới.

### 8.4 `allowedCommands` — vá bằng cách NÓI RA, không bằng cách chở thêm trường

Chuỗi, đọc thẳng từ mã: ô nhập ở `git-builder.tsx:334` → `draftToProblemBody` bỏ
qua (`ProblemBase` không có ô) → `gitOjLevel` đặt `allowedCommands: null` khi mở
lại bài, tức **cho dùng mọi lệnh**. Người soạn đặt một tập hạn chế, nhận về một
bài không hạn chế gì, im lặng.

**Chở nó sang `ProblemBase` là đổi THIẾT KẾ, không phải vá lỗi.** `problem-level.ts`
§ (4) đã ghi rằng `null` và `[]` mang nghĩa ngược nhau và một `[]` lọt vào làm bài
không bao giờ giải được mà không log gì; ô gác `problem-level.test.ts:109` khẳng
định `null` đúng là giá trị mong muốn cho bài OJ.

Nên: `problemSaveLosses`, một tập MẤT MÁT tách hẳn khỏi `problemSaveIssues`. Lý do
tách nằm ở một chi tiết dễ bỏ qua — nút Lưu đọc thẳng `issues.length > 0` để tự
khoá, nên nhét mất mát vào tập lỗi sẽ **đóng luôn đường xuất thứ hai của Builder**
cho một bản nháp hoàn toàn hợp lệ. Một ô trong bộ test khẳng định đúng điều đó.

### 8.5 `lessons-authz` — không phải "lung lay", là một cuộc đua có tên

§5.6 xếp nó là flake và để mở. Mã lỗi tự khai trọn nguyên nhân:
`InvalidCursorError: bai-1789456432419-tfx7q7` — khuôn `<tiền tố>-<13 chữ số>-<6
ký tự>` đúng là thứ `uniqueId()` sinh ra, tức một **fixture của suite khác**;
nội dung thật của nền tảng không có khối 13 chữ số nào.

`lessons.list` đọc `composite([đĩa, DB])`, nên mọi bài `published` trong
`content_items` nằm trong danh sách. **Năm** suite khác tạo rồi xoá bài
`published` mang id fixture. Vitest chạy file song song trên cùng một Postgres.

Ba đường đã loại, ghi để lượt sau khỏi đi lại: **không nới mã sản phẩm** (ô ngay
trên khẳng định `InvalidCursorError` là hành vi đúng, với lý do đã ghi) · **không
lọc** (`filter` chỉ có `difficulty`/`tier`/`capability`; chọn giá trị fixture
"tình cờ" không dùng là đúng-do-may-mắn) · **không tiêm nguồn** (`scenarioSource()`
zero-arg theo hợp đồng, và mock trọn nó thì chính phép phân trang cần gác không
còn chạy).

### 8.6 Cả ba cổng mới đều đã được đo ở trạng thái ĐỎ

| Cổng | Cách làm nó đỏ | Kết quả |
|---|---|---|
| `problemSaveLosses` | đổi `!== null` thành `.length > 0` | đỏ ĐÚNG MỘT ô ("mảng RỖNG vẫn là mất mát"), ba ô kia giữ xanh |
| pha `builder` không gọi mạng | tiêm `fetch('/api/...')` sau `trace.phase('builder')` | đỏ, và **đúng một** mục lọt vào, không kèm gì khác |
| tái neo có trần | ép cursor thành mã không tồn tại sau mỗi trang | `expected 3 to be less than 3` — đúng câu đã viết |

Vế giữa đáng ghi riêng: đối chứng dương của spec bắn ở pha `đối chứng`, nên nó
**không** chứng minh phép lọc `r.phase === 'builder'` có đỏ được không. Hai ô đo
hai thứ khác nhau và cần hai phép đo đỏ khác nhau — một đối chứng dương "ở gần
đó" không phủ hộ ô bên cạnh.

### 8.7 Đo được (cây sạch, `HEAD` không đổi trước/sau, `dlp-postgres` chạy)

```
pnpm exec turbo run build lint typecheck test --force --concurrency=2
Tasks: 32 successful, 32 total      exit 0      4m57s

web 2489 · games 1345 · ui 932 · scenario 289
terminal 133 · motion 110 · copy 72 · shared-types 48   = 5418 ô

E2E_START_SERVER=1 pnpm --filter web e2e:ci
57 passed · 27 skipped · exit 0
```

So mốc §7.4 (5414): **web +4, đúng bằng số ô thêm vào**; bảy gói còn lại không
đổi một ô. `e2e:ci` 55 → 57, đúng +2. 27 ô skip là nhóm role-gated đã biết từ
§6.1, không phải thứ đợt này gây ra.

Mọi dòng khớp chữ `skip` đã soi từng dòng: bốn **notice của Postgres**, một **tên
file** (`me-history-skipped.test.ts`), bốn **dòng log ứng dụng** về
`RATE_LIMIT_TRUST_PROXY`. Không dòng tóm tắt vitest nào báo ô bị bỏ.

⚠ Và theo đúng §6.6 bài học 1, con số trên **không nói gì về CI** — máy dựng có
`dlp-postgres` đã seed. Đợt này không thêm ô `*.integration.test.ts` nào.

### 8.8 Hai sự cố của chính phép đo, không phải của mã

1. **`spawn UNKNOWN` (errno -4094)** khi `web:build` (31 worker) chạy cùng
   `web:test` ở `--concurrency=2`: `1 failed | 189 passed (196)` kèm `21 errors`.
   Không ô nào của bản vá đỏ — là kiệt handle tiến trình trên Windows. Chạy riêng
   suite web thì ra `211 passed`. Cùng họ với
   `rules/turbo-parallel-load-times-out-io-tests.md`, và `Tasks: 11/13` nghĩa là
   **suite web lượt đó chưa hề chạy tới nơi**.
2. **`RangeError: Array buffer allocation failed`** khi `next start` khởi động cho
   lượt e2e, ngay sau một lượt turbo nặng: máy còn chưa nhả RAM. Chạy lại khi đã
   nhả (10,7/39,7 GB free) thì xanh. Một lượt e2e đỏ ngay sau một lượt build nặng
   nên được nghi là môi trường TRƯỚC khi bị đọc thành hồi quy.

### 8.9 Nợ còn lại

- **`K8S_UNSEEDED_REPLAY_SEED`** — không còn đúng tên gọi "mã chết" (§8.2). Câu
  đúng: *đường chạy K8s không đọc nó*, vì đấu trường luôn sinh seed
  `Math.random()`. Chưa làm, và cần viết lại dòng nợ trước khi giao việc.
- **`eslint` OOM** (§6.4) — không tái hiện trong đợt này. Nguyên nhân chưa xác định.
- **Mười một spec e2e nằm ngoài `e2e:ci`** (§8.3) — chưa ai đọc lại danh sách để
  phân biệt "không chạy được ở CI" với "chưa ai thêm". `games-git-sandbox.spec.ts`
  AC-2 là ứng viên đầu tiên.
- ~~**`allowedCommands` mất khi lưu thành bài**~~ — **ĐÓNG**, và chỉ dẫn "chỗ đúng
  là `authorFields`" ở §4.2 là SAI, xem §8.2.
- ~~**Chưa ô nào đo Builder không gọi mạng**~~ — **ĐÓNG**, và dòng nợ sai theo hai
  chiều.
- ~~**`lessons-authz` lung lay**~~ — **ĐÓNG**, và nó chưa bao giờ là flake.

---

## 9. Đợt bảy (2026-09-15) — ba dòng nợ cuối, và không dòng nào đúng như đã ghi

Phạm vi: nốt §8.9. Cả ba đều **đổi hình dạng sau khi đo**, nên đây là lượt thứ ba
áp luật §6.2 và là lượt thứ ba nó đổi việc phải làm chứ không chỉ đổi cách nói.

| Dòng nợ §8.9 | Đo 2026-09-15 | Việc thật đã làm |
|---|---|---|
| `K8S_UNSEEDED_REPLAY_SEED` "là mã chết", định xoá | **Không chết, và không được đọc là CÓ CHỦ Ý** | Dựng cổng giữ nó không bị tra lại |
| `eslint` OOM "nguyên nhân chưa xác định" | **Xác định được, và không phải lỗi của eslint** | Đóng bằng bằng chứng, không đổi mã |
| 11 spec ngoài `e2e:ci` | **5 chỉ là chưa ai thêm**, 6 có lý do thật | Thêm 5, ghi lý do giữ 6 |

### 9.1 `e2e:ci` 4 → 9 spec, sau khi rà từng file

Đo bằng cách CHẠY, không bằng cách đọc: sáu ứng viên chạy trên `next start` cho
`46 passed · 14 skipped · exit 0`, và một lượt thứ hai (bỏ `password-reset`) cho
`46 passed · 13 skipped · exit 0`. **Hai lượt độc lập** trước khi đưa vào cổng
bắt buộc — một lượt xanh không phải bằng chứng ổn định, và một spec lung lay
trong cổng bắt buộc còn hại hơn không có spec nào (nó dạy người ta chạy lại).

**Năm file vào** — `games-git-sandbox` (AC-2 0-lời-gọi-backend + AC-6 axe của
§17.Q), `games-git-colorblind` (phân biệt từng cặp trạng thái khi mất màu),
`responsive` (không tràn ngang ở 390px — memory `sr-only-escapes-overflow-clip`
là một lỗi THẬT đúng hình dạng này), `motif` (hai trong ba ô hỏng IM LẶNG:
reduced-motion và cung nhảy nhịp), `landing-visual`.

**Sáu file ở ngoài, lý do vẫn đúng:** `games`/`games-git`/`landing-3d`/`perf`
cần GPU-WebGL thật hoặc một phép đo thời gian mà runner chia sẻ CPU không đo
nổi · `keyboard` cần orchestrator + gateway · `password-reset` **tự tắt** khi
thiếu `E2E_MAILPIT_URL`, nên thêm nó chỉ tạo một ô skip vĩnh viễn — đúng thứ
`rules/green-that-proves-nothing.md` gọi tên, và chính file đó đã tự ghi nhận
xét ấy về mình từ trước.

Ngân sách: job `web-a11y` có `timeout-minutes: 25`, bước e2e hiện ~1,5 phút,
thêm ~2,2 phút. Job này có postgres + `db:migrate` + `seed-content.mjs`, tức nền
giống máy dựng — nên §6.6 bài học 1 không cắn lượt này.

### 9.2 `K8S_UNSEEDED_REPLAY_SEED` — "mã chết" sai, và bản vá định làm là XOÁ NHẦM

Đo: cả `K8S_UNSEEDED_REPLAY_SEED = 0` lẫn `GIT_UNSEEDED_REPLAY_SEED = 1` **không
được một dòng mã sản phẩm nào `import`**. Bốn file chỉ nhắc tên trong chú thích.
Hai file test dùng làm gá.

Nhưng `core/problem.ts` § `Submission.seed` nói rõ vì sao: hợp đồng từng khai
`seed: number | null`, buộc mỗi plugin tự công bố một hằng "không-seed", và hai
hằng đó **lệch nhau ngay từ dòng đầu**. Hậu quả không đọc ra thành một lỗi — nó
đọc ra thành *"mọi lượt nộp hợp lệ đều bị từ chối"*, tức một hệ thống trông như
từ chối người chơi ngẫu nhiên. Bản vá là **bỏ hẳn chỗ cho phép tra hằng**: lượt
nộp mang theo số đã dùng.

Nên "không ai đọc" là **thành tựu của thiết kế**, không phải rác. Xoá chúng đi
thì xoá luôn hai gá test và lời ghi lịch sử; giữ nguyên thì bất biến chỉ được
một đoạn văn xuôi giữ, mà văn xuôi thì chỉ review mới bắt được.

Việc đã làm: `unseeded-seed-not-consulted.test.ts` — quét mọi file sản phẩm ở
`packages/games/src` + `apps/web/src`, dựng danh sách câu lệnh `import`, và ĐỎ
kèm tên file nếu có ai import hằng.

Gác `import` chứ không gác việc NHẮC TÊN, có lý do: bốn file sản phẩm nhắc tên
trong chú thích, và cấm nhắc tên vấn đề trong chú thích là đúng cái bẫy
`phase-18.md` §18.A đã dẫm một lần. `index.ts` re-export bằng `export ... from`
nên không cần dòng miễn trừ nào — re-export làm hằng VỚI TỚI được, không tra giá
trị của nó.

Hai ô gác toàn vẹn đi kèm, vì "không ai import" đúng một cách rỗng nghĩa trên
một tập rỗng: một ô đòi phép quét thấy > 500 file (đo được 659), một ô là **đối
chứng dương** bắt bộ so khớp phải tìm ra một file CÓ import thật.

### 9.3 `eslint` OOM — eslint là nạn nhân, không phải thủ phạm

Giả thuyết cũ ("eslint duyệt 290MB trace playwright") đã bị bác bỏ ở §6.4.
Đo lại từ gốc, và câu trả lời nằm ở **cấu hình**, không ở dữ liệu:

`eslint.config.mjs` dùng `tseslint.configs.recommended`, **không**
`recommendedTypeChecked`, và không khai `projectService`/`project`. Tức eslint
**không dựng TypeScript program** — không có nguồn tốn RAM lớn nào.

Đo trần heap, ép từ dưới lên thay vì đoán từ trên xuống:

```
apps/web (776 file)    cap=192MB exit=0 15s   cap=256 · 384 · 512 · 1024 đều exit=0
packages/games         cap=192MB exit=0  7s
packages/ui            cap=192MB exit=0  4s
packages/scenario      cap=192MB exit=0  5s
```

Gói lớn nhất chạy trọn ở **192MB**. Nên một `exit 134` ở trần mặc định (~4GB)
**không thể là chuyện bộ nhớ của chính eslint** — nó là áp lực RAM ở tầng máy.

Ba mảnh bằng chứng khớp nhau: sự cố xảy ra ĐÚNG sau `next build` + `e2e:ci` (lúc
tải đỉnh), xanh khi chạy lại mà không sửa gì, và đợt sáu gặp thêm **hai** sự cố
cùng họ trong một phiên (`spawn UNKNOWN` khi build+test chạy chung, `Array buffer
allocation failed` khi `next start` khởi động ngay sau lượt turbo nặng — §8.8).

**Không đổi mã.** Dấu hiệu vận hành: `eslint` exit 134 ngay sau một lượt build
nặng là chuyện của máy, chạy lại. Nếu nó xảy ra trên một máy ĐANG RẢNH thì đó là
thông tin mới, và lúc đó mới đi tìm nguyên nhân khác.

### 9.4 Cổng mới đã được đo ở trạng thái ĐỎ

| Cổng | Cách làm nó đỏ | Kết quả |
|---|---|---|
| không mã sản phẩm nào tra hằng | thêm một file sản phẩm import `K8S_UNSEEDED_REPLAY_SEED` | đỏ, nêu ĐÚNG MỘT tên file, hai ô toàn vẹn giữ xanh |

### 9.5 Nợ còn lại

Không còn dòng nào của §8.9. Ba món đã đóng, và hai trong ba đóng bằng một việc
**khác** thứ dòng nợ kê ra.

Điều đáng mang sang phase sau không phải một món nợ mà là một tỉ lệ: trong phase
này, **bảy lần** một dòng nợ trích câu đã lạc hậu, và lượt rà cuối cùng này lại
thêm ba. Luật §6.2 đang hoạt động, nhưng nó chỉ hoạt động khi có người TRA — nó
không tự chạy. Một bảng nợ không có cơ chế tự kiểm thì lãi suất của nó là những
bản vá sai được kê sẵn.
