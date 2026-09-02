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

- [ ] Token là **một** nguồn; grep không thấy mã màu hardcode trong JSX.
- [ ] Dark mode chạy trên **mọi** trang, gồm cả terminal và editor.
- [ ] Mọi component mới có đủ 4 trạng thái loading/empty/error/disabled (checklist trong `docs/design-system.md`).
- [ ] Font phủ đủ dấu tiếng Việt; kiểm bằng một chuỗi có đủ dấu nặng/ngã/ơ/ư.
- [ ] 4 trình học chạy end-to-end **trên cụm thật**, không phải mock.
- [ ] Layout `ide` hiện đúng khi `interfaceLayout === 'ide'`, và **không** hiện khi không có cờ.
- [ ] "Còn N chỗ" phản ánh trần thật của P12; chạm trần thì báo trước, không để người dùng gặp 429 trần trụi.
- [ ] `lessons.list` phân trang **ở tầng nguồn**, không nạp cả catalog (đóng nợ P2).
- [ ] Đáp án quiz không có trong payload FE nhận (kiểm bằng network trace).
- [ ] axe: **0** lỗi serious/critical trên mọi route; đi hết luồng chính bằng bàn phím; Esc thoát khỏi terminal.
- [ ] Playwright 6 luồng chính xanh trên cụm thật.
- [ ] 0 vi phạm CSP mới, **có đối chứng dương** chứng minh phép kiểm biết kêu.
- [ ] Responsive: ≤768px đọc được nội dung, terminal báo rõ thay vì vỡ.
- [ ] **Không** màn hình/route/chuỗi nào liên quan giá, gói cước, thanh toán (grep chứng minh).

## Verify commands

```bash
pnpm --filter web build && pnpm --filter web test
pnpm --filter web exec playwright test --grep @flow
npx @axe-core/cli https://dlp.<ip>.sslip.io/lessons --exit
grep -rniE 'price|pricing|checkout|subscribe|billing' apps/web/src | grep -v node_modules   # rỗng
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
