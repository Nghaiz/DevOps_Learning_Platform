# Lane ĐƯỜNG GHI — §18.D.1 nửa sau, §18.D.2, §18.D.6

**Ngày:** 2026-09-15 · **Nhánh:** `feat/p18-oj-exam` · **Commit:** `fbb087b` (máy chủ), `53dbdf7` (giao diện)

Trước lượt này, kho lưu đã đa-game từ migration 0015 và đường ĐỌC đã đi theo, nhưng đường
GHI thì chưa: một bài Git soạn xong qua giao diện **trượt Zod trước khi tới được cột**. Lượt
này nối hai nửa lại.

---

## 1. Mở `problemBodyShape` sang đa-game (§18.D.1 nửa sau)

`apps/web/src/server/problems/validate.ts`, `crud.ts`.

| Trường | Trước | Sau |
|---|---|---|
| `gameId` | không có | `z.enum(GAME_IDS)` + kiểm có plugin |
| `topics` | `z.enum(PROBLEM_TOPICS)` (9 chủ đề K8s) | `z.string()` + gác theo `PROBLEM_PLUGINS[gameId].topics` |
| `initialState` | `clusterSpecSchema` | `z.unknown()` + K8s vẫn qua `clusterSpecSchema`, game khác chỉ đòi object |
| `targetState` | không có | `z.unknown().optional()` |
| `objectives[]` | `Objective` (`required`) | `Testcase` (`visible`, bắt buộc, không mặc định) |
| `seedable` | không có | `z.boolean()` + chặn `true` khi plugin thiếu `seedSpec` |
| `ProblemBody` | `Omit<Problem, …>` (K8s) | `Omit<StoredProblem, …, 'testcases'> & { objectives }` |

**Tập đóng của `topics` không biến mất, nó đổi chỗ.** `z.string()` một mình không gác gì;
phép gác nằm ở `refineByGame`. Chú thích đầu file nói thẳng điều đó, vì đọc riêng dòng
`z.string()` sẽ kết luận sai rằng chủ đề đã thành trường tự do.

**K8s giữ NGUYÊN độ chặt cũ.** `clusterSpecSchema` vẫn chạy, chỉ đổi chỗ đứng, và issue được
nối tiền tố `initialState` vào `path` để client còn tô đỏ đúng ô. Nới nó ra "một object bất
kỳ" như các game khác sẽ là một phép nới lặng lẽ trên đúng dữ liệu đang có.

**Vì sao `.superRefine` chứ không `z.discriminatedUnion`:** union đòi liệt kê đủ 6 `GameId`
thành 6 nhánh, và `.extend({ code })` của `problemUpdateSchema` không dùng được trên một
union. Thứ tự `.extend().strict().superRefine().transform()` là bắt buộc — refine sau
transform thì `path` của issue trỏ vào `body.topics.0` thay vì `topics.0`.

**`ProblemBody` giữ khoá `objectives`, không đổi thành `testcases`.** Ba tên cho cùng một
thứ, và chỉ một trong ba đổi được: hợp đồng miền dùng `testcases`; cột DB và **file JSON đã
nằm trong máy người khác** dùng `objectives`. Nếu để `Omit` giữ `testcases` thì
`toContractShape` (một `as`) sẽ im, còn lúc chạy `toRowValues` đọc `body.testcases` ra
`undefined` và ghi một cột rỗng — mất dữ liệu trong im lặng, không ô test nào ở đường ghi đỏ.

### Đối chứng dương (máy chủ)

Vô hiệu hoá `refineByGame` bằng một `return;` ở đầu hàm:

```
× từ chối chủ đề ngoài tập đóng
× tập chủ đề đóng theo GAME, không theo một danh sách dùng chung
× nhận một bài Git — biên ghi không còn khoá vào K8s
× K8s giữ NGUYÊN độ chặt cũ sau khi chuyển sang refine
× từ chối game chưa có engine chấm — lưu bài cho nó là lưu bài không ai chấm được
× chặn `seedable: true` khi plugin không sinh được đề theo seed — §18.G.3
× từ chối loại tài nguyên gõ sai
× cụm phải có ít nhất một node
      Tests  8 failed | 13 passed (21)
```

