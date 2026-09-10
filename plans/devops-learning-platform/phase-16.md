# Phase 16 — Dựng lại toàn bộ frontend theo nhận diện PTIT

**Mức chi tiết:** DETAILED · **Effort:** XL · **Blocked by:** không · **Blocks:** không
**SSOT thiết kế:** [`plans/reports/2026-09-10-p16-frontend-rebuild-design.md`](../reports/2026-09-10-p16-frontend-rebuild-design.md)
**Hợp đồng:** [`contracts/p16-tokens.md`](contracts/p16-tokens.md) · [`contracts/p16-copy.md`](contracts/p16-copy.md) · [`contracts/p16-workspace.md`](contracts/p16-workspace.md)

> Chặng này **không brainstorm lại**. Mọi quyết định thiết kế đã chốt trong design doc và trong
> bốn lượt hỏi ngày 2026-09-10. Chỗ nào design đã nói, plan này trỏ tới chứ không chép lại.

---

## 1. Objective

Đập và dựng lại toàn bộ frontend: bố cục, thiết kế, màu, nội dung, văn phong. Bao gồm cả phía
admin và author. Trừ `apps/web/src/components/k8s-arena/**`.

Ba đích đo được:

1. **32 màn hình** đi qua cổng a11y và CSP, 0 lỗi axe mức serious và critical. Hôm nay là 22, và
   bảy màn games/problems đang không có cổng nào.
2. Mọi chuỗi người dùng đọc đi qua `packages/copy`, có test gác luật gạch ngang dài và luật đủ
   dấu tiếng Việt.
3. Terminal giữ nguyên node cha qua mọi lượt đổi tab, có test khẳng định.

---

## 2. Prior-art — cái gì đã có, và tôi đã tìm ở đâu

Phạm vi tìm: `apps/web/src/**`, `packages/{ui,terminal,games,scenario,shared-types}/src/**`,
`content/**`, `apps/web/e2e/**`, `docs/**`, `plans/devops-learning-platform/**`. Bốn agent đọc
song song ngày 2026-09-10.

**Đã có, và tốt, phải giữ dưới dạng yêu cầu của mã mới:**

| Thứ | Ở đâu | Vì sao giữ |
|---|---|---|
| Bất biến terminal không đổi cha | `components/session/workspace-panel.tsx:38` | Vi phạm là mất phiên người học, im lặng |
| Hợp đồng bốn trạng thái + đối chứng dương | `packages/ui/src/design-system.contract.test.tsx` | Cách duy nhất biết hệ thiết kế còn đúng |
| Một landmark `<main>` do vỏ sở hữu | `components/session/landmark-contract.test.ts` | Đang được quét tĩnh |
| Test vắng mặt đa terminal | `components/session/single-terminal-contract.test.ts` | Gác thứ đã bị xoá có chủ ý |
| Be Vietnam Pro, subset `vietnamese`, tự host | `app/layout.tsx:24` | Đã đúng, `font-src 'self'` không chặn |
| Token `--motion-*` + khối `prefers-reduced-motion` | `app/globals.css:235,508` | Đúng cho CSS |
| Thăm dò trước khi gắn iframe IDE | `app/lessons/[id]/ide-pane.tsx` | Sửa 2026-09-07, đúng |
| Tách quyết định hình học khỏi React | `components/session/workspace-tabs.ts` | Hàm thuần thì khẳng định bằng bảng vào/ra |

**Không có, đã tìm và xác nhận rỗng:**

- Tầng i18n hoặc message map: 0 hit cho `i18n`, `useTranslation`, `next-intl`, `react-i18next`
  trên toàn `apps/web/src` và `packages/*/src`.
- Thư mục `apps/web/public/`: **không tồn tại**. Không có favicon, không có OG image, không có
  tài sản thương hiệu nào.
- Chuỗi `PTIT` hoặc `Bưu chính`: 0 hit trên `apps/web/src`, `content/`, `docs/`.
- `framer-motion`, `sonner`: không có trong `apps/web/package.json` lẫn `packages/ui/package.json`.
- Cổng kích thước bundle: không có `@next/bundle-analyzer`, không có `size-limit`. Ghi ở
  `phase-14-exec.md:21`.
