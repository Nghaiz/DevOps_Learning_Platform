# P8 — Hợp đồng tích hợp (chốt TRƯỚC khi fan-out)

SSOT của **kiểu dữ liệu**: `packages/shared-types/src/lab.ts` và
`packages/shared-types/src/playground.ts` — đã viết, đã typecheck, đã chạy lại
84/84 test của `packages/scenario`. **Không lane nào được sửa hai file đó.**
Cần đổi ⇒ báo lead.

File này chốt hai thứ chưa tồn tại dưới dạng code: **hình dạng bảng** và
**hình dạng router**.

---

## 1. Hai bảng mới (Drizzle, `apps/web/src/server/db/schema.ts`)

### `lab_attempts`

| Cột | Kiểu | Vì sao TỒN TẠI (không suy ra được từ đâu) |
|---|---|---|
| `id` | text PK | định danh lần thử |
| `user_id` | text, FK `users.id` on delete cascade | chủ sở hữu |
| `lab_id` | text, **không FK** | nội dung nằm trên đĩa (`content/labs/**`), không phải bảng |
| `session_id` | text | sandbox đã dùng — truy nguyên khi chấm sai |
| `started_at` | timestamptz NOT NULL | mốc đầu |
| `submitted_at` | timestamptz NULL | `null` = đang làm. Mốc cuối |
| `display_name_public` | boolean NOT NULL DEFAULT false | lựa chọn của người học, không tính được |
| `created_at`/`updated_at` | timestamptz | khuôn chung của schema hiện có |

Index: `(user_id, lab_id, started_at DESC)`, `(lab_id, submitted_at)`.

⛔ **CẤM** các cột: `score`, `percent`, `status`, `passed`, `duration_seconds`,
`task_count`, `passed_count`. Tất cả suy ra được — tính ở chỗ dùng.

### `lab_task_results`

| Cột | Kiểu | Vì sao TỒN TẠI |
|---|---|---|
| `id` | text PK | |
| `attempt_id` | text, FK `lab_attempts.id` on delete cascade | |
| `task_id` | text | khớp `LabTask.id` — định danh bền, không phải chỉ số |
| `exit_code` | integer NOT NULL | phán quyết thô của `/exec` |
| `output` | text NOT NULL | đã cắt cỡ ở server (`LAB_OUTPUT_MAX_BYTES = 8192`) |
| `checked_at` | timestamptz NOT NULL | thứ tự các lần thử lại |

Index: `(attempt_id, task_id, checked_at DESC)`.

⛔ **CẤM**: `passed` (= `exit_code === 0`), `attempt_no` (= số dòng trước đó + 1).

**Bất biến:** một dòng ở đây LUÔN là phán quyết chấm bài thật. Lỗi hạ tầng
(script hỏng / hết hạn / pod chết) **ném `TRPCError` và không ghi dòng nào**.

Migration: `pnpm --filter web db:generate` (drizzle-kit), commit cả
`apps/web/drizzle/*.sql` lẫn `drizzle/meta/*`.

---

## 2. Hàm tính thuần — `packages/scenario/src/lab-score.ts`

Bốn hàm, **không chạm DB, không chạm mạng**, có test riêng:

```ts
export function latestResultPerTask(results: readonly LabTaskResult[]): Map<string, LabTaskResult>;
export function computeLabScore(lab: Lab, results: readonly LabTaskResult[]): LabScore;
export function computeLabStatus(lab: Lab, score: LabScore, submittedAt: Date | null): LabAttemptStatus;
export function computeAttemptDurationSeconds(startedAt: Date, submittedAt: Date | null): number | null;
```

Quy ước chốt cứng:
- `latestResultPerTask` giữ dòng có `checkedAt` LỚN NHẤT cho mỗi `taskId`.
  Bằng nhau ⇒ giữ dòng ĐỨNG SAU trong mảng (ổn định, có test).
- một task ĐẠT ⇔ `latestResult.exitCode === 0`. Task chưa chấm lần nào ⇒ chưa đạt.
- `percent = Math.floor(earnedWeight * 100 / totalWeight)`. `totalWeight` là
  tổng `weight` của **mọi** task trong lab (kể cả task chưa chấm).
- `computeLabStatus`: `submittedAt === null` ⇒ `'in_progress'`; ngược lại
  `percent >= lab.passThresholdPercent ? 'passed' : 'failed'`.
- `computeAttemptDurationSeconds`: `submittedAt === null` ⇒ `null`; ngược lại
  `Math.max(0, floor((submittedAt - startedAt)/1000))` — kẹp 0 vì lệch đồng hồ
  giữa hai lần ghi có thể ra số âm.

Export thêm từ `packages/scenario/src/index.ts`.

---

## 3. Router `labs` — `apps/web/src/server/trpc/routers/labs.ts`

