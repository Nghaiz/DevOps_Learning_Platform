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
  title: 'Cấp RBAC vừa đủ, không dư một quyền',
  mission: 'Cấp cho `bot-giam-sat` đúng quyền get và list pod trong `van-hanh`, không hơn.',
  brief: `Bảng điều khiển \`bang-dieu-khien\` cần liệt kê pod trong namespace \`van-hanh\`,
nhưng mọi lời gọi tới API server đều trả về **403 Forbidden**.

Pod chạy dưới ServiceAccount \`bot-giam-sat\`. ServiceAccount tồn tại, pod gắn đúng
nó, chưa ai cấp cho nó quyền gì.

Namespace này còn có Secret \`khoa-ky-so\`. Quyền thừa nào cũng có giá.`,
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
      args: {
        serviceAccount: 'bot-giam-sat',
        namespace: 'van-hanh',
        verb: 'list',
        resource: 'pods',
      },
      required: true,
    },
    {
      id: 'doc-duoc-mot-pod',
      label: '`bot-giam-sat` đọc được chi tiết một pod',
      check: 'rbac-allows',
      args: {
        serviceAccount: 'bot-giam-sat',
        namespace: 'van-hanh',
        verb: 'get',
        resource: 'pods',
      },
      required: true,
    },
    {
      id: 'khong-doc-duoc-secret',
      label: '`bot-giam-sat` KHÔNG đọc được Secret',
      check: 'rbac-denies',
      args: {
        serviceAccount: 'bot-giam-sat',
        namespace: 'van-hanh',
        verb: 'get',
        resource: 'secrets',
      },
      required: true,
    },
    {
      id: 'khong-xoa-duoc-pod',
      label: '`bot-giam-sat` KHÔNG xoá được pod',
      check: 'rbac-denies',
      args: {
        serviceAccount: 'bot-giam-sat',
        namespace: 'van-hanh',
        verb: 'delete',
        resource: 'pods',
      },
      required: true,
    },
  ],
  hints: [
    'Bắt đầu bằng câu hỏi "ai đang thiếu gì". `kubectl get rolebinding -n van-hanh` cho thấy chưa có gì được nối tới ai, và đó đúng là lý do API server trả 403.',
    'Cấp quyền cần HAI object, không phải một. Role định nghĩa "được làm gì với cái gì" (apiGroups, resources, verbs). RoleBinding nối Role đó tới một chủ thể cụ thể. Có Role mà không có RoleBinding thì không ai được gì.',
    'Tạo Role trong `van-hanh` với đúng một luật: `apiGroups: [""]`, `resources: ["pods"]`, `verbs: ["get", "list"]`. Rồi tạo RoleBinding nối Role đó tới subject kiểu ServiceAccount tên `bot-giam-sat`. Đừng thêm `"*"` vào verbs hay resources — hai mục tiêu cấm sẽ bắt được ngay.',
  ],
  parMoves: 2,
  teaches: [
    'RBAC',
    'ServiceAccount',
    'Role và RoleBinding',
    'quyền tối thiểu',
    'Role khác ClusterRole',
    'apiGroups resources verbs',
    'UnauthorizedAccess',
  ],
  teaching: {
    primer: `RBAC trả lời một câu hỏi duy nhất: **ai được làm gì, với cái gì, ở đâu**. Nó tách
thành hai object.

- **Role** — định nghĩa quyền, phạm vi một namespace. Mỗi luật gồm \`apiGroups\`
  (chuỗi rỗng là nhóm core: pod, service, configmap, secret), \`resources\` (loại
  object, viết số nhiều), \`verbs\` (\`get\`, \`list\`, \`create\`, \`delete\`...).
- **RoleBinding** — nối một Role tới chủ thể: ServiceAccount, User, hoặc Group.

Hai điều cần nhớ:

1. **RBAC chỉ cộng, không trừ.** Không có luật từ chối, nên siết quyền nghĩa là
   **gỡ binding**.
2. **Mặc định là không có gì.** ServiceAccount chưa được gán gì thì không làm được
   gì, và API server trả 403.`,
    cheatsheet: [
      {
        command: 'rules[].verbs: ["get", "list"]',
        explain:
          'Đúng hai verb mà level này cần. Dấu sao gồm cả delete và create, và nó sẽ làm bạn trượt vế cấm.',
      },
      {
        command: 'subjects[].kind: ServiceAccount',
        explain: 'RoleBinding nối Role tới chủ thể. Thiếu binding thì Role không cấp quyền cho ai.',
      },
      {
        command: 'kubectl get rolebindings -n <ns>',
        explain: 'Xem Role nào đang được nối tới ai trong namespace.',
      },
      {
        command: 'kubectl describe role <tên> -n <ns>',
        explain: 'Spec của Role: apiGroups, resources, verbs.',
      },
      {
        command: 'kubectl describe rolebinding <tên> -n <ns>',
        explain: 'Đọc roleRef và subjects: Role nào đang nối tới chủ thể nào.',
      },
    ],
    takeaways: [
      'Role định nghĩa quyền, RoleBinding nối quyền tới chủ thể — thiếu một trong hai thì không có quyền nào.',
      'RBAC chỉ cộng quyền, không có luật từ chối; siết quyền là gỡ binding.',
      'Mặc định một ServiceAccount không có quyền gì và API server trả 403.',
      'Muốn biết một chủ thể làm được gì thì đọc ngược từ RoleBinding tới Role, vì quyền là hợp của mọi Role được gán.',
    ],
    pitfalls: [
      'Gán `cluster-admin` cho xong. Nó sửa 403 trong một lệnh và trang hiển thị chạy ngay, nên rất khó cưỡng — nhưng một bảng điều khiển chỉ cần đọc danh sách pod giờ đọc được mọi Secret trong cluster, và không ai quay lại thu hẹp nó.',
      'Dùng `verbs: ["*"]` vì "chỉ đọc thôi mà". Dấu sao gồm cả `delete` và `create`.',
      'Tạo Role rồi dừng lại. Không có RoleBinding thì Role chỉ là một mẩu cấu hình không nối với ai, và 403 vẫn nguyên.',
    ],
    proTips: [
      'Phiên bản phạm vi toàn cluster là ClusterRole và ClusterRoleBinding, dùng cho tài nguyên không thuộc namespace nào (node, PersistentVolume) hoặc khi cần quyền ở mọi namespace.',
    ],
  },
};
