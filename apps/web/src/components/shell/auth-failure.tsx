import type { ReactNode } from 'react';
import { Icon, Input, Label, type InputProps } from '@devops-platform/ds';
import { err } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';

/** Lớp chung của liên kết chữ trên bốn màn xác thực: màu nhấn, gạch chân khi rê, vòng focus. */
export const AUTH_LINK =
  'font-medium text-acc-ink underline-offset-4 outline-none hover:underline focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-focus';

/**
 * Better Auth trả 429 khi vượt 3 lượt mỗi phút theo IP. Lỗi đó KHÁC sai thông tin:
 * bảo người dùng gõ lại là kéo dài lệnh chặn.
 */
export function authFailureFor(
  status: number | undefined,
  fallback: 'auth.error.sign-in' | 'auth.error.sign-up',
): ErrorEntry {
  return status === 429 ? err('auth.error.rate-limit') : err(fallback);
}

/**
 * Lỗi của bốn màn xác thực, đặt NGAY DƯỚI ô nó nói tới: biểu tượng, chữ đỏ, và ô nhập
 * trỏ về nó qua `aria-describedby`.
 *
 * Hai nửa của `ErrorEntry` ở hai dòng riêng: `what` là chuyện gì hỏng, `next` là làm gì
 * tiếp. Ghép thành một đoạn thì người đọc lướt qua đúng vế có tác dụng.
 *
 * `role="alert"`: trình đọc màn hình đọc lỗi ngay khi nó xuất hiện, không phải chờ
 * người dùng Tab tới.
 */
export function AuthFailure({ entry, id }: { readonly entry: ErrorEntry; readonly id?: string | undefined }) {
  return (
    <div id={id} role="alert" className="flex animate-enter items-start gap-2.5 border border-t-2 border-rule border-t-bad-mid bg-paper px-3 py-2.5 text-sm">
      <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-bad-ink" />
      <p className="flex flex-col gap-0.5">
        <span className="font-medium text-bad-ink">{entry.what}</span>
        <span className="text-ink-2">{entry.next}</span>
      </p>
    </div>
  );
}

/**
 * Một ô của form xác thực: nhãn ở trên, ô cao 44px, dòng gợi ý và lỗi ở dưới. Mọi id
 * phụ ghép vào `aria-describedby` của ô, nên trình đọc màn hình đọc gợi ý và lỗi cùng
 * với nhãn.
 *
 * `describedBy` cho lỗi CỦA CẢ FORM (sai email hoặc mật khẩu): lỗi đó nằm dưới ô cuối,
 * và mọi ô liên quan đều trỏ về nó.
 */
export function AuthField({
  id,
  label,
  hint,
  failure,
  describedBy,
  invalid,
  ...input
}: Omit<InputProps, 'id'> & {
  readonly id: string;
  readonly label: string;
  readonly hint?: ReactNode;
  readonly failure?: ErrorEntry | null;
  readonly describedBy?: string | undefined;
}) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const failureId = failure ? `${id}-error` : undefined;
  const described = [hintId, failureId, describedBy].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputSize="lg"
        {...(described === '' ? {} : { 'aria-describedby': described })}
        {...input}
        invalid={invalid ?? Boolean(failure)}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      )}
      {failure ? <AuthFailure entry={failure} id={failureId} /> : null}
    </div>
  );
}
