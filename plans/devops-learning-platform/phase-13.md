# Phase 13 — Frontend: hệ thiết kế và toàn bộ màn hình

**Mức chi tiết:** DETAILED · **Effort:** XL · **Blocks:** P14 · **Blocked by:** P5–P12 (ràng buộc của chủ dự án: **chỉ làm FE khi BE/orchestrator/Theia/terminal/sandbox/pod đã xong**)

> Tới đây backend đã có: engine phiên, terminal, chấm bài, IDE, K8s-in-pod, lab + điểm, soạn bài, lộ trình + quiz, và một trần quy mô **đã đo**. FE hiện tại là **giàn giáo của kỹ sư backend**: 6 route, 7 component, đủ để chứng minh engine chạy — không đủ để ai đó ngồi học ba tiếng.

## Objective

Một sản phẩm dùng được: người lạ vào, đăng nhập, tìm bài, học, làm lab, làm quiz, theo lộ trình, xem tiến độ — và người soạn bài làm việc được trên UI. Ngang KillerCoda + KodeKloud **về trải nghiệm học**, không dựng phần thương mại của họ.

## Điều đã có, đừng dựng lại

| Có sẵn | Ở đâu |
|---|---|
| `Button`, `Card`, `Input`, `ContentView`, `SplitPane`, `StepNav`, `ProgressBar` | `packages/ui/src` |
| Terminal xterm.js WebGL + Nerd Font + fallback DOM + StrictMode-safe | `packages/terminal` |
| Máy trạng thái phiên (backoff, jitter, phân biệt rớt-mạng ↔ phiên-chết, `ENDED`) | `packages/terminal/src/session-machine.ts` |
| Trang bài học split-pane, StepNav, ProgressBar, cảnh báo năng lực, panel kết quả chấm | `apps/web/src/app/lessons/[id]/**` |
| Trang phiên độc lập, đăng nhập, dashboard tối thiểu | `apps/web/src/app/{(session),login,dashboard}` |

⛔ **`session-machine.ts` là tài sản, không phải nợ.** Nó mang ba thứ đã trả giá đắt để tìm ra (1.F, 3.H). Trang mới nối WS phải **dùng lại nó**, không viết máy trạng thái thứ hai.

## Task list

### 13.A — Hệ thiết kế trước, màn hình sau

1. Design token (màu, thang chữ, khoảng cách, bo góc, bóng, motion) thành biến CSS + cấu hình Tailwind. **Một** nguồn, không rải giá trị trong JSX.
2. **Dark mode ngay từ token**, không bọc sau. Người học nhìn terminal tối cạnh nội dung sáng cả buổi là một quyết định thiết kế tồi.
3. Mở rộng `packages/ui` theo shadcn/ui: Dialog, Tabs, Select, Toast, Tooltip, Badge, Skeleton, Table, Pagination, EmptyState, ErrorState.
4. Mỗi component: trạng thái **loading / empty / error / disabled** là bắt buộc, không phải "làm sau". Ba trạng thái này là chỗ sản phẩm thật khác demo.
5. Kiểu chữ: tiếng Việt **phải** dùng font phủ đủ dấu (Be Vietnam Pro / Noto Sans). ⛔ Không Poppins — thiếu dấu tiếng Việt.

### 13.B — Vỏ ứng dụng

6. App shell: điều hướng chính (Bài học · Lab · Playground · Lộ trình · Của tôi), thanh trạng thái phiên, menu người dùng.
7. **Chỉ báo sức chứa:** "còn N chỗ sandbox" lấy từ trần đã đo ở P12. Người dùng gặp 429 mà không được báo trước là một lỗi thiết kế, không phải một giới hạn hạ tầng.
8. Responsive: ≥1280px là mục tiêu chính (học DevOps cần màn rộng); ≤768px **hạ cấp có chủ ý** — đọc nội dung được, terminal hiện cảnh báo "cần màn hình lớn hơn" thay vì vỡ.

