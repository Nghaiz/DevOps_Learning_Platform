/**
 * Khoá rút ngẫu nhiên của game **Đường ống CI/CD**.
 *
 * Đây là hiện thực của LUẬT 1 ở `contract.ts` §4, và nó tồn tại thành một file
 * riêng vì đúng một lý do: chỗ này là chỗ dễ làm sai nhất trong cả engine, và
 * cái sai của nó KHÔNG đỏ ở bất kỳ test tất định nào.
 *
 * ## Vì sao khoá, chứ không phải một bộ sinh chạy dọc
 *
 * Cách tự nhiên nhất là giữ một `RngState` duy nhất cho cả lượt chạy rồi rút
 * dần mỗi khi cần. Cách đó tất định — chạy hai lần cho ra hai kết quả giống hệt
 * nhau — nên mọi test "cùng seed ⇒ cùng kết quả" đều XANH. Nó vẫn sai, và sai ở
 * chỗ test đó không nhìn tới:
 *
 * thứ tự rút = thứ tự xếp lịch. Người chơi thêm một máy chạy, thứ tự xếp lịch
 * đổi, nên mọi bước nhận một con xúc xắc KHÁC. So hai lời giải "trên cùng seed"
 * khi đó là so hai thế giới, không phải so hai lời giải. Bài C09 (đọc phân bố
 * đỏ giả) và bảng so lời giải 19.E.5 đều mất nghĩa cùng một lúc.
 *
 * Với khoá thì ngược lại: đổi số máy đổi *khi nào* một bước chạy, không đổi *nó
 * rút được gì*. Đó là điều kiện để đọc được hiệu ứng của một thay đổi, và
 * `engine.test.ts` có một đối chứng đo đúng chuyện này (thêm máy ⇒ chuỗi xúc
 * xắc của từng thực thể giữ nguyên, trong khi mốc thời gian phải đổi).
 *
 * ## Vì sao có `rollsForKey` chứ không chỉ một hàm rút một số
 *
 * `FlakeDrawKey` không có trường `step`: nó khoá tới mức MỘT LẦN THỬ của một
 * thực thể stage, còn một stage thì có nhiều bước. Nên khoá định danh một
 * *dòng* số, và chỉ số bước chọn vị trí trong dòng đó.
 *
 * ⚠ Hệ quả phải giữ: chỉ số bước là chỉ số KHAI BÁO trong `StageSpec.steps`,
 * không phải "bước thứ mấy đã chạy". Một stage gãy ở bước 2 vẫn phải để bước 4
 * nhận đúng con số mà nó sẽ nhận nếu stage chạy hết — nếu không, thêm một lần
 * đỏ ở bước 2 sẽ dịch xúc xắc của mọi bước sau, và ta quay lại đúng cái bệnh
 * của bộ sinh chạy dọc, chỉ ở phạm vi nhỏ hơn. Vì thế engine rút TRỌN mảng cho
 * mọi bước đã khai, TRƯỚC khi chạy bước nào.
 *
 * Không có PRNG thứ hai ở đây: mọi thứ đi qua `core/rng.ts`. File này chỉ làm
 * một việc — biến một khoá thành một hạt giống.
 */

import type { FlakeDrawKey } from './contract.ts';
import { nextFloat, seedRng, type RngState } from '../core/rng.ts';

/** FNV-1a 32-bit. Hằng chuẩn của thuật toán. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Chuỗi chính tắc của một lần rút. **Đây là một phần của hợp đồng hành vi**, y
 * như định dạng `InstanceKey`: đổi dấu phân tách là đổi toàn bộ kết quả của mọi
 * level đã cân bằng, trong im lặng.
 *
 * Dấu `|` chọn có lý do: `StageId`, `CommitId`, `InputId` đều bị ràng buộc
 * `[a-z0-9-]`, còn `InstanceKey` thêm `#` và `/`. Không định danh nào chứa được
 * `|`, nên không có hai khoá khác nhau nối ra cùng một chuỗi.
 */
export function drawKeyString(baseSeed: number, key: FlakeDrawKey): string {
  return `${baseSeed}|${key.pass}|${key.commitId}|${key.instance}|${key.attempt}|${key.draw}`;
}

/**
 * Băm chuỗi thành uint32.
 *
 * FNV-1a chứ không phải `hashCode` kiểu Java (`h * 31 + c`): phép nhân 31 tràn
 * ra ngoài 53-bit an toàn của `number` khi chuỗi dài, và khi tràn thì kết quả
 * phụ thuộc cách engine JS làm tròn. `Math.imul` giữ mọi bước trong đúng 32-bit,
 * đúng lý do `core/rng.ts` chọn mulberry32.
 */
export function hashDrawKey(text: string): number {
  let hash = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash ^ text.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Trạng thái RNG cho một khoá. Cùng khoá ⇒ cùng trạng thái, luôn luôn. */
export function rngForDraw(baseSeed: number, key: FlakeDrawKey): RngState {
  return seedRng(hashDrawKey(drawKeyString(baseSeed, key)));
}

/**
 * `count` số thực trong `[0, 1)` lấy từ dòng của một khoá.
 *
 * Phần tử thứ `i` là con xúc xắc của bước khai báo thứ `i`. `count` âm hoặc
 * không hữu hạn trả mảng rỗng — dữ liệu level tới từ JSON và một `NaN` lọt vào
 * không được phép làm sập lần chấm.
 */
export function rollsForKey(
  baseSeed: number,
  key: FlakeDrawKey,
  count: number,
): readonly number[] {
  if (!Number.isFinite(count) || count < 1) {
    return [];
  }
  const total = Math.trunc(count);
  const out: number[] = [];
  let cursor = rngForDraw(baseSeed, key);
  for (let i = 0; i < total; i += 1) {
    const draw = nextFloat(cursor);
    out.push(draw.value);
    cursor = draw.state;
  }
  return out;
}
