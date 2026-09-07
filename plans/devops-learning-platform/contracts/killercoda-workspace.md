# Hợp đồng tích hợp — khung làm việc kiểu KillerCoda

SSOT cho 6 lane chạy song song. **Không lane nào được đổi các shape dưới đây.**
Thấy sai thì BÁO, đừng tự sửa — bản sửa đơn phương làm 5 lane kia hỏng lúc chạy
mà typecheck của từng lane vẫn xanh.

## C0 — Kỷ luật git (BẮT BUỘC)

Sáu lane dùng CHUNG một working tree. Vì vậy:

- ⛔ **KHÔNG chạy bất kỳ lệnh git nào.** Không `add`, không `commit`, không
  `checkout`, không `stash`. Lead commit tập trung.
- ⛔ **Chỉ sửa file trong danh mục sở hữu của lane mình.** File không có tên
  trong danh mục đó là của lane khác; đụng vào là ghi đè im lặng (không có dấu
  xung đột, không lỗi biên dịch — chỉ mất việc của người kia).
- Cần một file ngoài danh mục ⇒ báo lại, không tự sửa.

## C1 — Đích thực thi (`ExecTarget`)

`packages/scenario/src/content-blocks.ts` (Lane B sở hữu):

```ts
export const EXEC_TARGETS = ['terminal-1', 'terminal-2'] as const;
export type ExecTarget = (typeof EXEC_TARGETS)[number];
```

`ContentBlock` biến thể `'code'` thêm ĐÚNG một trường:

```ts
{
  kind: 'code';
  code: string;
  language: string | null;
  action: CodeAction;
  inline: boolean;
  /** null = "terminal đang hoạt". Chỉ khác null khi bài khai T1/T2 tường minh. */
  target: ExecTarget | null;
}
```

Cú pháp trong markdown (mở rộng của cú pháp đang có, KHÔNG phá cái cũ):

| Viết | action | target |
|---|---|---|
| `` `cmd`{{exec}} `` | `exec` | `null` |
| `` `cmd`{{exec interrupt}} `` | `exec-interrupt` | `null` |
| `` `cmd`{{exec T1}} `` | `exec` | `'terminal-1'` |
| `` `cmd`{{exec T2}} `` | `exec` | `'terminal-2'` |
| `` `cmd`{{exec T2 interrupt}} `` | `exec-interrupt` | `'terminal-2'` |

Thứ tự token cố định: `exec` → `T<n>` (tuỳ chọn) → `interrupt` (tuỳ chọn).
Token lạ ⇒ ném `ContentBlockError` như hiện nay. `{{copy}}` và `{{}}` giữ
`target: null`.

## C2 — `onExec`

`packages/ui/src/lesson/content-view.tsx` + `code-block.tsx` (Lane C sở hữu):

```ts
export interface ExecOptions {
  readonly interrupt: boolean;
  /** null = terminal đang hoạt (Terminal 1 nếu người dùng đang ở tab Editor). */
  readonly target: ExecTarget | null;
}

readonly onExec?: (command: string, options: ExecOptions) => void;
```

⛔ Chữ ký cũ `(command: string, interrupt: boolean)` bị THAY, không giữ song
song. Hai chữ ký cùng tồn tại là chỗ để một call-site cũ lọt qua im lặng.

## C3 — `TerminalHandle.fit()`

`packages/terminal/src/terminal-surface.tsx` (Lane D sở hữu):

```ts
export interface TerminalHandle {
  sendInput(data: string): void;
  focus(): void;
  /**
   * Đo lại kích thước và fit. BẮT BUỘC gọi khi tab chứa terminal chuyển từ
   * ẩn sang hiện: xterm đo được 0×0 trên phần tử `display:none`, nên nếu
   * không gọi thì terminal hiện ra với số cột sai.
   */
  fit(): void;
}
```

## C4 — Bộ công cụ theo bài (`toolset`)

Danh mục cố định (Lane B sở hữu định nghĩa, Lane A sở hữu bản cài):

```ts
export const SANDBOX_TOOLS = [
  'btop', 'tldr', 'ripgrep', 'fd', 'duf', 'ncdu', 'delta', 'yq',
] as const;
export type SandboxTool = (typeof SANDBOX_TOOLS)[number];
```

