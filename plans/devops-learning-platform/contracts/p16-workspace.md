# Hợp đồng P16 — khoang làm việc (terminal + editor)

**Trạng thái:** SSOT của lane L3 (`components/session/**`, `/labs/[id]`, `/lessons/[id]`). Viết
xong và commit **TRƯỚC** khi spawn bất kỳ lane nào (`rules/contract-first-integration.md`).

**Vì sao file này tồn tại, nói thẳng.** P16 viết lại `packages/ui` và `components/session/**` từ
file trắng. Những bất biến dưới đây hôm nay **chỉ sống trong chú thích của chính đoạn mã sắp bị
xoá**. Không chép sang đây thì chúng mất, và cách chúng hỏng là **im lặng**: người học mất phiên
giữa bài, không có exception nào, không có dòng log nào, không có ô test nào đỏ. Người phát hiện
sẽ là người học, và thứ họ thấy chỉ là "terminal tự nhiên đứng".

Đây không phải một bản tóm tắt mã cũ. Đây là **yêu cầu đối với mã mới**. Mã cũ được phép biến
mất hoàn toàn; các mệnh đề dưới đây thì không.

> ### ⚠ ĐỌC TRƯỚC — SỬA ĐỔI 3, chỉ đạo 2026-09-13
>
> Chủ dự án chốt: *"ở tab IDE, không còn terminal nằm bên dưới IDE nữa, chỉ đơn giản tab IDE thì
> hiện IDE, tab terminal thì hiện terminal, hết."* Mô hình kiểu KillerCoda của SỬA ĐỔI 2 (một dải
> terminal neo đáy tab Editor, kèm thanh kéo chỉnh chiều cao) **đã bị gỡ khỏi mã**, và file này
> đã sửa theo.
>
> Bốn chỗ ĐỔI NGHĨA, không phải chỗ diễn đạt lại: **§1** (bất biến là *không đổi cha*, **không**
> phải *không bao giờ `hidden`*), **§3.1** (hai hàng loại trừ nhau, hết phần trăm), **§4.2 + §5.1**
> (các hàm và chuỗi phần trăm bị thu hồi), **§8** AC-3 / AC-4 / AC-7.
>
> Bất cứ chỗ nào trong file còn nói ngược lại là chỗ bị sót: **sửa nó, đừng lấy nó làm căn cứ giao
> việc.** Lý do của mệnh lệnh đó nằm ở §3.2, nơi kể lại đúng một lần văn bản cũ nằm lại trong
> chính file này rồi đẻ ra một nhiệm vụ đã chết.

Bản gốc của mọi lý lẽ nằm trong lịch sử git tại các file sau (đọc trước khi xoá, không đọc sau):

| Đường dẫn | Thứ nó giữ |
|---|---|
| `apps/web/src/components/session/workspace-panel.tsx` | Bất biến terminal, bẫy `hidden`, ngăn xếp hai con tĩnh |
| `apps/web/src/components/session/workspace-tabs.ts` | Mô hình thuần, hai tab, khoá storage |
| `apps/web/src/components/session/workspace-layout.tsx` | Chuỗi hình học, `requestAnimationFrame` |
| `apps/web/src/components/session/single-terminal-contract.test.ts` | Phép kiểm SỰ VẮNG MẶT của đa terminal |
| `apps/web/src/components/session/terminal-pane.tsx` | Call-site của fit, ngưỡng màn hình hẹp |
| `packages/terminal/src/terminal-core.ts` | Debounce, thứ tự addon, vì sao không tin `proposeDimensions()` |
| `packages/ui/src/lesson/split-pane.tsx` | Flexbox + pointer-capture, `min-w-0`/`min-h-0` |
| `apps/web/src/app/lessons/[id]/ide-pane.tsx` | Thăm dò trước, gắn iframe sau |

---

## 1. ⛔ BẤT BIẾN SỐNG-CHẾT — terminal không đổi cha, không unmount (ẩn thì ĐƯỢC)

### 1.1 Mệnh đề

Phần tử DOM chứa xterm, tính từ lúc phiên mở tới lúc phiên đóng:

1. **KHÔNG BAO GIỜ đổi cha.** Cùng một node cha, cùng một vị trí trong danh sách con.
2. **KHÔNG BAO GIỜ unmount.** Không render có điều kiện, không đổi `key`, không nhảy nhánh.
3. **KHÔNG BAO GIỜ nằm dưới một TỔ TIÊN đang `hidden`.** Một `hidden` đặt nhầm lên ngăn xếp dọc
   thay vì lên đúng một hàng sẽ ẩn terminal ở cả hai tab, không lỗi không log.
4. **CHÍNH hàng terminal thì ĐƯỢC PHÉP mang `hidden`**, và ở mô hình hiện tại nó mang thật: ẩn ở
   tab Editor, hiện ở tab Terminal.

⚠ Vế 4 vừa ĐẢO CHIỀU so với bản trước, và đây là chỗ dễ đọc sai nhất của cả file. SỬA ĐỔI 2 ghi
"terminal KHÔNG BAO GIỜ mang `hidden`", nhưng câu đó **chưa bao giờ là một ràng buộc kỹ thuật**:
nó là hệ quả của một LỰA CHỌN THIẾT KẾ kiểu KillerCoda, nơi terminal có mặt ở cả hai tab nên
chẳng có lúc nào để ẩn. Chỉ đạo 2026-09-13 thay lựa chọn đó, nên câu đó đi theo. Thứ giữ người
học khỏi mất phiên là vế 1 và vế 2, **không phải** vế 4.

Ranh giới đúng-sai gói trong một câu: **ẩn là một thuộc tính, gỡ là một lượt unmount.** `hidden`
để nguyên node tại chỗ trong cây React, nó chỉ thôi được vẽ; cây không bị chạm tới. Đổi cha, đổi
`key`, hay bỏ node khỏi cây thì chạm, và §1.2 là thứ xảy ra ngay sau đó.

Chuyển tab đổi đúng **một** thứ: hàng nào mang `hidden`. Hai hàng loại trừ nhau (§3.1).

### 1.2 Hậu quả nếu vi phạm — nêu tường minh vì nó không tự hiện ra

Dời một component giữa hai cha là **unmount + mount lại**. React huỷ cây cũ, effect cleanup chạy,
`terminal.dispose()` chạy, **WebSocket đóng**. Phía server phiên vẫn còn, phía client thì đã mất
handle. Người học đang gõ dở một lệnh thì terminal ngừng nhận phím.

Và **không có gì báo**: đóng WebSocket từ phía client là một luồng đóng *hợp lệ*, không phải lỗi.
Không exception, không `console.error`, không toast, không dòng log gateway nào bất thường. Ô
test render một lần rồi khẳng định "terminal có mặt" vẫn xanh, vì sau khi mount lại thì terminal
**có mặt thật** — chỉ là nó là một terminal khác, rỗng, nối vào hư không.

Đây là lý do bất biến này đứng đầu file và là lý do §8 bắt viết test **trước** khi dựng lại
khoang.

### 1.3 Vì sao hàng editor phải LUÔN được render — React so trùng theo VỊ TRÍ

React đối chiếu các con **tĩnh** (không có `key`) của một phần tử theo **chỉ số vị trí**, không
theo kiểu component. Ngăn xếp nay có HAI con. Bỏ hẳn hàng 1 khi bài không có editor thì con còn
lại **trượt lên một bậc**:

```
CÓ editor                    BỎ HẲN hàng 1 (SAI)
index 0: <div editor>        index 0: <div terminal>   ← React khớp với hàng editor cũ
index 1: <div terminal>      (không còn index 1)       ← terminal cũ bị UNMOUNT
```

React thấy vị trí 0 đổi từ "editor" sang "terminal" ⇒ huỷ cây cũ, dựng cây mới. Tức xterm bị
unmount, tức §1.1 vỡ, tức §1.2 xảy ra. Nên hàng 1 vẫn phải được render kể cả ở bài không có
editor: chỉ `hidden`, không bỏ.

