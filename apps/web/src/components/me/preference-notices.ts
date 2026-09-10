import { t } from '@devops-platform/copy';
import type { ThemeName } from '@devops-platform/terminal/themes';

/**
 * Câu chữ cho `/settings` — HÀM THUẦN, và mỗi câu chỉ được nói thứ server thật
 * sự bảo đảm.
 *
 * Ba tuỳ chọn ở trang hồ sơ đều có cùng một hình dạng nguy hiểm: người dùng bấm
 * lưu, thấy "Đã lưu", và tin rằng thứ họ vừa chọn **đang có hiệu lực ngay bây
 * giờ**. Với cả ba, điều đó SAI theo một kiểu riêng — và không kiểu nào lộ ra
 * nếu giao diện chỉ nói "Đã lưu".
 */

export type ShellName = 'bash' | 'zsh' | 'pwsh';

/**
 * Nhãn shell, tra qua bản đồ chứ không giữ câu tại chỗ.
 *
 * Hai trong ba giá trị (`bash`, `zsh`) không có dấu tiếng Việt nên cổng T4
 * KHÔNG bắt được chúng nếu chúng ở lại đây. Đưa cả ba vào bản đồ là quyết định
 * đọc theo §1.7 ("vào bản đồ: chữ hiển thị"), không phải theo thứ cổng bắt được
 * — một cổng một chiều không phải là định nghĩa của luật.
 */
const SHELL_LABEL_KEY = {
  bash: 'me.shell.bash',
  zsh: 'me.shell.zsh',
  pwsh: 'me.shell.pwsh',
} as const satisfies Readonly<Record<ShellName, string>>;

export function shellLabel(shell: ShellName): string {
  return t(SHELL_LABEL_KEY[shell]);
}

export const SHELL_OPTIONS: readonly ShellName[] = ['bash', 'zsh', 'pwsh'];

/**
 * Shell mặc định của máy sandbox khi tuỳ chọn KHÔNG được áp.
 *
 * ⚠ Đây là `zsh`, không phải `bash`: `images/sandbox-base/skel/.tmux.conf` đặt
 * `set -g default-shell /usr/bin/zsh`, và chú thích ở
 * `server/sessions/preferences.ts` ghi lại chính phép đo đó. Viết "bash" ở đây
 * sẽ làm câu cảnh báo dưới nói sai đúng vào lúc nó cần đúng nhất.
 */
export const POD_FALLBACK_SHELL: ShellName = 'zsh';

export interface PreferenceNotice {
  readonly tone: 'default' | 'warning';
  readonly lines: readonly string[];
}

/**
 * ## D7 — chế độ hỏng THẬT của tuỳ chọn shell, nói thẳng ra
 *
 * `applySessionPreferences` (`server/sessions/preferences.ts`) ghi shell đã chọn
 * vào `~/.tmux.conf` của pod **tại thời điểm mở phiên**, rồi trả
 * `preferencesApplied` kèm response của `lessons.startSession` /
 * `labs.startAttempt` / `playgrounds.start`. Nó trả `false` ở ba ca có thật:
 *
 * · pod chưa được cấp lúc `startSession` trả lời (đường "cold" — pool cạn);
 * · session thiếu `expiresAt`;
 * · script chạy trong pod thất bại (`outcome.passed === false`).
 *
 * Ở cả ba ca, hàm **không ném** — một tuỳ chọn hồ sơ không được phép làm hỏng
 * luồng mở bài học. Nghĩa là mặc định của hệ thống là **im lặng**: người dùng
 * chọn `pwsh`, mở bài, và nhận `zsh` mà không có gì nói cho họ biết vì sao.
 * Trang này không sửa được điều đó ở tầng dưới, nhưng nó phải NÓI RA, thay vì
 * để "Đã lưu" ngụ ý một điều mạnh hơn thứ đã xảy ra.
 *
 * Vế thứ hai là chuyện của phiên ĐANG CHẠY: script chỉ chạy lúc mở phiên, nên
 * đổi shell bây giờ không đụng tới máy đang mở. Con số phiên đến từ
 * `me.activeSessions` — `null` nghĩa là CHƯA ĐỌC ĐƯỢC, và lúc đó câu chữ không
 * được khẳng định "bạn không có phiên nào" (một lượt mạng hỏng không phải là
 * bằng chứng về số phiên).
 */
export function describeShellPreference(input: {
  readonly shell: ShellName;
  /** Số phiên ĐẾM ĐƯỢC trên trang đầu của `me.activeSessions`; `null` = chưa đọc được. */
  readonly activeSessionCount: number | null;
  /**
   * `nextCursor !== null` — còn trang nữa, nên con số trên là SÀN chứ không phải
   * tổng. Nói "2 phiên" khi thật ra có 7 là một câu sai ở đúng ca cảnh báo này
   * quan trọng nhất; nói "ít nhất 2" thì không.
   */
  readonly moreSessions?: boolean;
}): PreferenceNotice {
  const lines = [t('me.notice.shell-next-session', { fallback: shellLabel(POD_FALLBACK_SHELL) })];

  const count = input.activeSessionCount;
  if (count !== null && count > 0) {
    const howMany =
      input.moreSessions === true ? t('me.notice.shell-at-least', { n: count }) : String(count);
    return {
      tone: 'warning',
      lines: [...lines, t('me.notice.shell-active-sessions', { howMany })],
    };
  }

  return { tone: 'default', lines };
}

