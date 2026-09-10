import { Alert, AlertDescription, AlertTitle } from '@devops-platform/ui';
import type { ErrorEntry } from '@devops-platform/copy/types';

/**
 * Hiển thị một `ErrorEntry` với hai nửa TÁCH RỜI trên màn hình.
 *
 * `AlertTitle` mang `what`, `AlertDescription` mang `next`. Nối chúng thành một
 * đoạn (thứ `errText()` làm cho toast, nơi không có hai tầng chữ để dùng) sẽ để
 * người đọc lướt qua vế "giờ làm gì" ở cuối câu, mà đó đúng là vế duy nhất có
 * tác dụng. Luật 4 của design §5 được ép bằng hình dạng kiểu ở `packages/copy`;
 * component này là chỗ hình dạng đó thành hình dạng trên màn hình.
 *
 * Dùng chung bởi cả bốn màn xác thực, nên nó nằm ở `components/shell/**` cùng
 * lý lẽ với `AuthFrame`.
 *
 * `variant="destructive"` mang sẵn `role="alert"` (C2): trình đọc màn hình đọc
 * lỗi ngay khi nó xuất hiện, không phải chờ người dùng tự Tab tới.
 */
export function AuthFailure({ entry }: { readonly entry: ErrorEntry }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{entry.what}</AlertTitle>
      <AlertDescription>{entry.next}</AlertDescription>
    </Alert>
  );
}
