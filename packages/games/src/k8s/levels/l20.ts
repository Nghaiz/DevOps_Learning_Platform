import type { Level } from '../contract.ts';

/**
 * Level duy nhất trong game mà cluster hoàn toàn KHOẺ và vẫn tính là sự cố.
 * Không pod nào đỏ, không probe nào fail, không có gì để `describe`.
 *
 * Nó ở đây để phản bác trực tiếp cái phản xạ mà 19 level trước vừa dựng lên:
 * "xanh hết nghĩa là ổn". Không có level như thế này thì cả game ngầm dạy rằng
 * an toàn là thứ nhìn thấy được trong `kubectl get pods` — và đó là một mô hình
 * sai mà người học sẽ mang theo ra production.
 *
 * Đích là Deployment chứ không phải Pod, và đó là chuyện đúng-sai chứ không phải
 * sở thích: Kubernetes từ chối mọi thay đổi `volumes`/`envFrom` trên một pod đang
 * chạy (chỉ `image` sửa được). Một level bắt người chơi làm việc đó dạy một quy
 * trình không tồn tại, và nó phạt đúng người chơi đã biết Kubernetes. Đổi sang
 * Deployment giữ nguyên bài học (bí mật đi vào qua volume) mà quy trình thì thật,
 * và nó dùng lại được cơ chế rollout của chương 2.
 */
