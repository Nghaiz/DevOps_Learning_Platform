'use client';

import { t } from '@devops-platform/copy';
import { useId, useState, type CSSProperties, type ReactElement } from 'react';
import { Check, Copy, ImageOff, Trash2 } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@devops-platform/ui';
import type { ContentAsset } from '@devops-platform/shared-types/authoring';
import { assetMarkdownSnippet } from './asset-upload';

/** Trạng thái của truy vấn `authoring.listAssets`, tách khỏi hook để sổ không biết tRPC. */
export interface AssetListState {
  readonly status: 'pending' | 'error' | 'success';
  readonly assets: readonly ContentAsset[];
  /** Câu lỗi đã dịch (`describeTrpcError`), chỉ có khi `status === 'error'`. */
  readonly errorMessage: string | null;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}

/**
 * Sổ tệp đã tải lên của một bài (ledger, design brief §4.4): tên, đoạn markdown
 * để dán, ngày tải, và hai hành động Chép / Xoá.
 *
 * Đoạn markdown hiện nguyên văn trong cột của nó, không chỉ nằm sau nút Chép:
 * khi trình duyệt từ chối clipboard (quyền, hoặc trang không ở ngữ cảnh bảo
 * mật), người soạn vẫn bôi đen và chép tay được.
 */
export function AssetList(props: {
  readonly state: AssetListState;
  readonly removing: boolean;
  readonly onRemove: (storageKey: string) => void;
  readonly onCopyFailed: () => void;
}): ReactElement {
  const { status, assets } = props.state;
  const headingId = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="type-label text-muted-foreground">
        {t('author.asset-manager-tep-da-tai-len')}
      </h2>

      {status === 'pending' && (
        <div className="flex flex-col gap-px border-y border-border">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title={t('author.asset-manager-khong-tai-duoc-danh-sach-tep')}
          message={props.state.errorMessage ?? ''}
          onRetry={props.state.onRetry}
          retrying={props.state.retrying}
        />
      )}

      {status === 'success' && assets.length === 0 && (
        <EmptyState
          glyph={<ImageOff aria-hidden className="size-10" />}
          title={t('author.asset-manager-chua-co-tep-nao')}
          description={t(
            'author.asset-manager-tai-mot-anh-len-roi-dan-doan-markdown-vao-o-noi-dung-cua-buoc-de-nhung-no',
          )}
        />
      )}

      {assets.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('author.asset-manager-ten-tep')}</TableHead>
              <TableHead>{t('author.asset-manager-doan-markdown-de-nhung')}</TableHead>
              <TableHead>{t('author.asset-manager-tai-len')}</TableHead>
              <TableHead className="text-right">{t('author.asset-manager-hanh-dong')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset, index) => {
              const snippet = assetMarkdownSnippet(asset);
              const copied = copiedKey === asset.storageKey;
              return (
                <TableRow
                  key={asset.storageKey}
                  className="stagger animate-rise"
                  style={{ '--i': index } as CSSProperties}
                >
                  <TableCell className="font-medium break-all">{asset.filename}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs break-all text-line-cicd-ink select-all">{snippet}</code>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {asset.uploadedAt.slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant={copied ? 'secondary' : 'outline'}
                        size="sm"
                        iconLeft={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                        onClick={() => {
                          void navigator.clipboard.writeText(snippet).then(
                            () => {
                              setCopiedKey(asset.storageKey);
                            },
                            props.onCopyFailed,
                          );
                        }}
                      >
                        {copied ? t('author.asset-manager-da-chep') : t('author.asset-manager-chep')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        iconLeft={<Trash2 aria-hidden />}
                        disabled={props.removing}
                        title={t('author.asset-manager-xoa-that-markdown-con-tham-chieu-tep-nay-se-hien-anh-hong')}
                        onClick={() => {
                          props.onRemove(asset.storageKey);
                        }}
                      >
                        {t('common.action.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