- `/games`, `/games/k8s`, `/problems`, `/problems/:code`, `/author/problems*` trong
  `apps/web/e2e/routes.ts`: **vắng mặt**. Nên `a11y.spec.ts` và `csp.spec.ts` không phủ chúng.

---

## 3. Task list

### 16.0 — Ba hợp đồng (TUẦN TỰ, chặn mọi lane)

Không lane nào được spawn trước khi ba file này commit xong. Đây là **declaration hoisting** theo
`rules/contract-first-integration.md`: mọi hình dạng mà hai lane trở lên phải đồng ý được khai ở
đây, không khai trong lane.

| File | Pin cái gì |
|---|---|
| `contracts/p16-tokens.md` | Tên và giá trị token màu/chữ/spacing/motion, bảng contrast, luật hai kênh primary vs destructive, motif cung |
| `contracts/p16-copy.md` | API `packages/copy`, luật giọng văn, các test gác chúng |
| `contracts/p16-workspace.md` | Bất biến terminal, bẫy `hidden`, mô hình hai tab, hợp đồng fit/resize, hợp đồng khoang IDE |

**Vì sao phải tuần tự:** bản đồ sở hữu file **không phát hiện được** lớp lỗi này. L2 và L3 có thể
sở hữu hai tập file rời nhau hoàn toàn mà vẫn cùng chờ một khai báo do L0 viết. Mỗi lane tự
review thì đều xanh, và lệch chỉ lộ ra lúc tích hợp.

**Ô nghiệm thu 16.0:** ba file tồn tại, commit trên nhánh nền, và mỗi file có mục "Ô nghiệm thu"
liệt kê test cụ thể kèm đối chứng dương.

---

### 16.A — L0 nền (TUẦN TỰ, chặn 16.B..16.H)

**Sở hữu:** `packages/ui/**`, `packages/copy/**` (mới), `packages/motion/**` (mới),
`apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/public/**` (mới)

1. `globals.css` viết lại theo `p16-tokens.md`. Sáng và tối đủ cặp.

   **46 token, không phải 24.** Bản brief hợp đồng ban đầu chỉ liệt 24 token ngữ nghĩa và bỏ sót
   22 token mà trang danh mục đang tiêu thụ thật (kiểm 2026-09-10: 44 khai báo trong
   `globals.css`, tức 22 token × hai theme):

   ```
   --difficulty-{basic,intermediate,advanced,expert}(-foreground)   8
   --kind-{pod,config,network,storage,controller,batch,security,cluster}   8
   --status-{done,progress,locked}(-foreground)                     6
   ```

   **L0 sở hữu cả 46.** Không đẩy 22 token này sang L2: chúng nằm trong `globals.css`, mà file đó
   do L0 sở hữu độc quyền. Một lane không thể sở hữu token nằm trong file nó không sở hữu, và
   nếu để L2 tự thêm thì L2 phải ghi vào `globals.css` cùng lúc với L0. Đó đúng là lớp lỗi đè
   file mà worktree sinh ra để chặn.

   `--kind-*` chính là màu nhấn theo loại tài nguyên k8s, nên nó đi cùng bảng icon ở **mục 9**.
   Hai thứ đó phải khớp nhau về tập khoá, và test đối chiếu ở mục 9 phải kiểm cả hai.

2. **`--radius` đổi 0.625rem → 0.75rem.** Đây là quyết định của `p16-tokens.md`, và nó dịch hình
   học của **mọi** component. Ghi ra đây để nó là một lựa chọn có tên, không phải một con số
   trôi vào. Mọi thang bo góc khác suy ra từ nó bằng `calc()`, không khai số cứng ở component.
3. `packages/ui` dựng lại từ file trắng. Danh sách export giữ nguyên tên để 7 lane kia không phải
   đoán: `Button Input Textarea Label Badge Card* Dialog* Tabs* Select* DropdownMenu* Tooltip*
   Switch Checkbox RadioGroup* Alert* Skeleton Spinner Table* CursorPager EmptyState ErrorState
   ProgressBar Separator Kbd cn ThemeProvider useTheme`. Đổi hình, không đổi tên.
