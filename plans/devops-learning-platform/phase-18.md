# Phase 18 — Hệ OJ đa-game, Level Builder, chế độ thi

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocked by:** P17 (17.A, 17.J, 17.Q) · **Blocks:** không
**SSOT thiết kế:** [`plans/reports/2026-09-11-brainstorm-git-cicd-games.md`](../reports/2026-09-11-brainstorm-git-cicd-games.md) §5, §6
**Chạy:** tuần tự một luồng (`/t1k:cook`).
**Plane:** bỏ qua theo `rules/no-outbound-from-this-project.md`.

> Chặng này khác P17 và P19 ở một điểm bản chất: nó **đụng vào code đang chạy và dữ liệu thật**,
> không phải xây thứ mới bên cạnh. Rủi ro chính là hồi quy, không phải tiến độ.

---

## 0. Hiện trạng đo được (scout 2026-09-11)

| Giả định | Thực tế đo được |
|---|---|
| Hệ OJ dùng chung được cho nhiều game | **Không.** Toàn bộ gắn cứng vào K8s: `packages/games/src/k8s/problem.ts` khai `ClusterSpec`, `PROBLEM_TOPICS` là 9 chủ đề K8s, bảng vị từ là `PREDICATES` của K8s. |
| Trang soạn bài có sẵn | **Có, và khá đầy đủ.** `apps/web/src/app/author/problems/` — `cluster-fields`, `node-fields`, `objective-fields`, `predicate-spec`, `arena-preview`, `json-transfer`, `problem-editor`. Đây là tài sản, không phải nợ. |
| Có khái niệm "kỳ thi" | **Không.** Không bảng `exam`, không `exam_attempt`, không khái niệm lớp/nhóm học. |
| Có khái niệm "lớp" | **Không.** `/admin/users` quản lý người dùng phẳng. **Chốt 2026-09-11: dùng lại role `admin` cho giảng viên**, không thêm role mới. |
| Bảng `problems` có dữ liệu | ~~**Rỗng trên cài đặt sạch**, và **không có nguồn seed nào**~~ → **ĐÃ LẠC HẬU, xem dòng dưới.** |
| `Objective` hiện có trọng số | **Có `required: boolean`**, không có trọng số số học. Khớp với mô hình testcase đã chốt. |

### 0.1 Đính chính sau khi P17 gộp (đo lại 2026-09-14)

Bảng §0 ở trên scout ngày **2026-09-11**. P17 gộp vào `main` ngày **2026-09-14**
(`6f19cbe`), P17b gộp cùng ngày (`24499ab`), và ba dòng của bảng đã hết đúng. Ghi
lại thay vì sửa đè, vì một plan không nói mình đã sai ở đâu là một plan người sau
vẫn tin.

| Plan viết | Mã nói gì (đo 2026-09-14) | Hệ quả |
|---|---|---|
| "không có nguồn seed nào" cho bảng `problems` | **Có.** `packages/games/src/k8s/problems-seed/` có 10 bài (`k8s-0001`…`k8s-0010`), export qua barrel là `PROBLEMS_SEED`, và `scripts/seed-content.mjs` nạp chúng (dòng 126, 283, 652) kèm cổng đếm lại số dòng đã ghi | **18.D.7 gần như đã xong.** Việc còn lại là xác minh AC-4 trên một cài đặt sạch thật, không phải viết nguồn seed mới |
| `git/problem-plugin.ts` dùng `GitRepoSpec` (18.A.5) | **Không có kiểu nào tên đó.** Kiểu thật là `WorldSpec` (`git/contract.ts:796`) | Đổi tên trong plan, không đổi mã |
| `core/` sạch, chỉ cần chuyển `Problem` lên | `core/verify.ts` **còn 5 import kiểu** từ `../k8s/contract.ts` | Món nợ thêm cho 18.A — xem khối cảnh báo ở AC-A |

Một dòng nữa không sai nhưng thiếu: plan §18.B.1 đặt tên kiểu là `Verdict`. Tên đó
**đã có chủ** — `git/predicates.ts:383` khai `Verdict` cho LEVEL (một object có
`bonusMet`). Bản của bài OJ mang tên `ProblemVerdict`; lý do đầy đủ ghi tại chỗ
khai trong `core/problem.ts`.

---

## 1. Quyết định chi phối

Từ design §1, và một làm rõ bổ sung ngày 2026-09-11:

- **#4** OJ tổng quát hoá thành đa-game, `Problem` lên `core/`, phần engine-riêng thành plugin theo `GameId`.
- **#9** Chế độ thi: có giờ · chấm theo testcase · đề sinh theo seed · bảng điểm + xuất CSV.
- **#17** Level Builder trực quan, làm ngay đợt đầu.
- **#20** **Objective = testcase.** Verdict `AC` chỉ khi qua hết; nếu không thì `WA (4/5)`.
  Không có trọng số riêng cho từng objective — chủ dự án đã bỏ khái niệm đó tường minh.

---

## 2. Chuỗi công việc

### 18.A — Tổng quát hoá `Problem` (L, ~1 tuần) · **KHÔNG ĐƯỢC CẮT**

Chặn 18.B, 18.C, 18.D và toàn bộ phần OJ của P19. Đây cũng là chuỗi rủi ro nhất của cả ba phase
vì nó động vào code có người đang dùng.

| # | Việc | Ước |
|---|---|---|
| A.1 | **Chụp ảnh hồi quy trước khi động vào gì.** Viết test khoá hành vi hiện tại của toàn bộ bài K8s: nạp, chấm, hiển thị. Test này phải xanh **trước** và **sau** refactor, không sửa một dòng. | 4h |
| A.2 | `core/problem.ts` — `ProblemBase { code, gameId, title, statement, difficulty, topics[], tags[], testcases[], hints[], seedable }` | 3h |
| A.3 | `core/problem-plugin.ts` — `interface GameProblemPlugin { initialSpec, predicates, topics, authorFields }`. `authorFields` là **mô tả form dạng dữ liệu**, không phải JSX (JSX ở `core/` sẽ kéo React vào package cấm React). | 4h |
| A.4 | `k8s/problem-plugin.ts` — chuyển từ `k8s/problem.ts` hiện tại. Giữ nguyên hành vi. | 4h |
| A.5 | `git/problem-plugin.ts` — `initialSpec` là `GitRepoSpec`, bảng vị từ riêng, tập chủ đề riêng | 4h |
| A.6 | Tầng UI đọc plugin theo `gameId` đang chọn; form đổi theo `authorFields` | 4h |
| A.7 | Chạy lại A.1. Nếu đỏ một dòng thì dừng, không đi tiếp. | 2h |

**AC-A:** test A.1 xanh trước và sau, **không sửa test** · chọn `gameId` trên `/author/problems`
đổi form đúng plugin · `core/` không phụ thuộc game nào, đo bằng lệnh dưới.

> ⚠ **Ô đo đã được sửa ngày 2026-09-14 — bản cũ đo nhầm thứ.** Plan viết
> `grep -n "ClusterSpec" packages/games/src/core/` phải trả rỗng. Lệnh đó đếm cả
> **văn xuôi**: khối chú thích giải thích *vì sao* `core/` không được biết
> `ClusterSpec` sẽ tự làm chính ô này đỏ. Một ô nghiệm thu chỉ có thể qua bằng
> cách cấm nhắc tên vấn đề trong chú thích là một ô đỏ vì lý do sai.
>
> Thứ cần đo là **phụ thuộc**, không phải chính tả:
>
> ```bash
> grep -rn "from '\.\./k8s\|from '\.\./git" packages/games/src/core/ --include=*.ts
> ```
>
> Đo ngày 2026-09-14, lệnh này **không rỗng**: `core/verify.ts` và
> `core/verify.test.ts` còn import `CreateSession`, `K8sGameAction`, `K8sSession`,
> `Level`, `SessionStatus` từ `../k8s/contract.ts`. 17.A.2 đã chuyển phần *chạy*
> lên dạng rộng (chú thích trong file nói rõ điều đó) nhưng **năm import kiểu thì
> còn lại**. Plan không nhắc món này — nó thuộc 18.A, và nó chặn 18.C: `verify.ts`
> chính là bộ phát lại chống gian lận mà chấm-lại-phía-server dựa vào, nên nó
> không thể còn dính vào một game.

⚠ `PROBLEM_DIFFICULTIES` (4 bậc, `easy|medium|hard|expert`) **cố ý khác**
`SCENARIO_DIFFICULTIES` (3 bậc). Đừng ánh xạ ngầm giữa hai thang — comment trong
`k8s/problem.ts` đã dặn rõ, và nó vẫn đúng sau khi chuyển lên `core/`.

### 18.B — Testcase và verdict (M, ~2 ngày)

