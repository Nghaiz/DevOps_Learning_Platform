# Lane 18.C — chấm lại phía máy chủ cho bài OJ game Git

**Ngày:** 2026-09-15 · **Nhánh:** `feat/p18-oj-exam` · **Phạm vi:** khối 4 của
`phase-18-exec.md` §2, nửa MÁY CHỦ.

Ba commit: `f9c...` (đường chấm), `0e5...` (ô gác), `3340420` (chốt `gameId`).
Tra bằng `git log --oneline --author-date-order` trên nhánh — SHA ghi ở đây có
thể lệch sau một lần rebase, nên đừng trích chúng đi nơi khác.

---

## 1. Hiện trạng đo được TRƯỚC khi sửa

Đường nộp bài khoá vào K8s ở **hai** chỗ, và chỉ một chỗ là cổng tường minh:

| # | Chỗ | Hình dạng |
|---|---|---|
| 1 | `submit.ts:144` | `if (problem.gameId !== 'k8s') throw` — cổng nhìn thấy được |
| 2 | `replay.ts:178` | `problemReplayEngine` → `problemAsLevel`, hàm NÉM với mọi game ≠ k8s |
| 3 | `routers/problems.ts` | `z.literal('k8s')` ở ba chỗ trong schema input |

Chỗ (2) mới là chỗ thật. Gỡ riêng (1) sẽ đổi một câu lỗi rõ ràng thành
`phat-lai-loi` giữa lượt chấm — đúng triệu chứng khối chú thích của
`problemAsLevel` cảnh báo: **một lỗi CẤU HÌNH đọc ra thành "bộ mô phỏng hỏng"**.

Chỗ (3) nằm ngoài quyền sở hữu của lane này; lead đã nới ở `bc18b81` (xem §5).

---

## 2. Đã làm gì

### 2.1 Tách đường theo `gameId`, KHÔNG nới kiểu của K8s

Thêm vào `apps/web/src/server/problems/replay.ts`:

- **`problemAsGitLevel(problem): GitLevel`** — hàm RIÊNG, đối xứng với
  `problemAsLevel`, ném với mọi game ≠ git. `problemAsLevel` giữ nguyên lời ném
  của nó, không đụng một dòng.
- **`gitProblemReplayEngine(problem, revealedHintIds): ReplayEngine<GitEngineSession>`**
  — adapter phát lại, anh em của `sessionReplayEngine` bên K8s.
- **`verifyProblemRun(problem, log, claimed, revealedHintIds)`** — cửa chung,
  `switch` theo `gameId`, ném `UnsupportedReplayGameError` (lớp CÓ TÊN) cho game
  chưa có adapter.

`submit.ts` gỡ cổng `gameId !== 'k8s'` và gọi `verifyProblemRun` qua một lớp bọc
`verifyOrExplain` đổi `UnsupportedReplayGameError` thành `INTERNAL_SERVER_ERROR`
kèm tên game.

### 2.2 Ba quyết định phải tự chốt, và cái giá của từng cái

**(a) `GitLevel.id` của level tổng hợp là `problem.code`, KHÔNG phải
`GIT_PROBLEM_REPLAY_LEVEL_ID`.**

`git/problem-plugin.ts` đã có một hằng cho việc này và nói rõ lý do (`GitLevel.id`
đi vào `getLog()` + tiến độ `localStorage`, nên phải khác mọi id thật `git-NN-`).
Không dùng lại được, vì ba chỗ phải khớp nhau:

- `GitEngineSession.getLog()` trả `levelId: level.id`;
- `verifyRun` so `log.levelId` với `claimed.levelId`;
- `init` ném khi nhật ký thuộc level khác.

Hai chỗ không mâu thuẫn: bộ chấm theo testcase (`gradeGitProblem`) chạy vị từ
thẳng trên thế giới cuối nên `level.id` của nó không bao giờ bị ai đọc; đường xác
minh thì ngược lại, `level.id` **là** khoá so. `problem.code` (`GIT-0001`) vẫn
thoả lời dặn gốc — khác mọi `git-NN-` nên không mồ côi tiến độ của ai.

**Cái giá:** đây là nửa máy chủ của một hợp đồng, và nửa client phải theo. Xem §4.

**(b) `project` của adapter trả `getWorld()`, không phải `getView()`.**

`getView()` là hình chiếu ĐỂ VẼ — nó bốc đúng thứ màn hình cần. So hai lần phát
lại trên nó thì mọi khác biệt ngoài khung nhìn (`origin`, PR, reflog, stash,
`logicalTime`) đi qua không ai thấy, tức phép kiểm `engine-khong-tat-dinh` mù dần
đúng theo cách `k8s/replay-engine.ts` cảnh báo. **Cái giá:** `stableStringify`
chạy trên toàn bộ `GitWorld` hai lần mỗi lượt nộp, đắt hơn so trên khung nhìn.
Chấp nhận: một lượt nộp đã phát lại hai lần rồi, và phép so rẻ hơn phép phát lại.