export const l20: Level = {
  id: 'k8s-20-mat-khau-nam-nham-cho',
  chapter: 4,
  title: 'Mọi thứ xanh, và vẫn phải sửa',
  mission:
    'Chuyển mật khẩu từ ConfigMap sang Secret mount vào `/etc/bi-mat`, xoá ConfigMap cũ, giữ 2 replica.',
  brief: `Đợt rà soát an ninh gắn cờ namespace \`ke-toan\`. Không có sự cố nào: Deployment
\`so-sach\` đủ 2 replica, không pod nào restart, log sạch.

Mật khẩu cơ sở dữ liệu đang nằm trong ConfigMap \`so-sach-bi-mat\`, nơi ai đọc
được ConfigMap cũng đọc được nó.

Giữ nguyên ConfigMap \`so-sach-cau-hinh\`. Bạn sửa template, không sửa pod.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['ke-toan'],
    resources: [
      {
        kind: 'ConfigMap',
        name: 'so-sach-cau-hinh',
        namespace: 'ke-toan',
        spec: {
          data: {
            DB_HOST: 'postgres.ke-toan.svc.cluster.local',
            DB_PORT: '5432',
            DB_TEN: 'so_sach',
          },
        },
      },
      {
        kind: 'ConfigMap',
        name: 'so-sach-bi-mat',
        namespace: 'ke-toan',
        spec: {
          data: {
            DB_MAT_KHAU: 'ke-toan-2024',
          },
        },
      },
      {
        kind: 'Deployment',
        name: 'so-sach',
        namespace: 'ke-toan',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'so-sach' } },
          template: {
            labels: { app: 'so-sach' },
            containers: [
              {
                name: 'so-sach',
                image: 'ghcr.io/dlp/so-sach:1.3.0',
                ports: [{ containerPort: 8080 }],
                envFrom: [
                  { configMapRef: { name: 'so-sach-cau-hinh' } },
                  { configMapRef: { name: 'so-sach-bi-mat' } },
                ],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
      },
    ],
  },
  allowedResources: ['Secret', 'ConfigMap', 'Deployment'],
  objectives: [
    {
      id: 'co-secret',
      label: 'Có Secret `so-sach-db` trong namespace `ke-toan`',
      check: 'resource-exists',
      args: { kind: 'Secret', name: 'so-sach-db', namespace: 'ke-toan' },
      required: true,
    },
    {
      id: 'secret-duoc-mount',
      label: 'Pod của `so-sach` mount Secret `so-sach-db`',
      check: 'secret-mounted',
      args: { namespace: 'ke-toan', labelSelector: 'app=so-sach', secretName: 'so-sach-db' },
      required: true,
    },
    {
      id: 'mount-dung-cho',
      label: 'Secret được mount vào `/etc/bi-mat`',
      check: 'volume-mounted',
      args: { namespace: 'ke-toan', labelSelector: 'app=so-sach', mountPath: '/etc/bi-mat' },
      required: true,
    },
    {
      id: 'xoa-configmap-lo',
      label: 'ConfigMap `so-sach-bi-mat` đã bị xoá',
      check: 'resource-absent',
      args: { kind: 'ConfigMap', name: 'so-sach-bi-mat', namespace: 'ke-toan' },
      required: true,
    },
    {
      id: 'giu-cau-hinh-thuong',
      label: 'ConfigMap `so-sach-cau-hinh` vẫn còn khoá `DB_HOST`',
      check: 'configmap-key-set',
      args: { name: 'so-sach-cau-hinh', namespace: 'ke-toan', key: 'DB_HOST' },
      required: true,
    },
    {
      id: 'dich-vu-van-song',
      label: 'Deployment `so-sach` vẫn đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'so-sach', namespace: 'ke-toan', replicas: 2 },
      required: true,
    },
  ],
  hints: [
    'Không có gì để `describe` ở level này — không pod nào lỗi. Thứ cần đọc là nội dung: `kubectl describe configmap -n ke-toan` và tự hỏi giá trị nào trong đó không nên để ai cũng đọc được.',
    'Secret khai giống ConfigMap, chỉ khác `kind` và thêm trường `type` (dùng `Opaque` cho dữ liệu tự do). Muốn mount thành file thì khai một volume kiểu `secret` trong template của Deployment, rồi `volumeMounts` trong container trỏ tới nó.',
    'Tạo Secret `so-sach-db` với khoá `DB_MAT_KHAU`. Trong template của Deployment: thêm volume `bi-mat` kiểu secret trỏ tới `so-sach-db`, thêm `volumeMounts` với `mountPath: /etc/bi-mat`, bỏ dòng `envFrom` trỏ tới `so-sach-bi-mat`, rồi xoá ConfigMap đó. Giữ nguyên `envFrom` trỏ tới `so-sach-cau-hinh`. Đổi template làm Deployment thay pod bằng thế hệ mới — đó là rollout của chương 2.',
  ],
  parMoves: 4,
  teaches: [
    'Secret',
    'SecretExposed',
    'base64 không phải mã hoá',
    'RBAC theo loại object',
    'mount secret thành file',
    'rò rỉ qua biến môi trường',
    'pod spec bất biến',
    'sửa template thay vì sửa pod',
    'xoay vòng credential',
  ],
  teaching: {
    primer: `Mười chín level vừa rồi dựng một phản xạ: xanh hết thì yên tâm. Level này bác bỏ
nó. Cluster khoẻ, và vẫn có thứ phải sửa.

**ConfigMap không có lớp bảo vệ nào.** Nội dung hiện nguyên văn với ai đọc được nó
và đi vào bản sao lưu etcd ở dạng đọc được.

**Secret không phải mã hoá.** Mặc định nó chỉ được biểu diễn bằng base64, mà ai
cũng giải ngược được. Cái nó mang lại là một **loại object riêng để phân quyền**:
RBAC cấp quyền theo loại, nên quyền đọc Secret siết riêng được.

Cách đưa Secret vào cũng có bậc: bơm thành biến môi trường vẫn rò, mount thành
file thì không.`,
    cheatsheet: [
      {
        command: 'kubectl describe configmap -n ke-toan',
        explain:
          'Đọc nội dung mọi ConfigMap. Không có gì để describe ở đây, chỉ có nội dung để soi.',
      },
      {
        command: 'kind: Secret + type: Opaque',
        explain:
          'Secret khai giống ConfigMap, chỉ khác kind và thêm type. Soạn trong bảng YAML rồi áp dụng.',
      },
      {
        command: 'kubectl describe secret so-sach-db -n ke-toan',
        explain:
          'In nội dung Secret. Giá trị chỉ được base64 hoá và ai cũng giải ngược được, đó chính là điều cần thấy tận mắt.',
      },
      {
        command: 'spec.template.spec.volumes[].secret',
        explain:
          'Khai volume kiểu secret trong TEMPLATE của Deployment, rồi volumeMounts trỏ vào /etc/bi-mat. Sửa thẳng pod đang chạy thì không được: pod spec gần như bất biến.',
      },
      {
        command: 'kubectl get secret -n ke-toan',
        explain: 'Xác nhận Secret đã tồn tại trước khi sửa template trỏ vào nó.',
      },
    ],
    takeaways: [
      'Secret không mã hoá dữ liệu; nó tách quyền đọc thành một loại object riêng để RBAC siết được.',
      'base64 là phép biểu diễn ký tự, ai cũng giải ngược được, nên nhìn không đọc được không có nghĩa là an toàn.',
      'Mount Secret thành file rò ít hơn bơm thành biến môi trường, vì biến hiện trong describe và thừa kế xuống tiến trình con.',
      'Pod spec gần như bất biến, nên cách sửa cấu hình của một workload đang chạy là sửa template rồi để nó thay pod.',
    ],
    proTips: [
      'Đổi chỗ cất không cứu được một bí mật đã lộ. Việc bắt buộc kèm theo là xoay vòng chính giá trị đó, và ai cũng quên bước này.',
      'Ở cụm thật, bật mã hoá etcd khi lưu và cân nhắc một hệ quản lý bí mật bên ngoài. Secret của Kubernetes là ranh giới phân quyền, không phải két sắt.',
    ],
    pitfalls: [
      'Tin rằng base64 đã là bảo vệ, vì nhìn vào chuỗi đó thật sự không đọc được gì. Cảm giác an toàn đó là toàn bộ vấn đề, và một lệnh giải ngược là đủ để xoá nó.',
      'Chuyển sang Secret nhưng vẫn nạp bằng envFrom cho tiện, vì như thế ứng dụng không phải sửa dòng nào. Loại object đã đúng, còn đường rò thì vẫn nguyên: giá trị hiện lại trong describe pod.',
      'Xoá ConfigMap trước khi sửa template. Lệnh xoá chạy trót lọt và trông như đã xong một bước, nhưng template vẫn tham chiếu nó nên thế hệ pod tiếp theo kẹt ở CreateContainerConfigError.',
    ],
  },
};
