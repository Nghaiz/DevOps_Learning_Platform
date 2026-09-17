# Lane 18.E.5 — lưu bản nháp Level Builder thành một dòng `problems`

**Ngày:** 2026-09-15 · **Nhánh:** `feat/p18-oj-exam` · **Cây:** dùng chung với một lane khác
đang chạy song song, nên **mọi con số dưới đây kèm mốc giờ** (`phase-18-exec.md` §3.1 bài học 3).

**Bốn commit, cả bốn đã hạ cánh:**

| SHA | Nội dung |
|---|---|
| `74707c8` | mã bài cấp theo game, cộng ba chỗ nữa vẫn tin mã luôn là `K8S-` |
| `e6a3375` | phép ánh xạ bản nháp → `ProblemBody`, cộng bốn lần phá để chứng minh nó có gác |
| `d66620a` | ô tích hợp: đường lưu chạy trọn trên Postgres |
| `1b8e85e` | panel lưu trong Builder, cộng bốn ô gác lời hứa |

---

## 1. Brief nói ba chỗ chặn. Đo ra BỐN, và chỗ thứ tư nằm sau đường ghi

Brief liệt kê `next-code.ts` chốt cứng `K8S-`, hai bản `isProblemCode`, và `LevelDraft` không
có `topics`. Cả ba đều đúng. Chỗ thứ tư không có trong brief và nó **không chặn việc lưu** —
nó chặn mọi thứ SAU khi lưu, nên nó sẽ chỉ lộ ra ở lượt thử đầu tiên của người soạn:

| # | Chỗ | Đo được | Xử lý |
|---|---|---|---|
| 1 | `next-code.ts` § `formatProblemCode` + bộ lọc regex + `.slice(4)` | cấp `K8S-` cho bài Git | sửa, theo tiền tố của plugin |
| 2 | `validate.ts` § `problemCodeSchema` | khoá vào `^K8S-\d{4}$`, mà `codeInput` dựng trên nó ⇒ `byCode` / `publish` / `archive` / `delete` / `forEdit` / `revealHint` / `submit` đều từ chối `GIT-0001` | sửa |
| 3 | `cursor.ts`, hai chỗ giải mã con trỏ | trang thứ hai của một danh sách có bài Git trả `Cursor không còn hợp lệ` | sửa |
| 4 | `app/(session)/problems/[code]/page.tsx:40` | cùng `isProblemCode` bản K8s ⇒ mở `/problems/GIT-0001` ra `notFound()` | **KHÔNG sửa — ngoài vùng lane, xem §6** |

Ba chỗ đầu nằm trong `apps/web/src/server/problems/**` nên chúng thuộc lane này.

**Hai bản `isProblemCode` (điểm 2 của brief) đã kiểm lại và brief đúng một nửa.** Bản `core/`
hai tham số là bản đúng cho việc này, nhưng **barrel `packages/games/src/index.ts` không xuất
nó** — hai hàm trùng tên nên barrel chỉ xuất được một, và nó đang xuất bản K8s (chính
`index.ts` ghi lại rằng đây là trạng thái trung gian có chủ ý của 18.A). Bản `core/` với tới
được qua một tên KHÁC: `problemCodePattern(prefix)`, có trong barrel. Nên không phải mở thêm
export nào ở barrel, và `packages/games/src/**` không bị chạm một dòng.

Tương tự với `GIT_PROBLEM_CODE_PREFIX`: brief nói dùng nó, nhưng nó **cũng không có trong
barrel**. Đường thay thế là `PROBLEM_PLUGINS.git.codePrefix` — cùng một giá trị, và nó là SSOT
thật vì plugin khai tiền tố của chính mình.

### 1.1 Tập tiền tố suy từ plugin, không gõ tay

`apps/web/src/server/problems/problem-code.ts` (mới) dựng `PROBLEM_CODE_PREFIXES` từ
`Object.values(PROBLEM_PLUGINS)`. Viết thẳng `['K8S','GIT']` là **bản sao thứ ba** của một
danh sách đã có hai bản, và nó trôi đúng vào ngày game thứ ba có plugin: bài của nó lưu xuống
được (biên ghi đọc `PROBLEM_PLUGINS`) nhưng mã của nó không mở được, không sửa được, không
phân trang được.

