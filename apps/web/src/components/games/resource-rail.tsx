'use client';

import { type ReactElement } from 'react';
import type { ObjectView } from '@devops-platform/games';
import { RESOURCE_GROUP_LABEL, RESOURCE_GROUP_ORDER, groupObjects } from './resource-groups';
import { ResourceList } from './resource-list';

export interface ResourceRailProps {
  readonly objects: readonly ObjectView[];
  readonly selectedUid: string | null;
  readonly onSelect: (uid: string) => void;
}

/**
 * Rail tài nguyên bên trái (§12.5) — vẫn là **giao diện chính thức**, chỉ đổi
 * chỗ đứng.
 *
 * §12 đổi bố cục từ chia đôi sang toàn màn hình, nhưng không đổi một chữ nào của
 * §12.4: rail là DOM thật, nổi TRÊN canvas chứ không vẽ vào canvas, nên toàn bộ
 * đường bàn phím của bản trước còn nguyên giá trị.
 *
 * Nhóm rỗng bị bỏ hẳn thay vì hiện tiêu đề trống: một cụm mới có đúng một Pod,
 * và ba tiêu đề trống bên dưới nó đọc ra như "ba thứ đang tải".
 */
export function ResourceRail({ objects, selectedUid, onSelect }: ResourceRailProps): ReactElement {
  const grouped = groupObjects(objects);
  const nonEmpty = RESOURCE_GROUP_ORDER.filter((group) => (grouped.get(group) ?? []).length > 0);

  if (nonEmpty.length === 0) {
    return (
      <p className="px-3 py-6 text-xs text-muted-foreground">
        Cluster đang rỗng. Dùng thanh lệnh ở dưới để tạo tài nguyên đầu tiên.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      {nonEmpty.map((group) => (
        <section key={group} aria-labelledby={`rail-${group}`}>
          <h3
            id={`rail-${group}`}
            className="px-3 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground"
          >
            {RESOURCE_GROUP_LABEL[group]}
          </h3>
          <ResourceList
            objects={grouped.get(group) ?? []}
            selectedUid={selectedUid}
            onSelect={onSelect}
            label={`Tài nguyên nhóm ${RESOURCE_GROUP_LABEL[group]}`}
          />
        </section>
      ))}
    </div>
  );
}
