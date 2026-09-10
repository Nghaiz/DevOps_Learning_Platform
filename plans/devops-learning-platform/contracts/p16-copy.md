# P16 · Hợp đồng copy: `packages/copy` và luật giọng văn

**Ngày:** 2026-09-10 · **Loại:** Contract (SSOT) · **Chặn:** L0 dựng, L1..L7 ghi vào, L8 gác
**Nguồn:** `plans/reports/2026-09-10-p16-frontend-rebuild-design.md` §1.1 (sáu khiếm khuyết đã đo), §5 (tám luật), §9 (lane), §10 AC6

> File này cố ý **không** dùng gạch ngang dài, kể cả trong tiêu đề, kể cả ở chỗ nó đọc trôi hơn.
> Ký tự U+2014 xuất hiện đúng **một** lần trong toàn bộ file, ở §4.1, bên trong chuỗi BEFORE trích
> nguyên văn từ `init.ts:162`. Đừng "sửa" nó: nó là tang vật. Mọi chỗ khác cần nhắc tới ký tự đó
> đều gọi tên điểm mã. Cổng quét ở §3 chỉ đọc `packages/copy/src`, không đọc `plans/`, nên file
> này không làm test đỏ.

---

## 0. Thứ tự thi công

Hôm nay có ~5.300 chuỗi UI viết thẳng trong TSX và **không có tầng i18n nào**. `packages/copy` là
bản đồ thông điệp duy nhất mà mọi lane ghi chuỗi người dùng đọc qua đó.

Nó **không phải** một framework i18n. Có đúng một locale (`vi`), không có `locale` chạy theo
request, không có tải bất đồng bộ, không có fallback ngôn ngữ, không có ICU MessageFormat. Ngày
nào cần locale thứ hai thì viết lại tầng này, và lúc đó đã có một tập khoá sạch để dịch. Dựng sẵn
bộ máy đa ngôn ngữ hôm nay là trả giá cho một thứ chưa tồn tại.

L0 phải commit toàn bộ `packages/copy` (API, mười file surface rỗng, bộ dò, test, đối chứng)
**trước khi** spawn L1..L7. Không lane nào được sửa `registry.ts`.

---

## 1. API công khai

### 1.1 Sáu dạng mục, không có dạng thứ bảy

```ts
// packages/copy/src/types.ts

/**
 * Tham số nội suy. Chỉ `string` và `number`.
 *
 * KHÔNG nhận `ReactNode`, `Date`, hay object: một `ReactNode` lọt vào đây thì
 * bản đồ biến thành tầng render, và bộ dò ở §3 mất khả năng đọc giá trị ra
 * chuỗi. Ngày muốn hiển thị thì nơi gọi tự định dạng rồi truyền chuỗi vào.
 */
export type Params = Readonly<Record<string, string | number>>;

/** Chuỗi tĩnh. Dạng thường gặp nhất. */
export type Static = string;

/**
 * Chuỗi có tham số. Tên tham số nằm TRONG kiểu, nên gọi sai tên là lỗi biên
 * dịch chứ không phải một chuỗi `{name}` còn nguyên trên màn hình.
 */
export type Dynamic<P extends Params = Params> = (params: P) => string;

/**
 * Đếm. Ba nhánh, cả ba do người viết soạn, không nhánh nào suy ra được.
 *
 * `zero` là BẮT BUỘC ở tầng kiểu, và đó là điểm chính. Lab k8s hôm nay hiện
 * "Còn 0 chỗ" khi năm khe quota bị setup hỏng giữ lại (design §1.2). Câu đó
 * đúng số học và vô dụng với người đọc. Thiếu `zero` là lỗi biên dịch, nên luật
 * này không cần test.
 */
export interface Counted {
  readonly zero: string;
  readonly one: string;
  readonly many: (n: number) => string;
}

/** Danh sách. Xem §3.3 về `intentionalThree`. */
export interface List {
  readonly items: readonly string[];
  /** `YYYY-MM-DD: lý do`, phần lý do tối thiểu 20 ký tự. Test kiểm định dạng. */
  readonly intentionalThree?: string;
}

/**
 * Thông báo lỗi. Hai nửa TÁCH RỜI ở tầng kiểu, không phải một chuỗi mà người
 * viết tự hứa là có đủ hai ý.
 *
 * `code` là siêu dữ liệu để dán vào phiếu hỗ trợ. Nó KHÔNG BAO GIỜ là toàn bộ
 * thông báo, và renderer không được phép hiện nó khi thiếu `what`. Luật số 4
 * của design §5 ("một mã thoát không phải câu trả lời") được ép bằng hình dạng
 * kiểu, không bằng lời nhắc.
 */
export interface ErrorEntry {
  /** Hỏng cái gì. Một câu. Nói về thứ người đọc vừa làm, không nói về mã. */
  readonly what: string;
  /** Giờ làm gì. Một hoặc hai câu, câu đầu bắt đầu bằng động từ. */
  readonly next: string;
  readonly code?: string;
  /** Có giá trị thì UI dựng đồng hồ đếm ngược thay vì để người ta bấm mù. */
  readonly retryAfterSec?: number;
}

export type DynamicError<P extends Params = Params> = (params: P) => ErrorEntry;

export type Entry = Static | Dynamic | Counted | List | ErrorEntry | DynamicError;

/**
 * Mọi khoá của một surface phải mở đầu bằng tên surface. Sai tiền tố là lỗi
 * biên dịch, nên §3 không cần một test cho việc đó.
 */
export type Surface<N extends string> = Readonly<Record<`${N}.${string}`, Entry>>;
```

### 1.2 Khoá phẳng, không lồng

```ts
// packages/copy/src/surfaces/catalog.ts
import type { Surface } from '../types';

export const catalog = {
  'catalog.noun.lessons': 'bài học',
  'catalog.empty.filtered.title': 'Không có mục nào khớp bộ lọc',
  'catalog.page.scope': (p: { page: number; shown: number; noun: string }) =>
    `Trang ${p.page} · ${p.shown} ${p.noun}. Danh sách còn tiếp, bấm “Tiếp” để xem phần sau.`,
} as const satisfies Surface<'catalog'>;
```

