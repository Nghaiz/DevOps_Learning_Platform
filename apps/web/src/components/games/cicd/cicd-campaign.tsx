'use client';

import type { ReactElement } from 'react';
import { Badge, Button } from '@devops-platform/ui';
import { CI_LEVELS } from '@devops-platform/games';

/**
 * Danh sách màn — 14 level CI, theo ĐÚNG thứ tự trong `CI_LEVELS`.
 *
 * ⚠ Không sắp lại, không nhóm lại theo độ khó. Thứ tự đó là thứ tự dạy: C06
 * ("cache là bộ đệm") phải đến trước C07/C08 (khoá quá rộng / quá hẹp), và C09
 * ("một lượt xanh không chứng minh gì") phải đến trước C10/C11 (chạy lại). Sắp
 * theo độ khó sẽ trộn ba cặp đó lên nhau và mỗi màn mất mất cái nền của nó.
 */

export interface CicdCampaignProps {
  readonly onPick: (levelId: string) => void;
  readonly onSandbox: () => void;
}

export function CicdCampaign({ onPick, onSandbox }: CicdCampaignProps): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Xưởng đường ống CI/CD</h1>
          <p className="text-sm text-muted-foreground">
            Soạn workflow bằng YAML, chạy mô phỏng, rồi đọc ba trục: thời gian chờ của một commit,
            số commit qua được mỗi giờ, và số runner-phút tiêu tốn. Ba trục đó không suy ra được từ
            nhau — mỗi màn ở đây dạy một cách chúng kéo nhau về ba hướng khác nhau.
          </p>
        </div>
        <Button variant="outline" onClick={onSandbox}>
          Bàn thử tự do
        </Button>
      </header>

      <ol className="grid gap-3 md:grid-cols-2">
        {CI_LEVELS.map((level, index) => (
          <li key={level.id}>
            <button
              type="button"
              onClick={() => {
                onPick(level.id);
              }}
              className="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-left hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-sm font-semibold text-foreground">{level.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{level.mission}</p>
              <div className="flex flex-wrap items-center gap-2">
                {/*
                  `Difficulty` là kiểu của `packages/games`, và cả hình dạng lẫn
                  tập giá trị của nó thuộc làn khác. `String()` giữ ô này đúng dù
                  nó là chuỗi hay số — rẻ hơn hẳn việc dựng một bảng nhãn ở đây
                  rồi để bảng đó lạc hậu trong im lặng khi tập giá trị đổi.
                */}
                <Badge variant="outline" icon={null}>
                  {String(level.difficulty)}
                </Badge>
                {level.editable.map((part) => (
                  <span key={part} className="font-mono text-xs text-muted-foreground">
                    {part}
                  </span>
                ))}
              </div>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
