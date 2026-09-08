import { describe, expect, it } from 'vitest';
import * as UI from './index.ts';

/**
 * Cổng hợp đồng C2 (`plans/devops-learning-platform/phase-13-exec.md` §2) cho
 * BỀ MẶT EXPORT của `packages/ui`.
 *
 * Vì sao cần: bảng C2 là hợp đồng giữa 13.A và **tám lane Đợt 2** viết song
 * song, mỗi lane trong một context riêng không nhìn thấy code của lane khác.
 * Xoá một export hoặc đổi một prop bắt buộc thành tuỳ chọn ở đây KHÔNG làm
 * `packages/ui` đỏ — nó chỉ làm lane nào đó ở Đợt 2 vỡ, muộn hơn nhiều và ở
 * một nơi trông như lỗi của họ. Một danh sách kiểm tay thì mục ruỗng theo
 * thời gian; danh sách này hỏng thì **`tsc --noEmit` đỏ**.
 *
 * Hai tầng, cố ý:
 *
 * - **Tầng kiểu** (bắt lúc `pnpm typecheck`): mọi khẳng định `const _x: … =`
 *   dưới đây. Object literal gán vào một kiểu prop được TypeScript kiểm
 *   *excess property* — bỏ một prop khỏi component thì literal khai prop đó
 *   thành lỗi biên dịch. `Requires<>` bắt chiều ngược lại: prop bắt buộc bị
 *   nới thành tuỳ chọn.
 * - **Tầng runtime** (bắt lúc `pnpm test`): `EXPORTED_NAMES` đối chiếu với
 *   namespace thật. Bắt trường hợp `index.ts` quên `export` một component vẫn
 *   tồn tại — tầng kiểu không thấy vì nó import từ chính `index.ts` và tên đó
 *   đơn giản là không có ở cả hai phía.
 */

// ─── Toolkit kiểu ────────────────────────────────────────────────────────────

/** `Pick<P, K>` của một prop tuỳ chọn thì `{}` gán được vào ⇒ false. */
type IsRequired<P, K extends keyof P> = Record<string, never> extends Pick<P, K> ? false : true;

/** Đỏ ở `tsc` nếu bất kỳ khoá nào trong `K` không còn BẮT BUỘC trên `P`. */
type Requires<P, K extends keyof P> = { [Key in K]: IsRequired<P, Key> extends true ? true : never };

type PropsOf<C> = C extends (props: infer P) => unknown ? P : never;

// ─── Button — C2 dòng 1 ──────────────────────────────────────────────────────

/**
 * `variant` phải giữ ĐỦ 6 giá trị (ba cái cũ `primary|secondary|ghost` là
 * tương thích ngược với route đang chạy; ba cái mới do C2 thêm) và `size` đủ
 * 4 giá trị kể cả `icon`. Liệt kê từng giá trị một chứ không `as const` gộp:
 * xoá một nhánh khỏi union làm ĐÚNG dòng đó đỏ, chỉ tên biến thể đã mất.
 */
const _buttonVariantPrimary: UI.ButtonVariant = 'primary';
const _buttonVariantSecondary: UI.ButtonVariant = 'secondary';
const _buttonVariantOutline: UI.ButtonVariant = 'outline';
const _buttonVariantGhost: UI.ButtonVariant = 'ghost';
const _buttonVariantDestructive: UI.ButtonVariant = 'destructive';
const _buttonVariantLink: UI.ButtonVariant = 'link';
const _buttonSizeSm: UI.ButtonSize = 'sm';
const _buttonSizeMd: UI.ButtonSize = 'md';
const _buttonSizeLg: UI.ButtonSize = 'lg';
const _buttonSizeIcon: UI.ButtonSize = 'icon';

const _buttonProps: UI.ButtonProps = {
  variant: 'destructive',
  size: 'icon',
  loading: true,
  asChild: false,
  disabled: true,
  onClick: () => {},
  children: null,
};

// ─── Input / Textarea / Label / Badge ────────────────────────────────────────

const _inputProps: UI.InputProps = { invalid: true, disabled: false, value: '', onChange: () => {} };
const _textareaProps: UI.TextareaProps = { invalid: true, disabled: false, rows: 3 };
const _labelProps: UI.LabelProps = { htmlFor: 'field-id', children: 'Nhãn' };

const _badgeVariantDefault: UI.BadgeVariant = 'default';
const _badgeVariantSecondary: UI.BadgeVariant = 'secondary';
const _badgeVariantSuccess: UI.BadgeVariant = 'success';
const _badgeVariantWarning: UI.BadgeVariant = 'warning';
const _badgeVariantDestructive: UI.BadgeVariant = 'destructive';
const _badgeVariantOutline: UI.BadgeVariant = 'outline';

