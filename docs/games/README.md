# Trụ cột ③ Games — chỉ mục

Game chạy **hoàn toàn trong trình duyệt**: không route backend, không pod, không phiên
sandbox. Đây là ràng buộc kiến trúc, không phải một tối ưu, và nó là lý do trụ cột này tồn
tại: nội dung tương tác mà chi phí vận hành bằng không.

Ô nghiệm thu tương ứng đo bằng Playwright network trace chứ không bằng đọc code:
**0 lời gọi backend trong lúc chơi**.

---

## Sáu game

| Game | `GameId` | Trạng thái | Tài liệu |
|---|---|---|---|
| Cứu hộ cluster Kubernetes | `k8s` | **Đã hiện thực** (P14 đợt 1): 30+ level, chaos, sandbox, challenges | hợp đồng ở `packages/games/src/k8s/contract.ts` |
| Phòng thí nghiệm Git | `git` | **Đã hiện thực** (P17 engine + 2D, **P17b** 3D): 32 level, engine git tự viết, **hai renderer ngang hàng** — SVG 2D (mặc định) và cảnh 3D three.js | [`git.md`](git.md) |
| Đường ống CI/CD | `cicd` | Thiết kế, chưa code | [`../../plans/reports/2026-09-11-brainstorm-git-cicd-games.md`](../../plans/reports/2026-09-11-brainstorm-git-cicd-games.md) §4 |
| Đường ống (bản cũ) | `pipeline` | Tài liệu tham khảo, **không hiện thực** | [`pipeline.md`](pipeline.md) |
| Mê cung mạng | `netpol` | Thiết kế, chưa code | [`netpol.md`](netpol.md) |
| Lò rèn Image | `dockerfile` | Thiết kế, chưa code | [`dockerfile.md`](dockerfile.md) |

Ba ô "sắp có" trên `/games` là **lựa chọn có ý thức, không phải thiếu sót**
([`phase-14-exec.md`](../../plans/devops-learning-platform/phase-14-exec.md) §1 quyết
định 4): một game hoàn chỉnh có giá trị hơn bốn game dở dang.

⚠ **`pipeline` giữ trong `GameId` dù không bao giờ hiện thực.** Xoá một nhánh khỏi union
là đổi hợp đồng lưu trữ: khoá `localStorage` là `dlp.games.v1.<gameId>`, nên một bản lưu
cũ sẽ mất đường đọc ra, không lỗi, không cảnh báo. Game CI/CD dùng id mới `cicd` vì nó là
một thiết kế khác hẳn (có CD, môi trường, rollback, GitOps), không phải bản đổi tên.

### ⚠ Đính chính một câu sai đã đứng ở tài liệu này

Bản trước viết rằng ba game còn lại "là DOM thật" trong khi game K8s là 3D. **Sai**, và
vế "chưa code" vẫn đúng khi kiểm lại ngày 2026-09-14: dưới
`apps/web/src/components/games/` chỉ có thư mục `git/` — `pipeline` / `netpol` /
`dockerfile` không có một component nào, nên không có "DOM thật" nào tồn tại để mà mô
tả sai hay đúng. Ba tài liệu `pipeline.md` / `netpol.md` / `dockerfile.md` đều được
THIẾT KẾ cho 2D, và chúng vẫn chỉ là thiết kế.

Hai vế còn lại **đã đổi**, nên câu đính chính cũ nay cũng cần đính chính:

- Game K8s vẫn dùng `three@0.185.1` + `@react-three/fiber`, scene thật ở
  `apps/web/src/components/k8s-arena/scene/`.
- Game Git **không còn là "renderer SVG 2D"**. Từ P17b nó có **hai** renderer ngang
  hàng đọc chung một `SceneProps`: SVG 2D (mặc định, DOM thật, không canvas) và cảnh 3D
  `three` nạp động. Lựa chọn nhớ ở `localStorage`; 2D là chế độ ngang hàng chứ không
  phải bản dự phòng — bốn lý do ở [`git.md`](git.md) §6b.

Bài học chung của cả hai lần: một câu mô tả kiến trúc trong tài liệu chỉ mục **hết hạn
theo chặng**, và nó hết hạn trong im lặng. Sửa nó thì kiểm lại bằng `ls`/`grep` thay vì
chép lại câu đính chính lần trước.

