'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@devops-platform/ui';
import type { ProblemState } from '@devops-platform/games';
import type { FieldIssue } from './cluster-form';
import { STATE_BADGE, STATE_LABELS } from './problem-labels';

/**
 * Cổng kiểm trước khi xuất bản.
 *
 * ## Vì sao liệt kê từng lỗi thay vì một câu "chưa hợp lệ"
 *
 * Brief nói thẳng: "Nói rõ lỗi ở đâu, đừng chỉ báo không hợp lệ". Một bài có 40
 * ô nhập; câu "không hợp lệ" đẩy việc dò tìm sang người soạn, và họ không có
 * cùng bảng luật với cái vừa từ chối họ. Danh sách dưới đây nói ĐÚNG ô nào —
 * `mục tiêu 3 › tham số namespace`.
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
 * xanh. Đây là khoảng trống ĐÃ BIẾT, đã báo lead — không phải một lớp bảo vệ mà
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
        <h2 className="text-lg font-semibold text-foreground">Xuất bản</h2>
        <Badge variant={STATE_BADGE[props.state]}>{STATE_LABELS[props.state]}</Badge>
      </div>

      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle>
            Còn {String(props.issues.length)} chỗ phải sửa trước khi xuất bản được
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {props.issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <span className="font-medium">{describePath(issue.path)}</span> — {issue.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="success">
          <AlertTitle>Bài đã đủ điều kiện xuất bản</AlertTitle>
          <AlertDescription>
            Máy chủ kiểm lại một lượt nữa khi bạn bấm — đó là lớp cuối, và nó gác cùng bộ điều kiện.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={blocked || props.busy || props.state === 'published'} onClick={props.onPublish}>
          {props.state === 'published' ? 'Đã xuất bản' : 'Xuất bản'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={props.busy || props.state === 'archived'}
          onClick={props.onArchive}
        >
          Đưa vào lưu trữ
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-4">
        <h3 className="text-sm font-medium text-foreground">Xoá hẳn bài</h3>
        <p className="text-xs text-muted-foreground">
          Chỉ xoá được bài CHƯA có ai nộp. Đã có lượt nộp thì máy chủ từ chối và bảo dùng lưu trữ — xoá một bài
          đã có người làm là xoá lịch sử của họ.
        </p>
        <div>
          <Button type="button" variant="destructive" size="sm" disabled={props.busy} onClick={props.onDelete}>
            Xoá bài
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
 */
function describePath(path: string): string {
  const parts = path.split('.');
  const head = parts[0] ?? '';
  const index = Number(parts[1]);
  const ordinal = Number.isInteger(index) ? String(index + 1) : '';

  const group: Readonly<Record<string, string>> = {
    objectives: 'Mục tiêu',
    hints: 'Gợi ý',
    nodes: 'Node',
    resources: 'Tài nguyên',
  };
  const label = group[head];
  if (label === undefined || ordinal === '') {
    return FIELD_LABELS[path] ?? path;
  }

  const rest = parts.slice(2);
  if (rest.length === 0) {
    return `${label} ${ordinal}`;
  }
  if (rest[0] === 'args') {
    return `${label} ${ordinal} › tham số ${rest.slice(1).join('.')}`;
  }
  return `${label} ${ordinal} › ${FIELD_LABELS[rest.join('.')] ?? rest.join('.')}`;
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  title: 'Tên bài',
  slug: 'Slug',
  statement: 'Đề bài',
  topics: 'Chủ đề',
  tags: 'Tag',
  timeLimitSec: 'Hạn giờ',
  parMoves: 'Số nước đi chuẩn',
  allowedResources: 'Loại tài nguyên cho phép',
  namespaces: 'Danh sách namespace',
  nodes: 'Node',
  objectives: 'Mục tiêu',
  hints: 'Gợi ý',
  name: 'tên',
  namespace: 'namespace',
  cpu: 'CPU',
  memory: 'bộ nhớ',
  spec: 'phần thân JSON',
  id: 'định danh',
  label: 'nhãn',
  check: 'vị từ',
  text: 'nội dung',
  penaltyPoints: 'điểm bị trừ',
};
