'use client';

import { useState, type ReactElement } from 'react';
import { Plus } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ui';
import { TextAreaField, issueFor } from '../../../components/author/field';
import { fieldPathProps } from '../../../components/author/studio';
import { Split, type TopicLine } from '../../../components/kit';
import {
  emptyNode,
  emptyResource,
  type ClusterFormState,
  type FieldIssue,
  type NodeFormState,
  type ResourceFormState,
} from './cluster-form';
import { ClusterJsonFields } from './cluster-json-fields';
import { NodeFields } from './node-fields';
import { ResourceFields } from './resource-fields';

const FORM = 'bieu-mau';
const JSON_VIEW = 'json';

/**
 * Trạng thái cụm K8s ban đầu: biểu mẫu ba phần, và một đường dán JSON thô.
 *
 * ## Biểu mẫu là NGUỒN SỰ THẬT, JSON chỉ là một đường NHẬP
 *
 * Hai mặt, nhưng không hai bản sao. Mặt JSON đọc ra từ biểu mẫu để xem; bấm "Áp
 * dụng" thì nó phân tích ngược VỀ biểu mẫu rồi tự quay lại mặt biểu mẫu. Giữ
 * song song một chuỗi JSON và một cây form là hai nguồn cho cùng một sự thật:
 * chúng lệch ngay lần đầu ai đó sửa một bên.
 *
 * Ba khối bọc mang `data-field-path` (`nodes`, `namespaces`, `resources`) để lỗi
 * cấp nhóm từ bảng kiểm nhảy được về đúng phần.
 */
export function ClusterFields(props: {
  readonly cluster: ClusterFormState;
  readonly onChange: (patch: Partial<ClusterFormState>) => void;
  readonly onReplace: (next: ClusterFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly line: TopicLine;
  readonly nextKey: () => string;
}): ReactElement {
  const [view, setView] = useState(FORM);
  const { cluster } = props;

  const patchNode = (index: number, patch: Partial<NodeFormState>): void => {
    props.onChange({ nodes: cluster.nodes.map((node, i) => (i === index ? { ...node, ...patch } : node)) });
  };
  const patchResource = (index: number, patch: Partial<ResourceFormState>): void => {
    props.onChange({
      resources: cluster.resources.map((resource, i) => (i === index ? { ...resource, ...patch } : resource)),
    });
  };

  return (
    <Tabs value={view} onValueChange={setView} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-label text-muted-foreground">{t('problem.cluster-fields-trang-thai-cum-ban-dau')}</p>
        <TabsList aria-label={t('problem.cluster-fields-trang-thai-cum-ban-dau')}>
          <TabsTrigger value={FORM}>{t('problem.cluster-fields-bieu-mau')}</TabsTrigger>
          <TabsTrigger value={JSON_VIEW}>{t('problem.cluster-fields-dan-json')}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value={FORM} className="flex flex-col focus-visible:outline-none">
        <Split index="01" title={t('problem.cluster-fields-node')}>
          <div className="flex flex-col gap-6" {...fieldPathProps('nodes')}>
            {issueFor(props.issues, 'nodes') !== null && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {issueFor(props.issues, 'nodes')}
              </p>
            )}
            {cluster.nodes.map((node, index) => (
              <NodeFields
                key={node.key}
                node={node}
                index={index}
                line={props.line}
                issues={props.issues}
                canRemove={cluster.nodes.length > 1}
                onChange={(patch) => {
                  patchNode(index, patch);
                }}
                onRemove={() => {
                  props.onChange({ nodes: cluster.nodes.filter((_, i) => i !== index) });
                }}
              />
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                iconLeft={<Plus aria-hidden className="size-4" />}
                onClick={() => {
                  props.onChange({ nodes: [...cluster.nodes, emptyNode(props.nextKey())] });
                }}
              >
                {t('problem.cluster-fields-them-node')}
              </Button>
            </div>
          </div>
        </Split>

        <Split index="02" title={t('problem.cluster-fields-namespace')}>
          <TextAreaField
            label={t('author.problem.field.namespaces')}
            value={cluster.namespacesText}
            path="namespaces"
            onChange={(namespacesText) => {
              props.onChange({ namespacesText });
            }}
            rows={4}
            mono
            error={issueFor(props.issues, 'namespaces')}
            hint={t(
              'problem.cluster-fields-moi-dong-mot-namespace-tai-nguyen-chi-dat-duoc-vao-namespace-da-khai-o-day',
            )}
          />
        </Split>

        <Split index="03" title={t('problem.cluster-fields-tai-nguyen')}>
          <div className="flex flex-col gap-6" {...fieldPathProps('resources')}>
            {cluster.resources.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'problem.cluster-fields-chua-co-tai-nguyen-nao-mot-bai-chan-doan-thuong-bat-dau-bang-mot-workload-d',
                )}
              </p>
            )}
            {cluster.resources.map((resource, index) => (
              <ResourceFields
                key={resource.key}
                resource={resource}
                index={index}
                line={props.line}
                issues={props.issues}
                onChange={(patch) => {
                  patchResource(index, patch);
                }}
                onRemove={() => {
                  props.onChange({ resources: cluster.resources.filter((_, i) => i !== index) });
                }}
              />
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                iconLeft={<Plus aria-hidden className="size-4" />}
                onClick={() => {
                  props.onChange({ resources: [...cluster.resources, emptyResource(props.nextKey())] });
                }}
              >
                {t('problem.cluster-fields-them-tai-nguyen')}
              </Button>
            </div>
          </div>
        </Split>
      </TabsContent>

      <TabsContent value={JSON_VIEW} className="focus-visible:outline-none">
        <Split index="01" title={t('problem.cluster-fields-dan-json')}>
          <ClusterJsonFields
            cluster={cluster}
            nextKey={props.nextKey}
            onApply={(next) => {
              props.onReplace(next);
              setView(FORM);
            }}
          />
        </Split>
      </TabsContent>
    </Tabs>
  );
}
