# Review đối kháng — P18 OJ K8s, 3 commit

**Phạm vi:** `4bceeb9` · `32ea4fa` · `0f086de` trên `feat/p18-oj-exam`. CHỈ ĐỌC.
**Trạng thái:** XONG — cả bảy câu đã có kết luận. Điểm 4/10 (xem cuối file).

---

## Q1 — Fixture của ô gác có nghèo không?

**Đã tìm ở đâu:** `apps/web/src/components/k8s-arena/problem-level.test.ts` (toàn file), đối
chiếu từng trường giữa `k8sOjLevel` (`problem-level.ts:152–239`) và `problemAsLevel`
(`server/problems/replay.ts:93–147`); định nghĩa `Level` tại
`packages/games/src/k8s/contract.ts:251–305`; `grep -rn "timeLimitSec\|seedable"` trên
`packages/games/src` + `apps/web/src`.

### 1.1 `targetState` — KHÔNG áp dụng (âm tính, có phạm vi)

`Level` của K8s không có trường `target`/`targetState` (contract.ts:251–305), và **không bản
dựng nào đọc `problem.targetState`**. Chỉ `problemAsGitLevel` trải nó (`replay.ts:270`).
Fixture thiếu `targetState` vì thế không che giấu gì. **Không phải phát hiện.**

### 1.2 `timeLimitSec` — không lệch level, nhưng lộ một lời hứa không ai giữ

`Level` không có `timeLimitSec`; `StoredProblem.timeLimitSec` (`core/problem.ts:308`) không
được đọc bởi cả hai bản dựng. Nên **không có lệch giữa hai bên** — fixture nghèo ở đây vô
hại cho `verifyRun`.

Nhưng hệ quả khác: đường OJ của K8s **không thi hành `timeLimitSec` ở đâu cả** — chốt ở
mục X3 phần "Phát hiện ngoài bảy câu". Mức: Minor.

### 1.3 `allowedResources !== null` — nhánh CHƯA ĐƯỢC ĐO, và có một lệch server↔server

- Fixture khai `allowedResources: null` (`problem-level.test.ts:78`), nên **chỉ nhánh
  `?? ALL_KINDS` chạy ở cả hai bên**. Ô ở dòng 177–185 khẳng định `length > 0` — điều này
  đúng hiển nhiên với `ALL_KINDS` và **không đo gì** về nhánh danh sách thật.
- Với bài có danh sách hạn chế, client (`problem-level.ts:218`) và server
  (`replay.ts:122`) vẫn khớp nhau (cùng biểu thức). **Chỗ lệch thật nằm giữa hai đường
  PHÍA MÁY CHỦ**: `gradeK8sProblem` phát lại trên `replayLevel(initialState)` vốn chốt cứng
  `allowedResources: ALL_KINDS` (`packages/games/src/k8s/problem-plugin.ts:252`), còn
  `verifyRun` phát lại trên `problemAsLevel` mang danh sách thật. Hai lượt phát lại của
  cùng một lượt nộp chạy trên hai `Level` khác nhau.
- **Hôm nay vô hại — và tôi đã tự kiểm chứ không tin chú thích.**
  `grep -rn "allowedResources" packages/games/src/k8s/*.ts apps/web/src/components/k8s-arena/*`
  ra đúng: `contract.ts:287` (khai kiểu), `problem.ts:151` (khai kiểu),
  `problem-plugin.ts:252` (dựng), `problem-level.ts:218` + `replay.ts:122` (dựng),
  `arena-overlays.tsx:244` và `level-chips.ts:104` (chỉ để VẼ). **Không dòng nào trong
  `reducer.ts`/`session.ts`/`tick.ts` đọc nó.**
- **Mức: Minor hôm nay, Critical vào ngày engine bắt đầu chặn theo danh sách.** Lúc đó
  `grade.passed` (ALL_KINDS) và `replay.objectivesMet` (danh sách hẹp) lệch nhau, mà
  `k8sOjClaim` lấy `objectivesMet` TỪ `grade.passed` ⇒ `khong-khop` ⇒ `CE` cho mọi lượt
  nộp hợp lệ của mọi bài có hạn chế tài nguyên. Đúng triệu chứng mà cả ba khối chú thích
  cảnh báo, chỉ là ở một cặp file không ai ngờ.

### 1.4 `difficulty` — chỉ đo một trong bốn bậc

Fixture `"difficulty": "easy"` nên chỉ nhánh `easy → basic` chạy. Hai bản sao của phép đổi
(`problem-level.ts:118–128`, `replay.ts:61–73`) có bốn nhánh; ba nhánh còn lại
(`medium`/`hard`/`expert`) **không ô nào chạm**. Sửa lệch một bên ở nhánh `hard` sẽ xanh.

Vô hại cho `verifyRun` (`difficulty` không có trong `RunLog`/`RunResult`) — đúng như chú
thích khai. **Mức: Minor.** Nhưng chính file `problem-level.ts:114` tự nhận đây là bản sao
THỨ BA quá ngưỡng rule-of-three; một ô chỉ đo 1/4 nhánh không phải cái lưới cho món nợ đó.

### 1.5 `seedable` — xem mục "Q1.5" riêng bên dưới (Important)

### 1.6 `toEqual` bỏ qua khoá mang `undefined`