4. **Toast:** `npx shadcn add https://goey-toast.vercel.app/r/goey-toaster.json` đưa mã vào repo,
   rồi chỉnh token màu về hệ PTIT. Không cài `goey-toast` qua npm: nó đang ở 0.5.0, và toast nằm
   ở 18 chỗ.
5. **Search:** `gooey-search-tabs@0.2.0`, ghim chính xác, không `^`. Bọc lại thành một component
   của `packages/ui` để 5 trang danh mục không import thẳng gói ngoài.
6. Thêm `framer-motion@13.2.0` và `sonner@2.0.8`.
7. `packages/copy` theo `p16-copy.md`, kèm test gác.
8. `packages/motion`: motif ellipse, cung tiến độ, biến thể framer-motion dùng chung, và **cổng
   reduced-motion mức JS** (`matchMedia`, có `addEventListener('change')`).
9. `packages/ui` thêm bảng icon `ResourceKind` dùng đúng bộ lucide của arena, **cộng một test
   đối chiếu chỉ ĐỌC** `components/k8s-arena/hud/resource-icon.tsx` và khẳng định hai bảng khớp
   trên mọi `ResourceKind`. Không sửa file arena.
10. `apps/web/public/`: logo PTIT (SVG), favicon, OG image. Nguồn:
   `https://ptit.edu.vn/wp-content/uploads/2024/05/logo-ptit-1.svg` (vector thật, đã kiểm 200).
   Commit vào repo vì `img-src 'self' data:` không cho hotlink.

   **⛔ Không sinh ảnh bằng model.** Chốt 2026-09-10. Mọi hình ảnh trong hệ dựng từ SVG, CSS và
   chính cảnh 3D. Không có ảnh raster minh hoạ, kể cả cho trạng thái rỗng và bảy chặng trang chủ.
   OG image cũng dựng bằng SVG.

   Ba lý do, không phải một: dự án không có API key nào (kiểm 2026-09-10, đọc TÊN biến trong
   `.env` và `apps/web/.env`, không đọc giá trị); ảnh sinh ra phải commit vào repo vì
   `img-src 'self' data:` không cho hotlink, tức là gánh thêm dung lượng vĩnh viễn; và một ảnh
   minh hoạ chung chung yếu hơn hẳn motif ellipse trong việc mang nhận diện. Hình học thắng ở cả
   ba mặt.

**Ô nghiệm thu 16.A:**

- Grep màu trần rỗng trên `packages/ui/src`: không `#hex`, không `slate|gray|zinc|neutral-\d+`.
- Test contrast tính lại mọi cặp token, **trộn alpha trong sRGB đã mã hoá gamma**. `docs/design-
  system.md` §1a ghi lại lần trộn nhầm trong linear-light đã chứng nhận cho đúng thứ cần chặn;
  không lặp lại.
- Hợp đồng bốn trạng thái xanh, kèm đối chứng dương.
- Test `packages/copy`: 0 ký tự `—`, 0 chuỗi tiếng Việt mất dấu, kèm đối chứng dương cho cả hai.
- Test đối chiếu icon xanh, và đỏ được khi bảng arena đổi (đối chứng dương).
- `pnpm --filter @devops-platform/ui test` xanh, và **số test chạy phải in ra** — một suite mà mọi
  ca đều `skip` vẫn thoát 0.

---

### 16.B..16.H — Bảy lane song song

Mỗi lane một `git worktree` riêng do lead cấp trước khi spawn. Teammate **không** chạy
`git checkout`, `git switch`, `git branch -f`, `git add .`, `git add -A`, hay `git commit -a`.
Commit bằng dạng pathspec: `git commit -m "..." -- <đường dẫn cụ thể>`.