### 1.2 Lọc theo TIỀN TỐ MÃ, không lọc theo cột `game_id`

Hai thứ đó trông như một và không phải một. `crud.ts` § `assertGameIdChangeAllowed` cho phép
đổi `gameId` của một bài **chưa có lượt nộp**, nên một bài từng là K8s nay mang `game_id='git'`
vẫn giữ mã `K8S-0007` (mã ổn định vĩnh viễn, đó là hợp đồng). Lọc theo `game_id` sẽ bỏ mã đó
khỏi phép tính `max` của dãy `K8S`, rồi cấp lại `K8S-0007` và đụng khoá chính **mãi mãi**.
Thứ phải duy nhất là `code`, nên phép tìm `max` đi trên chính không gian đó.

**Hệ quả để ngỏ, ghi ra chứ không vá:** sau một lượt đổi game, tiền tố mã và `game_id` của
dòng ấy lệch nhau vĩnh viễn — `GIT-0003` có thể là một bài K8s. Không có gì hỏng (mã vẫn duy
nhất, vẫn mở được), nhưng vá nó nghĩa là cấp lại mã khi đổi game, tức phá đúng tính ổn định
mà hợp đồng hứa. **Cần người ra lệnh, không phải một dòng sửa lặng lẽ.**

### 1.3 `.slice(4)` là một con số đúng vì tình cờ

`4` = `len('K8S-')` và cũng `= len('GIT-')`, vì hai tiền tố cùng dài ba ký tự. Đó chính là chỗ
nó nguy hiểm: nó đúng cho tới tiền tố đầu tiên có độ dài khác, rồi `Number('I-0007')` trả
`NaN`, `NaN + 1` trả `NaN`, `padStart` in ra `"NaN"` — một mã không khớp khuôn nào, **chèn
được, không cổng nào đỏ**. Nay là `prefix.length + 1`.

---

## 2. Hợp đồng ánh xạ: giữ nguyên verbatim, cộng hai chỗ kiểu không bắt được

`apps/web/src/components/games/git/builder/draft-to-problem.ts` — hàm thuần, ở `apps/web`, đúng
như brief yêu cầu. Bảng ánh xạ chép đúng brief, kể cả `expert` không với tới được.

**Ba trường chỉ-Problem KHÔNG vào `LevelDraft`** (brief cấm, và lý do đứng vững khi viết mã):
chúng vào qua một kiểu riêng `ProblemExtras` mà panel dựng. `packages/games` không bị chạm.

**`required` → `visible` bị chặn ở tầng mã lẫn tầng test.** Cả hai là `boolean` nên ánh xạ
nhầm biên dịch tốt và đổi nghĩa dữ liệu trong im lặng.

Hai chỗ mà brief không nói và `tsc` không bắt được, phát hiện khi đọc schema:

1. **`par === 0` phải thành `null`.** Brief có nói (`.positive().nullable()`). Thứ brief không
   nói là **`0` là giá trị thường gặp NHẤT**, không phải ca hiếm: `emptyDraft` khởi tạo `par`
   bằng `0` và `levelDraftIssues` chỉ chặn số **âm**. Gửi thẳng thì người soạn nhận 400 về
   `parMoves` trong khi ô "số lệnh chuẩn" của họ đang để trống.
2. **`target === null` phải thành VẮNG MẶT KHOÁ, không phải `targetState: null`.** Dưới
   `exactOptionalPropertyTypes` đó là hai hình dạng khác nhau, và `toRowValues` ở máy chủ mới
   là chỗ đổi "vắng mặt" sang `null` của cột. Đổi ở hai chỗ là dựng hai quy ước.

