/**
 * Truy cập bản đồ. Hợp đồng: `p16-copy.md` §1.3.
 *
 * Gọi `t()` trên một khoá lỗi là lỗi biên dịch. Truyền tham số cho khoá tĩnh là
 * lỗi biên dịch. Quên tham số của khoá động là lỗi biên dịch.
 *
 * KHÔNG có `t(key: string)` nhận chuỗi tự do, và KHÔNG có overload nào nhận
 * `defaultValue`: một giá trị mặc định tại nơi gọi là một chuỗi nằm ngoài bản
 * đồ, tức là đúng thứ gói này tồn tại để xoá.
 */

import { MESSAGES } from './registry.ts';
import type { Counted, ErrorEntry, List, Params } from './types.ts';

export type { CopyKey } from './registry.ts';
export type {
  Counted,
  Dynamic,
  DynamicError,
  Entry,
  ErrorEntry,
  IntentionalThree,
  List,
  Params,
  Static,
  Surface,
} from './types.ts';

import type { CopyKey } from './registry.ts';
import type { Dynamic, DynamicError, Static } from './types.ts';

type Messages = typeof MESSAGES;

/** Khoá trả về CHỮ: mục tĩnh hoặc mục động trả chuỗi. */
export type TextKey = { [K in CopyKey]: Messages[K] extends Static | Dynamic ? K : never }[CopyKey];

/** Khoá trả về LỖI hai nửa. `t()` từ chối chúng ở tầng kiểu. */
export type ErrKey = {
  [K in CopyKey]: Messages[K] extends ErrorEntry | DynamicError ? K : never;
}[CopyKey];

export type ListKey = { [K in CopyKey]: Messages[K] extends List ? K : never }[CopyKey];

export type CountKey = { [K in CopyKey]: Messages[K] extends Counted ? K : never }[CopyKey];

/**
 * Rest-tuple rỗng cho mục tĩnh, một phần tử cho mục động. Đây là thứ biến "quên
 * tham số" thành lỗi biên dịch mà không cần một overload thứ hai.
 */
type ParamsOf<K extends CopyKey> = Messages[K] extends (p: infer P) => unknown ? [params: P] : [];

function firstArg(args: readonly unknown[]): Params {
  return (args[0] ?? {}) as Params;
}

export function t<K extends TextKey>(key: K, ...args: ParamsOf<K>): string {
  const entry = MESSAGES[key] as unknown as Static | ((p: Params) => string);
  return typeof entry === 'function' ? entry(firstArg(args)) : entry;
}

export function err<K extends ErrKey>(key: K, ...args: ParamsOf<K>): ErrorEntry {
  const entry = MESSAGES[key] as unknown as ErrorEntry | ((p: Params) => ErrorEntry);
  return typeof entry === 'function' ? entry(firstArg(args)) : entry;
}

/**
 * Ghép hai nửa bằng MỘT dấu cách, cho những đường chỉ chở được một chuỗi. tRPC
 * là đường đó: `new TRPCError({ code, message: errText('error.authz.need-author') })`.
 *
 * Người dùng nhận đủ cả `what` lẫn `next`. Client dựng lại hai nửa có định dạng
 * riêng thì cần một envelope lỗi có cấu trúc ở cả hai đầu, và việc đó NGOÀI
 * phạm vi P16.
 */
export function errText<K extends ErrKey>(key: K, ...args: ParamsOf<K>): string {
  const entry = err<K>(key, ...args);
  return `${entry.what} ${entry.next}`;
}

export function list<K extends ListKey>(key: K): readonly string[] {
  return (MESSAGES[key] as unknown as List).items;
}

/**
 * Ba nhánh biên tập, không phải ba nhánh ngữ pháp. Tiếng Việt không có số nhiều
 * và API này không có số nhiều.
 *
 * Ném lỗi khi `n` không phải số nguyên. Không làm tròn im lặng: một `2.5` lọt
 * vào đây là một phép chia sai ở nơi gọi, và làm tròn nó đi là giấu mất phép
 * chia sai đó sau một câu đọc trôi.
 */