### 13.C — Danh mục và tìm kiếm

9. `/lessons`, `/labs`, `/playgrounds`, `/paths`: lọc theo difficulty / capability / tier, sắp xếp, phân trang **cursor** (đã có ở BE, cap 100 — luật 4).
10. ⚠ Nợ P2 còn treo: `lessons.list` **nạp cả catalog vào bộ nhớ rồi mới cắt trang** (ghi trong `lessons-client.tsx`). Với nguồn DB của P9 thì đó là một `SELECT` thật — sửa ở BE trong phase này, đừng để FE che.
11. Trạng thái rỗng có ích: chưa có lab nào ⇒ nói cách tạo (nếu là author) hoặc gợi ý bài khác, không phải một ô trắng.

### 13.D — Trình học: lesson · lab · quiz · playground

12. **Lesson**: giữ split-pane, thêm layout `ide` của P6 (nội dung | editor | terminal), tỉ lệ pane nhớ trong `localStorage`.
13. **Lab**: bảng task bên cạnh terminal, chấm từng task, trạng thái từng task, điểm tổng tính lúc hiển thị. ⚠ Nhãn phải nói đúng thứ ta biết — bẫy `"4/4 bước"` của P2 lặp lại y hệt ở đây nếu ẩu.
14. **Quiz**: một câu một màn hoặc danh sách, chấm sau khi nộp, hiện giải thích. Đáp án **không có trong payload** (P10 đã chặn ở tầng type — FE không được vô hiệu hoá điều đó).
15. **Playground**: sandbox trống, hiện TTL rõ **trước khi** bắt đầu.
16. Bốn trình này chia chung khung phiên: nút Bắt đầu / Kết thúc / Thêm giờ, đồng hồ TTL, cảnh báo `hardCap`, và câu thông báo lý do phiên chết.

### 13.E — Của tôi, hồ sơ, và tiến độ

17. `/me`: đang học, phiên đang mở (kết thúc được từ đây), lịch sử lab/quiz, tiến độ theo lộ trình.
18. Hồ sơ: đổi mật khẩu, chọn shell mặc định (bash/zsh/pwsh — image đã hỗ trợ), theme terminal, bật/tắt hiện tên trên bảng xếp hạng.
19. Mọi con số tiến độ **tính lúc đọc** (P8/P10 đã cấm lưu derived — FE không được lưu cache riêng rồi khẳng định).

### 13.F — Trang soạn bài (giao diện cho P9)

20. Danh sách bài của tôi theo trạng thái; tạo mới; sửa; xem trước; xuất bản; lưu trữ.
21. Soạn nội dung dùng lại editor của P6. Xem trước **render đúng như trình học** — hai bộ render khác nhau là hai bộ sẽ trôi.
22. Xuất bản hiện kết quả **chạy thử thật** của P9 (setup + verify từng bước), không chỉ một dấu tích.

### 13.G — Quản trị

23. `/admin` (chỉ `admin`): người dùng + vai trò, phiên đang chạy (kết thúc được), nội dung, và một bảng sức khoẻ đọc từ metric đã có (pool, claim, reap, exec).
24. Mọi hành động quản trị ghi audit. Bảng `sessions_audit` đã có; hành động lên user thì cần đường ghi tương ứng.

### 13.H — Chất lượng: đo được, không cảm tính

25. **A11y**: bàn phím đi hết mọi luồng chính; focus thấy được; landmark + heading đúng; contrast AA. Chạy axe trên **mọi** route, 0 lỗi mức serious/critical.
26. ⚠ Terminal là chỗ a11y khó nhất: xterm.js cần `role`/aria phù hợp và một đường thoát khỏi bẫy focus (Esc). Không bỏ qua bằng lý do "terminal thì khác".
27. **Test**: Playwright cho 6 luồng chính (đăng nhập → chọn bài → học → chấm → kết thúc; lab; quiz; lộ trình; soạn bài; quản trị). Chạy trên cụm thật, cùng khuôn e2e của 2.D.
28. CSP: mọi trang mới không sinh vi phạm. ⚠ Vi phạm CSP báo **bất đồng bộ**, không ném ở constructor — "0 lỗi" phải có đối chứng dương (`zero-violation-needs-negative-control`).
29. Hiệu năng: LCP ≤ 2.5s trên trang danh mục ở cấu hình lab; trang bài học không chặn render vì chờ WS.