⚠ **Mệnh đề thật là "số con tĩnh phải là một HẰNG SỐ ở mọi lượt render"**, không phải "phải là
ba" hay "phải là hai". SỬA ĐỔI 3 xoá vĩnh viễn thanh kéo, tức ngăn xếp đi từ ba con xuống hai, và
điều đó AN TOÀN: đó là một thay đổi ở mức mã nguồn, mọi lượt render của bản mới đều thấy đúng hai
con. Thứ bị cấm là một **nhánh điều kiện lúc chạy** làm số con nhảy giữa hai lượt render của cùng
một phiên.

### 1.4 Hình dạng JSX ĐÚNG

Ngăn xếp dọc, **hai con tĩnh, luôn có mặt, luôn đúng thứ tự này**:

```tsx
<div className="flex min-h-0 flex-1 flex-col">
  {/* Hàng 1 — editor. `hidden` khi vắng editor hoặc khi ở tab Terminal.
      ⛔ KHÔNG có tiện ích `display` ở đây. `flex-1`/`min-h-0`/`min-w-0` KHÔNG phải `display`. */}
  <div
    id={editorPanelId}
    hidden={!editorVisible}
    className="min-h-0 min-w-0 flex-1 overflow-hidden"
  >
    <div className="h-full w-full">{editor}</div>
  </div>

  {/* Hàng 2 — TERMINAL. Cùng cha, cùng vị trí, ở mọi lượt render.
      `hidden` NGƯỢC hàng 1, và chịu cùng lệnh cấm `display`. */}
  <div
    id={terminalPanelId}
    hidden={editorVisible}
    className="min-h-0 min-w-0 flex-1 overflow-hidden"
  >
    <WorkspaceLayoutProvider layout={layout}>
      <div className="h-full w-full">{terminal}</div>
    </WorkspaceLayoutProvider>
  </div>
</div>
```

**Không còn style nội tuyến nào trên hai hàng.** Toàn bộ khác biệt hình học giữa hai tab nằm ở
đúng một thuộc tính `hidden`; hàng đang hiện mang `flex-1` nên nó chiếm trọn khoang. Cả cơ chế
phần trăm của SỬA ĐỔI 2 đã bị gỡ hẳn cùng thanh kéo sinh ra nó:
`TERMINAL_PERCENT_DEFAULT/MIN/MAX/STEP`, `clampTerminalPercent`, `nextTerminalPercentOnKey`,
`terminalRowStyle`, và trường `terminalPercent` trong storage.

⚠ **Gỡ chứ không để lại dạng ẩn.** Một `[role="separator"]` không bao giờ hiện được là mã chết, và
mã chết trong cây này là thứ người đọc sau sẽ tưởng còn dùng. `workspace-panel.test.tsx` khẳng
định không còn `separator` nào ở BẤT KỲ tổ hợp nào, và `workspace-panel.dom.test.tsx` khẳng định
nó vắng mặt ở cả cây DOM lẫn cây trợ năng.

### 1.5 Ba thứ CẤM viết trong khoang này

```tsx
{activeTab === 'terminal' ? <Terminal/> : <><Editor/><Terminal/></>}  // ⛔ hai nhánh = hai cây
{activeTab === 'terminal' && <div>{terminal}</div>}                   // ⛔ gỡ khỏi cây = unmount
{hasEditor && <EditorRow/>}                                           // ⛔ trượt vị trí (§1.3)
```

`key` động trên hàng terminal cũng nằm trong danh sách cấm: đổi `key` là ép React unmount.

⚠ **Phân biệt hai thứ trông giống nhau trên màn hình và khác nhau hoàn toàn dưới cây React.** Đây
là chỗ SỬA ĐỔI 3 dễ bị đọc thành "đã phá một bất biến an toàn", nên viết ra thành bảng:

| Viết thế này | Kết quả |
|---|---|
| `<div hidden={editorVisible}>{terminal}</div>` | **ĐƯỢC.** Node ở nguyên chỗ, chỉ thôi được vẽ. Đây chính là cách dựng "tab IDE chỉ có IDE" |
| Render `{terminal}` ở **hai nhánh JSX khác nhau** | ⛔ **CẤM.** Hai nhánh là hai cây; React unmount cây cũ |
| `{điều kiện && <TerminalRow/>}` | ⛔ **CẤM.** Vắng mặt ở một lượt render là unmount, và nó kéo theo §1.3 |

Dòng thứ nhất TRƯỚC ĐÂY nằm trong danh sách cấm này, với lý do "ẩn terminal". Lý do đó đã hết hiệu
lực (§1.1). Hai dòng dưới thì không, và chúng mới là thứ giữ WebSocket của người học sống.

### 1.6 `min-w-0` / `min-h-0` là bắt buộc, không phải trang trí

Mặc định một flex item **không co được xuống dưới bề rộng nội dung của nó**, và xterm đặt bề
rộng nội dung cố định (số cột × bề rộng font). Thiếu `min-w-0` thì khoang "đứng lì" ở một mức tối
thiểu khi kéo — bẫy flexbox kinh điển. `min-h-0` tương tự cho trục dọc, để `ResizeObserver` của
terminal đo đúng chiều cao thay vì bị nội dung đẩy tràn ra ngoài khung.

Kèm theo, ở tầng CSS của gói terminal: `.xterm` phải có `height: 100%`. xterm tự đặt
`position: relative` cho `.xterm-screen` nhưng **không** tự chiếm hết container; thiếu dòng đó
thì `proposeDimensions()` đọc chiều cao 0 ở lần đo đầu và `measure()` trả về mặc định 80×24.

### 1.7 Ẩn terminal có làm vỡ xterm không — không, và chốt nằm ở đâu

Đây là phản bác đúng chỗ nhất với vế "`hidden` thì được" của §1.1, nên trả lời thẳng.

Một phần tử `display:none` đo ra 0×0. Một lượt `fit()` chạy lúc đó mà không ai chặn sẽ chốt số
cột/hàng rác rồi đẩy một frame `resize` 1 cột xuống PTY của pod, và mọi TUI đang chạy vỡ bố cục
(đường đi đầy đủ ở §5.4). Chốt **ĐÃ CÓ**, ở đúng tầng thấp nhất: thân `fit()` trong
`packages/terminal/src/terminal-core.ts` gọi `tryMeasure()` TRƯỚC rồi `return` ngay khi phép đo
trả `null`, mà container 0×0 làm `tryMeasure()` trả `null` ở ngay vế đầu
(`clientWidth < 1 || clientHeight < 1`). Nên lượt fit lúc vừa ẩn là một no-op THẬT, không phải
một lượt may mắn.

Chiều ngược lại thì vẫn cần fit, và đó là đường đang chạy: terminal hiện lại ⇒ kích thước đổi từ
0×0 sang kích thước thật ⇒ `workspaceLayoutToken` đổi giá trị ⇒ `useFitOnLayoutChange` chạy lại ⇒
`requestAnimationFrame` ⇒ `fit()` sau khi trình duyệt đã tính xong bố cục (§5.1, §5.2).

⛔ **Đừng dựng thêm một chốt thứ hai** ở `workspace-tabs.ts` hay `workspace-panel.tsx` kiểu "chặn
fit khi đang ẩn". Cửa đã khoá ở tầng dưới; chốt thứ hai chỉ thêm một chỗ để hai tầng lệch nhau,
và tầng trên là tầng không đo được container.

---

## 2. ⚠ Bẫy `hidden` — một thuộc tính bị vô hiệu trong im lặng

### 2.1 Cơ chế

`[hidden] { display: none }` đến từ **stylesheet của trình duyệt** (UA). `.flex { display: flex }`
đến từ **stylesheet của tác giả**. Cùng độ đặc hiệu thì **tác giả THẮNG**. Kết quả: phần tử mang
`hidden` vẫn hiển thị bình thường, và không có cảnh báo nào — HTML hợp lệ, CSS hợp lệ, React
không phàn nàn, TypeScript không phàn nàn.

Danh sách tiện ích Tailwind đặt `display` (không đầy đủ, nhưng đủ để nhận dạng): `block`,
`inline-block`, `inline`, `flex`, `inline-flex`, `grid`, `inline-grid`, `table`, `table-cell`,
`contents`, `flow-root`, `list-item`.

### 2.2 SAI