// ─── Alert / Spinner ─────────────────────────────────────────────────────────

const _alertVariantDefault: UI.AlertVariant = 'default';
const _alertVariantWarning: UI.AlertVariant = 'warning';
const _alertVariantDestructive: UI.AlertVariant = 'destructive';
const _alertVariantSuccess: UI.AlertVariant = 'success';

const _spinnerSizeSm: UI.SpinnerSize = 'sm';
const _spinnerSizeMd: UI.SpinnerSize = 'md';
const _spinnerSizeLg: UI.SpinnerSize = 'lg';

// ─── CursorPager / EmptyState / ErrorState — C2 khai prop tường minh ─────────

const _cursorPagerProps: UI.CursorPagerProps = {
  hasNext: true,
  onNext: () => {},
  onReset: () => {},
  page: 1,
  loading: false,
};
/** C2: `hasNext`, `onNext`, `onReset`, `page` BẮT BUỘC; chỉ `loading` tuỳ chọn. */
const _cursorPagerRequired: Requires<UI.CursorPagerProps, 'hasNext' | 'onNext' | 'onReset' | 'page'> = {
  hasNext: true,
  onNext: true,
  onReset: true,
  page: true,
};

const _emptyStateProps: UI.EmptyStateProps = {
  icon: null,
  title: 'Chưa có bài học nào',
  description: 'Thử bỏ bớt bộ lọc.',
  action: null,
};
/** C2: chỉ `title` bắt buộc — `icon`/`description`/`action` đều tuỳ chọn. */
const _emptyStateRequired: Requires<UI.EmptyStateProps, 'title'> = { title: true };

const _errorStateProps: UI.ErrorStateProps = {
  title: 'Không tải được',
  message: 'Mất kết nối tới máy chủ. Thử lại sau vài giây.',
  onRetry: () => {},
  retrying: false,
};
/** C2: `message` bắt buộc; `title`/`onRetry`/`retrying` tuỳ chọn. */
const _errorStateRequired: Requires<UI.ErrorStateProps, 'message'> = { message: true };

// ─── Toast — C2: `useToast(): { toast(o) }` ─────────────────────────────────

const _toastOptions: UI.ToastOptions = {
  title: 'Đã lưu',
  description: 'Hồ sơ đã cập nhật.',
  variant: 'destructive',
};
const _toastVariantDefault: UI.ToastVariant = 'default';
const _toastVariantSuccess: UI.ToastVariant = 'success';
const _toastVariantDestructive: UI.ToastVariant = 'destructive';
/** Chữ ký trả về của `useToast()` — đỏ nếu nó đổi thành `{ toasts, toast }` hay tương tự. */
const _useToastReturn: { toast(options: UI.ToastOptions): void } = UI.useToast();

// ─── Theme — C1 ─────────────────────────────────────────────────────────────

const _themeChoiceLight: UI.ThemeChoice = 'light';
const _themeChoiceDark: UI.ThemeChoice = 'dark';
const _themeChoiceSystem: UI.ThemeChoice = 'system';
const _themeProviderProps: UI.ThemeProviderProps = { children: null, storageKey: 'dlp.theme' };
/** C1: `storageKey` tuỳ chọn (mặc định `THEME_STORAGE_KEY`), `children` bắt buộc. */
const _themeProviderRequired: Requires<UI.ThemeProviderProps, 'children'> = { children: true };
const _themeInitScript: string = UI.THEME_INIT_SCRIPT;
const _themeStorageKey: string = UI.THEME_STORAGE_KEY;

// ─── Tương thích ngược — API cũ của P2/2.D không được đổi ───────────────────

/**
 * Bốn component này đã có route đang chạy gọi tới (`apps/web/src/app/lessons/**`).
 * C2 nói "giữ nguyên API, chuyển màu sang token" — nên chữ ký là hợp đồng, và
 * `PropsOf<>` ở đây tồn tại để một lần "dọn dẹp" prop trong tương lai phải đi
 * qua chỗ này trước.
 */
const _contentViewHasProps: PropsOf<typeof UI.ContentView> extends UI.ContentViewProps ? true : never = true;

/**
 * `onExec` — hợp đồng §Y3. Chữ ký là `(command: string, interrupt: boolean)`,
 * ĐÚNG HAI tham số.
 *
 * Bản trước ở đây gác chiều ngược lại: tham số thứ hai là một object
 * `ExecOptions` mang thêm `target`, và ca này tồn tại để một call-site cũ
 * truyền `boolean` không lọt qua im lặng. §Y2 gỡ đích thực thi nên chữ ký quay
 * về hai tham số — nhưng cái bẫy thì ĐỔI CHIỀU chứ không biến mất: một
 * call-site còn truyền `{ interrupt, target }` sẽ được đọc như một `boolean`,
 * và mọi object đều truthy, nên nút "Chạy" âm thầm hoá thành "Ngắt & chạy".
 *
 * Khẳng định bằng cách GÁN một hàm đúng chữ ký vào prop: sai kiểu tham số thứ
 * hai thì đỏ ngay dòng này, kèm tên prop.
 */