| # | Việc | Ước |
|---|---|---|
| B.1 | `Testcase { id, label, check, args?, visible }` · `Verdict 'AC' \| 'WA' \| 'CE'` | 2h |
| B.2 | `Submission { problemCode, gameId, seed, actions[], passed[], total }`. **Không lưu điểm** — điểm là `passed.length / total`, tính ở chỗ dùng (quy ước No Derived Fields của repo). | 3h |
| B.3 | Hiển thị verdict: `AC` hoặc `WA (4/5)`, kèm testcase nào đỏ | 3h |
| B.4 | Testcase ẩn: `visible: false` chỉ hiện tên **sau khi nộp** (chống dò đáp án bằng cách nộp nhiều lần) | 2h |
| B.5 | `CE` cho lỗi cú pháp: lệnh không tồn tại, YAML hỏng | 2h |

**AC-B:** một bài 5 testcase, làm đúng 4, hiển thị đúng `WA (4/5)` và chỉ đúng testcase đỏ ·
`grep -rn "score" packages/games/src/core/problem.ts` không có cột lưu điểm.

### 18.C — Chấm lại phía server (M, ~3 ngày) · **cốt lõi của tính trung thực**

Design §5.3 nói thẳng: game chạy hoàn toàn phía client, nên điều duy nhất khiến việc chấm tin
được là **phát lại tất định**.

| # | Việc | Ước |
|---|---|---|
| C.1 | Điểm cuối nộp bài: nhận `(problemCode, seed, actions[])`, **không** nhận verdict của client | 3h |
| C.2 | Chạy lại engine phía server, tự tính `passed[]`. Phụ thuộc trực tiếp vào 17.J.5. | 4h |
| C.3 | So verdict server với verdict client; lệch thì ghi log cảnh báo (không chặn — lệch là dấu hiệu bug tất định, không nhất thiết là gian lận) | 3h |
| C.4 | Giới hạn nhịp nộp bài + giới hạn độ dài `actions[]` (một chuỗi 10 triệu lệnh là một cách làm nghẽn server) | 3h |

**AC-C:** một bài nộp với verdict client bị sửa tay thành `AC` vẫn ra `WA` từ server · có test
tự động chứng minh điều đó, không phải thử tay một lần.

⚠ **Ô nghiệm thu này dễ nói dối.** "Server chấm lại" mà server dùng chung một tiến trình với
client thì không chứng minh gì. Test phải chạy engine ở **env node** với đầu vào là JSON thô,
không phải gọi hàm trong cùng bundle.

### 18.D — Trang soạn bài mở rộng (M, ~3 ngày)

| # | Việc | Ước |
|---|---|---|
| D.1 | Chọn `gameId` trước, form đổi theo plugin | 3h |
| D.2 | Quản lý testcase: thêm/xoá/đổi thứ tự, đánh dấu ẩn/hiện | 4h |
| D.3 | Trạng thái bài: nháp / công khai / ẩn | 3h |
| D.4 | Nhập/xuất JSON — dùng lại `json-transfer.tsx` | 2h |
| D.5 | Xem trước bằng chính engine của game — tiền lệ `arena-preview.tsx` | 4h |
| D.6 | Cờ `seedable` trên từng bài + giải thích khi nào bật được | 2h |
| D.7 | **Nguồn seed cho bảng `problems`**: `content/problems/` + nạp trong `seed-content.mjs`. Đây là thứ đóng 4 ô e2e đỏ còn lại từ P16. | 4h |

**AC-D:** trên cài đặt sạch sau `seed-content`, `/problems/:code` và `/author/problems/:code`
render được ⇒ 4 ô e2e đỏ của P16 chuyển xanh · soạn một bài Git đầy đủ qua UI, xuất JSON, nhập
lại, xem trước chạy được.

### 18.E — Level Builder (L, ~1 tuần)

Design §6. Dùng **cùng màn hình** với sandbox của 17.Q.

| # | Việc | Ước |
|---|---|---|
| E.1 | Nút "Đặt làm trạng thái đầu" / "Đặt làm đích" trong sandbox | 3h |
| E.2 | Chọn chế độ so (hash-agnostic? có xét nhánh thừa? so nội dung file?) | 3h |
| E.3 | Soạn đề bài + chọn bài lý thuyết từ `content/` | 4h |
| E.4 | Xuất JSON level, tải về | 3h |
| E.5 | Lưu thẳng vào DB nếu có quyền | 4h |
| E.6 | Xem trước: chơi thử level vừa dựng, có nút "chạy lời giải mẫu" | 4h |
| E.7 | Kiểm tính giải được: cảnh báo nếu trạng thái đích **không** với tới được từ trạng thái đầu bằng tập lệnh cho phép | 4h |

