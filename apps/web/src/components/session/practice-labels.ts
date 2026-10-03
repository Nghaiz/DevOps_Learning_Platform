import { t } from '@devops-platform/copy';
import type { ContentViewProps, StepNavProps } from '@devops-platform/ui';

/**
 * Câu chữ cho hai component của `packages/ui/src/lesson`. Gói `ui` không phụ
 * thuộc `copy`, nên trang dựng nhãn ở đây rồi truyền xuống: mọi chữ người học
 * đọc vẫn đi qua `t()`.
 */
export function contentViewLabels(): NonNullable<ContentViewProps['labels']> {
  return {
    run: t('session.code.run'),
    runInterrupt: t('session.code.run-interrupt'),
    copy: t('session.code.copy'),
    copied: t('session.code.copied'),
    copyFailed: t('session.code.copy-failed'),
    region: (language: string) => t('session.code.region', { language }),
    zoom: t('session.code.zoom'),
  };
}

export function stepNavLabels(): StepNavProps['labels'] {
  return {
    list: t('session.steps.list'),
    prev: t('session.steps.prev'),
    next: t('session.steps.next'),
    done: t('session.steps.done'),
    current: t('session.steps.current'),
    todo: t('session.steps.todo'),
  };
}