## File / dir ownership

`packages/ui/src/**` · `apps/web/src/app/**` · `apps/web/src/lib/**` · `apps/web/tailwind.config.*`, `globals.css` · `apps/web/e2e/**` · `apps/web/src/server/trpc/routers/*` (chỉ phần sửa phân trang 13.C) · `docs/design-system.md`

## Dependencies

- **Blocked by:** P5–P12 — ràng buộc rõ ràng của chủ dự án. Riêng 13.A (token + component) **không** phụ thuộc backend và có thể bắt đầu sớm nếu cần chồng lấn.
- **Blocks:** P14.

## Acceptance criteria

- [x] Token là **một** nguồn; grep không thấy mã màu hardcode trong JSX. — lệnh lọc rỗng, **có đối chứng dương** (bơm `bg-slate-700` giả ⇒ kêu). Lệnh trong § Verify commands cũ không thể rỗng vì khớp chú thích + chuỗi test.
- [x] Dark mode: vỏ trang ĐẠT cả hai chiều trên cụm (`lab(100 0 0)` ↔ `lab(2.72357 …)`). Canvas xterm đo được 2026-09-08 bằng pixel (DOM không đọc được canvas, và `toDataURL` trên WebGL không có `preserveDrawingBuffer` trả ảnh trong suốt nên KHÔNG dùng): **đối chứng cùng-theme 0.000 sai lệch / 0.00% pixel khác**, khác theme **210.6 / 96.02%**, chiều về (tối→sáng→tối) 0.149. Quy kết vào canvas chứ không phải nền CSS bằng pixel CHỮ: rất-sáng 0.65% → rất-tối 4.60%, mà nền thuần CSS không thể đảo màu chữ. Editor của Theia mang theme RIÊNG, độc lập với dark mode của app — nói ra chứ không tích. [đo 2026-09-08](reports/harness/2026-09-08-ac-browser/run.md).
- [x] Mọi component mới có đủ 4 trạng thái — `design-system.contract.test.tsx` gác HAI chiều (mọi export có dòng · không dòng nào trỏ tới component đã xoá · không ô trống · danh sách miễn trừ có đối ứng).
- [x] Font phủ đủ dấu tiếng Việt — đo trên cụm: `fonts.check('32px "Be Vietnam Pro"', 'Đặng Kiều Nữ ạ ã ơ ư ợ ữ ẫ ặ')` → true, và **0/18** ký tự có dấu rơi về bề rộng fallback.
- [x] **4/4** trình học end-to-end trên cụm thật, qua luồng `@flow`. Ô “3/4” đóng lại 2026-09-08 bằng **luồng 7 — sân chơi** (`e2e/flows/playground.flow.spec.ts`) trên `web:p13d` · `gateway:p13e` · `orchestrator:p13`: `expected 1, skipped 0, unexpected 0, flaky 0`, 0 annotation. Con số đọc từ `results.json` của CHÍNH lượt đó — bẫy đã dính một lần trong phiên: `--reporter=list` trên CLI **ghi đè** reporter json của config nên lượt chạy không ghi file nào, và bản 3 tiếng trước còn nằm trên đĩa đọc ra y hệt (`35 passed/17 skipped` của lượt khác).
  Playground là trình học DUY NHẤT bị 13.D mục 15 buộc **hiện TTL trước khi bấm “Bắt đầu”**, và luồng đo đúng vế đó ở HAI chỗ TRƯỚC cú bấm — thẻ danh mục (“Tự đóng sau 30 phút”) và badge (“Phiên kéo dài 30 phút”) — với con số lấy từ `playgrounds.get` cho ĐÚNG id vừa bấm, không gõ cứng (`sortPage` sắp lại ở client nên `firstItemId` có thể là mục khác với thẻ đầu tiên). Rồi: `playgrounds.start` **HTTP 200** đọc từ mã trạng thái chứ không đoán qua DOM → khoang terminal hiện → **byte PTY chảy về** → gõ `echo DLP''E2E-OK` và **`DLPE2E-OK` quay lại qua dây** (tiếng vọng phím mang hai dấu nháy, nên chuỗi này chỉ xuất hiện khi shell THỰC SỰ chạy lệnh) → `session.reap` mang ĐÚNG `sessionId` mà chính luồng vừa tạo → UI nói **“Bạn đã kết thúc phiên…”** và pha về “Chưa có phiên”, KHÔNG phải “Mất kết nối — đang thử lại…”.
  **Đối chứng, và có ĐỘT BIẾN THẬT trên hành vi sản phẩm.** Trong cùng lượt: chưa bấm thì `dlp-terminal` phải có **0** phần tử; phiên mở thì badge TTL nội dung phải **biến mất** (nó chỉ vẽ khi `!hasSession`) rồi **quay lại** sau khi kết thúc — nên một badge vẽ vô điều kiện làm ô này ĐỎ thay vì lặng lẽ xanh mãi. Ngoài lượt, hai đột biến đã chạy THẬT vào đúng hai ô đáng giá nhất. Cụm đang chạy ảnh `p13d` nên sửa mã nguồn cục bộ KHÔNG tới được đích — đột biến vì thế làm bằng cách can thiệp đúng thứ trang thật sự nhận: **(M1)** ép `playgrounds.get` trả `ttlSeconds: 0` ⇒ **ĐỎ ngay ở ô “TTL trước khi bấm Bắt đầu”** (`Phiên kéo dài 30 phút` không tìm thấy), và chưa dựng sandbox nào; **(M2)** ép `session.reap` trả 500 để client không dispatch `ENDED` ⇒ **ĐỎ đúng ở ô “UI nói lý do”** (`Bạn đã kết thúc phiên` không tìm thấy). Kèm một probe trong cùng lượt M2: chèn đúng nhãn `Mất kết nối — đang thử lại…` vào DOM và locator BẮT ĐƯỢC nó, nên vế `toBeHidden` không phải một ô rỗng vì gõ sai chuỗi.
  ⚠ Lượt M1 ĐẦU TIÊN xanh, và đó là **đột biến hỏng chứ không phải gate mù**: `\d+` viết qua shell bị nuốt backslash thành `d+`, regex không khớp gì, dữ liệu chưa hề bị đổi. Một đột biến không áp dụng đọc y HỆT một gate không gác gì — nên bản M1 sau mang một cổng tự kiểm, ném lỗi khi thân phản hồi không đổi. Ghi lại vì đây là đường ngắn nhất để kết luận NGƯỢC DẤU.
  Đối chứng phía harness (yếu hơn, giữ cho đủ): TTL kỳ vọng +1 phút ⇒ đỏ ở thẻ danh mục; `MARKER_OUT` đổi thành chuỗi không bao giờ về ⇒ đỏ đúng ở ô terminal sau khi mọi bước trước đã xanh. Bản đem commit `diff` **byte-identical** với bản đã chạy xanh, và chạy xanh lại sau khi khôi phục.
  Không rò khe quota: `dlp-sandbox` trước và sau đều `pods 3/28, requests.memory 768Mi/5952Mi`, kể cả sau lượt bơm lỗi — khối `finally` bấm lại ĐÚNG nút “Kết thúc phiên” của trang, không `kubectl delete pod`.
  ⚠ Hai điều CHƯA đo ở lượt này: ba luồng kia (lesson · lab · quiz) **không chạy lại**, chúng vẫn dựa vào lượt 2026-09-07; và số luồng `@flow` nay là **7**, nên ô “Playwright 6/6” bên dưới đã cũ.