⚠ **Giới hạn phải ghi rõ trên chính giao diện, không giấu trong tài liệu:** Builder chỉ dựng
được level dạng "từ A tới B". Level có **bot đồng đội** (chương 2 game Git) và level có **nhiều
lượt chạy có seed** (chương CI ở P19) cần tham số mà giao diện trực quan khó diễn đạt — hai loại
đó phải viết bằng file TS.

**AC-E:** dựng một level chương 1 hoàn chỉnh **chỉ bằng giao diện**, xuất ra, nạp lại, chơi được,
và `solutionCommand` cho AC · E.7 báo đúng khi đích không với tới được (có test đối chứng dương).

### 18.F — Lớp học (M, ~2 ngày)

Chưa có trong nền tảng. Chế độ thi phụ thuộc vào nó.

**Đã chốt (chủ dự án, 2026-09-11): giảng viên dùng lại role `admin` có sẵn.** Không thêm role
`teacher`, không làm quyền theo tầm lớp. Ai là `admin` thì tạo lớp được, ra đề được, xem điểm
mọi lớp được.

> ⚠ Cái giá phải ghi rõ, vì nó ngược với nguyên tắc đặc quyền tối thiểu mà `rules/security.md`
> đang theo: một giảng viên được cấp `admin` sẽ đồng thời có **toàn quyền hệ thống** — sửa được
> người dùng, xem được audit log, đụng được cấu hình. Chấp nhận được ở quy mô một lớp NCKH; nếu
> sau này mở cho nhiều giảng viên ngoài nhóm thì đây là chỗ phải tách role, và tách sau sẽ đắt
> hơn tách bây giờ.

| # | Việc | Ước |
|---|---|---|
| F.1 | Bảng `class` + `class_member`. `class_member` chỉ có sinh viên; chủ lớp là một cột `ownerId` trỏ tới một `admin`. | 3h |
| F.2 | Trang tạo lớp, thêm thành viên, danh sách — đặt trong `/admin` vì quyền đã là `admin` | 4h |
| F.3 | Phân quyền: sinh viên **chỉ** thấy điểm của chính mình, ở mọi điểm cuối liên quan | 4h |

**AC-F:** một sinh viên gọi thẳng điểm cuối bảng điểm lớp bằng tài khoản của mình ⇒ bị từ chối.
Test tự động, không thử tay.

### 18.G — Chế độ thi (L, ~1 tuần)

| # | Việc | Ước |
|---|---|---|
| G.1 | Bảng `exam { id, title, ownerId, problemCodes[], durationMinutes, seedStrategy, opensAt, closesAt }` + `exam_attempt { examId, userId, seed, startedAt, submittedAt, autoSubmitted }` | 3h |
| G.2 | Trang tạo đề: chọn bài, đặt giờ, chọn `seedStrategy` | 4h |
| G.3 | **Cổng gác:** không cho đưa bài `seedable: false` vào kỳ thi dùng `per-student`. Nếu thiếu cổng này thì mỗi sinh viên nhận một đề khác độ khó mà không ai biết. | 3h |
| G.4 | Màn làm bài: đếm ngược, danh sách bài, nộp từng bài | 4h |
| G.5 | **Mốc thời gian do server cấp**, không tin đồng hồ máy khách. Tự nộp khi hết giờ, kể cả khi tab đóng. | 4h |
| G.6 | Bảng điểm lớp: ai làm bài nào, `AC` hay `WA (n/m)`, sai testcase nào | 4h |
| G.7 | Xuất CSV | 3h |

⚠ **Đồng hồ.** Memory dự án có một bẫy đã cắn: VM ngủ làm vỡ ô nghiệm thu treo theo đồng hồ, và
đồng hồ VM lệch ~59s so với máy chủ. Trong chế độ thi, lệch nhỏ còn nguy hơn lệch lớn vì số vẫn
trông hợp lý. Mọi mốc phải lấy từ **một nguồn duy nhất là server**.

**AC-G:** đổi giờ hệ thống máy khách lên 2 tiếng ⇒ đếm ngược **không** đổi · đóng tab lúc còn 1
phút, mở lại sau 5 phút ⇒ bài đã tự nộp · CSV mở được bằng Excel với tiếng Việt không vỡ dấu
(BOM UTF-8).

### 18.H — Tài liệu (S, ~1 ngày)