Khoá là **chuỗi phẳng có dấu chấm**, không phải object lồng nhau. Ba lý do, và cả ba đều là lý do
kỹ thuật chứ không phải sở thích:

1. `CopyKey = keyof typeof MESSAGES` suy ra trực tiếp. Object lồng nhau bắt phải viết kiểu điều
   kiện đệ quy để dựng đường dẫn, và đúng thứ đó biến một bản đồ thông điệp thành một framework.
2. `rg 'catalog.empty.filtered.title'` tìm ra cả nơi khai lẫn nơi gọi trong một lượt.
3. Thông báo lỗi của test in ra đúng khoá, dán thẳng vào ô tìm kiếm là tới nơi.

Cấu trúc khoá: `<surface>.<màn-hoặc-component>.<slot>`. Chữ thường, phân đoạn nội bộ dùng gạch
nối. Khoá trùng trong cùng một file là lỗi `ts(1117)` sẵn có của TypeScript; khoá trùng giữa hai
file là bất khả thi vì tiền tố surface duy nhất, và §3.5 có test khẳng định tính duy nhất đó.

### 1.3 Truy cập

```ts
// packages/copy/src/t.ts
type TextKey  = { [K in CopyKey]: (typeof MESSAGES)[K] extends Static | Dynamic ? K : never }[CopyKey];
type ErrKey   = { [K in CopyKey]: (typeof MESSAGES)[K] extends ErrorEntry | DynamicError ? K : never }[CopyKey];
type ListKey  = { [K in CopyKey]: (typeof MESSAGES)[K] extends List ? K : never }[CopyKey];
type CountKey = { [K in CopyKey]: (typeof MESSAGES)[K] extends Counted ? K : never }[CopyKey];

type ParamsOf<K extends CopyKey> =
  (typeof MESSAGES)[K] extends (p: infer P) => unknown ? [params: P] : [];

export function t<K extends TextKey>(key: K, ...args: ParamsOf<K>): string;
export function err<K extends ErrKey>(key: K, ...args: ParamsOf<K>): ErrorEntry;
export function errText<K extends ErrKey>(key: K, ...args: ParamsOf<K>): string; // `${what} ${next}`
export function list<K extends ListKey>(key: K): readonly string[];
export function count<K extends CountKey>(key: K, n: number): string;
```

Gọi `t()` trên một khoá lỗi là lỗi biên dịch. Truyền tham số cho khoá tĩnh là lỗi biên dịch. Quên
tham số của khoá động là lỗi biên dịch. Không có `t(key: string)` nhận chuỗi tự do, và không có
overload nào nhận `defaultValue`: một giá trị mặc định tại nơi gọi là một chuỗi nằm ngoài bản đồ,
tức là đúng thứ gói này tồn tại để xoá.

`count` ném lỗi khi `n` không phải số nguyên. Không làm tròn im lặng.

### 1.4 Nội suy: tham số có tên, và số đến từ hằng thật

Dạng hàm, không phải chuỗi `{placeholder}`. Chuỗi placeholder cần một bộ phân tích lúc chạy, cộng
một kiểu phân tích chuỗi ở tầng type để giữ an toàn, và cả hai đều là bộ máy mà một locale duy
nhất không đáng phải nuôi. Hàm cho an toàn kiểu miễn phí từ suy diễn của TypeScript.

Hệ quả trực tiếp lên §4: `packages/copy` **không được** import từ `apps/web`, nên hằng số như
`TRPC_MUTATION_LIMIT_PER_MIN` đi vào thông điệp qua tham số, không phải qua một con số gõ lại.
Gõ lại là dựng nguồn sự thật thứ hai cho một con số mà middleware đang thực thi.

### 1.5 Tiếng Việt không có số nhiều, nên API không có số nhiều

Không có `_one` / `_other`, không có `Intl.PluralRules`, không có hậu tố `_plural`. `1 bài học` và
`5 bài học` dùng chung một danh từ. PR nào thêm một dạng số nhiều cho tiếng Việt là hiểu sai ngôn
ngữ, và reviewer từ chối ngay.

Thứ tiếng Việt thật sự cần là **loại từ** (bài, lượt, khe, chỗ, bộ), và loại từ dính liền với danh
từ. Nên loại từ nằm trong chính giá trị của khoá danh từ (`catalog.noun.lessons` = `'bài học'`,
`session.noun.slot` = `'chỗ trống'`), không nằm trong một bảng loại từ riêng.

Nhánh duy nhất có thật là **không / một / nhiều**, và nó là nhánh biên tập chứ không phải nhánh
ngữ pháp:

```ts
'session.slots': {
  zero: 'Hết chỗ. Lab này mở lại khi có người thoát.',
  one:  'Còn 1 chỗ.',
  many: (n) => `Còn ${n} chỗ.`,
} satisfies Counted,
```

### 1.6 Bộ chọn trả về KHOÁ, không trả về câu

`catalog-labels.ts` hôm nay có bốn hàm quyết định biên tập (`describeCatalogEmpty`,
`describePageScope`, `describeSortScope`, `describeResultCount`). Chúng đi cùng sang
`packages/copy`, nhưng đổi kiểu trả về:

```ts
// SAI: bộ dò chỉ nhìn thấy nhánh mà probe đi vào.
export function describeCatalogEmpty(args: Args): string;

// ĐÚNG: mọi nhánh đều là một khoá tĩnh, bộ dò quét được toàn bộ.
export function describeCatalogEmpty(args: Args): { key: TextKey; params?: Params };
```

Đây không phải chuyện phong cách. Một hàm trả về câu ghép tại chỗ thì cổng gạch ngang dài chỉ soi
được nhánh nó gọi tới, và nhánh còn lại đi thẳng ra người dùng không qua cổng nào. Bộ chọn chọn
khoá; câu luôn là một mục tĩnh trong bản đồ.