Mọi procedure là `protectedProcedure`. Mọi input `.strict()`.
⛔ **KHÔNG input nào có `userId`** — luôn `ctx.user.id`. Phân trang dùng
`listInputSchema` (cap 100 đã có sẵn ở `init.ts`).

| Procedure | Kiểu | Input | Trả về |
|---|---|---|---|
| `labs.list` | query | `listInputSchema` | `{ items: LabSummary[], nextCursor }` |
| `labs.get` | query | `{ labId }` | `{ lab: Lab, unsupportedCapabilities: string[] }` |
| `labs.startAttempt` | mutation | `{ labId, idempotencyKey }` | `{ attemptId, sessionId }` |
| `labs.getAttempt` | query | `{ attemptId }` | `{ attempt: LabAttempt, score, status, durationSeconds }` |
| `labs.listAttempts` | query | `listInputSchema.extend({ labId })` | lần thử CỦA MÌNH |
| `labs.checkTask` | mutation | `{ labId, attemptId, taskId }` | `{ exitCode, passed, output }` |
| `labs.submit` | mutation | `{ labId, attemptId }` | như `getAttempt` sau khi chốt |
| `labs.setDisplayPreference` | mutation | `{ attemptId, displayNamePublic }` | `{ ok: true }` |
| `labs.leaderboard` | query | `{ labId, limit, cursor }` | `LabLeaderboardRow[]` |

Ràng buộc hành vi — **không thương lượng**:

1. `labs.submit` **KHÔNG chạy verify script nào.** Nó chỉ set `submitted_at`
   rồi tính lại điểm từ các dòng đã lưu. Chấm N task tuần tự trong một lời gọi
   là thiết kế sai (8 task × 120s = 16 phút, người học tưởng treo). FE gọi
   `checkTask` từng task; server chỉ chốt.
2. `labs.checkTask` dùng lại **nguyên** `runScriptInSession` của
   `apps/web/src/server/lessons/validate.ts`. **Không viết đường `/exec` thứ
   hai.** Không sửa hợp đồng của `validate.ts`.
3. Phân loại lỗi giữ y nguyên: chỉ `exitCode !== 0` mới là "làm sai". Mọi lỗi
   khác NÉM. Cấm biến lỗi hạ tầng thành `passed:false`.
4. `submit` trên attempt đã `submitted_at != null` ⇒ `CONFLICT`. `checkTask`
   trên attempt đã chốt ⇒ `CONFLICT`.
5. Mọi procedure nhận `attemptId` phải nạp attempt rồi **so `userId` với
   `ctx.user.id`**; khác ⇒ `NOT_FOUND` (không phải `FORBIDDEN` — không xác nhận
   sự tồn tại của attempt người khác).
6. `labs.leaderboard`: lab có `leaderboard === false` ⇒ `NOT_FOUND`. Chỉ lấy
   attempt đã `submitted_at != null`. `displayName` = `users.name` khi
   `display_name_public === true`, ngược lại `null`. **Không select cột email
   ở bất kỳ đâu trong truy vấn này.** Sắp xếp: `percent DESC, durationSeconds
   ASC, submittedAt ASC`. `percent`/`durationSeconds` tính ở tầng TS sau khi
   nạp — không có SQL nào tính điểm.
7. Cắt output: `LAB_OUTPUT_MAX_BYTES = 8192`, cắt theo BYTE ở biên UTF-8 an
   toàn, thêm hậu tố `\n…(đã cắt)`.

---

## 4. Router `playgrounds`

| Procedure | Kiểu | Input | Trả về |
|---|---|---|---|
| `playgrounds.list` | query | `listInputSchema` | `{ items: Playground[], nextCursor }` |
| `playgrounds.get` | query | `{ playgroundId }` | `{ playground, unsupportedCapabilities }` |
| `playgrounds.start` | mutation | `{ playgroundId, idempotencyKey }` | `{ sessionId, ttlSeconds }` |

`playgrounds.start` dùng `ttlSeconds` của nội dung làm TTL session (kẹp bởi
`HARD_CAP` phía orchestrator). Không lưu tiến độ, không bảng nào.

---

## 5. Nội dung trên đĩa

- `content/labs/<id>/lab.json` + `task-<taskId>.md` + `task-<taskId>/verify.sh`
  + `setup/{foreground,background}.sh` (tuỳ chọn).
- `content/playgrounds/<id>.json` — một file JSON phẳng, không thư mục.
- Loader: `packages/scenario/src/lab-loader.ts`, `playground-loader.ts`.
- Seam: `ScenarioSource` mở rộng thành `ContentSource` với
  `listLabs()/getLab()/listPlaygrounds()/getPlayground()` — **một seam duy
  nhất**, để bản DB-backed của P9 cắm vào một chỗ chứ không hai.
  `filesystemScenarioSource` giữ tên cũ + thêm các method mới (không tạo
  source thứ hai).
