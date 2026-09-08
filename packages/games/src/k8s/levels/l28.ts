import type { Level } from '../contract.ts';

/**
 * Mở chương 6 bằng trục thứ hai của trạng thái pod: `ready`. Người chơi đã dùng
 * `phase` suốt 27 level và tới đây gặp một pod `Running` mà vẫn không phục vụ
 * được — không phải vì nó hỏng, mà vì nó tự khai chưa sẵn sàng.
 *
 * Đây cũng là nửa đầu của cặp dễ nhầm khép lại ở l30: endpoint rỗng vì selector
 * (đã học ở l13) và endpoint rỗng vì readiness (học ở đây). Dạy tách ra ở hai
 * level, rồi mới đặt cạnh nhau.
 */
export const l28: Level = {
  id: 'k8s-28-running-nhung-chua-san-sang',
  chapter: 6,
  title: 'Running, và vẫn không ai gọi tới được',
  mission: 'Đưa Service `tim-kiem` về đủ 3 endpoint mà vẫn giữ readiness probe.',
  brief: `Deployment \`tim-kiem\` trong namespace \`noi-dung\` vừa được deploy. Ba pod đều
\`Running\`, RESTARTS bằng 0, log sạch, Events không có sự cố nào.

Và Service \`tim-kiem\` không có endpoint nào.

Bạn đã gặp một endpoint rỗng ở level 13, khi selector tìm nhầm label. Lần này
selector khớp từng ký tự.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['noi-dung'],
    resources: [
      {
        kind: 'Deployment',
        name: 'tim-kiem',
        namespace: 'noi-dung',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'tim-kiem' } },
          template: {
            labels: { app: 'tim-kiem' },
            containers: [
              {
                name: 'tim-kiem',
                image: 'ghcr.io/dlp/tim-kiem:3.1.0',
                ports: [{ containerPort: 8080 }],
                readinessProbe: {
                  httpGet: { path: '/healthz', port: 9090 },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                },
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'readiness-probe-sai-cong',
      },
      {
        kind: 'Service',
        name: 'tim-kiem',
        namespace: 'noi-dung',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'tim-kiem' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
      },
    ],
  },
  allowedResources: ['Deployment', 'Service'],
  objectives: [
    {
      id: 'du-ba-endpoint',
      label: 'Service `tim-kiem` có đủ 3 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'tim-kiem', namespace: 'noi-dung', min: 3 },
      required: true,
    },
    {
      id: 'van-con-readiness',
      label: 'Deployment `tim-kiem` vẫn khai readiness probe',
      check: 'probe-configured',
      args: { kind: 'Deployment', name: 'tim-kiem', namespace: 'noi-dung', probe: 'readiness' },
      required: true,
    },
    {
      id: 'ba-replica-san-sang',
      label: 'Deployment `tim-kiem` có đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'tim-kiem', namespace: 'noi-dung', replicas: 3 },
      required: true,
    },
  ],
  hints: [
    'Cột READY trong `kubectl get pods` là thứ bạn chưa để ý tới. `0/1` nghĩa là container đang chạy nhưng chưa được tính là sẵn sàng — và Service chỉ nhận pod sẵn sàng.',
    '`kubectl describe pod -n noi-dung -l app=tim-kiem` ghi trong Events mỗi lần readiness probe thất bại, kèm cổng và đường dẫn nó đã gọi. Đối chiếu cổng đó với `containerPort` mà container thật sự mở.',
    'Probe đang gọi cổng 9090 trong khi container nghe cổng 8080. Sửa `readinessProbe.httpGet.port` thành 8080. Đừng xoá probe đi cho nhanh — không có nó, pod sẽ vào endpoint ngay cả lúc chưa phục vụ nổi.',
  ],
  parMoves: 1,
  teaches: [
    'readiness probe',
    'ready khác phase',
    'ReadinessProbeFailure',
    'endpoint chỉ nhận pod Ready',
    'httpGet probe',
  ],
  teaching: {
    primer: `Một pod có **hai trục trạng thái độc lập**:

- \`phase\` — pod đang ở giai đoạn nào: Pending, Running, Succeeded, Failed.
- \`ready\` — pod có tự nhận là phục vụ được không. Đây là cột \`READY\` dạng \`1/1\`
  hay \`0/1\`.

Một pod \`Running\` mà \`0/1\` là bình thường về mặt cơ chế: container đang chạy, nó
chỉ chưa sẵn sàng nhận traffic. Và Service **chỉ** đưa pod Ready vào endpoint.

Cái quyết định Ready là **readiness probe**. Không khai thì Kubernetes mặc định
coi container đang chạy là sẵn sàng.

Hệ quả: readiness fail là một sự cố **im lặng**. Không restart, không crash,
không log lỗi, chỉ là traffic lặng lẽ ngừng tới.`,
    cheatsheet: [
      { command: 'kubectl get pods -n <ns>', explain: 'Đọc cột READY chứ không chỉ cột STATUS — Running kèm 0/1 là hai thông tin khác nhau.' },
      { command: 'kubectl describe svc <svc> -n <ns>', explain: 'Dòng Endpoints liệt kê pod mà Service thật sự trỏ tới; <none> khi không pod nào Ready.' },
      { command: 'kubectl describe pod <pod> -n <ns>', explain: 'Events ghi từng lần probe thất bại, kèm cổng và đường dẫn đã gọi.' },
      { command: 'kubectl describe deploy <tên> -n <ns>', explain: 'Đọc khối readinessProbe để so cổng probe với containerPort.' },
    ],
    takeaways: [
      'phase và ready là hai trục độc lập; Running không có nghĩa là phục vụ được.',
      'Readiness probe fail gỡ pod khỏi endpoint nhưng không restart container — một sự cố im lặng.',
      'Service chỉ đưa pod Ready vào endpoint, nên probe sai làm Service rỗng dù pod hoàn toàn khoẻ.',
      'Cổng trong probe phải khớp cổng container thật sự mở, không phải cổng của Service.',
    ],
    pitfalls: [
      'Xoá readiness probe để pod thành Ready ngay. Endpoint đầy lại trong một giây nên trông như đã sửa, nhưng bạn vừa bỏ đúng cơ chế ngăn Service gửi traffic vào pod chưa khởi động xong — lỗi sẽ quay lại ở lần rollout sau dưới dạng vài trăm request lỗi.',
      'Kết luận ngay là lỗi selector vì đã gặp ở level 13. Endpoint rỗng có ít nhất hai nguyên nhân, và cột READY là thứ tách chúng ra.',
    ],
    proTips: [
      'Ba loại probe hỏi ba câu khác nhau. readiness hỏi "gửi traffic cho tôi được chưa?" và fail thì pod bị gỡ khỏi endpoint, container KHÔNG restart. liveness hỏi "tôi còn sống không?" và fail thì kubelet giết rồi dựng lại. startup hỏi "tôi khởi động xong chưa?" và trong lúc nó chưa xong, hai probe kia bị tạm hoãn.',
    ],
  },
};
