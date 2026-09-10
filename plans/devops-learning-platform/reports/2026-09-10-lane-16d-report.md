# Lane 16.D — khoang lab · báo cáo

**Ngày:** 2026-09-10 · **Nhánh:** `feat/p16-d-lab` · **Worktree:** `D:/NCKH/wt-p16-d`
**Nền:** gộp `feat/p16-frontend-rebuild` một lần (merge `4f4cae6`, lead cấp quyền), `pnpm-lock.yaml` **không đổi**.

---

## 1. Cổng nghiệm thu, nguyên văn

```
pnpm -w turbo run build lint typecheck test
Tasks:    32 successful, 32 total
```

Đọc dòng `Tasks:` trước mọi con số test: không task nào đỏ, nên không suite nào bị bỏ chạy.

Số test **đã chạy** từng gói (`turbo run test --force`, `Tasks: 15 successful, 15 total`):

| Gói | Test file | Test đã chạy |
|---|---|---|
| `web` | 141 | **1666** |
| `ui` | 34 | 858 |
| `games` | 25 | 402 |
| `scenario` | 17 | 285 |
| `terminal` | 6 | 133 |
| `motion` | 4 | 110 |
| `copy` | 2 | 52 |
| `shared-types` | 3 | 48 |

`web` đi từ **1602** (nền 16.A) lên **1666**, tức lane này thêm **64 ô test đã chạy**.

Cổng màu trần: `node scripts/check-design-tokens.mjs` exit 0, quét 545 file, 4 file miễn trừ có ghi lý do.

**Một lượt đỏ đã quan sát, và tôi không giấu nó.** Lượt `turbo run test --force` đầu tiên báo
`@devops-platform/scenario` đỏ 1 ô và dừng ở `Tasks: 12 successful, 15 total`. Chạy riêng gói đó:
17 file / 285 ô xanh. Hai lượt `--force` tiếp theo: `15 successful, 15 total`. Khớp hình dạng đã
biết của repo (test I/O hết giờ khi turbo chạy song song), và **không** file nào của lane này nằm
trong gói `scenario`. Tôi không tái hiện được nó, nên tôi gọi nó là chưa kết luận được, không gọi
là đã loại trừ.

---

## 2. Commit

| SHA | Tiêu đề |
|---|---|
| `d8d7f01` | test(session): AC-1..AC-3 của p16-workspace §8 có đối chứng dương |
| `4f4cae6` | (merge nền, lấy dep `copy` + `motion`) |
| `29d40f4` | feat(copy): surface session. cho lane 16.D, 126 khoá |
| `a6294de` | feat(session): /labs/:id + /lessons/:id vào immersive, khung phiên đọc packages/copy |
| `e4e4e22` | feat(session): IdePane về components/session, AC-8 lần đầu có test |
| `d82cd54` | refactor(session): xoá bản IdePane cũ ở app/lessons, nối qua barrel |
| `4b92043` | feat(session): danh sách kiểm nhiệm vụ, tách "chưa đạt" khỏi "hạ tầng lỗi" |
| `0487000` | feat(lab): trang lab dùng danh sách kiểm, mọi chuỗi qua packages/copy |
| `4129371` | feat(session): sân chơi, phases, progress, khung kết quả chấm đọc packages/copy |
| `66a4d06` | feat(session): điểm lab, ba hook phiên và cửa sổ terminal rời đọc packages/copy |
| `56896b4` | test(session): cổng T4 cho glob lane 16.D, 0 chuỗi còn ngoài bản đồ |
| `1c76844` | feat(session): chia đôi viết lại + AC-5 có đối chứng dương |
| `72203a9` | fix(session): đổi tên hai module thuần, next build đỏ vì trùng tên khác đuôi |

Chưa push (lead lo). Cây làm việc sạch.

---

## 3. Tám ô AC của `p16-workspace.md` §8

| Ô | Trạng thái | File test |
|---|---|---|
| **AC-1** terminal giữ NGUYÊN node cha | ✅ xanh, **nay có đối chứng dương** | `components/session/workspace-panel.dom.test.tsx` |
| **AC-2** hàng editor vắng mặt vẫn render, `hidden`, không mang `display` | ✅ xanh, **hai vế đối chứng đủ** | `workspace-panel.test.tsx` + `workspace-panel.dom.test.tsx` |
| **AC-3** hàng terminal KHÔNG BAO GIỜ `hidden` | ✅ xanh, **thêm vế tổ tiên** | `workspace-panel.dom.test.tsx` |
| **AC-4** bảng vào/ra của hàm thuần | ✅ xanh (đã có từ trước, đủ ca) | `workspace-tabs.test.ts` |
| **AC-5** fit chạy sau khi bố cục đổi, và chỉ khi đó | ✅ xanh, **nay có đối chứng dương** | `workspace-layout.test.ts` + `workspace-layout.dom.test.tsx` |
| **AC-6** đa terminal vẫn vắng mặt | ✅ xanh, đã có đối chứng thư mục | `single-terminal-contract.test.ts` |
| **AC-7** bàn phím + a11y trên `/labs/:id`, `/lessons/:id` | ⛔ **KHÔNG làm được ở lane này** | thuộc `apps/web/e2e/**` của 16.I |
| **AC-8** khoang IDE | ✅ xanh, **lần đầu tồn tại** | `components/session/ide-pane.dom.test.tsx` |

