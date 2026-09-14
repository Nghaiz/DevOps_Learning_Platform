'use client';

import { useId, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devops-platform/ui';
import { AUTHORABLE_GAMES, pluginViewFor } from './game-plugin-view';

/**
 * Ô chọn game, đặt TRÊN bộ tab chứ không nằm trong một tab — §18.D.1.
 *
 * ## Vì sao nó ở trên cùng và luôn nhìn thấy
 *
 * Chọn game không phải một thuộc tính của bài ngang hàng với độ khó hay tag: nó
 * quyết định biểu mẫu trạng thái ban đầu, tập chủ đề được chọn, và bảng vị từ
 * dùng cho testcase. Giấu nó trong tab "Mô tả" thì người soạn điền xong nửa bài
 * mới phát hiện mình đang soạn cho game khác, và phần đã điền theo tập chủ đề
 * cũ thành vô nghĩa.
 *
 * ## Ô này phải đi được bằng bàn phím, và đó là một ràng buộc chứ không lời hứa
 *
 * AC-8 đòi 0 vi phạm axe trên màn soạn bài. `Label` nối bằng `htmlFor` tới
 * `SelectTrigger` (chứ không phải một `<div>` bọc ngoài), nên trình đọc màn hình
 * đọc đúng tên ô, và Tab tới được nó. Câu giải thích nối bằng `aria-describedby`
 * chứ không chỉ đặt cạnh.
 */
export function GameSelectField(props: {
  readonly gameId: GameId;
  readonly onChange: (next: GameId) => void;
  /** `false` ở trang sửa: đổi game của một bài đã lưu là đổi cả hợp đồng dữ liệu. */
  readonly canChange: boolean;
}): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const view = pluginViewFor(props.gameId);

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{t('author.problem.game.label')}</Label>
        <Select
          value={props.gameId}
          disabled={!props.canChange}
          onValueChange={(value) => {
            props.onChange(value as GameId);
          }}
        >
          <SelectTrigger id={id} aria-describedby={hintId} className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTHORABLE_GAMES.map((game) => (
              <SelectItem key={game.gameId} value={game.gameId}>
                {`${game.label} (${game.codePrefix})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={hintId} className="text-xs text-muted-foreground">
          {props.canChange
            ? t('author.problem.game.hint')
            : t('author.problem.game.locked')}
        </p>
      </div>

      {view !== null && !view.persistable && (
        <Alert variant="destructive">
          <AlertTitle>{t('author.problem.game.not-persistable-title')}</AlertTitle>
          <AlertDescription>{t('author.problem.game.not-persistable-body')}</AlertDescription>
        </Alert>
      )}

      {view === null && (
        <Alert>
          <AlertTitle>{t('author.problem.game.no-plugin-title')}</AlertTitle>
          <AlertDescription>{t('author.problem.game.no-plugin-body')}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
