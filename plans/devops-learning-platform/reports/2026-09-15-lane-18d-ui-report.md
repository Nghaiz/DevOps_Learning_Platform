# Lane 18.D — tầng giao diện theo hợp đồng `Problem` đa-game

**Ngày** 2026-09-15 · **Nhánh** `feat/p18-oj-exam` · **Phạm vi ghi** chỉ `apps/web/src/app/`

Ba commit: `8087736`, `a5e1ef8`, `4f35b68`.

## Phép đo

```
$ pnpm --filter @devops-platform/web typecheck 2>&1 | grep "src/app/"
(rỗng)
```

Ô này rỗng là đạt. Lỗi ngoài `src/app/` vẫn còn và thuộc lane khác — không đụng.

```
$ pnpm --filter @devops-platform/web lint     → EXIT=0
$ vitest run (toàn app)                        → 184 file, 2196 ô, 0 đỏ
$ vitest run submission-verdict.test.ts        → 11/11, đã đọc TÊN từng ô
```

⚠ Con số test đọc từ dòng `Tests N passed`, không đọc từ mã thoát: `vitest` thoát `0`
kể cả khi mọi ô bị skip. Ô của `submission-verdict` chạy riêng một lượt có
`--reporter=verbose` để thấy tên từng ô, vì bốn ô trong đó là ô MỚI và một ô mới
không chạy thì cũng không đỏ.

## Sửa gì, ở đâu

| File | Việc |
|---|---|
| `(session)/problems/problem-labels.ts` | `topicLabel` mới; `joinTopics` nhận `ProblemTopicId` |
| `(session)/problems/[code]/problem-overview.tsx` | kiểu prop suy từ router; nhãn chủ đề qua `topicLabel` |
| `(session)/problems/problems-table.tsx` | kiểu hàng suy từ router |
| `author/problems/problem-form.ts` | `formFromProblem` đọc `testcases`; tham số hẹp `LoadedProblemFields` |
| `author/problems/problem-json.ts` | dựng `LoadedProblemFields`; `toImportedTestcase` |
| `author/problems/problem-labels.ts` | `joinTopicLabels` |
| `author/problems/problem-list-client.tsx` | kiểu hàng suy từ router; nhãn chủ đề an toàn |
| `(session)/problems/[code]/submission-verdict.ts` + `.test.ts` | đọc `CE` thật qua `failedCode` |

## Quyết định 1 — nhãn chủ đề: tra có phòng hờ, KHÔNG tra qua plugin

Đây là chỗ tốn công điều tra nhất, và câu trả lời "đúng hơn" lại là câu sai.

`topics` nay là `ProblemTopicId` (= `string`); tập đóng chuyển xuống từng plugin. Nên
`PROBLEM_TOPIC_LABELS` vẫn đúng mà **không còn đủ**.

**Không ép `as ProblemTopic`** — như brief dặn, và lý do cơ học đáng ghi lại: phép ép
không ngăn được `undefined` lúc chạy, nó chỉ làm trình biên dịch thôi nói. Một bài Git
mang chủ đề `branching` sẽ tra ra `undefined`; React vẽ `undefined` thành **chỗ trống**
(trang chi tiết → `Badge` rỗng) hoặc thành **chuỗi `"undefined"`** khi đi qua
`join(', ')` (ô bảng, hàng danh sách của tác giả). Không lỗi, không log, không ô test
nào đỏ.

**Đã cân nhắc tra qua plugin và LOẠI**, dù đó là phép tra chính xác và dù
`author/problems/game-plugin-view.ts` đã có tiền lệ:

- `problemPluginMeta` đọc `PROBLEM_PLUGINS`;
- bảng đó `import` `K8S_PROBLEM_PLUGIN` + `GIT_PROBLEM_PLUGIN`;
- hai plugin đó `import` `createSession` / `createGitSession` — **cả hai engine**.

PR #124 (2026-09-14) đã đo đúng hình dạng đó: một chunk 369.938 B chứa engine git nằm
ở 7/38 route, **5 trong 7 là route `problems`** — chính hai trang dùng hàm này — và nó
đẩy `/games/k8s/page` vượt trần `bundle:check`. Tra qua plugin ở đây là mời nguyên khối
đó quay lại, lần này có chủ ý.

⚠ Và **không cổng nào trong phép đo của lane này thấy được**: `tsc`, `eslint`, `vitest`
đều mù với bundle; chỉ `bundle:check` thấy, mà nó chạy sau `next build`. Một lựa chọn
"đúng hơn" ở đây sẽ xanh hết mọi ô tôi chạy rồi làm đỏ một cổng tôi không chạy tới.

Đường thoát thứ ba — nhập thẳng `GIT_PROBLEM_TOPICS` (mảng thuần, không chạm engine) —
cũng đóng: barrel **không** mở tên đó, và `packages/games` chỉ khai đúng một subpath
(`.`) nên không deep-import được. Mở nó là việc trong `packages/games`.

