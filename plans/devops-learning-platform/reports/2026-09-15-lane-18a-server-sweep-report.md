# Lane 18.A — dọn tầng máy chủ theo hợp đồng `StoredProblem`

Ngày 2026-09-15 · nhánh `feat/p18-oj-exam` · commit mã `d450677`

Lane MÁY CHỦ + TEST. Việc: kéo sáu chỗ còn neo vào `Problem` của K8s sang
`StoredProblem` mà `toProblemDTO` nay trả.

## Phép đo

```
$ pnpm --filter @devops-platform/web typecheck 2>&1 \
    | grep -E "crud\.ts|/list\.ts|routers/problems\.ts|list\.integration|testcases\.test|validate\.test|problems/validate\.ts"
(rỗng)
```

Toàn cây `apps/web` còn đúng MỘT file đỏ, và nó của lane khác:
`src/app/author/problems/problem-labels.ts`. Lúc bàn giao có 5 file `src/app/**`
đỏ, nên lane giao diện đã dọn gần hết trong cùng khoảng.

```
$ npx vitest run validate.test.ts testcases.test.ts list.integration.test.ts
 Test Files  3 passed (3)
      Tests  48 passed (48)     ← 48/48, KHÔNG có ô nào skip
```

`(48)` là tổng, nên không có ô skip nào núp sau mã thoát 0. Đã chạy lại riêng
`list.integration.test.ts` với `--reporter=verbose` để chắc nó thật sự chạm
Postgres chứ không đỗ rỗng: mỗi ô có thời gian truy vấn thật (111ms / 144ms /
86ms trên các ô keyset). `dlp-postgres` đang chạy.

## Từng lỗi đã xử ra sao

| Chỗ | Nguyên nhân | Cách xử |
|---|---|---|
| `crud.ts` 43 / 82 | Cột `objectives` nay khai `$type<Testcase[]>`, `toRowValues` cho hình dạng `Objective` cũ. Lỗi ở 43 hiện ra dưới dạng `'code' does not exist` chỉ vì TS rơi sang overload mảng — cùng một nguyên nhân với 82 | Ép kiểu tại biên, giữ NGUYÊN thứ ghi xuống. Xem § "Ép kiểu còn lại" |
| `list.ts` 97 / 191 | `ProblemRowsPage.problem` khai `Problem`; `toProblemDTO` trả `StoredProblem` | Đổi sang `StoredProblem`. Kéo theo: `listProblems` không còn trả `ProblemPage` được |
| `routers/problems.ts` 187 | `submitProblem` còn nhận `Problem` | Lead đã chuyển `submit.ts` sang `StoredProblem` giữa chừng ⇒ chỗ gọi tự khớp, KHÔNG có ép kiểu nào ở lại |
| `list.integration.test.ts` 77 | Fixture `as typeof problems.$inferInsert` không còn "đủ chồng lấn" | `as unknown as` một nhịp + lý do tại chỗ |
| `testcases.test.ts` 148/159/169/179 | `problemFixture(): Problem` | Dựng lại thành `StoredProblem` |
| `validate.test.ts` 109/118/119 | Fixture gắn `required`, `PublishCandidate` không khai | Một ô XOÁ, một ô sửa fixture — xem § "Ô test" |

⚠ Một lượt đi sai đã tự sửa, ghi ra vì nó nói điều gì đó về nhịp làm việc chung:
tôi đã viết một cầu nối ép kiểu ở `routers/problems.ts` để dập lỗi 187 khi
`submit.ts` còn đọc `problem.objectives`. Lead chuyển `submit.ts` sang
`StoredProblem` trong cùng khoảng ⇒ cầu nối vừa thừa vừa sai chiều, và đã gỡ
sạch (cả `import type { Problem }` đi kèm). Bài học: chỗ gọi nằm ở lane này
nhưng NGHĨA của nó do chữ ký bên kia quyết — vá ở đầu này là đoán trước một
quyết định chưa ai ra.

## Ép kiểu trung gian CÒN LẠI (đủ hai chỗ, không hơn)

**1. `apps/web/src/server/problems/crud.ts:191`**

```ts
objectives: [...body.objectives] as unknown as Testcase[],
```

Cột khai `Testcase[]`, còn `problemBodyShape` vẫn chỉ nhận `Objective` (CÓ
`required`, KHÔNG có `visible`). Mở body sang hình dạng mới là §18.D.1 nửa sau.
An toàn vì biên ĐỌC không tin cột này — `problemTestcases` nhận
`readonly unknown[]` và mặc định `visible: true`, đúng đường mọi dòng trước 18.B
đang đi. Dòng mới chỉ là một dòng cũ nữa, không phải hình dạng thứ ba.

⛔ **Đã cân nhắc và BÁC BỎ phương án "dọn cho sạch"** (ánh xạ sang `Testcase`,
bỏ `required`, thêm `visible: true`). Không phải vì thận trọng mà vì đo được:
`replay.ts` § `isSolved` lọc `objectives.filter((o) => o.required)` và trả
`false` khi tập đó rỗng. Bỏ `required` lúc ghi ⇒ mọi lượt nộp vào một bài được
sửa sau bản này đọc ra "chưa giải", im lặng, không ô test nào ở lane này đỏ.
Chú thích tại chỗ ghi đúng cái bẫy đó để lần "đơn giản hoá" sau không dẫm lại.

**2. `apps/web/src/server/problems/list.integration.test.ts:95`**

```ts
} as unknown as typeof problems.$inferInsert;
```