Mỗi tài liệu thiết kế có một mục **"cái nó dạy được mà Kubernetes Game không dạy được"** và một
mục **"chỗ ý tưởng này yếu"**. Mục thứ hai không phải khiêm tốn theo phép lịch sự: nó là
thứ người hiện thực đọc trước khi bắt đầu, để biết chỗ nào sẽ đau.

Tài liệu liên quan không nằm trong chỉ mục này:

- [`../../content/games/ATTRIBUTION.md`](../../content/games/ATTRIBUTION.md): ghi công
  nguồn cảm hứng, và vì sao đó là lịch sự chứ không phải nghĩa vụ theo Apache-2.0.
- [`anti-cheat.md`](anti-cheat.md): cơ chế xác minh bằng phát lại tất định, và danh sách
  thứ **không** bảo vệ được. Do lane G sở hữu (`phase-14-exec.md` §8), không phải lane
  tài liệu này.
- [`../oj-format.md`](../oj-format.md): **bài OJ** — định dạng bài, hợp đồng plugin theo
  game, cách chấm, testcase ẩn, gợi ý có giá. <!-- updated 260915 -->
- [`../exam-format.md`](../exam-format.md): **chế độ thi** — đồng hồ, cổng soạn đề, cổng
  nộp bài, bảng điểm, xuất CSV. <!-- updated 260915 -->

### Bài OJ dùng CHUNG engine của game, nhưng không phải là game <!-- updated 260915 -->

Một `Problem` chạy trên đúng reducer mà người chơi đã chạy, và đó là điều làm phép chấm lại
phía máy chủ có nghĩa. Nhưng nó **không** phải một level, và ba khác biệt dưới đây là thứ
phải nhớ trước khi đọc mã của một trong hai:

| | `Level` | `Problem` |
|---|---|---|
| Có dạy không | **CÓ** (`teaching`, `primer`, `cheatsheet`) | **KHÔNG** — đề bài trần 150 từ |
| Chấm bằng | `Objective` (có `required`, có mục tiêu thưởng) | `Testcase` (luôn chặn, không trọng số) |
| Độ khó | **ba** bậc `Difficulty` | **bốn** bậc `PROBLEM_DIFFICULTIES` |
| Lưu ở đâu | file `levels/lNN.ts` | Postgres (`problems`) |
| Tiến độ | `localStorage`, 0 lời gọi backend | lượt nộp ghi xuống DB |

⚠ Hai thang độ khó **cố ý khác nhau** và **tuyệt đối không được ánh xạ ngầm** — lý do đầy
đủ ở [`../oj-format.md`](../oj-format.md) §2.

⚠ Bài OJ là chỗ **duy nhất** trong trụ cột này có gọi backend, nên nó **không** nằm trong ô
nghiệm thu "0 lời gọi backend trong lúc chơi". Ô đó đo lượt CHƠI LEVEL; một lượt nộp bài OJ
theo định nghĩa phải đi qua máy chủ, vì cả cơ chế chống gian lận là máy chủ tự phát lại.

---

## Kiến trúc dùng chung: `packages/games`

```
packages/games/src/
  index.ts              # barrel, CHỈ re-export (lead sở hữu)
  core/                 # dùng chung cho MỌI game
    types.ts            # GameId · Difficulty · RunResult · GameSave · storageKey
    run-log.ts          # GameAction · RunLog — mở theo game, không còn của riêng K8s
    problem.ts          # hợp đồng bài OJ: Testcase · ProblemVerdict · Submission
    problem-plugin.ts   # GameProblemPlugin · AuthorField · bảng đăng ký
    verify.ts           # xác minh bằng phát lại tất định
    rng.ts              # PRNG có hạt giống
    progress.ts         # đọc/ghi localStorage + migration
    achievements.ts · stats.ts
  k8s/                  # một thư mục cho mỗi game
    contract.ts · model.ts · reducer.ts · tick.ts
    predicate-names.ts · predicates.ts · scoring.ts
    problem-plugin.ts   # phần riêng của game trong hệ OJ
    levels/
  git/
    contract.ts · engine.ts · predicates.ts · world-spec.ts
    problem-plugin.ts · problem-topics.ts
    levels/
```