→ **Chốt:** tra được thì lấy nhãn, không thì hiện chính id. `branching` đọc được; ô
trống thì không. Hôm nay nhánh phòng hờ **chưa chạm được** — `PERSISTABLE_GAMES` nói
mọi bài trong DB đều là K8s.

**Nợ:** ngày §18.D cho lưu bài đa-game, nhãn phải tới từ nguồn theo `gameId` mà không
kéo engine — hoặc `packages/games` tách module chỉ-chủ-đề rồi mở ra barrel, hoặc máy
chủ gửi kèm nhãn. Cả hai ngoài `apps/web/src/app/`.

### Sinh đôi có chủ ý

`joinTopicLabels` (author) và `topicLabel` (session) là **hai bản của cùng một luật**,
cố ý chưa gộp. Chỗ gộp đúng là một module dùng chung dưới `src/components/` — ngoài
đường sở hữu của lane này. Nhập chéo nhóm route thì gần như không có tiền lệ trong repo
(grep ra đúng 1 chỗ, trong một file test) và sẽ kéo bảng nhãn của trang danh mục — dựng
bằng `renderCopy` ở **tầng module** — vào bundle trang soạn bài. Cả hai bản ghi rõ lý do
tại chỗ. **Xin lead quyết chỗ gộp.**

## Quyết định 2 — kiểu prop suy từ router, không mượn kiểu của `server/`

`initialState: unknown` bao gồm `undefined`, nên kiểu đầu ra tRPC khai
`initialState?: unknown` — **tuỳ chọn**. Với `exactOptionalPropertyTypes: true` thì một
kiểu viết ở tầng máy chủ đòi nó **bắt buộc** không nhận nổi thứ chính máy chủ gửi. Lời
khai của dây mới là lời khai đúng: `JSON.stringify` bỏ hẳn khoá mang `undefined`.

`inferRouterOutputs<AppRouter>[...]` là **khuôn đang dùng ở chín trang client khác**
(`labs`, `lessons`, `paths`, `quiz`, `playgrounds`, `admin/*`); hai trang `problems` là
ngoại lệ duy nhất còn với tay vào `server/` mượn kiểu. Đưa chúng về khuôn chung thì
component không thể đòi một hình dạng mà máy chủ không gửi — và đúng điểm lead nhắc về
`TestcaseTeaser` (chỉ `id` / `label: string | null` / `visible`, **không** `check`/`args`)
tự đúng theo, vì kiểu tới thẳng từ `toSolverProblem` chứ không do tôi khai lại.

## Quyết định 3 — `required` đặt HẰNG `true`, không ánh xạ từ `visible`

Hai trường ngược nghĩa nhau (`testcases.ts` có bảng so sánh). `Testcase` bỏ hẳn
`required` theo quyết định #20 — *"một testcase thì luôn chặn — đó là nghĩa của `AC`"* —
nên `true` **suy từ định nghĩa**, không suy từ trường khác.

⚠ **Hệ quả phải nói ra:** một bài CŨ mang `required: false` nạp lên form thành `true`, và
lượt Lưu kế tiếp **ghi `true` xuống DB**. Không tránh được ở đây (`problemTestcases` đã bỏ
`required` ở biên đọc nên hàm nạp không còn thấy giá trị cũ), và nó khớp hướng lead vừa
chọn ở `publish-gate.ts`. Đã ghi tại chỗ trong mã.

## Quyết định 4 — `formFromProblem` VẪN chốt cứng `gameId: DEFAULT_AUTHOR_GAME`

Dòng cũ hẹn *"ngày hợp đồng có `gameId` thì dòng này đọc từ bài"*. Hợp đồng nay **có**
`gameId` — nhưng nửa GHI thì chưa: `validate.ts` § `problemBodyShape` còn
`initialState: clusterSpecSchema`, `topics: z.enum(PROBLEM_TOPICS)`, `required: z.boolean()`.

Đọc `gameId` ngay bây giờ cho một biểu mẫu **mở được bài Git rồi lưu đè nó bằng một
`ClusterSpec`** (`toProblemDraft` luôn phát `initialState: cluster.value`). Hai nửa phải
đi cùng một lượt — §18.D, không phải lane này. Vì vậy `problem-draft.ts` **không đụng
tới**: payload ghi giữ nguyên `objectives[].required`.

## Quyết định 5 — vá khe `CE` của lịch sử nộp bài (theo nhắc của lead)

`submission-verdict.ts` **tự ghi** rằng nó không vá nổi ca này: một `CE` thật mang
`passed = []`, `total = 5` nên đọc lại thành `WA (0/5)` — hệ thống nói người chơi trượt
5 case trong khi lượt chơi chưa chạy tới nơi. Chẩn đoán cũ đúng và đã nêu đúng cái cần:
*"cần một cột thứ ba"*. Cột đó nay có (`failedCode`, migration 0015).

