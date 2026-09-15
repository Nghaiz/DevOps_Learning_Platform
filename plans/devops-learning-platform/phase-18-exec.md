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

## 4. Ô nghiệm thu của đợt

- **AC-5** (`phase-18.md` §3): dựng một level chương 1 hoàn chỉnh **chỉ bằng giao diện**, xuất
  ra, nạp lại, chơi được, và `solutionCommands` cho AC.
- **E.7 đối chứng dương:** một level có đích không với tới được bằng lời giải khai ⇒ báo đỏ,
  và câu báo nói đúng testcase nào không đạt.
- **AC-2:** `turbo run build lint typecheck test --force` đọc `Tasks: X/Y`.
- **AC-8:** axe 0 vi phạm trên màn Builder.
- **18.H:** hai file tài liệu tồn tại và mọi đường dẫn trong đó tra lại được.
