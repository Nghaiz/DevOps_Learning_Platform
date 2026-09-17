'use client';

import type { ReactElement } from 'react';
import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import { Badge } from '@devops-platform/ui';
import type { AxisDistribution, CicdObjective, CicdThresholds } from '@devops-platform/games';

import {
  describeEngineError,
  describeJobShapeProblem,
  formatNumber,
  formatPercent,
  formatSeconds,
  type CicdRunOutcome,
} from './cicd-run';

/**
 * Bảng kết quả một lượt chấm — 19.E.2 (chẩn đoán) và 19.E.4 (ba trục).
 *
 * ## ⛔ BA TRỤC LUÔN HIỆN, KHÔNG GỘP, KHÔNG GIẤU SAU NÚT
 *
 * Lead time, thông lượng và runner-phút là BA đại lượng độc lập — hợp đồng ở
 * `cicd/contract.ts` §6 dựng sẵn ba nhân chứng chứng minh không trục nào là hàm
 * của hai trục kia. Nên:
 *
 * - Không cộng chúng lại thành một "điểm". Một số duy nhất xoá mất đúng bài học
 *   mà mười bốn màn này tồn tại để dạy: rút ngắn lead time bằng cách quạt ra
 *   ma trận làm runner-phút tăng, và người chơi phải THẤY cả hai chuyển động
 *   ngược chiều nhau trong cùng một lượt.
 * - Không giấu hai trục sau một tab. Thấy lần lượt không phải là thấy đánh đổi.
 *
 * `greenRate` nằm ở hàng riêng bên dưới, có nhãn nói rõ nó là NGƯỠNG ĐẠT chứ
 * không phải trục thứ tư.
 *
 * ## Vì sao chẩn đoán là một danh sách chữ, không chỉ là dòng tô đỏ
 *
 * `YamlEditor` nhận `errorLines` và tô nền dòng lỗi. Đó là lớp thứ HAI. Nền màu
 * một mình không kể được gì cho người không phân biệt màu, cho trình đọc màn
 * hình, hay cho người đang phóng to và không thấy cả ô soạn. Danh sách dưới đây
 * mang `role="alert"` và nói ra dòng, cột, và việc phải sửa.
 */

export interface CicdResultPanelProps {
  readonly outcome: CicdRunOutcome;
  readonly objectives: readonly CicdObjective[];
  readonly thresholds: CicdThresholds;
  /** Sandbox không có ngưỡng đạt/trượt — chỉ đo. */
  readonly showVerdict: boolean;
}