| Lane | Sở hữu | Effort |
|---|---|---|
| **16.B** vỏ + xác thực | `components/shell/**`, `app/login`, `app/register`, `app/forgot-password`, `app/reset-password` | M |
| **16.C** trang chọn bài | `components/catalog/**`, `app/{lessons,labs,paths,playgrounds,quiz}/page+client`, `app/games/**`, `app/(session)/problems/**` | L |
| **16.D** khoang lab | `components/session/**`, `app/labs/[id]/**`, `app/lessons/[id]/**`, `app/session/[id]/terminal/**` | L |
| **16.E** trang chủ 3D | `components/marketing/**`, `app/page.tsx`, `app/home-cta.tsx` | L |
| **16.F** admin | `app/admin/**`, `components/admin/**` | M |
| **16.G** author | `app/author/**`, `components/author/**` | L |
| **16.H** me + settings | `app/me/**`, `app/settings/**`, `components/me/**` | M |

Bảy lane, chạy đồng thời dưới trần fan-out 8 của depth 0.

#### 16.B — vỏ + xác thực

Vỏ hôm nay là thanh trên `h-14` dính, có drawer trái cho mobile. Giữ hình thái đó, dựng lại.

Bốn trang xác thực tách riêng. `/login` hôm nay gộp cả đăng nhập lẫn đăng ký trong một thẻ 218
dòng; tách ra.

⚠ `/forgot-password` và `/reset-password` **chưa có backend gửi mail**. Đợt này là frontend-only.
Dựng đủ giao diện và trạng thái, nhưng trạng thái thành công **phải nói đúng rằng tính năng chưa
bật**. Một form gửi vào hư không mà hiện "Đã gửi mail, kiểm hộp thư của bạn" là nói dối người
dùng.

Đăng xuất giữ nguyên đường `/api/auth/logout`, **không** đổi sang `authClient.signOut()`: chỉ
route đó thu hồi refresh token (`components/shell/user-menu.tsx`).

#### 16.C — trang chọn bài (ưu tiên cao nhất cùng 16.D)

Đây là nhóm chủ dự án gọi là xấu nhất và lỗi nhất, và cũng đúng là nhóm không có cổng nào.

Năm danh mục dùng chung một bộ component, nên sửa một chỗ là sửa cả năm. Cộng `/games` (toolbar
riêng vì không có backend) và `/problems` (chỗ duy nhất trong toàn ứng dụng hôm nay có ô tìm
kiếm thật).

Thêm `gooey-search-tabs` vào `CatalogToolbar`. Đây **không phải thay thế**: hôm nay
`CatalogToolbar` không có ô tìm kiếm nào, chỉ có chip lọc và một select sắp xếp. Tab của thư viện
ánh xạ sang bộ lọc độ khó và hạng sandbox đang có.

Icon `ResourceKind` lấy từ `packages/ui` (16.A mục 8), không import từ arena.

#### 16.D — khoang lab (an toàn cao nhất)

Đọc `contracts/p16-workspace.md` **trước khi viết dòng đầu tiên**. Bất biến terminal ở đó là
điều kiện sống của lane này.

1. `/labs/[id]` và `/lessons/[id]` vào immersive. Thêm hai tiền tố vào `immersive-routes.ts`.
   Thanh nav toàn cục ăn 56px trên đúng màn hình mà mỗi pixel dọc là một dòng terminal.
2. Chia đôi viết lại, vẫn tự viết, vẫn tách quyết định hình học ra hàm thuần.
3. `IdePane` chuyển từ `app/lessons/[id]/` sang `components/session/`. Lab dùng được editor.
   Việc bài nào bật IDE là quyết định nội dung.
4. Bảng nhiệm vụ thành danh sách kiểm, phân biệt **rõ trên màn hình** giữa "chưa đạt" và "hạ
   tầng lỗi". Tầng dữ liệu đã phân biệt đúng rồi (`lab-client.tsx`, nhánh `kind:'error'` tách
   khỏi `passed:false`); phần nhìn chưa nói ra.
5. Màn hình chờ IDE 45 giây làm lại. Logic thăm dò giữ nguyên.

**Cấm:** hồi sinh đa terminal. Test vắng mặt phải đi theo sang mã mới.

#### 16.E — trang chủ 3D

Bảy chặng theo design §7. Kỹ thuật theo design §7.1 và §7.2:

- **Không dùng `ScrollControls` của drei.** Nó render chữ vào một React root thứ hai tách rời,
  nên chữ trang chủ mất HTML server. Dùng cuộn tài liệu gốc, ghi vào `ref`, `useFrame` đọc
  `ref`, `frameloop="demand"`, gọi `invalidate()` mỗi lượt cuộn.
- **Không dùng `<Text>` của drei.** Nó kéo `troika-worker-utils`, thứ dò worker bằng
  `new Worker(blob:)`, và CSP không có `worker-src`. Dùng nhãn DOM đè lên canvas.
- **Không dùng asset nén Draco / KTX2 / meshopt.** Loader của chúng cần WebAssembly.
- Canvas không được là phần tử LCP. `next/dynamic` với `ssr: false` gọi **bên trong** một
  component `'use client'`.
- Dò WebGL2 phải có `failIfMajorPerformanceCaveat: true`.

#### 16.F — admin · 16.G — author · 16.H — me + settings

Dựng lại theo token và copy mới. `16.G` là lane nặng nhất trong ba: trình soạn 423 dòng cộng 13
file nhóm trường.

Bảng và phân trang giữ cơ chế con trỏ đang có (`lib/cursor-stack.ts`, `CursorPager`) — đó là
logic, không phải phần nhìn.

---

### 16.I — Cổng nghiệm thu (TUẦN TỰ, sau 16.B..16.H)

**Sở hữu:** `apps/web/e2e/**`

1. `SCREENS` lên **32 màn**, `MIN_SCREENS` lên 32. Thêm bảy màn games/problems và ba màn xác thực
   mới.
2. `KEYBOARD_SCREENS` từ 4 lên **≥10**, bắt buộc gồm `/labs/:id` và `/lessons/:id`, và phải
   khẳng định thoát được focus khỏi terminal bằng bàn phím.
3. Ngân sách LCP mới cho `/`, đo trên cụm lab, ghi số đo vào chú thích như `perf.spec.ts` đang
   làm. Cổng hiện tại chỉ đo `/lessons`.
4. `responsive.spec.ts`: **giữ nguyên hình dạng hiện tại**, thêm phủ.

   Suite này không phải một lượt quét mù qua mọi màn. Nó đo **hành vi tại đúng ngưỡng**, kèm đối
   chứng âm ở cả hai phía: nav thu vào ngăn kéo ở 768px và trở lại ngang ở 769px (chính ô này
   phân biệt `min-[769px]:` với `md:`), cảnh báo terminal hiện dưới `TERMINAL_MIN_WIDTH_PX` và
   biến mất đúng tại ngưỡng. Đó là cách đo đúng, mạnh hơn một lượt quét.

   Việc của 16.I là **thêm** một ô quét 32 màn ở 390px khẳng định không tràn ngang, chứ **không**
   thay các ô ngưỡng trên bằng lượt quét đó. Đổi hai ô ngưỡng thành quét là hạ cấp một phép đo
   có đối chứng âm xuống một phép đo không có.

5. **Ba ô chuyển từ 16.A sang đây vì chúng chỉ đo được trong trình duyệt thật** (lane motion báo
   2026-09-10, sau khi thi công xong `packages/motion`).

   | Ô | Vì sao 16.A không đo được | Đo thế nào ở 16.I |
   |---|---|---|
   | AC-7 "ép reduced-motion ⇒ `transition-duration` ra 0.01ms" | Giá trị đến từ khối `@media` trong `globals.css`. `packages/motion` không sở hữu stylesheet nào, chạy vitest ở `environment: 'node'`, không có `react-dom`, và jsdom không phân giải `matchMedia` lẫn `@media` trong cascade. | `emulateMedia({ reducedMotion: 'reduce' })` rồi đọc `getComputedStyle(path).transitionDuration` |
   | §8.3 cung chạy được bằng `calc(1 - var(--p))` | Transition đặt trên `stroke-dashoffset` mà giá trị đến từ một custom property **chưa đăng ký**. Spec nói nó bắn; chưa ai đo trên trình duyệt thật. | Đổi `--p` rồi khẳng định cung **chạy** chứ không **nhảy** |
   | §8.1 khe hở nằm đúng phía | Hình học đúng theo test, nhưng "đúng phía" là phán quyết bằng mắt. | Tâm khe hở phải ở `(61.24, 22.18)` trong `viewBox` 100×100 |

   Hai ô đầu hỏng **im lặng** nếu sai: không lỗi, không log. AC-7 sai thì trang TRÔNG NHƯ đã tuân
   thủ reduced-motion; §8.3 sai thì cung nhảy một nhịp thay vì chạy. Đường lùi cho §8.3 đã sẵn —
   `dashOffsetAt(p)` trả số thô, đặt thẳng vào `strokeDashoffset` thì transition chắc chắn chạy —
   nhưng **không đổi trước khi đo**, vì §8.3 ghi dạng `calc()` là bắt buộc.