```tsx
<div hidden={!editorVisible} className="flex min-h-0 flex-1 flex-col overflow-hidden">
  {editor}
</div>
```

Ở tab Terminal, hàng editor **vẫn chiếm chỗ**. Hai hàng cùng mang `flex-1`, nên khoang bị chia
đôi: người học thấy một mảng trắng bên trên và terminal chỉ còn nửa khoang, dù đang ở tab lẽ ra
toàn màn hình.

⚠ Từ SỬA ĐỔI 3, bẫy này áp cho **CẢ HAI hàng**, không chỉ hàng 1. Hàng terminal nay cũng mang
`hidden` (ở tab Editor), nên một tiện ích `display` lọt vào `className` của nó cho ra triệu chứng
đối xứng: ở tab Editor, terminal vẫn hiện và ăn nửa khoang của Theia. Đừng làm yếu mục này khi
đọc §1.1 — §1.1 nói `hidden` là **hợp lệ**, còn §2 nói `hidden` **rất dễ bị vô hiệu trong im
lặng**; hai điều đó cùng đúng, và điều thứ hai mới là thứ phải có test gác.

### 2.3 ĐÚNG

```tsx
{/* `display` nằm ở con, không nằm ở phần tử mang `hidden`. */}
<div hidden={!editorVisible} className="min-h-0 min-w-0 flex-1 overflow-hidden">
  <div className="flex h-full w-full flex-col">{editor}</div>
</div>
```

Quy tắc một câu: **phần tử mang `hidden` chỉ được mang tiện ích kích thước/tràn
(`min-h-0`, `min-w-0`, `flex-1`, `overflow-hidden`, `h-*`, `w-*`), không được mang tiện ích
`display`.** Cần `display` thì bọc một lớp con.

§8 bắt một ô test quét **mọi** phần tử mang `hidden` ở **cả hai** tab để giữ điều này.

---

## 3. Hai tab, và đa terminal ở lại trong mồ

### 3.1 Mô hình

```
type WorkspaceTabId = 'editor' | 'terminal';   // ĐÚNG hai giá trị
```

| Tab | Hàng 1 (editor) | Hàng 2 (terminal) |
|---|---|---|
| `editor` | hiện, chiếm trọn khoang | **`hidden`** |
| `terminal` | `hidden` | hiện, chiếm trọn khoang |

**Hai hàng loại trừ nhau ở mọi trạng thái**, đúng chỉ đạo 2026-09-13. Đây là bảng đã đổi: SỬA ĐỔI
2 ghi ô trên bên phải là "neo đáy, mặc định 40%", tức hai hàng cùng hiện ở tab Editor. Không còn
trạng thái đó, và không còn giá trị trung gian nào giữa hai dòng này.

⚠ Một bản cài đặt quên ẩn hàng 2 vẫn **trông đúng ở tab Terminal** (hàng 1 ẩn, terminal đầy
khoang) và chỉ sai ở tab Editor. Nên phép kiểm phải khẳng định CẢ HAI chiều, không chỉ chiều dễ
(§8 AC-3).

Bài không khai `layout: ide` ⇒ chỉ có tab `terminal`, và thanh tab vẽ một **nhãn tĩnh** chứ
không vẽ `role="tablist"`: một tablist một mục là nhiễu thị giác chứ không phải chức năng, và
trình đọc màn hình sẽ đọc "tab 1 trên 1". Ở trạng thái đó hai hàng **không** mang
`role="tabpanel"` — không có tab thì không có tabpanel, và trỏ `aria-labelledby` vào một id
không tồn tại là vi phạm `aria-valid-attr-value` của axe.

Hằng số hình học còn lại, chép nguyên sang mã mới:

| Hằng | Giá trị | Lý do |
|---|---|---|
| chiều cao thanh tab | `h-9 shrink-0`, **mọi trạng thái** | Bất cứ thứ gì xuất hiện/biến mất quanh terminal đều làm `ResizeObserver` bắn và fit lại **đúng lúc người dùng đang gõ** |

⚠ **Bốn hằng `TERMINAL_PERCENT_*` đã bị THU HỒI** cùng thanh kéo (SỬA ĐỔI 3). Bảng này từng khai
`DEFAULT` 40, `MIN` 15, `MAX` 85, `STEP` 4 kèm lý do từng con số; không còn thứ gì đọc chúng, và
mã mới **không được** dựng lại. Hàng đang hiện dùng `flex-1`, hết.

⚠ **Chỗ lệch ARIA mà SỬA ĐỔI 2 phải chấp nhận đã TỰ HẾT.** Bản trước có một `tabpanel` hiện trong
khi tab của nó không được chọn (hàng 2 ở tab Editor), và mục này từng kết luận "không sửa lại chỗ
này ở P16" vì đổi sang `role="region"` sẽ làm tab Terminal mất `aria-controls` hợp lệ. Nay hai
hàng loại trừ nhau nên mỗi `tabpanel` hiện đúng khi tab của nó được chọn: khuôn ARIA khớp, không
còn gì phải đánh đổi. Giữ `role="tabpanel"` trên **cả hai** hàng khi có hai tab, và bỏ trên cả
hai khi chỉ còn một.

### 3.2 Đa terminal đã bị xoá có chủ ý — và phải NẰM YÊN

Trước 2026-09-07 có ba tab (`editor` + `terminal-1..N` ánh xạ sang tmux window) và một nút "tách
đôi". Cụm đó bị gỡ, `tmux-control.ts` bị xoá.

**Chuyện đã xảy ra và là lý do có một phép kiểm riêng:** phần văn bản mô tả mô hình cũ vẫn nằm
trong file hợp đồng, phía trên phần ghi đè. Ngày 2026-09-08 một lượt giao việc đọc đúng dòng đó
rồi giao "mở nút `×`, viết quy tắc cấp lại chỉ số tmux" cho một lane — một nhiệm vụ đã chết, và
**không một phép kiểm nào trong `apps/web` đỏ lên để nói điều đó**. Cả cây mã im lặng vì thứ cần
gác không phải mã có mặt, mà mã đã VẮNG.

Nên P16 **phải mang theo** phép kiểm sự-vắng-mặt, viết lại cho đường dẫn mới. Ba mệnh đề và ai
gác mệnh đề nào:

| Mệnh đề | Ai gác | Đỏ ở lệnh nào |
|---|---|---|
| `WorkspaceTabId` đúng hai giá trị, không có `terminal-N` | test + kiểu | `test` **và** `typecheck` |
| Props không có `onCloseTerminal`/`onAddTerminal`/`split`/`onToggleSplit`/`terminals` | **CHỈ kiểu** | `typecheck` |
| Không có file `tmux-control.*` trong thư mục session | test | `test` |

⚠ Nói thẳng về hàng giữa: các khẳng định kiểu là hằng số lúc chạy, nên `expect(...).toBe(true)`
của chúng **đỏ không bao giờ được**. Chúng chỉ có tác dụng dưới `typecheck`. Ghi ra để không ai
đọc màu xanh của `test` rồi tưởng cả ba hàng đều đã được gác — **một ô xanh không biết đỏ thì
không chứng minh gì**.

⚠ Gác bằng **sự tồn tại của file**, không grep định danh: `onAddTerminal`/`onCloseTerminal` còn
được nhắc tên trong chú thích (chúng giải thích vì sao đã gỡ), nên grep định danh sẽ đỏ ngay lượt
đầu vì trúng chú thích, rồi bị nới ra cho tới lúc không gác gì nữa.

⛔ Khi phép kiểm này đỏ: đó **có thể** là điều đúng (chủ dự án đổi ý), nhưng thứ phải sửa TRƯỚC
là hợp đồng — mục §3.2 này phải được thu hồi tường minh, chứ không phải phép kiểm bị nới cho khớp
mã.

---

## 4. Ai quyết định, ai vẽ — ranh giới giữ nguyên

Cách chia hiện tại **đúng và phải sống sót qua đợt viết lại**:

| Tầng | File | Nội dung |
|---|---|---|
| **Quyết định** | `workspace-tabs.ts` (hàm THUẦN, không import React) | tab nào có, tab nào hợp lệ, hàng 1 hiện không, phím nào đi đâu, lưu vào khoá nào, chuỗi hình học là gì |
| **Vẽ** | `workspace-panel.tsx` | JSX, ARIA, `useEffect` ghi nhớ tab |

