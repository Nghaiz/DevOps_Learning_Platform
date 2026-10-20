'use client';

import { t } from '@devops-platform/copy';
import { useId, useState, type ReactElement } from 'react';
import type { ContentAsset } from '@devops-platform/shared-types/authoring';
import { assetMarkdownSnippet } from './asset-upload';
import { Button, Empty, ErrorBlock, Icon, RowsSkeleton, Table, TBody, TD, TH, THead, TR } from '@devops-platform/ds';

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
      <h2 id={headingId} className="font-display text-lg font-semibold text-ink">
        {t('author.asset-manager-tep-da-tai-len')}
      </h2>

      {status === 'pending' && (
        <RowsSkeleton rows={3} label={t('author.asset-manager-tep-da-tai-len')} />
      )}

      {status === 'error' && (
        <ErrorBlock title={t('author.asset-manager-khong-tai-duoc-danh-sach-tep')} retryLabel={t('common.action.retry')} onRetry={props.state.onRetry} retrying={props.state.retrying}>{props.state.errorMessage ?? ''}</ErrorBlock>
      )}

      {status === 'success' && assets.length === 0 && (
        <Empty art={<Icon name="image" size={40} />} title={t('author.asset-manager-chua-co-tep-nao')}>{t(
            'author.asset-manager-tai-mot-anh-len-roi-dan-doan-markdown-vao-o-noi-dung-cua-buoc-de-nhung-no',
          )}</Empty>
      )}

      {assets.length > 0 && (
        <Table>
          <THead>
            <tr>
              <TH>{t('author.asset-manager-ten-tep')}</TH>
              <TH>{t('author.asset-manager-doan-markdown-de-nhung')}</TH>
              <TH>{t('author.asset-manager-tai-len')}</TH>
              <TH numeric>{t('author.asset-manager-hanh-dong')}</TH>
            </tr>
          </THead>
          <TBody>
            {assets.map((asset) => {
              const snippet = assetMarkdownSnippet(asset);
              const copied = copiedKey === asset.storageKey;
              return (
                <TR key={asset.storageKey} className="animate-enter">
                  <TD className="font-medium break-all">{asset.filename}</TD>
                  <TD>
                    <code className="font-mono text-xs break-all text-acc-ink select-all">{snippet}</code>
                  </TD>
                  <TD className="font-mono text-xs whitespace-nowrap text-ink-2 tabular-nums">
                    {asset.uploadedAt.slice(0, 10)}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant={copied ? 'ghost' : 'secondary'}
                        size="sm"
                        icon={copied ? 'check' : 'copy'}
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
                        variant="danger"
                        size="sm"
                        icon="trash"
                        disabled={props.removing}
                        title={t('author.asset-manager-xoa-that-markdown-con-tham-chieu-tep-nay-se-hien-anh-hong')}
                        onClick={() => {
                          props.onRemove(asset.storageKey);
                        }}
                      >
                        {t('common.action.delete')}
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </section>
  );
}