export function CicdResultPanel({
  outcome,
  objectives,
  thresholds,
  showVerdict,
}: CicdResultPanelProps): ReactElement {
  if (outcome.kind === 'parse-error') {
    return (
      <section className="flex flex-col gap-3" aria-label="Kết quả lượt chạy">
        <div className="flex items-center gap-3">
          <Badge variant="status-todo" icon={null}>
            <CircleX aria-hidden className="size-3" />
            Không quét được YAML
          </Badge>
          <p className="text-sm text-muted-foreground">
            {outcome.errors.length} chỗ cần sửa. Workflow chưa chạy lượt nào.
          </p>
        </div>
        <ul role="alert" className="flex flex-col gap-2">
          {outcome.errors.map((diagnostic, index) => (
            <li
              key={`${diagnostic.line}-${diagnostic.column}-${index}`}
              className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
            >
              <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span className="text-sm text-foreground">
                {/*
                  Dòng và cột đi TRƯỚC câu lỗi, và đi trong cùng một câu chữ chứ
                  không phải một badge riêng: người đọc bằng trình đọc màn hình
                  nghe tuần tự, và "Dòng 7" nghe sau một câu dài là vô dụng.
                */}
                <strong className="font-semibold">
                  Dòng {diagnostic.line}, cột {diagnostic.column}:
                </strong>{' '}
                {diagnostic.message}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (outcome.kind === 'empty') {
    /*
     * Cùng lý do như nhánh `engine-error` ngay dưới: một đường ống không có job
     * nào chạy ra `0 giây / 0 runner-phút`, và ba con số đó đọc ra thành "cực
     * nhanh, chẳng tốn gì". Nói thẳng là chưa có gì để đo.
     */
    return (
      <section className="flex flex-col gap-3" aria-label="Kết quả lượt chạy">
        <p
          role="status"
          data-testid="cicd-empty"
          className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground"
        >
          Đường ống chưa có job nào, nên chưa có gì để đo. Thêm một job vào mục{' '}
          <code className="font-mono">jobs</code> rồi chạy lại.
        </p>
      </section>
    );
  }

  if (outcome.kind === 'shape-error') {
    return (
      <section className="flex flex-col gap-3" aria-label="Kết quả lượt chạy">
        <div className="flex items-center gap-3">
          <Badge variant="status-todo" icon={null}>
            <CircleX aria-hidden className="size-3" />
            Job không khớp màn
          </Badge>
          <p className="text-sm text-muted-foreground">Workflow chưa được chấm.</p>
        </div>
        <ul role="alert" data-testid="cicd-shape-error" className="flex flex-col gap-2">
          {outcome.problems.map((problem, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
            >
              <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span className="text-sm text-foreground">{describeJobShapeProblem(problem)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (outcome.kind === 'engine-error') {
    return (
      <section className="flex flex-col gap-3" aria-label="Kết quả lượt chạy">
        <div className="flex items-center gap-3">
          <Badge variant="status-todo" icon={null}>
            <CircleX aria-hidden className="size-3" />
            Workflow không chạy được
          </Badge>
        </div>
        {/*
          ⛔ KHÔNG vẽ ba số 0 ở đây. Đồ thị hỏng thì không có lượt nào chạy, nên
          không có gì để chiếu ra ba trục — và "0 giây, 0 runner-phút" đọc ra
          thành "cực nhanh, chẳng tốn gì", tức nói dối đúng lúc người chơi cần
          biết mình vừa tạo một chu trình. Kiểu trả về của `runWorkflow` ép điều
          này thành lỗi biên dịch chứ không để nó thành một lựa chọn.
        */}
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground">
          {describeEngineError(outcome.error)}
        </p>
      </section>
    );
  }

  const { axes, summary } = outcome;

  return (
    <section className="flex flex-col gap-4" aria-label="Kết quả lượt chạy">
      {showVerdict ? (
        <div className="flex items-center gap-3">
          {outcome.won ? (
            <Badge variant="status-done" icon={null}>
              <CircleCheck aria-hidden className="size-3" />
              Đạt
            </Badge>
          ) : (
            <Badge variant="status-todo" icon={null}>
              <CircleX aria-hidden className="size-3" />
              Chưa đạt
            </Badge>
          )}
          <p className="text-sm text-muted-foreground">
            {outcome.won
              ? 'Mọi mục tiêu bắt buộc đã xong.'
              : `Còn ${outcome.failingRequired.length} mục tiêu bắt buộc chưa đạt.`}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <AxisCard
          label="① Lead time"
          testId="cicd-axis-lead"
          hint="Một commit mất bao lâu từ lúc đẩy lên tới lúc xanh."
          value={formatSeconds(axes.leadTimeSeconds)}
          distribution={summary.leadTimeSeconds}
          format={formatSeconds}
          target={`Mục tiêu ≤ ${formatSeconds(thresholds.parLeadSeconds)} · trần ${formatSeconds(thresholds.budgetLeadSeconds)}`}
          good={axes.leadTimeSeconds <= thresholds.parLeadSeconds}
          over={axes.leadTimeSeconds > thresholds.budgetLeadSeconds}
        />
        <AxisCard
          label="② Thông lượng"
          testId="cicd-axis-throughput"
          hint="Bao nhiêu commit qua được mỗi giờ khi hàng dồn."
          value={`${formatNumber(axes.throughputPerHour)} commit/giờ`}
          distribution={summary.throughputPerHour}
          format={(v) => formatNumber(v)}
          target={`Mục tiêu ≥ ${formatNumber(thresholds.parThroughputPerHour)} · sàn ${formatNumber(thresholds.minThroughputPerHour)}`}
          good={axes.throughputPerHour >= thresholds.parThroughputPerHour}
          over={axes.throughputPerHour < thresholds.minThroughputPerHour}
        />
        <AxisCard
          label="③ Runner-phút"
          testId="cicd-axis-runner"
          hint="Tài nguyên máy chạy tiêu tốn cho mỗi lượt."
          value={`${formatNumber(axes.runnerMinutes)} runner-phút`}
          distribution={summary.runnerMinutes}
          format={(v) => formatNumber(v)}
          target={`Mục tiêu ≤ ${formatNumber(thresholds.parRunnerMinutes)} · trần ${formatNumber(thresholds.budgetRunnerMinutes)}`}
          good={axes.runnerMinutes <= thresholds.parRunnerMinutes}
          over={axes.runnerMinutes > thresholds.budgetRunnerMinutes}
        />
      </div>

      {/*
        Tỉ lệ lượt xanh KHÔNG phải trục thứ tư. Nó là ngưỡng ĐẠT: một workflow
        nhanh và rẻ mà chỉ xanh 6/20 lượt thì không giao được gì. Đặt nó ở hàng
        riêng, với nhãn nói ra vai trò đó, để nó không bị đọc ngang hàng ba trục.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted px-4 py-3">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Ngưỡng đạt — tỉ lệ lượt xanh
        </span>
        <span
          className={
            axes.greenRate >= thresholds.minGreenRate
              ? 'text-sm font-semibold text-success'
              : 'text-sm font-semibold text-destructive'
          }
        >
          {formatPercent(axes.greenRate)}
        </span>
        <span className="text-xs text-muted-foreground">
          cần ≥ {formatPercent(thresholds.minGreenRate)} · {summary.greenPasses}/{summary.totalPasses} lượt mô phỏng xanh
        </span>
      </div>

      {objectives.length > 0 ? (
        <ObjectiveList
          objectives={objectives}
          failing={new Set([...outcome.failingRequired, ...outcome.failingOptional])}
        />
      ) : null}
    </section>
  );
}

interface AxisCardProps {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  /**
   * Móc cho Playwright đọc đúng con số của trục này.
   *
   * Cần vì ô AC quan trọng nhất của màn là "ba trục KHÁC 0", và nhãn hiển thị
   * (`① Lead time`) là văn bản sản phẩm — đổi chữ một lần là ô đo im lặng bắt
   * nhầm phần tử hoặc bắt trượt. Cùng lý lẽ `git-sandbox-panel` đã ghi.
   */
  readonly testId: string;
  readonly distribution: AxisDistribution;
  readonly format: (value: number) => string;
  readonly target: string;
  readonly good: boolean;
  readonly over: boolean;
}

/**
 * Một trục. Con số p50 to ở giữa, phân bố p90/max nhỏ bên dưới.
 *
 * p90 và max có mặt vì mô phỏng có `flake`: một workflow "trung bình 4 phút"
 * mà max 19 phút là một workflow người ta không tin được, và p50 một mình giấu
 * mất điều đó.
 */
function AxisCard({
  label,
  hint,
  value,
  distribution,
  format,
  target,
  good,
  over,
  testId,
}: AxisCardProps): ReactElement {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted px-4 py-3">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <span
        data-testid={testId}
        className={
          over ? 'text-xl font-semibold text-destructive' : good ? 'text-xl font-semibold text-success' : 'text-xl font-semibold text-foreground'
        }
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <span className="text-xs text-muted-foreground">
        p90 {format(distribution.p90)} · cao nhất {format(distribution.max)}
      </span>
      <span className="text-xs text-muted-foreground">{target}</span>
    </div>
  );
}

function ObjectiveList({
  objectives,
  failing,
}: {
  readonly objectives: readonly CicdObjective[];
  readonly failing: ReadonlySet<string>;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">Mục tiêu</h3>
      <ul className="flex flex-col gap-1">
        {objectives.map((objective) => {
          const passed = !failing.has(objective.id);
          return (
            <li key={objective.id} className="flex items-start gap-2 text-sm">
              {/*
                Ký hiệu `aria-hidden` vì nó chỉ lặp lại chữ ngay bên cạnh; trạng
                thái thật nằm trong chữ "Đạt" / "Chưa đạt" mà trình đọc màn hình
                đọc được, không nằm trong màu.
              */}
              {passed ? (
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <span className={passed ? 'text-muted-foreground' : 'text-foreground'}>
                <span className="sr-only">{passed ? 'Đạt: ' : 'Chưa đạt: '}</span>
                {objective.label}
                {objective.required ? null : (
                  <span className="text-muted-foreground"> (thưởng)</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
