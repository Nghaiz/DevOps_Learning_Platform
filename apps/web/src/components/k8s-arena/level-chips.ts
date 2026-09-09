import { resolveKind } from '@devops-platform/games';
import type { Level } from '@devops-platform/games';

/**
 * Dữ liệu tóm tắt của một màn, dạng CHIP — thay cho dòng mô tả.
 *
 * ## Vì sao bỏ dòng mô tả
 *
 * Màn chọn màn cũ in `mission` dưới mỗi tiêu đề: một câu đầy đủ, kèm tên tài
 * nguyên trong dấu nháy ngược và tên namespace. Ba mươi sáu câu như vậy xếp
 * cạnh nhau là ba mươi sáu đoạn văn phải ĐỌC, trong khi việc người chơi đang
 * làm chỉ là CHỌN. Chỉ đạo của chủ dự án: *"các dòng mô tả đi kèm đề bài cũng
 * thừa thãi, thay bằng cái gì đó khác đi"*.
 *
 * Chip trả lời đúng những câu người ta hỏi khi đang chọn — làm về cái gì, gõ
 * lệnh gì, mất bao lâu — mà mắt quét được chứ không phải đọc.
 *
 * ## Mọi chip đều DẪN XUẤT, không có bảng viết tay nào
 *
 * Ba mươi sáu dòng dữ liệu viết tay là ba mươi sáu chỗ để lệch khỏi nội dung
 * thật của màn. Ở đây tất cả tính từ chính `Level`, nên sửa màn là chip đổi theo.
 */

export interface LevelChips {
  /** Loại tài nguyên trung tâm của màn, tối đa 3. */
  readonly kinds: readonly string[];
  /** Lệnh `kubectl` chính, đã rút gọn về động từ + đối tượng. `null` nếu màn không dạy lệnh nào. */
  readonly command: string | null;
  /** Ước lượng thời gian, phút. Xem `estimateMinutes`. */
  readonly minutes: number;
}

const MAX_KINDS = 3;

/**
 * Ước lượng thời gian, TÍNH TỪ `parMoves` và độ khó.
 *
 * ⚠ Đây là một ƯỚC LƯỢNG, không phải số đo — và nó được tính chứ không viết tay
 * đúng vì lý do đó: một con số viết tay trông y hệt một con số đã đo, còn công
 * thức thì tự nói ra nó là suy ra từ đâu. Giao diện hiển thị nó kèm dấu `~`.
 *
 * `parMoves` là số thao tác tối thiểu mà người ra đề cho là đủ; nhân với thời
 * gian một thao tác, cộng phần đọc đề và chẩn đoán (nặng dần theo độ khó).
 */
const MINUTES_PER_MOVE = 1.4;
const READING_MINUTES = { basic: 2, intermediate: 4, advanced: 6 } as const;

export function estimateMinutes(level: Level): number {
  const raw = level.parMoves * MINUTES_PER_MOVE + READING_MINUTES[level.difficulty];
  return Math.max(3, Math.min(30, Math.round(raw)));
}

/**
 * Rút gọn một dòng cheatsheet về phần đáng hiện.
 *
 * `kubectl rollout status deployment/api -n nen-tang` → `rollout status`.
 * Bỏ `kubectl`, bỏ cờ, bỏ tên tài nguyên cụ thể (tên đó chỉ có nghĩa bên trong
 * màn, còn chip thì đọc ở ngoài). Giữ lại tối đa hai từ đầu — đủ để nhận ra
 * lệnh, không đủ dài để chip thành một dòng lệnh.
 */
const ROLLOUT_SUBS = new Set(['status', 'restart', 'undo', 'history']);

export function shortenCommand(command: string): string | null {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== 'kubectl' && tokens[0] !== 'k') {
    return null;
  }
  const verb = tokens[1];
  if (verb === undefined || verb.startsWith('-')) {
    return null;
  }

  /*
   * Từ thứ hai chỉ được giữ khi nó là một LOẠI TÀI NGUYÊN hoặc một lệnh con của
   * `rollout` — tức khi nó vẫn có nghĩa ở ngoài màn.
   *
   * ⚠ Bản trước giữ mọi từ không chứa `/` hay `.`, và chip của màn 03 hiện ra
   * `logs bao-cao`: `bao-cao` là TÊN một pod chỉ tồn tại bên trong màn đó, vô
   * nghĩa với người đang đứng ngoài chọn màn. Danh sách trắng thì không có cách
   * nào để một cái tên lọt qua.
   */
  const second = tokens[2];
  if (second === undefined || second.startsWith('-')) {
    return verb;
  }
  if (verb === 'rollout' && ROLLOUT_SUBS.has(second)) {
    return `${verb} ${second}`;
  }
  // Danh sách phân cách bằng dấu phẩy (`deploy,rs,pods`) chỉ cần phần tử đầu
  // phân giải được là đủ để chip có nghĩa.
  const head = second.split(',')[0] ?? '';
  return resolveKind(head) === null ? verb : `${verb} ${second}`;
}

/**
 * Loại tài nguyên trung tâm của màn.
 *
 * `allowedResources` là thứ người chơi được TẠO, nên nó là câu trả lời sát nhất
 * cho "màn này làm về cái gì". Màn chỉ chẩn đoán mà không tạo gì (danh sách
 * rỗng) thì lùi về `teaches`, lọc lấy những mục trông như tên loại — `teaches`
 * là một mảng trộn cả tên sự cố lẫn tên lệnh lẫn khái niệm, nên phải lọc.
 */
export function centralKinds(level: Level): readonly string[] {
  if (level.allowedResources.length > 0) {
    return level.allowedResources.slice(0, MAX_KINDS);
  }
  return level.teaches
    .filter((item) => /^[A-Z][A-Za-z]+$/.test(item) && !item.includes(' '))
    .slice(0, MAX_KINDS);
}

export function levelChips(level: Level): LevelChips {
  return {
    kinds: centralKinds(level),
    command: firstCommand(level),
    minutes: estimateMinutes(level),
  };
}

function firstCommand(level: Level): string | null {
  for (const entry of level.teaching.cheatsheet) {
    const short = shortenCommand(entry.command);
    if (short !== null) {
      return short;
    }
  }
  return null;
}