**Gợi ý của level không có id.** `GitLevel.hints` là mảng chuỗi trần còn `ProblemHint.id` là
bắt buộc, nên id phải được SINH RA. Khoá duy nhất có sẵn là chỉ số (`goi-y-1`, `goi-y-2`).
Hệ quả nói thẳng trong mã: **chèn một gợi ý vào GIỮA danh sách sẽ đẩy giá của mọi gợi ý sau nó
lệch một ô.** Bản nháp không chở id thì không có cách nào tránh.

**Một mất mát THẬT so với tệp level xuất ra:** `draft.allowedCommands` không có ô nào trong
`ProblemBase`, nên một bài OJ Git **không chở được tập lệnh cho phép**. Level xuất ra JSON thì
giữ; bài lưu trong DB thì mất. Không phải lỗi của lane này (hợp đồng plugin chưa có ô cho
"trường riêng của game", đó là §18.A.3), nhưng nó là một khác biệt có thật giữa hai đường xuất
và người soạn không được báo. Đề nghị: một câu trên panel, hoặc mở `authorFields` cho nó.

**Tra chủ đề qua `problemTopicLabels('git')`, không qua `PROBLEM_PLUGINS.git.topics`** dù cái
sau đúng hơn: `PROBLEM_PLUGINS` nhập cả hai plugin nên kéo cả hai engine, và PR #124 đã đo
chunk 369.938 B đi theo đường đó vào 7/38 route. Cùng lý do, `ProblemBody` nhập bằng
`import type` — kiểu bị xoá lúc biên dịch nên không tốn bundle, mà `tsc` vẫn đỏ tại đây nếu
hợp đồng mọc thêm trường.

---

## 3. KHÔNG có mutation mới, và đó là câu trả lời chứ không phải việc bỏ dở

Brief bước 3 nói *"dùng lại `problemBodyShape`/`createProblem` đang có"*. Đo ra rằng
`problems.create` **đã** nhận đúng `problemBodySchema` từ trước; thứ thiếu là hai chỗ chặn ở
dưới nó, và cả hai sửa ở `74707c8`. Thêm một `saveFromBuilder` riêng chỉ nhân đôi xác thực,
cổng chủ sở hữu, vòng chống đua cấp mã và ba cổng kỳ thi — rồi hai bản trôi khỏi nhau (đúng
loại va chạm mà `phase-18-exec.md` §3.1 đã ghi cho lane B và lead).

Thứ lane này thêm vào là **ô tích hợp** (`save-git-problem.integration.test.ts`), vì ba ô đơn
vị xanh KHÔNG nói được gì về chỗ nối: `draftToProblemBody` trả một object mà
`problemBodySchema` (`.strict()`) chưa chắc nhận, và `createProblem` cấp mã bằng một truy vấn
Postgres mà không test đơn vị nào chạm. Đo được: trước lượt này cả ba ô đơn vị xanh trong khi
đường thật đỏ ở **hai chỗ liên tiếp**.

Ô đắt nhất: *"một bài K8s chen vào giữa KHÔNG đẩy số thứ tự của dãy Git"*. Hai dãy dùng chung
một bộ đếm không gây ra lỗi nào đọc được — nó để lại những khoảng trống vĩnh viễn trong cả hai
dãy mã, và không ai truy được vì sao.

So hai lần cấp **liên tiếp** thay vì chốt cứng `GIT-0001`: bảng thật đã có bài seed `K8S-00xx`,
và một ô chốt số tuyệt đối sẽ đỏ theo trạng thái DB của máy chạy nó chứ không theo mã.

---

## 4. Panel lưu, và hai ràng buộc đụng thẳng vào nó

**`app/games/layout.tsx` cố ý KHÔNG cấp `TrpcQueryProvider`**, và file đó gần như chỉ tồn tại
để nói lý do: *"game phải chạy với 0 lời gọi backend"* (ô nghiệm thu `phase-14-exec.md` §6, đo
bằng network trace của Playwright ở `e2e/games.spec.ts`). Đây là ràng buộc nặng nhất của cả
việc, và brief không nhắc.

Cách giải, hai tầng:

1. **Client tRPC THUẦN** ở `lib/trpc.ts` (`createTRPCClient` + `httpBatchLink`), không React
   Query nên không cần provider nào. Tiền lệ là trang `/session`.
2. **Nhập ĐỘNG trong chính hàm bấm nút.** `@trpc/client` không có một byte nào trong bundle
   đầu của `/games/git`, và tầng mạng theo nghĩa đen không tồn tại cho tới lúc bấm Lưu. Nhập
   tĩnh vẫn giữ được ô e2e (nó không bấm nút này), nhưng nó biến *"không gọi mạng"* từ tính
   chất **cấu trúc** thành tính chất **tình cờ** — và tình cờ thì lần sau ai đó phá mà không
   ai thấy. Có một ô gác tĩnh cho đúng chuyện này.

Đọc lại `e2e/games.spec.ts` § *"0 lời gọi backend trong lúc chơi"*: nó đo hai pha (tải trang +
đang chơi), mở `GAME_PATH`, bật/tắt 3D và gõ lệnh. Nó **không mở Builder và không bấm Lưu**,
nên ô đó vẫn xanh. Nói thẳng phần chưa đo: **không có ô nào khẳng định rằng mở Builder cũng
không gọi mạng.** Nhập động làm điều đó đúng theo cấu trúc, nhưng nó chưa được ĐO.

**Ràng buộc thứ hai: `/games` không nằm trong `PROTECTED_PATHS`** còn `problems.create` là
`authorProcedure`. Khách vãng lai **chắc chắn** gặp `UNAUTHORIZED` — đó là hành vi đúng, và
việc của panel là nói ra bằng tiếng Việt, kèm câu trấn an rằng bản nháp còn nguyên. Câu cảnh
báo cũng nằm ở đầu panel, TRƯỚC khi họ soạn xong ba ô, cùng lý lẽ với hai giới hạn ở khối đầu
Builder.

**Hai mảng song song không bao giờ lệch** vì chúng được DỰNG từ bản nháp ở mỗi lần vẽ. Nên hai
mã lỗi `*-lech-so-luong` của `problemSaveIssues` không với tới được từ giao diện này — chúng
gác hợp đồng của hàm thuần cho mọi chỗ gọi khác. Nói ra vì một mã lỗi không với tới được trông
y hệt một mã lỗi thừa.

**Mặc định `visible: true` và điểm trừ `0`** là hướng AN TOÀN: không giấu gì, không tính tiền
gì. Ngược lại sẽ âm thầm biến mọi testcase thành ẩn và mọi gợi ý thành có giá.

**13 khoá chữ mới** ở `author.builder.save.*` trong `packages/copy/src/surfaces/author.ts`
(file lane này sở hữu). Không cần miễn trừ `authorIntentionalThree` — không nhóm ba anh em nào
sinh ra. Cổng **dead-key** của `packages/copy` bắt được chúng lúc còn chưa nối vào đâu (13 khoá
đỏ) và chỉ xanh lại sau khi panel dùng thật; đó là cổng `wired-not-just-present` của gói chữ,
và nó chạy đúng.

---

## 5. Ô gác và đối chứng dương

Brief đòi: *"phá một dòng ánh xạ, xem ô đỏ đúng tên, khôi phục, ghi kết quả"*. Chạy tám phép,
từng phép một, khôi phục sau mỗi lần.

### 5.1 Bảng ánh xạ (`draft-to-problem.test.ts`, 30 ô)

| Phá thành | Ô đỏ | Ô còn lại |
|---|---|---|
| `statement: draft.mission` | `statement lấy từ draft.brief, KHÔNG phải draft.mission` | 29 xanh |
| `parMoves: draft.par` | `par 0 ⇒ null` | 29 xanh |
| `visible ← objective.required` | `BỎ required, và visible tới từ panel chứ không suy từ required` | 29 xanh |
| `advanced: 'expert'` | `thang ba bậc sang thang bốn bậc, và expert KHÔNG với tới được` | 29 xanh |

