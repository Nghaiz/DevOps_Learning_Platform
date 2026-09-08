import type { Problem } from '../problem.ts';

/**
 * Container không dựng nổi, hai lý do khác nhau
 *
 * Chuyển từ `challenges.ts` (ch-07-thieu-hai-manh-cau-hinh) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0007: Problem = {
  code: 'K8S-0007',
  slug: 'thieu-hai-manh-cau-hinh',
  title: 'Container không dựng nổi, hai lý do khác nhau',
  statement: `Hai Deployment trong namespace \`ky-thuat\` cùng ở
\`CreateContainerConfigError\`. RESTARTS của cả hai đều bằng 0 và không có log
nào.

Đưa cả hai lên chạy đủ 2 replica sẵn sàng.`,
  /* Bậc medium: `intermediate` → `medium`. Triệu chứng đã tự thu hẹp phạm vi cho người làm: `CreateContainerConfigError` chỉ có vài nguyên nhân, và Events gọi thẳng tên object còn thiếu. */
  difficulty: 'medium',
  topics: ['config', 'workload', 'troubleshooting'],
  tags: ['createcontainerconfigerror', 'configmap', 'secret', 'khoa-thieu'],
  timeLimitSec: 180,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['ky-thuat'],
    resources: [
      {
        kind: 'ConfigMap',
        name: 'dong-bo-cau-hinh',
        namespace: 'ky-thuat',
        spec: {
          data: { NGUON_URL: 'https://noi-bo.dlp.vn/api', CHU_KY_PHUT: '15' },
        },
      },
      {
        kind: 'Deployment',
        name: 'dong-bo',
        namespace: 'ky-thuat',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'dong-bo' } },
          template: {
            labels: { app: 'dong-bo' },
            containers: [
              {
                name: 'dong-bo',
                image: 'ghcr.io/dlp/dong-bo:1.9.0',
                env: [
                  {
                    name: 'NGUON_URL',
                    valueFrom: { configMapKeyRef: { name: 'dong-bo-cau-hinh', key: 'NGUON_URL' } },
                  },
                  {
                    name: 'MA_XAC_THUC',
                    valueFrom: {
                      configMapKeyRef: { name: 'dong-bo-cau-hinh', key: 'MA_XAC_THUC' },
                    },
                  },
                ],
              },
            ],
          },
        },
        seededIncident: 'key-configmap-sai',
      },
      {
        kind: 'Deployment',
        name: 'gui-thong-bao',
        namespace: 'ky-thuat',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'gui-thong-bao' } },
          template: {
            labels: { app: 'gui-thong-bao' },
            volumes: [{ name: 'khoa', secret: { secretName: 'khoa-gui-thu' } }],
            containers: [
              {
                name: 'gui-thong-bao',
                image: 'ghcr.io/dlp/gui-thong-bao:3.0.0',
                volumeMounts: [{ name: 'khoa', mountPath: '/etc/khoa' }],
              },
            ],
          },
        },
        seededIncident: 'thieu-secret',
      },
    ],
  },
  objectives: [
    {
      id: 'them-khoa-thieu',
      label: 'ConfigMap `dong-bo-cau-hinh` có khoá `MA_XAC_THUC`',
      check: 'configmap-key-set',
      args: { name: 'dong-bo-cau-hinh', namespace: 'ky-thuat', key: 'MA_XAC_THUC' },
      required: true,
    },
    {
      id: 'dong-bo-chay',
      label: '`dong-bo` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'dong-bo', namespace: 'ky-thuat', replicas: 2 },
      required: true,
    },
    {
      id: 'co-secret',
      label: 'Secret `khoa-gui-thu` tồn tại',
      check: 'resource-exists',
      args: { kind: 'Secret', name: 'khoa-gui-thu', namespace: 'ky-thuat' },
      required: true,
    },
    {
      id: 'gui-thong-bao-chay',
      label: '`gui-thong-bao` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'gui-thong-bao', namespace: 'ky-thuat', replicas: 2 },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'RESTARTS bằng 0 kèm không có log nghĩa là container chưa bao giờ được dựng. Kubelet đã kéo image xong rồi dừng ở bước gom vật liệu cấu hình.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: 'Events của pod gọi thẳng tên thứ nó không tìm thấy. Một bên thiếu cả một object, bên kia có object nhưng thiếu đúng một khoá bên trong.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: 'Tạo Secret còn thiếu cho một Deployment, và thêm khoá `MA_XAC_THUC` vào ConfigMap `dong-bo-cau-hinh` cho cái kia. Pod sẽ tự được dựng lại sau khi vật liệu có đủ.',
      penaltyPoints: 25,
    },
  ],
  /* `null` chứ không phải một con số bịa: challenge cũ không có `parMoves`, và
     đặt đại một giá trị sẽ làm phần chấm theo số nước đi nói dối ngay từ bài đầu. */
  parMoves: null,
  state: 'published',
  authorId: null,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};