Danh sách hàm thuần bắt buộc có (tên giữ nguyên để phép kiểm chuyển thẳng sang được):
`listWorkspaceTabs`, `resolveActiveTab`, `isEditorVisible`, `nextTabOnKey`,
`workspaceLayoutToken`, `workspaceStorageKey`, `parseWorkspaceState`, `readWorkspaceState`,
`writeWorkspaceState`, `browserStorage`, `hasDisplayUtility`.

⚠ `clampTerminalPercent` và `nextTerminalPercentOnKey` đã **rời khỏi danh sách này** cùng thanh
kéo (SỬA ĐỔI 3). Chúng từng nằm ở đây; không có call-site nào còn gọi, và mã mới không dựng lại.

⚠ `isEditorVisible` nay mang **hai** nghĩa cùng lúc: hàng 1 hiện ĐÚNG KHI hàng 2 ẩn, và ngược
lại. Trước SỬA ĐỔI 3 hai hàng cùng hiện ở tab Editor nên chỉ hàng 1 phụ thuộc vào nó. Một hàm thứ
hai kiểu `isTerminalVisible` là thừa và là chỗ để hai vế lệch nhau: dùng phủ định tại chỗ.

### 4.1 Vì sao tách — ⚠ LÝ DO ĐÃ ĐỔI, kết luận thì không

Lý do cũ là "`apps/web` chạy vitest ở `environment: 'node'`, không jsdom, không RTL, nên quyết
định nằm trong thân component là quyết định không test được". **Vế đó hết đúng từ 2026-09-08**:
`node` nay chỉ còn là MẶC ĐỊNH của gói (phần lớn test ở đây đi Postgres thật), còn file nào cần
DOM thì tự bật jsdom + RTL bằng docblock `// @vitest-environment jsdom` ở **dòng 1**.

⚠ `vitest 4` đã bỏ `environmentMatchGlobs`; nó lọt typecheck rồi im lặng không làm gì. Docblock
per-file là đường duy nhất còn sống.

Tách vẫn đúng, chỉ đổi lý do: **một quyết định là hàm thuần thì khẳng định được thẳng bằng bảng
vào/ra, không phải suy ngược từ cây DOM**, và không phải trả giá dựng một jsdom cho mỗi ca. Một
ca kiểu `expect(workspaceLayoutToken({activeTab:'terminal',hasEditor:true}))
.toBe('terminal-full')` nói đúng một điều và đỏ đúng khi điều đó sai. Cùng khẳng định ấy viết qua
DOM thì phải render, phải query, phải đọc thuộc tính `hidden` của đúng hàng, và mỗi bước là một
chỗ để ô test xanh vì lý do khác với lý do ta nghĩ. Việc **dây nối** giữa hàm thuần và DOM thì đã
có file DOM riêng gác (§8).

### 4.2 Quy tắc kèm theo, đều đã trả giá một lần

**Khoá `localStorage` TÁCH RIÊNG theo bố cục** — `workspaceStorageKey(base, hasEditor)` sinh hậu
tố `:ide` / `:plain`. Repo đã dính đúng lớp lỗi này ở tỉ lệ `SplitPane`: dùng chung khoá thì tỉ
lệ của bài thường bị áp lên bài IDE. Ở đây còn khó thấy hơn: một `activeTab: 'editor'` lưu từ bài
IDE, đọc lại ở bài thường, bị `resolveActiveTab` kẹp im lặng — triệu chứng là "tab đã lưu không
có tác dụng" chứ không phải một lỗi ai đó đi tìm. Hậu tố sinh **trong hàm**, không bắt call-site
truyền hai khoá: một call-site quên là một lần trộn, và trộn thì không có gì báo.

**Đọc storage trong effect, KHÔNG trong `useState(() => …)`** — trang render ở server trước
(`localStorage` không tồn tại ở đó). Đọc lúc dựng state là hai kết quả khác nhau giữa server và
client cho cùng một cây, tức lỗi hydrate. Cần một cờ `restored` chặn lượt GHI đầu tiên, không thì
effect ghi đè giá trị vừa lưu bằng mặc định của cha, ngay trước khi kịp đọc nó.

**⚠ Cờ `restored` không thừa, và lớp lỗi nó chặn thì lớn hơn cái tên của nó.** Effect khôi phục và
effect ghi chạy trong CÙNG một lượt commit, nên effect ghi đọc được giá trị của lượt render
**vừa rồi** (tức mặc định của cha) và ghi đè đúng thứ vừa khôi phục được. Triệu chứng: chọn tab
Terminal, phiên này vẫn đúng, lần vào sau về mặc định. Không có gì báo. `workspace-panel.dom.test
.tsx` giữ một ô hồi quy riêng cho vòng khôi-phục-rồi-ghi này.

**Hàm phím trả `null` cho phím ngoài khuôn**, để call-site biết **không được** `preventDefault()`.
Nuốt mọi phím sẽ chặn cả `Tab` (đường thoát) lẫn phím tắt trình duyệt.

**Ghi storage ngay khi đổi tab.** Đổi tab là một sự kiện RỜI RẠC (một cú bấm hoặc một lần nhấn
phím), không phải một dòng sự kiện liên tục, nên không cần gộp hay hoãn.

**Bọc `localStorage` trong try/catch** ở cả đọc lẫn ghi — nó **NÉM** trong một số chế độ riêng
tư. Bố cục là thứ "tiện thêm"; nó không được phép làm sập trang.

**`SplitPane` của `packages/ui` giữ nguyên vai trò chia NGANG** (nội dung ⇄ khoang), với
`min-w-0`/`min-h-0` ở §1.6. Nó chia ngang và chỉ chia ngang (`flex-row`, đọc `event.clientX`,
`cursor-col-resize`, `aria-orientation="vertical"`).

#### Đã THU HỒI cùng thanh kéo (SỬA ĐỔI 3) — ghi ra để không ai dựng lại

Năm quy tắc dưới từng nằm trong mục này, mỗi cái đã trả giá một lần. Chúng **không còn chủ thể**:
khoang không có thanh kéo nào nữa. Ghi lại tường minh thay vì xoá lặng, đúng tinh thần §3.2.

| Quy tắc cũ | Bài học chung còn dùng được ở chỗ khác |
|---|---|
| `percentRef` — bản sao đồng bộ của phần trăm | Hai effect trong cùng một lượt commit đọc của nhau qua state là đọc giá trị cũ; ref mới thấy giá trị của lượt này |
| `clampTerminalPercent(NaN)` trả MẶC ĐỊNH, không kẹp | `Math.min`/`Math.max` lan `NaN`, và một khai báo CSS không hợp lệ bị trình duyệt bỏ qua **trong im lặng** |
| Ghi storage lúc `pointerup`, không ghi mỗi `pointermove` | Sự kiện bắn hàng chục lần/giây thì mỗi lượt ghi là I/O đồng bộ thừa |
| `setPointerCapture` chứ không listener trên `window` | Giữ được luồng kéo khi con trỏ rời phần tử, và chạy luôn cho cảm ứng |
| `select-none` khi đang kéo | Không có nó thì con trỏ bôi đen chữ trong lúc người dùng chỉ định đổi kích thước |

⛔ Nếu một lane thấy mình cần lại **bất kỳ** dòng nào trong bảng này, đó là dấu hiệu đang dựng lại
thanh kéo. Dừng và hỏi chủ dự án, đừng tự khôi phục: chỉ đạo 2026-09-13 là một quyết định sản
phẩm, không phải một lượt dọn mã.

---

## 5. Hợp đồng fit / resize

### 5.1 Kênh báo là một CHUỖI, không phải một cờ

`WorkspacePanelProps` **không** mang handle của terminal — panel chỉ nhận `ReactNode`. Nên panel
không thể tự gọi `fit()`; nó chỉ biết hình học. Nó phát một **chuỗi** qua context
(`WorkspaceLayoutProvider`), và component cầm handle (`TerminalPane`) nghe chuỗi đó.

