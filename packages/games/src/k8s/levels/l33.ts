import type { Level } from '../contract.ts';

/**
 * RBAC với hai mục tiêu NGƯỢC CHIỀU: phải cho phép một việc, và phải tiếp tục
 * cấm một việc khác. Đây là cách duy nhất kiểm được "quyền tối thiểu" bằng dữ
 * liệu — chỉ kiểm vế cho phép thì gán cluster-admin cũng qua, và đó đúng là cách
 * sai phổ biến nhất ngoài đời.
 *
 * Namespace có sẵn một Secret để vế cấm có nghĩa thật: nếu không có gì nhạy cảm
 * trong namespace thì "không đọc được Secret" chỉ là một dòng chữ.
 */
export const l33: Level = {
  id: 'k8s-33-quyen-vua-du-khong-hon',
  chapter: 6,
  title: 'Vừa đủ quyền, và không hơn một chút nào',
  brief: `Bảng điều khiển nội bộ \`bang-dieu-khien\` cần liệt kê pod trong namespace
\`van-hanh\` để hiển thị trạng thái. Nó đang chạy nhưng mọi lời gọi tới API server
đều trả về **403 Forbidden**, và trang hiển thị trống.

Pod này chạy dưới ServiceAccount \`bot-giam-sat\`. ServiceAccount tồn tại, pod
gắn đúng nó, nhưng chưa ai cấp cho nó quyền gì.

Cách sửa nhanh nhất là gán cho nó \`cluster-admin\`. Nó chạy ngay, mất đúng một
lệnh, và nó là lý do phần lớn các cluster ngoài đời có vài ServiceAccount toàn
quyền mà không ai nhớ vì sao. Trong namespace này còn có Secret
\`khoa-ky-so\` — bất kỳ quyền thừa nào cũng nghĩa là một bảng điều khiển chỉ cần
đọc danh sách pod lại đọc được cả khoá ký số.

**Việc cần làm:** cấp cho \`bot-giam-sat\` đúng quyền \`get\` và \`list\` trên
pod trong \`van-hanh\`, và **không** cấp thêm gì. Cụ thể, sau khi bạn xong nó vẫn
phải **không** đọc được Secret và **không** xoá được pod.

Hai vế đó được kiểm riêng, nên một quyền quá rộng sẽ làm bạn trượt vế thứ hai
ngay cả khi trang hiển thị đã chạy.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['van-hanh'],
    resources: [
      {
        kind: 'ServiceAccount',
        name: 'bot-giam-sat',
        namespace: 'van-hanh',
        spec: {},
      },
      {
        kind: 'Secret',
        name: 'khoa-ky-so',
        namespace: 'van-hanh',
        spec: {
          type: 'Opaque',
          data: { KHOA_RIENG: 'noi-dung-nhay-cam' },
        },
      },
      {
        kind: 'Deployment',
        name: 'bang-dieu-khien',
        namespace: 'van-hanh',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'bang-dieu-khien' } },
          template: {
            labels: { app: 'bang-dieu-khien' },
            serviceAccountName: 'bot-giam-sat',
            containers: [
              {
                name: 'bang-dieu-khien',
                image: 'ghcr.io/dlp/bang-dieu-khien:2.3.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '300m', memory: '256Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'rbac-thieu-quyen',
      },
    ],
  },
  allowedResources: ['ServiceAccount', 'Role', 'RoleBinding'],
  objectives: [
    {
      id: 'liet-ke-duoc-pod',
      label: '`bot-giam-sat` liệt kê được pod trong `van-hanh`',
      check: 'rbac-allows',
      args: { serviceAccount: 'bot-giam-sat', namespace: 'van-hanh', verb: 'list', resource: 'pods' },
      required: true,
    },
    {
      id: 'doc-duoc-mot-pod',
      label: '`bot-giam-sat` đọc được chi tiết một pod',
      check: 'rbac-allows',
      args: { serviceAccount: 'bot-giam-sat', namespace: 'van-hanh', verb: 'get', resource: 'pods' },
      required: true,
    },
    {
      id: 'khong-doc-duoc-secret',
      label: '`bot-giam-sat` KHÔNG đọc được Secret',
      check: 'rbac-denies',
      args: { serviceAccount: 'bot-giam-sat', namespace: 'van-hanh', verb: 'get', resource: 'secrets' },
      required: true,
    },
    {
      id: 'khong-xoa-duoc-pod',
      label: '`bot-giam-sat` KHÔNG xoá được pod',
      check: 'rbac-denies',
      args: { serviceAccount: 'bot-giam-sat', namespace: 'van-hanh', verb: 'delete', resource: 'pods' },
      required: true,
    },
  ],
  hints: [
    'Câu hỏi "ServiceAccount này làm được gì" có một lệnh trả lời thẳng: `kubectl auth can-i --list --as=system:serviceaccount:van-hanh:bot-giam-sat -n van-hanh`. Chạy nó trước khi sửa và sau khi sửa — đó cũng là cách bạn tự kiểm vế cấm.',
    'Cấp quyền cần HAI object, không phải một. Role định nghĩa "được làm gì với cái gì" (apiGroups, resources, verbs). RoleBinding nối Role đó tới một chủ thể cụ thể. Có Role mà không có RoleBinding thì không ai được gì.',
    'Tạo Role trong `van-hanh` với đúng một luật: `apiGroups: [""]`, `resources: ["pods"]`, `verbs: ["get", "list"]`. Rồi tạo RoleBinding nối Role đó tới subject kiểu ServiceAccount tên `bot-giam-sat`. Đừng thêm `"*"` vào verbs hay resources — hai mục tiêu cấm sẽ bắt được ngay.',
  ],
  parMoves: 2,
  teaches: [
    'RBAC',
    'ServiceAccount',
    'Role và RoleBinding',
    'quyền tối thiểu',
    'kubectl auth can-i',
    'apiGroups resources verbs',
    'UnauthorizedAccess',
  ],
  teaching: {
    primer: `RBAC trả lời một câu hỏi duy nhất: **ai được làm gì, với cái gì, ở đâu**. Nó
tách thành hai object, và tách như vậy là để một bộ quyền dùng lại được cho nhiều
chủ thể.

- **Role** — định nghĩa quyền, phạm vi một namespace. Mỗi luật gồm ba phần:
  \`apiGroups\` (nhóm API; chuỗi rỗng \`""\` là nhóm core, nơi có pod, service,
  configmap, secret), \`resources\` (loại object, viết số nhiều), \`verbs\`
  (\`get\`, \`list\`, \`watch\`, \`create\`, \`update\`, \`patch\`, \`delete\`).
- **RoleBinding** — nối một Role tới chủ thể: ServiceAccount, User, hoặc Group.

Phiên bản phạm vi toàn cluster là **ClusterRole** và **ClusterRoleBinding**, dùng
cho tài nguyên không thuộc namespace nào (node, PV) hoặc khi cần quyền ở mọi
namespace.

Hai điều cần nhớ:

1. **RBAC chỉ cộng, không trừ.** Không có luật từ chối. Quyền của một chủ thể là
   hợp của mọi Role được gán cho nó — nên siết quyền nghĩa là **gỡ binding**,
   không phải thêm một luật cấm.
2. **Mặc định là không có gì.** Một ServiceAccount chưa được gán gì thì không làm
   được gì, và API server trả 403.

Lệnh đáng nhớ nhất của cả chủ đề:

    kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa> -n <ns>

Nó trả lời chính xác chủ thể đó làm được gì, thay vì bắt bạn đọc ngược từ đống
Role và binding.`,
    cheatsheet: [
      { command: 'kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa> -n <ns>', explain: 'Liệt kê đúng những gì chủ thể đó làm được — dùng cả trước lẫn sau khi sửa.' },
      { command: 'kubectl auth can-i get secrets --as=system:serviceaccount:<ns>:<sa> -n <ns>', explain: 'Hỏi một quyền cụ thể; trả lời yes/no. Cách kiểm vế CẤM.' },
      { command: 'kubectl get rolebindings -n <ns>', explain: 'Xem Role nào đang được nối tới ai trong namespace.' },
      { command: 'kubectl describe role <tên> -n <ns>', explain: 'Bảng apiGroups / resources / verbs của một Role.' },
      { command: 'kubectl get pod <pod> -n <ns> -o jsonpath="{.spec.serviceAccountName}"', explain: 'Xác nhận pod thật sự chạy dưới ServiceAccount bạn nghĩ.' },
    ],
    takeaways: [
      'Role định nghĩa quyền, RoleBinding nối quyền tới chủ thể — thiếu một trong hai thì không có quyền nào.',
      'RBAC chỉ cộng quyền, không có luật từ chối; siết quyền là gỡ binding.',
      'Mặc định một ServiceAccount không có quyền gì và API server trả 403.',
      '`kubectl auth can-i --list --as=...` trả lời trực tiếp câu hỏi "chủ thể này làm được gì".',
    ],
    pitfalls: [
      'Gán `cluster-admin` cho xong. Nó sửa 403 trong một lệnh và trang hiển thị chạy ngay, nên rất khó cưỡng — nhưng một bảng điều khiển chỉ cần đọc danh sách pod giờ đọc được mọi Secret trong cluster, và không ai quay lại thu hẹp nó.',
      'Dùng `verbs: ["*"]` vì "chỉ đọc thôi mà". Dấu sao gồm cả `delete` và `create`.',
      'Tạo Role rồi dừng lại. Không có RoleBinding thì Role chỉ là một mẩu cấu hình không nối với ai, và 403 vẫn nguyên.',
    ],
  },
};
