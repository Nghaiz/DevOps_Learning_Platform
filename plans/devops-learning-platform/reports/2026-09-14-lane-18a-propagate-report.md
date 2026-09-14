# Lane 18.A — áp hợp đồng `ae7ed23` xuống hai plugin và bảng đăng ký

**Commit:** `bdc1dfd` · **Nhánh:** `feat/p18-oj-exam`
**File đã sửa:** `k8s/problem-plugin.ts`, `git/problem-plugin.ts`, `problem-plugins.ts`, `problem-plugins.test.ts` — đúng bốn file sở hữu, không chạm file nào của lead.

## Kết quả đo

| Ô nghiệm thu | Trước | Sau |
|---|---|---|
| `typecheck` (`${PIPESTATUS[0]}`) | — | **0 lỗi** |
| `test` | **1287 passed / 60 file** | **1291 passed / 60 file**, exit 0 |

**+4 ô, không ô nào mất.** Cả hai con số đọc từ dòng `Tests N passed`, không đọc mã thoát — vitest thoát 0 khi mọi test bị skip.

### Một lượt đỏ, đã chứng minh là KHÔNG liên quan

Lượt chạy `test` đầu tiên đỏ một ô: `git/refs-resolve.test.ts > ambiguous: hai commit cùng tiền tố 4 hex`, `Test timed out in 5000ms` (chạy 5546ms). Không hand-wave, hai phép đo độc lập:

1. **Ngoài đồ thị import.** File đó chỉ import `contract.ts`, `objects.ts`, `repo.ts`, `refs-resolve.ts`. Không file nào trong bốn file tôi sửa nằm trong chuỗi đó, và `grep` ngược cũng không ra chỗ nào trong chuỗi đó import `problem-plugin*`.
2. **Chạy riêng thì xanh.** `vitest run src/git/refs-resolve.test.ts` → 29/29 passed, phần `tests` 1.84s — cách trần 5s rất xa.

Nguyên nhân: `collidingRepo()` dò vét cạn để tìm hai commit trùng tiền tố 4 hex, tức là tải CPU thuần, và nó nằm sát trần 5s khi 60 file chạy song song. Lượt chạy lại toàn bộ suite xanh 1291/1291.

⚠ **Ô này sẽ còn đỏ ngẫu nhiên.** Nó không phải nợ của lane này (file có từ trước, tôi không chạm), nhưng nó là một ô gác đỏ theo tải máy chứ không theo mã — đáng cho một `testTimeout` riêng ở chính ô đó.

## Bốn thứ đã áp

### 1. `seed: number` — hai nhánh chết đã gỡ

`seed ?? K8S_UNSEEDED_REPLAY_SEED` (`k8s:313`) và `seed ?? GIT_UNSEEDED_REPLAY_SEED` (`git:296`) không còn kích hoạt được. Bỏ cả hai; `grade` dùng thẳng `seed`. `gradeProblemRun` đổi `number | null` → `number` ở cả chữ ký lẫn kiểu ép `plugin.grade as (...)`.

**Hai hằng giữ nguyên, đổi vai** — từ "mặc định lúc CHẤM" sang "mặc định lúc CHƠI". Khối chú thích của cả hai viết lại theo vai mới. `GIT_UNSEEDED_REPLAY_SEED` giữ đúng `1` và lý do (khớp `createGitSession`, `engine.ts:99`) vẫn nằm tại chỗ khai.

Ghi chú kèm ở `K8S_UNSEEDED_REPLAY_SEED`: lời khai cũ nói hằng này là câu trả lời cho *"hai bên có dùng cùng một số không"*. Nó sai **không phải vì lập luận hỏng** mà vì chỉ đúng trong phạm vi một plugin — một hằng không đảm bảo được sự thống nhất khi mỗi phía tra một hằng khác nhau.

### 2. `targetState?` — `graphShapeMatches` chạy thật

Nối xuyên `gradeProblemRun` → `plugin.grade`. `gradeGitProblem` dựng cây đích bằng `buildWorld(targetState, seed)` rồi truyền vào `evaluatePredicate`.

- **Cùng seed với thế giới đầu**, không phải một seed riêng: `buildWorld` nuôi RNG của bot từ seed, nên một cây đích lệch seed làm `graphShapeMatches` trượt trên lời giải ĐÚNG ở mọi bài có bot. Đây là cùng biểu thức mà `buildTarget` (`engine.ts:93`) dùng.
- **`try` riêng** cho lượt dựng cây đích. Gộp vào khối phát lại thì câu `CE` nói "phát lại nhật ký lỗi" cho một lượt chơi chưa hề được phát lại — người đọc đi tìm sai chỗ ngay từ dòng đầu.
- **`replayLevel` vẫn để `level.target: undefined`** kể cả khi bài có `targetState`, và đã ghi lý do tại chỗ: `createGitSession` dựng cây đích vào biến nội bộ mà `GitEngineSession` không có hàm nào trả ra, nên điền vào đó chỉ tốn một lượt `buildWorld` thứ hai không ai đọc được.
- **`CE` thu hẹp**, không bỏ: chỉ còn bắn khi bài **dùng** vị từ cần đích mà **không khai** `targetState`.

