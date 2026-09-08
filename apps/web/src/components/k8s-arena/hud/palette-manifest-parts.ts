/**
 * Mảnh dựng YAML dùng chung, cộng manifest của nhóm **workload**.
 *
 * Tách khỏi `palette-manifest.ts` vì hai lý do khác nhau, và cả hai đều tính:
 * nhóm workload chiếm gần nửa số dòng của bảng 26 loại (chín loại, và loại nào
 * cũng mang một pod template lồng), còn `head`/`podBody`/`workload` là mảnh mà
 * CẢ HAI file dùng. Cổng `satisfies Record<ResourceKind, …>` vẫn nằm nguyên ở
 * file kia, trên object đã ghép — nên tách file không làm mất phép kiểm đủ loại.
 *
 * Mọi chuỗi ở đây phải qua được `parseManifests` của
 * `packages/games/src/k8s/yaml.ts`: map thụt lề, dãy `- `, vô hướng, `{}`/`[]`
 * rỗng, nháy đơn/kép. KHÔNG chuỗi nhiều dòng (`|`, `>`), không anchor, không
 * flow map có nội dung.
 */

import type { ResourceKind } from '@devops-platform/games';

/** Image mặc định — pin tag cụ thể, không `latest`. `latest` là thói quen xấu đầu tiên phải bẻ. */
export const WEB_IMAGE = 'nginx:1.27';
export const TOOL_IMAGE = 'busybox:1.36';

function container(image: string, port: number | null): string {
  const ports = port === null ? '' : `\n          ports:\n            - containerPort: ${port}`;
  return `        - name: app\n          image: ${image}${ports}`;
}

/** Thân pod dùng chung cho Pod và cho `template.spec` của mọi workload. */
export function podBody(image: string, port: number | null, restartPolicy: string | null): string {
  const restart = restartPolicy === null ? '' : `\n      restartPolicy: ${restartPolicy}`;
  return `${restart}\n      containers:\n${container(image, port)}`;
}

export function head(apiVersion: string, kind: ResourceKind, name: string, labelled: boolean): string {
  const labels = labelled ? `\n  labels:\n    app: ${name}` : '';
  return `apiVersion: ${apiVersion}\nkind: ${kind}\nmetadata:\n  name: ${name}${labels}`;
}

/** Workload có `selector.matchLabels` + `template` — Deployment, ReplicaSet, StatefulSet, DaemonSet. */
function workload(kind: ResourceKind, name: string, extraSpec: string): string {
  return `${head('apps/v1', kind, name, true)}
spec:${extraSpec}
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:${podBody(WEB_IMAGE, 80, null)}`;
}

export const WORKLOAD_BUILDERS = {
  Pod: (name: string) => `${head('v1', 'Pod', name, true)}
spec:${podBody(WEB_IMAGE, 80, null)}`,

  Deployment: (name: string) => workload('Deployment', name, '\n  replicas: 2'),
  ReplicaSet: (name: string) => workload('ReplicaSet', name, '\n  replicas: 2'),
  StatefulSet: (name: string) => workload('StatefulSet', name, `\n  replicas: 2\n  serviceName: ${name}`),
  /* DaemonSet KHÔNG có `replicas` — số bản sao của nó là số node, không phải một con số người ta đặt. */
  DaemonSet: (name: string) => workload('DaemonSet', name, ''),

  Job: (name: string) => `${head('batch/v1', 'Job', name, true)}
spec:
  completions: 1
  parallelism: 1
  backoffLimit: 4
  template:
    metadata:
      labels:
        app: ${name}
    spec:${podBody(TOOL_IMAGE, null, 'Never')}`,

  /*
   * `schedule` là hình dạng thật và là thứ `kubectl get cronjob` in ra; nhịp mô
   * phỏng thì do `everyTicks` quyết định và mặc định 120 tick khi vắng
   * (`controllers.ts:476`). Cố ý KHÔNG đặt `everyTicks` ở đây: nó là field riêng
   * của mô phỏng, và dạy nó cho người học là dạy một cú pháp không tồn tại ngoài
   * đời. Manifest này vẫn chạy được nhờ đúng cái mặc định đó.
   */
  CronJob: (name: string) => `${head('batch/v1', 'CronJob', name, true)}
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        metadata:
          labels:
            app: ${name}
        spec:
          restartPolicy: Never
          containers:
            - name: app
              image: ${TOOL_IMAGE}`,

  HorizontalPodAutoscaler: (name: string) => `${head('autoscaling/v2', 'HorizontalPodAutoscaler', name, false)}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ${name}
  minReplicas: 2
  maxReplicas: 6`,

  PodDisruptionBudget: (name: string) => `${head('policy/v1', 'PodDisruptionBudget', name, false)}
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: ${name}`,
} as const;