### Ba ô có thay đổi đáng nói

**AC-1** trước đó xanh nhưng chỉ khẳng định `expect(after).toBe(before)` trên panel thật. Một phép
đo MÙ cho đúng màu xanh đó: nếu panel không hề render lại, hoặc cú bấm không nối gì, hai tham chiếu
vẫn bằng nhau. Nay phép đo tách thành một hàm và chạy **hai lần trong cùng một lượt**: trên panel
thật (phải `toBe`) và trên một component cố ý sai theo hình dạng cấm §1.5 (phải `not.toBe`). Cặp
này tự chứng minh, vì đo mù thì ca thứ hai đỏ còn đo hỏng thì ca thứ nhất đỏ.

**AC-2** thiếu hẳn vế "bộ quét ĐỎ được". Đã thêm, và **nó bắt được một lỗi thật ngay trong lượt
này**: khi viết lại thanh kéo tôi đặt `flex` lên chính phần tử mang `hidden`, tức đúng bẫy §2, và
thanh kéo vẫn hiện ở tab Terminal. Cổng đỏ, sửa theo §2.3 (bọc lớp con mang `display`). Đây là lần
đầu cổng đó bắt một lỗi chứ không chỉ đứng gác.

**AC-5** đối chứng dương viết ra lần đầu là **ĐỎ, và đỏ vì harness sai chứ không phải sản phẩm
sai**: harness truyền `{ fit }` là object literal mới mỗi lượt render, mà `handle` nằm trong deps.
Một ô đỏ không chứng minh gì, phản chiếu của một ô xanh không chứng minh gì. Lý do ghi trong file.

---

## 4. Năm mục của §16.D

| Mục | Trạng thái |
|---|---|
| 1. `/labs/:id` + `/lessons/:id` vào immersive | ✅ **nửa immersive xong**; nửa "tiến độ dạng cung" chưa làm, lý do ở §6 |
| 2. Chia đôi viết lại, tách quyết định hình học ra hàm thuần | ✅ xong |
| 3. `IdePane` sang `components/session/` | ✅ xong (bản cũ đã xoá, không còn hai bản) |
| 4. Bảng nhiệm vụ thành danh sách kiểm, phân biệt rõ "chưa đạt" với "hạ tầng lỗi" | ✅ xong |
| 5. Màn chờ IDE 45 giây làm lại, logic thăm dò giữ nguyên | ✅ xong |

Cộng phần được cấp thêm: `app/playgrounds/[id]/**` ✅, `app/session/[id]/terminal/**` ✅,
`components/shell/immersive-routes.ts` ✅.

### Mục 1 — hai luật so khớp, không gộp được

`/games/k8s` immersive tính cả chính nó; `/labs` và `/lessons` thì trang danh mục ở đúng tiền tố
đó **phải** giữ vỏ đầy đủ, chỉ trang con mới immersive. Gộp một danh sách là mất một trong hai vế,
và cả hai vế hỏng im lặng. Thêm bước chuẩn hoá dấu chéo cuối: thiếu nó thì `/labs/` khớp
`startsWith('/labs/')` và trang danh mục mất vỏ ở một dạng URL trình duyệt tự sinh.

`/playgrounds/:id` **cố ý không** immersive dù nó cũng có terminal: sân chơi không có nội dung bài
để đọc cạnh terminal nên không chịu sức ép chiều cao, và mất thanh điều hướng ở một trang người ta
hay rời đi giữa chừng thì tệ hơn được thêm 56px. Lý do ghi tại chỗ khai.

### Mục 4 — thứ tự ưu tiên của trạng thái, hai bậc đáng đọc

`running` thắng tất cả (hiện trạng thái cũ trong lúc chấm đọc ra là nút không ăn), và **một lượt
ĐẠT đã lưu không bị lỗi hạ tầng ghi đè** (vẽ `infra` đè lên sẽ làm người học tưởng vừa mất điểm;
lỗi vẫn hiện đủ ở `CheckResultPanel`). Ngoài ra outcome `passed` **không** tự thành `passed`: sau
một lượt chấm thành công `lab-client` nạp lại `getAttempt`, nên nguồn đúng là trạng thái đã lưu.