/**
 * ## Bảng xếp hạng — tuỳ chọn này là GIÁ TRỊ KHỞI TẠO, không phải công tắc chung
 *
 * `labs.startAttempt` đọc `leaderboardNamePublic` một lần để seed
 * `lab_attempts.display_name_public` của lần thử MỚI. Những lần thử đã nộp giữ
 * giá trị của riêng chúng, và `labs.setDisplayPreference` mới là đường đổi từng
 * lần. Nói "hiện tên trên bảng xếp hạng" mà không kèm phạm vi sẽ đọc thành "ẩn
 * hết tên tôi khỏi mọi bảng" — đúng thứ người tắt công tắc này đang muốn, và
 * đúng thứ nó KHÔNG làm.
 */
export function describeLeaderboardPreference(publicName: boolean): PreferenceNotice {
  return {
    tone: 'default',
    lines: [
      publicName ? t('me.notice.leaderboard-public') : t('me.notice.leaderboard-private'),
      t('me.notice.leaderboard-scope'),
    ],
  };
}

/** `null` = đi theo giao diện sáng/tối của trang (`resolveTerminalTheme`). */
export type TerminalThemeChoice = ThemeName | null;

const TERMINAL_THEME_LABEL_KEY = {
  'dlp-dark': 'me.terminal-theme.dlp-dark',
  'dlp-light': 'me.terminal-theme.dlp-light',
  'dlp-contrast': 'me.terminal-theme.dlp-contrast',
} as const satisfies Readonly<Record<ThemeName, string>>;

export function terminalThemeLabel(theme: ThemeName): string {
  return t(TERMINAL_THEME_LABEL_KEY[theme]);
}

/**
 * `null` không phải "chưa chọn" mà là một lựa chọn: đi theo giao diện trang
 * (`resolveTerminalTheme` — tuỳ chọn hồ sơ THẮNG theme trang khi có). Câu chữ
 * phải nói ra hệ quả, vì hai lựa chọn này khác nhau đúng ở chỗ đó.
 *
 * Câu thứ hai giới hạn phạm vi ở thứ đo được: `lesson-client`/`playground-client`
 * đọc `me.get` qua react-query khi trang được mở, nên terminal mở SAU khi lưu
 * nhận giá trị mới. Không hứa gì về một terminal đang mở ở tab khác — đó là
 * hành vi chưa ai đo, và một lời hứa chưa đo cũng là một lời nói quá.
 */
export function describeTerminalThemePreference(choice: TerminalThemeChoice): PreferenceNotice {
  return {
    tone: 'default',
    lines: [
      choice === null
        ? t('me.notice.terminal-follow')
        : t('me.notice.terminal-pinned', { theme: terminalThemeLabel(choice) }),
      t('me.notice.terminal-scope'),
    ],
  };
}

/**
 * ## Phiên VỪA MỞ đã bỏ qua tuỳ chọn shell — nói ra, thay vì im lặng
 *
 * `preferencesApplied` đi kèm response của `lessons.startSession` /
 * `labs.startAttempt` / `playgrounds.start` cho đúng ba ca hỏng kể ở
 * `describeShellPreference`. Tới trước P13 nó KHÔNG tới được giao diện nào —
 * `grep -rn preferencesApplied apps/web/src` chỉ trúng file server — nên chế độ
 * hỏng mà chú thích trên mô tả là chế độ hỏng THẬT của sản phẩm: chọn `pwsh`,
 * mở bài, nhận `zsh`, và không có gì nói cho người học biết.
 *
 * Hàm này KHÔNG viết lại lời giải thích. Nó GỌI `describeShellPreference` để
 * lấy đúng câu chữ trang `/settings` đang dùng, rồi thêm MỘT câu mà trang cài
 * đặt không thể nói: chuyện đó đã xảy ra rồi, ở phiên này. Bốn chỗ nói về cùng
 * một sự thật thì phải nói bằng cùng một nguồn chữ, không thì chúng sẽ lệch
 * nhau ở lần sửa đầu tiên.
 *
 * ⚠ Trả `null` khi shell đã chọn TRÙNG `POD_FALLBACK_SHELL`. Lúc đó phiên vẫn
 * chạy đúng thứ người dùng chọn — chỉ là nhờ mặc định của image chứ không nhờ
 * script — nên không có gì để báo. Câu "phiên này dùng zsh chứ không phải zsh"
 * là câu vô nghĩa đặt đúng vào chỗ người đọc đang cần một câu rõ ràng.
 */
export function describeSessionShellFallback(shell: ShellName): PreferenceNotice | null {
  if (shell === POD_FALLBACK_SHELL) {
    return null;
  }
  const shared = describeShellPreference({ shell, activeSessionCount: null });
  return {
    tone: 'warning',
    lines: [
      t('me.notice.session-fallback', {
        fallback: shellLabel(POD_FALLBACK_SHELL),
        chosen: shellLabel(shell),
      }),
      ...shared.lines,
    ],
  };
}
