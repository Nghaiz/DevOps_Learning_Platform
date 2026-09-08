import type { Level } from '../contract.ts';

/**
 * Level duy nhất trong game mà cluster hoàn toàn KHOẺ và vẫn tính là sự cố.
 * Không pod nào đỏ, không probe nào fail, không có gì để `describe`.
 *
 * Nó ở đây để phản bác trực tiếp cái phản xạ mà 19 level trước vừa dựng lên:
 * "xanh hết nghĩa là ổn". Không có level như thế này thì cả game ngầm dạy rằng
 * an toàn là thứ nhìn thấy được trong `kubectl get pods` — và đó là một mô hình
 * sai mà người học sẽ mang theo ra production.
 */
export const l20: Level = {
  id: 'k8s-20-mat-khau-nam-nham-cho',
  chapter: 4,
  title: 'Mọi thứ xanh, và vẫn phải sửa',
  brief: `Đợt rà soát an ninh nội bộ gắn cờ namespace \`ke-toan\`. Không có sự cố nào cả:
pod \`so-sach\` Running, không restart, log sạch, dịch vụ phục vụ bình thường.

Vấn đề là mật khẩu cơ sở dữ liệu đang nằm trong ConfigMap \`so-sach-bi-mat\`.

ConfigMap không có bất kỳ lớp bảo vệ nào. Nội dung của nó hiện nguyên văn trong
\`kubectl get -o yaml\`, đi vào mọi bản backup của etcd ở dạng đọc được, và ai có
quyền đọc ConfigMap trong namespace — thường là rất nhiều người — đều đọc được.

**Secret** không phải là mã hoá. Mặc định nó chỉ được mã hoá base64, và base64
không phải bảo mật. Cái Secret thật sự mang lại là **một loại object riêng để
phân quyền**: RBAC cấp quyền theo loại, nên đọc Secret cấp riêng được và thường
bị siết chặt, trong khi đọc ConfigMap thì mở cho cả đội. Đó là khác biệt có thật
và đủ để đáng làm.

Đưa Secret vào bằng biến môi trường vẫn còn rò: giá trị hiện trong
\`kubectl describe pod\` và thừa kế xuống mọi tiến trình con. Mount thành file
thì không.

**Việc cần làm:**

1. Tạo Secret \`so-sach-db\` chứa \`DB_MAT_KHAU\`.
2. Cho pod \`so-sach\` mount Secret đó vào \`/etc/bi-mat\`.
3. Xoá hẳn ConfigMap \`so-sach-bi-mat\`.

Đừng đụng tới ConfigMap \`so-sach-cau-hinh\` — nó chỉ chứa cấu hình thường và
phải giữ nguyên.

Một điều nữa, thật ngoài đời và không kiểm được ở đây: mật khẩu đã lộ thì đổi chỗ
cất không cứu được nó. Nó phải được đổi.`,
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
        kind: 'Pod',
        name: 'so-sach',
        namespace: 'ke-toan',
        spec: {
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
            },
          ],
        },
      },
    ],
  },
  allowedResources: ['Secret', 'ConfigMap', 'Pod'],
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
      label: 'Pod `so-sach` mount Secret `so-sach-db`',
      check: 'secret-mounted',
      args: { podName: 'so-sach', namespace: 'ke-toan', secretName: 'so-sach-db' },
      required: true,
    },
    {
      id: 'mount-dung-cho',
      label: 'Secret được mount vào `/etc/bi-mat`',
      check: 'volume-mounted',
      args: { podName: 'so-sach', namespace: 'ke-toan', mountPath: '/etc/bi-mat' },
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
      label: 'Pod `so-sach` vẫn ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'ke-toan', name: 'so-sach' },
      required: true,
    },
  ],
  hints: [
    'Không có gì để `describe` ở level này — không pod nào lỗi. Thứ cần đọc là nội dung: `kubectl get configmap -n ke-toan -o yaml` và tự hỏi giá trị nào trong đó không nên để ai cũng đọc được.',
    'Secret khai giống ConfigMap, chỉ khác `kind` và thêm trường `type` (dùng `Opaque` cho dữ liệu tự do). Muốn mount thành file thì khai một volume kiểu `secret` ở cấp pod, rồi `volumeMounts` trong container trỏ tới nó.',
    'Tạo Secret `so-sach-db` với khoá `DB_MAT_KHAU`. Trong pod: thêm volume `bi-mat` kiểu secret trỏ tới `so-sach-db`, thêm `volumeMounts` với `mountPath: /etc/bi-mat`, bỏ dòng `envFrom` trỏ tới `so-sach-bi-mat`, rồi xoá ConfigMap đó. Giữ nguyên `envFrom` trỏ tới `so-sach-cau-hinh`.',
  ],
  parMoves: 4,
  teaches: [
    'Secret',
    'SecretExposed',
    'base64 không phải mã hoá',
    'RBAC theo loại object',
    'mount secret thành file',
    'rò rỉ qua biến môi trường',
    'xoay vòng credential',
  ],
};