`expect(conLaiClient).toEqual(conLaiServer)` (`problem-level.test.ts:139`) — `toEqual` của
vitest coi `{a: undefined}` ≡ `{}`. Một trường thứ năm thêm vào MỘT bên với giá trị
`undefined` sẽ đi qua. Hẹp, nhưng lời khai ở dòng 49–52 ("mọi trường NGOÀI bốn cái trên
phải trùng khớp") rộng hơn thứ ô thật sự gác. **Mức: Suggestion** — dùng
`toStrictEqual` nếu muốn lời khai đúng bằng phép đo.

### 1.7 Fixture `initialState` không phải một `ClusterSpec` chạy được

`"initialState": { "nodes": [], "workloads": [] }` (`problem-level.test.ts:77`). Ô này
không bao giờ `createSession`, nên nó chứng minh **"hai level bằng nhau"** chứ không chứng
minh **"level dùng được"**. Chốt ở mục X4: fixture này KHÔNG phải một `ClusterSpec` hợp lệ
(`createCluster` duyệt `spec.resources`, `defaultNamespace` đọc `spec.namespaces[0]` — cả hai
vắng). Mức: Minor, nhưng nó là lý do thứ hai khiến ô không nâng cấp được.

---

## Q3 — Cờ `revealed` có nói dối với TÁC GIẢ bài không? — **CÓ. Khe áp nguyên vào đường K8s.**

**Mức: Important** (Critical với người đang soạn/kiểm bài của chính mình).

`apps/web/src/server/problems/solver.ts:140–152`:

```ts
export function toAuthorProblem(problem: StoredProblem): SolverProblem {
  const { hints, testcases, ...rest } = problem;
  return {
    ...rest,
    hints: hints.map((hint) => ({
      id: hint.id,
      penaltyPoints: hint.penaltyPoints,
      revealed: true,          // ← BẤT KỂ bảng problem_hint_reveals
      text: hint.text,
    })),
```

Đường đi của lỗi, từng chặng — không chỗ nào chặn:

1. `getProblemForViewer` (`get.ts:53`) rẽ sang `toAuthorProblem` khi
   `canReadHintText(visibility, row.authorId)`.
2. `arena-problem.tsx:105–110` chép nguyên `hint.revealed` vào `K8sOjProblem`.
3. `k8sOjClaim` (`problem-level.ts:314–319`) dựng
   `revealedHintIds = hints.filter(h => h.revealed) ∪ idGoiYTrongNhatKy(...)`
   ⇒ với tác giả, đó là **TOÀN BỘ** gợi ý.
4. `scoreProblemRun` trừ `penaltyPoints` của tất cả ⇒ điểm khai THẤP hơn thật.
5. Máy chủ: `submitProblem` (`submit.ts:~200`) dùng
   `revealedHintsForOne(db, userId, code) ∪ hintIdsFromLog(problem, log)` — chỉ gợi ý ĐÃ
   MỞ THẬT ⇒ điểm phát lại CAO hơn.
6. `verifyRun` so trường `score` (`core/verify.ts:437`) ⇒ `khong-khop` ⇒ không xác minh ⇒
   `score: 0` ghi vào DB và verdict hỏng.

**Kịch bản hỏng cụ thể:** tác giả bài `K8S-0007` (bài có ≥1 gợi ý `penaltyPoints > 0`) mở
`/games/k8s?problem=K8S-0007`, giải đúng, bấm Nộp bài **mà không mở gợi ý nào** → nhận một
verdict hỏng, trong khi một người học khác cùng lượt chơi đó thì đạt. Người soạn đọc ra
"bài của tôi hỏng".

Khe này **giống hệt** bản Git đã ghi, tức nó không được vá ở lượt này mà chỉ được nhân bản
sang game thứ hai. Không ô test nào của ba commit chạm nó: fixture `baiNguoiHoc()`
(`problem-level.test.ts:102–125`) dựng cờ `revealed` từ `revealedIds.includes(...)`, tức nó
mô phỏng **đường người học** và không bao giờ mô phỏng `toAuthorProblem`.

**Chỗ sửa đúng:** `toAuthorProblem` phải nhận `revealedIds` như `toSolverProblem` và khai
`revealed: revealedIds.has(hint.id)` — `text` vẫn trả đầy đủ (đó mới là đặc quyền của tác
giả). Hai trường đang bị buộc vào nhau mà chúng trả lời hai câu khác nhau: *"được ĐỌC
không"* và *"đã TRẢ TIỀN chưa"*.

---

## Q4 — Lập luận "pha `won` không tới được" — **ĐÚNG theo mã.** Việc gỡ tự-nộp là hợp lệ.

**Đã tìm ở đâu:** `packages/games/src/k8s/session.ts` — `grep -n "phase\|objectivesMet\|won"`
ra đúng bốn chỗ (dòng 66, 97, 400–403). Không có chỗ thứ hai nào sinh `phase`.

Chuỗi suy:

- `buildStatus` (`session.ts:397–406`) là **nguồn DUY NHẤT** của `phase`:
  `phase: sessionPhase(level.objectives, met)` với `met = evaluateObjectives(state, level.objectives)`.
- `evaluateObjectives` (`session.ts:66–80`) tra `PREDICATES[objective.check]`; client dựng
  `check: ''` (`problem-level.ts:171`) ⇒ `PREDICATES['']` là `undefined` ⇒ `continue` ⇒
  `met` LUÔN rỗng.
- `sessionPhase` (`session.ts:93–98`): `required` = mọi objective (client đặt
  `required: true` cho tất cả, `problem-level.ts:181`). Bài chấm được có ≥1 testcase
  (`k8sOjGradable`), nên `required.length > 0` ⇒ `every(...)` trên tập rỗng ⇒ `'playing'`.
- Ca biên `testcases: []` ⇒ `required.length === 0` ⇒ `sessionPhase` trả **`'playing'`**
  (dòng 95–96), KHÔNG phải `'won'`. Nên ngay cả ca đó cũng không mở đường.

⇒ `won` không tới được ở chế độ problem. **Gỡ tự-nộp không phải hồi quy.**

**Nhưng có một hệ quả sản phẩm mà commit không nói ra:** vì `met` luôn rỗng, **danh sách
mục tiêu trên HUD không bao giờ sáng lên**. `problem-level.ts:164–169` có ghi nhận điều này
("Thứ nó có làm mất là phản hồi tại chỗ… phải hiện trên màn chứ không nằm trong chú thích
này") — tôi sẽ kiểm ở Q6 xem màn hình có thật sự nói ra không, vì chính chú thích tự đặt ra
nghĩa vụ đó.

---

## Q2 — `k8sOjClaim` vs `problemScoreRun` (đang hoàn thiện)

Đã chốt được các vế sau:

- **Khử trùng + sắp xếp: TƯƠNG ĐƯƠNG, không lệch.** Client sắp + khử
  (`problem-level.ts:314–319`); server khử + sắp (`submit.ts` `revealedIds`). `hintPenalty`
  (`problem-scoring.ts:97–109`) dựng `Set` rồi duyệt `hints` nên **thứ tự và trùng lặp
  không ảnh hưởng số**. Hai bên ra cùng một số.
- **`hints` truyền vào `scoreProblemRun` khớp về TẬP và về `penaltyPoints`.**
  `toHintTeasers` (`solver.ts:113–124`) giữ **mọi** phần tử và giữ nguyên `penaltyPoints`;
  client chỉ thay `text` rỗng (`problem-level.ts:344`) mà `text` không vào phép tính.
- **`objectivesTotal` khớp.** `toTestcaseTeasers` (`testcases.ts:105–118`) giữ mọi phần tử,
  chỉ `label` bị che ⇒ `problem.testcases.length` bằng nhau hai bên.
- **⚠ `verifyRun` KHÔNG so `objectivesTotal`.** Sáu trường nó thật sự so là `levelId`,
  `seed` (dòng 376–381), `commandsUsed`, `hintsUsed`, `objectivesMet`, `score` (dòng
  414–443). Bảng liệt kê trong brief có bảy tên. Không phải lỗi của mã — nhưng ai dựa vào
  "objectivesTotal được gác" là dựa vào một ô không tồn tại.
- **Đường lấy `objectivesMet` đi qua HAI bộ chấm khác nhau** — đây là vế nặng nhất và đang
  được đo nốt: lời khai lấy `thu.passed` từ `gradeK8sProblem`
  (`problem-plugin.ts:296–393`, phát lại trên `replayLevel`, chạy vị từ trên trạng thái
  CUỐI, đẩy id theo thứ tự `testcases`), còn `verifyRun` so với
  `session.getStatus().objectivesMet` (`replay-engine.ts:98` → `evaluateObjectives`, duyệt
  `level.objectives` theo thứ tự). Cùng thứ tự, cùng `autoTick: false`, cùng seed — nên
  **khớp ở đường bình thường**; các ca lệch đã tìm thấy ghi ở Q1.3 và phần cập nhật sau.

---

_(Q5, Q6, Q7 đang làm — cập nhật tiếp.)_

---

## Q6 — `arena-entry.tsx`: luật hook OK, nhưng **hai lời khai còn lại đều SAI**

### 6.1 Luật hook — KHÔNG vi phạm ✅

`ArenaEntry` (`arena-entry.tsx:44–61`) **không gọi hook nào** trước nhánh `if (problemCode !== null)`;
state của chế độ level đã được tách xuống `ArenaLevelEntry` (dòng 70–98). Đây là cách đúng, và
khối chú thích dòng 63–68 nói đúng lý do. Không có phát hiện.

### 6.2 ⛔ CRITICAL — chế độ LEVEL gọi `api.useUtils()` mà KHÔNG có provider ⇒ **ném**

Chuỗi tĩnh, từng mắt đã đọc bằng mắt:

| # | Bằng chứng |
|---|---|
| 1 | `app/games/k8s/page.tsx:42` → `<ArenaEntry problemCode={null} />` ở chế độ level |
| 2 | `arena-entry.tsx:60` → `<ArenaLevelEntry />` → dòng 97 `<ArenaRoot level={level} …/>` |
| 3 | `arena-root.tsx:227` render `<ArenaOverlays …/>` **vô điều kiện**, cả hai chế độ |
| 4 | `arena-overlays.tsx:197` gọi `useProblemSubmit(engine, mode, props.startedAt)` **vô điều kiện** (hook ở đầu component, không sau nhánh nào) |
| 5 | `use-problem-submit.ts:105` `const utils = api.useUtils();` — chạy TRƯỚC mọi `if (problem === null)` (dòng 204) |
| 6 | `@trpc/react-query@11.18.0` → `dist/shared-JtnEvJvB.mjs:746` `useUtils: useContext`, và dòng 447–450: `if (!context) throw new Error("Unable to find tRPC Context…")` |
| 7 | `grep -rn "TrpcQueryProvider" apps/web/src/app --include=*.tsx` → **không một dòng nào** dưới `app/games/`. `app/games/layout.tsx:23` trả `<>{children}</>` trần |

⇒ **Vào `/games/k8s`, chọn một level, và `ArenaOverlays` ném ngay lúc render.**
Dòng 109 (`api.problems.tryGrade.useMutation()`) ném theo cùng lý do (dist dòng 552 cũng
`useContext()`).

**Đây là lỗi CÓ TRƯỚC ba commit này** (`git log -S"useProblemSubmit" -- arena-overlays.tsx` →
`df8e4c3`, và bản cũ `32ea4fa^:use-problem-submit.ts:77` cũng gọi `api.useUtils()` vô điều kiện).
Nhưng nó thuộc phạm vi review này vì **commit `4bceeb9` LIỆT KÊ chính lỗi đó là "lỗi #2"** và
`32ea4fa` tuyên bố đã vá — trong khi bản vá chỉ cấp provider cho cây con `?problem=`. Nửa còn
lại của cùng một lỗi vẫn nguyên, ở đúng chế độ mà commit khẳng định "không bị chạm".

Chú thích ở `arena-overlays.tsx:187–190` — *"Hook tự trả `idle` khi `mode.problem` là `null`,
nên nó gọi vô điều kiện ở đây"* — là lời khai sai: hook **không tới được** nhánh trả `idle`,
vì nó ném ở dòng 105 trước đó.

**Chỗ sửa đúng:** tách phần gọi `api.*` ra một component con chỉ render ở chế độ problem
(cùng khuôn `ArenaProblemScreen` đã làm với provider), hoặc bọc `TrpcQueryProvider` quanh
`ArenaRoot` chỉ ở nhánh problem. Không được "thêm provider vào `games/layout.tsx`" — đó là
đúng thứ layout đó tồn tại để cấm.

### 6.3 Important — `next/dynamic` KHÔNG giữ tầng mạng ngoài bundle của người chơi level

`arena-entry.tsx:27–29` khai: *"một `import` tĩnh ở đây sẽ đưa cả tầng mạng vào bundle của
người chơi level"* — và commit message lặp lại. Nhưng tầng mạng **đã ở trong bundle đó rồi**,
qua một chuỗi import TĨNH song song:

```
arena-entry.tsx:20   import { ArenaRoot } from './arena-root'        (tĩnh)
arena-root.tsx:27    import { ArenaOverlays } from './arena-overlays' (tĩnh)
arena-overlays.tsx:35 import { useProblemSubmit } from './use-problem-submit' (tĩnh)
use-problem-submit.ts:5 import { api } from '../../lib/trpc-react'   (tĩnh)
lib/trpc-react.tsx:4-6  QueryClient/QueryClientProvider, createTRPCReact, httpBatchLink
```

`next/dynamic` trên `arena-problem.tsx` chỉ hoãn được `ArenaProblemScreen`; module
`lib/trpc-react` vào chunk của `arena-root` bất kể. Ô nghiệm thu "0 lời gọi backend" đo
**network trace lúc chạy**, không đo bundle, nên nó vẫn xanh — đúng hình dạng
`green-that-proves-nothing`: cái được đo không phải cái được khai.

Sửa 6.2 (tách component con) đóng luôn 6.3.

---

## Q5 — Còn đường nào đổi `game_id` ngoài `assertGameIdUnchanged`? — **KHÔNG.** (âm tính, có phạm vi)

**Đã tìm ở đâu:**
`grep -rn "update(problems)\|insert(problems)\|delete(problems)" apps/web/src/server --include=*.ts`
→ đúng **4** chỗ, tất cả trong `crud.ts`:

| Dòng | Việc | Có chạm `game_id`? |
|---|---|---|
| `crud.ts:42` | `insert` (`createProblem`) | Có — nhưng `code` cấp bằng `nextProblemCode(db, body.gameId)` (dòng 39) nên tiền tố khớp từ đầu |
| `crud.ts:79–87` | `update` … `.set({ ...toRowValues(body) })` | Có (`toRowValues` dòng 190 `gameId: body.gameId`) — **đã gác** bởi `assertGameIdUnchanged` ở dòng 77 |
| `crud.ts:156` | `delete` | Không |
| `crud.ts:162` | `setState` — `.set({ state, updatedAt })` | Không chạm `game_id` |

Chỗ gọi: `trpc/routers/problems.ts:380` (create) và `:384` (update) — không router thứ ba.
Seed script: `grep -rln "problems" apps/web/scripts/ scripts/` → **không có file nào**.
Migration: `grep -rn "game_id" apps/web/drizzle/*.sql` → chỉ `0015_marvelous_rogue.sql:2`
(`ADD COLUMN … DEFAULT 'k8s' NOT NULL`), không có UPDATE nào sau đó.

⇒ **Cổng đã kín.** Rủi ro còn lại đúng như `next-code.ts` tự khai: một DB chạy trước lượt siết
này có thể còn dòng lệch, và không có migration nào dò/sửa. Lời khai đó **đúng**.

### 5.1 Minor — dòng TÓM TẮT của chính hàm vừa siết vẫn nói luật CŨ

`crud.ts:236`:

```
 * Đổi `gameId` chỉ được phép khi bài CHƯA có ai nộp.
```

Đó là dòng đầu JSDoc của `assertGameIdUnchanged` — **thứ IDE hiện lên khi hover**, và nó mâu
thuẫn thẳng với tên hàm lẫn thân hàm (chặn vô điều kiện, dòng 285–301). Commit `0f086de` viết
lại toàn bộ phần thân chú thích nhưng không chạm dòng tiêu đề. Cùng loại lỗi mà chính commit
message chê ở `next-code.ts` ("chú thích của chính cổng cũ đã nói ra câu trả lời mà không áp
dụng nó").


---

## Q1.5 — `seedable` — fixture mù, và client KHÔNG đọc trường đó ở đâu cả

**Mức: Important.**

`arena-session.ts:133`:

```ts
const seedRef = useRef(Math.floor(Math.random() * 2 ** 31));
```

Đó là seed DUY NHẤT của đấu trường, dùng cho cả hai chế độ (dòng 138
`createSession({ level, seed: seedRef.current })`). Không một dòng nào trong
`apps/web/src/components/k8s-arena/` đọc `problem.seedable` — `grep -rn "seedable"
apps/web/src/components/` ra 0 kết quả, và `K8sOjProblem` (`problem-level.ts:77-88`) thậm chí
không khai trường đó.

Hai hệ quả:

1. **Hằng hợp đồng `K8S_UNSEEDED_REPLAY_SEED = 0`** (`k8s/problem-plugin.ts:75`) tự khai vai
   còn lại của nó là *"số client nạp vào `createSession` khi mở một bài không seedable, rồi
   ghi vào `Submission.seed`"*. Client duy nhất tồn tại không dùng nó. Hằng đó hiện là mã
   chết mang một lời khai sai — đúng loại "mã chết trông như đang sống" mà `32ea4fa` vừa gỡ
   ở chỗ khác.
2. **Bài `seedable: false` vẫn cho mỗi người một thế giới khác nhau.** Không lệch xác minh
   (mọi đường chấm đều đọc `log.seed`), nhưng nó xoá đúng cái tính chất mà `seedable: false`
   sinh ra để có.

Fixture `problem-level.test.ts:76` khai `"seedable": false` và không ô nào đọc trường đó, nên
ô gác không nói gì về nhánh này ở cả hai giá trị.

---

## Q7 — Ô nào xanh vì lý do sai

### 7.1 Ô "ĐỐI CHỨNG: công thức cũ KHÁC công thức máy chủ" không gác thứ nó khai

`problem-level.test.ts:358-388`. Lời khai ở dòng 360: *"Ô này đỏ nếu ai đó đưa
`buildRunResult` trở lại đường nộp bài OJ."*

**Nó không đỏ trong ca đó.** Ô này không import, không mock, không chạm
`use-problem-submit.ts` — tức không chạm đường nộp bài. Nó chỉ gọi hai hàm thuần rồi khẳng
định hai số khác nhau. Ai đó sửa `use-problem-submit.ts` để gọi lại `buildRunResult` thì ô
này vẫn xanh.

Thứ nó thật sự đo: *"hai công thức hiện vẫn khác nhau"*. Đó là một **pinned baseline trên một
sự KHÁC BIỆT**, và nó rơi đúng bẫy `rules/pinned-baseline-test-companion.md` §
"RED for the opposite reason":

- Ngày nào hệ thống thống nhất một công thức (chế độ level cũng chuyển sang
  `scoreProblemRun`) — một **cải tiến** — ô này ĐỎ, và câu báo lỗi của nó nói ngược sự thật.
- Phép "sửa" hiển nhiên lúc đó là xoá ô; xoá xong thì không còn gì.

Assertion là phủ định (`not.toBe`) nên nó còn xanh với mọi lý do khác làm hai số lệch — kể cả
một `buildRunResult` hỏng hoàn toàn.

**Chỗ sửa:** ô gác cho "đường nộp không dùng `buildRunResult`" phải nằm ở
`use-problem-submit.dom.test.tsx` và phải khẳng định `claimed.score` bằng đúng
`scoreProblemRun(...)` cho một lượt CÓ gợi ý đã mở — một khẳng định DƯƠNG, đỏ khi đường dây
đổi, không đỏ khi hệ thống được dọn.

### 7.2 Ô "score bằng ĐÚNG số máy chủ" chép hằng số sang — đúng thứ file này tự cấm

`problem-level.test.ts:304`:

```ts
const diemMayChu = problemScoreRun(baiMayChu(), ['h1'])(status, tallyLog(LOG));
```

`['h1']` là một chuỗi viết tay, không phải kết quả của đường máy chủ thật
(`revealedHintsForOne(db, ...) ∪ hintIdsFromLog(problem, log)`). Nên ô này so *"phép suy của
client"* với *"một kỳ vọng viết tay"*, không so hai phép suy với nhau. Nếu `hintIdsFromLog`
(`replay.ts:447-459`) đổi hành vi — ví dụ bắt đầu nhận index ngoài phạm vi — bản sao client
`idGoiYTrongNhatKy` (`problem-level.ts:249-261`) trôi khỏi nó mà ô vẫn xanh.

Mâu thuẫn với chính triết lý ô này tuyên bố ở dòng 17-24: *"so HAI BẢN DỰNG với nhau, chứ
không chép hằng số sang"*. Thay `['h1']` bằng
`[...new Set(hintIdsFromLog(baiMayChu(), LOG))].sort()` là một dòng, và biến ô thành phép so
hai chiều thật. **Mức: Important** — đây là ô gác DUY NHẤT cho trường `score`.

### 7.3 Fixture dùng TÊN VỊ TỪ KHÔNG TỒN TẠI, nên "đối chứng dương" rỗng nghĩa

`problem-level.test.ts:81-82` khai `"check": "replicasAtLeast"` và `"check": "noCrashLoop"`.

`PREDICATES` của K8s có 32 khoá, **toàn bộ kebab-case** — bảng đầy đủ được chốt cứng ở
`packages/games/src/k8s/problem-regression.test.ts:499-530`: `'replicas-at-least'`,
`'all-pods-healthy'`, `'pod-running'`, … **Không có `replicasAtLeast`, không có
`noCrashLoop`.**

Hệ quả:

- Đối chứng ở dòng 218 `expect(checkServer).not.toBe('')` chứng minh máy chủ chở **một
  chuỗi**, không chứng minh nó chở **một vị từ**. Với bài này `gradeK8sProblem` sẽ trả `CE`
  ngay ở cổng tên vị từ (`k8s/problem-plugin.ts:325`).
- Fixture vì thế **không nâng cấp được** thành ô mạnh hơn (dựng phiên thật, phát lại, so
  `objectivesMet`) — thứ duy nhất bắt được 7.4 dưới đây.

**Mức: Important.** Một fixture không hợp lệ làm mọi lời khai "đo được chứ không khai trước"
ở đầu file yếu hơn vẻ ngoài của nó.

### 7.4 CRITICAL — phát lại KHÔNG BAO GIỜ tua thời gian, nên bài dùng vị từ theo trạng thái chạy là bài không ai giải được

Phát hiện nặng nhất của lượt review, nằm ngay dưới đường mà ba commit vừa nối.

**Chuỗi bằng chứng (đọc, chưa chạy — cách xác nhận ở cuối mục):**

| # | Bằng chứng |
|---|---|
| 1 | `reducer.ts:120-123` — `reduce()` TUA mô phỏng: `advance(state, Math.max(0, action.tick - state.tick))` rồi mới `apply`. Chú thích: *"Tua mô phỏng tới `tick` rồi áp hành động."* Đây LÀ cơ chế phát lại theo thời gian |
| 2 | `session.ts:256-267` — `applyAction` **GHI ĐÈ** tick trước khi gọi `reduce`: `const stamped = { ...action, tick: state.tick }`. Vô điều kiện |
| 3 | `session.ts:295-304` — `dispatch(action)` uỷ quyền thẳng cho `applyAction` |
| 4 | `session.ts:227-228` — với `autoTick: false`, `startTimer()` thoát sớm, nên `commit(advance(state, 1))` (dòng 234) không bao giờ chạy |
| 5 | `grep -rn "advance(" packages/games/src/k8s/*.ts` (bỏ test) → đúng 3 chỗ gọi: `session.ts:234` (timer, đã tắt), `reducer.ts:122` (delta = 0, do #2), `reducer.ts:129` (action `kind: 'wait'`) |
| 6 | `grep -rn "kind: 'wait'"` trên `apps/web/src` + `packages/games/src` (bỏ test) → DUY NHẤT `core/run-log.ts:117`, tức khai kiểu. **Không nơi nào PHÁT một action `wait`** |
| 7 | Cả hai đường chấm dùng `autoTick: false` + `dispatch`: `k8s/replay-engine.ts:69,95` (đường `verifyRun`) và `k8s/problem-plugin.ts:348-357` (đường `gradeK8sProblem`) |

Trong mọi lượt phát lại, `state.tick` đứng yên ở **0**, mọi action bị đóng dấu tick 0,
`advance(state, 0)` là no-op, và **không một tick mô phỏng nào chạy**. Trường `tick` mà
`RunLog` cất công chở là dữ liệu chết trên đường phát lại.

**Vì sao điều đó giết bài thật:**

- Pod mới sinh ra ở `phase: 'Pending'`, `ready: false` (`model.ts:324-332`).
- Chuyển sang `'Running'` xảy ra TRONG `tick.ts` (dòng 365:
  `const phase: PodPhase = imageIssue ? 'Pending' : 'Running';`).
- `isHealthyRunning` (`predicates.ts:137-140`) đòi `phase === 'Running' && reason === null`.
- Chính repo đã ĐO sự phụ thuộc đó: `problem-regression.test.ts:540-556` tách `datNgay`
  (đạt ở tick 0) khỏi `datSauKhiLang` (đạt sau `SETTLE_TICKS`), và bảng chốt ở dòng 578-648
  có những mục tiêu **chỉ** xuất hiện ở vế sau — `tong-hop-chay` (K8S-0004, dòng 599-600),
  `ba-pod-chay` (K8S-0006, dòng 613-614).
- Bài `published` thật dùng đúng họ vị từ đó: `K8S-0001` có ba `deployment-ready` và một
  `all-pods-healthy` (`problem-regression.test.ts:196-200`).

Người học sửa đúng Deployment, nhìn pod lên `Running` trên màn (phiên sống có `autoTick`
mặc định `true` — `arena-session.ts:138` không truyền cờ), rồi bấm Nộp bài — và máy chủ chấm
trên một cụm chưa trôi một tick nào, nơi những pod đó còn `Pending` hoặc chưa tồn tại. Kết
quả: `WA` vĩnh viễn cho một lời giải đúng. Triệu chứng đọc ra là *"bài của tôi sai"*, không
phải *"bộ chấm hỏng"* — đúng lớp lỗi mà cả năm khối chú thích trong lane này sợ.

**Vì sao không ô nào bắt được:**

- `replay.test.ts:223` tính kỳ vọng bằng CHÍNH phép phát lại (`objectivesFrom(problem, log)`
  → dòng 313 `engine.objectivesMet(current)`), rồi khẳng định `da-xac-minh`. Nó chứng minh
  **phát lại khớp phát lại**, không chứng minh phát lại khớp **lượt chơi**.
  `green-that-proves-nothing.md`, hình dạng "checks the wrong artifact".
- `problem-level.test.ts` không dựng phiên nào (và fixture của nó mang vị từ không tồn tại —
  7.3 — nên cũng không dựng được).
- `use-problem-submit.dom.test.tsx` mock trọn `api`.

**Phạm vi trách nhiệm, nói thẳng:** lỗi này CÓ TRƯỚC ba commit (nó ở `session.ts` /
`replay-engine.ts`, không file nào trong diff). Nhưng nó thuộc review này vì ba commit tuyên
bố *"đường OJ của K8s chạy được"*, và cho tới lượt này chưa lượt nộp thật nào chạy qua để
phủ định điều đó.

**Cách xác nhận trong 10 dòng (review này CHỈ ĐỌC nên chưa chạy):** dựng một `Problem` có
testcase `'deployment-ready'`, một `RunLog` gồm một action `scale` mang `tick: 300`, gọi
`gradeK8sProblem` — `passed` rỗng thì kết luận trên đúng. Đối chứng dương: gọi `reduce` trực
tiếp (không qua `dispatch`) với cùng action, objective phải đạt.

**Chỗ sửa khả dĩ:** `applyAction` chỉ nên đóng dấu lại tick khi phiên đang chạy theo đồng hồ;
ở phiên `autoTick: false` nó phải TÔN TRỌNG `action.tick` — đó chính là lý do `reducer.ts:122`
tồn tại. Hoặc: đường phát lại bỏ `session.dispatch` và gọi thẳng `reduce`.

---

## Q2 (hoàn chỉnh) — `k8sOjClaim` vs `problemScoreRun`

### 2.1 Các vế ĐÃ KHỚP (không phải phát hiện, ghi để khỏi ai phải đo lại)

| Vế | Client | Máy chủ | Kết luận |
|---|---|---|---|
| Khử trùng `revealedHintIds` | `new Set(...)` rồi `.sort()` (`problem-level.ts:314-319`) | `new Set(...)` rồi `.sort()` (`submit.ts`, dòng `revealedIds`) | Tương đương; và `hintPenalty` (`problem-scoring.ts:97-109`) dựng `Set` rồi duyệt `hints`, nên **thứ tự lẫn trùng lặp đều không ảnh hưởng số** |
| Bảng `hints` truyền vào `scoreProblemRun` | `problem.hints.map(...)` giữ mọi phần tử + `penaltyPoints` | `problem.hints` | `toHintTeasers` (`solver.ts:113-124`) map 1-1, không lọc ⇒ cùng tập, cùng giá |
| `objectivesTotal` | `problem.testcases.length` | `problem.testcases.length` | `toTestcaseTeasers` (`testcases.ts:105-118`) map 1-1, chỉ che `label` ⇒ hai số bằng nhau |
| `movesUsed` | `tallyLog(log).commandsUsed` | `tally.commandsUsed` của `verifyRun` | Cùng hàm, cùng nhật ký |
| `parMoves` | `problem.parMoves` (thô) | `problem.parMoves` (thô) | Cùng giá trị, `scoreProblemRun` tự `?? 0` |

### 2.2 `verifyRun` so SÁU trường — và `objectivesTotal` KHÔNG nằm trong đó

`core/verify.ts`: `levelId` + `seed` (dòng 376-381, so trước, thoát sớm), rồi `commandsUsed`
(414), `hintsUsed` (421), `objectivesMet` (428-436, qua `normalizeObjectives` = `sort().join(',')`
— **không khử trùng**), `score` (437). Brief liệt kê bảy tên; `objectivesTotal` không được
gác ở đâu trên đường này. Không phải lỗi của mã — nhưng ai dựa vào "objectivesTotal được
gác" là dựa vào một ô không tồn tại.

### 2.3 `objectivesMet` đi qua HAI bộ chấm khác nhau — khớp hôm nay, không có ô nào giữ

Lời khai lấy `thu.passed` từ `gradeK8sProblem` (`k8s/problem-plugin.ts:373-380`: duyệt
`testcases`, chạy `PREDICATES[check]` trên trạng thái cuối), còn `verifyRun` so với
`session.getStatus().objectivesMet` (`replay-engine.ts:98` → `evaluateObjectives`
`session.ts:66-80`: duyệt `level.objectives`, cùng bảng `PREDICATES`).

Cùng thứ tự (cả hai suy từ `problem.testcases`), cùng `autoTick: false`, cùng `seed`
(`log.seed`) ⇒ **khớp ở đường thường**. Bốn ca lệch đã tìm thấy:

1. **Vị từ không tồn tại** — `gradeK8sProblem` trả `CE` với `passed: []`, `total: 0`
   (`problem-plugin.ts:325`); `evaluateObjectives` thì chỉ **bỏ qua** riêng mục tiêu đó và
   vẫn trả các mục tiêu hợp lệ khác ⇒ hai tập lệch. Verdict cuối vẫn xấu ở cả hai đường
   nên thiệt hại thấp, nhưng lý do báo ra sẽ sai.
2. **`allowedResources` hạn chế** — hai `Level` khác nhau (Q1.3). Ngủ đông cho tới khi
   engine đọc trường đó.
3. **Cờ `revealed` của TÁC GIẢ** — Q3, ăn vào `score` chứ không vào `objectivesMet`.
4. **Không tick nào chạy** — Q7.4. Ở ca này hai bên vẫn khớp NHAU (cùng sai), nên
   `verifyRun` trả `da-xac-minh` và hệ thống tự tin trả về một `WA` sai.

### 2.4 Minor — cờ `revealed` là ẢNH CHỤP lúc mở trang

`arena-problem.tsx:81` gọi `byCode` một lần; `mode.problem` giữ ảnh chụp đó suốt phiên
(`useMemo` trên `solverProblem`). Một gợi ý mở ở tab khác **sau** thời điểm nạp sẽ có trong
bảng `problem_hint_reveals` (máy chủ trừ điểm) nhưng không có trong ảnh chụp và không có
trong nhật ký (client không trừ) ⇒ lệch `score` ⇒ `CE`. Hẹp, nhưng có thật.

---

## Phát hiện ngoài bảy câu

### X1. CRITICAL — mở gợi ý ở chế độ bài tập TRỪ ĐIỂM và hiện CHUỖI RỖNG

Đường dây, từng mắt:

1. Wire của người học che nội dung gợi ý chưa mở: `toHintTeasers` (`solver.ts:122`)
   `text: revealed ? hint.text : null`.
2. `k8sOjLevel` (`problem-level.ts:228`) map `hint.text ?? ''` vào `Level.hints`.
3. Đấu trường **không bao giờ gọi `problems.revealHint`** —
   `grep -rn "api\." apps/web/src/components/k8s-arena/` ra đúng **ba** lời gọi:
   `byCode` (`arena-problem.tsx:81`), `submit` và `tryGrade`
   (`use-problem-submit.ts:108-109`). Mutation `revealHint` có tồn tại
   (`trpc/routers/problems.ts:166`) nhưng không client nào trong đấu trường gọi nó.
4. `mission-card.tsx:105` hiện `hints[hintsRevealed - 1]`, tức chuỗi rỗng.
5. Điểm trừ thì THẬT: action `hint` vào nhật ký ⇒ `hintIdsFromLog` ⇒ `scoreProblemRun` trừ
   `penaltyPoints` (và client trừ y hệt, nên **không** `CE` — chỉ mất điểm trong im lặng).

⇒ **Người học trả tiền cho một gợi ý trống.** Không ô nào đỏ, không lỗi nào hiện.

Khối chú thích ở `problem-level.ts:224-227` lập luận ngược: *"chuỗi rỗng ở đó là đúng nghĩa
— engine chỉ in nó ra khi người chơi tự mở"*. Nhưng "khi người chơi tự mở" CHÍNH LÀ lúc
`text` còn `null`: wire chỉ trả nội dung thật cho gợi ý đã mở **trước lúc nạp trang**.

Sửa: đấu trường phải gọi `problems.revealHint` rồi `invalidate` `byCode` trước (hoặc cùng
lúc) khi phát action `hint` — giống hệt khuôn "đọc lại `byCode` sau khi nộp" mà
`use-problem-submit.ts:65-75` đã dựng cho nhãn testcase.

### X2. Important — HUD hiện `0/N` vĩnh viễn, và nghĩa vụ "phải nói ra" chưa được trả

Hệ quả trực tiếp của Q4: `met` luôn rỗng ⇒ `mission-card.tsx:103-104`
`doneCount` luôn 0 ⇒ thẻ nhiệm vụ hiện `0/N` suốt lượt chơi, kể cả khi người học đã giải
xong.

`problem-level.ts:164-169` tự nhận nghĩa vụ này: *"Thứ nó có làm mất là phản hồi tại chỗ…
Đó là cái giá của §18.B.4, và **nó phải hiện trên màn chứ không nằm trong chú thích này**."*
Nghĩa vụ đó **chưa được trả**: `problem-submit-panel.tsx` chỉ có một `notice` duy nhất (bài
không testcase), và `mission-card.tsx` không có nhánh nào cho chế độ bài tập.

### X3. Minor — `timeLimitSec` của bài không được thi hành ở đấu trường

`StoredProblem.timeLimitSec` (`core/problem.ts:308`) không được `k8sOjLevel` lẫn
`problemAsLevel` đọc, và `Level` của K8s không có ô cho nó (`k8s/contract.ts:251-305` —
`timeLimitSec` chỉ có ở `Challenge`, dòng 321). Không đồng hồ nào chạy ở chế độ bài tập.
Không lệch xác minh; chỉ là một trường dữ liệu người soạn điền mà không gì đọc.

### X4. Minor — fixture `initialState` không phải `ClusterSpec` hợp lệ

`problem-level.test.ts:77`: `{ "nodes": [], "workloads": [] }`. `createCluster`
(`k8s/model.ts:409-426`) duyệt `spec.resources` (vắng ⇒ `TypeError`) và
`defaultNamespace` (`session.ts:50-52`) đọc `spec.namespaces[0]` (cũng vắng). Ô hiện tại
không dựng phiên nên không đỏ — nhưng nó là lý do thứ hai (cùng 7.3) khiến ô này không nâng
cấp được thành phép so mạnh hơn.

---

## Tổng kết

### Critical (phải sửa trước khi gộp)

| # | Chỗ | Việc |
|---|---|---|
| C1 | `apps/web/src/components/k8s-arena/arena-overlays.tsx:197` + `use-problem-submit.ts:105` | Chế độ LEVEL gọi `api.useUtils()` không có `TrpcQueryProvider` ⇒ **ném** (`@trpc/react-query@11.18.0` `shared-JtnEvJvB.mjs:449`). Chính "lỗi #2" mà `4bceeb9` liệt kê, chỉ mới vá nửa `?problem=` |
| C2 | `packages/games/src/k8s/session.ts:260` | `applyAction` ghi đè `action.tick` bằng `state.tick` ⇒ phát lại KHÔNG bao giờ tua thời gian ⇒ mọi vị từ theo trạng thái chạy (`deployment-ready`, `pod-running`, `all-pods-healthy`, …) chấm ra `false`. Bài `published` thật dùng đúng họ vị từ đó |
| C3 | `apps/web/src/components/k8s-arena/problem-level.ts:228` + thiếu lời gọi `problems.revealHint` | Mở gợi ý ở chế độ bài tập trừ `penaltyPoints` và hiện chuỗi rỗng |

C2 và C3 **có trước** ba commit này; chúng vào báo cáo vì ba commit tuyên bố đường OJ K8s
"chạy được" và không phép đo nào trong diff có thể phủ định điều đó.

### Important (sửa trước khi đóng chặng)

- **I1 — `toAuthorProblem` khai `revealed: true` cho mọi gợi ý** (`solver.ts:147`): tác giả
  nộp bài của chính mình nhận `CE`. Q3.
- **I2 — ô gác `score` chép hằng `['h1']`** thay vì gọi `hintIdsFromLog`
  (`problem-level.test.ts:304`): phá đúng triết lý "so hai bản dựng" mà file tuyên bố. Q7.2.
- **I3 — fixture dùng tên vị từ không tồn tại** (`problem-level.test.ts:81-82`): đối chứng
  dương ở dòng 218 rỗng nghĩa, và fixture không nâng cấp được. Q7.3.
- **I4 — `next/dynamic` không giữ tầng mạng ngoài bundle level** (chuỗi import tĩnh
  `arena-entry → arena-root → arena-overlays → use-problem-submit → lib/trpc-react`): lời
  khai ở `arena-entry.tsx:27-29` sai. Q6.3.
- **I5 — client không đọc `seedable`; seed luôn ngẫu nhiên** (`arena-session.ts:133`):
  `K8S_UNSEEDED_REPLAY_SEED` thành mã chết mang lời khai sai. Q1.5.
- **I6 — HUD `0/N` vĩnh viễn, nghĩa vụ "phải hiện trên màn" chưa trả.** X2.

### Minor / Suggestion

- M1 `crud.ts:236` — dòng tóm tắt JSDoc vẫn nói luật CŨ ("chỉ được phép khi bài CHƯA có ai
  nộp") trong khi hàm chặn vô điều kiện. Q5.1.
- M2 `problem-level.test.ts:139` — `toEqual` bỏ qua khoá `undefined`; dùng `toStrictEqual`.
- M3 Ô 7.1 là pinned baseline trên một KHÁC BIỆT, sẽ đỏ vì lý do ngược ngày hai công thức
  được thống nhất. Đổi sang khẳng định dương ở `use-problem-submit.dom.test.tsx`.
- M4 `problem-level.test.ts` chỉ đo 1 trong 4 nhánh `difficulty`; bản sao thứ ba của phép
  đổi vẫn không có lưới. Q1.4.
- M5 `allowedResources` hạn chế: `replayLevel` (ALL_KINDS) ≠ `problemAsLevel` (danh sách
  thật) — hai đường chấm phía máy chủ chạy trên hai `Level`. Ngủ đông. Q1.3.
- M6 Cờ `revealed` là ảnh chụp lúc mở trang; mở gợi ý ở tab khác ⇒ lệch `score`. Q2.4.
- M7 `timeLimitSec` của bài không được thi hành ở đâu. X3.
- M8 Fixture `initialState` không phải `ClusterSpec` hợp lệ. X4.

### Điều ba commit làm ĐÚNG

- Ô `problem-level.test.ts` so **hai bản dựng trong một tiến trình** thay vì chép hằng số —
  đó là hình dạng đúng, và "đỏ ba lượt trước khi xanh" là bằng chứng nó đo thật (trừ khe 7.2).
- Rẽ chế độ trước mọi hook (`arena-entry.tsx:44-61`) là cách duy nhất vừa rẽ sớm vừa giữ
  luật hook — và commit nói đúng lý do.
- Gỡ tự-nộp-khi-thắng: lập luận `won` không tới được **đúng theo mã**, đã kiểm ba chỗ
  (Q4). Không phải hồi quy.
- `0f086de` chặn `game_id` vô điều kiện: cổng kín, không đường vòng nào (Q5), và phần
  `next-code.ts` giữ nguyên phép lọc theo tiền tố là quyết định đúng với lý do đúng.
- `run-result.ts` đính chính một chú thích từng khẳng định bất biến mà mã không giữ — đúng
  kiểu sửa mà báo cáo này muốn thấy nhiều hơn.

### Điểm: 4/10

Ba lỗi được nêu trong commit message đều có thật và hai trong ba đã vá đúng chỗ. Nhưng lỗi
#2 chỉ vá một nửa (C1 — chế độ level vẫn ném), và cái nửa còn lại nằm ở đúng chế độ mà
commit khẳng định "không bị chạm"; cộng thêm hai lỗi CRITICAL ngay dưới đường vừa nối
(C2 phát lại không tua thời gian, C3 gợi ý rỗng có trả tiền) mà **không phép đo nào trong
diff có thể phát hiện** — vì cả ba loại ô (so builder-với-builder, mock trọn `api`,
phát-lại-so-phát-lại) đều mù với chúng. Chất lượng lập luận trong chú thích cao khác thường;
chất lượng **bằng chứng** thì chưa theo kịp: chưa một lượt nộp K8s thật nào chạy end-to-end.