Mỗi lần **đúng một ô** đỏ, đúng ô mang tên dòng bị phá.

### 5.2 Lời hứa của panel (`save-problem-promises.test.ts`, 11 ô)

| Phá | Ô đỏ |
|---|---|
| `await import` thành `import` tĩnh | 2 ô về nhập động |
| gỡ `<SaveProblemPanel>` khỏi `git-builder.tsx` | 2 ô về chỗ nối |
| xoá `t('author.builder.save.scope')` | ô câu phạm vi |
| bỏ nhánh `UNAUTHORIZED` | ô nhánh chưa đăng nhập |

### 5.3 Đường tích hợp — đối chứng CÓ GIỚI HẠN, nói thẳng

Đổi bộ lọc `^GIT-[0-9]{4}$` thành `^[A-Z0-9]+-[0-9]{4}$` (một bộ đếm dùng chung) ⇒ **6/8 ô
đỏ**, gồm cả hai ô về dãy mã.

Giới hạn của đối chứng này: một bộ đếm chung làm phép cấp mã đụng khoá chính nên nó **đổ dây
chuyền**. Nó chứng minh các ô CÓ nối vào hành vi; nó **không** chứng minh mỗi ô đỏ vì đúng lý
do tên nó nói.

---

## 6. Ngoài vùng lane — cần lead hoặc lane khác

1. ~~**`app/(session)/problems/[code]/page.tsx:40`**~~ **ĐÃ ĐÓNG 12:01 bởi lane còn lại**
   (`65c97e0`, `9a8ea17`). Lời khai dưới đây đúng lúc đo (11:14) và giữ lại vì nó là bằng chứng
   rằng chỗ chặn thứ tư có thật: còn gọi `isProblemCode` bản K8s, nên mở
   `/problems/GIT-0001` ra `notFound()`. Đường sửa có sẵn:
   `import { isAnyProblemCode } from '.../server/problems/problem-code'`. Thư mục
   `app/(session)/problems/**` thuộc lane D nên lane này không chạm.
2. **`allowedCommands` mất khi lưu thành bài** (§2). Cần một câu trên panel hoặc một ô trong
   `authorFields` — cả hai đều đụng hợp đồng plugin (§18.A.3).
3. **Chưa có ô nào đo rằng mở Builder không gọi mạng** (§4). Một ô e2e mở Builder rồi đọc
   `trace.apiCalls()` sẽ đóng nó.
4. **`draft-to-problem.ts` nhập `toSlug` từ `app/author/problems/text-tools`** — hướng nhập
   ngược (component → route module). Chọn tái dùng thay vì chép một hàm slug tiếng Việt thứ tư
   (`đ`/`Đ` không phải `d` cộng dấu phụ, và bẫy đó đã được ghi ngay trong `toSlug`). Chỗ đúng
   của hàm ấy là một module dùng chung, nhưng `app/author/problems/**` ngoài vùng lane này.
5. ~~**`eslint` toàn `apps/web` ĐỎ**~~ **ĐÃ XANH 12:03**, sau khi lane còn lại commit.
   Lượt đo 11:14 đỏ, và lỗi không thuộc lane này:
   `components/games/git/git-level-screen.tsx:170 'GitLevelScreen' is defined but never used`.
   File đó là file **chưa theo dõi** của lane còn lại, đang viết dở lúc đo (11:14). Vùng của
   lane này (`src/server/problems` + `src/components/games/git/builder`) **0 lỗi**.

---

## 7. Đo được — kèm mốc giờ, vì cây dùng chung