- [x] Layout `ide` theo cờ `interfaceLayout` — ĐO HAI CHIỀU trên cụm (`p13d`). Cần dựng bài `dlp-ide-config-edit` trước, vì tới hôm nay KHÔNG nội dung nào khai cờ này: một tính năng không ai dùng thì không ai biết nó hỏng. **Client:** bài IDE render 2 separator + khoang editor; bài thường render 1 separator, 0 khoang. **Server:** pod của phiên IDE xin `768Mi` (profile `ide`) trong khi warm pool là `256Mi` — tức `profileForCapabilities` cũng đọc đúng cờ, không chỉ FE. **Và Theia chạy thật**: console mang log của chính nó, workbench + Monaco mở được.
  ⚠ Phép đo đầu tiên làm LỘ một lỗi khiến IDE hỏng ở gần như MỌI lần mở: `IdePane` gắn iframe ở t+8s trong khi Theia bind cổng ở ~t+20s, rồi thân 503 vẫn bắn `load` nên nó tưởng đã xong và để lại một khối JSON thô. Log gateway có đúng MỘT dòng `connection refused` rồi im. Đã vá (thăm dò mã trạng thái rồi mới gắn) và nghiệm lại: nạp được ở lần đầu.
- [x] "Còn N chỗ" — **VÁ XONG VÀ ĐÃ ĐO TRÊN CỤM (2026-09-08, ảnh `p14a`)**. `capacity.get` trả `quotaReadable:true` và bốn trần theo profile: mặc định **20/23** · **`ide` 6/7** · `k8s` 5/5 · `k8s-multinode` 3/3 — tức bài IDE và bài thường cho HAI con số khác nhau trên CÙNG một trạng thái quota, đúng điều công thức cũ không thể làm. Kiểm chéo bằng số học trên quota sống (`hard 5952Mi`, `used 768Mi`): ide `(5952−768)/768 = 6.75 → 6`; mặc định `(5952−768)/256 = 20.25 → 20`, chặn thêm bởi `pods 28−3 = 25`. Khớp từng con số. ⚠ Cảnh **`ide` = 0 trong khi mặc định > 0** chưa được dựng trực tiếp (phải mở 6 phiên IDE trên cụm dùng chung); nó được phủ bằng ca tái hiện trong `session-controls.dom.test.tsx` (payload quota còn 576Mi ⇒ ide "Hết chỗ", mặc định 2, và chuỗi `14` không xuất hiện ở bất kỳ profile nào). Lỗi gốc: Lỗi gốc: ngày 2026-09-07 giao diện in **"Đang chạy 6/20 phiên (trần cứng 23)" → "Còn 14 chỗ"** ngay lúc `lessons.startSession` trả **429**. Không mâu thuẫn — hai bên đếm hai thứ khác nhau. `CAPACITY_HARD_LIMIT=23` **đúng bằng** `requests.memory 5952Mi ÷ 256Mi`, tức hằng số đó mã hoá giả định "mọi phiên đều là profile mặc định"; lúc bị từ chối quota ở `5376/5952Mi` — còn 576Mi, không đủ 768Mi cho một pod `ide`. Một **derived field bị lưu** (`quota ÷ profile`), và nó CÓ TỪ TRƯỚC bài IDE (`dlp-k8s-basics` đã xin 1Gi).
  **Đã làm** (`5135cf9` Go/proto/RBAC, `808093c` FE): `GetCapacity` đọc ResourceQuota **+ LimitRange** ngay lúc gọi và tính trần cho từng profile tại chỗ — không env mới, không cache. Trần là `min` qua **CẢ NĂM** đại lượng quota gác (`pods` · `requests.cpu` · `requests.memory` · `limits.cpu` · `limits.memory`), không chỉ RAM: cụm gác `pods: 28` trong khi RAM chỉ đủ 23, nên trên một cụm nhiều RAM ít pod thì vế kia mới chặn. Proto thêm `quota_readable` · `quota_error` · `profile_capacity` (chỉ THÊM field). Role sandbox thêm `resourcequotas` + `limitranges` — thiếu hai dòng đó hỏng ở RUNTIME chứ không ở compile. Quota đọc lỗi ⇒ FE nói **"Chưa rõ sức chứa"**, tuyệt đối không rơi về `soft_capacity`.
  **Bằng chứng**: quota thật đọc từ cụm 2026-09-08 (hard `pods 28 · 5850m · 5952Mi · 48 · 24Gi`, used `pods 3 · 750m · 768Mi · 6 · 3Gi`) ⇒ trần theo profile mặc định 20/23 · ide 6/7 · k8s 5/5 · multinode 3/3, có test trên đúng bộ số đó. Ca biên có test: quota vừa đủ 1 pod · thiếu đúng 1 byte · quota đọc lỗi · profile không khai · thiếu LimitRange · `remaining` âm · CPU phải đọc milli. **Đối chứng dương đã CHẠY, không chỉ khẳng định**: đột biến (a) đưa `fillProfileCapacity` về công thức cũ và (b) bỏ `pods` khỏi `quotaKeys` làm 5 ô ĐỎ, rồi khôi phục và xanh lại. `go test ./...` 6 package ok với test lifecycle CHẠY THẬT trên Redis (`REDIS_URL`), không skip; `pnpm --filter web typecheck` xanh; `vitest run src/components` 568/568.
  **CÒN LẠI, chưa đóng**: (1) **chưa deploy lên cụm** nên chưa có phép đo end-to-end "mở bài IDE lúc quota gần cạn ⇒ giao diện nói 0 chứ không nói 14" — lead làm ở bước cuối, và nó cần `helm upgrade` để RBAC mới có hiệu lực; ~~(2) ba màn còn đọc công thức cũ~~ — **ĐÓNG 2026-09-08**: `session-controls.tsx` nay nhận prop `profile` và gọi `describeCapacity(view, profile)`, `app/admin/overview-client.tsx` + `components/me/active-sessions.tsx` chuyển sang `describeProfileCapacity`. Profile của bài do **Server Component** `app/lessons/[id]/page.tsx` giải bằng chính `profileForCapabilities` (KHÔNG chép bảng ánh xạ sang FE — một bản chép là hai bảng sẽ trôi khỏi nhau). Ba trạng thái thay cho hai: chưa có payload ⇒ không vẽ gì · quota đọc lỗi ⇒ **"Chưa rõ sức chứa"** kèm lý do, ⛔ tuyệt đối không rơi về `softCapacity` · đọc được ⇒ số của ĐÚNG profile. Nút Bắt đầu vẫn bấm được ở mọi nhánh (`slots_free` là cận dưới — không cộng pod đang ấm — nên "0 chỗ" không chứng minh sẽ bị từ chối), và câu cảnh báo nói ra cả hai chiều. Bằng chứng: `pnpm --filter web test` **108 file / 1241 ô xanh** (trước: 107/1232), `typecheck` xanh; ca tái dựng đúng payload 2026-09-07 (quota còn 576Mi) cho `ide` ⇒ 0 chỗ trong khi profile mặc định ⇒ 2, và chuỗi `14` không xuất hiện ở bất kỳ profile nào; **ba đột biến ĐÃ CHẠY THẬT** rồi khôi phục — (A) bỏ qua tham số `profile` ⇒ 16/25 ĐỎ, (B) nhánh "chưa rõ" rơi về `describeCapacity` cũ ⇒ 4/25 ĐỎ, (C) call-site `SessionControls` quên truyền `profile` ⇒ ô DOM "bài IDE ⇒ Hết chỗ" ĐỎ. ⚠ CHƯA đóng trong mục này: `app/labs/**` và `app/playgrounds/**` ngoài sở hữu nên vẫn dùng profile mặc định (nhãn ở đó tự thu hẹp về "cho bài thường", không hứa sai); và `describeCapacity` của vỏ nay KHÔNG còn call-site sản phẩm nào — mã chết, chỉ còn test của chính nó; (3) `hard_capacity` (env) và `profile_capacity[""].slots_total` (tính từ quota) nay trả lời cùng một câu hỏi từ hai nguồn — env là nguồn thừa, ghi nợ trong proto.