- **Scenario JSON**: khoá top-level `"toolset": ["btop", "yq"]`. Vắng mặt ⇒ `[]`.
- **DTO / kiểu Scenario|Lab|Playground**: `readonly toolset: readonly string[]`
  (mảng rỗng = không bật gì; KHÔNG dùng `null`).
- **Cột DB**: `toolset` kiểu `text`, chứa **chuỗi JSON của mảng**, mặc định `'[]'`.
- **Đường bật trong pod**: `dlp-tools enable <tool>...` (Lane A cung cấp).

⚠ Vì sao không truyền qua env lúc tạo pod: pod đến từ **warm pool**, tạo TRƯỚC
khi biết bài nào sẽ dùng. Nên việc bật công cụ phải xảy ra lúc **setup phiên**,
đi cùng đường với `buildAssetPushScript` trong `lessons.runSetup`.

## C5 — Mô hình tab của `WorkspacePanel`

Lane E sở hữu. Lane F chỉ tiêu thụ.

```ts
export type WorkspaceTabId = 'editor' | 'terminal-1' | 'terminal-2';

export interface WorkspacePanelProps {
  /** Vắng mặt ⇒ không có tab Editor (bài không khai layout ide). */
  readonly editor?: ReactNode;
  /** Nội dung mỗi tab terminal, theo id. */
  readonly terminals: ReadonlyMap<WorkspaceTabId, ReactNode>;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** Bấm '+' — vắng mặt ⇒ ẩn nút. */
  readonly onAddTerminal?: () => void;
  readonly onCloseTerminal?: (tab: WorkspaceTabId) => void;
  /** Chế độ tách đôi: Editor | terminal đang hoạt. */
  readonly split: boolean;
  readonly onToggleSplit: () => void;
  /** URL mở tab hiện tại ra cửa sổ trình duyệt riêng. null ⇒ ẩn nút. */
  readonly popOutUrl: string | null;
  readonly storageKey?: string;
}
```

**Bất biến sống-chết:** mọi tab được render CÙNG LÚC và giữ mounted; tab không
hoạt ẩn bằng thuộc tính `hidden` (hoặc `display:none`). ⛔ TUYỆT ĐỐI không render
có điều kiện — unmount terminal là đóng WebSocket (mất phiên), unmount iframe IDE
là khởi động nguội Theia lại ~20 giây.

## C6 — Đa terminal = tmux window (không phải WebSocket thứ hai)

`GATEWAY_MAX_WS_PER_SESSION` giữ nguyên **1**. Tab terminal thứ 2 KHÔNG mở
WebSocket mới. Nó gửi vào WS đang có:

```
Terminal 1  →  \x02 1                    (prefix Ctrl-B, rồi phím '1')
Terminal 2  →  \x02 2
tạo tab N   →  \x02 :new-window -t N\r   (dấu nhắc lệnh tmux + Enter)
```

⛔ **Việc TẠO window phải NÊU chỉ số.** Bản đầu của hợp đồng này ghi `\x02 c`; đó là
một lỗi, hai lane độc lập tìm ra và không lane nào tự sửa (đúng §C0). `c` không chọn
chỉ số — tmux lấy chỗ trống kế tiếp — trong khi bảng tab ánh xạ CỨNG `terminal-2 → 2`.
Người học chỉ cần tự gõ `Ctrl-B c` (một phím tắt tmux bình thường, không ai chặn) là
tmux đã có window 2, nên nút '+' tạo window **3** dưới tên `terminal-2`, và từ đó mọi
`{{exec T2}}` chạy trong một window vô hình. Không lỗi, không cảnh báo.

Nêu chỉ số giữ được hợp đồng ở cả hai nhánh: chỉ số trống thì tmux tạo đúng chỗ; chỉ
số đã bị chiếm thì lệnh lỗi (`index in use`, vô hình vì `status off`) nhưng window N
vẫn có thật và dùng được, nên lượt `\x02 N` ngay sau chọn đúng nó.

⛔ Đừng thêm `-k`: nó GIẾT window đang chiếm chỗ, tức xoá phiên làm việc người dùng tự
mở — đổi một lỗi im lặng lấy mất dữ liệu.

~~Nút `×` đóng tab vẫn ẩn: đóng được thì còn vế tái dùng chỉ số, và vế đó chưa có phép
kiểm nào.~~

