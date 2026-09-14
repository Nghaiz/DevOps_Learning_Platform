# Lane 18.A.4 + 18.A.5 — hai plugin OJ và bảng đăng ký

Ngày 2026-09-14 · nhánh `feat/p18-oj-exam` · commit `13840c2`, `aca4f88`, `c3f0fc1`

> ⚠ **Kênh bàn giao.** `SendMessage` KHÔNG có trong bộ công cụ của phiên này và
> `ToolSearch` bị tắt (`ToolSearch is disabled for this session`), nên không gửi
> được tin thẳng cho lead. Mọi thứ lẽ ra nằm trong tin nhắn đó nằm ở đây, và
> §1 là phần lead cần trước nhất.

---

## 1. Dòng export cần thêm vào barrel — lead wire giúp

`packages/games/src/index.ts` là file lead sở hữu nên lane này KHÔNG chạm. Ba
khối dưới đây là thứ cần thêm; chúng đã typecheck được ở dạng import trực tiếp.

```ts
// ── Plugin bài tập theo game (18.A.4 / 18.A.5) ──────────────────────────────
export {
  GIT_PROBLEM_CODE_PREFIX,
  GIT_PROBLEM_PLUGIN,
  GIT_PROBLEM_TOPICS,
  GIT_UNSEEDED_REPLAY_SEED,
  gradeGitProblem,
} from './git/problem-plugin.ts';
export {
  K8S_PROBLEM_CODE_PREFIX,
  K8S_PROBLEM_PLUGIN,
  K8S_PROBLEM_TOPICS,
  K8S_UNSEEDED_REPLAY_SEED,
  gradeK8sProblem,
} from './k8s/problem-plugin.ts';

// ── Bảng đăng ký + đường chấm dùng chung ────────────────────────────────────
export {
  PROBLEM_PLUGINS,
  UnknownProblemGameError,
  gradeProblemRun,
  problemPluginMeta,
} from './problem-plugins.ts';
```

`GIT_AUTHOR_FIELDS` / `K8S_AUTHOR_FIELDS` cố ý KHÔNG có trong danh sách: tầng UI
đọc chúng qua `problemPluginMeta(gameId).authorFields`, và mở thêm một đường thứ
hai tới cùng dữ liệu là mời một chỗ dùng bỏ qua bảng đăng ký.

**Lane web cần đúng ba chữ ký này, và chúng khớp brief từng chữ:**

```ts
export const PROBLEM_PLUGINS: ProblemPluginRegistry;
export function problemPluginMeta(gameId: GameId): ProblemPluginMeta | null;
export function gradeProblemRun(input: {
  readonly gameId: GameId;
  readonly initialState: unknown;
  readonly actions: readonly GameAction[];
  readonly testcases: readonly Testcase[];
  readonly seed: number | null;
}): GradeResult;
```

`gradeProblemRun` **ném** `UnknownProblemGameError` (một lớp lỗi riêng, có
`name` và `gameId`) khi `gameId` chưa có plugin — không trả `GradeResult` rỗng.

---

## 2. Đã làm

| # | Việc | Trạng thái |
|---|---|---|
| A.4 | `k8s/problem-plugin.ts` → `K8S_PROBLEM_PLUGIN` | ✅ |
| A.5 | `git/problem-plugin.ts` → `GIT_PROBLEM_PLUGIN` | ✅ |
| — | `problem-plugins.ts` — bảng đăng ký + hai hàm tra | ✅ |
| — | `problem-plugins.test.ts` — 18 ô, phủ cả đường đỏ | ✅ |
| — | 25 khoá chữ mới ở `packages/copy` (8 chủ đề Git + 17 nhãn form) | ✅ |
| **Hợp nhất tên** | bỏ 9 tên khai lại ở `k8s/problem.ts` | ❌ **CHƯA LÀM** — xem §4 |

### Phép đo

- `pnpm --filter @devops-platform/games typecheck` → **0** (đo lúc commit
  `aca4f88`; sau đó lane khác đẩy `1c1737d` làm barrel đỏ — xem §5).
- `pnpm --filter @devops-platform/copy typecheck` → **0**.
- `pnpm --filter @devops-platform/copy test` → **71/71**.
- `pnpm --filter @devops-platform/games test` → **1287/1287, 60/60 file**.

⚠ `pnpm --filter <pkg> test -- <đường dẫn>` KHÔNG lọc file: cả hai lượt chạy đều
báo `(60)` file. Con số 1287 ở trên là TOÀN BỘ suite của package, không phải
riêng test mới.

