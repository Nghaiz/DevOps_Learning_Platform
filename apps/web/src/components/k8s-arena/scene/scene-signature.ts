/**
 * Chữ ký của MỌI THỨ NHÌN THẤY ĐƯỢC trong một khung hình — và không gì khác.
 *
 * ⛔ Đây là thứ giữ cho luật "cảnh tĩnh thì không vẽ khung hình mới" còn đúng.
 * Engine bắn `notify()` MỖI TICK vì `tick` tăng nên object trạng thái luôn mới;
 * nếu scene coi mỗi lần bắn là một lần phải vẽ lại thì nó vẽ 60 lần một giây
 * suốt ván chơi kể cả khi trên màn hình không có gì đổi.
 *
 * `tick` cố ý KHÔNG nằm trong chữ ký: nó đổi mỗi lần, và nó chính là thứ đang
 * gây ra vấn đề.
 *
 * ⚠ `cpuUsed`/`memoryUsed` được LÀM TRÒN xuống 1/32. Chúng trôi một chút mỗi
 * tick, và so bằng số thực đầy đủ sẽ làm chữ ký đổi liên tục — tức khôi phục
 * đúng lỗi trên dưới một cái tên khác. 1/32 vẫn đủ mịn cho độ sáng của bệ node.
 *
 * ⛔ KHÔNG `import 'three'` ở đây: file này phải nằm ngoài chunk lazy để một
 * import lạc không kéo `three` vào bundle của mọi trang.
 */

import type { ClusterView } from '@devops-platform/games';
import type { SceneLayout } from '../shared/scene-layout';

/** Độ mịn của tải node khi đưa vào chữ ký. 32 nấc trên dải 0..1. */
const LOAD_STEPS = 32;

export function visualSignature(layout: SceneLayout, view: ClusterView): string {
  const parts: string[] = [];

  for (const node of layout.nodes) {
    const load = Math.round(Math.max(node.cpuUsed, node.memoryUsed) * LOAD_STEPS);
    parts.push(`n:${node.name}:${node.ready ? '1' : '0'}:${String(load)}`);
  }

  const byUid = new Map(view.objects.map((o) => [o.uid, o]));
  for (const placement of layout.objects) {
    const object = byUid.get(placement.uid);
    parts.push(
      `o:${placement.uid}:${placement.zone}:${placement.position.x.toFixed(2)}:` +
        `${placement.position.y.toFixed(2)}:${placement.position.z.toFixed(2)}:` +
        `${placement.size.toFixed(2)}:${object?.statusToken ?? ''}:${object?.phase ?? ''}:` +
        `${object?.reason ?? ''}:${object?.ready === undefined ? '' : object.ready ? '1' : '0'}`,
    );
  }

  for (const edge of layout.edges) {
    parts.push(`e:${edge.fromUid}>${edge.toUid}:${edge.kind}:${edge.healthy ? '1' : '0'}`);
  }

  return parts.join('|');
}