⛔ **ĐOẠN GẠCH TRÊN ĐÃ BỊ THU HỒI — đừng nhận việc từ nó.** SỬA ĐỔI 2 §Y4/§Y5
(2026-09-07, thực thi ở `867c55e`) đã XOÁ nút `×`, nút `+`, tab `terminal-2`,
bảng ánh xạ tab→window, `isClosableTab`, và cả `tmux-control.ts` mà hai đoạn
ngay dưới còn trỏ tới. `WorkspaceTabId` nay là `'editor' | 'terminal'`.

**Không còn chỉ số nào để tái dùng**, và `{{exec T<n>}}` nay NÉM
`ContentBlockError` (§Y2) — nên cả ba vế lo ngại của §C6 đã đóng bằng cách GỠ
BỎ, không phải bằng cách gác thêm.

Ngày 2026-09-08 một lượt giao việc đã đọc đúng đoạn bị gạch trên rồi giao lại
nhiệm vụ đã chết ấy cho một lane. Từ nay mặt tiếp xúc đa terminal được gác bởi
`apps/web/src/components/session/single-terminal-contract.test.ts`; muốn khôi
phục đa terminal thì **thu hồi §Y2/§Y4/§Y5 trước**, đừng nới phép kiểm đó.

Chuỗi điều khiển tmux là **hằng số phía client**, đặt tại một chỗ duy nhất trong
`apps/web/src/components/session/tmux-control.ts` (Lane E sở hữu).

⚠ `.tmux.conf` đang đặt `base-index 1`, nên window đầu tiên là **1**, không phải
0. Đổi `base-index` sẽ làm bảng trên sai.

⚠ Giới hạn đã chấp nhận: chế độ tách đôi chỉ hiện **Editor | terminal đang
hoạt**. Hai terminal cạnh nhau là bất khả với một WS + tmux window — đừng thiết
kế cho nó.

## C7 — Route toàn màn hình

| Đường | Nội dung |
|---|---|
| `/ide/session/<id>/` | ĐÃ CÓ (gateway phục vụ Theia). Không tạo route Next mới |
| `/session/<id>/terminal` | MỚI — trang Next chỉ có xterm, không vỏ, không nav |

Lane E sở hữu route mới.

---

# SỬA ĐỔI 2 (2026-09-07) — MỘT terminal duy nhất, hiện ở CẢ HAI tab

Người dùng chốt sau khi bản đầu đã land. Phần này **GHI ĐÈ** §C1, §C2, §C5, §C6.
Chỗ nào mâu thuẫn, phần này thắng.

## Mô hình

Hai tab, và **một** phiên terminal:

```
TAB EDITOR                      TAB TERMINAL
┌──────────────────┐            ┌──────────────────┐
│ Theia (iframe)   │            │                  │
│ cây file+editor  │            │  CÙNG terminal   │
├──────────────────┤            │  toàn khoang     │
│ CÙNG terminal    │            │                  │
│ (neo đáy, ~40%)  │            │                  │
└──────────────────┘            └──────────────────┘
```

Tab Editor **đã là** bố cục hai khoang, nên nút "tách đôi" của bản đầu bị xoá —
nó chỉ còn là một cách thứ hai để làm đúng thứ tab Editor đang làm.

## Y1 — ⛔ Terminal KHÔNG được đổi cha trong cây React

Đây là điều kiện đúng-sai của cả sửa đổi, không phải một tối ưu.

Dời một component giữa hai cha là **unmount + mount lại** — WebSocket đóng, phiên
làm việc của người học mất. Nên khoang phải là MỘT ngăn xếp dọc cố định:

- hàng 1: iframe Theia — `hidden` khi đang ở tab Terminal
- hàng 2: terminal — **LUÔN hiện**, chỉ đổi chiều cao

Terminal không bao giờ rời vị trí DOM của nó. Chuyển tab chỉ đổi hai thứ: iframe
ẩn/hiện, và chiều cao hàng 2 (≈40% → 100%).

⚠ Đổi chiều cao là đổi kích thước ⇒ **phải gọi `handle.fit()`** sau khi trình
duyệt layout xong (qua `requestAnimationFrame`, không phải ngay trong nhịp
render). Bỏ nó thì terminal giữ số cột của bố cục cũ.

⚠ Bẫy CSS còn nguyên: `[hidden]{display:none}` là luật trình duyệt,
`.flex{display:flex}` là luật tác giả — cùng độ đặc hiệu thì tác giả thắng, nên
`<div hidden className="flex">` VẪN HIỆN và không báo gì. Giữ ca test quét mọi
thẻ ở cả hai tab.