const _contentViewExec: UI.ContentViewProps['onExec'] = (command: string, interrupt: boolean) => {
  const _command: string = command;
  const _interrupt: boolean = interrupt;
  void _command;
  void _interrupt;
};
const _splitPaneHasProps: PropsOf<typeof UI.SplitPane> extends UI.SplitPaneProps ? true : never = true;
const _stepNavHasProps: PropsOf<typeof UI.StepNav> extends UI.StepNavProps ? true : never = true;
const _progressBarHasProps: PropsOf<typeof UI.ProgressBar> extends UI.ProgressBarProps ? true : never = true;

// ─── Tầng runtime ────────────────────────────────────────────────────────────

/**
 * Mọi tên trong bảng C2 (+ C1 cho theme). Thứ tự theo đúng thứ tự dòng của
 * bảng để đối chiếu bằng mắt được — thêm một component vào `packages/ui` mà
 * quên cập nhật C2 thì test "không có export nào NGOÀI hợp đồng" ở dưới đỏ.
 */
const C2_EXPORTS = [
  // C1 — theme
  'ThemeProvider',
  'useTheme',
  'THEME_STORAGE_KEY',
  'THEME_INIT_SCRIPT',
  // C2 — bảng component
  'Button',
  'Input',
  'Textarea',
  'Label',
  'Badge',
  'Card',
  'CardHeader',
  'CardTitle',
  'CardDescription',
  'CardContent',
  'CardFooter',
  'Dialog',
  'DialogTrigger',
  'DialogContent',
  'DialogHeader',
  'DialogTitle',
  'DialogDescription',
  'DialogFooter',
  'DialogClose',
  'Tabs',
  'TabsList',
  'TabsTrigger',
  'TabsContent',
  'Select',
  'SelectTrigger',
  'SelectValue',
  'SelectContent',
  'SelectItem',
  'DropdownMenu',
  'DropdownMenuTrigger',
  'DropdownMenuContent',
  'DropdownMenuItem',
  'DropdownMenuSeparator',
  'DropdownMenuLabel',
  'Tooltip',
  'TooltipProvider',
  'TooltipTrigger',
  'TooltipContent',
  'Switch',
  'Checkbox',
  'RadioGroup',
  'RadioGroupItem',
  'Toaster',
  'useToast',
  'Alert',
  'AlertTitle',
  'AlertDescription',
  'Skeleton',
  'Spinner',
  'Table',
  'TableHeader',
  'TableBody',
  'TableRow',
  'TableHead',
  'TableCell',
  'TableCaption',
  'CursorPager',
  'EmptyState',
  'ErrorState',
  'Separator',
  'Kbd',
  'ContentView',
  'MarkdownView',
  'SplitPane',
  'StepNav',
  'ProgressBar',
] as const;

/** Export có thật nhưng KHÔNG nằm trong bảng C2 — hợp lệ, phải khai ở đây. */
const NON_C2_EXPORTS = [
  'cn', // tiện ích nội bộ, mọi component dùng; không phải component nên C2 không liệt kê
  'SelectGroup', // sub-part Radix thêm vào, C2 chỉ liệt kê 5 phần bắt buộc
  // Hằng CHUỖI class, không phải component — bảng C2 khẳng định mọi mục là
  // hàm/đối tượng gọi được, nên đặt nó ở đó làm cổng đỏ đúng (đã đo). Nó được
  // export vì `apps/web` cũng có vùng cuộn cần đúng cách xử lý focus này
  // (`check-result-panel.tsx`), và chép lại chuỗi class là để hai bản trôi khỏi
  // nhau — lúc đó khối output của trang chấm bài lặng lẽ mất viền focus.
  'SCROLL_REGION_FOCUS',
] as const;

