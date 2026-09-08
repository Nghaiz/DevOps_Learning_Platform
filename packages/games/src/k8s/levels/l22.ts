import type { Level } from '../contract.ts';

/**
 * Đóng chương 4 bằng loại workload thứ ba, và bằng hành vi mà Deployment KHÔNG
 * có: OrderedReady. Một pod kẹt chặn toàn bộ phần đuôi, nên triệu chứng là "chỉ
 * có pod-0 tồn tại" chứ không phải "cả ba pod đều đỏ" — nhìn ra khác biệt đó là
 * bài học chính.
 *
 * Nguyên nhân gốc lại nằm ở tầng lưu trữ (StorageClass không tồn tại), nên level
 * này buộc phải nối hai chương lại: chẩn đoán bắt đầu ở workload và kết thúc ở
 * PVC. Đó là lý do nó đứng cuối chương chứ không đứng cạnh l21.
 */
export const l22: Level = {
  id: 'k8s-22-statefulset-dung-o-pod-khong',
  chapter: 4,
  title: 'StatefulSet dừng lại ở pod số 0',
  brief: `Cụm cơ sở dữ liệu \`postgres\` trong namespace \`du-lieu\` khai 3 replica. Trong
cluster chỉ có **một** pod: \`postgres-0\`, và nó ở \`Pending\`. Không có
\`postgres-1\`, không có \`postgres-2\` — chúng chưa từng được tạo.

Deployment không hành xử như vậy: nó tạo cả ba pod cùng lúc rồi cả ba cùng hỏng.
Khác biệt này là cố ý trong thiết kế của **StatefulSet**. Với cơ sở dữ liệu, thứ
tự khởi động có ý nghĩa — pod số 0 thường là bản chính mà các bản sau phải nối
vào. Nên StatefulSet mặc định chạy \`OrderedReady\`: nó chỉ tạo pod thứ N sau khi
pod thứ N−1 đã Ready.

Hệ quả là một pod kẹt sẽ chặn đứng toàn bộ phần còn lại, và bảng \`get pods\`
trông như thể StatefulSet chỉ khai một replica.

StatefulSet khác Deployment ở một chỗ nữa: mỗi pod có ổ đĩa **riêng và bền**, mô
tả bằng \`volumeClaimTemplates\`. Kubernetes tự sinh một PVC cho mỗi pod, đặt tên
theo dạng \`<tên-template>-<tên-statefulset>-<số-thứ-tự>\`. Pod bị xoá thì PVC vẫn
ở lại, và pod mới cùng số thứ tự sẽ nhận lại đúng ổ đĩa cũ.

**Việc cần làm:** đưa cả 3 pod của \`postgres\` lên chạy, với ổ đĩa riêng cho từng
pod.

Bắt đầu từ pod đang kẹt. Lý do nó không xếp lịch được không nằm ở nó.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-3', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['du-lieu'],
    resources: [
      {
        kind: 'Service',
        name: 'postgres',
        namespace: 'du-lieu',
        spec: {
          type: 'ClusterIP',
          clusterIP: 'None',
          selector: { app: 'postgres' },
          ports: [{ port: 5432, targetPort: 5432, protocol: 'TCP' }],
        },
      },
      {
        kind: 'StatefulSet',
        name: 'postgres',
        namespace: 'du-lieu',
        spec: {
          replicas: 3,
          serviceName: 'postgres',
          podManagementPolicy: 'OrderedReady',
          selector: { matchLabels: { app: 'postgres' } },
          template: {
            labels: { app: 'postgres' },
            containers: [
              {
                name: 'postgres',
                image: 'postgres:17-alpine',
                ports: [{ containerPort: 5432 }],
                volumeMounts: [{ name: 'du-lieu', mountPath: '/var/lib/postgresql/data' }],
                resources: {
                  requests: { cpu: '500m', memory: '512Mi' },
                  limits: { cpu: '1000m', memory: '1Gi' },
                },
              },
            ],
          },
          volumeClaimTemplates: [
            {
              name: 'du-lieu',
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'nhanh-ssd',
              storage: '10Gi',
            },
          ],
        },
        seededIncident: 'storageclass-khong-ton-tai',
      },
    ],
  },
  allowedResources: [
    'StorageClass',
    'PersistentVolume',
    'PersistentVolumeClaim',
    'StatefulSet',
  ],
  objectives: [
    {
      id: 'co-storageclass',
      label: 'StorageClass `nhanh-ssd` tồn tại',
      check: 'resource-exists',
      args: { kind: 'StorageClass', name: 'nhanh-ssd', namespace: '' },
      required: true,
    },
    {
      id: 'pvc-pod-0-bound',
      label: 'PVC của pod số 0 đã Bound',
      check: 'pvc-bound',
      args: { name: 'du-lieu-postgres-0', namespace: 'du-lieu' },
      required: true,
    },
    {
      id: 'pvc-pod-2-bound',
      label: 'PVC của pod số 2 đã Bound',
      check: 'pvc-bound',
      args: { name: 'du-lieu-postgres-2', namespace: 'du-lieu' },
      required: true,
    },
    {
      id: 'ba-pod-chay',
      label: 'Cả 3 pod `app=postgres` đang chạy',
      check: 'pod-count-running',
      args: { namespace: 'du-lieu', labelSelector: 'app=postgres', min: 3 },
      required: true,
    },
    {
      id: 'statefulset-du-replica',
      label: 'StatefulSet `postgres` giữ đủ 3 replica',
      check: 'replicas-at-least',
      args: { kind: 'StatefulSet', name: 'postgres', namespace: 'du-lieu', n: 3 },
      required: true,
    },
  ],
  hints: [
    'Đừng bắt đầu bằng câu hỏi "vì sao pod 1 và 2 không có". Chúng không có vì pod 0 chưa Ready — đó là hành vi đã được thiết kế. Câu hỏi thật là vì sao pod 0 Pending: `kubectl describe pod postgres-0 -n du-lieu`.',
    'Pod 0 chờ PVC của nó. `kubectl get pvc -n du-lieu` cho thấy `du-lieu-postgres-0` ở Pending, và `kubectl describe` nó nói lớp lưu trữ nó xin không tồn tại. Đối chiếu với `kubectl get storageclass`.',
    'Tạo StorageClass `nhanh-ssd`. Nếu lớp đó không cấp phát động, mỗi pod cần một PV khớp: 3 PV, mỗi cái 10Gi, `ReadWriteOnce`, `storageClassName: nhanh-ssd`. Ba PVC sẽ Bound lần lượt và ba pod lên theo đúng thứ tự 0, 1, 2.',
  ],
  parMoves: 4,
  teaches: [
    'StatefulSet',
    'OrderedReady',
    'volumeClaimTemplates',
    'headless Service',
    'StorageClass',
    'ổ đĩa bền theo ordinal',
    'StatefulSetOrderedReadyStuck',
  ],
};
