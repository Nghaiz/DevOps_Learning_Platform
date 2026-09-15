# Lane 18.C — nửa CLIENT của đường nộp bài

Ngày 2026-09-14 · nhánh `feat/p18-oj-exam` · commit mã `df8e4c3`

## Việc đã đóng

Trước lane này `problems.submit` **không có một chỗ gọi nào** trong `apps/web`.
Đấu trường chưa từng nộp bài về máy chủ, nên toàn bộ đường chấm lại phía máy chủ
là mã không ai đi qua, và `problem-verdict.tsx` có test nhưng chưa có màn hình.
Giờ đã có.

## Chỗ gọi đã nối ở đâu

`apps/web/src/components/k8s-arena/use-problem-submit.ts` — hook
`useProblemSubmit(level, engine, mode, startedAt)`.

Được gọi **vô điều kiện** từ `arena-overlays.tsx`, cạnh `useRecordWin` đã có sẵn.
Hook tự trả `idle` khi `mode.problemCode` là `null`, nên không có nhánh `if` nào
đứng trước một lời gọi hook — chế độ đổi được khi người chơi rời bài tập về màn
thường.

Chuỗi sự việc một lượt chơi thật:

1. `engine.status.phase` chuyển sang `won` **và** `mode.mode === 'problem'`
   ⇒ effect bắn đúng **một** lần (`submittedRef`, cùng bẫy mà `useRecordWin` đã
   ghi lại: `phase` giữ nguyên `won` và `engine.status` đổi danh tính theo từng
   nhịp engine, nên không chặn thì mỗi nhịp là một lượt nộp mới — chỉ khác là ở
   đây nó đập vào máy chủ).
2. `engine.getLog()` — mở mới ở `arena-session.ts`, trả thẳng
   `K8sSession.getLog()`. **Không** dựng lại nhật ký ở tầng React: bản dựng lại
   sẽ thiếu đúng những hành động không đi qua React (nhịp tự sinh sự cố, lệnh gõ
   trong terminal), và máy chủ phát lại bản thiếu đó ra `CE khong-khop` — một lỗi
   của chúng ta đọc ra như một lượt chơi gian lận.
3. `problems.submit` với `{ code, runLog, claimed }` đúng hợp đồng dây hiện có.
4. `utils.problems.byCode.fetch({ code })` — **bắt buộc**, không phải cho mới:
   `toTestcaseTeasers` chỉ mở nhãn testcase ẩn khi `afterSubmit === true`. Không
   đọc lại thì danh sách "cái này sai" hiện toàn dòng *"Testcase ẩn chưa hiện
   tên"* đúng vào lúc người làm cần tên nhất.
5. `toVerdictView(result.grade, fresh.problem.testcases)` → `<ProblemVerdict>`.

`claimed` dựng bằng `run-result.ts` — **cùng một hàm** với bản lưu tiến độ cục bộ.
Trước lane này `useRecordWin` dựng object đó tại chỗ; giờ cả hai gọi
`buildRunResult`. Hai bản dựng song song lệch trong im lặng, và phần lệch không
đỏ ở đâu cả: bản lưu vẫn ghi được, lượt nộp vẫn gửi được, chỉ có `verifyRun` trả
`khong-khop`.

## Nộp hỏng không nuốt im lặng

`ProblemSubmitPanel` (`hud/problem-submit-panel.tsx`) có bốn pha: `idle` (nút
"Nộp bài"), `pending`, `error`, `done`. Pha `error` hiện **câu nguyên văn của máy
chủ** qua `describeTrpcError`, kèm câu
*"Lượt chơi vẫn còn nguyên, bấm thử lại là nộp lại đúng lượt này."* — một sự
thật kiểm chứng được, không phải câu an ủi: nhật ký vẫn nằm trong engine nên
`state.submit` nộp lại đúng lượt đó. Không có câu này thì một lượt nộp hỏng đọc
ra như mất lượt, và người chơi thoát ra chơi lại từ đầu mà không cần phải thế.

Nhánh `getLog()` trả `null` (phiên chưa dựng xong) cũng **nói ra** thay vì gửi
một nhật ký rỗng: nhật ký rỗng sẽ được chấm `WA (0/n)` và ghi vào lịch sử nộp —
mất một lượt vì một lỗi thời điểm của chúng ta.

⛔ Không chỗ nào suy verdict từ `solved` hay từ `engine.status.phase`. Thắng màn
= đủ mục tiêu **bắt buộc**; verdict đếm theo **mọi** testcase. Hai số lệch ở bài
có mục tiêu thưởng.

## Đối chứng dương

Ô nghiệm thu: `use-problem-submit.dom.test.tsx`, ô
*"gọi problems.submit đúng một lần với nhật ký của chính lượt vừa thắng"*.
Nó đo **lời gọi**, không đo việc render.

| Bước | Kết quả |
|---|---|
| Chạy như đã viết | `Test Files 1 passed · Tests 2 passed` |
| Gỡ `submit();` khỏi effect trong `use-problem-submit.ts` | `× gọi problems.submit đúng một lần…` — `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times` tại dòng `toHaveBeenCalledTimes(1)` |
| Khôi phục từ bản sao | `diff` trống (`RESTORED-IDENTICAL`), ô xanh lại |

Ô đỏ **đúng tên ô của mình**, không phải đỏ vì một lỗi biên dịch ở chỗ khác.