Nay đi qua `gradeFromSubmission({ passed, total, failedCode })` — chỗ suy duy nhất, dùng
chung với máy chủ.

⚠ `subs-verdict-ungraded` **không bị `CE` nuốt**: `gradeFromSubmission` trả `CE` cho *cả
hai* ca (hỏng thật, và `total <= 0` = dòng cũ / bài chưa có testcase). Chỉ ca đầu in chữ
`CE`. Gộp lại là quay về đúng lỗi khối chú thích kia sinh ra để tránh.

Ô nghiệm thu **đảo chiều** thay vì chốt lại con số cũ. Ba trong bốn ô mới tồn tại để ô
đầu không xanh khống: một hàm luôn trả `CE` cũng qua được ô *"ra CE"*, nên có đối chứng
cùng `passed`/`total` mà khác mỗi `failedCode`, cộng ca `failedCode` thắng cả bộ số trông
như `AC`.

## Mọi phép ép kiểu còn lại (đã kiểm, không còn cái nào ngoài danh sách)

| Chỗ | Ép gì | Vì sao giữ |
|---|---|---|
| `problem-form.ts` | `problem.initialState as ClusterSpec` | Bảo chứng không mất, **đổi chỗ**: trước ở kiểu `Problem`, nay ở cổng ghi (`clusterSpecSchema`) + mọi dòng DB đều K8s. Hành vi giữ nguyên từng bit. |
| `problem-form.ts` | `testcase.check as PredicateName` | **Đã có từ trước**, giữ nguyên lý lẽ cũ: form phải MỞ được bài có vị từ đã gỡ khỏi bảng; chặn nằm ở `problem-validate.ts`. |
| `problem-json.ts` | `cluster as unknown as ClusterSpec` | **Đã có từ trước**, chỉ nâng thành một biến có tên để dùng ở hai chỗ thay vì ép hai lần. |
| `problem-labels.ts` (author) | `PROBLEM_TOPIC_LABELS` gán sang `Record<string, string>` | Không phải ép mà là **nới rộng khi gán** — kiểu mapped chỉ được cấp index signature ngầm lúc gán, không phải lúc bị index (nếu không: TS7053). Có chú thích cấm nội tuyến lại. |

⛔ **Không** thêm một `as ProblemTopic` nào.

Ở `problem-form.ts` cố ý **không** bọc `?? emptyCluster(nextKey)` quanh phép ép
`ClusterSpec`: nó trông an toàn hơn và nguy hiểm hơn — một spec lạ sẽ hiện thành biểu mẫu
TRỐNG, người soạn bấm Lưu, và bản gốc bị ghi đè bằng cụm rỗng. Để nó ném thì lỗi dừng ở
màn hình và bài trong DB còn nguyên (`development-principles.md` § "Errors Over Silent
Fallbacks").

## Thứ phát sinh giữa chừng, cần lead biết

**`problem-list-client.tsx` KHÔNG nằm trong danh sách bàn giao.** Nó mọc ra giữa phiên khi
lane máy chủ đổi `list.ts` + `routers/problems.ts` trong cùng cây làm việc. Bài học về cách
đo: **phép đo cơ sở của một lane chỉ đúng tại thời điểm đo**; trên cây dùng chung thì "hết
lỗi" phải đo lại ở phút cuối, không trích lại con số đầu phiên.

## Chưa làm, kèm lý do

1. **Gộp `topicLabel` / `joinTopicLabels`** — cần `src/components/`, ngoài lane. Xin lead quyết.
2. **`problem-validate.ts:121`** (`!form.objectives.some(o => o.required)`) — cổng xuất bản
   phía client vẫn hỏi `required`, trong khi lead đã nới cổng máy chủ thành
   `objectives.length === 0`. **Không đụng**: client đang chặt hơn máy chủ (an toàn, không
   hỏng dữ liệu), và `required` vẫn sống trọn đường ghi. Gỡ nó thuộc §18.D.2 cùng lượt thêm
   ô `visible`. Nêu ra để lead biết hai cổng đang lệch nghĩa.
3. **Ô `required` trên màn hình soạn bài** (`objective-fields.tsx`) đang mất dần ý nghĩa —
   gỡ phải đi cùng lượt đổi `problemBodyShape`. §18.D.2.
4. **Bộ lọc chủ đề** (`problems-toolbar.tsx`, `problem-query.ts`) vẫn dựng từ
   `PROBLEM_TOPICS` của K8s. Còn typecheck xanh và còn đúng khi mọi bài là K8s; tổng quát
   hoá nó cần tập chủ đề theo `gameId` — cùng nút thắt bundle ở Quyết định 1.
5. **Chưa chạy `next build` / `bundle:check`.** Lane này không đổi cây import của route nào
   (chỉ thêm `import type`, bị xoá lúc biên dịch), nên không kỳ vọng đổi bundle — nhưng đó
   là **suy luận, không phải phép đo**. Ai chạy `next build` gần nhất nên đọc lại trần.