---

## 3. Hai lỗi thật, cả hai do chính test mới bắt

### 3.1 `grade` của K8s ném ra ngoài khi `initialState` sai loại

`createSession(...)` nằm **ngoài** `try`. `initialState` tới `grade` dưới dạng
`unknown` (cố ý, xem §1), nên một spec sai loại lọt qua tầng kiểu; `createCluster`
lặp trên `spec.resources` và ném `TypeError`. Ngoại lệ đó bay thẳng qua điểm cuối
HTTP thành 500 — trong khi hợp đồng đã có sẵn ô đúng cho nó là `CE` kèm câu nói
rõ. Sửa ở `c3f0fc1`: dựng phiên bên trong `try`, `session` thành `let ... | null`
để `finally` không giả định phiên đã tồn tại.

### 3.2 Một phép đo suýt mù: xoá Pod KHÔNG xoá Pod

Lượt viết test đầu dựng trên `delete` một Pod rồi khẳng định `resource-absent`.
Ô đó **đỏ**, và nếu đọc vội thì nó nói "action bị bỏ qua" — sai hoàn toàn.
`reducer.ts:282` tách riêng nhánh Pod: xoá Pod gọi `markDeleting(...,
DEFAULT_GRACE_TICKS)` chứ không gỡ object, đúng hành vi Kubernetes thật.

Test nay xoá một `ConfigMap` (đi nhánh `removeObjectCascade`, biến mất ngay), nên
ô đó chỉ còn đo đúng một điều: **nhật ký CÓ được phát lại hay không**. Lý do ghi
ngay trong test để lần sau không ai "sửa" nó ngược về Pod.

---

## 4. Bước hợp nhất tên — CHƯA làm, và có một lý do ngoài việc hết lượt

Lead đã dặn không bắt đầu nếu sắp hết lượt. Nhưng kể cả còn lượt thì bước này vẫn
**chặn ở hai chỗ**, và lead cần quyết trước khi giao lại.

### 4.1 Bốn chỗ gọi `isProblemCode` đều nằm trong vùng lane web sở hữu

```
apps/web/src/app/(session)/problems/[code]/page.tsx:40
apps/web/src/server/problems/cursor.ts:77,85
apps/web/src/server/problems/next-code.ts:49
apps/web/src/server/problems/validate.ts:46   (PROBLEM_CODE_PATTERN)
```

Brief cấm lane này ghi vào cả hai thư mục đó. Bản `core/` nhận thêm tham số tiền
tố, nên chỉ đổi đường import là **đỏ ngay** (`Expected 2 arguments, but got 1`) —
tức là bước hợp nhất bắt buộc phải sửa mã của lane web. Ba đường đi:

1. Lead giao bước này cho **lane web** (họ sở hữu cả bốn file).
2. Lead mở tạm quyền ghi bốn file đó cho một lượt riêng của lane này.
3. `k8s/problem.ts` giữ một **bọc một tham số** (`isProblemCode(value)` gọi
   `core` với `'K8S'`), không chỗ gọi nào phải sửa. Rẻ nhất, nhưng để lại hai hàm
   cùng tên khác chữ ký — đúng thứ `core/problem.ts` cảnh báo: *"một
   `import { isProblemCode }` mà người đọc không biết mình đang cầm cái nào"*.

Lane này **không tự chọn** vì cả ba đều đụng file của người khác hoặc đụng một
quyết định hợp đồng.

### 4.2 `ProblemForSolver` KHÔNG phải cùng một kiểu — brief đếm thừa một tên

Brief liệt kê 9 tên khai lại. **Tám** hợp nhất được (đọc từng field, giống hệt
nhau). Tên thứ chín thì không:

| | `k8s/problem.ts` | `core/problem.ts` |
|---|---|---|
| Khai | `Omit<Problem, 'hints'> & {...}` | `Omit<ProblemBase<Spec>, 'hints' \| 'testcases'> & {...}` |
| Tham số kiểu | không có | có (`Spec`) |
| Nền | `Problem` | `ProblemBase<Spec>` |

Và `Problem` **không phải** `ProblemBase<ClusterSpec>`:

- `Problem` có `objectives`, `allowedResources`; `ProblemBase` không.
- `ProblemBase` có `gameId`, `testcases`, `seedable`; `Problem` không.
- `topics` một bên là union đóng `ProblemTopic`, bên kia là `ProblemTopicId`
  (`string`).

