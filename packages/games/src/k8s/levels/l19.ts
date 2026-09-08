import type { Level } from '../contract.ts';

/**
 * Cùng trạng thái lỗi với l18 nhưng nguyên nhân lệch một tầng: object CÓ, khoá
 * bên trong thì không. Đây là mẫu "gần đúng còn khó tìm hơn sai hẳn" — người
 * chơi vừa học phản xạ `get configmap`, và lần này phản xạ đó trả lời "có" rồi
 * dẫn họ đi sai đường.
 *
 * `key` được tham chiếu qua `env[].valueFrom` chứ không qua `envFrom` như l18:
 * đó chính là khác biệt kỹ thuật khiến một khoá thiếu trở thành lỗi cứng thay vì
 * bị bỏ qua trong im lặng.
 */
export const l19: Level = {
  id: 'k8s-19-thieu-mot-khoa-trong-configmap',
  chapter: 4,
  title: 'ConfigMap có đó, khoá thì không',
  brief: `Lại \`CreateContainerConfigError\`, lần này ở Deployment \`thanh-toan\` trong
namespace \`tai-chinh\`. Bạn làm đúng như level trước: \`kubectl get configmap\`.

ConfigMap \`thanh-toan-cau-hinh\` tồn tại. Bạn xem nội dung, thấy có dữ liệu bên
trong, và bế tắc.

Cách một pod đọc ConfigMap có hai kiểu, và chúng hỏng khác nhau:

- \`envFrom\` bơm **toàn bộ** khoá trong ConfigMap thành biến môi trường. Thiếu
  một khoá thì đơn giản là thiếu một biến — container vẫn dựng được, và ứng dụng
  tự xoay xở hoặc tự chết sau đó.
- \`env[].valueFrom.configMapKeyRef\` đòi **đúng một khoá có tên cụ thể**. Khoá
  không tồn tại thì kubelet dừng ngay: nó không có giá trị để bơm, nên không dựng
  container. Đây là kiểu tham chiếu chặt, và cũng là kiểu đang được dùng ở đây.

**Việc cần làm:** đưa Deployment \`thanh-toan\` (3 replica) lên chạy được, và
giữ nguyên mọi khoá đang có trong ConfigMap.

Đừng đoán tên khoá còn thiếu. Nó được ghi ra ở hai chỗ khác nhau trong cluster,
và cả hai đều chính xác hơn trí nhớ của bạn.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['tai-chinh'],
    resources: [
      {
        kind: 'ConfigMap',
        name: 'thanh-toan-cau-hinh',
        namespace: 'tai-chinh',
        spec: {
          data: {
            CONG_THANH_TOAN: 'https://sandbox.vnpay.vn',
            SO_LAN_THU_LAI: '3',
            MUC_LOG: 'info',
          },
        },
      },
      {
        kind: 'Deployment',
        name: 'thanh-toan',
        namespace: 'tai-chinh',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'thanh-toan' } },
          template: {
            labels: { app: 'thanh-toan' },
            containers: [
              {
                name: 'thanh-toan',
                image: 'ghcr.io/dlp/thanh-toan:4.0.2',
                ports: [{ containerPort: 8080 }],
                env: [
                  {
                    name: 'CONG_THANH_TOAN',
                    valueFrom: {
                      configMapKeyRef: { name: 'thanh-toan-cau-hinh', key: 'CONG_THANH_TOAN' },
                    },
                  },
                  {
                    name: 'MA_DOI_TAC',
                    valueFrom: {
                      configMapKeyRef: { name: 'thanh-toan-cau-hinh', key: 'MA_DOI_TAC' },
                    },
                  },
                ],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'key-configmap-sai',
      },
    ],
  },
  allowedResources: ['ConfigMap', 'Deployment'],
  objectives: [
    {
      id: 'co-khoa-ma-doi-tac',
      label: 'ConfigMap `thanh-toan-cau-hinh` có khoá `MA_DOI_TAC`',
      check: 'configmap-key-set',
      args: { name: 'thanh-toan-cau-hinh', namespace: 'tai-chinh', key: 'MA_DOI_TAC' },
      required: true,
    },
    {
      id: 'giu-khoa-cu',
      label: 'Khoá `CONG_THANH_TOAN` vẫn còn nguyên',
      check: 'configmap-key-set',
      args: { name: 'thanh-toan-cau-hinh', namespace: 'tai-chinh', key: 'CONG_THANH_TOAN' },
      required: true,
    },
    {
      id: 'ba-replica-san-sang',
      label: 'Deployment `thanh-toan` có đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'thanh-toan', namespace: 'tai-chinh', replicas: 3 },
      required: true,
    },
    {
      id: 'het-su-co',
      label: 'Sự cố cấu hình đã được xử lý dứt điểm',
      check: 'no-incident-active',
      args: { namespace: 'tai-chinh', kind: 'key-configmap-sai' },
      required: false,
    },
  ],
  hints: [
    'Sự tồn tại của ConfigMap không phải câu trả lời — nội dung của nó mới là. `kubectl get configmap thanh-toan-cau-hinh -n tai-chinh -o yaml` liệt kê từng khoá đang có.',
    'Chỗ thứ hai ghi tên khoá là Events của pod: `kubectl describe pod -n tai-chinh -l app=thanh-toan` nói rõ khoá nào không tìm thấy. Chỗ thứ ba là chính template của Deployment — đọc danh sách `env` và các `configMapKeyRef` trong đó.',
    'Pod đòi hai khoá qua `configMapKeyRef`: `CONG_THANH_TOAN` (đã có) và `MA_DOI_TAC` (chưa có). Thêm khoá `MA_DOI_TAC` vào ConfigMap mà không xoá ba khoá cũ.',
  ],
  parMoves: 1,
  teaches: [
    'configMapKeyRef',
    'envFrom vs env valueFrom',
    'tham chiếu chặt và lỏng',
    'CreateContainerConfigError',
  ],
};
