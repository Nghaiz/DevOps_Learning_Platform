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
  title: 'Ghép PVC với đúng PV',
  mission:
    'Làm PVC `anh-san-pham` chuyển sang Bound và đưa pod lên Running với ổ đĩa ở `/du-lieu`.',
  brief: `Pod \`anh-san-pham\` trong namespace \`noi-dung\` kẹt ở \`ContainerCreating\` đã hai
mươi phút. Không lỗi image, không lỗi cấu hình, RESTARTS bằng 0.

Pod này cần lưu trữ bền, nên \`emptyDir\` ở level 5 không dùng được. Nó đang chờ
một PVC chưa \`Bound\`.

Cluster có sẵn hai PV rảnh. Không cái nào khớp.`,
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
    primer: `Lưu trữ tách làm hai object, vì người cấp đĩa và người dùng đĩa thường là hai
người khác nhau.

- **PersistentVolume (PV)** là nguồn cung: một ổ đĩa có thật, phạm vi toàn cluster.
- **PersistentVolumeClaim (PVC)** là nhu cầu: nằm trong namespace, do người viết
  ứng dụng khai.

Kubernetes ghép hai bên. Ghép được thì PVC sang \`Bound\`; chưa ghép được thì nó
nằm \`Pending\`, và pod tham chiếu nó kẹt ở \`ContainerCreating\` mà không báo lỗi gì rõ.

Ghép cần khớp **cả ba** tiêu chí cùng lúc: \`storageClassName\` khớp chuỗi,
\`accessModes\` phải hỗ trợ kiểu PVC xin, và dung lượng PV lớn hơn hoặc bằng mức
xin. Kubernetes không nói tiêu chí nào lệch.`,
    cheatsheet: [
      {
        command: 'kubectl get pvc -n <ns>',
        explain: 'Cột STATUS cho biết Bound hay Pending, và PVC nào đã chiếm PV nào.',
      },
      {
        command: 'kubectl describe pvc <tên> -n <ns>',
        explain: 'Events ghi lý do chưa ghép được — chỗ đầu tiên cần đọc.',
      },
      {
        command: 'kubectl get pv',
        explain: 'PV không thuộc namespace nào; bảng này liệt kê những PV đang có trong cluster.',
      },
      {
        command: 'kubectl get storageclass',
        explain: 'Các lớp lưu trữ đang có; lớp không tồn tại là nguyên nhân rất hay gặp.',
      },
      {
        command: 'kubectl describe pv <tên>',
        explain:
          'Spec đầy đủ của một PV. ReadWriteOnce là một node ghi, ReadOnlyMany là nhiều node chỉ đọc, ReadWriteMany là nhiều node cùng ghi.',
      },
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
