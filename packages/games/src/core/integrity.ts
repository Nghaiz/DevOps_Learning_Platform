/**
 * Hai lớp phụ trợ quanh phát lại: checksum bản lưu và kiểm tính hợp lý.
 *
 * ⚠⚠ CHECKSUM Ở ĐÂY KHÔNG PHẢI BẢO MẬT. Nói thẳng một lần, và đừng để câu này
 * trôi thành một lời hứa mạnh hơn sự thật:
 *
 *   Hàm băm nằm trong bundle JavaScript gửi tới trình duyệt. Ai đọc được bundle
 *   thì tính lại được checksum. Không có khoá bí mật nào — không thể có, vì mọi
 *   thứ chạy ở client đều đọc được. Bất kỳ ai bỏ ra mười phút đều sửa được bản
 *   lưu VÀ sửa luôn checksum cho khớp.
 *
 *   Nó chặn đúng một thứ: sửa tay tuỳ hứng bằng devtools rồi bấm Enter. Nó NÂNG
 *   CHI PHÍ, không CHẶN. Thứ thật sự chặn được là phát lại tất định
 *   (`verify.ts`) — vì nó không đòi hỏi giữ bí mật thứ gì.
 *
 * Kiểm tính hợp lý (§8.4.2) cũng cùng hạng: nó bắt những lượt chơi BẤT KHẢ THI,
 * không bắt những lượt chơi giả mà hợp lý. Một người chịu khó làm giả tử tế sẽ
 * qua được hết mục này và vẫn bị phát lại chặn.
 *
 * ⛔ MỌI THỨ Ở ĐÂY CHỈ GẮN CỜ, KHÔNG XOÁ (§8.3.3). Một bản lưu hỏng vì đổi
 * version rơi vào đúng nhánh với một bản bị sửa tay; xoá dữ liệu người dùng vì
 * nghi ngờ tệ hơn chính vấn đề.
 *
 * @see docs/games/anti-cheat.md
 */

/*
 * `RunLog` tới từ `core/run-log.ts` kể từ 17.A.2. Dạng RỘNG là đúng ở đây: cả
 * `lastActionTick` lẫn `checkPlausibility` chỉ đọc `action.tick`, nên chúng đúng
 * với mọi game — xem đầu `core/run-log.ts`.
 */
import type { RunLog } from './run-log.ts';
import type { GameSave, RunResult } from './types.ts';

// ── Chuỗi hoá ổn định ───────────────────────────────────────────────────────

/**
 * `JSON.stringify` KHÔNG dùng được cho checksum: thứ tự key của nó là thứ tự
 * CHÈN, nên hai object bằng nhau về nội dung nhưng dựng theo thứ tự khác sẽ ra
 * hai chuỗi khác — checksum lệch trên một bản lưu không hề bị sửa. Ở đây key
 * được sắp xếp, nên chuỗi ra chỉ phụ thuộc NỘI DUNG.
 *
 * Ba thứ `JSON.stringify` làm mất và ở đây giữ lại, vì mất chúng nghĩa là hai
 * giá trị khác nhau ra cùng một checksum:
 *   - `undefined` (nó bỏ hẳn key) — ở đây là `__undefined__`
 *   - `NaN` / `±Infinity` (nó biến thành `null`) — ở đây giữ nguyên tên
 *   - `-0` (nó in ra `0`) — ở đây là `-0`
 *
 * Ném khi gặp vòng lặp tham chiếu thay vì treo hoặc trả bừa: một cấu trúc có
 * vòng lặp là lỗi lập trình, và `verify.ts` bắt lỗi này thành `phat-lai-loi` —
 * to tiếng, không im lặng.
 */