- [x] `lessons.list` phân trang ở tầng nguồn — client dùng `useQuery` + cursor (KHÔNG `useInfiniteQuery`), router gọi `listPage()`, `db-source` đẩy `WHERE id > cursor … LIMIT n+1` xuống Postgres, và `repository-page-sql.integration.test.ts` chạy trên Postgres thật.
- [x] Đáp án quiz không có trong payload — `isCorrect?: never` / `explanation?: never` là rào COMPILE, và pentest luật 1 + 3 (IDOR, strict input) SAFE với đối chứng dương ĐỎ trên cụm.
- [x] axe **25/25 xanh**, 0 lỗi serious/critical trên 22 màn + đối chứng; `keyboard` **25/25**, gồm ba ô D10 Esc-Esc rời terminal (cần phiên sandbox THẬT, chạy với `E2E_REQUIRE_SESSION=1`).
- [x] Playwright **7/7 luồng xanh** trên cụm thật. ⚠ Con số này ĐỔI 2026-09-08: luồng thứ bảy (sân chơi) được thêm để đóng ô 3/4 ở trên, nên `--grep @flow --list` nay ra `7 tests in 7 files`. Sáu luồng đầu đo 2026-09-07 và **không chạy lại** ở lượt thêm luồng 7 — ô này là hợp của hai lượt đo, không phải một lượt bảy luồng. Đúng MỘT annotation `chua-do` (D15) — và D15 đã được đo TAY riêng.
- [x] CSP **27/27 xanh**, 0 vi phạm. Ba đối chứng dương (inline script · ảnh khác origin · iframe khác origin) nằm TRONG cùng lượt 27 đó. Trước bản vá: 9 ô đỏ, cả 9 là phép dò JIT của Zod.
- [x] Responsive ≤768px — **7/7 xanh** trên cụm (`responsive.spec.ts`), và nửa "terminal hạ cấp" vốn là MÃ CHẾT cho tới lượt này: `NarrowScreenNotice` không có một call-site nào, `TerminalPane` chưa bao giờ đọc bề rộng khung nhìn. Đã nối, rồi mới đo. Mỗi khẳng định-hẹp có đối chứng âm ở cùng route cùng lượt: 375·768 thu nav ↔ **769 nav ngang trở lại**; 1023 hiện cảnh báo ↔ **1024 cảnh báo biến mất**; 1280 đủ nav + khoang terminal. Đo ĐÚNG biên vì một cặp 375/1280 sẽ xanh cả với `md:` (min-width 768) — chính cái lệch một pixel mà `breakpoints.ts` dựng chú thích để tránh.
- [x] **Không** màn hình/route/chuỗi nào liên quan giá, gói cước, thanh toán. Chạy lại 2026-09-07 sau khi thêm bài `dlp-ide-config-edit`: `node scripts/check-no-commerce.mjs` exit 0 — đối chứng dương bắt đủ **18/18** mẫu vi phạm (gồm 4 dòng từng LỌT lệnh grep cũ) và không kêu trên 31 mẫu sạch, rồi quét 491 file trong 8 vùng. Cổng không thể xanh trong tình trạng chính nó đã hỏng. Chứng bằng BA lớp, không chỉ một lệnh grep: (1) lệnh grep ở § Verify commands — **đã sửa 2026-09-06**, bản cũ không thể rỗng nên không chứng được gì; (2) test tiếng Việt trên chuỗi UI (`components/shell/{nav,capacity}.test.ts`) vì grep tiếng Anh không thấy nhãn giá viết bằng tiếng Việt; (3) test khẳng định mọi procedure TỪ CHỐI field thanh toán (`quiz-paths-input.test.ts`) và schema không có cột `price`/`sku`/`entitlement`.