Khối chú thích ở `catalog-labels.ts:10-15` (từ chối gắn tính từ vào tên hạng sandbox vì "một tính
từ dán ở đây sẽ là một khẳng định mà trang danh mục không có dữ liệu để bảo vệ") đi sang **nguyên
văn**. Cả khối ở dòng 39-50 (cấm khẳng định tổng số mục khi server chỉ trả `nextCursor`) cũng vậy.
Đó là chuẩn biên tập của dự án này, và nó phải sống ở nơi giữ chuỗi.

### 1.7 Thêm một khoá

1. Chọn file surface theo **màn hình hiển thị chuỗi**. Chuỗi xuất hiện ở hai surface thì nó thuộc
   `common.ts` và cả hai gọi chung. Không chép.
2. Đặt khoá `<surface>.<màn>.<slot>`.
3. Viết giá trị theo tám luật §2.
4. Gọi `t()` tại nơi dùng. Không để lại literal, kể cả literal "tạm".

Vào bản đồ: chữ hiển thị, `aria-label`, `alt`, `title`, `placeholder`, toast, thông báo lỗi, thông
điệp validate form, tiêu đề cột bảng, `<title>` và meta description, chữ chỉ dành cho screen
reader. Không vào bản đồ: log, tên trường telemetry, tên class CSS, tên test, chú thích mã.

### 1.8 Cây thư mục

```
packages/copy/
  package.json          # @devops-platform/copy, zero runtime deps, dựng giống packages/shared-types
  src/
    types.ts            # §1.1
    t.ts                # §1.3
    registry.ts         # gộp surface, suy ra CopyKey. CHỈ L0 sửa.
    scan.ts             # bộ dò thuần, export ra để test gọi
    diacritic-words.ts  # hai danh sách từ ở §3.2
    diacritic-allow.ts  # miễn trừ, có ngày và lý do
    surfaces/
      common.ts  error.ts  shell.ts  auth.ts  catalog.ts
      session.ts home.ts   admin.ts  author.ts  me.ts
    copy.contract.test.ts   # cổng
    scan.control.test.ts    # đối chứng dương cho từng bộ dò
```

Không React, không phụ thuộc runtime, nên cả `apps/web/src/server` lẫn client đều import được. Đó
là lý do nó là một package chứ không phải một thư mục trong `apps/web`: middleware tRPC ở §4 cần
đúng bản đồ mà nút bấm đang dùng.

---

## 2. Tám luật, viết lại thành mệnh đề kiểm được

| # | Luật (design §5) | Mệnh đề kiểm được | Cổng |
|---|---|---|---|
| V1 | Xưng "bạn" | Không giá trị nào chứa `các bạn`, `quý khách`, `quý người dùng`, `học viên thân mến`, `bạn nhé`, `chúng tôi rất` | T6, danh sách chặn |
| V2 | Câu đầu mang thông tin | Không giá trị nào MỞ ĐẦU bằng `Chào mừng`, `Hãy cùng`, `Trong phần này`, `Như bạn đã biết`, `Trước tiên`, `Đầu tiên,` | T6, **một phần** |
| V3 | Cấm gạch ngang dài | Không `U+2014`, `U+2013`, `U+2015` ở bất kỳ đâu trong `src/**/*.ts`. `·` hợp lệ nhưng phải có đúng một dấu cách hai bên | T1, **toàn phần** |
| V4 | Lỗi trả lời hai câu | Mục lỗi là `ErrorEntry`, có `what` và `next` bắt buộc; `code` không bao giờ đứng một mình | tầng kiểu |
| V5 | Không liệt kê đúng ba | Không mảng 3 phần tử, không chuỗi 3 gạch đầu dòng, không nhóm 3 khoá anh em, trừ khi khai `intentionalThree` kèm ngày và lý do | T3, **toàn phần** |
| V6 | Đủ dấu tiếng Việt | Không giá trị nào chứa văn bản Việt bị lột dấu; mọi chuỗi đã chuẩn hoá NFC | T2 + T5 |
| V7 | Số cụ thể thay tính từ | Không `xuất sắc`, `tuyệt vời`, `hoàn hảo`, `mạnh mẽ`, `toàn diện`, `phong phú`, `nhanh chóng`, `dễ dàng`, `tối ưu nhất` | T6, danh sách chặn |
| V8 | Không câu tổng kết | Không giá trị nào kết bằng `Chúc bạn`, `Hy vọng`, `Tóm lại`, `Nói chung`. Khuôn `# Xong rồi` cộng `Những thứ đáng mang theo:` trong `content/**` có ratchet riêng | T6 + T7, **một phần** |

**Chỗ cổng không với tới, nói thẳng ra ở đây thay vì giả vờ:** V2 và V8 là phán đoán về nội dung
câu, và một danh sách chặn chỉ bắt được các mở đầu và kết thúc đã biết mặt. Một câu khởi động viết
bằng chữ mới đi lọt. V7 cũng vậy. Ba luật đó là luật review có cổng hỗ trợ, không phải cổng bảo
đảm. V3, V5, V6 thì kín, và đó là lý do design §5 chỉ hứa biến ba luật đó thành phép đo.

---

## 3. Test

Đây là phần chính của file. Test nằm ở `copy.contract.test.ts`; mọi bộ dò là hàm thuần export từ
`scan.ts`, và mọi bộ dò có đối chứng riêng ở `scan.control.test.ts`. Tách hai file để đếm được:
số bộ dò phải bằng số nhóm đối chứng.

**Quy ước áp cho MỌI test dưới đây.** Ba ký tự bị cấm không bao giờ được gõ thẳng trong
`packages/copy`. Chúng luôn viết bằng escape Unicode của JavaScript (dấu chéo ngược, chữ `u`, rồi
`2014` / `2013` / `2015`), kể cả trong `scan.ts` và trong file test. Nhờ vậy bộ quét **không loại
trừ file nào**. Một danh sách loại trừ là chỗ mà thứ cần chặn đi qua.

### 3.0 T0 · đối chứng rỗng, chạy trước mọi test khác

Mỗi bộ quét khẳng định tập đầu vào của nó không rỗng, **trước** khi khẳng định số vi phạm bằng 0:

```ts
expect(files.map(f => basename(f)).sort()).toEqual(expectedFromSurfaceKeys); // đổi tên thư mục ⇒ đỏ
expect(entries.length).toBeGreaterThan(80);                                  // registry rỗng ⇒ đỏ
expect(totalBytes).toBeGreaterThan(20_000);
```

Danh sách file mong đợi **suy ra từ khoá của `SURFACES`**, không gõ tay. Thêm một surface mà quên
file là đỏ ngay, thay vì im lặng bỏ một surface ra khỏi mọi cổng.

Không có ba dòng này thì một lần đổi tên thư mục biến cả §3 thành no-op xanh vĩnh viễn. Repo này
đã trả giá đúng hai lần cho hình dạng đó: `--shard` chia theo file khiến 2/3 phần chạy 0 ô mà vẫn
thoát 0, và `go test` thoát 0 khi mọi test đều skip.

### 3.1 T1 · gạch ngang dài

Hai lượt, và lượt đầu mới là lượt kín.

**T1a, quét nguồn.** Đọc `packages/copy/src/**/*.ts` dưới dạng text, tìm `U+2014`, `U+2013`,
`U+2015`. Quét **toàn bộ file, kể cả chú thích**. Bỏ chú thích ra ngoài phạm vi thì cần một bộ
phân tích, mà một bộ phân tích viết bằng regex thì sai trên chuỗi chứa `//`, còn một bộ phân tích
viết đúng thì đắt hơn giá trị nó mang lại. Giá phải trả: người viết gõ dấu phẩy trong chú thích
của gói này. Chấp nhận.

Thêm một luật cho dấu chấm giữa: `·` phải có đúng một dấu cách hai bên. `Trung cấp · 25 phút` đạt;
`Trung cấp·25 phút` đỏ, vì không có dấu cách thì nó đọc như một toán tử.

**T1b, quét giá trị.** Dựng mọi mục từ `MESSAGES`, gọi mục động bằng probe (`number` cho `7`,
`string` cho `'X'`), gọi `many(2)` và `many(11)` cho `Counted`, nối `List.items`, ghép
`what + next` cho `ErrorEntry`, rồi quét chuỗi kết quả. Lượt này bắt được ký tự do một hàm phụ trợ
chèn vào, ví dụ một hằng phân cách nằm ngoài `surfaces/`.

**Giới hạn phải nói ra:** T1b chỉ đi vào nhánh mà probe đi vào. Luật §1.6 (bộ chọn trả khoá, không
trả câu) tồn tại chính vì lý do này, và T1a phủ nốt phần T1b bỏ lại.

**Đối chứng dương.** Dựng đầu vào bằng `String.fromCharCode(0x2014)` chứ không gõ ký tự, rồi khẳng
định `scanDashes('a ' + DASH + ' b')` trả đúng một vi phạm, offset 2, codePoint `0x2014`. Lặp cho
`0x2013` và `0x2015`. Đối chứng âm: `scanDashes('Trung cấp · 25 phút')` trả rỗng, và
`scanDashes('a·b')` trả đúng một vi phạm loại `middot-spacing`. Năm khẳng định này chạy mỗi lượt
CI, nên bộ dò không bao giờ ở trạng thái "chưa từng thấy nó đỏ".

### 3.2 T2 · tiếng Việt bị lột dấu

Đây là test khó nhất và là test duy nhất trong file này chạy bằng heuristic. Nói trước phần dở:
**nó có dương tính giả, và tỉ lệ dương tính giả CHƯA ĐƯỢC ĐO trên repo này.** Cách đo nằm ở cuối
mục.

**Vì sao cần.** `content/labs/dlp-linux-triage/lab.json:15` đang gửi tới người học nguyên văn
`"docker: khong lien quan o buoc nay. Dung ps aux hoac pgrep -af runaway-worker de tim PID..."`
trong khi `title` ngay phía trên nó có đủ dấu. Không có công cụ nào trong repo bắt được việc đó,
và nó đã đi qua review.

**Thuật toán.**

1. Đơn vị xét là **một giá trị chuỗi**: một mục trong bản đồ, một chuỗi JSON trong `content/**`,
   hoặc một đoạn markdown.
2. Bóc phần không phải văn xuôi: nội dung trong backtick, `<code>`, URL, đường dẫn file, token
   kebab (`[a-z]+(-[a-z]+)+`), token có dấu chấm giữa hai chữ (`foo.sh`, `ptit.edu.vn`), và token
   viết HOA toàn bộ.
3. Tách token trên biên không phải chữ cái, hạ về chữ thường.
4. Đối chiếu với hai danh sách trong `diacritic-words.ts`:
   - **STRONG**, từ tiếng Việt lột dấu không trùng mặt chữ với từ tiếng Anh thông dụng:
     `khong, duoc, nguoi, nhung, cua, voi, mot, nay, dang, phai, hoac, roi, chua, cung, cang, tuy,
     nghia, quyen, thuc, tieu, kiem, nhom, chinh, truoc, buoc, lien, huong, thuong, truong, duong,
     nhieu, nhanh, tiep, viec, dung` và khoảng 60 mục nữa.
   - **WEAK**, có trùng mặt chữ với tiếng Anh: `la, do, no, so, can, may, hai, ba, tai, den, cho,
     ma, bat, con, sang, tam, ban, hang, cam, gia, tim, de, se, va`.
5. Gắn cờ khi `strong >= 1` **hoặc** `weak >= 4`.

Thông báo lỗi in ra khoá, chuỗi đầy đủ, và **danh sách token đã khớp**. Không in "có vẻ mất dấu":
người đọc phải thấy ngay token nào làm nó đỏ, nếu không thì mỗi lần đỏ là một lượt điều tra.

**Dương tính giả dự đoán được, theo lớp:** danh từ riêng viết không dấu (`Da Nang`), câu tiếng Anh
chứa `do/so/no/can` (chỉ nổ khi đủ 4, hiếm), và tên định danh cố ý ASCII lọt qua bước 2. Đường
thoát là `diacritic-allow.ts`, mỗi dòng khoá theo **cặp (khoá, token)** kèm ngày và lý do. Không
có miễn trừ theo file: miễn trừ cả file là tắt cổng cho file đó.

**Đo tỉ lệ, việc của L0 trước khi merge.** Chạy bộ dò trên toàn bộ `content/**` và `packages/copy`
hiện có, đọc tay từng hit, ghi vào chú thích cạnh danh sách từ: ngày, tổng số chuỗi quét, số hit,
số dương tính giả, và ba ví dụ dương tính giả điển hình. Không có con số đó thì §3.2 là một lời
hứa chứ không phải một phép đo, và người sau không biết ngưỡng `weak >= 4` đến từ đâu.

**Đối chứng dương, và một cái bẫy nằm trong chính đối chứng.**

```ts
const SHIPPED_DEFECT = 'docker: khong lien quan o buoc nay. Dung ps aux hoac pgrep de tim PID';
expect(scanStripped(SHIPPED_DEFECT).matched).toContain('khong');
```

Chuỗi này **nhúng thẳng vào file test dưới dạng literal**, tuyệt đối không đọc từ `lab.json`. Lý
do: `lab.json` sẽ được sửa. Một đối chứng đọc file sẽ chuyển sang xanh đúng lúc lỗi được vá, và từ
giây đó nó không còn chứng minh gì trong khi vẫn trông như đang gác. Đây đúng lớp bẫy "đỏ vì lý do
ngược lại" mà `pinned-baseline-test-companion.md` mô tả.

Hai đối chứng âm đi kèm: bản đã sửa dấu trả rỗng, và
`'Do not close this tab so the session can stay open'` trả rỗng. Cái thứ hai chốt lại hành vi
dương-tính-giả mà ta đã chấp nhận, để một lần siết danh sách WEAK sau này không âm thầm làm nó đỏ.

**Test chống nghĩa địa.** Mỗi dòng trong `diacritic-allow.ts` phải khớp ít nhất một chuỗi thật.
Dòng không còn khớp gì thì đỏ, thông điệp là `xoá dòng này, chuỗi nó miễn trừ không còn tồn tại`.
Không có test này thì danh sách miễn trừ lớn dần và không ai dám dọn.

### 3.3 T3 · đúng ba

Bắt ba hình dạng, vì khiếm khuyết đo được ở design §1.1 nằm ở hình dạng thứ ba chứ không phải hình
dạng thứ nhất:

1. `List.items.length === 3` mà không khai `intentionalThree`.
2. Một giá trị chuỗi chứa đúng 3 dòng mở đầu bằng `- ` hoặc `• `.
3. **Ba khoá anh em.** Gom khoá theo tiền tố bỏ phân đoạn cuối; nếu một tiền tố có **đúng 3**
   thành viên thì đỏ, trừ khi tiền tố đó có mặt trong `INTENTIONAL_THREE` của surface.

   > **⚠ Đính chính 2026-09-10.** Bản trước của dòng này viết "nếu phân đoạn cuối tạo thành một
   > **dãy** đúng 3 (`.1/.2/.3`, `.a/.b/.c`, `.first/.second/.third`)". Mã KHÔNG kiểm dãy:
   > `scanThree` chỉ đếm thành viên, nên `catalog.tier` (sysbox/gvisor/kata) và `catalog.status`
   > (not-started/in-progress/completed) đều đỏ dù không cái nào là một dãy. Cả hai đang phải khai
   > `intentionalThree`, tức mã đã nói ra sự thật từ đầu và chỉ có văn bản này sai.
   >
   > Hệ quả **quan trọng hơn**, vì nó là cách cổng này bị vô hiệu trong im lặng: gom theo tiền tố
   > nghĩa là **một nhóm ba đặt tên phẳng thì cổng KHÔNG nhìn thấy**.
   > `catalog.problems.viewer-solved/-attempted/-untouched` rơi vào nhóm `catalog.problems` đông
   > thành viên, nên nó đi qua T3 mà không cần một lời biện minh nào. Lane 16.C2 chọn tên phẳng cho
   > nhất quán với khối xung quanh, tự phát hiện, và báo lại. Đã lồng cả hai nhóm
   > (`viewer.*`, `duration.*`) và khai `intentionalThree`.
   >
   > **Đặt tên là một quyết định về khả năng gác, không chỉ về thẩm mỹ.** Một nhóm ba đúng nghĩa
   > thì đặt lồng, để cổng bắt được và buộc người viết nêu lý do; nhất quán hình thức với khối bên
   > cạnh không đáng đổi lấy một cổng mù.

Hình dạng 3 là hình dạng thật: `value-props.tsx:6` tự khai `ba luận điểm`, `getting-started.tsx:4`
tự khai `ba bước`, và không cái nào là mảng. Một test chỉ bắt mảng sẽ xanh trên đúng trang chủ mà
design gọi là "hình dạng landing page mà mô hình nào cũng đẻ ra".

```ts
export const INTENTIONAL_THREE: Readonly<Record<string, string>> = {
  'session.tier': '2026-09-10: đúng ba runtime sandbox tồn tại (sysbox, gvisor, kata), khớp SandboxTierName.',
};
```

Giá trị phải khớp `/^\d{4}-\d{2}-\d{2}: .{20,}/`. Một dấu tích không bắt ai phải nghĩ; một câu có
lý do thì bắt.

> **⚠ Đính chính 2026-09-10 — `session.tier` ở trên là minh hoạ ĐỊNH DẠNG, không phải phán quyết
> về surface.** Lane 16.D đọc nó như một chỉ dẫn đặt chỗ và dựng `session.tier.*` trong surface
> `session.`; lane 16.C song song dựng `catalog.tier.*`. Gộp lại thành hai bản của cùng ba chuỗi,
> và **không cổng nào bắt được** — T4 chỉ gác một chiều ("không chuỗi nào ngoài bản đồ"), không có
> cổng nào gác chiều "không khoá nào thiếu nơi gọi".
>
> Đã xoá `session.tier.*` (0 nơi gọi) và giữ `catalog.tier.*` (4 nơi gọi, đều ở catalog). Luật đặt
> chỗ vẫn là §1.7: một surface dùng thì chuỗi ở nơi tiêu thụ; **hai** surface trở lên mới sang
> `common.` với L0 là người thêm. Khi viết ví dụ cho một cổng, chọn tiền tố của một nhóm ĐÃ TỒN TẠI
> hoặc ghi rõ "ví dụ, không phải chỗ đặt" — lane đọc hợp đồng theo nghĩa đen, và đó là điều đúng
> đắn cần làm với một hợp đồng.

*Ghi chú kỹ thuật cho L0:* đã cân nhắc ép định dạng ngày ở tầng kiểu bằng
`` `${number}-${number}-${number}: ${string}` ``, nhưng `${number}` có rủi ro không khớp phân đoạn
có số 0 đứng đầu (`09`). Nên luật ngày kiểm bằng test. Nếu L0 xác nhận kiểu chạy đúng trên bản
TypeScript đang dùng thì siết lên tầng kiểu và bỏ nửa test này.

**Đối chứng dương.** Dựng một object surface giả **bên trong file test**, không nằm trong
`surfaces/` (nếu không nó lọt vào cổng thật), chứa cả ba hình dạng vi phạm, rồi khẳng định đúng 3
vi phạm với đúng 3 khoá. Đối chứng âm: nhóm 2 khoá, nhóm 4 khoá, và mảng 3 phần tử đã khai
`intentionalThree` hợp lệ, cả ba trả rỗng. Thêm một đối chứng nữa: `intentionalThree: 'ok'` thiếu
ngày phải đỏ.

### 3.4 T4 · chuỗi lọt ra ngoài bản đồ

Cổng làm cho §6 ("mỗi lane tự viết copy khi dựng") thành ràng buộc chứ không phải lời hứa.

Quét `.tsx` và `.ts` trong glob sở hữu của từng lane, tìm literal chuỗi hoặc JSX text chứa ký tự
Latin có dấu:

```ts
// U+00D7 (×) và U+00F7 (÷) nằm trong dải nhưng không phải chữ, loại ra.
const VIET = /[À-ÖØ-öø-ÿĀ-ɏẠ-ỹ̀-ͯ]/;
```

Miễn trừ: chính `packages/copy/src/surfaces/**`. Không miễn trừ gì khác.

**Giới hạn phải nói ra:** một lane vẫn lách được bằng cách viết tiếng Việt không dấu (rơi vào T2)
hoặc viết tiếng Anh, và `aria-label="Close"` đi lọt hoàn toàn. T4 bắt được đường lười phổ biến,
không bắt được đường cố ý. Phần còn lại là review.

**Đối chứng dương.** Cho bộ dò ăn `'<p>Xin chào</p>'`, khẳng định một vi phạm. Cho ăn
`"<p>{t('auth.hello')}</p>"`, khẳng định rỗng. Cho ăn `'<p>× 3</p>'`, khẳng định rỗng, chốt lại
hai ký tự đã loại trừ.

### 3.5 T5 · NFC, và tính duy nhất của tiền tố

Chữ `ê` có dấu sắc viết được bằng một điểm mã (U+1EBF) hoặc bằng ba (U+0065, U+0302, U+0301). Hai
bản render giống hệt nhau trên màn hình, khác nhau ở `.length`, khác nhau khi so sánh, khác nhau
khi tìm kiếm. Mọi giá trị phải thoả `s === s.normalize('NFC')`.

Cùng file: khẳng định tiền tố của các surface đôi một khác nhau, và tổng số khoá của `MESSAGES`
bằng tổng số khoá của từng surface cộng lại. Khoá trùng giữa hai file sẽ nuốt nhau trong im lặng
khi spread, nên phép cộng này là thứ duy nhất nói ra.

**Đối chứng dương, và lý do nó phải dựng bằng mã chứ không gõ tay.** Hai dạng trông giống hệt nhau
trong editor, nên một đối chứng gõ tay là một đối chứng không ai kiểm được, và một số công cụ chỉnh
sửa còn tự chuẩn hoá khi lưu file:

```ts
const NFC = String.fromCharCode(0x1EBF);                // 1 điểm mã
const NFD = String.fromCharCode(0x65, 0x0302, 0x0301);  // 3 điểm mã
expect(NFC).toHaveLength(1);
expect(NFD).toHaveLength(3);
expect(scanNfc({ 'x.y': NFD })).toHaveLength(1);
expect(scanNfc({ 'x.y': NFC })).toEqual([]);
```

Hai dòng `toHaveLength` không thừa: chúng chốt rằng đầu vào đúng là hai dạng khác nhau, chứ không
phải cùng một chuỗi đã bị chuẩn hoá về một dạng trước khi test chạy.

### 3.6 T6 và T7 · danh sách chặn, và ratchet cho `content/**`

T6 chạy danh sách chặn của V1, V2, V7, V8 ở §2. Nó là cổng hỗ trợ: đỏ thì chắc chắn sai, xanh thì
chưa chứng minh gì. Ghi đúng câu đó vào chú thích đầu test để không ai đọc màu xanh của nó thành
một lời bảo đảm.

T7 là **ratchet cho `content/**`**, phạm vi ngoài bản đồ nhưng cùng một khiếm khuyết. Đếm số file
markdown kết bằng khuôn `# Xong rồi` cộng `Những thứ đáng mang theo:`, thứ design §1.1 đo được 11
lần cùng một khuôn. Ghim con số. Luật của ratchet:

- Số tăng: hồi quy. Sửa nội dung, **không nâng số ghim**.
- Số giảm: hạ số ghim, và thông điệp lỗi phải nói rõ đây là hướng tốt.
- Số về 0: **xoá hằng số và đảo test lại** thành "không file nào được dùng khuôn này". Không ghim
  lại số 0.

Ba câu trên nằm nguyên trong thông điệp lỗi của test, vì người gặp nó lần đầu sẽ không đọc file
này.

---

## 4. Khuôn thông báo lỗi

```
what:  <chuyện gì đã xảy ra, nói về hành động của người đọc>
next:  <động từ mở đầu> <việc làm được ngay bây giờ>. <đường thứ hai nếu việc đầu không xong>
code:  <mã dán vào phiếu hỗ trợ, tuỳ chọn, không bao giờ đứng một mình>
```

`what` không nhắc tên hàm, tên bảng, tên biến, hay mã trạng thái HTTP. `next` không được là "thử
lại sau" nếu không nói được **sau bao lâu**. Một thông báo mà cả hai nửa đều đúng nhưng người đọc
vẫn không biết bấm vào đâu thì chưa đạt.

Bốn ví dụ dưới đây lấy nguyên văn từ `apps/web/src/server/trpc/init.ts`.

### 4.1 `init.ts:162`

**Trước:** `'Quá nhiều request — thử lại sau'`

Bốn lỗi trong bảy chữ: gạch ngang dài (V3), `request` tiếng Anh giữa câu tiếng Việt, "sau" không
nói bao lâu, và không có `what` (người đọc không biết ngưỡng là gì nên không biết mình đã làm gì
sai).

**Sau:**

```ts
'error.rate.trpc': (p: { limit: number; windowSec: number }) => ({
  what: `Bạn đã dùng hết ${p.limit} lượt thao tác cho ${p.windowSec} giây gần đây.`,
  next: `Chờ ${p.windowSec} giây rồi bấm lại. Nếu bạn không bấm liên tục, hãy đóng bớt tab đang mở cùng tài khoản này, vì mọi tab dùng chung một hạn mức.`,
  retryAfterSec: p.windowSec,
}) satisfies DynamicError,
```

Nơi gọi truyền `TRPC_MUTATION_LIMIT_PER_MIN` và `RATE_LIMIT_WINDOW_MS / 1000` vào. Con số không
bao giờ gõ lại trong bản đồ: middleware là nơi thực thi hạn mức, nên middleware là nguồn sự thật
của con số. Câu thứ hai của `next` trả lời câu hỏi người dùng thật sẽ hỏi, vì khoá theo
`(type, userId)` nghĩa là nhiều tab cộng dồn vào một bucket.

### 4.2 `init.ts:176`

**Trước:** `'Không có quyền trên resource này'`

`resource` tiếng Anh. Không nói mục nào. Không có `next`. Không có dấu chấm.

**Sau:**

```ts
'error.authz.not-owner': {
  what: 'Mục này thuộc về một tài khoản khác nên bạn không mở được.',
  next: 'Mở danh sách của bạn ở trang Bài của tôi. Nếu bạn cho rằng đây là mục của mình, gửi đường dẫn trang này cho quản trị viên.',
  code: 'FORBIDDEN',
},
```

`next` chỉ nhắc thứ người dùng đang cầm trong tay, tức đường dẫn trên thanh địa chỉ. Không nhắc id
tài nguyên: `assertOwnerOrAdmin` không nhận id, nên hứa hiện id ra là hứa một dữ liệu không có ở
đó.

### 4.3 `init.ts:191`

**Trước:** `'Cần quyền soạn bài'`

Bốn chữ. Không nói vai trò hiện tại là gì, không nói xin ở đâu, không nói trong lúc chờ thì làm gì.

**Sau:**

```ts
'error.authz.need-author': {
  what: 'Tài khoản của bạn đang ở vai trò Người học, mà trang soạn bài chỉ mở cho vai trò Tác giả và Quản trị.',
  next: 'Gửi yêu cầu nâng vai trò cho quản trị viên kèm email đăng nhập của bạn. Trong lúc chờ, bạn vẫn làm được mọi bài học và lab.',
},
```

### 4.4 `init.ts:206`

**Trước:** `'Cần quyền quản trị'`

Cùng hình dạng 4.3, và nó còn để lọt một hiểu nhầm mà chính chú thích ở `init.ts:196-203` đã ghi:
Tác giả không phải một nấc thấp hơn Quản trị trên cùng một thang.

**Sau:**

```ts
'error.authz.need-admin': {
  what: 'Trang quản trị chỉ mở cho vai trò Quản trị. Vai trò Tác giả không bao gồm quyền này, kể cả khi bạn soạn được bài.',
  next: 'Quay lại trang chủ. Nếu bạn cần một thao tác quản trị cụ thể, nhắn cho quản trị viên kèm tên thao tác đó.',
},
```

### 4.5 Chuỗi đã đạt vẫn phải chuyển

`init.ts:153` viết `'Bạn chưa đăng nhập hoặc phiên đã hết hạn. Hãy đăng nhập lại rồi thử lại.'` và
nó đã thoả V4 sẵn. Nó vẫn chuyển vào bản đồ, tách thành `what` và `next`, vì một literal đúng vẫn
là một literal và T4 không phân biệt được đúng với sai. Khối chú thích ở `init.ts:147-150` (tRPC
v11 rơi về `opts.code` khi thiếu `message`, nên người dùng nhận đúng chuỗi `UNAUTHORIZED` viết
hoa) đi theo sang chỗ mới. Đó là lý do trường `message` không bao giờ được để trống.

### 4.6 Qua dây

Server ném `new TRPCError({ code: 'FORBIDDEN', message: errText('error.authz.need-author') })`.
`errText` ghép `what` và `next` bằng một dấu cách, nên người dùng nhận đủ hai nửa dù tRPC chỉ chở
được một chuỗi.

Việc chở **khoá** qua dây để client tự dựng hai nửa có định dạng riêng là **ngoài phạm vi P16**:
nó cần một envelope lỗi có cấu trúc ở cả hai đầu, và P16 là đợt frontend. Ghi ra đây để không ai
tưởng nó đã có.

---

## 5. Ranh giới giữa bản đồ và nội dung

### 5.1 Đường kẻ

**Vào `packages/copy`:** chuỗi do frontend viết, cố định lúc build, không đổi nếu không sửa mã.

**Ở lại dạng file nội dung:**

- `content/**` (161 file, ~21.300 từ): markdown bài học, `lab.json` (title, description, hint),
  câu hỏi quiz, mô tả lộ trình.
- `packages/games/src/k8s/levels/*.ts` (~39.250 từ): lời dẫn và thoại theo màn.
- Output của sandbox: chữ do shell, `kubectl`, `docker` in ra. Không phải ta viết.

**Hai phép thử, dùng theo thứ tự:**

1. *Sửa chuỗi này thì phải review một component, hay review một bài học?* Component thì vào bản đồ.
2. *Số bản sao của chuỗi này bị chặn bởi số màn hình, hay bởi số mục nội dung?* Số màn hình thì
   vào bản đồ.

Phép thử 2 là phép quyết định khi phép 1 lưỡng lự. Bản đồ thông điệp là một tập slot hữu hạn cố
định; nội dung là một tập mở lớn dần theo số bài. Đổ nội dung vào bản đồ là biến bản đồ thành một
CMS viết bằng TypeScript, và lúc đó cổng ở §3 phải chạy trên 60.000 từ mỗi lượt CI.

**Riêng `packages/games/**` còn một lý do thứ hai, mạnh hơn:** design §12 chốt không lane nào của
P16 ghi vào đó, vì một phiên song song đang sửa `components/k8s-arena/**`. Trích 39.250 từ ra khỏi
package đó là ghi vào đúng vùng cấm.

### 5.2 Vùng xám và phán quyết

| Chuỗi | Thuộc về | Lý do |
|---|---|---|
| Tiêu đề một nhiệm vụ lab (`Tìm và dừng tiến trình ngốn CPU`) | nội dung | Đến từ `lab.json`, số lượng bằng số lab |
| Chữ `Nhiệm vụ` gắn nhãn bảng nhiệm vụ | bản đồ | Một slot, mọi lab dùng chung |
| `Cơ bản` / `Trung cấp` / `Nâng cao` | bản đồ | Tập cố định bởi `ScenarioDifficulty`, một hợp đồng dữ liệu |
| `Sysbox` / `gVisor` / `Kata` | bản đồ | Tập cố định bởi `SandboxTierName`. Chuyển kèm nguyên khối chú thích cấm gắn tính từ |
| `bài học` / `lab` / `sân chơi` / `lộ trình` / `bộ câu hỏi` | bản đồ | Tập cố định bởi `CatalogKind`, đúng 5 giá trị |
| Câu trạng thái rỗng có chèn danh từ | bản đồ | Khung và danh từ đều là slot cố định |
| `hint` của một nhiệm vụ | nội dung | Một hint cho mỗi nhiệm vụ của mỗi lab |
| Nhãn nút `Gợi ý` mở hint đó | bản đồ | Một slot |

Quy tắc rút ra từ bảng: **cái khung là bản đồ, cái ruột là nội dung**, kể cả khi hai thứ nằm liền
nhau trong một câu.

### 5.3 Bẫy seed, và vì sao cổng file một mình là xanh giả

`scripts/seed-content.mjs` nạp văn xuôi của quiz và lộ trình vào Postgres. Hệ quả, đã ghi ở design
§11: **sửa `content/*.json` mà không chạy lại seed thì không có gì đổi trên màn hình và cũng không
có lỗi nào.** Không exception, không cảnh báo, không diff. Người sửa tin là mình đã sửa.

Hệ quả thứ hai, nặng hơn, giáng thẳng vào §3.2: cổng mất dấu đọc **file**. File sạch trong khi
hàng trong DB vẫn lột dấu là cổng xanh trong khi người học vẫn thấy lỗi. Đó là
xanh-mà-không-chứng-minh-gì ở dạng thuần khiết nhất: đo đúng, đo cẩn thận, đo nhầm tập dữ liệu.

**Phán quyết:** bộ dò của §3.2 export ra, và `scripts/seed-content.mjs` **gọi nó trên từng chuỗi
trước khi ghi hàng**, từ chối ghi và thoát khác 0 nếu có vi phạm. Đặt cổng đúng chỗ dữ liệu đi qua
biên. Lane nào sửa văn xuôi trong `content/quizzes/**` hoặc `content/paths/**` phải chạy seed và
ghi kết quả vào báo cáo chặng, không phải ghi "đã sửa file".

`packages/copy` không có bước seed nào và không có hàng nào trong DB. Đó là một lý do nữa để chữ
vỏ giao diện nằm ở đó.

---

## 6. Mỗi lane tự viết copy của mình, ngay khi dựng

**Không có lượt "sửa văn phong toàn hệ" ở cuối P16.** Một lượt như thế chạm khoảng 500 file trong
khi bảy lane đang ghi vào chính những file đó ở bảy worktree khác nhau. Nó hoặc hạ cánh trước và bị
đè, hoặc hạ cánh sau và xung đột với cả bảy. Và người chạy lượt đó không có ngữ cảnh để biết chuỗi
nào là tạm, chuỗi nào là cố ý.

### 6.1 Sở hữu file

L0 commit **cả mười file surface, đã rỗng, đã đăng ký sẵn trong `registry.ts`** trước khi lane nào
spawn. Từ đó không lane nào cần chạm `registry.ts`.

| Lane | Tiền tố | File sở hữu |
|---|---|---|
| L0 | `common.` `error.` `unit.` | `common.ts` `error.ts`, cộng toàn bộ `types.ts` `t.ts` `registry.ts` `scan.ts` và test |
| L1 | `shell.` `auth.` | `shell.ts` `auth.ts` |
| L2 | `catalog.` | `catalog.ts` |
| L3 | `session.` | `session.ts` |
| L4 | `home.` | `home.ts` |
| L5 | `admin.` | `admin.ts` |
| L6 | `author.` | `author.ts` |
| L7 | `me.` | `me.ts` |
| L8 | không ghi | chỉ đọc bản đồ để dựng cổng ở `e2e/**` |

`registry.ts` là file cùng hạng rủi ro với `packages/ui/src/index.ts` và `e2e/routes.ts` mà design
§9 đã đặt tên: file không thuộc về lane nào, hai lượt ghi thì lượt sau đè lượt trước, không dấu
xung đột, không lỗi biên dịch. Cách chặn là không ai ghi vào nó sau khi L0 xong.

Chuỗi dùng ở từ hai surface trở lên đi vào `common.`, và **L0 là người thêm**. Lane cần một khoá
chung thì nhắn L0, không tự thêm vào surface của mình rồi chép sang.

### 6.2 Xong nghĩa là gì

Mỗi lane, trước khi báo chặng xong:

1. T4 xanh trên glob của lane. Đây là cổng, không phải lời hứa.
2. Chạy tay lượt đối chiếu trên thư mục của mình:

   ```bash
   rg -n '[À-ɏẠ-ỹ]' apps/web/src/components/<lane>/ --type ts --type tsx
   ```

   Kết quả phải rỗng. **Không dùng `grep -iF`.** Hai cờ đó gộp lại trả 0 hit trên tiếng Việt trong
   im lặng, đo được trên chính máy này; mỗi cờ đứng riêng thì đúng. Một lượt "0 hit" bằng `-iF` là
   một lượt không đo gì.
3. Mọi thông báo lỗi mới của lane là `ErrorEntry`, không phải `Static`. Việc này đi qua tầng kiểu
   nên không cần kiểm tay.
4. Báo cáo chặng ghi số khoá lane đã thêm. Tổng các con số đó phải khớp `entries.length` mà T0
   khẳng định, và đó là cách phát hiện một lane bỏ chuỗi lại trong TSX mà T4 lọt.