`docs/oj-format.md` (định dạng bài + plugin theo game) · `docs/exam-format.md` · cập nhật
`docs/games/README.md`.

---

## 3. Ô nghiệm thu của cả chặng

| # | Ô | Đo bằng |
|---|---|---|
| AC-1 | Không hồi quy bài K8s | Test 18.A.1 xanh trước và sau, **không sửa test** |
| AC-2 | Toàn cây xanh | `turbo run build lint typecheck test --force`, đọc `Tasks: X/Y` trước khi trích số |
| AC-3 | Server chấm lại thật | Verdict client bị sửa tay vẫn ra đúng từ server, có test env node |
| AC-4 | 4 ô e2e đỏ của P16 đóng | `/problems/:code` + `/author/problems/:code` render trên cài đặt sạch |
| AC-5 | Level Builder dùng được | Dựng → xuất → nạp → chơi → AC, chỉ bằng giao diện |
| AC-6 | Phân quyền lớp | Sinh viên không đọc được điểm lớp, test tự động |
| AC-7 | Đồng hồ thi | Đổi giờ máy khách không ảnh hưởng; tự nộp khi đóng tab |
| AC-8 | a11y | axe 0 vi phạm trên màn soạn bài, màn làm bài, bảng điểm |
| AC-9 | CSV tiếng Việt | Mở bằng Excel không vỡ dấu |

---

## 4. Rủi ro

| Rủi ro | L | I | Điểm | Giảm thiểu |
|---|---|---|---|---|
| Refactor 18.A làm hỏng bài K8s đang có | 4 | 5 | **20** | Test hồi quy A.1 viết **trước**, chạy lại ở A.7, không sửa test để cho xanh |
| Verdict server ≠ verdict client vì bug tất định | 3 | 5 | **15** | Phụ thuộc 17.J.5. Nếu 17.J.5 chưa xanh thì **không bắt đầu 18.C** |
| Đồng hồ thi bị lệch/bị gian lận | 3 | 4 | 12 | Mốc thời gian chỉ từ server, AC-7 |
| Bài không seedable lọt vào kỳ thi per-student | 3 | 4 | 12 | Cổng G.3 |
| Level Builder không dựng nổi level thật | 3 | 3 | 9 | Giới hạn ghi rõ trên giao diện; hai loại level phức tạp viết bằng TS |
| Giảng viên có role `admin` đụng nhầm cấu hình hệ thống | 3 | 3 | 9 | Chấp nhận theo quyết định 2026-09-11. Giảm bằng audit log (đã có `/admin/audit`) — không giảm bằng phân quyền |
| Bảng `problems` vẫn rỗng sau seed | 2 | 3 | 6 | D.7 + AC-4 |

---

## 5. Thời lượng

| Chuỗi | Effort | Ghi chú |
|---|---|---|
| 18.A tổng quát hoá Problem | L (1wk) | **Không cắt.** Chặn mọi thứ còn lại |
| 18.B testcase + verdict | M (2d) | |
| 18.C chấm lại phía server | M (3d) | Phụ thuộc 17.J.5 |
| 18.D trang soạn bài | M (3d) | Đóng 4 ô e2e đỏ của P16 |
| 18.E Level Builder | L (1wk) | Phụ thuộc 17.Q |
| 18.F lớp học | M (2d) | Chặn 18.G. Rẻ hơn dự tính ban đầu vì dùng lại role `admin` |
| 18.G chế độ thi | L (1wk) | |
| 18.H tài liệu | S (1d) | |
| **Tổng** | **~4–5 tuần** | Đường găng: A → B → C, và A → D; F → G |

---

## 6. Kỷ luật git

Nhánh `feat/p18-oj-exam`, tách từ `main` **sau khi P17 đã gộp**.

`git status` trước mọi lệnh git; commit dạng pathspec.

Chuỗi 18.A đụng vào code đang chạy — commit nhỏ, mỗi commit một bước dịch chuyển có thể lùi lại
được. **Không** gộp cả refactor vào một commit.

---

## 7. Thứ tự cắt nếu hết thời gian

Trong phạm vi P18: cắt **18.E** (Level Builder) trước, rồi **18.H**. Nếu vẫn thiếu thì cắt
**18.G.7** (xuất CSV) và **18.F.2** (giao diện tạo lớp — tạo bằng tay qua DB).

**18.A và 18.C không cắt.** Cái đầu chặn P19; cái sau là thứ duy nhất khiến kỳ thi không phải là
danh dự.