Re-export bản `core/` sẽ làm `ProblemForSolver` thành generic và đỏ ở mọi chỗ
dùng nó không tham số (`problem-overview.tsx`, `solver.ts` — đều của lane web).
Hợp nhất tên thứ chín **đòi chuyển `Problem` sang `ProblemBase<ClusterSpec>`
trước**, và đó là một bước dịch chuyển riêng, to hơn hẳn A.4/A.5.

---

## 5. Chỗ lane này thấy hợp đồng của lead sai hoặc thiếu

### 5.1 `ProblemPluginRegistry<never>` không nhận nổi một plugin nào

Bỏ hai phép ép trong `PROBLEM_PLUGINS` rồi chạy typecheck (2026-09-14):

```
src/problem-plugins.ts(56,3): error TS2375: Type
'GameProblemPlugin<ClusterSpec, K8sActionShape>' is not assignable to type
'GameProblemPlugin<never, GameAction>' with 'exactOptionalPropertyTypes: true'.
```

⚠ Mã lỗi nói về `exactOptionalPropertyTypes`, tức chỗ chặn **đầu tiên** là thuộc
tính tuỳ chọn `seedSpec?` chứ không phải `never`. `never` ở vị trí **trả về** của
`initialSpec(): Spec` là chỗ chặn thứ hai **đáng ngờ nhưng chưa đo riêng được**:
`tsc` dừng ở lỗi đầu. Lane này **không** khẳng định vế thứ hai.

Hệ quả thực tế: mọi chỗ đăng ký plugin đều cần một phép ép. Lane đặt nó ở **đúng
một chỗ** (bảng) và giữ kiểu đầy đủ ở hai file plugin, nên sai lệch hợp đồng vẫn
đỏ tại nơi sinh ra. Sửa tận gốc là việc của `core/problem-plugin.ts`.

### 5.2 `seed: number | null` buộc mỗi plugin phải công bố một hằng "không seed"

`grade` nhận `seed: number | null`, nhưng cả hai engine **bắt buộc** một số để
dựng trạng thái đầu — và với K8s con số đó **đổi kết quả**: `createCluster` lưu
`rng: seedRng(seed)` vào chính `ClusterState`, nên mọi tick sau đó phụ thuộc nó.

Nên `null` không phải "không cần seed", nó là "hai bên phải tự thoả thuận một
số". Lane công bố `K8S_UNSEEDED_REPLAY_SEED = 0` và `GIT_UNSEEDED_REPLAY_SEED = 1`
(khớp mặc định sẵn có của `createGitSession`, `engine.ts:99`) và export cả hai —
client chấm tại chỗ **bắt buộc** nạp cùng hằng, nếu không thì mọi lượt nộp hợp lệ
vào bài không-seedable đều lệch trạng thái đầu và bị từ chối.

**Đề nghị lead cân nhắc:** để `Submission.seed` luôn mang số thật (kể cả bài
không seedable) thì cả lớp lỗi này biến mất, và không hằng nào phải tồn tại.

### 5.3 `graphShapeMatches` khai được nhưng dùng không được

Vị từ đó so hình dạng DAG với một **thế giới đích** (`GitLevel.target`), mà
`ProblemBase` chỉ có `initialState` — không ô nào cho cây đích. Hợp đồng đòi
`predicateNames` khớp hiện thực hai chiều nên nó vẫn phải nằm trong danh sách; để
`evaluatePredicate` trả `false` như bình thường thì testcase đó **không bao giờ
qua được** và trông y hệt một lời giải sai. Lane trả `CE` kèm câu nói rõ, và có
một ô test gác. Cần một ô cho cây đích trong `ProblemBase` nếu muốn dùng thật.

### 5.4 `AuthorField` thiếu dạng "danh sách giá trị đơn"

`ClusterSpec.namespaces` là `readonly string[]`. `kind: 'list'` mô tả danh sách
của một **nhóm trường con** (mỗi mục là object), `kind: 'text'` mô tả đúng một
chuỗi. Không dạng nào khớp. Trang soạn bài hiện dùng textarea "mỗi dòng một
namespace" rồi tự tách — một quy ước nằm trong mã giao diện, không nằm trong kiểu.
Lane dùng `json` vì nó **trung thực** (không hứa một widget mà UI chưa dựng được).
Một `kind: 'string-list'` sẽ gỡ được chỗ này.

### 5.5 Plan gọi sai tên một kiểu