⚠ `problem-topics.ts` tách khỏi `problem-plugin.ts` **có lý do đo được**, không phải cho
gọn: file plugin nhập `createGitSession`, nên **mọi route chạm một tên trong đó đều kéo cả
engine git theo** — mà trang danh mục bài chỉ cần nhãn chủ đề. Cùng hình dạng lỗi mà P17 đã
trả giá (`44f8e39`, 631KB ở hai chỗ).

### Bốn ràng buộc áp cho mọi game, không có ngoại lệ

1. **Không `node:*`, không DOM, không React** ở bất kỳ đâu truy được từ barrel. `tsconfig`
   của package cố ý bỏ `types: ["node"]` để một lần lạc tay là đỏ ngay ở typecheck. Một
   `node:fs` lọt vào chỉ làm `next build` đỏ trong khi typecheck, lint và test đều xanh.
2. **Tất định tuyệt đối.** Cùng seed + cùng chuỗi hành động ⇒ cùng trạng thái. Không
   `Math.random()`, không `Date.now()` trong logic; mọi ngẫu nhiên đi qua `core/rng.ts`.
   Đây là điều kiện để xác minh chống gian lận hoạt động, không phải một sở thích về độ
   sạch.
3. **Không field suy ra được.** `passed`, `percent`, `durationSeconds` tính ở chỗ dùng.
   Quy ước này áp cho `localStorage` y như cho Postgres.
4. **Canvas là hình minh hoạ, không phải giao diện.** Mọi hành động chơi được phải làm
   xong bằng bàn phím qua lớp DOM. Canvas mang `aria-hidden="true"`
   (`phase-14-exec.md` §4.4).

### Lưu tiến độ

`localStorage`, một khoá cho mỗi game: `dlp.games.v1.<gameId>`, giá trị là JSON của
`GameSave`. Không có bảng DB nào, và đó là quyết định đã chốt kèm lý do
(`phase-14-exec.md` §1): một bảng tiến độ trong Postgres mâu thuẫn trực tiếp với ô nghiệm
thu "0 lời gọi backend".

`progress.ts` phải chịu được bốn trường hợp mà **không ném**: khoá vắng · JSON hỏng ·
version lạ · `localStorage` tự ném (chế độ riêng tư của trình duyệt). Cả bốn trả về trạng
thái rỗng kèm một cảnh báo.

---

## ✅ Việc "phải làm trước khi hiện thực game thứ hai" — ĐÃ XONG <!-- updated 260915 -->

Bản trước của mục này viết rằng `RunLog` và `GameAction` nằm ở **`k8s/contract.ts`**, rằng
`GameAction.kind` là union đóng của từ vựng Kubernetes, và rằng vì thế *"cơ chế xác minh
chống gian lận hiện chỉ dùng được cho Kubernetes Game"*. Kiểm lại ngày 2026-09-15: **cả ba
vế đều đã hết hạn.** Lead đã chọn **đường ra 1**:

```ts
// packages/games/src/core/run-log.ts
export type K8sActionShape<Ref extends ResourceRefLike = ResourceRefLike> = …
export type GitGameAction = …
export type GameAction = K8sActionShape | GitGameAction;   // mở theo game
export interface RunLog<A extends GameActionBase = GameAction> { … }
```

Nên phát lại tất định nay dùng được cho **nhiều game**, và game Git đã dùng thật. Đường ra 2
(xác minh bằng trạng thái cuối cho netpol/dockerfile) **không còn cần thiết** — nó vẫn đúng
về kỹ thuật nhưng không còn là đường duy nhất.

⚠ Ba tài liệu thiết kế `pipeline.md` / `netpol.md` / `dockerfile.md` **chưa được cập nhật**
theo lượt chuyển này: mục "mô hình trạng thái" của chúng vẫn nêu lại hạn chế cũ. Đọc chúng
thì nhớ vế đó đã hết hạn.

Bài học lặp lại lần thứ ba trong chính tài liệu này: một câu mô tả kiến trúc **hết hạn theo
chặng, và nó hết hạn trong im lặng**.

