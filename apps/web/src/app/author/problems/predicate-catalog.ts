import {
  PROBLEM_PLUGINS,
  type GameId,
  type ProblemArgSpec,
} from '@devops-platform/games';
import { t } from '@devops-platform/copy';

import { PREDICATE_SPECS, isPredicateName } from './predicate-spec';
import type { PredicateArgSpec, PredicateSpec } from './predicate-arg-types';

/**
 * Bộ tra vị từ THEO GAME cho trang soạn bài — P20.
 *
 * ## Lỗi mà file này sinh ra để sửa
 *
 * Trước đợt này, ba chỗ của trang soạn bài đều khoá cứng vào K8s:
 * `objective-fields.tsx` dựng ô chọn bằng `PREDICATE_NAMES`, `problem-draft.ts`
 * ép tham số bằng `PREDICATE_SPECS`, và `problem-validate.ts` gọi
 * `isPredicateName`. Cả ba bảng đều là của RIÊNG game K8s.
 *
 * Hệ quả đo được 2026-09-17: soạn một bài CI/CD dừng ở đúng một ô — *"Chưa chọn
 * vị từ kiểm tra"* — dù JSON nhập vào có `check: 'rollbackUnder'` đầy đủ. Bài
 * Git cũng vậy. Đợt 18.D mở đa-game ở BIÊN GHI mà không mở ở đây, và khoảng hở
 * sống im lặng vì không ô test nào soạn bài cho game khác K8s.
 *
 * ## Hai nguồn, và vì sao KHÔNG gộp làm một
 *
 * | Nguồn | Có gì | Dùng khi |
 * |---|---|---|
 * | `PREDICATE_SPECS` (tầng web) | khoá chữ i18n + kiểu ô riêng của K8s (`namespace`, `node`, `resource-kind`, `selector`, `probe`), và `requireOneOf` | `gameId === 'k8s'` |
 * | `plugin.predicateArgs` (hợp đồng) | tên, kiểu, bắt buộc — phần CHUNG mọi game | mọi game khác |
 *
 * Kéo bảng K8s xuống `packages/games` sẽ lôi cả tầng trình bày vào một package
 * cấm React; kéo bảng chung lên đây thì plugin không khai nổi bảng của mình. Nên
 * hai nguồn ở lại, và `predicate-spec.test.ts` ĐỐI CHIẾU chúng từng vị từ để bản
 * sao không trôi trong im lặng.
 */

/** Một lựa chọn trong ô chọn vị từ. `label` đã sẵn sàng hiển thị. */
export interface PredicateOption {
  readonly value: string;
  readonly label: string;
}

function plugin(gameId: GameId) {
  return PROBLEM_PLUGINS[gameId];
}

/**
 * Danh sách vị từ của MỘT game, kèm nhãn đọc được.
 *
 * Game K8s có nhãn tiếng Việt cho từng vị từ; các game khác chưa có bảng nhãn,
 * nên hiện TÊN VỊ TỪ trần. Đó là câu trả lời trung thực: tên vị từ là định danh
 * của engine (`rollbackUnder`, `refPointsAtMessage`) và người soạn tra nó trong
 * tài liệu bằng đúng cái tên ấy — một bản dịch tạm sẽ làm họ tìm không ra.
 */
export function predicateOptions(gameId: GameId): readonly PredicateOption[] {
  const names = plugin(gameId)?.predicateNames ?? [];
  return names.map((value) => ({
    value,
    label:
      gameId === 'k8s' && isPredicateName(value)
        ? `${t(PREDICATE_SPECS[value].label)}: ${value}`
        : value,
  }));
}

/** Đặc tả K8s (giàu hơn) khi và chỉ khi game là K8s và tên vị từ có thật. */
export function k8sSpec(gameId: GameId, check: string): PredicateSpec | null {
  return gameId === 'k8s' && check !== '' && isPredicateName(check)
    ? PREDICATE_SPECS[check]
    : null;
}

/** Tham số của một vị từ, ở hình dạng CHUNG. Dùng cho mọi game khác K8s. */
export function genericArgs(gameId: GameId, check: string): readonly ProblemArgSpec[] {
  if (check === '') return [];
  return plugin(gameId)?.predicateArgs[check] ?? [];
}

/**
 * Tên vị từ này có thuộc game đang soạn không.
 *
 * ⛔ Hỏi theo GAME, không hỏi `isPredicateName` (chỉ K8s). Một vị từ ngoài bảng
 * của game làm bài KHÔNG BAO GIỜ qua được, và lỗi đó chỉ lộ ra khi đã có người
 * ngồi làm — nên nó phải chặn ở khâu soạn.
 */
export function isPredicateOfGame(gameId: GameId, check: string): boolean {
  return check !== '' && (plugin(gameId)?.predicateNames ?? []).includes(check);
}

/**
 * Chuỗi trên ô nhập → giá trị đúng kiểu cho `Testcase.args`, theo bảng CHUNG.
 *
 * Trả `undefined` cho ô để trống (hợp đồng khai `args` tuỳ chọn, và một khoá
 * mang `undefined` lên dây là một khoá thừa), và `null` khi giá trị sai kiểu —
 * người gọi dựng câu lỗi, vì chỉ nó biết `path` của ô.
 */
export function coerceGenericArg(
  spec: ProblemArgSpec,
  raw: string,
): { readonly kind: 'bo-trong' } | { readonly kind: 'sai-kieu' } | { readonly kind: 'ok'; readonly value: unknown } {
  const value = raw.trim();
  if (value === '') return { kind: 'bo-trong' };

  if (spec.kind === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? { kind: 'ok', value: parsed } : { kind: 'sai-kieu' };
  }
  if (spec.kind === 'boolean') {
    if (value === 'true') return { kind: 'ok', value: true };
    if (value === 'false') return { kind: 'ok', value: false };
    return { kind: 'sai-kieu' };
  }
  if (spec.kind === 'lines') {
    /*
     * `argLines` của engine nhận CẢ chuỗi lẫn mảng chuỗi, nhưng gửi mảng là dạng
     * mọi level đã viết dùng — và nó không phụ thuộc vào kiểu xuống dòng của máy
     * người soạn. `\r` bị cắt vì một ô textarea trên Windows gửi CRLF, và một
     * dòng mang `\r` ở cuối sẽ KHÔNG khớp chuỗi mà engine so.
     */
    return { kind: 'ok', value: value.split('\n').map((line) => line.replace(/\r$/u, '')) };
  }
  return { kind: 'ok', value };
}

/** Tham số BẮT BUỘC mà một mục tiêu chưa điền, theo bảng chung. */
export function missingGenericArgs(
  specs: readonly ProblemArgSpec[],
  args: Readonly<Record<string, string>>,
): readonly string[] {
  return specs
    .filter((spec) => !spec.optional && (args[spec.name] ?? '').trim() === '')
    .map((spec) => spec.name);
}

/** Đặc tả K8s ⇒ hình dạng chung, để chỗ dùng không phải rẽ hai nhánh khi chỉ cần tên/bắt buộc. */
export function k8sArgAsGeneric(spec: PredicateArgSpec): ProblemArgSpec {
  return {
    name: spec.key,
    kind: spec.type === 'number' ? 'number' : 'string',
    optional: !spec.required,
  };
}
