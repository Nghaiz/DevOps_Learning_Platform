import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input, Label, type InputProps } from '@devops-platform/ui';
import { err } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';

/** Lớp chung của liên kết chữ trên bốn màn xác thực: gạch chân, vòng focus, không bo góc. */
export const AUTH_LINK =
  'text-brand underline underline-offset-4 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Better Auth trả 429 khi vượt 3 lượt mỗi phút theo IP. Lỗi đó KHÁC sai thông
 * tin: bảo người dùng gõ lại là kéo dài lệnh chặn.
 */
export function authFailureFor(
  status: number | undefined,
  fallback: 'auth.error.sign-in' | 'auth.error.sign-up',
): ErrorEntry {
  return status === 429 ? err('auth.error.rate-limit') : err(fallback);
}

/**
 * Lỗi của bốn màn xác thực, đặt NGAY DƯỚI ô nó nói tới (design-brief §5): biểu
 * tượng, chữ đỏ, và ô nhập trỏ về nó qua `aria-describedby`.
 *
 * Hai nửa của `ErrorEntry` ở hai dòng riêng: `what` là chuyện gì hỏng, `next` là
 * làm gì tiếp. Ghép thành một đoạn thì người đọc lướt qua đúng vế có tác dụng.
 *
 * `role="alert"`: trình đọc màn hình đọc lỗi ngay khi nó xuất hiện, không phải
 * chờ người dùng Tab tới.
 */
export function AuthFailure({ entry, id }: { readonly entry: ErrorEntry; readonly id?: string }) {
  return (
    <div id={id} role="alert" className="flex animate-rise items-start gap-2.5 text-sm">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="flex flex-col gap-0.5">
        <span className="font-semibold text-destructive">{entry.what}</span>
        <span className="text-muted-foreground">{entry.next}</span>
      </p>
    </div>
  );
}

/**
 * Một ô của form xác thực: nhãn ở trên, ô cao 48px (`h-12`, design-brief §2.6),
 * dòng gợi ý và lỗi ở dưới. Mọi id phụ ghép vào `aria-describedby` của ô, nên
 * trình đọc màn hình đọc gợi ý và lỗi cùng với nhãn.
 *
 * `describedBy` cho lỗi CỦA CẢ FORM (sai email hoặc mật khẩu): lỗi đó nằm dưới ô
 * cuối, và mọi ô liên quan đều trỏ về nó.
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
  readonly describedBy?: string;
}) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const failureId = failure ? `${id}-error` : undefined;
  const described = [hintId, failureId, describedBy].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      <Input
        id={id}
        className="h-12"
        aria-describedby={described === '' ? undefined : described}
        {...input}
        invalid={invalid ?? Boolean(failure)}
      />
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {failure ? <AuthFailure entry={failure} id={failureId} /> : null}
    </div>
  );
}
