'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@devops-platform/ui';
import { count, t, type TextKey } from '@devops-platform/copy';
import type { ProblemState } from '@devops-platform/games';
import { renderCopy, type CopyRef } from '../../../components/catalog/catalog-labels';
import type { FieldIssue } from './cluster-form';
import { STATE_BADGE, STATE_KEYS } from './problem-labels';

/**
 * Cổng kiểm trước khi xuất bản.
 *
 * ## Vì sao liệt kê từng lỗi thay vì một câu "chưa hợp lệ"
 *
 * Brief nói thẳng: "Nói rõ lỗi ở đâu, đừng chỉ báo không hợp lệ". Một bài có 40
 * ô nhập; câu "không hợp lệ" đẩy việc dò tìm sang người soạn, và họ không có
 * cùng bảng luật với cái vừa từ chối họ. Danh sách dưới đây nói ĐÚNG ô nào:
 * `Mục tiêu 3 › tham số namespace`.
 *
 * ## ⚠ HAI phép kiểm ở đây KHÔNG có bản sao ở máy chủ
 *
 * Phần lớn danh sách này chỉ nói lại sớm hơn điều `problems.publish` cũng gác.
 * Hai thứ thì không, và lane D xác nhận là không gác được:
 *
 * - tham số BẮT BUỘC của từng vị từ,
 * - ràng buộc "một trong hai" của `pod-running` / `secret-mounted` /
 *   `volume-mounted`.
 *
 * Lý do là ranh giới kiến trúc, không phải sót: `objectiveSchema` phía máy chủ
 * chỉ kiểm `check` là chuỗi không rỗng, vì bảng `PREDICATES` cùng hợp đồng tham
 * số của nó sống trong engine, và biên ghi không với tới đó.
 *
 * Hệ quả phải nói ra: ai gọi thẳng `problems.publish` qua tRPC sẽ đi vòng qua
 * hai phép kiểm này, và bài xuất bản được với một mục tiêu không bao giờ tích
 * xanh. Đây là khoảng trống ĐÃ BIẾT, đã báo lead, không phải một lớp bảo vệ mà
 * ai đó tưởng là có.
 *
 * ## Nút xoá và nút lưu trữ không đứng cạnh nhau
 *
 * `delete` chỉ chạy được với bài chưa ai làm; có lượt nộp rồi thì máy chủ trả
 * `CONFLICT` và bảo dùng `archive`. Đặt hai nút cạnh nhau là mời bấm nhầm cái
 * xoá, nên nút xoá nằm riêng ở cuối, dạng `destructive`, và nói trước điều kiện.
 */