describe('C2 — bề mặt export của packages/ui', () => {
  it.each(C2_EXPORTS)('export `%s`', (name) => {
    expect(
      Object.hasOwn(UI, name),
      `\`${name}\` có trong bảng C2 nhưng KHÔNG được export từ packages/ui/src/index.ts — ` +
        'mọi lane Đợt 2 tiêu thụ tên này.',
    ).toBe(true);
    expect((UI as Record<string, unknown>)[name]).toBeDefined();
  });

  it('không có export nào NGOÀI hợp đồng mà chưa được khai báo', () => {
    const known = new Set<string>([...C2_EXPORTS, ...NON_C2_EXPORTS]);
    const surprises = Object.keys(UI).filter((name) => !known.has(name));
    expect(
      surprises,
      'Export mới chưa nằm trong C2. Nếu là component thật ⇒ bổ sung vào bảng C2 của ' +
        'phase-13-exec.md + bảng 4 trạng thái ở docs/design-system.md; nếu là tiện ích ⇒ thêm vào NON_C2_EXPORTS.',
    ).toEqual([]);
  });

  it('mọi component C2 là hàm/đối tượng gọi được (không phải `undefined` do vòng import lỗi)', () => {
    // Vòng import (a.ts -> b.ts -> a.ts) làm một export thành `undefined` lúc
    // runtime mà `tsc` vẫn xanh; React chỉ ném "type is invalid" khi render.
    for (const name of C2_EXPORTS) {
      if (name.startsWith('THEME_')) continue; // hằng chuỗi
      const value = (UI as Record<string, unknown>)[name];
      expect(typeof value, `${name} phải gọi/render được, đang là ${typeof value}`).toMatch(
        /^(function|object)$/,
      );
    }
  });
});

describe('C2 — chữ ký ràng buộc ở tầng kiểu', () => {
  /**
   * Các khẳng định kiểu ở đầu file chỉ chạy trong `tsc`; vitest không thấy
   * chúng. Test này giữ chúng "sống" (không bị coi là biến chết và bị lint gỡ
   * đi), và tự nó cũng kiểm được một vài giá trị ở runtime.
   */
  it('các hằng biến thể giữ đúng giá trị chuỗi C2 quy định', () => {
    expect([
      _buttonVariantPrimary,
      _buttonVariantSecondary,
      _buttonVariantOutline,
      _buttonVariantGhost,
      _buttonVariantDestructive,
      _buttonVariantLink,
    ]).toEqual(['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link']);
    expect([_buttonSizeSm, _buttonSizeMd, _buttonSizeLg, _buttonSizeIcon]).toEqual(['sm', 'md', 'lg', 'icon']);
    expect([
      _badgeVariantDefault,
      _badgeVariantSecondary,
      _badgeVariantSuccess,
      _badgeVariantWarning,
      _badgeVariantDestructive,
      _badgeVariantOutline,
    ]).toEqual(['default', 'secondary', 'success', 'warning', 'destructive', 'outline']);
    expect([_alertVariantDefault, _alertVariantWarning, _alertVariantDestructive, _alertVariantSuccess]).toEqual(
      ['default', 'warning', 'destructive', 'success'],
    );
    expect([_spinnerSizeSm, _spinnerSizeMd, _spinnerSizeLg]).toEqual(['sm', 'md', 'lg']);
    expect([_toastVariantDefault, _toastVariantSuccess, _toastVariantDestructive]).toEqual([
      'default',
      'success',
      'destructive',
    ]);
    expect([_themeChoiceLight, _themeChoiceDark, _themeChoiceSystem]).toEqual(['light', 'dark', 'system']);
  });

  it('object prop mẫu giữ đúng hình dạng C2', () => {
    expect(_buttonProps.loading).toBe(true);
    expect(_buttonProps.size).toBe('icon');
    expect(_inputProps.invalid).toBe(true);
    expect(_textareaProps.invalid).toBe(true);
    expect(_labelProps.htmlFor).toBe('field-id');
    expect(_cursorPagerProps.page).toBe(1);
    expect(_emptyStateProps.title).toBe('Chưa có bài học nào');
    expect(_errorStateProps.message).toContain('Mất kết nối');
    expect(_toastOptions.variant).toBe('destructive');
    expect(_themeProviderProps.storageKey).toBe(UI.THEME_STORAGE_KEY);
    expect(_themeInitScript).toContain(UI.THEME_STORAGE_KEY);
    expect(_themeStorageKey).toBe('dlp.theme');
    expect(typeof _useToastReturn.toast).toBe('function');
  });

  it('cờ "prop này vẫn BẮT BUỘC" đều đúng (đỏ ở tsc nếu bị nới thành tuỳ chọn)', () => {
    expect(Object.values(_cursorPagerRequired).every(Boolean)).toBe(true);
    expect(_emptyStateRequired.title).toBe(true);
    expect(_errorStateRequired.message).toBe(true);
    expect(_themeProviderRequired.children).toBe(true);
    expect(
      [_contentViewHasProps, _splitPaneHasProps, _stepNavHasProps, _progressBarHasProps].every(Boolean),
    ).toBe(true);
  });
});