Khôi phục bằng `cp` từ bản sao (không dùng `git checkout`), `git status` xác nhận chỉ còn
đúng 3 file dự định.

---

## 2. §18.D.2 — quản lý testcase

`problem-form.ts`, `objective-fields.tsx`, `problem-editor.tsx`, `problem-validate.ts`,
`problem-json.ts`, `problem-test-fixture.ts`.

- **Thêm / xoá:** đã có từ trước, giữ nguyên.
- **Đổi thứ tự:** nút "Lên"/"Xuống" trên mỗi mục tiêu, hàm thuần `moveObjective` ở
  `problem-form.ts` (ngoài JSX, cùng lý lẽ với `formWithGame`). Trả về CHÍNH mảng cũ khi
  nước đi ra biên — một bản sao đồng nội dung vẫn làm `hasUnsavedChanges` bật lên sau một cú
  bấm không đổi gì. `key` đi theo phần tử, không theo vị trí.
- **Ẩn / hiện:** `ObjectiveFormState.required` → `visible`.

**Chỗ dễ sai nhất, và cách nó được tránh.** `required` và `visible` ngược nghĩa nhau. Không
có phép ánh xạ nào giữa chúng trong mã: giá trị `visible` tới từ `problemTestcases` (biên
đọc), nơi luật là *"chỉ một `false` TƯỜNG MINH mới làm testcase ẩn"*. Nên một mục tiêu
THƯỞNG cũ (`required: false`) nạp lên thành **`visible: true`** — testcase HIỆN, không phải
testcase ẩn. Cái đổi là bài đó **chấm** thế nào (theo #20, mọi case đều chặn), không phải
cái người làm **được xem**.

`testcaseSchema` cố ý **không** `.default(true)` cho `visible`: mặc định ở biên ghi sẽ là
luật thứ hai cạnh luật của biên đọc, và hai mặc định cho cùng một cột là chỗ dữ liệu lệch.
Biên đọc dựng giá trị cho dòng CŨ; biên ghi đòi người gửi nói rõ ý mình.

### Đối chứng dương (giao diện)

Thêm lại một cổng `!objectives.some(o => o.visible)` vào `problem-validate.ts`:

```
× testcase ẨN vẫn xuất bản được — ẩn khác với không bắt buộc
      Tests  1 failed | 13 passed (14)
```

Tức ô đó thật sự gác việc `visible` không bị đối xử như `required`. Khôi phục bằng `cp`,
`git status` xác nhận file biến mất khỏi danh sách sửa đổi.

---

## 3. §18.D.6 — cờ `seedable`

Ô đánh dấu ở `classify-fields.tsx`, `canSeed` suy từ `PROBLEM_PLUGINS[gameId]?.seedSpec`.

**Đo trước khi viết chữ:** `GameProblemPlugin.seedSpec?` là tuỳ chọn và **không plugin nào
khai nó**. Nên hôm nay `canSeed === false` cho MỌI game, ô đánh dấu bị vô hiệu hoá ở khắp
nơi, và câu giải thích nói đúng điều đó:

> "Chưa bật được: engine của game này chưa sinh được đề theo seed, nên bật cờ chỉ là một lời
> hứa không ai thực hiện: mọi sinh viên vẫn nhận cùng một đề. Máy chủ cũng từ chối bài bật
> cờ này."

Vô hiệu hoá **kèm lý do** thay vì ẩn hẳn: ẩn thì người soạn không biết khái niệm này tồn
tại và sẽ đi hỏi.

**Ba lớp, vì giao diện không phải cổng.** (1) Ô đánh dấu `disabled`. (2) `formWithGame` và
`formFromProblem` ép cờ về `false` khi plugin thiếu `seedSpec` — nếu không sẽ có một ô vừa
BẬT vừa KHÔNG TẮT ĐƯỢC, và lượt Lưu bị từ chối bằng một lỗi trỏ vào ô họ không bấm được.
(3) `refineByGame` từ chối `seedable: true` ở biên ghi. Đây là nửa còn lại của cổng §18.G.3
mà `core/problem-plugin.ts` đòi *"phải đo CẢ HAI vế"*.

Ô test đi kèm suy kỳ vọng từ `plugin?.seedSpec !== undefined` chứ không viết cứng `false`:
nó sẽ **đỏ** vào đúng ngày một plugin khai `seedSpec`, và lúc đó phải **invert** (bỏ game ấy
ra, khẳng định nó bật được), không phải nới cho xanh.

---

## 4. Gộp hai cổng lệch nghĩa — XONG

`problem-validate.ts` bỏ `some(o => o.required)`. Nay cả hai bên hỏi cùng một câu:

| | Trước | Sau |
|---|---|---|
| `publish-gate.ts` (máy chủ) | `objectives.length === 0` | không đổi |
| `problem-validate.ts` (client) | `length === 0` **và** `some(o => o.required)` | `length === 0` |

`publish-gate.ts` **không cần sửa** — nó đã đúng từ 18.B. Thay đổi nằm hết ở phía client.

Ô test cũ `chặn khi không có mục tiêu bắt buộc nào` bị **THAY**, không sửa cho xanh, theo
`rules/pinned-baseline-test-companion.md`: chiều của thay đổi là NỚI, và đối chứng dương của
ô mới chính là đầu vào từng làm cổng CŨ đỏ.

---

## 5. Ép kiểu — đã gỡ và còn lại

**Đã gỡ:**

| Chỗ | Lý do nó chết |
|---|---|
| `crud.ts:191` `as unknown as Testcase[]` | hai đầu nay cùng hình dạng `Testcase` |
| `problem-draft.ts` `form.topics as readonly ProblemTopic[]` | `ProblemDraftInput` nay nhận chủ đề dạng mờ, đúng như chú thích cũ dặn |

**Còn lại, kèm lý do:**

| Chỗ | Ép gì | Vì sao còn |
|---|---|---|
| `problem-form.ts` | `problem.initialState as ClusterSpec` | chỉ chạy khi `specEditor === 'cluster'`; hợp đồng khai `unknown` vì kiểu đúng phụ thuộc `gameId` |
| `problem-form.ts` | `initialState as Record<string, unknown>` | đã kiểm `typeof === 'object' && !== null` ngay trước đó |
| `problem-form.ts` | `testcase.check as PredicateName` | có từ trước; form phải MỞ được bài mang vị từ đã gỡ để người soạn sửa |
| `problem-json.ts` | `cluster as unknown as ClusterSpec`, `rawGame as GameId` | cái sau đã gác bằng `GAME_IDS.includes` ngay trên |
| `validate.ts` | `ALL_KINDS as unknown as [...]` | có từ trước, hình dạng `z.enum` đòi tuple |
| `validate.test.ts` | `parsed.initialState as { nodes }` | ô test giả định hình dạng K8s, nói rõ ra |

---

## 6. Thứ KHÔNG làm, kèm lý do đo được

1. **`check` vẫn không được đối chiếu với `plugin.predicateNames` ở biên ghi — và việc mở
   đa-game MỞ RA một lỗ mới.** Trước lượt này chỉ bài K8s ghi được, nên "vị từ K8s trên bài
   Git" không có đường tồn tại; giờ thì có, và nó chỉ lộ ra lúc chấm. Phép kiểm nay **với
   tới được** (file đã nhập `PROBLEM_PLUGINS`), nhưng đóng nó là một cổng MỚI trên đường lưu
   nháp: một bài CŨ mang vị từ đã gỡ sẽ thành bài "mở ra sửa được nhưng bấm Lưu thì 400",
   ngược hẳn hướng mà `problem-validate.ts` đã cố ý chọn (*"chặn ngay ở khâu nạp thì bài
   hỏng thành bài không mở nổi"*). Đó là một quyết định về hành vi, cần người ra lệnh.
   **Chú thích cũ nói *"biên ghi này không với tới `packages/games`"* đã được sửa** — để
   nguyên một câu nay SAI thì lần sau sẽ có người tin nó.
2. **`initialState` của game không phải K8s chỉ bị đòi là một object.** Viết schema Zod thứ
   hai cho `WorldSpec` ở tầng ứng dụng là dựng bản sao của một hợp đồng đang sống trong
   `packages/games`, và bản sao sẽ trôi. Chỗ đúng là một `parseSpec` trong
   `GameProblemPlugin` — hợp đồng plugin chưa có ô cho nó. **Cần lead quyết**, vì
   `packages/games` ngoài lane này.
3. **`allowedResources` không bị gác theo game.** Một bài Git gửi `allowedResources` khác
   `null` vẫn ghi được. Chặn nó cần biết trường này thuộc plugin nào — đó là §18.A.3
   (chuyển nó vào `authorFields`), một migration dữ liệu trên mọi dòng đang có.
4. **Cổng xuất bản không đòi có ít nhất một testcase HIỆN.** Một bài ẩn hết testcase xuất
   bản được, và người học không đọc được điều kiện nào. Có thể đúng (`TestcaseTeaser` cố ý
   giữ mẫu số `n/m` trung thực), có thể là một foot-gun. Không thêm vì không ai ra lệnh.
5. **Chưa có ô test riêng cho `moveObjective` và `specFromText`.** Cả hai là hàm thuần,
   ngoài JSX, đo được không cần DOM — chúng được viết ra ở đúng chỗ đó để test được. Chưa
   viết vì hết lượt; đây là món nợ gần nhất.

---

## 7. Ranh giới sở hữu — ba chỗ chạm ra ngoài danh sách

Danh sách "ĐƯỢC GHI" nêu `validate.ts`, `crud.ts`, `publish-gate.ts` theo TÊN FILE. Ba file
sau không có tên trong đó và vẫn bị sửa:

| File | Vì sao |
|---|---|
| `apps/web/src/server/problems/validate.test.ts` | ô test của chính file tôi sở hữu; đổi hình dạng schema mà không đổi nó là để lại suite đỏ |
| `apps/web/src/app/author/problems/problem-publish-gate.test.ts` | nằm TRONG glob `app/author/problems/**`, đã sở hữu |
| `packages/copy/src/surfaces/problem.ts` | cổng T4 của `packages/copy` đỏ với 3 khoá chết và **cấm tường minh** việc thêm dòng vào `KNOWN_UNCALLED`; xoá khoá là cách sửa duy nhất nó cho phép |

**Không chạm:** `submit.ts`, `dto.ts`, `solver.ts`, `replay.ts`, `schema.ts`,
`packages/games/**`, `plans/**` (trừ chính báo cáo này).

**Một chú thích lạc hậu nằm ngoài tầm:**
`apps/web/src/app/(session)/problems/problem-labels.ts:235` còn trỏ tới
`game-plugin-view.ts § PERSISTABLE_GAMES` — hằng đó đã xoá trong lượt này. File ngoài glob
của lane, **báo lead**.

**Cảnh báo về cây làm việc:** cuối lượt, `git status` hiện `packages/games/src/git/problem-plugin.ts`,
`k8s/problem-plugin.ts`, `problem-plugins.test.ts` đang sửa dở — **không phải của tôi**. Mọi
commit của lane này dùng pathspec tường minh nên chúng không bị cuốn vào.

---

## 8. Phép đo

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @devops-platform/web typecheck` | exit 0 (`tsc --noEmit` + e2e tsconfig) |
| `pnpm --filter @devops-platform/web lint` | exit 0 |
| `npx vitest run src/app/author/problems src/server/problems` | **Tests 144 passed (144)**, 12 file |
| `pnpm --filter @devops-platform/copy test` | **Tests 72 passed (72)**, 5 file |

Bốn cổng của `packages/copy` từng đỏ giữa chừng và đã xanh: T1a/T1b (em-dash trong nguồn
`packages/copy`), T3 (nhóm ba `author.problem.seedable` nay khai lý do trong
`authorIntentionalThree`), T4 (3 khoá chết **xoá**, không đổ vào `KNOWN_UNCALLED`).