export function PublishCheck(props: {
  readonly state: ProblemState;
  readonly issues: readonly FieldIssue[];
  readonly busy: boolean;
  readonly onPublish: () => void;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  const blocked = props.issues.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="text-lg font-semibold text-foreground">{t('author.problem.publish.heading')}</h2>
        <Badge variant={STATE_BADGE[props.state]}>{t(STATE_KEYS[props.state])}</Badge>
      </div>

      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle>{count('author.problem.publish.blocked-title', props.issues.length)}</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {props.issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <span className="font-medium">{renderCopy(describePath(issue.path))}</span>
                  {t('author.issues.row', { message: issue.message })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="success">
          <AlertTitle>{t('author.problem.publish.ok-title')}</AlertTitle>
          <AlertDescription>{t('author.problem.publish.ok-body')}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={blocked || props.busy || props.state === 'published'} onClick={props.onPublish}>
          {props.state === 'published'
            ? t('author.problem.publish.already')
            : t('author.problem.publish.submit')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={props.busy || props.state === 'archived'}
          onClick={props.onArchive}
        >
          {t('author.problem.publish.archive')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-4">
        <h3 className="text-sm font-medium text-foreground">{t('author.problem.publish.danger-heading')}</h3>
        <p className="text-xs text-muted-foreground">{t('author.problem.publish.danger-body')}</p>
        <div>
          <Button type="button" variant="destructive" size="sm" disabled={props.busy} onClick={props.onDelete}>
            {t('author.problem.publish.delete')}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * `objectives.2.args.namespace` → `Mục tiêu 3 › tham số namespace`.
 *
 * Đường dẫn máy đọc là thứ khớp với `FieldIssue.path` và với `fieldErrors` của
 * Zod; câu tiếng Việt là thứ người soạn đọc. Giữ cả hai chứ không đổi hẳn sang
 * tiếng Việt: `path` còn phải khớp với `issueFor` ở từng ô.
 *
 * ## Trả `CopyRef`, không trả câu đã ghép (§1.6 của `contracts/p16-copy.md`)
 *
 * Bốn nhánh dưới đây là bốn mục TĨNH trong bản đồ, nên cổng gạch ngang dài và
 * cổng mất dấu soi được cả bốn. Bản cũ ghép câu tại chỗ bằng template literal,
 * và lúc đó chỉ nhánh nào có test đi vào mới được soi.
 *
 * ## Nhánh dự phòng KHÔNG phải hàm đồng nhất
 *
 * `FIELD_LABELS[path] ?? path` của bản cũ trả thẳng đường dẫn máy đọc, và dịch
 * sang bản đồ thì nó thành mục `(p) => p.value` mà cổng T0 bắt đúng (probe rỗng
 * dựng ra chuỗi rỗng nên mục đó trông như không có khối lượng). Nhánh mới nói
 * thêm một chữ để câu có nghĩa, và người đọc biết đó là một ô chưa có tên tiếng
 * Việt chứ không tưởng đó là tên ô.
 */
function describePath(path: string): CopyRef {
  const parts = path.split('.');
  const head = parts[0] ?? '';
  const index = Number(parts[1]);
  const groupKey = GROUP_KEYS[head];

  if (groupKey === undefined || !Number.isInteger(index)) {
    const own = FIELD_KEYS[path];
    return own === undefined ? { key: 'author.problem.path-unknown', params: { path } } : { key: own };
  }

  const group = t(groupKey);
  const n = index + 1;
  const rest = parts.slice(2);

  if (rest.length === 0) {
    return { key: 'author.problem.path-group', params: { group, n } };
  }
  if (rest[0] === 'args') {
    return { key: 'author.problem.path-arg', params: { group, n, arg: rest.slice(1).join('.') } };
  }

  const tail = rest.join('.');
  const tailKey = FIELD_KEYS[tail];
  return {
    key: 'author.problem.path-field',
    params: { group, n, field: tailKey === undefined ? tail : t(tailKey) },
  };
}

/** Bốn nhóm có chỉ số trong `FieldIssue.path`. */
const GROUP_KEYS: Readonly<Record<string, TextKey>> = {
  objectives: 'author.problem.group.objectives',
  hints: 'author.problem.group.hints',
  nodes: 'author.problem.group.nodes',
  resources: 'author.problem.group.resources',
};

/**
 * Tên ô nhập, khoá chứ không phải chữ.
 *
 * Khoá bảng là ĐƯỜNG DẪN máy đọc (`timeLimitSec`, camelCase, do Zod sinh ra),
 * còn khoá bản đồ là dạng gạch nối. Hai hệ tên khác nhau và không suy được cái
 * này từ cái kia bằng một phép đổi chữ: `allowedResources` và `parMoves` chỉ
 * tình cờ đổi được, còn `timeLimitSec` thì `time-limit-sec` mới đúng máy móc mà
 * khoá bản đồ là `time-limit`. Ánh xạ tường minh, không ghép chuỗi.
 */
const FIELD_KEYS: Readonly<Record<string, TextKey>> = {
  title: 'author.problem.field.title',
  slug: 'author.problem.field.slug',
  statement: 'author.problem.field.statement',
  topics: 'author.problem.field.topics',
  tags: 'author.problem.field.tags',
  timeLimitSec: 'author.problem.field.time-limit',
  parMoves: 'author.problem.field.par-moves',
  allowedResources: 'author.problem.field.allowed-resources',
  namespaces: 'author.problem.field.namespaces',
  nodes: 'author.problem.field.nodes',
  objectives: 'author.problem.field.objectives',
  hints: 'author.problem.field.hints',
  name: 'author.problem.field.name',
  namespace: 'author.problem.field.namespace',
  cpu: 'author.problem.field.cpu',
  memory: 'author.problem.field.memory',
  spec: 'author.problem.field.spec',
  id: 'author.problem.field.id',
  label: 'author.problem.field.label',
  check: 'author.problem.field.check',
  text: 'author.problem.field.text',
  penaltyPoints: 'author.problem.field.penalty-points',
};
