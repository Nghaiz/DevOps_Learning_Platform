/**
 * Sáu dạng mục, không có dạng thứ bảy.
 *
 * Hợp đồng: `plans/devops-learning-platform/contracts/p16-copy.md` §1.1.
 *
 * ⛔ LUẬT GÕ PHÍM CHO CẢ GÓI NÀY. Ba ký tự U+2014, U+2013, U+2015 không bao giờ
 * được gõ thẳng ở bất kỳ đâu trong `packages/copy`, kể cả trong chú thích, kể cả
 * trong file test. Cần nhắc tới chúng thì gọi tên điểm mã, hoặc viết bằng escape
 * Unicode của JavaScript. Lý do: bộ quét T1a đọc toàn bộ file dưới dạng text và
 * cố ý KHÔNG loại trừ file nào, vì một danh sách loại trừ chính là chỗ mà thứ
 * cần chặn đi qua. Giá phải trả là người viết gõ dấu phẩy trong chú thích của
 * gói này. Chấp nhận.
 */

/**
 * Tham số nội suy. Chỉ `string` và `number`.
 *
 * KHÔNG nhận `ReactNode`, `Date`, hay object: một `ReactNode` lọt vào đây thì
 * bản đồ biến thành tầng render, và bộ dò ở `scan.ts` mất khả năng đọc giá trị
 * ra chuỗi. Ngày muốn hiển thị thì nơi gọi tự định dạng rồi truyền chuỗi vào.
 */
export type Params = Readonly<Record<string, string | number>>;

/** Chuỗi tĩnh. Dạng thường gặp nhất. */
export type Static = string;

/**
 * Chuỗi có tham số. Tên tham số nằm TRONG kiểu, nên gọi sai tên là lỗi biên
 * dịch chứ không phải một chuỗi `{name}` còn nguyên trên màn hình.
 *
 * ⚠ SAI LỆCH CÓ CHỦ Ý so với §1.1 của hợp đồng, và nó là sai lệch DUY NHẤT ở
 * tầng kiểu. Hợp đồng viết `<P extends Params = Params>`. Bản đó KHÔNG biên
 * dịch được, và thứ nó từ chối chính là ví dụ ở §1.2 của cùng file hợp đồng.
 * Đo bằng `tsc` 7.0.2 với `strict` của `tsconfig.base.json`:
 *
 *     error TS2322: Type '(p: { page: number; noun: string; }) => string' is not
 *     assignable to type 'Dynamic<Readonly<Record<string, string | number>>>'.
 *       Types of parameters 'p' and 'params' are incompatible.
 *
 * Nguyên nhân: `strictFunctionTypes` kiểm tham số của kiểu-hàm theo chiều
 * NGƯỢC. Để `(p: {page: number}) => string` gán được vào `(params: Params) =>
 * string` thì `Params` phải gán được vào `{page: number}`, mà index signature
 * của `Params` chỉ hứa `string | number` chứ không hứa `number`. Với mặc định
 * `never` thì phép kiểm ngược thành `never` gán được vào `{page: number}`, luôn
 * đúng. Dòng `Entry` bên dưới nhờ vậy giữ nguyên đúng từng chữ như §1.1.
 *
 * `satisfies DynamicError` ở §4.1 của hợp đồng cũng chỉ chạy được với mặc định
 * này, nên đây không phải một lựa chọn giữa hai bản cùng đúng.
 */
export type Dynamic<P extends Params = never> = (params: P) => string;

/**
 * Đếm. Ba nhánh, cả ba do người viết soạn, không nhánh nào suy ra được.
 *
 * `zero` là BẮT BUỘC ở tầng kiểu, và đó là điểm chính. Lab k8s hôm nay hiện
 * "Còn 0 chỗ" khi năm khe quota bị setup hỏng giữ lại. Câu đó đúng số học và vô
 * dụng với người đọc. Thiếu `zero` là lỗi biên dịch, nên luật này không cần test.
 *
 * Đây KHÔNG phải số nhiều. Tiếng Việt không có số nhiều, và `scan.ts` không có
 * bộ dò nào cho nó vì không có gì để dò. Xem §1.5 của hợp đồng.
 */
export interface Counted {
  readonly zero: string;
  readonly one: string;
  readonly many: (n: number) => string;
}

/** Danh sách. Xem `scanThree` trong `scan.ts` về `intentionalThree`. */
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
 * ("một mã thoát không phải câu trả lời") được ép bằng hình dạng kiểu, không
 * bằng một lời nhắc trong tài liệu.
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

/** Xem ghi chú về mặc định `never` ở `Dynamic`. Cùng một lý do, cùng một phép đo. */
export type DynamicError<P extends Params = never> = (params: P) => ErrorEntry;

export type Entry = Static | Dynamic | Counted | List | ErrorEntry | DynamicError;

/**
 * Mọi khoá của một surface phải mở đầu bằng tên surface. Sai tiền tố là lỗi
 * biên dịch, nên không cần một test cho việc đó.
 *
 * `N` nhận được một union: `Surface<'common' | 'unit'>` cho phép đúng hai tiền
 * tố đó và không cho phép tiền tố thứ ba. Đó là cách `common.ts` giữ được cả
 * `common.` lẫn `unit.` mà vẫn nằm trong một file (bảng sở hữu §6.1 giao cả hai
 * tiền tố cho L0 nhưng chỉ giao hai file `common.ts` và `error.ts`).
 */
export type Surface<N extends string> = Readonly<Record<`${N}.${string}`, Entry>>;

/**
 * Khai báo "đúng ba mục này là cố ý", tra theo TIỀN TỐ của nhóm khoá anh em
 * hoặc theo chính khoá của một `List` ba phần tử.
 *
 * Giá trị phải khớp `/^\d{4}-\d{2}-\d{2}: .{20,}/`. Một dấu tích không bắt ai
 * phải nghĩ; một câu có lý do thì bắt.
 *
 * Mỗi file surface export bảng của RIÊNG nó (`<surface>IntentionalThree`), và
 * `registry.ts` gộp lại. Đó là điều kiện để một lane khai được ngoại lệ của
 * mình mà không phải chạm `registry.ts`, thứ mà §6.1 cấm.
 *
 * *Ghi chú kỹ thuật:* hợp đồng gợi ý cân nhắc ép định dạng ngày ở tầng kiểu
 * bằng `` `${number}-${number}-${number}: ${string}` ``. Đã bỏ: `${number}`
 * KHÔNG khớp phân đoạn có số 0 đứng đầu, nên `2026-09-10` bị từ chối ở tháng
 * `09`. Luật ngày ở lại tầng test.
 */
export type IntentionalThree = Readonly<Record<string, string>>;