**(c) KHÔNG chép cổng kiểm tên vị từ sang `problemAsGitLevel`.**

`check` ép sang `GitPredicateName` mà không kiểm lại tên. Nghe như một lỗ, nhưng
đo ra thì không: `evaluatePredicate` là một `switch` **không có nhánh `default`**,
nên một tên lạ rơi ra ngoài và trả `undefined` — objective không bao giờ đạt, **y
hệt ở cả hai phía**, vì client chạy đúng engine đó. Hai bên khớp nhau ⇒ `verifyRun`
vẫn `da-xac-minh`, rồi `gradeGitProblem` — chỗ DUY NHẤT giữ cổng tên vị từ — trả
`CE` kèm câu gọi đúng tên testcase gõ sai.

**Cái giá:** một bản sao thứ hai của cùng một luật sẽ trôi, nên không dựng nó.
Đổi lại, nếu ngày nào `evaluatePredicate` mọc một nhánh `default` trả `true`, chỗ
này im lặng sai. Ghi ra để người sau biết cái gì đang đỡ cho nó.

### 2.3 Hai vá cùng đường, không phải việc được giao nhưng nằm chắn lối

**`targetState` chưa bao giờ được nối xuống bộ chấm.** `gradeSubmission` gọi
`gradeProblemRun` mà bỏ trống `targetState`. Khe này im lặng cho tới đúng bài đầu
tiên cần nó: `gradeGitProblem` trả `CE` cho MỌI testcase gọi `graphShapeMatches`
khi bài không khai cây đích — **kể cả khi bài ĐÃ khai** và cột `target_state` có
dữ liệu từ migration 0015. Tức một bài soạn đúng đọc ra thành một bài soạn thiếu.

**`gameId` có hai nguồn cho cùng một câu hỏi** (`3340420`):

| Chỗ | Tra gì | Bằng trường nào |
|---|---|---|
| `verifyProblemRun` | adapter phát lại | `problem.gameId` (đọc từ DB) |
| `gradeSubmission` → `gradeProblemRun` | plugin chấm | `log.gameId` (client gửi) |

Chừng nào mọi bài là K8s thì hai nguồn luôn bằng nhau và khe là mã chết. Từ lúc
bài Git nộp được, một nhật ký khai `gameId: 'k8s'` nộp vào bài Git sẽ phát lại
trên engine Git rồi chấm bằng plugin K8s — hai nửa của cùng một lượt chạy trên
hai game. Nay `submitProblem` chốt cả `log.gameId` lẫn `claimed.gameId` về
`problem.gameId`, `BAD_REQUEST` khi lệch.

### 2.4 §18.C.3 — lệch verdict thì ghi log, không chặn

`warnOnVerdictDivergence` trong `submit.ts`. Verdict client là một **suy ra** từ
`objectivesMet`/`objectivesTotal` qua `problemVerdictOf`, không phải một trường
gửi lên — thêm trường `verdict` vào input là gửi cùng một sự thật hai lần, và tệ
hơn, là một lời khai thứ hai phải kiểm.

Nhánh `CE` bỏ qua có chủ ý: client không chạy `verifyRun` nên không có cách nào
tự kết luận `CE`, và so nó sẽ báo động ở **mọi** lượt trượt xác minh — tức biến
dòng log thành tiếng ồn và không ai đọc nữa.

Ô này không dư so với `verifyRun`: `verifyRun` gộp mọi lệch vào một `khong-khop`
chung, không phân biệt "client khai thừa một id" với "client nói AC còn máy chủ
nói WA". Cái sau là cái đáng báo động.

### 2.5 §18.C.4 — trần nhịp và trần độ dài

- **Trần nhịp (6 lượt/phút):** `assertSubmitRateLimit` là dòng ĐẦU TIÊN của
  `submitProblem`, trước mọi nhánh theo game. Đã áp cho Git từ lúc cổng gỡ, không
  cần sửa gì.
- **Trần độ dài `actions[]` (20.000):** nằm trên `runLog.actions` trong schema
  input, cũng không nằm trong nhánh game nào. Áp cho Git ngay khi schema nới.

Không ô gác mới cho phần này: cả hai đã có ô ở `submission-grade.integration.test.ts`
(AC-5) và `problems-submit-input.test.ts`, và cả hai vị trí đều game-neutral **theo
cấu trúc** chứ không theo một phép kiểm phải nhớ chạy lại.

---

## 3. Ô gác — và vì sao nó không nói dối

`apps/web/src/server/problems/git-replay.test.ts`, 10 ô, **10/10 xanh**.