⚠ Hàng 1 phải LUÔN được render kể cả khi bài không có Editor (chỉ `hidden`), vì
React so trùng con tĩnh theo VỊ TRÍ: bỏ hẳn hàng 1 sẽ đẩy hàng 2 lên khớp vị trí
của nó và unmount xterm.

## Y2 — GỠ `ExecTarget` (ghi đè §C1)

Một terminal thì không còn quyết định định tuyến. Xoá `EXEC_TARGETS`,
`ExecTarget`, và trường `target` trên biến thể `'code'` của `ContentBlock`.

Cú pháp về tập cũ: `{{}}`, `{{copy}}`, `{{exec}}`, `{{exec interrupt}}`.

⛔ `{{exec T1}}` / `{{exec T2}}` nay phải **NÉM** `ContentBlockError` như mọi
token lạ — KHÔNG lặng lẽ bỏ qua phần `T2`. Một bài viết `{{exec T2}}` đang mong
đợi hai terminal; chấp nhận rồi chạy ở terminal duy nhất là đúng cú pháp và sai
ý định người soạn. Giữ **một ca test** khẳng định nó ném.

## Y3 — `onExec` về hai tham số (ghi đè §C2)

```ts
readonly onExec?: (command: string, interrupt: boolean) => void;
```

Xoá `ExecOptions` (gồm `index.ts` + `exports.contract.test.ts`) và badge `T1`/`T2`
trên nút chạy cùng nhãn a11y đi kèm.

**Exec KHÔNG chuyển tab.** Terminal luôn hiện ở cả hai tab, nên không có gì để
chuyển tới — chỉ gõ rồi `focus()`. Đây là chỗ sửa đổi này rẻ hơn bản đầu: bản đầu
phải chuyển tab trước rồi mới gõ, và nhánh "tab chưa tồn tại" còn phải chờ một
khoảng phỏng đoán.

## Y4 — Props (ghi đè §C5)

```ts
export type WorkspaceTabId = 'editor' | 'terminal';

export interface WorkspacePanelProps {
  /** Vắng mặt ⇒ không có tab Editor (bài không khai layout ide). */
  readonly editor?: ReactNode;
  readonly terminal: ReactNode;
  readonly activeTab: WorkspaceTabId;
  readonly onActivate: (tab: WorkspaceTabId) => void;
  /** URL mở tab hiện tại ra cửa sổ trình duyệt riêng. null ⇒ ẩn nút. */
  readonly popOutUrl: string | null;
  readonly storageKey?: string;
}
```

Xoá `terminals` (Map), `onAddTerminal`, `onCloseTerminal`, `split`,
`onToggleSplit`, nút `+`, nút `×`, `isClosableTab`.

**Bài không khai `layout: ide`:** không truyền `editor` ⇒ không có tab Editor ⇒
thanh tab chỉ còn một mục. Cân nhắc ẩn hẳn thanh tab khi chỉ có một tab — một
tablist một mục là nhiễu thị giác, không phải chức năng.

## Y5 — XOÁ HẲN `tmux-control.ts` (ghi đè §C6)

Không đổi window nữa ⇒ `tmux-control.ts` + `tmux-control.test.ts` không còn
call-site. Xoá cả hai và export khỏi `components/session/index.ts`.
`NEW_WINDOW_SETTLE_MS` biến mất theo — và **cái đua nó che cũng biến mất**, chứ
không phải bị giấu: không tạo window mới thì không có `stty` nào xả input đang
chờ trong pty.

⚠ `.tmux.conf` trong image GIỮ NGUYÊN. tmux vẫn là cơ chế reconnect (D3):
`tmux new-session -A -s dlp` cho phép mất mạng rồi vào lại attach đúng phiên cũ.
Đó là thứ khác hẳn với thứ vừa bỏ.

## Y6 — Chiều cao khoang terminal ở tab Editor

Người dùng kéo được, nhớ theo `storageKey`. Mặc định ~40%. Dùng `SplitPane` dọc
sẵn có nếu nó hỗ trợ; nếu không thì một handle kéo tối giản — ⛔ nhưng tuyệt đối
không dựng bằng cách render terminal ở hai nhánh khác nhau (xem §Y1).