## Verify commands

```bash
pnpm --filter web build && pnpm --filter web test
pnpm --filter web exec playwright test --grep @flow
npx @axe-core/cli https://dlp.<ip>.sslip.io/lessons --exit
# Không màn hình/chuỗi nào về giá, gói cước, thanh toán (AC cuối 13.H).
#
# ⚠ Lệnh cũ `grep -rniE 'price|pricing|checkout|subscribe|billing' apps/web/src`
# KHÔNG BAO GIỜ RỖNG ĐƯỢC, kể cả trên cây hoàn toàn sạch — đo 2026-09-06, nó trả
# 15 dòng: `checkout` khớp trong `CheckOutcome`/`checkOutcomes` (kiểu KẾT QUẢ CHẤM
# BÀI của P2), `subscribe` khớp callback `useSyncExternalStore` của React trong
# `packages/ui/src/toast.tsx`, còn `price`/`billing` khớp chính những chú thích và
# test dựng ra để CẤM thương mại. Một ô AC mà phép kiểm không thể xanh thì hoặc bị
# bỏ qua, hoặc làm người đọc hoảng vì tưởng đã lỡ dựng phần bán khoá học.
#
# Bản dưới: bắt rộng (không dùng `` — biên từ không nhận ra `MONTHLY_PRICE_VND`
# vì `_` cũng là ký tự từ), rồi TRỪ đúng ba nhóm đã hiểu rõ: định danh chấm bài,
# file test (chúng PHẢI chứa từ cấm để gác), và dòng chú thích (chỗ ghi lại lệnh
# cấm). Đã đối chứng dương bốn hình dạng — SNAKE_CASE, camelCase, hằng, đường dẫn.
grep -rniE 'price|pricing|paywall|checkout|billing|invoice|stripe|paddle|sepay|entitlement|sku|subscription|is_paid|ispaid|gói cước|thanh toán|nâng cấp gói'      apps/web/src packages/ui/src packages/scenario/src packages/shared-types/src   | grep -viE 'checkoutcome|checkresultpanel'   | grep -vE '\.test\.tsx?:'   | grep -vE ':[0-9]+: *(\*|//|#)'      # rỗng (exit 1)
```

