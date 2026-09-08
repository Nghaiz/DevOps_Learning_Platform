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
  brief: `Đội frontend báo lỗi: mọi request tới \`http://api.don-hang.svc.cluster.local\`
đều timeout. Bạn kiểm tra và thấy một cảnh khó hiểu — Service \`api\` tồn tại,
có IP đàng hoàng, và cả 4 pod của Deployment \`api\` đều Running, đều Ready, log
sạch, không restart lần nào.

Cả hai đầu đều khoẻ. Vấn đề nằm ở **mối nối giữa chúng**.

Service không giữ danh sách pod bằng tên. Nó chạy một truy vấn theo label, liên
tục, và mọi pod khớp thì được đưa vào danh sách endpoint. Nếu truy vấn đó không
khớp cái gì, Service vẫn tồn tại đầy đủ và vẫn có IP — nó chỉ không có ai ở phía
sau để chuyển request tới. Request đi vào rồi rơi vào khoảng không.

Đây là lý do \`kubectl get svc\` gần như vô dụng khi chẩn đoán: nó cho bạn xem
Service được **khai báo** thế nào, không cho biết Service đang **nối** tới đâu.

**Việc cần làm:** làm cho Service \`api\` trong namespace \`don-hang\` có đủ 4
endpoint, không được đụng tới số replica của Deployment.`,
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
    'Trước khi mở YAML nào, chạy `kubectl get endpoints api -n don-hang`. Nếu cột ENDPOINTS ghi `<none>`, bạn đã biết vấn đề nằm ở mối nối Service–pod chứ không ở pod.',
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
};