---

## 4. Team Layout

| Chặng | Teammate | Agent | model | Worktree | Song song |
|---|---|---|---|---|---|
| 16.0 | 3 người viết hợp đồng | `t1k-docs-manager` | opus | không (chỉ ghi `plans/`) | 3 |
| 16.A | 1 người dựng nền | `t1k-web-ui-developer` | opus | `wt-p16-l0` | 1 |
| 16.B..16.H | 7 người dựng lane | `t1k-web-core-developer` (16.E: `t1k-web-ui-developer`) | opus | `wt-p16-{b..h}` | 7 |
| 16.I | 1 người dựng cổng | `t1k-web-testing-tester` | opus | `wt-p16-i` | 1 |

Mọi teammate pin `model: opus` theo `.claude/rules/subagent-model-opus.md`, và truyền
`model: "opus"` ở tham số spawn vì frontmatter không áp cho phiên đang chạy nếu registry đã chốt
trước lúc sửa.

**Brief bắt buộc có, cho mọi lane:** đường dẫn ba hợp đồng (không chép nội dung), danh mục sở hữu
file theo tên, luật commit pathspec, và câu "báo cáo bằng `SendMessage` tới lead" — văn bản cuối
của một background sub-agent **không** tới được người spawn.

---

## 5. Risk Assessment

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Mất bất biến terminal khi viết lại khoang lab | 4 | 5 | **20** | Test bất biến viết TRƯỚC khi dựng lại. `contracts/p16-workspace.md` là điều kiện vào lane 16.D. Hỏng kiểu này im lặng và người học là người phát hiện. |
| 149 test bị xoá cùng mã cũ, không ai thay | 4 | 4 | **16** | Chuyển **khẳng định**, không chuyển mã. Mỗi lane phải chỉ ra test tương đương trước khi xoá bản cũ. 16.I đối chiếu tổng số test trước và sau. |
| Hai lane cùng ghi một file ngoài danh mục sở hữu | 3 | 5 | **15** | Một worktree mỗi lane. Cấm `git add .`/`-A`/`commit -a`. File không thuộc lane nào (`globals.css`, `packages/ui/src/index.ts`, `e2e/routes.ts`) do 16.A và 16.I sở hữu độc quyền, ghi tên trong brief. |
| Cảnh 3D bỏ qua reduced-motion vì chỉ dựa vào CSS | 3 | 4 | 12 | Cổng mức JS. Khối `@media` phổ quát **không thể** dừng `requestAnimationFrame`. |
| `<Text>` của drei bắn `securitypolicyviolation` | 3 | 3 | 9 | Cấm dùng, thay bằng nhãn DOM. Tái hiện bằng bộ thu của `csp.spec.ts` trước khi tin cả hai chiều. |
| Sửa quiz/lộ trình mà quên seed lại | 3 | 3 | 9 | `scripts/seed-content.mjs` phải chạy sau khi sửa `content/*.json`. Sửa mà không seed thì không có gì đổi và **không có lỗi nào**. |
| Trang reset mật khẩu trông như chạy được | 2 | 4 | 8 | Trạng thái thành công nói đúng rằng tính năng chưa bật. |
| Gói 0.x đổi API | 2 | 3 | 6 | Vendor `goey-toast` vào repo; ghim chính xác `gooey-search-tabs`. |
| Phiên song song của chủ dự án đè file | 1 | 5 | 5 | Phiên kia ở `components/k8s-arena/**`. Không lane nào ghi vào đó. Điểm tiếp xúc duy nhất là test đối chiếu icon, và nó chỉ đọc. |