`phase-18.md` §18.C tự cảnh báo ô này dễ nói dối. Hai vế của lời cảnh báo được
thi hành như sau:

1. **env node.** `apps/web/vitest.config.ts` cố ý không đặt `environment`, nên
   node là mặc định; file cần DOM phải tự khai docblock. File này không khai.
2. **Đầu vào là JSON thô.** Mọi fixture là một CHUỖI đi qua `JSON.parse` trước
   khi chạm `packages/games`. Không phải trang trí: một fixture viết bằng object
   literal chở được `undefined`, một `Map`, hay một tham chiếu dùng chung — ba
   thứ không sống sót qua dây, và nếu máy chủ vô tình mượn một object client đã
   dựng thì ô vẫn xanh.

### Đối chứng dương — HAI kiểu sửa tay, hai cổng khác nhau

Client không gửi trường `verdict`, nên "sửa verdict thành AC" có đúng hai đường:

| Sửa gì | Cổng bắt | Kết cục |
|---|---|---|
| `objectivesMet` khai đạt cả hai | `verifyRun` so từng id | `khong-khop` ⇒ `CE`, `passed: []` |
| `objectivesTotal` hạ xuống 1 | **chỉ** `gradeProblemRun` | `da-xac-minh`, nhưng verdict máy chủ vẫn `WA (1/2)` |

