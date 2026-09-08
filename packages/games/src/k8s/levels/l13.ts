import type { Level } from '../contract.ts';

/**
 * Nửa đầu của cặp dễ nhầm quan trọng nhất chương 3: endpoint RỖNG.
 * Nửa sau là l14 — endpoint ĐỦ mà vẫn không gọi được.
 *
 * Hai level phải đi liền nhau và triệu chứng bề mặt phải giống hệt nhau
 * ("gọi Service không ai trả lời"), vì giá trị sư phạm nằm đúng ở chỗ người chơi
 * học được rằng một lệnh — `get endpoints` — tách được hai nguyên nhân đó ra.
 */
export const l13: Level = {
  id: 'k8s-13-endpoint-rong',
  chapter: 3,
  title: 'Service có đó, mà gọi không ai trả lời',
  mission:
    'Làm Service `api` trong `don-hang` có đủ 4 endpoint, không đụng số replica của Deployment.',
  brief: `Đội frontend báo mọi request tới \`http://api.don-hang.svc.cluster.local\` đều
timeout. Service \`api\` tồn tại và có IP đàng hoàng; cả 4 pod của Deployment
\`api\` đều Running, đều Ready, log sạch, không restart lần nào.

Cả hai đầu đều khoẻ. Vấn đề nằm ở mối nối giữa chúng.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['don-hang'],
    resources: [
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'don-hang',
        spec: {
          replicas: 4,
          selector: { matchLabels: { app: 'api' } },
          template: {
            labels: { app: 'api', tang: 'backend' },
            containers: [
              {
                name: 'api',
                image: 'ghcr.io/dlp/api:1.5.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'api',
        namespace: 'don-hang',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'api-backend' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
        seededIncident: 'service-selector-lech-label',
      },
    ],
  },
  allowedResources: ['Service'],
  objectives: [
    {
      id: 'du-bon-endpoint',
      label: 'Service `api` có đủ 4 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'api', namespace: 'don-hang', min: 4 },
      required: true,
    },
    {
      id: 'khong-dung-replica',
      label: 'Deployment `api` vẫn giữ nguyên 4 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'api', namespace: 'don-hang', replicas: 4 },
      required: true,
    },
    {
      id: 'het-su-co',
      label: 'Sự cố lệch label đã được xử lý dứt điểm',
      check: 'no-incident-active',
      args: { namespace: 'don-hang', kind: 'service-selector-lech-label' },
      required: false,
    },
  ],
  hints: [
    'Trước khi mở YAML nào, chạy `kubectl describe service api -n don-hang`. Nếu dòng Endpoints ghi `<none>`, bạn đã biết vấn đề nằm ở mối nối Service–pod chứ không ở pod.',
    'So hai thứ với nhau: `kubectl describe svc api -n don-hang` cho bạn Selector, `kubectl get pods -n don-hang --show-labels` cho bạn label thật của pod. Chúng phải khớp từng ký tự — Kubernetes không có so khớp gần đúng.',
    'Selector của Service đang tìm `app=api-backend`, còn pod mang `app=api` và `tang=backend`. Sửa selector của Service về đúng label pod đang có. Đừng đổi label của pod: selector của Deployment là bất biến sau khi tạo, đổi label pod sẽ làm Deployment mất luôn con của nó.',
  ],
  parMoves: 1,
  teaches: [
    'ServiceEndpointMissing',
    'kubectl get endpoints',
    'label mismatch',
    'immutable deployment selector',
    'kubectl describe svc',
  ],
  teaching: {
    primer: `Khi một lời gọi qua Service thất bại, có đúng ba chỗ hỏng được: **phía gọi**,
**phía pod**, và **mối nối giữa chúng**.

Service không giữ danh sách pod bằng tên. Nó chạy một truy vấn theo label, liên
tục, và mọi pod khớp thì được đưa vào **endpoints**. Nếu truy vấn không khớp cái
gì, Service vẫn tồn tại và vẫn có IP: nó chỉ không có ai ở phía sau. Request rơi
vào khoảng không, nên triệu chứng là **timeout** chứ không phải lỗi tức thì.

So label phải khớp **chính xác từng ký tự**: không có so khớp gần đúng.

\`selector\` của Deployment là **bất biến** sau khi tạo, và điều đó quyết định
hướng sửa.`,
    cheatsheet: [
      {
        command: 'kubectl describe service api -n don-hang',
        explain:
          'Lệnh đầu tiên phải chạy. Cột ENDPOINTS ghi <none> là mối nối đứt, không phải pod hỏng.',
      },
      {
        command: 'kubectl describe svc api -n don-hang',
        explain: 'Đọc dòng Selector: đây là truy vấn label mà Service đang chạy.',
      },
      {
        command: 'kubectl get pods -n don-hang --show-labels',
        explain: 'Đọc label thật của pod, để đặt cạnh Selector mà so từng ký tự.',
      },
      {
        command: 'kubectl get pods -n don-hang -l app=api',
        explain: 'Chạy thử chính truy vấn đó. Ra danh sách rỗng là bạn đã tái hiện được lỗi.',
      },
      {
        command: 'kubectl edit svc api -n don-hang',
        explain: 'Sửa selector của Service. Endpoints được tính lại ngay, không cần tạo lại pod.',
      },
    ],
    takeaways: [
      'Endpoints rỗng nghĩa là mối nối Service với pod đứt, và nó loại trừ luôn giả thuyết pod hỏng.',
      'Service khai báo đúng chuẩn vẫn có thể không nối tới ai, nên `kubectl get svc` không đủ để kết luận.',
      'Label so khớp chính xác từng ký tự: Kubernetes không đoán ý và không so gần đúng.',
      'Selector của Deployment bất biến, nên hướng sửa đúng là đổi Service chứ không đổi pod.',
    ],
    proTips: [
      'Chạy thử selector bằng `kubectl get pods -l <selector>` trước khi ghi nó vào Service. Rẻ hơn nhiều so với chẩn đoán ngược lại sau này.',
      'Endpoints rỗng còn một nguyên nhân thứ hai: label đúng nhưng pod chưa Ready. Kiểm cột READY trước khi kết luận là lệch label.',
    ],
    pitfalls: [
      'Sửa label của pod cho khớp Service, vì nghe rất hợp lý rằng chỉ cần hai bên giống nhau. Pod đó lập tức rơi khỏi selector bất biến của Deployment, Deployment tạo pod bù, và bạn vừa tạo ra một sự cố lớn hơn sự cố ban đầu.',
      'Scale Deployment lên vì thấy Service không có endpoint nào. Thêm pod không giúp gì khi không pod nào khớp được truy vấn.',
    ],
  },
};
