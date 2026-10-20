import { t } from '@devops-platform/copy';
import type { ContentLabels } from '@devops-platform/ds/content';

/**
 * Chữ cho khối nội dung của `@devops-platform/ds/content` (bài học, lab, câu hỏi
 * trắc nghiệm, đề bài). Gói `ds` không phụ thuộc `copy`, nên chữ dựng ở đây.
 */
export function contentLabels(): ContentLabels {
  return {
    run: t('session.code.run'),
    runInterrupt: t('session.code.run-interrupt'),
    copy: t('session.code.copy'),
    copied: t('session.code.copied'),
    copyFailed: t('session.code.copy-failed'),
    codeRegion: (language: string) => t('session.code.region', { language }),
    tableRegion: t('session.code.table'),
    zoomDiagram: t('session.code.zoom'),
    closeDiagram: t('session.code.zoom-close'),
    remoteImage: t('session.code.remote-image'),
    openRemoteImage: (alt: string) => t('session.code.remote-image-open', { alt }),
    brokenImage: (alt: string) => t('session.code.broken-image', { alt }),
    opensInNewTab: t('session.code.new-tab'),
  };
}