### 3. `eraseProblemPlugin()` — không phải thêm ép kiểu nào mới

Hai dòng `as unknown as GameProblemPlugin<never, GameAction>` thay bằng `eraseProblemPlugin(...)`. **Typecheck 0 lỗi ngay lượt đầu** — hợp đồng của lead đúng, không có gì phải báo ngược.

### 4. `namespaces` → `kind: 'string-list'`

`minItems: 1` thay `required: true`, và nó mạnh hơn: `required` chỉ đòi trường có mặt nên một mảng RỖNG vẫn qua, mà cụm không namespace nào thì không đặt được tài nguyên vào đâu. `itemLabel` dùng lại khoá chữ của `label` — không thêm khoá mới, đúng quy ước file K8s đã ghi ở đầu.

## Ô mới (4)

Ba ô đầu nằm trong describe `graphShapeMatches — chạy thật khi bài có targetState`:

1. **`AC`** — người chơi gõ `git branch tinh-nang`, hình dạng khớp cây đích.
2. **`WA`** — chưa gõ gì, hình dạng lệch. **`WA` chứ tuyệt đối không phải `CE`**, vì bài CÓ khai `targetState`.
3. **`AC` với `seed: 12345`** — cây đích đi theo seed của lượt chơi, bắt được ai đó đóng đinh một seed riêng cho đích.
4. **K8s: `targetState` không đổi kết quả** — nhận rồi bỏ qua, không ném.

**Vì sao phải là một CẶP AC/WA trên cùng cây đích, khác đúng một lệnh:** chỉ có ô `AC` thì một hiện thực "luôn trả `true`" vẫn xanh; chỉ có ô `WA` thì hiện thực cũ "luôn trả `false`" cũng xanh. Trước lượt này `graphShapeMatches` chỉ có bằng chứng ở nhánh lỗi — một vị từ chưa ai biết có chạy đúng không.

Cây đích (`gitDichThemNhanh`) dựng từ `graphSignature` (`git/predicates.ts:137`) chứ không đoán: chữ ký là `<tên nhánh>:<chuỗi commit theo cha thứ nhất>`, nên thêm một nhánh là thay đổi nhỏ nhất làm chữ ký khác đi mà vẫn trong tầm một lệnh gõ được.

Ngoài ra, vòng lặp `predicateNames` **bỏ được `continue`**: trước đó tên duy nhất cần tham số thứ hai lại là tên duy nhất không ai kiểm.

## ⚠ Việc của lead — bốn export chưa có trong barrel

`grep` trên `index.ts`: cả bốn đều `=0`.

| Export | Mức | Vì sao |
|---|---|---|
| `GIT_UNSEEDED_REPLAY_SEED`, `K8S_UNSEEDED_REPLAY_SEED` | **cao nhất** | Vai mới của chúng là *"số CLIENT nạp khi mở một bài không seedable"*, mà client sống ở `apps/web` — ngoài package này. Không với tới được qua barrel thì `apps/web` sẽ tự đặt một số, và đó **đúng bằng chỗ hỏng mà `ae7ed23` vừa gỡ**, chỉ chuyển từ giữa hai plugin sang giữa client và server. |
| `ErasedProblemPlugin` (type) | trung bình | `ProblemPluginRegistry` đã ở trong barrel và kiểu phần tử của nó nay là `ErasedProblemPlugin`. Consumer cầm được bảng mà không gọi tên được phần tử. |
| `eraseProblemPlugin` | thấp | Chỉ cần nếu có nơi ngoài package tự dựng bảng đăng ký. Chưa có nơi nào. |

`targetState` **không** cần export riêng — nó là trường của `ProblemBase`, và type đó đã ở trong barrel.

## Ranh giới đã giữ

Không ghi vào `core/problem.ts`, `core/problem-plugin.ts`, `index.ts`, `k8s/problem-regression.test.ts`, `core/verify.ts`, `k8s/replay-engine.ts`, `apps/web/`. Commit dạng pathspec bốn file; `apps/web/src/server/problems/verdict-view.ts` của lane khác đang sửa dở trong cây chung và không bị cuốn vào.