```ts
workspaceLayoutToken({ activeTab, hasEditor }): string
//  hàng 1 hiện (tab Editor của bài CÓ editor) → 'editor-only'
//  còn lại                                     → 'terminal-full'
```

⚠ **Chuỗi nay có ĐÚNG hai giá trị, và tham số `terminalPercent` đã biến mất khỏi chữ ký.** SỬA
ĐỔI 2 nhét phần trăm vào một nhánh (`editor-split:${…}`) để lượt kéo thanh cũng sinh fit; không
còn thanh kéo thì không còn lượt đó, và một giá trị thừa trong chuỗi là một lượt fit thừa.

⛔ **Vì sao vẫn là một CHUỖI chứ không phải một cờ — ⚠ LÝ DO ĐÃ ĐỔI, kết luận thì không.** Lý do
cũ: terminal không bao giờ bị ẩn, nên một cờ hiện/ẩn đứng yên `true` **mãi mãi** và effect fit sẽ
không bao giờ chạy lại. Vế đó chết cùng SỬA ĐỔI 3, vì nay hàng 2 ẩn/hiện thật và một cờ cũng đổi
đúng hai lần như chuỗi. Chuỗi ở lại vì hai lý do nhỏ hơn nhưng có thật: đọc log hay devtools ra
được **TÊN** của bố cục thay vì `true`/`false`, và nó giữ nguyên kiểu `string` mà
`WorkspaceLayoutProvider` cùng giá trị mặc định `'standalone'` đang dùng. Đổi sang boolean là sửa
ba file để đổi lấy đúng con số không.

**Giá trị mặc định của context là một HẰNG (`'standalone'`)**, và đó là phần quan trọng:
`TerminalPane` còn được dùng ngoài panel (nhánh hẹp của split, hoặc một trang dựng thẳng nó). Ở
đó không có provider nào, hằng không bao giờ đổi, nên effect chạy đúng một lần lúc mount và không
sinh lượt fit thừa.

### 5.2 `requestAnimationFrame` — mấu chốt, không phải tối ưu

```ts
export const animationFrameScheduler: FitScheduler = (run) => {
  const id = requestAnimationFrame(run);
  return () => { cancelAnimationFrame(id); };
};

export function runFitAfterLayout(
  handle: FitCapableHandle | null,
  schedule: FitScheduler = animationFrameScheduler,
): (() => void) | undefined {
  if (handle === null) return undefined;
  return schedule(() => { handle.fit(); });
}

export function useFitOnLayoutChange(handle, layout, schedule = animationFrameScheduler): void {
  useEffect(() => runFitAfterLayout(handle, schedule), [handle, layout, schedule]);
}
```

**Effect của React chạy SAU khi DOM đã đổi nhưng TRƯỚC khi trình duyệt tính xong bố cục cho khung
hình đó.** Gọi `fit()` ngay trong thân effect nghĩa là xterm đo một phần tử mà chiều cao mới còn
**chưa được áp**: `getBoundingClientRect()` trả kích thước cũ, hoặc 0×0 nếu vừa thôi
`display:none`. `FitAddon` chốt một số cột/hàng sai, người dùng thấy terminal hiện ra với dòng bị
gãy rồi mới tự sửa một nhịp sau. `requestAnimationFrame` đẩy lời gọi sang trước lượt vẽ kế tiếp,
tức **sau khi** bố cục đã tính.

⚠ **`handle` nằm trong deps.** Handle gắn với ĐÚNG một `Connection`, nên nối lại là một handle
MỚI. Terminal nối lại sau khi bố cục đã đổi mà effect không chạy lại thì bản vẽ mới giữ nguyên số
cột mặc định của xterm.

⚠ **Không còn tham số `visible`.** Một lượt fit "thừa" là vô hại (`fit()` tự no-op khi đã
`dispose()` hoặc container 0×0, xem §1.7); giữ một cờ luôn `true` chỉ để trông giống bản cũ là
giữ một nhánh chết.

⚠ Từ SỬA ĐỔI 3, đường này chạy ở **mọi** lượt chuyển tab và mỗi lượt đi qua một trạng thái 0×0
thật (hàng vừa bị ẩn, hoặc hàng vừa hiện mà bố cục chưa tính xong). `requestAnimationFrame` vì
thế không còn là một mấu chốt lý thuyết: nó là thứ duy nhất tách lượt đo khỏi khung hình mà
terminal còn đang `display:none`.

`runFitAfterLayout` là **toàn bộ** thân effect tách ra thành hàm thuần, không phải một hàm bọc
lấy lệ — nên test nó là test đúng thứ chạy thật. Thứ duy nhất còn ngoài tầm test là mảng deps.

### 5.3 Debounce và đường phát `resize`

| Hằng | Giá trị | Ghi chú |
|---|---|---|
| `RESIZE_DEBOUNCE_MS` | **50** | SSOT là hợp đồng terminal §4, **không phải plan** (bản plan cũ ghi 100ms) |

- **Đúng MỘT đường phát `resize`** — cả `ResizeObserver` lẫn `fit()` đi qua `notifyResize`, nơi
  dedup theo giá trị. Hai đường phát song song là chỗ để một bên quên phép dedup, và mỗi frame
  control thừa là một lần chạm rate-limit mà không mang tin gì.
- **Lượt đo ĐẦU TIÊN của `ResizeObserver` chỉ GHI, không phát.** RO luôn bắn một lượt ngay khi
  `observe()`; seed bằng mặc định 80×24 của xterm thì lượt đó thấy 78×16 ≠ 80×24 và phát một
  `resize` thừa ở **mọi** lần mount, mang đúng kích thước mà frame `init` vừa gửi xong.
- **`fit()` cố ý KHÔNG đi qua debounce** — nó là hệ quả của một hành động rời rạc (đổi tab),
  không phải chuỗi RO bắn liên tục lúc kéo cửa sổ.

### 5.4 ⛔ Không tin `proposeDimensions()` để phát hiện "chưa có kích thước"

Đọc từ `@xterm/addon-fit@0.11.0`: nó kẹp **SÀN** `MINIMUM_COLS = 2` / `MINIMUM_ROWS = 1` bằng
`Math.max`. Nên container 0×0 **không** trả 0×0 — nó trả **2×1**, một cặp số hợp lệ về hình thức
mà mọi guard kiểu `cols < 1` không bao giờ bắt được. Và `display:none` với bề rộng ô còn cache
cho ra **`NaN`** (`parseInt` một giá trị computed không phải pixel), mà `Math.max(2, NaN)` cũng
là `NaN`, và **`NaN < 1` là `false`** — tức một guard chỉ so sánh sẽ cho nó lọt.

Thứ tự bắt buộc trong `tryMeasure()`:

```ts
const { clientWidth, clientHeight } = container;
if (clientWidth < 1 || clientHeight < 1) return null;      // đo CÁI HỘP trước
const proposed = fitAddon.proposeDimensions();
if (proposed === undefined
    || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows)
    || proposed.cols < 1 || proposed.rows < 1) return null; // Number.isFinite, không chỉ so sánh
fitAddon.fit();
```

**Hậu quả nếu bỏ qua:** frame `resize` 2×1 đi thẳng lên PTY của pod. Không có gì chặn hộ ở tầng
dưới — `clampDimension` kéo 0 **LÊN** `MIN_DIMENSION = 1`, nên `ioctl(TIOCSWINSZ)` nhận một
terminal rộng 1 cột và mọi TUI đang chạy vỡ bố cục tới tận lần resize sau.

⚠ `measure()` trả **kích thước cũ** khi đo hỏng, nên hai ca "đo hỏng" và "đo được, trùng số cũ"
không phân biệt được từ giá trị trả về. `fit()` bắt buộc phải phân biệt — đó là lý do `tryMeasure`
trả `null` chứ không trả số.

### 5.5 Thứ tự nạp addon, và font

Thứ tự **không tuỳ tiện**: `fit` → `unicode11` → `terminal.open()` → `webgl` →
`search`/`web-links`/`clipboard`.

