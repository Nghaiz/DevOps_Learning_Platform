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

Nút `×` đóng tab vẫn ẩn: đóng được thì còn vế tái dùng chỉ số, và vế đó chưa có phép
kiểm nào.

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
