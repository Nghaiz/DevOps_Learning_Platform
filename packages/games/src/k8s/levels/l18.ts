import type { Level } from '../contract.ts';

/**
 * Mở chương 4 bằng một trạng thái lỗi mà người chơi CHƯA từng gặp:
 * `CreateContainerConfigError`. Nó khác cả ImagePullBackOff (image về được rồi)
 * lẫn CrashLoopBackOff (container còn chưa được tạo) — kubelet dừng ở giữa hai
 * bước đó vì thiếu vật liệu để dựng container.
 *
 * Đây là lý do chương 4 phải nằm sau chương 1: chỉ khi đã phân biệt được hai lỗi
 * kia thì lỗi thứ ba mới có chỗ để đứng.
 */
export const l18: Level = {
  id: 'k8s-18-configmap-tach-cau-hinh',
  chapter: 4,
  title: 'Container không dựng nổi vì thiếu cấu hình',
  brief: `Deployment \`bao-cao\` vừa được chuyển từ môi trường staging sang \`van-hanh\`.
Không pod nào lên. Trạng thái không phải ImagePullBackOff — image đã về máy — và
cũng không phải CrashLoopBackOff, vì RESTARTS đứng yên ở 0.

Trạng thái là \`CreateContainerConfigError\`, và nó nói một chuyện rất cụ thể:
kubelet **chưa** dựng container. Nó kéo image xong, quay sang gom vật liệu cấu
hình để bơm vào container, và thiếu mất một thứ. Không có container nào được tạo
nghĩa là không có gì để restart, và cũng không có log nào để đọc.

Cấu hình không nên nằm trong image. Cùng một image phải chạy được ở staging và ở
production, khác nhau chỉ ở giá trị được bơm vào lúc chạy. **ConfigMap** giữ đúng
những giá trị đó: dữ liệu dạng khoá–giá trị, đưa vào container qua biến môi
trường hoặc qua file.

**Việc cần làm:** đưa Deployment \`bao-cao\` (2 replica) lên chạy được. Nó cần
một ConfigMap tên \`bao-cao-cau-hinh\` với ba khoá: \`MUC_LOG\`, \`SO_LUONG_WORKER\`
và \`MUI_GIO\`.

Giá trị cụ thể không quan trọng ở level này. Điều quan trọng là bạn tìm ra pod
đang đòi cái gì, thay vì đoán.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['van-hanh'],
    resources: [
      {
        kind: 'Deployment',
        name: 'bao-cao',
        namespace: 'van-hanh',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'bao-cao' } },
          template: {
            labels: { app: 'bao-cao' },
            containers: [
              {
                name: 'bao-cao',
                image: 'ghcr.io/dlp/bao-cao:2.1.0',
                ports: [{ containerPort: 8080 }],
                envFrom: [{ configMapRef: { name: 'bao-cao-cau-hinh' } }],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'thieu-configmap',
      },
    ],
  },
  allowedResources: ['ConfigMap', 'Deployment'],
  objectives: [
    {
      id: 'co-khoa-muc-log',
      label: 'ConfigMap `bao-cao-cau-hinh` có khoá `MUC_LOG`',
      check: 'configmap-key-set',
      args: { name: 'bao-cao-cau-hinh', namespace: 'van-hanh', key: 'MUC_LOG' },
      required: true,
    },
    {
      id: 'co-khoa-worker',
      label: 'ConfigMap `bao-cao-cau-hinh` có khoá `SO_LUONG_WORKER`',
      check: 'configmap-key-set',
      args: { name: 'bao-cao-cau-hinh', namespace: 'van-hanh', key: 'SO_LUONG_WORKER' },
      required: true,
    },
    {
      id: 'co-khoa-mui-gio',
      label: 'ConfigMap `bao-cao-cau-hinh` có khoá `MUI_GIO`',
      check: 'configmap-key-set',
      args: { name: 'bao-cao-cau-hinh', namespace: 'van-hanh', key: 'MUI_GIO' },
      required: true,
    },
    {
      id: 'hai-replica-san-sang',
      label: 'Deployment `bao-cao` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'bao-cao', namespace: 'van-hanh', replicas: 2 },
      required: true,
    },
  ],
  hints: [
    '`kubectl logs` sẽ không giúp gì ở đây — container chưa từng được tạo nên chưa từng có log. Thứ duy nhất biết chuyện gì xảy ra là kubelet, và nó ghi vào Events: `kubectl describe pod -n van-hanh -l app=bao-cao`.',
    'Events chỉ đích danh tên object đang thiếu. Đối chiếu với `kubectl get configmap -n van-hanh` để xác nhận nó thật sự không tồn tại, rồi đọc `envFrom` trong template của Deployment để biết pod đang trông đợi những khoá nào.',
    'Tạo ConfigMap `bao-cao-cau-hinh` trong `van-hanh` với ba khoá `MUC_LOG`, `SO_LUONG_WORKER`, `MUI_GIO` (ví dụ `info`, `4`, `Asia/Ho_Chi_Minh`). Pod đang kẹt sẽ tự thử lại — không cần xoá Deployment.',
  ],
  parMoves: 1,
  teaches: [
    'ConfigMap',
    'CreateContainerConfigError',
    'envFrom',
    'tách cấu hình khỏi image',
    'kubectl describe pod events',
  ],
};
