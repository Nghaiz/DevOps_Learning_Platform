'use client';

import { useEffect, useId, useState, type ReactElement } from 'react';
import { Save, Trash2, TriangleAlert } from 'lucide-react';
import type { ObjectView, ResourceKind } from '@devops-platform/games';
import { Button, Input, Label, Textarea } from '@devops-platform/ui';
import { objectToYaml, shortLabel } from './object-yaml';

/**
 * Loại đổi được số replica.
 *
 * Danh sách ĐÓNG và cố ý ngắn: `kubectl scale` chỉ chấp nhận đúng những loại có
 * field `spec.replicas`. Hiện ô scale trên một Pod là dạy sai — Pod không có
 * replica, và người học sẽ mang hiểu lầm đó sang cluster thật.
 */
const SCALABLE_KINDS: readonly ResourceKind[] = ['Deployment', 'ReplicaSet', 'StatefulSet'];

export interface InspectorPanelProps {
  readonly object: ObjectView | null;
  readonly onDelete: (object: ObjectView) => void;
  readonly onScale: (object: ObjectView, replicas: number) => void;
  readonly onEdit: (object: ObjectView, yaml: string) => void;
}

/**
 * Inspector — nửa còn lại của giao diện DOM (§4.4).
 *
 * Danh sách nói *có những gì*; ô này nói *cái đang chọn ra sao* và cho phép làm
 * gì với nó. Ba hành động ở đây (`delete`, `scale`, `edit`) là lối tắt bàn phím
 * cho thao tác hay dùng — cùng việc đó gõ được bằng `kubectl` ở thanh lệnh, nên
 * không có hành động nào chỉ tồn tại ở một chỗ.
 *
 * `<pre>` chứ không phải một cây `<div>` tô màu: nội dung YAML phải copy ra được
 * nguyên vẹn và phải đọc được tuần tự bằng trình đọc màn hình. Tô màu cú pháp ở
 * đây sẽ đổi lấy cả hai để lấy một thứ trang trí.
 */
export function InspectorPanel({ object, onDelete, onScale, onEdit }: InspectorPanelProps): ReactElement {
  const scaleId = useId();
  const editId = useId();
  const [replicas, setReplicas] = useState('1');
  const [draft, setDraft] = useState('');

  /*
   * Đổi object đang chọn ⇒ bỏ bản nháp cũ. Không có effect này thì YAML của pod
   * TRƯỚC nằm lại trong ô soạn, và một cú bấm "Lưu" sẽ ghi nội dung của tài
   * nguyên này đè lên tài nguyên khác — im lặng, và trông y như người dùng vừa
   * tự làm việc đó.
   */
  useEffect(() => {
    setDraft(object === null ? '' : objectToYaml(object));
    setReplicas('1');
  }, [object]);

  if (object === null) {
    return (
      <p className="px-3 py-6 text-sm text-muted-foreground">
        Chọn một tài nguyên trong danh sách để xem chi tiết. Dùng Tab rồi Enter, hoặc mũi tên lên/xuống.
      </p>
    );
  }

  const scalable = SCALABLE_KINDS.includes(object.kind);
  const parsedReplicas = Number.parseInt(replicas, 10);
  const replicasValid = Number.isInteger(parsedReplicas) && parsedReplicas >= 0;

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-mono text-sm text-foreground">{shortLabel(object)}</h3>
        <p className="text-xs text-muted-foreground">namespace {object.namespace}</p>
      </div>

      <pre
        aria-label={`Mô tả YAML của ${shortLabel(object)}`}
        tabIndex={0}
        /*
          `tabIndex={0}` trên một khối cuộn được là YÊU CẦU của a11y, không phải
          tuỳ chọn: một vùng cuộn không focus được thì người chỉ dùng bàn phím
          không cuộn tới được phần dưới của nó. Đây cũng đúng khuôn
          `SCROLL_REGION_FOCUS` mà `packages/ui/src/lesson` đã đặt cho khoang bài học.
        */
        className="max-h-56 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {objectToYaml(object)}
      </pre>

      {scalable ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={scaleId} className="text-xs text-muted-foreground">
              Số replica
            </Label>
            <Input
              id={scaleId}
              type="number"
              min={0}
              inputMode="numeric"
              value={replicas}
              invalid={!replicasValid}
              onChange={(event) => setReplicas(event.target.value)}
              className="w-24 font-mono text-sm"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!replicasValid}
            onClick={() => onScale(object, parsedReplicas)}
          >
            Đặt lại replica
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor={editId} className="text-xs text-muted-foreground">
          Sửa manifest
        </Label>
        <Textarea
          id={editId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={5}
          spellCheck={false}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={draft.trim() === ''} onClick={() => onEdit(object, draft)}>
          <Save aria-hidden="true" className="size-4" />
          Lưu thay đổi
        </Button>
        {/*
          Nút destructive BẮT BUỘC có icon — hợp đồng C2 (§2.4) của lane A: biến
          thể destructive nay là viền + nền nhạt thay vì nền đặc, nên icon là nửa
          còn lại của tín hiệu hình dạng. Không có nó thì quyết định "tách primary
          khỏi destructive bằng HÌNH DẠNG" chỉ còn một nửa.
        */}
        <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(object)}>
          <TriangleAlert aria-hidden="true" className="size-4" />
          <Trash2 aria-hidden="true" className="size-4" />
          Xoá {shortLabel(object)}
        </Button>
      </div>
    </div>
  );
}