## Risk Assessment (P13)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Phạm vi FE phình vô hạn (mỗi màn hình đẻ ba màn hình) | 5 | 4 | **20** | Danh sách màn hình chốt ở 13.B–13.G; thêm màn hình mới phải hỏi chủ dự án; ưu tiên luồng học trước luồng quản trị. |
| Viết máy trạng thái phiên thứ hai cho trang mới | 3 | 5 | **15** | Dùng lại `session-machine.ts`; review chặn mọi `useReducer` mới quanh WS. |
| A11y bị hoãn tới cuối rồi không làm | 4 | 3 | 12 | axe trong CI từ màn hình đầu tiên, không phải cuối phase. |
| Nhãn tiến độ khẳng định nhiều hơn dữ liệu (bẫy P2 lặp lại) | 3 | 3 | 9 | Hàm thuần + test cho mọi nhãn tiến độ, như `summarizeProgress` đã làm. |
| Hai bộ render (xem trước vs trình học) trôi khỏi nhau | 3 | 3 | 9 | Một component render dùng chung; xem trước là cùng cây component với dữ liệu nháp. |

## Timeline (P13)

| Task | Effort |
|---|---|
| 13.A hệ thiết kế | L |
| 13.B vỏ ứng dụng | M |
| 13.C danh mục | M |
| 13.D bốn trình học | XL |
| 13.E của tôi + hồ sơ | M |
| 13.F trang soạn | L |
| 13.G quản trị | M |
| 13.H a11y + e2e + CSP | L |
| **Total** | **XL** |