export function count<K extends CountKey>(key: K, n: number): string {
  if (!Number.isInteger(n)) {
    throw new TypeError(
      `count(${JSON.stringify(key)}) chỉ nhận số nguyên, nhận được ${String(n)}. Nơi gọi phải tự quyết định làm tròn hay không, vì bản đồ thông điệp không có dữ liệu để quyết định thay.`,
    );
  }
  const entry = MESSAGES[key] as unknown as Counted;
  if (n === 0) {
    return entry.zero;
  }
  if (n === 1) {
    return entry.one;
  }
  return entry.many(n);
}

/**
 * Một tham chiếu tới bản đồ thông điệp: khoá cộng tham số, CHƯA dựng thành câu.
 *
 * ## Vì sao nó ở đây chứ không ở `apps/web`
 *
 * Cho tới 2026-09-11 kiểu này khai trong `apps/web/src/components/catalog/catalog-labels.ts`,
 * một file thuộc lane 16.C, trong khi bốn cây khác (`components/author`,
 * `app/author/problems`, `app/(session)/problems`, `app/quiz`) đều import ngược
 * vào đó. Một lane sở hữu tầng nối của bốn lane khác là một tầng đặt nhầm chỗ:
 * lane nào cũng phải chờ lane 16.C để đổi nó, và không lane nào được phép.
 *
 * Khối chú thích cũ ở `catalog-labels.ts:24-33` giải thích vì sao nó chưa sang
 * được: `package.json` khai đúng bốn lối vào và không lối nào chở được hàm khai
 * trong `surfaces/`. Lý lẽ đó đúng cho các hàm CHỌN, và sai cho chính `CopyRef`:
 * kiểu này chỉ cần `TextKey` và `Params`, cả hai đã sống trong file này. Nó
 * không cần một lối vào mới nào.
 *
 * Các hàm CHỌN (`describeCatalogEmpty`, `describeItem`, `formatDuration`, …) ở
 * lại `apps/web`, và đó là quyết định chứ không phải nợ: chúng nhận kiểu miền
 * của `apps/web` (`ProblemRow`, `SandboxTierName`, `ScenarioDifficulty`), nên
 * kéo chúng sang đây là kéo cả cây kiểu của ứng dụng vào một gói khai "không có
 * khối `dependencies`" như một hợp đồng. Thứ §1.6 thật sự mua là "mọi nhánh là
 * một mục tĩnh trong bản đồ", và điều đó đạt đủ khi bản đồ ở bên này còn nhánh ở
 * bên kia: bộ dò đọc bản đồ, không đọc bộ chọn.
 *
 * ## Đánh đổi ở tầng kiểu
 *
 * ⚠ Kiểu này CỐ Ý mất phần kiểm THAM SỐ ở tầng biên dịch. `t('catalog.pager.page')`
 * viết thẳng thì TypeScript đòi đúng `{ page: number }`; đi qua `CopyRef` thì
 * `params` chỉ còn là `Params`. Đó là cái giá của việc một hàm chọn trả về nhiều
 * khoá có chữ ký khác nhau.
 *
 * Bù bằng test, không bằng lời hứa: mỗi nhánh của mỗi bộ chọn có một ca DỰNG RA
 * CÂU rồi so với chữ thật, nên một tham số sai tên hiện ra ngay dưới dạng chuỗi
 * còn nguyên chỗ trống chứ không lọt.
 *
 * KHOÁ thì vẫn được kiểm: `TextKey` là union các khoá chữ có thật, nên gõ sai
 * tên khoá là lỗi biên dịch.
 */
export interface CopyRef {
  readonly key: TextKey;
  readonly params?: Params;
}

/**
 * Dựng một `CopyRef` thành câu.
 *
 * Một phép ép kiểu, ở đúng MỘT chỗ, và nó an toàn lúc chạy: `t()` tự phân biệt
 * mục tĩnh với mục động bằng `typeof entry === 'function'`, nên truyền thừa tham
 * số cho một mục tĩnh không gây gì, và truyền đúng tham số cho một mục động thì
 * chạy đúng.
 */
export function renderCopy(ref: CopyRef): string {
  const call = t as unknown as (key: TextKey, params?: Params) => string;
  return ref.params === undefined ? call(ref.key) : call(ref.key, ref.params);
}
