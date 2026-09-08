import type { Level } from '../contract.ts';

/**
 * PVC Pending. Điểm dạy nằm ở chỗ triệu chứng hiện ở POD ("ContainerCreating
 * mãi") còn nguyên nhân nằm ở một object khác hẳn mà pod chỉ nhắc tên.
 *
 * Ba tiêu chí khớp PV–PVC (storageClassName, accessModes, dung lượng) cố ý lệch
 * ĐÚNG MỘT ở mỗi PV được gieo, để người chơi phải kiểm cả ba thay vì thấy sai
 * một chỗ rồi kết luận.
 */
export const l21: Level = {
  id: 'k8s-21-pvc-mai-khong-bound',
  chapter: 4,
  title: 'Pod chờ một ổ đĩa không bao giờ tới',
  brief: `Pod \`anh-san-pham\` trong namespace \`noi-dung\` kẹt ở \`ContainerCreating\` đã
hai mươi phút. Không có lỗi image, không có lỗi cấu hình, RESTARTS bằng 0.

Pod này cần lưu trữ bền — dữ liệu phải sống sót qua việc pod bị xoá đi tạo lại,
nên \`emptyDir\` ở level 5 không dùng được. Kubernetes tách nhu cầu đó làm hai
object:

- **PersistentVolume (PV)** là một ổ đĩa có thật, do quản trị viên cấp.
- **PersistentVolumeClaim (PVC)** là **yêu cầu** của ứng dụng: tôi cần chừng này
  dung lượng, với kiểu truy cập này, thuộc lớp lưu trữ này.

Kubernetes ghép hai bên lại. Chưa ghép được thì PVC nằm ở \`Pending\`, và pod
tham chiếu nó không thể xếp lịch — vì không có ổ đĩa thì không mount được gì.

Việc ghép đòi khớp **ba** tiêu chí cùng lúc: lớp lưu trữ (\`storageClassName\`),
kiểu truy cập (\`accessModes\`), và dung lượng (PV phải lớn hơn hoặc bằng mức PVC
xin). Sai một tiêu chí là không ghép, và Kubernetes không nói giúp bạn sai tiêu
chí nào — nó chỉ nói "chưa tìm được cái nào khớp".

Trong cluster đang có sẵn hai PV chưa ai dùng. Không cái nào khớp.

**Việc cần làm:** làm PVC \`anh-san-pham\` chuyển sang \`Bound\` và đưa pod
\`anh-san-pham\` tới Running với ổ đĩa mount vào \`/du-lieu\`.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['noi-dung'],
    resources: [
      {
        kind: 'PersistentVolume',
        name: 'pv-nhanh-5g',
        namespace: '',
        spec: {
          capacity: { storage: '5Gi' },
          accessModes: ['ReadWriteOnce'],
          storageClassName: 'nhanh',
        },
      },
      {
        kind: 'PersistentVolume',
        name: 'pv-thuong-50g',
        namespace: '',
        spec: {
          capacity: { storage: '50Gi' },
          accessModes: ['ReadOnlyMany'],
          storageClassName: 'thuong',
        },
      },
      {
        kind: 'PersistentVolumeClaim',
        name: 'anh-san-pham',
        namespace: 'noi-dung',
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: 'thuong',
          resources: { requests: { storage: '20Gi' } },
        },
        seededIncident: 'pvc-khong-co-pv-khop',
      },
      {
        kind: 'Pod',
        name: 'anh-san-pham',
        namespace: 'noi-dung',
        spec: {
          labels: { app: 'anh-san-pham' },
          containers: [
            {
              name: 'anh-san-pham',
              image: 'ghcr.io/dlp/anh-san-pham:1.0.4',
              ports: [{ containerPort: 8080 }],
              volumeMounts: [{ name: 'du-lieu', mountPath: '/du-lieu' }],
            },
          ],
          volumes: [{ name: 'du-lieu', persistentVolumeClaim: { claimName: 'anh-san-pham' } }],
        },
      },
    ],
  },
  allowedResources: ['PersistentVolume', 'PersistentVolumeClaim', 'Pod'],
  objectives: [
    {
      id: 'pvc-bound',
      label: 'PVC `anh-san-pham` ở trạng thái Bound',
      check: 'pvc-bound',
      args: { name: 'anh-san-pham', namespace: 'noi-dung' },
      required: true,
    },
    {
      id: 'pod-chay',
      label: 'Pod `anh-san-pham` ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'noi-dung', name: 'anh-san-pham' },
      required: true,
    },
    {
      id: 'mount-dung-cho',
      label: 'Ổ đĩa được mount vào `/du-lieu`',
      check: 'volume-mounted',
      args: { podName: 'anh-san-pham', namespace: 'noi-dung', mountPath: '/du-lieu' },
      required: true,
    },
  ],
  hints: [
    'Pod kẹt ở ContainerCreating gần như luôn là chuyện của volume hoặc của một object mà pod nhắc tên. Bắt đầu ở chỗ nguyên nhân, không phải chỗ triệu chứng: `kubectl get pvc -n noi-dung`.',
    '`kubectl describe pvc anh-san-pham -n noi-dung` ghi lý do trong Events. `kubectl get pv` liệt kê hai PV đang rảnh kèm cả ba thuộc tính. Đặt yêu cầu của PVC cạnh từng PV và so đủ ba: lớp lưu trữ, kiểu truy cập, dung lượng.',
    'PVC xin `thuong` + `ReadWriteOnce` + 20Gi. `pv-nhanh-5g` sai lớp và quá nhỏ; `pv-thuong-50g` đúng lớp, đủ dung lượng, nhưng chỉ cho `ReadOnlyMany`. Cách gọn nhất là tạo thêm một PV mới khớp cả ba — ví dụ 20Gi, `ReadWriteOnce`, lớp `thuong`.',
  ],
  parMoves: 2,
  teaches: [
    'PersistentVolume',
    'PersistentVolumeClaim',
    'PVCPending',
    'accessModes',
    'storageClassName',
    'binding PV-PVC',
    'ContainerCreating',
  ],
  teaching: {
    primer: `Lưu trữ trong Kubernetes tách làm hai object, và việc tách đó là có lý do: người
cấp đĩa và người dùng đĩa thường là hai người khác nhau.

- **PersistentVolume (PV)** — nguồn cung. Một ổ đĩa có thật, phạm vi toàn
  cluster, không thuộc namespace nào.
- **PersistentVolumeClaim (PVC)** — nhu cầu. Nằm trong namespace, do người viết
  ứng dụng khai: tôi cần bao nhiêu, kiểu truy cập nào, lớp lưu trữ nào.

Kubernetes ghép hai bên. Ghép được thì PVC chuyển sang \`Bound\`; chưa ghép được
thì nó nằm \`Pending\`, và pod tham chiếu nó không xếp lịch nổi — pod sẽ kẹt ở
\`ContainerCreating\` hoặc \`Pending\` chứ không báo lỗi gì rõ ràng.

Việc ghép cần khớp **cả ba** tiêu chí:

1. \`storageClassName\` — khớp chuỗi, không có suy diễn gần đúng.
2. \`accessModes\` — PV phải hỗ trợ kiểu PVC xin. \`ReadWriteOnce\` là một node
   ghi; \`ReadOnlyMany\` là nhiều node chỉ đọc; \`ReadWriteMany\` là nhiều node
   cùng ghi.
3. Dung lượng — PV phải **lớn hơn hoặc bằng** mức PVC xin.

Kubernetes không nói giúp bạn tiêu chí nào lệch. Nó chỉ nói chưa tìm được cái nào
khớp, nên bạn phải tự so đủ ba.`,
    cheatsheet: [
      { command: 'kubectl get pvc -n <ns>', explain: 'Cột STATUS cho biết Bound hay Pending, và PVC nào đã chiếm PV nào.' },
      { command: 'kubectl describe pvc <tên> -n <ns>', explain: 'Events ghi lý do chưa ghép được — chỗ đầu tiên cần đọc.' },
      { command: 'kubectl get pv', explain: 'PV không thuộc namespace nào; xem dung lượng, accessMode, lớp và trạng thái Available hay Bound.' },
      { command: 'kubectl get storageclass', explain: 'Các lớp lưu trữ đang có; lớp không tồn tại là nguyên nhân rất hay gặp.' },
    ],
    takeaways: [
      'PV là nguồn cung ở phạm vi cluster; PVC là nhu cầu trong một namespace.',
      'Ghép được cần khớp đồng thời ba tiêu chí: lớp lưu trữ, kiểu truy cập, và dung lượng.',
      'PVC Pending làm pod kẹt, nên triệu chứng hiện ở pod trong khi nguyên nhân nằm ở PVC.',
      'Dung lượng chỉ cần PV lớn hơn hoặc bằng — nhưng lớp và accessMode thì phải khớp chính xác.',
    ],
    pitfalls: [
      'Thấy một PV đủ lớn rồi kết luận nó khớp. Dung lượng là tiêu chí dễ nhìn nhất nên hay được kiểm một mình, trong khi lớp và accessMode mới là chỗ hay lệch.',
      'Đi tìm lỗi trong pod. Pod hoàn toàn đúng; nó chỉ đang chờ một thứ chưa có.',
    ],
  },
};