- `unicode11` phải đứng **trước** renderer: nó đổi bảng chiều-rộng-ký-tự, và renderer cache atlas
  glyph theo bảng đó. Nạp sau thì atlas dựng bằng bảng Unicode 6 cũ và glyph Nerd Font (rộng 2 ô)
  vẽ đè lên ký tự bên cạnh. Cần `allowProposedApi: true`, không thì truy cập `terminal.unicode`
  **NÉM**.
- `webgl`: **`new WebglAddon()` phải nằm TRONG `try`** — constructor có một nhánh ném
  (Safari < 16). Để ngoài try thì cả terminal không dựng được, chứ không phải "rơi về DOM
  renderer" như ý định.
- ⛔ **Không nạp `@xterm/addon-image`.** Đường sixel bị chặn ở **ba tầng độc lập** (nguồn không
  phát byte sixel, tmux nuốt DCS, CSP chặn WASM), mỗi tầng tự nó đủ chặn, và **cả ba hỏng im
  lặng**. Giá của việc giữ nó là +20 KB gzip trả ở MỌI lượt tải, kể cả khi cờ tắt.
- `convertEol: false` — server đã gộp stderr vào stdout và PTY tự dịch `\n` → `\r\n`; bật ở
  client là dịch **lần hai**.
- `write(chunk: Uint8Array)` **ghi thẳng, không `TextDecoder` trước** — một glyph Nerd Font 3–4
  byte bị cắt qua ranh giới hai frame sẽ thành ký tự hỏng nếu decode từng frame.
- **`refitAfterFontLoad()` sau `waitForFonts()`, và `measure()` KHÔNG thay thế được.** xterm
  không theo dõi `document.fonts` (grep bản dist 6.0.0: 0 kết quả), nên không gọi thì terminal
  giữ số cột tính theo metric font **fallback** vĩnh viễn. Bảng đo (Chromium headless
  2026-09-08, container 640×320, fontSize 14): mở trước khi FontFace có ⇒ cell 7.7 → **81×18**;
  sau `_core._charSizeService.measure()` ⇒ cell 8.2 → **76×20**; đối chứng là một terminal mới mở
  sau đó, cũng 76×20. Gán lại `options.fontFamily`/`fontSize` là **no-op** (xterm dedup theo giá
  trị).

---

## 6. Hợp đồng khoang IDE

### 6.1 ⛔ Một lượt nạp duy nhất là SAI — đo trên cụm 2026-09-07

Bản trước gắn iframe NGAY khi có `sessionId` và coi sự kiện `load` là thành công. Cả hai vế đều
hỏng, và hỏng cùng lúc nên che nhau:

1. Phiên trả về lúc t+8s, Theia bind cổng 4000 ở **~t+20s**. Lượt nạp duy nhất ấy rơi thẳng vào
   giữa cửa sổ khởi động. Log gateway của lượt đo: đúng **một** dòng
   `dial tcp …:4000: connection refused`, rồi im lặng — không có lượt thử thứ hai nào.
2. **Thân 503 của gateway VẪN bắn `load`.** Nên trạng thái nhảy sang "đã nạp", lớp phủ "đang khởi
   động" biến mất, hạn 45s không bao giờ chạm, và người học nhìn một khối JSON thô
   (`{"code":"IDE_UNAVAILABLE"}`) nằm giữa khoang editor, **vĩnh viễn**. Bấm "Tải lại IDE" bằng
   tay thì Theia lên bình thường.

Tức IDE hỏng ở gần như **mọi** lần mở đầu tiên, trong khi gateway, ảnh sandbox và cờ layout đều
đúng. Chú thích ngay trên đoạn mã đã nói "`load` không chứng minh thành công" — nhưng mã vẫn dùng
`load` làm bằng chứng thành công. **Một lời cảnh báo đúng đặt cạnh một đoạn mã làm ngược lại thì
cảnh báo thua.**

### 6.2 Mệnh đề bắt buộc

**`fetch` chính URL đó trước; chỉ gắn `<iframe>` khi server trả 2xx.** Cùng origin ⇒
`connect-src 'self'` đã phủ; cookie phiên có `Path=/ide` nên đi kèm. Đây là một phép kiểm THẬT —
nó đọc **mã trạng thái**, thứ `load` không cho ta.

| Kết quả thăm dò | Xử lý |
|---|---|
| 2xx | `ready` ⇒ gắn iframe. Đây là **đường duy nhất** iframe được gắn |
| 5xx | "còn đang khởi động" ⇒ ngủ rồi thử lại |
| lỗi mạng / `fetch` ném | cùng nhóm với 5xx ⇒ thử lại |
| **mọi mã khác (401 / 403 / 404)** | **lỗi thật ⇒ DỪNG NGAY và NÊU MÃ** trong thông báo |

⛔ **Không `onLoad`.** `load` chưa bao giờ là bằng chứng thành công, và nay đã có bằng chứng thật
nên không cần cái giả.

Vì sao 4xx dừng ngay thay vì đốt hết hạn chờ: thử lại 22 lần cũng ra đúng kết quả đó, chỉ chậm
hơn — và một câu chung chung sau 45 giây là thứ không ai chẩn đoán được. Câu đúng là "máy chủ trả
HTTP 403 cho đường /ide".

| Hằng | Giá trị | Nguồn |
|---|---|---|
| nhịp thăm dò | **2s** | Đủ thưa để không ồn, đủ dày để không thêm độ trễ cảm nhận được |
| trần chờ (`IDE_BOOT_TIMEOUT_MS`) | **45s** | Khởi động nguội Theia **đo được ~20s** ở P6; 45s là ~2,2× số đó |
| chi phí | ~22 lượt GET trong 45s | Dưới xa tier `ratelimit-ide` (600/1m, burst 300) |

**Vòng lặp cần cả `cancelled` lẫn `AbortController`**: vòng còn **ngủ** giữa hai lượt, và một
`setState` sau khi component đã tháo là một cảnh báo React cộng một lần ghi vào state đã chết.

⚠ **`/ide` chưa từng đi qua Traefik trong repo này.** Mọi phép đo IDE của P6 dùng
`kubectl port-forward`; path ingress `/ide` và tier `ratelimit-ide` là **suy luận, chưa đo**.
Triệu chứng nếu sai không phải một thông báo rate-limit mà là **iframe trắng hoặc nạp nửa
chừng** — đó là lý do nút "Mở trong tab mới" là **đường thoát bắt buộc**, không phải tiện nghi:
khi iframe trắng, đó là chỗ duy nhất người dùng đọc được thông báo thật của máy chủ.

**Thông báo lỗi phải nói CHUYỆN GÌ + LÀM GÌ TIẾP**, và phải nói rằng **bài học vẫn làm được bằng
terminal** — chỉ thiếu trình soạn thảo. "Không tải được IDE" một mình là một ngõ cụt.

---

## 7. Cái ĐỔI ở P16 (thiết kế §8)

⚠ Câu mở của mục này, viết ngày 2026-09-10, là "năm thay đổi, và **không có thay đổi nào trong
§1–§6**". Vế sau **hết đúng** từ chỉ đạo 2026-09-13: §1, §3.1, §4 và §5.1 đều đã đổi (xem khối
đầu file). Năm mục dưới đây thì không đổi, và mục 2 nói về `SplitPane` chia NGANG, không phải
thanh kéo dọc đã bị gỡ.

Năm thay đổi:

1. **Trang lab và lesson vào immersive.** Hôm nay vỏ ứng dụng vẫn hiện đầy đủ trên trang lab (chỉ
   `/games/k8s` chạy immersive); thanh nav toàn cục ăn **56px** chiều cao trên một màn hình mà
   từng pixel dọc đều là một dòng terminal. Thay bằng một thanh mảnh mang đúng thứ cần: tên bài,
   tiến độ dạng cung, nút thoát.
   ⚠ Vỏ vẫn sở hữu **landmark `<main>` duy nhất** của toàn ứng dụng; trang immersive không render
   `<main>` của riêng nó.
2. **Chia đôi viết lại**, vẫn tự viết chứ không thêm thư viện, và **giữ nguyên** ranh giới §4
   (quyết định hình học ra ngoài React).
