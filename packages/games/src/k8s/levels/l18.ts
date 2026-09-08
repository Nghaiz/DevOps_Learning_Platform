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
  teaching: {
    primer: `Kubelet dựng một container qua ba bước, và pod hỏng ở bước nào thì mang trạng
thái của bước đó. Đây là bảng phân biệt bạn nên nhớ cho cả phần còn lại:

- Hỏng khi **kéo image**: \`ImagePullBackOff\`, chưa có container, RESTARTS đứng ở 0.
- Hỏng khi **gom cấu hình**: \`CreateContainerConfigError\`, image đã về máy,
  container vẫn chưa được tạo, RESTARTS cũng đứng ở 0.
- Hỏng khi **chạy**: \`CrashLoopBackOff\`, container đã tồn tại và đã chết,
  RESTARTS tăng dần.

Hai trạng thái đầu giống nhau ở một điểm quan trọng: **không có log để đọc**, vì
không có container nào từng chạy. Thứ phân biệt chúng, và thứ nói ra nguyên nhân,
đều nằm trong Events của pod. Cột RESTARTS tách nhóm này khỏi nhóm thứ ba.

Level này là bước hai. Kubelet kéo image xong, quay sang gom vật liệu cấu hình
để bơm vào container, và thiếu mất một thứ.

Vì sao cấu hình không nằm trong image: cùng một image phải chạy được ở mọi môi
trường, khác nhau chỉ ở các giá trị bơm vào lúc chạy. **ConfigMap** giữ đúng
những giá trị đó, dạng khoá và giá trị, đưa vào container qua biến môi trường
(\`envFrom\`) hoặc mount thành file.

Nhìn vào đâu: Events của pod, chúng gọi đích danh tên object đang thiếu.`,
    cheatsheet: [
      {
        command: 'kubectl describe pod -n van-hanh -l app=bao-cao',
        explain: 'Events gọi tên object đang thiếu. Không có container thì đây là nguồn tin duy nhất.',
      },
      {
        command: 'kubectl get configmap -n van-hanh',
        explain: 'Xác nhận ConfigMap thật sự không tồn tại, thay vì tin vào Events một mình.',
      },
      {
        command: 'kubectl get deploy bao-cao -n van-hanh -o yaml',
        explain: 'Đọc envFrom trong template để biết pod đang trông đợi những khoá nào.',
      },
      {
        command: 'kubectl create configmap bao-cao-cau-hinh --from-literal=MUC_LOG=info -n van-hanh',
        explain: 'Tạo ConfigMap nhanh từ dòng lệnh; lặp lại --from-literal cho từng khoá.',
      },
      {
        command: 'kubectl get events -n van-hanh --sort-by=.lastTimestamp',
        explain: 'Xem mọi sự kiện theo thời gian khi chưa biết pod nào đang kêu.',
      },
    ],
    takeaways: [
      'RESTARTS bằng 0 kèm trạng thái lỗi nghĩa là container chưa bao giờ được tạo, nên đừng đi tìm log.',
      'CreateContainerConfigError nằm giữa hai lỗi đã học: image đã về, container thì chưa dựng.',
      'Cùng một image chạy được ở mọi môi trường, khác biệt nằm ở cấu hình bơm vào lúc chạy.',
      'Pod kẹt vì thiếu ConfigMap sẽ tự thử lại khi thứ thiếu xuất hiện, không cần tạo lại Deployment.',
    ],
    proTips: [
      'Ba trạng thái lỗi hay bị gộp thành "pod không lên" thật ra kể ba câu chuyện khác nhau. Đọc đúng tên trạng thái là đã đi được nửa đường.',
      'Ở cụm thật, tạo ConfigMap trước rồi mới apply Deployment. Thứ tự đó tránh được cả một cửa sổ pod kẹt.',
    ],
    pitfalls: [
      'Chạy `kubectl logs` rồi thấy trống và nghi ứng dụng lỗi im lặng. Không có container thì không có log, và sự trống rỗng đó là một dữ kiện chứ không phải một bí ẩn.',
      'Xoá Deployment rồi tạo lại để "làm mới". Cách này chữa được vài lỗi khác nên nó là phản xạ dễ hiểu, nhưng ở đây pod mới cũng thiếu đúng ConfigMap đó và kẹt y hệt.',
    ],
  },
};