### Cái bẫy đặt tên đi kèm

`k8s/contract.ts` có `EdgeView`, `ObjectView`, `EventView`, `NodeView`. Ba trong bốn cái
tên đó nghe như dùng chung được. Không cái nào dùng chung được: `EdgeView.kind` là
`'owns' | 'selects' | 'mounts' | 'routes'`, `ObjectView` mang `ResourceKind` và `PodPhase`.
**Mọi thứ trong `k8s/contract.ts` là của K8s, kể cả khi tên nó không nói vậy.** Game mới
tự khai kiểu của mình; chỉ `core/types.ts` mới là hợp đồng dùng chung.

---

## Thêm game thứ năm

Bảy bước. Bước 1 và bước 6 chạm vào file lead sở hữu nên chúng bắt đầu bằng một lời báo,
không phải bằng một lần sửa.

1. **Báo lead.** `GameId` là một union **đóng** trong `core/types.ts`. Không thêm được id
   mới nếu không sửa file đó, và file đó là điểm giao của mọi lane.
2. **Viết `docs/games/<gameId>.md` trước khi viết code.** Bốn mục tối thiểu, theo khuôn ba
   tài liệu hiện có: vòng lặp chơi và chỗ nó khác ba game kia · mô hình trạng thái đối
   chiếu với hợp đồng · khoảng 15 level đầu (tiêu đề + mục tiêu) · cách chấm điểm. Và mục
   thứ năm, mục quan trọng nhất: **cái nó dạy được mà bốn game kia không dạy được**. Nếu
   không viết nổi mục đó thì game này không cần tồn tại, và phát hiện ra điều đó ở giai
   đoạn tài liệu rẻ hơn nhiều so với phát hiện ra sau ba tuần code.
3. **`packages/games/src/<gameId>/contract.ts`**: hợp đồng riêng, chỉ `import type` từ
   `core/types.ts`, không import từ thư mục của game khác.
4. **`<gameId>/predicate-names.ts`** nếu game có `Objective`. `Objective.check` là **tên vị
   từ dạng chuỗi**, không phải closure: level phải serialize được để lưu replay và so bằng
   `toEqual` trong test. Kèm một test khẳng định **hai chiều**: mọi tên có hiện thực, mọi
   hiện thực có tên. Một chiều thôi thì vị từ chết sẽ sống mãi.
5. **Reducer thuần + scoring + `levels/`.** Ngưỡng chấm phái sinh từ mốc của từng level,
   **không phải hằng số toàn cục**: xem `pipeline.md` §5 để biết lỗi này trông như thế nào
   khi nó xảy ra thật.
6. **Báo lead** để thêm dòng re-export vào `index.ts`.
7. **Route `apps/web/src/app/games/<gameId>/`** + một thẻ trong catalog. Thẻ ghi rõ game
   **không cần đăng nhập** và **không tốn sandbox** (CTF thì ngược lại: tốn một sandbox).

### Ba thứ một game mới không được làm

- Thêm field vào `core/types.ts` một cách lặng lẽ. Bốn lane đọc file đó; một field thêm âm
  thầm làm ba lane kia biên dịch xanh trong khi hiểu sai nhau.
- Lưu một giá trị tính được từ các giá trị khác.
- Coi `<canvas>` là giao diện. Nếu chơi hết được level 1 mà không cần chuột là không làm
  được, game sẽ trượt cổng axe và phải viết lại phần vỏ.

---

## Nguồn cảm hứng

Bộ game mode và vòng lặp chẩn đoán sự cố lấy ý tưởng từ `rohitg00/k8sgames` (Apache-2.0).
Không code, không asset, không văn xuôi nào được copy. Chi tiết đầy đủ, gồm vì sao đây là
lịch sự chứ không phải nghĩa vụ pháp lý:
[`content/games/ATTRIBUTION.md`](../../content/games/ATTRIBUTION.md).

Bản đọc upstream đầy đủ, gồm bốn quyết định thiết kế ta cố ý làm ngược lại:
[`2026-09-08-p14-k8sgames-upstream-study.md`](../../plans/devops-learning-platform/reports/2026-09-08-p14-k8sgames-upstream-study.md).
