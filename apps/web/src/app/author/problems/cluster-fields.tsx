'use client';

import { useState, type ReactElement } from 'react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ui';
import { TextAreaField, issueFor } from '../../../components/author/field';
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

/**
 * Soạn trạng thái cụm ban đầu — biểu mẫu, và một đường dán JSON thô.
 *
 * ## Biểu mẫu là NGUỒN SỰ THẬT, JSON chỉ là một đường NHẬP
 *
 * Hai tab, nhưng KHÔNG hai bản sao. Tab JSON đọc ra từ biểu mẫu để xem, và khi
 * bấm "Áp dụng" thì nó phân tích ngược VỀ biểu mẫu rồi tự tắt. Giữ song song một
 * chuỗi JSON và một cây form là dựng hai nguồn cho cùng một sự thật: chúng lệch
 * ngay lần đầu ai đó sửa một bên, và không có gì trên màn hình nói bên nào đúng.
 */
export function ClusterFields(props: {
  readonly cluster: ClusterFormState;
  readonly onChange: (patch: Partial<ClusterFormState>) => void;
  readonly onReplace: (next: ClusterFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly nextKey: () => string;
}): ReactElement {
  const [tab, setTab] = useState('bieu-mau');

  const patchNode = (index: number, patch: Partial<NodeFormState>): void => {
    props.onChange({
      nodes: props.cluster.nodes.map((node, i) => (i === index ? { ...node, ...patch } : node)),
    });
  };
  const patchResource = (index: number, patch: Partial<ResourceFormState>): void => {
    props.onChange({
      resources: props.cluster.resources.map((resource, i) => (i === index ? { ...resource, ...patch } : resource)),
    });
  };

  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">Trạng thái cụm ban đầu</h2>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
        }}
      >
        <TabsList>
          <TabsTrigger value="bieu-mau">Biểu mẫu</TabsTrigger>
          <TabsTrigger value="json">Dán JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="bieu-mau">
          <div className="flex flex-col gap-6 pt-2">
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Node</h3>
              {props.cluster.nodes.map((node, index) => (
                <NodeFields
                  key={node.key}
                  node={node}
                  index={index}
                  issues={props.issues}
                  canRemove={props.cluster.nodes.length > 1}
                  onChange={(patch) => {
                    patchNode(index, patch);
                  }}
                  onRemove={() => {
                    props.onChange({ nodes: props.cluster.nodes.filter((_, i) => i !== index) });
                  }}
                />
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    props.onChange({ nodes: [...props.cluster.nodes, emptyNode(props.nextKey())] });
                  }}
                >
                  Thêm node
                </Button>
              </div>
            </div>

            <TextAreaField
              label="Namespace"
              value={props.cluster.namespacesText}
              onChange={(namespacesText) => {
                props.onChange({ namespacesText });
              }}
              rows={3}
              mono
              error={issueFor(props.issues, 'namespaces')}
              hint="Mỗi dòng một namespace. Tài nguyên chỉ đặt được vào namespace đã khai ở đây."
            />

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-foreground">Tài nguyên</h3>
              {props.cluster.resources.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Chưa có tài nguyên nào. Một bài chẩn đoán thường bắt đầu bằng một workload đã hỏng sẵn; một bài
                  dựng từ đầu thì để trống chỗ này.
                </p>
              )}
              {props.cluster.resources.map((resource, index) => (
                <ResourceFields
                  key={resource.key}
                  resource={resource}
                  index={index}
                  issues={props.issues}
                  onChange={(patch) => {
                    patchResource(index, patch);
                  }}
                  onRemove={() => {
                    props.onChange({ resources: props.cluster.resources.filter((_, i) => i !== index) });
                  }}
                />
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    props.onChange({ resources: [...props.cluster.resources, emptyResource(props.nextKey())] });
                  }}
                >
                  Thêm tài nguyên
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="json">
          <ClusterJsonFields
            cluster={props.cluster}
            nextKey={props.nextKey}
            onApply={(next) => {
              props.onReplace(next);
              setTab('bieu-mau');
            }}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