Ba dòng ≥15 phải có mitigation xong trước khi lane tương ứng bắt đầu.

---

## 6. Timeline

| Chặng | Effort | Ghi chú |
|---|---|---|
| 16.0 hợp đồng | S (1d) | Tuần tự. Chặn tất cả. |
| 16.A nền | L (1wk) | Tuần tự. Chặn 7 lane. |
| 16.B vỏ + xác thực | M (3d) | song song |
| 16.C trang chọn bài | L (1wk) | song song · ưu tiên cao |
| 16.D khoang lab | L (1wk) | song song · ưu tiên cao · rủi ro cao nhất |
| 16.E trang chủ 3D | L (1wk) | song song |
| 16.F admin | M (3d) | song song |
| 16.G author | L (1wk) | song song · lane nặng nhất trong ba lane quản trị |
| 16.H me + settings | M (3d) | song song |
| 16.I cổng | M (3d) | Tuần tự, sau tất cả. |
| **Tổng** | **~3,5 tuần** | Đường găng: 16.0 → 16.A → max(16.C, 16.D, 16.E, 16.G) → 16.I |

Nếu chạy tuần tự thì cùng khối lượng đó là khoảng 8 tuần. Phần tiết kiệm nằm ở bảy lane chạy
cùng lúc, và nó chỉ có thật nếu ba hợp đồng ở 16.0 đủ chặt để bảy lane không phải hỏi nhau.

---

## 7. Ô nghiệm thu toàn chặng

1. `SCREENS` phủ 32 màn, `MIN_SCREENS` = 32, 0 lỗi axe serious/critical trên mọi màn.
2. `csp.spec.ts` xanh trên 32 màn, **không nới một chỉ thị CSP nào**.
3. `KEYBOARD_SCREENS` ≥ 10, gồm `/labs/:id` và `/lessons/:id`, có ca thoát focus khỏi terminal.
4. Grep màu trần rỗng trên `apps/web/src` và `packages/ui/src`. Ngoại lệ duy nhất:
   `packages/terminal/src/**/themes.ts`.
5. Test contrast tính lại mọi token PTIT, trộn alpha trong sRGB mã hoá gamma.
6. `packages/copy`: 0 ký tự `—`, 0 chuỗi mất dấu. Cùng phép kiểm mất dấu chạy trên `content/**`.
7. Hợp đồng bốn trạng thái xanh, kèm đối chứng dương.
8. Test bất biến terminal: cùng node cha qua đổi tab; hàng editor vắng mặt vẫn render kèm
   `hidden` và **không** mang tiện ích `display`.
9. Test đối chiếu icon `ResourceKind` giữa `packages/ui` và arena, xanh.
10. Ngân sách LCP mới cho `/`, có số đo thật trong chú thích.
11. `pnpm -w turbo run build lint typecheck test` xanh. **Đọc dòng `Tasks: X/Y` trước khi trích
    bất kỳ con số test nào** — turbo dừng sau task đỏ, nên các suite phía sau **chưa chạy**, và
    một báo cáo trích số từ lượt đó là báo cáo về một suite không tồn tại.

---

## 8. Ngoài phạm vi, nói rõ để không ai tưởng đã làm

- **Ba lỗi lab của `phase-15.md`**: setup hỏng ăn mất khe quota, thông báo lỗi chỉ có mã thoát,
  setup timeout ở load ~43. Chủ dự án chốt đợt này chỉ frontend. Sau P16, lab sẽ đẹp và **vẫn**
  báo "Còn 0 chỗ" một tiếng sau năm lượt setup hỏng.
- **Backend gửi mail đặt lại mật khẩu.** Giao diện có, đường nối chưa.
- **`components/k8s-arena/**` và `packages/games/**`.** Không đụng.
- **Cổng kích thước bundle.** Vẫn không có. Ô AC "không kéo xterm.js vào trang không có
  terminal" của `phase-14-exec.md` vẫn không có phép đo nào.
