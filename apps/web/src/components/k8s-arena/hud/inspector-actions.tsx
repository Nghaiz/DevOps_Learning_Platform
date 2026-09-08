'use client';

import { useEffect, useId, useState, type ReactElement } from 'react';
import { RotateCcw, RefreshCw, ScrollText, Trash2 } from 'lucide-react';
import type { ObjectView } from '@devops-platform/games';
import { Button, Input, Label } from '@devops-platform/ui';
import type { ArenaDispatch } from '../arena-contract.ts';
import { availableActions, buildAction, type ArenaActionId } from './inspector-action-list.ts';

/**
 * Icon của từng hành động. `scale` là `null` vì nó có hàng riêng kèm ô nhập.
 *
 * Kiểu `Record` đủ (không `Partial`): thêm một hành động vào `ARENA_ACTIONS` mà
 * quên icon thì typecheck đỏ, thay vì một nút lặng lẽ trống chỗ icon.
 */
const ACTION_ICON: Readonly<Record<ArenaActionId, ReactElement | null>> = {
  scale: null,
  logs: <ScrollText aria-hidden="true" className="size-4" />,
  restart: <RefreshCw aria-hidden="true" className="size-4" />,
  rollback: <RotateCcw aria-hidden="true" className="size-4" />,
  delete: <Trash2 aria-hidden="true" className="size-4" />,
};

export interface InspectorActionsProps {
  readonly object: ObjectView;
  /** Tick hiện tại — mọi `GameAction` phải mang tick lúc phát để phát lại khớp. */
  readonly tick: number;
  readonly dispatch: ArenaDispatch;
}

/**
 * Hàng hành động nhanh dưới bảng thông số.
 *
 * ⛔ Không hành động nào ở đây tự sửa trạng thái. Tất cả đi qua `dispatch` —
 * cùng một cửa với thanh lệnh. Lý do không phải là sự sạch sẽ kiến trúc:
 * `RunLog` phải ghi đủ mọi hành động thì `verify.ts` mới phát lại và chấm lại
 * được, nên một nút đi tắt là một lỗ hổng gian lận (hợp đồng, `ArenaDispatch`).
 */
export function InspectorActions({ object, tick, dispatch }: InspectorActionsProps): ReactElement {
  const scaleId = useId();
  const [replicas, setReplicas] = useState('1');

  // Đổi object đang chọn ⇒ đưa ô replica về mặc định. Không có bước này thì con
  // số gõ cho Deployment TRƯỚC nằm lại trong ô, và một cú bấm sẽ co giãn tài
  // nguyên khác về đúng con số đó — im lặng, và trông y như người dùng tự làm.
  useEffect(() => {
    setReplicas('1');
  }, [object.uid]);

  const actions = availableActions(object);
  const parsed = Number.parseInt(replicas, 10);
  const replicasValid = Number.isInteger(parsed) && parsed >= 0;

  const run = (id: ArenaActionId): void => {
    const action = buildAction(id, object, tick, parsed);
    if (action !== null) {
      dispatch(action);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
      {actions.some((action) => action.id === 'scale') ? (
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
              onChange={(event) => {
                setReplicas(event.target.value);
              }}
              className="w-20 font-mono text-sm"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!replicasValid}
            onClick={() => {
              run('scale');
            }}
          >
            Co giãn
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {actions
          .filter((action) => action.id !== 'scale')
          .map((action) => (
            <Button
              key={action.id}
              type="button"
              variant={action.danger ? 'destructive' : 'ghost'}
              size="sm"
              title={action.hint}
              /*
                Nhánh danh sách: để `iconLeft` là `undefined` cho nút phá huỷ,
                vì `Button` tự đặt icon cảnh báo mặc định cho biến thể
                `destructive` — truyền icon riêng vào đây là VÔ HIỆU HOÁ nó.
                Biến thể destructive là viền + nền nhạt chứ không phải nền đặc,
                nên tam giác cảnh báo là nửa còn lại của tín hiệu hình dạng tách
                nó khỏi primary; icon hành động đi vào children để có cả hai.
              */
              iconLeft={action.danger ? undefined : ACTION_ICON[action.id]}
              onClick={() => {
                run(action.id);
              }}
            >
              {action.danger ? ACTION_ICON[action.id] : null}
              {action.label}
            </Button>
          ))}
      </div>
    </div>
  );
}