export function stableStringify(value: unknown, seen: ReadonlySet<object> = new Set()): string {
  if (value === null) return 'null';
  if (value === undefined) return '__undefined__';

  const kind = typeof value;
  if (kind === 'number') {
    const n = value as number;
    if (Number.isNaN(n)) return 'NaN';
    if (n === Infinity) return 'Infinity';
    if (n === -Infinity) return '-Infinity';
    if (Object.is(n, -0)) return '-0';
    return String(n);
  }
  if (kind === 'boolean') return String(value);
  if (kind === 'string') return JSON.stringify(value);
  if (kind === 'bigint') return `${String(value)}n`;
  if (kind === 'function' || kind === 'symbol') {
    throw new TypeError(`stableStringify: không chuỗi hoá được ${kind}`);
  }

  const object = value as object;
  if (seen.has(object)) throw new TypeError('stableStringify: cấu trúc có vòng lặp tham chiếu');
  const nested = new Set(seen);
  nested.add(object);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, nested)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], nested)}`);
  return `{${parts.join(',')}}`;
}

// ── Checksum ────────────────────────────────────────────────────────────────

/**
 * FNV-1a 32-bit. Chọn nó thay vì SHA-256 qua `crypto.subtle` vì `crypto.subtle`
 * là API BẤT ĐỒNG BỘ và chỉ có trong ngữ cảnh secure — tức là đọc/ghi
 * `localStorage` sẽ phải thành async, còn test thì phải chờ. Với một phép kiểm
 * mà chính nó thừa nhận không phải bảo mật thì đổi lấy độ phức tạp đó là lỗ.
 *
 * `Math.imul` chứ không `*`: nhân số 32-bit bằng `*` trong JS tràn qua double và
 * mất bit thấp, ra một hàm băm khác hẳn (và khác nhau giữa các nền).
 */
export function checksum(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Bản lưu kèm dấu.
 *
 * Là kiểu RIÊNG thay vì thêm field vào `GameSave` — `GameSave` do lead sở hữu
 * (`core/types.ts`), và một checksum nằm bên trong chính cái nó băm là một vòng
 * tự tham chiếu phải xử lý bằng cách bóc field ra trước khi băm. Bọc ngoài thì
 * không có vấn đề đó.
 */
export interface StampedSave {
  readonly save: GameSave;
  readonly checksum: string;
}

export function stampSave(save: GameSave): StampedSave {
  return { save, checksum: checksum(save) };
}

export type SaveIntegrity =
  /** Checksum khớp. KHÔNG có nghĩa là "chưa từng bị sửa" — xem đầu file. */
  | 'nguyen-ven'
  /** Checksum lệch: nội dung đã đổi ngoài game. Gắn cờ, KHÔNG xoá. */
  | 'da-bi-sua'
  /** Không có checksum kèm theo (bản lưu cũ hơn tính năng này). Không phải cáo buộc. */
  | 'khong-co-dau';

export function checkSave(stamped: Partial<StampedSave> & { save: GameSave }): SaveIntegrity {
  if (typeof stamped.checksum !== 'string' || stamped.checksum.length === 0) {
    return 'khong-co-dau';
  }
  return checksum(stamped.save) === stamped.checksum ? 'nguyen-ven' : 'da-bi-sua';
}

// ── Kiểm tính hợp lý ────────────────────────────────────────────────────────

/** Trần điểm theo hợp đồng `RunResult.score` (`core/types.ts`): 0..1000. */
export const SCORE_MAX = 1000;

export type PlausibilityCode =
  | 'thoi-gian-nguoc'
  | 'nhanh-hon-mo-phong'
  | 'dat-muc-tieu-khong-lenh'
  | 'diem-vuot-tran'
  | 'diem-am'
  | 'objective-thua'
  | 'objective-trung'
  | 'so-dem-am'
  | 'moc-thoi-gian-hong';

export interface PlausibilityFlag {
  readonly code: PlausibilityCode;
  /** Tiếng Việt, một câu, kèm số đo — để người đọc log biết lệch bao nhiêu. */
  readonly detail: string;
}

/**
 * Ngưỡng phụ thuộc level, nên phải TIÊM VÀO chứ không đoán.
 *
 * Không có giá trị mặc định nào ở đây, và đó là chủ ý: một `msPerTick` đoán bừa
 * sẽ làm phép kiểm "nhanh hơn mô phỏng" hoặc kêu oan hàng loạt, hoặc không bao
 * giờ kêu — cả hai đều là một cổng nói dối (`green-that-proves-nothing`).
 */
export interface PlausibilityLimits {
  /** Mili-giây thật cho MỘT tick mô phỏng. Từ cấu hình vòng lặp của lane B. */
  readonly msPerTick: number;
  /** Trần điểm của level này. Không vượt quá `SCORE_MAX`. */
  readonly maxScore: number;
  /**
   * id các objective đạt được mà KHÔNG cần lệnh nào (ví dụ "đọc xong mô tả").
   * Rỗng là trường hợp thường gặp. Có danh sách này thì phép kiểm
   * `commandsUsed === 0` mới không kêu oan trên level có mục tiêu dạng đọc-hiểu.
   */
  readonly objectivesAchievableWithoutCommands: readonly string[];
}

/** Tick của hành động cuối trong nhật ký. 0 khi nhật ký rỗng. */
export function lastActionTick(log: RunLog): number {
  let last = 0;
  for (const action of log.actions) {
    if (action.tick > last) last = action.tick;
  }
  return last;
}

/**
 * Gắn cờ những lượt chơi BẤT KHẢ THI. Mảng rỗng = không thấy gì bất thường,
 * KHÔNG phải "đã xác minh" — xác minh là việc của `verify.ts`.
 *
 * ⚠ Các phép kiểm ở đây đọc LỜI KHAI (`run`), cố ý. `verify.ts` đối chiếu lời
 * khai với nhật ký; chỗ này hỏi một câu khác và độc lập: bản thân lời khai có
 * tự mâu thuẫn không. Một bản lưu bị sửa vụng thường hỏng ở đây trước khi phát
 * lại kịp chạy.
 */
export function checkPlausibility(
  run: RunResult,
  log: RunLog,
  limits: PlausibilityLimits,
): readonly PlausibilityFlag[] {
  const flags: PlausibilityFlag[] = [];

  // ── mốc thời gian
  if (!Number.isFinite(run.startedAt) || !Number.isFinite(run.finishedAt)) {
    flags.push({
      code: 'moc-thoi-gian-hong',
      detail: `mốc thời gian không phải số hữu hạn: startedAt=${String(run.startedAt)}, finishedAt=${String(run.finishedAt)}`,
    });
  } else {
    const durationMs = run.finishedAt - run.startedAt;
    if (durationMs < 0) {
      flags.push({
        code: 'thoi-gian-nguoc',
        detail: `finishedAt trước startedAt ${Math.abs(durationMs)}ms`,
      });
    } else {
      // Chuỗi action đòi ít nhất `lastTick` tick mô phỏng mới xảy ra được, nên
      // một lượt chơi ngắn hơn thế là bất khả thi dù đồng hồ nói gì.
      const minimumMs = lastActionTick(log) * limits.msPerTick;
      if (durationMs < minimumMs) {
        flags.push({
          code: 'nhanh-hon-mo-phong',
          detail: `xong trong ${durationMs}ms nhưng chuỗi action đòi tối thiểu ${minimumMs}ms (${lastActionTick(log)} tick × ${limits.msPerTick}ms)`,
        });
      }
    }
  }

  // ── objective
  const unique = new Set(run.objectivesMet);
  if (unique.size !== run.objectivesMet.length) {
    flags.push({
      code: 'objective-trung',
      detail: `objectivesMet có id trùng: ${run.objectivesMet.length} phần tử, ${unique.size} id khác nhau`,
    });
  }
  if (run.objectivesMet.length > run.objectivesTotal) {
    flags.push({
      code: 'objective-thua',
      detail: `đạt ${run.objectivesMet.length} objective nhưng level chỉ có ${run.objectivesTotal}`,
    });
  }
  if (run.commandsUsed === 0) {
    const freebies = new Set(limits.objectivesAchievableWithoutCommands);
    const needCommands = [...unique].filter((id) => !freebies.has(id));
    if (needCommands.length > 0) {
      flags.push({
        code: 'dat-muc-tieu-khong-lenh',
        detail: `commandsUsed = 0 nhưng đạt ${needCommands.length} objective cần lệnh: ${needCommands.join(', ')}`,
      });
    }
  }

  // ── điểm
  if (run.score < 0) {
    flags.push({ code: 'diem-am', detail: `score âm: ${run.score}` });
  }
  const ceiling = Math.min(limits.maxScore, SCORE_MAX);
  if (run.score > ceiling) {
    flags.push({
      code: 'diem-vuot-tran',
      detail: `score ${run.score} vượt trần ${ceiling} (trần level ${limits.maxScore}, trần hợp đồng ${SCORE_MAX})`,
    });
  }

  // ── bộ đếm
  const negatives: string[] = [];
  if (run.commandsUsed < 0) negatives.push(`commandsUsed=${run.commandsUsed}`);
  if (run.hintsUsed < 0) negatives.push(`hintsUsed=${run.hintsUsed}`);
  if (run.objectivesTotal < 0) negatives.push(`objectivesTotal=${run.objectivesTotal}`);
  if (negatives.length > 0) {
    flags.push({ code: 'so-dem-am', detail: `bộ đếm âm: ${negatives.join(', ')}` });
  }

  return flags;
}
