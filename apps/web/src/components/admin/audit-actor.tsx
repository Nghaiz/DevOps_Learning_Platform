import type { ReactElement } from 'react';
import type { ActorView } from './audit-row';

/**
 * Ô "người thực hiện" của nhật ký quản trị (trang Nhật ký và khối nhật ký gần
 * đây ở Tổng quan).
 *
 * Câu "chỉ có id" là chung cho mọi dòng nên nằm ở chú thích bảng. Dòng THIẾU id
 * thì có câu riêng, và câu đó hiện ngay dưới chữ "không rõ": đặt nó trong
 * `title` như bản trước thì chỉ người rê chuột mới đọc được.
 */
export function AuditActor({ actor }: { readonly actor: ActorView }): ReactElement {
  if (!actor.missing) {
    return <>{actor.text}</>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span>{actor.text}</span>
      <span className="font-sans text-xs text-ink-2">{actor.note}</span>
    </span>
  );
}