Ô còn so `sent.runLog` **nguyên vẹn** với nhật ký engine trả ra, không so từng
trường: `seed` đúng mà `actions` của một lượt khác là một lượt phát lại ra trạng
thái khác.

## Phép kiểm đã chạy

| Phép kiểm | Kết quả |
|---|---|
| `tsc --noEmit` (web) | sạch |
| `vitest` ô 18.C | 2/2 xanh |
| `vitest` gói `copy` | 71/71 xanh |
| `next build` | thành công, 0 lỗi |

`next build` là phép kiểm quan trọng nhất ở đây vì nó là thứ duy nhất chứng minh
được nhánh import client → `src/server/problems/verdict-view` không vỡ khi đóng
gói (xem dưới). Typecheck và vitest đều mù với chuyện đó.

## Chỗ hợp đồng dây thiếu thứ client cần

**1. `submit` trả về `grade` toàn ID, không có nhãn nào.**

`submitProblem` trả `{ submission, verifyStatus, verifyDetail, grade }`, và
`grade.passed` là `string[]` id + `grade.total`. Nhưng `toVerdictView` cần
`TestcaseTeaser[]` để nói *testcase NÀO* đỏ — tức là §18.B.3. Bộ teaser đó chỉ
tới từ `problems.byCode`.

Hệ quả: mỗi lượt nộp tốn **hai** round-trip, và round-trip thứ hai là một lượt
đọc lại cả đề bài (`problem`, `stats`, `viewerStatus`, hints) chỉ để lấy mảng
`testcases`. Client cũng phải tự biết luật "nhãn ẩn mở khoá sau lượt nộp" để
biết rằng phải `fetch` lại chứ không được đọc cache.

**Đề nghị:** `submit` trả kèm `testcases` (bộ teaser đã mở khoá bởi chính lượt
nộp này) hoặc trả thẳng `VerdictView`. Máy chủ đã cầm cả hai mảnh tại chỗ. Lane
này **không** sửa vì đó là đổi hợp đồng dây.

**2. `toVerdictView` sống ở `src/server/`, mà nơi cần nó là client.**

`use-problem-submit.ts` import `toVerdictView` từ
`../../server/problems/verdict-view`. Đây là chỗ **đầu tiên** trong repo mà một
file `'use client'` import một **giá trị** (không phải kiểu) từ `src/server/`.

Nó chạy được, và đã kiểm: `verdict-view.ts` chỉ import `@devops-platform/games`,
không chạm `node:*`, không có `server-only`; và đấu trường đã kéo chính barrel
đó vào bundle client sẵn (`arena-session.ts` gọi `createSession`). `next build`
xanh.

Nhưng nó **mong manh**: lane máy chủ thêm một dòng `import 'server-only'` vào
file đó là `next build` đỏ. Chép `toVerdictView` sang tầng client **không** phải
đường sửa — §18.C.3 nói phép so verdict client-với-server chỉ có nghĩa khi hai
bên dùng chung một hàm, và một bản thứ hai làm phép so đó nói về hai hàm thay vì
nói về engine. Đường sửa đúng là **đẩy `toVerdictView` xuống `packages/games`**,
chỗ `problemVerdictOf` đã ở.

**3. `RunLog.gameId` và `RunResult.gameId` rộng hơn thứ `submit` nhận.**

Cả hai khai `GameId` (mọi game của repo) trong khi input chốt
`z.literal('k8s')`. `tsc` từ chối phép gán, và nó đúng — một `RunResult` bất kỳ
có thể là của game Git. Lane vá ở phía mình, **không** bằng một phép ép kiểu:

- `buildRunResult` trả `RunResult & { readonly gameId: 'k8s' }`.
- `runLog` liệt kê từng trường thay vì rải toàn bộ `log`.

Cả hai đọc ra được. Nhưng nếu sau này có endpoint nộp bài cho game thứ hai thì
đây là chỗ phải nghĩ lại, không phải chỗ để thêm một phép hẹp kiểu thứ ba.

## Một dòng pin đã ôi, đã gỡ

`packages/copy/src/dead-key.test.ts` pin `common.action.retry` vào
`KNOWN_UNCALLED` với lý do *"chưa màn nào gọi tới"*. Bảng nộp bài gọi nó thật,
nên ô companion đỏ với đúng thông điệp đã soạn sẵn: *"Mỗi khoá trên đã có nơi
gọi thật. XOÁ dòng của nó khỏi KNOWN_UNCALLED. Một pin chỉ được đi theo chiều
biến mất."* Đã gỡ dòng đó, không pin lại theo con số vừa đo.

## Nợ lane này cố ý để lại

**Chưa có lối mời nộp bài khi chưa thắng.** Hai đường vào `submit` hiện có: tự
động khi `phase === 'won'`, và nút trong bảng (pha `idle` / `error`). Người chơi
không đạt nổi mục tiêu bắt buộc vẫn bấm được nút đó — đường **không bị chặn** —
nhưng bảng nằm ở góc phải dưới và chưa có mục nào trong HUD chính (dock, thanh
trên) mời gọi việc đó. Nếu lead muốn khuôn OJ đầy đủ (nộp bất cứ lúc nào để xem
WA), đó là một mục UI riêng.

**Bảng đặt `bottom-4 right-4`.** Chưa đo chồng lấn với `InspectorPanel` (cũng
bên phải) trên màn hẹp. Cổng a11y chạy `next start` và AC-8 đo màn làm bài —
chưa chạy trong lane này vì cần cụm.
