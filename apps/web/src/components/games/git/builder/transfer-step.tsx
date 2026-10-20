'use client';

/**
 * E.4, xuất và nhập. Cả hai chạy tại chỗ: xuất là `levelToJson`, nhập là
 * `levelFromJson`, tải về là một `Blob` dựng trong trình duyệt. Không đường
 * nào ở đây chạm mạng (e2e `games-builder-network.spec.ts` đo điều đó).
 */

import { useState, type ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import { levelFromJson, levelToJson, type GitLevel } from '@devops-platform/games';

import { BuilderStep } from './builder-step';
import { Button, Label, Textarea } from '@devops-platform/ds';

export interface TransferStepProps {
  readonly index: number;
  /** `null` khi bản nháp còn lỗi: ô xuất trống và nút tải về bị khoá. */
  readonly level: GitLevel | null;
  readonly fileName: string;
  readonly onImport: (level: GitLevel) => void;
}

export function TransferStep({
  index,
  level,
  fileName,
  onImport,
}: TransferStepProps): ReactElement {
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(false);

  const exported = level === null ? '' : levelToJson(level);

  const download = (): void => {
    if (exported === '') return;
    /*
     * Tải về bằng `Blob` + `URL.createObjectURL` chứ không bằng `data:` URI:
     * một level đủ lớn vượt giới hạn độ dài URL của trình duyệt, và lúc đó nút
     * hỏng trong im lặng. `revokeObjectURL` ngay sau khi bấm vì tệp đã được đọc
     * xong tại thời điểm đó.
     */
    const blob = new Blob([exported], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (): void => {
    const parsed = levelFromJson(importText);
    if (parsed === null) {
      setImportError(true);
      return;
    }
    setImportError(false);
    setImportText('');
    onImport(parsed);
  };

  return (
    <BuilderStep
      index={index}
      id="builder-xuat"
      title={t('author.builder.step.transfer')}
      lead={t('author.builder.lead.transfer')}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="builder-export">{t('author.builder.transfer.export')}</Label>
        <Textarea
          id="builder-export"
          data-testid="git-builder-export"
          readOnly
          rows={6}
          value={exported}
          placeholder={t('author.builder.transfer.export-empty')}
          className="min-h-0 bg-well font-mono text-ink-2 sm:text-xs"
        />
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon="download"
            onClick={download}
            disabled={exported === ''}
            data-testid="git-builder-download"
          >
            {t('author.builder.transfer.download')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="builder-import">{t('author.builder.transfer.import')}</Label>
        <Textarea
          id="builder-import"
          data-testid="git-builder-import"
          rows={4}
          value={importText}
          spellCheck={false}
          aria-invalid={importError || undefined}
          aria-describedby={importError ? 'builder-import-error' : undefined}
          onChange={(e) => {
            setImportText(e.target.value);
          }}
          className="min-h-0 font-mono sm:text-xs"
        />
        {importError && (
          <p
            id="builder-import-error"
            role="alert"
            data-testid="git-builder-import-error"
            className="animate-enter text-sm leading-relaxed text-bad-ink"
          >
            {t('author.builder.transfer.import-error')}
          </p>
        )}
        <div>
          <Button
            size="sm"
            variant="ink"
            icon="upload"
            onClick={doImport}
            disabled={importText.trim() === ''}
          >
            {t('author.builder.transfer.import-run')}
          </Button>
        </div>
      </div>
    </BuilderStep>
  );
}