Plan §18.A.5 viết `GitRepoSpec`. Tên đó **không tồn tại** trong mã; kiểu thật là
`WorldSpec` (`git/contract.ts:796`), và nó mô tả cả origin lẫn bot chứ không chỉ
một repo. Đã dùng `WorldSpec`.

### 5.6 Nợ trích dẫn vừa phát sinh (không phải lỗi hợp đồng)

Lane khác đẩy `1c1737d` ("gỡ K8s khỏi core/verify.ts — chuyển adapter sang k8s/")
trong lúc lane này đang chạy. Hai chú thích của lane đang trích
`core/verify.ts:sessionReplayEngine`, nay đã đổi nhà:

```
packages/games/src/problem-plugins.ts:129
packages/games/src/k8s/problem-plugin.ts:324
```

Chỉ là đường dẫn trong chú thích, không phải import — typecheck không đỏ vì nó.
**Đã sửa trong cùng lượt**: nhà mới là `k8s/replay-engine.ts:57`.

⚠ Cùng commit đó làm `packages/games` **đỏ typecheck** ở thời điểm viết báo cáo:
`src/index.ts(176,3): error TS2305: Module '"./core/verify.ts"' has no exported
member 'sessionReplayEngine'`. Barrel là file lead sở hữu nên lane này không
chạm.

**Đã được gỡ trước khi lane này đóng lượt**: lead sửa barrel ngay trong cây làm
việc (chưa commit lúc đo), và `pnpm --filter @devops-platform/games typecheck`
trả **0** trở lại ở `df94dbd`. Ghi lại vì con số typecheck ở §2 đo tại `aca4f88`,
trước quãng đỏ đó — nếu không nói ra thì hai phép đo trong cùng báo cáo trông
như mâu thuẫn nhau.

---

## 6. Quyết định đã ghi lý do tại chỗ

- **Ba tình huống là `CE` chứ không phải `WA`** — bài không có testcase, testcase
  gọi vị từ không tồn tại, engine ném khi phát lại. Cả ba là *bài soạn hỏng*, và
  cả ba nếu im lặng thành `WA` sẽ cho ra một bài **không ai giải được** mà không
  ai biết tại sao: một testcase vĩnh viễn đỏ trông y hệt một lời giải sai. Ở
  LEVEL thì bỏ qua vị từ lạ là đúng (hỏng một level, không hỏng phiên chơi); ở
  một OJ có chấm điểm thì đó là thứ §"Errors Over Silent Fallbacks" cấm.
- **Lệnh gõ sai KHÔNG thành `CE` ở bước này.** §18.B.5 mới là chỗ quyết chính
  sách đó, và nó cần một quyết định thật: một lệnh sai giữa chừng rồi gõ lại đúng
  có làm hỏng cả lượt không? A.5 không được tự đặt ra chính sách chấm điểm.
- **`seedSpec` vắng mặt ở cả hai plugin** — một lời khai, không phải chỗ bỏ trống.
  Hợp đồng chốt: thiếu `seedSpec` ⇒ mọi bài của game đó buộc `seedable: false`.
  Khai một `seedSpec` trả thẳng `base` sẽ để cổng §18.G.3 cho kỳ thi
  `per-student` chạy trong khi mỗi sinh viên nhận **cùng một đề**.
- **Tám chủ đề Git, id để trần** (`branching`, không phải `git-branching`) — đối
  xứng với chín id K8s; chúng không đụng nhau vì cổng kiểm luôn tra theo `gameId`.
  Khoá chữ thì phải có đoạn `git` vì `packages/copy` là không gian tên phẳng.
- **Form soạn `WorldSpec` gần như toàn `json`** — `commits` là một **đồ thị**
  (`parents` trỏ vào id của mục khác, `branches`/`tags`/`head` trỏ ngược lại), nên
  một biểu mẫu ô phẳng không kiểm được tham chiếu có thật và cho phép soạn ra thế
  giới không dựng được. §18.E (Level Builder) mới là câu trả lời cho phần đó.

---

## 7. Việc còn lại

1. **Lead:** wire 3 khối export ở §1 vào barrel, và sửa dòng 176 đang đỏ (§5.6).
2. **Lead quyết** đường đi cho bước hợp nhất tên (§4.1) — ba lựa chọn, cả ba đụng
   file của lane khác.
3. **Lead cân nhắc** §5.1 (`never` → `unknown`), §5.2 (`seed` luôn là số),
   §5.3 (ô cho cây đích), §5.4 (`kind: 'string-list'`).
5. **A.6** (tầng UI đọc `authorFields`) chưa bắt đầu — không thuộc lane này.