`unknown` ở giữa là bắt buộc, không phải thói quen: `OBJECTIVES` cố ý giữ hình
dạng TRƯỚC 18.B và hai hình dạng không so sánh được nên `as` một nhịp bị từ
chối. Giữ dữ liệu cũ là có chủ ý — mọi dòng trong bảng thật trông như thế, và
đây là chỗ DUY NHẤT chạy mặc định `visible: true` qua cả một trang truy vấn chứ
không chỉ ở mức một hàm.

Ngoài hai chỗ trên: `testcases.test.ts` nay **không còn phép ép nào** (bản cũ có
ba: `as never` × 2 + `as Problem`). Hợp đồng khai `initialState: unknown` nên
fixture mô tả đúng giá trị thật thay vì được nhét vào kiểu.

## Ô test bị đổi / xoá

**XOÁ — `validate.test.ts` § `chặn bài không có mục tiêu bắt buộc nào`.**
Nó dựng `objectives: [{ id: 'o1', required: false }]` và đòi cổng xuất bản ĐỎ.
Bất biến ấy chết theo quyết định #20: `core/problem.ts` § `Testcase` bỏ hẳn
`required` (*"một testcase thì luôn chặn — đó là nghĩa của AC"*), nên "mục tiêu
bắt buộc" không còn là khái niệm để đếm. Cổng nay hỏi câu khác — *có case nào
không*.

Chiều của thay đổi là **NỚI**, và nhánh mới của cổng (`objectives.length === 0`)
lúc bàn giao **chưa ô nào gác**. Nên không phải xoá trắng: thay bằng
`chặn bài KHÔNG CÓ testcase nào`, và chính đầu vào từng làm ô cũ đỏ (một case
duy nhất, không nhãn "bắt buộc") nay là **đối chứng dương** — thiếu vế đó thì
một cổng từ chối MỌI bài cũng làm ô mới xanh.

**SỬA FIXTURE — `validate.test.ts` § `chặn id trùng`.** Bất biến còn sống (bên
chấm khử trùng theo `id` nên hai case cùng id vẫn làm điểm sai). Chỉ bỏ
`required` khỏi hai literal.

**GHI CẢNH BÁO, KHÔNG XOÁ — `testcases.test.ts`, vế
`expect(wire).not.toContain('"objectives"')` (hai chỗ).**
⚠ Vế này **đã mất phần lớn sức gác** và mã nguồn nay nói thẳng điều đó. Khi nó
được viết, `toSolverProblem` nhận `Problem` (CÓ cột thô `objectives`) và phải
huỷ cấu trúc nó ra khỏi `...rest`; quên một chữ là cả cột ra dây. Sau 18.A hàm
đó nhận `StoredProblem` — kiểu không khai `objectives`, và chỗ dựng duy nhất
(`toProblemDTO`) liệt kê từng field, nên **không nguồn nào lúc chạy còn phát ra
cột đó**. Vế này không còn ĐỎ ĐƯỢC vì lý do nó sinh ra.

Đã cân nhắc gắn cột thô vào fixture để giữ nó đỏ được, rồi **bỏ**: làm thế là
dựng một ca không có đường xảy ra trong sản phẩm, tức biến một phép gác thành
một ô đỏ giả. Giữ lại một dòng vì rẻ, nhưng chú thích tại chỗ nói rõ phép gác
THẬT là ba vế `SECRET_CHECK` / `SECRET_ARG` / nhãn ẩn — chúng đỏ ngay khi ai đó
trả `Testcase` đầy đủ, dưới BẤT KỲ tên trường nào.
→ **Việc cho lead:** chỗ đúng của phép gác đã mất là một ô trên chính
`toProblemDTO` (file của lead, lane này không sở hữu).

## Kiểu mới khai tại `list.ts`

`AuthorProblemWithStats` + `AuthorProblemPage`, thay `ProblemWithStats` /
`ProblemPage` của `packages/games`. Kiểu cũ dựng trên `Problem` của K8s — còn
khai `objectives` và `topics: readonly ProblemTopic[]` — nên nó **nói dối về giá
trị `listProblems` thật sự trả**. Giữ nó lại là giữ một bản sao thứ hai của hợp
đồng đã bị thay, và bản sao đó sẽ trôi.

Hành vi KHÔNG đổi: đường người soạn vẫn nhận `testcases` ĐẦY ĐỦ (còn
`check`/`args`), khác `SolverProblem`. Không phải lỗ rò — `mine` là
`authorProcedure` đã chặn phạm vi về bài của chính người gọi.

## Hai món cho lead

1. **`routers/problems.ts` — `submit` chưa có cổng `gameId`.** Thủ tục tra bài
   CHỈ theo `code` + `state`. Trước 0015 chuyện đó vô hại vì mọi dòng đều là
   K8s; từ 0015 có cột `game_id`, nên một bài `game_id = 'git'` **đã có đường
   lọt** vào một đường chấm chỉ biết K8s. Đây không phải mã chết — nó vừa thành
   mã có đường tới. Cổng thuộc `submit.ts`/§18.G. Đã ghi chú tại chỗ gọi.
2. **`schema.ts` § cột `objectives` đang khai hơi quá.** Chú thích nói
   `$type<Testcase[]>` là *"hình dạng của các lượt GHI MỚI"*. Điều đó **chưa
   đúng**: chừng nào `problemBodyShape` chưa mở (§18.D.1), lượt ghi mới vẫn đẻ
   ra hình dạng `Objective` cũ — xem ép kiểu #1. Câu đúng hôm nay là *"hình dạng
   ĐÍCH sau §18.D.1"*. Một chữ, nhưng nó là chỗ người sau dựa vào để quyết định
   có cần `problemTestcases` nữa không.