---

## 5. `packages/copy` — 126 khoá, và 0 chuỗi còn ngoài bản đồ

Glob của lane trước lượt này có **154 literal tiếng Việt** trong mã nguồn; nay là **0**, và
`components/session/copy-gate.test.ts` giữ nó ở 0. Cổng dùng `scanLatinLiteral` của `packages/copy`
chứ không phải bản chép, và có ô "tập đầu vào không rỗng" chạy **trước** ô đếm vi phạm.

File test bị loại khỏi phạm vi quét, và lý do nằm trong file: một ô khẳng định nhãn đọc ra là
"Không chấm được" chỉ có giá trị khi nó viết **thẳng** chuỗi đó; viết
`toBe(t('session.task.state.infra'))` là so bản đồ với chính nó, xanh với mọi giá trị kể cả chuỗi
rỗng.

Phần lớn chuỗi được **viết lại** chứ không chép: luật V3 cấm U+2014, và mã cũ dùng nó dày đặc.
Bốn thay đổi về **nội dung**, không chỉ về chỗ ở:

1. Trạng thái nhiệm vụ lên **năm**, thêm `state.infra` và `state.running`.
2. Bốn lỗi lab + một lỗi lesson + `session.window.closed` thành `ErrorEntry` hai nửa. Đáng kể nhất
   là `session.lab.error.submit`: bản trước hiện thẳng chuỗi thô của `describeTrpcError` cạnh nút
   Nộp bài.
3. `session.window.closed` nói ra rằng **chính người dùng** vừa lấy mất chỗ khi mở lại terminal ở
   tab bài học, kèm việc phải làm tiếp.
4. `session.ide.booting-elapsed` để màn chờ đếm được thời gian đã trôi.

**Bảy ô test của `score-summary` đỏ và được sửa đúng cách.** Chúng neo chuỗi cũ có gạch ngang dài.
Chuyển **khẳng định**, không chuyển chuỗi: mỗi ô vẫn gác đúng mệnh đề cũ, và không ô nào bị nới
thành `toContain` để né. Lý do ghi trong chính file test. Cùng kỷ luật cho ô
`session-controls.dom.test.tsx` (`/nhiều khả năng sẽ bị từ chối/` → `/Nếu bị từ chối/`).

**Không có test cũ nào bị xoá mà không có bản thay.** Thứ duy nhất bị xoá là component `TaskTable`
trong `lab-client.tsx`, và nó không có test riêng; khẳng định của nó (bấm một nhiệm vụ mở được đề,
hàng focus được bằng bàn phím) chuyển sang `task-checklist.dom.test.tsx`. `app/lessons/[id]/ide-pane.tsx`
bị xoá sau một lượt grep call-site, và nó **chưa từng có test nào** — nay có 10.

---

## 6. Thứ tôi KHÔNG làm được, và vì sao

### 6.1 AC-7 (bàn phím + axe trên `/labs/:id`, `/lessons/:id`)

Nằm trong `apps/web/e2e/**`, glob của lane 16.I, brief cấm tôi ghi vào đó. Phần sản phẩm mà AC-7 đo
thì đã sẵn: roving tabindex trên thanh tab, `tabIndex={editorVisible ? 0 : -1}` trên thanh kéo, và
nhãn a11y của terminal nêu luôn đường thoát Esc-Esc. **Lưu ý cho 16.I:** hai trang này nay chạy
immersive, nên `ShellHeader` không còn trong DOM và ngân sách Tab của chúng khác hẳn các màn khác.

### 6.2 Nửa "tiến độ dạng cung" của mục 1

Chưa làm, có chủ ý. Cơ chế chạy của cung (`stroke-dashoffset: calc(1 - var(--p))` trên một custom
property chưa đăng ký) nằm trong danh sách **chưa ai đo trên trình duyệt thật** của `phase-16.md`
§16.I.5. Đổi một `ProgressBar` đang chạy đúng và có `role="progressbar"` lấy một cơ chế chưa đo,
trong đúng cái lane mà kỷ luật là "đừng giao thứ chưa đo", là một cuộc đổi sai chiều. Tôi cũng
**không** để lại khoá `session.topbar.*` không có call site: một khoá không ai gọi là một nghĩa
địa. Lý do ghi trong `surfaces/session.ts`.

### 6.3 Lab vẫn chưa có tab Editor — nhưng LÝ DO đã đổi