3. **`IdePane` chuyển từ `app/lessons/[id]/` sang `components/session/`.** Hôm nay lab **không**
   có tab Editor, và đó là lựa chọn có chủ ý được ghi trong mã, không phải thiếu sót — nhưng việc
   bật IDE cho bài nào là **quyết định nội dung**, không phải quyết định kiến trúc. Sau khi
   chuyển, `WorkspacePanel` không đổi một dòng: nó vốn chỉ nhận `editor?: ReactNode`.
4. **Bảng nhiệm vụ thành danh sách kiểm.** Hôm nay là một `<table>`. Nó phải đọc được như một
   checklist với **bốn** trạng thái phân biệt được bằng mắt: *chưa chấm*, *đang chấm*, *đạt*,
   **và *hỏng hạ tầng* — khác hẳn *chưa đạt***.
   ⚠ Tầng dữ liệu **đã phân biệt đúng rồi**; chỉ phần nhìn chưa nói ra. Đây là lỗi giao diện
   thuần: đừng đi sửa tầng dữ liệu. Vì sao nó quan trọng: một ô "chưa đạt" bảo người học đi sửa
   bài làm của mình, trong khi thứ hỏng là cụm — họ sẽ sửa một thứ không sai, rất lâu.
5. **Khoang IDE: logic §6 giữ nguyên, phần nhìn màn hình chờ làm lại.** Hai mươi giây nhìn một
   khối xám đọc ra là trang hỏng, không phải là chờ.

---

## 8. Ô nghiệm thu

Mọi ô dưới đây phải **viết TRƯỚC khi dựng lại khoang**, không phải sau. Lý do nằm ở §1.2: hỏng
kiểu này im lặng và người phát hiện là người học.

⚠ Mỗi ô kèm một **đối chứng dương** — một biến thể chứng minh ô đó **đỏ được**. Không có nó thì
một ô test luôn xanh (query trượt, render hỏng, môi trường sai) đọc ra y hệt một ô test đang gác.
File cần DOM đặt `// @vitest-environment jsdom` ở **dòng 1**.

**Hai file test, không phải một, và trích dẫn lệch nhau trong mã cũ là ĐÚNG.** Kiểm ngày
2026-09-10: cả hai đều tồn tại và làm hai việc khác nhau.

| File | Cơ chế | Đo được cái gì |
|---|---|---|
| `workspace-panel.dom.test.tsx` | `// @vitest-environment jsdom` + RTL + `userEvent` | DOM thật, node thật |
| `workspace-panel.test.tsx` | `renderToStaticMarkup` | Chuỗi HTML tĩnh |

⛔ **AC-1 chỉ đặt được ở file `.dom.test.tsx`.** `renderToStaticMarkup` trả về một **chuỗi**,
không có node nào để so `toBe`. Viết AC-1 vào file tĩnh là viết một ô test không thể đo thứ nó
tuyên bố đo. AC-2 thì đặt được ở cả hai, nhưng vế "quét toàn bộ cây ở cả hai tab" cần DOM.

### AC-1 — terminal giữ NGUYÊN node cha khi đổi tab ⛔ ô quan trọng nhất

```
render panel với hasEditor=true, activeTab='editor'
  → giữ tham chiếu: const before = getByTestId('terminal-slot')
  → giữ luôn:       const beforeParent = before.parentElement
rerender với activeTab='terminal'
  → const after = getByTestId('terminal-slot')
  → expect(after).toBe(before)                       // CÙNG MỘT node, so danh tính
  → expect(after.parentElement).toBe(beforeParent)   // CÙNG MỘT cha
rerender ngược lại activeTab='editor' → hai khẳng định trên lặp lại
```

⚠ Phải so bằng `toBe` (danh tính tham chiếu), **không** `toEqual` và **không** đếm số phần tử:
sau khi unmount + mount lại thì `getByTestId` vẫn tìm thấy **một** phần tử hợp lệ — đúng thứ làm
lỗi này im lặng.

**Đối chứng dương:** một `describe` phụ render một component *cố ý sai* (hàng terminal đặt dưới
một nhánh `activeTab === 'terminal' ? A : B`, hoặc hàng 1 render có điều kiện `hasEditor && …`)
và khẳng định `expect(after).not.toBe(before)`. Nếu ca này **không** đỏ khi chạy với component
thật, thì cách đo danh tính đang mù và AC-1 không chứng minh gì.

### AC-2 — hàng editor vắng mặt vẫn được render, kèm `hidden`, không mang tiện ích `display`

```
render với editor=undefined (bài không có IDE)
  → hàng 1 CÓ TRONG DOM (queryByTestId('editor-slot') !== null)
  → hàng 1 có thuộc tính `hidden`
  → className của hàng 1 KHÔNG chứa bất kỳ token nào trong DISPLAY_UTILITIES
lặp lại với editor=<div/>, activeTab='terminal'  (hàng 1 có nội dung nhưng đang ẩn)
quét TOÀN BỘ cây ở CẢ HAI tab:
  → mọi phần tử [hidden] đều không mang token display nào
```

`DISPLAY_UTILITIES` là một mảng **xuất ra được** để test đọc: `block`, `inline-block`, `inline`,
`flex`, `inline-flex`, `grid`, `inline-grid`, `table`, `table-cell`, `contents`, `flow-root`,
`list-item`. So sánh theo **token** (tách `className` theo khoảng trắng), không `includes` chuỗi
— `includes('flex')` trúng cả `flex-1`, `min-h-0 flex-col`, và sẽ bị nới ra cho tới lúc không gác
gì nữa.

**Đối chứng dương (hai vế, cần cả hai):**
- *Bộ quét hoạt động*: dựng một cây giả `<div hidden className="flex" />` và khẳng định bộ quét
  **đỏ**. Không có vế này thì một bộ quét luôn trả mảng rỗng cũng làm AC-2 xanh.
- *Query trúng đích*: khi `activeTab='editor'` và có editor, khẳng định hàng 1 **KHÔNG** mang
  `hidden`. Không có vế này thì một `queryByTestId` trượt (trả `null`) cũng làm vế "có `hidden`"
  xanh một cách rỗng tuếch.

⚠ Từ SỬA ĐỔI 3, phép quét "toàn bộ cây ở cả hai tab" **bắt buộc phải chạm hàng 2**: hàng terminal
nay cũng mang `hidden` (ở tab Editor), nên nó đã trở thành đối tượng của AC-2 chứ không chỉ hàng
1. Đây là chỗ AC-2 và §2 gặp nhau: §1.1 cho phép `hidden`, còn AC-2 gác việc `hidden` đó không bị
một tiện ích `display` vô hiệu trong im lặng.

### AC-3 — hai hàng ẩn NGƯỢC nhau, không tổ tiên nào bị ẩn, node luôn còn sống

⚠ **Ô này ĐỔI NGHĨA ở SỬA ĐỔI 3.** Bản trước khẳng định "hàng terminal KHÔNG BAO GIỜ mang
`hidden`"; mệnh đề đó nay sai và không còn nên đúng (§1.1). Thứ còn nguyên là **ba** vế khác
nhau, và phải khẳng định cả ba:

```
với mọi tổ hợp (hasEditor ∈ {true,false}) × (activeTab ∈ {editor,terminal}):
  → expect(terminalRow.hidden).toBe(hasEditor && activeTab === 'editor')
       // ẩn ĐÚNG KHI editor đang chiếm khoang, không lúc nào khác
  → không TỔ TIÊN nào của hàng terminal mang `hidden`
  → node terminal `isConnected === true`      // ẩn ≠ gỡ khỏi cây
```

Vế **tổ tiên** gác một lỗi khác hẳn vế thứ nhất: một `hidden` đặt nhầm lên ngăn xếp dọc thay vì
lên đúng một hàng sẽ ẩn terminal ở CẢ HAI tab, không lỗi không log. Vế **`isConnected`** là vế
phân biệt `hidden` (an toàn) với unmount (đóng WebSocket của người học); nó là chỗ AC-3 nối vào
§1.1.

⚠ Vế tổ tiên chỉ nói được trên DOM sống. Markup tĩnh cho biết thẻ nào mang `hidden`, nhưng "thẻ
đó có phải tổ tiên của hàng terminal không" là câu hỏi về **cây**, không phải về chuỗi.