| Phép đo | Lệnh | Kết quả | Giờ |
|---|---|---|---|
| Kiểu | `pnpm --filter @devops-platform/web typecheck` | xanh | 11:32 và 11:57 |
| Lint (vùng lane) | `npx eslint src/server/problems src/components/games/git/builder` | 0 lỗi | 11:33 |
| Lint (toàn `apps/web`) | `pnpm --filter @devops-platform/web lint` | đỏ 1 lỗi của lane kia ở 11:14, **xanh ở 12:03** sau khi họ commit | 11:14 / 12:03 |
| Test web | `pnpm --filter @devops-platform/web test` | 206 file / 2432 ô ở 11:33, **207 / 2441 / 0 skip ở 12:00** | 11:33 / 12:00 |
| Test copy | `pnpm --filter @devops-platform/copy test` | 5 file / 72 ô | 11:28 |
| Tích hợp Postgres | trong suite web, `dlp-postgres` đang chạy | 8 ô chạy THẬT | 11:33 |
| `next build` | `pnpm --filter @devops-platform/web build` | **xanh, thoát 0**, 38/38 trang | 11:41 |
| Ngân sách bundle | `pnpm bundle:check` | **đạt**, `/games/git/page` 1.168.659 B | 11:44 |

Suite web đầu lane là 201 file / 2365 ô. Lane này thêm **4 file**
(`problem-code.test.ts` 8 ô, `draft-to-problem.test.ts` 30 ô,
`save-git-problem.integration.test.ts` 8 ô, `save-problem-promises.test.ts` 11 ô) cộng 1 ô mới
trong `validate.test.ts` = **58 ô**. Chênh còn lại (2365 + 58 = 2423 so với 2432) là của lane
kia, đang ghi vào cùng cây.

**Ô AC-2 của đợt (`turbo run build lint typecheck test --force`) vẫn CHƯA chạy.** Chờ tới
12:03 thì bốn cổng rời đều xanh (`build`, `lint`, `typecheck`, `test` ở `apps/web`, cộng
`bundle:check`), nhưng chạy rời từng cổng KHÔNG tương đương một lượt `turbo --force`: nó còn
phủ `packages/*` và đọc `Tasks: X/Y`. Lượt đó thuộc về lead sau khi cả hai lane hạ cánh.

---

### 7.1 `next build` và `bundle:check` — thứ chúng chứng minh, và thứ chúng KHÔNG

`next build` xanh là phiên bản có nghĩa duy nhất của câu *"ranh giới client/server của panel
sạch"*: `tsc`, `eslint` và `vitest` đều mù với nó (một component client kéo một module chạm
`node:fs` vẫn đi qua cả ba). Panel nhập `ProblemBody` bằng `import type` và `lib/trpc` bằng
`await import`, nên đây là cổng duy nhất thấy được hai đường ấy.

⚠ **`bundle:check` đạt KHÔNG chứng minh rằng nhập động đã giữ `@trpc/client` ra ngoài
bundle đầu.** Nó chỉ nói `/games/git/page` (1.168.659 B) chưa chạm trần. Không có số ĐỐI
CHỨNG: muốn có thì phải đổi sang nhập tĩnh rồi build lại, và hai lượt build nữa không nằm
trong ngân sách lượt của lane. Thứ đang giữ lời hứa là ô gác tĩnh ở §5.2, không phải
con số này — và đó là một ô đọc NGUỒN, nên nó chặn được lần sửa chứ không đo được byte.

⚠ Cả hai lượt đo trên chạy trên cây CÓ mã chưa commit của lane còn lại (`git-problem.tsx`,
`git-level-screen.tsx`, `problem-level.ts`). Chúng nói được rằng **cả hai lane cộng lại** build
được, không nói riêng được về lane nào.

---

## 8. Việc còn lại của chính §18.E.5

- Bài lưu ra **chưa được mở thử ở `/games/git?problem=`** — khối 4 nửa client
  (`phase-18-exec.md` §2 hàng 4) là việc của lane khác và nó chưa xong lúc lane này dừng. Nên
  ô nghiệm thu của khối 5 (*"bài lưu ra mở được ở `/games/git?problem=` và chơi được"*)
  **CHƯA đo được**. Thứ đã đo là: bản nháp → ánh xạ → Zod → một dòng `problems` đúng hình dạng,
  mang mã `GIT-####`, trên Postgres thật.
- Không có ô e2e nào cho panel (cần đăng nhập bằng tài khoản `author`, và `/games` không có
  đường đăng nhập).