Rào cản kiến trúc đã gỡ: `IdePane` nay ở `components/session/` nên lab với tới được. Rào cản còn
lại là **nội dung**, và nó có thật: kiểu `Lab` (`packages/shared-types/src/lab.ts`) **không có**
trường `interfaceLayout`, nên không bài lab nào khai được rằng nó muốn IDE.

⛔ **Đừng thay bằng `shouldShowIdePane(profile)`.** `profile` là profile **tài nguyên**
(`''` · `ide` · `k8s`), do `profileForCapabilities` tính từ năng lực; `interfaceLayout` là một
trường nội dung khác hẳn. `ide-layout.ts` đã ghi vì sao phép so đó phải trùng byte với phép so ở
server: nới tay ⇒ iframe trỏ vào một pod không chạy Theia và trắng vĩnh viễn.

Mở IDE cho lab cần một trường trong lược đồ lab cộng một lượt sửa server, tức ngoài phạm vi "chỉ
frontend" của P16.

### 6.4 `session.slots` — khoá hợp đồng yêu cầu mà lane này không nối được

`p16-copy.md` viết sẵn một khoá `Counted` `session.slots` cho khiếm khuyết "lab k8s hiện Còn 0 chỗ".
Call site duy nhất của nó là `components/shell/capacity.ts`, **file của lane 16.B**, mà tôi không
được ghi vào.

Kèm một đính chính: khiếm khuyết đó **đã được vá một nửa** ở chính file ấy — nhánh cạn kiệt in
`Hết chỗ`, không in `Còn 0 chỗ`. Nửa còn thiếu là câu nói ra việc người đọc làm được **ngay bây
giờ**. Đó là việc của 16.B, và tôi không thêm một khoá không ai gọi để trông như đã làm.

### 6.5 `session.tier.*` đã có, call site thì chưa

Ba khoá `session.tier.{sysbox,gvisor,kata}` (kèm dòng `intentionalThree` mà hợp đồng viết sẵn) đã
nằm trong surface theo đúng chỉ dẫn. **Call site hôm nay vẫn là
`components/catalog/catalog-labels.ts` của lane 16.C.** Đây là ba khoá duy nhất trong surface chưa
có nơi gọi, và chúng có mặt vì hợp đồng bảo thế; 16.C cần chuyển sang.

---

## 7. Hai bài học kỹ thuật, ghi ở đây vì chúng vượt ra ngoài lane

### 7.1 `apps/web` thiếu dep `copy` và `motion` (đã lead gỡ)

Phát hiện trước khi viết dòng đầu: `apps/web/package.json` không khai hai gói 16.A vừa dựng, nên
không lane nào import được. Đã báo lead, lead vá trên nhánh nền (`279a7f3`) và tôi gộp một lần.

### 7.2 Hai file cùng tên khác đuôi `.ts`/`.tsx` — chỉ `next build` thấy

`typecheck` exit 0, `eslint` sạch, 242 ô test xanh, rồi `next build` đỏ **12 lỗi** dạng
`Export outcomeKind doesn't exist in target module`. Nguyên nhân: `task-checklist.ts` (thuần) và
`task-checklist.tsx` (view) cùng tên gốc, và **hai bộ phân giải chọn hai file khác nhau** cho cùng
chuỗi `'./task-checklist'` — `tsc` lấy bản `.ts`, Turbopack lấy bản `.tsx`. `workspace-split.ts`
mắc y hệt, chỉ chưa kịp nổ.

Cả hai đã đổi tên (`task-state.ts`, `split-shape.ts`), và bài học ghi **trong mã** chứ không chỉ ở
report này. Repo vốn đã theo quy ước đó (`workspace-tabs.ts` + `workspace-panel.tsx`); lượt này phá
nó ở hai chỗ.

**Hệ quả cho các lane khác:** `pnpm -w turbo run typecheck test` **không** thay được `next build`.
Lane nào tách một module thuần ra khỏi một component nên đặt tên gốc khác hẳn.

---

## 8. Bất biến §1 — không đụng một dòng

Ngăn xếp ba con tĩnh, `terminalRowStyle`, `hidden` trên hàng 1 và thanh kéo, `WorkspaceLayoutProvider`
bọc hàng 2: **không thay đổi nào**. §7 của hợp đồng nói "không có thay đổi nào trong §1–§6", và
lane này giữ đúng thế. Thứ đổi trong `workspace-panel.tsx` là **phần nhìn của thanh kéo** (vùng nắm
`h-2.5`, một tay nắm nhìn thấy được) cộng lượt nối copy, và cả hai đều đi qua cổng AC-1/AC-2/AC-3.

Đa terminal vẫn nằm yên: `single-terminal-contract.test.ts` đi theo sang mã mới nguyên vẹn, kể cả
phần chú thích nói rõ hàng giữa chỉ đỏ ở `typecheck`.