**Đối chứng dương (hai vế, cần cả hai):**
- *Phép dò đọc được DOM*: hàng 1 phải bị bắt là ẩn ở tab Terminal. Không có vế này thì một phép
  dò luôn trả `false` cũng làm mọi ô trên xanh.
- *Chiều mới cũng được gác*: hàng 2 phải bị bắt là ẩn ở tab Editor. Thiếu vế này thì một bản cài
  đặt **quên hẳn** `hidden={editorVisible}` vẫn xanh, tức đúng cái hồi quy mà SỬA ĐỔI 3 sinh ra
  để chặn.

✅ **Đã đo, không phải suy luận (2026-09-13):** gỡ `hidden={editorVisible}` khỏi
`workspace-panel.tsx` làm **4 ô đỏ**, trải trên **cả hai** file test. Nên cổng này đỏ được, không
phải một ô xanh trang trí. Ô nào đỏ thì tra ở bảng ngay dưới; nếu một lượt sửa sau này làm con số
đó tụt xuống 0, thứ hỏng là phép kiểm chứ không phải mã.

Ô hiện có, để ai sửa tiếp biết mình đang đụng vào đâu:

| File | Ô |
|---|---|
| `workspace-panel.dom.test.tsx` | describe `AC-3 — không TỔ TIÊN nào của hàng terminal bị ẩn, và node luôn còn sống` (bốn tổ hợp + hai đối chứng dương ngược chiều nhau) |
| `workspace-panel.dom.test.tsx` | `hai hàng loại trừ nhau: tab Editor ẩn terminal, tab Terminal ẩn editor` |
| `workspace-panel.test.tsx` | describe `§Y1 — terminal KHÔNG đổi cha; hai hàng loại trừ nhau`, gồm `node terminal luôn có trong markup, và hai hàng ẩn/hiện NGƯỢC nhau` và `hàng terminal luôn ở CÙNG vị trí con trong ngăn xếp (con thứ 2)` |
| `workspace-panel.test.tsx` | describe `SỬA ĐỔI 3 — khoang chỉ có một hàng hiện, và không còn thanh kéo`, gồm `không còn separator nào ở BẤT KỲ tổ hợp nào` |

⚠ Mọi ô §Y6 cũ về thanh kéo (kéo bằng chuột, bằng phím, kẹp phần trăm) **đã bị xoá cùng tính
năng**. Không khôi phục; xem bảng thu hồi ở §4.2.

### AC-4 — bảng vào/ra của các hàm thuần (không cần DOM)

`workspaceLayoutToken`, `resolveActiveTab`, `isEditorVisible`, `listWorkspaceTabs`,
`nextTabOnKey`, `workspaceStorageKey`, `parseWorkspaceState`. Ít nhất phải có các ca:
`hasEditor=false` luôn ra `'terminal-full'`; chuyển tab **ĐỔI** chuỗi còn cùng tab ra **CÙNG**
chuỗi (không fit thừa); phím ngoài khuôn ra `null`; khoá `:ide` ≠ khoá `:plain`; bản ghi mô hình
cũ (`{"activeTab":"terminal-1"}`) ra `null`.

⛔ **Ca bắt buộc của SỬA ĐỔI 3 — bản ghi cũ KHÔNG bị từ chối cả gói:**

```
parseWorkspaceState('{"activeTab":"terminal","terminalPercent":70}')
  → { activeTab: 'terminal' }        // bỏ trường thừa, KHÔNG trả null
parseWorkspaceState('{"terminalPercent":40}')
  → null                             // thiếu activeTab thì vẫn từ chối
```

Đây là một lựa chọn **cố ý**, không phải một chỗ lỏng tay. Một bản ghi còn `terminalPercent` vẫn
khai đúng cái tab mà người dùng đã chọn; trường thừa chỉ mô tả một thanh kéo không còn tồn tại.
Từ chối cả bản ghi sẽ làm mọi người đang dùng mất tab đã nhớ ở đúng lượt cập nhật này, tức một
hồi quy im lặng đổi lấy đúng con số không. Ngược lại, một `activeTab` **không hợp lệ** vẫn phải ra
`null`: im lặng chấp nhận nó sẽ mở bài ở một trạng thái không ai chọn.

⚠ Hai ca đã rời khỏi danh sách này cùng thanh kéo: "phần trăm không vào chuỗi khi hàng 1 ẩn" và
"`clampTerminalPercent(NaN)` ra 40". Không có hàm nào để gọi nữa; đừng dựng lại ô test theo trí
nhớ.

**Đối chứng dương:** ca khẳng định hai id hợp lệ **vẫn được nhận** — không có nó thì một hàm luôn
trả `false`/`null` cũng làm mọi ca "từ chối" xanh.

### AC-5 — fit chạy sau khi bố cục đổi, và chỉ khi đó

Gọi `runFitAfterLayout` với một `schedule` giả (chạy `run` đồng bộ) và một handle giả đếm số lần
`fit()`. Khẳng định: `handle === null` ⇒ trả `undefined`, không gọi gì; đổi `layout` ⇒ đúng **1**
lượt fit; hàm dọn dẹp trả về được gọi thì `cancel` chạy.
**Đối chứng dương:** một ca render lại với **cùng** `layout` và khẳng định số lượt fit **không
tăng** — không có nó thì một effect chạy mỗi lượt render cũng xanh.

### AC-6 — đa terminal vẫn vắng mặt (chuyển thẳng từ `single-terminal-contract.test.ts`)

Ba mệnh đề ở §3.2, giữ nguyên cả phần chú thích nói rõ **hàng giữa chỉ đỏ ở `typecheck`**.
**Đối chứng dương:** ca khẳng định phép kiểm nhìn **đúng thư mục** (một file cạnh nó có thật) —
không có nó thì `import.meta.dirname` trỏ sai chỗ sẽ làm mọi ca "file không tồn tại" xanh **vì
mù, không phải vì sạch**.

### AC-7 — bàn phím và a11y trên `/labs/:id` và `/lessons/:id`

Nằm trong cổng bàn phím của lane L8 (mở từ 4 lên tối thiểu 10 màn). Bắt buộc gồm: đi được vào và
**thoát được focus khỏi terminal bằng bàn phím**; roving tabindex trên thanh tab (đúng **một** tab
trong vòng `Tab`, mũi tên đi giữa các tab); 0 lỗi axe mức serious/critical.

⚠ Vế "thanh kéo nhận `Tab` khi hiện và không nhận khi ẩn (`tabIndex={editorVisible ? 0 : -1}`)"
đã bị **thu hồi** cùng thanh kéo. Thay vào đó là một mệnh đề ngược dấu: **không được còn
`role="separator"` nào** trong DOM lẫn trong cây trợ năng, ở bất kỳ tổ hợp
`hasEditor` × `activeTab` nào. Một thanh kéo không bao giờ hiện được vẫn ngốn một chặng `Tab`
trong ngân sách 30 lần mà cổng bàn phím gác.

### AC-8 — khoang IDE

Với `fetch` giả: 503 rồi 200 ⇒ iframe gắn **đúng một lần**, sau lượt 200; 403 ⇒ **không** iframe,
`role="alert"`, và **chuỗi thông báo chứa "403"**; quá hạn ⇒ thông báo nêu số giây; unmount giữa
chừng ⇒ không có `setState` nào sau đó.
**Đối chứng dương:** ca 200-ngay-lượt-đầu phải gắn iframe — không có nó thì một component không
bao giờ gắn iframe cũng làm mọi ca "không gắn" xanh.

---

## Liên quan

- `plans/reports/2026-09-10-p16-frontend-rebuild-design.md` §6.1, §8, §10 mục 8, §11 hàng 1
- `contracts/p16-tokens.md`, `contracts/p16-copy.md` — hai SSOT còn lại của đợt fan-out
- `rules/contract-first-integration.md` — vì sao ba file này phải commit trước khi spawn lane
- `rules/parallel-teammate-git-index-race.md` — mỗi lane một `git worktree`; lượt ghi thứ hai vào
  cùng working tree **đè** lượt đầu, không dấu xung đột, không lỗi biên dịch
- `rules/green-that-proves-nothing.md` — vì sao mỗi ô ở §8 phải kèm đối chứng dương