Đường thứ hai là đường AC-C mô tả bằng chữ (*"verdict client sửa tay thành AC vẫn
ra WA từ server"*), và là đường đáng sợ hơn: **`verifyRun` không đọc
`objectivesTotal` một lần nào** — nó so `levelId`, `seed`, `commandsUsed`,
`hintsUsed`, `objectivesMet`, `score`, hết. Một người sửa đúng con số đó đi lọt
toàn bộ tầng chống gian lận, và thứ duy nhất còn chặn họ là việc máy chủ tự đếm
testcase của BÀI thay vì tin mẫu số gửi lên.

### Đã phá một lần để xem nó đỏ

`gitProblemReplayEngine.reduce` sửa tạm thành bỏ qua action `command`:

```
× lời khai trung thực ⇒ `da-xac-minh`
× hạ `objectivesTotal` xuống 1 ⇒ client đọc ra AC mà máy chủ chấm `WA (1/2)`
× ĐỐI CHỨNG ÂM: nhật ký giải trọn vẹn + khai trọn vẹn vẫn `da-xac-minh`
   Tests  3 failed | 5 passed (8)
```

Khôi phục ⇒ 8/8 xanh, `git diff --numstat` rỗng.

Hai hằng điểm (350 cho lượt nửa-giải, 1000 cho lượt trọn vẹn) là số **ĐO ĐƯỢC**
từ lượt phát lại đầu tiên, viết thành hằng chứ không gọi lại `scoreProblemRun`
tại chỗ — tính lại bằng chính hàm cổng đang dùng là một ô tự điều chỉnh, xanh kể
cả khi công thức đổi.

---

## 4. Hợp đồng cho nửa CLIENT (`/games/git?problem=`)

Bốn điều phải khớp, nếu không thì **mọi lượt nộp hợp lệ đều bị từ chối** và
triệu chứng đọc ra như một hệ thống từ chối người chơi ngẫu nhiên:

1. `GitLevel.id` client dùng để mở bài **phải là `problem.code`**.
2. `objectives` dựng từ `problem.testcases`, `required: true` cho mọi cái.
3. `allowedCommands: null`, **không phải `[]`** — hai giá trị nghĩa ngược nhau.
4. `seed` là số THẬT client đã nạp vào `createGitSession` (bài không seedable ⇒
   `GIT_UNSEEDED_REPLAY_SEED = 1`), ghi vào cả `log.seed` lẫn `claimed.seed`.
5. `gameId: 'git'` khai MỘT lần ở gốc `runLog`; từ `bc18b81` các action thừa kế
   nó qua `.transform()`, không cần lặp trên từng action. `claimed.gameId` vẫn
   phải khai tường minh.

---

## 5. Chỗ chặn đã gỡ — và nó gỡ bởi ai

`routers/problems.ts` khai cứng `z.literal('k8s')` ở ba chỗ, nên một lượt nộp
Git bị Zod từ chối TRƯỚC khi `submitProblem` chạy một dòng. File không thuộc lane
này ⇒ đã DỪNG và báo lead. Lead nới ở `bc18b81`, và làm khác đề nghị của lane ở
một điểm đáng ghi: `actions[].gameId` **thừa kế** `runLog.gameId` thay vì
`.default('k8s')`. Lý do của lead đúng và lane này đã bỏ sót: giữ default `'k8s'`
ở tầng action là một cái bẫy chỉ lộ khi game thứ hai tới — một client Git gửi
action không kèm `gameId` sẽ nhận `'k8s'`, rồi **chính phép kiểm nhất quán ở
§2.3 từ chối lượt nộp hợp lệ của nó**.

---

## 6. Phép đo cuối

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @devops-platform/web typecheck` | **0** (chạy LẠI sau lần sửa cuối) |
| `pnpm --filter @devops-platform/games typecheck` | **0** |
| `pnpm --filter @devops-platform/games test` | **63 file / 1334 ô xanh** |
| `git-replay.test.ts` (ô của lane này) | **10/10 xanh** |
| 6 file test không-integration của `server/problems/` | **90/90 xanh** |
| `pnpm --filter @devops-platform/web test` (toàn bộ) | **110 đỏ / 2057 xanh / 184 skip** — xem dưới |

### ⛔ Suite web đỏ vì Postgres KHÔNG chạy, và nó KHÔNG skip

Brief của lane viết rằng test integration *"skip nếu không có Postgres"*. **Đo
2026-09-15 trên máy này: chúng ĐỎ, không skip.** Mọi lỗi là
`connect ECONNREFUSED ::1:5432` / `127.0.0.1:5432` từ `postgres@3.4.9`.

Điều đó đổi cách đọc con số: 110 ô đỏ **không** nói gì về mã của lane này, nhưng
nó cũng có nghĩa là **không thể dùng lượt chạy đó để khẳng định lane này không
gây hồi quy ở phần integration**. Thứ khẳng định được là 90/90 ô không-integration
của `server/problems/` và 10/10 ô của lane. Ai muốn con số đầy đủ thì phải dựng
Postgres rồi chạy lại — và đừng đọc một lượt chạy không có Postgres như một lượt
chạy sạch.

Lượt chạy đó cũng ghi hai lỗi typecheck của `git-game.tsx` / `git-sandbox.tsx`
thuộc lane khác đang sửa dở — không phải của lane này.

---

## 7. CÒN HỞ

1. **Chưa có ô gác đi qua HTTP thật cho bài Git.** `submission-grade.integration.test.ts`
   làm đúng việc đó cho K8s và nói rõ vì sao nó phải tồn tại
   (`createCaller` bỏ qua tầng serialize; repo đã trả giá cho khe đó một lần vì
   một `bigint`). Bản Git chưa viết vì không dựng được Postgres trong lượt này,
   và **một ô integration commit vào mà chưa từng thấy nó xanh là một lời khai,
   không phải một phép đo**. Khuôn để chép nằm ngay trong file K8s đó.
2. **`gradeSubmission` chưa được ô nào của lane này đi qua.** Ô gác gọi
   `gradeProblemRun` trực tiếp, nên nhánh `status !== 'da-xac-minh'` → `gradeOf`
   và lớp bọc `UnknownProblemGameError` chỉ có ô cho đường K8s (qua HTTP, cần
   Postgres). Đóng cùng lúc với món (1).
3. **`warnOnVerdictDivergence` chưa có ô gác.** Nó là một `console.warn`, và bắt
   được nó cần `vi.spyOn(console, 'warn')`. Chưa làm — ưu tiên thấp hơn hai món
   trên, nhưng nếu không có ô thì không có gì ngăn ai đó xoá nó trong một lần dọn
   "log thừa" hoàn toàn có thiện chí.
4. **Adapter phát lại Git đặt SAI NHÀ.** Chỗ đúng là
   `packages/games/src/git/replay-engine.ts`, cạnh bản K8s — khối chú thích đầu
   file đó đã vạch sẵn hình dạng: *"giao diện ở `core/`, hiện thực cụ thể ở
   package của từng game"*. Nó ở `apps/web` vì `packages/games` chỉ mở subpath
   `"."` nên file mới phải đi qua `index.ts`, file lead giữ. Món nợ ghi tên trong
   chú thích của chính hàm.
5. **`switch (gameId)` trong `verifyProblemRun` là thứ `core/problem-plugin.ts`
   từ chối.** Chỗ đúng là một ô `GameProblemPlugin.replayEngine?`. Hệ quả hôm
   nay: game thứ ba cắm plugin chấm vào mà quên adapter phát lại sẽ đỏ lúc CHẠY
   (`UnsupportedReplayGameError`), không đỏ lúc biên dịch.

## 8. Cần lead

- Quyết món (4) + (5): mở `packages/games/src/index.ts` cho một
  `git/replay-engine.ts`, và cân nhắc thêm `replayEngine?` vào hợp đồng plugin.
  Cả hai đều là file lead giữ.
- Dựng Postgres (hoặc chỉ định ai dựng) để đóng món (1) + (2).
- **Không thêm migration nào** trong lane này, và lane này cũng không kết luận
  là cần cột mới — `problems.game_id` / `initial_state` / `target_state` của
  migration 0015 đủ chở toàn bộ đường Git.
