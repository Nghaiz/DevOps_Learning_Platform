import type { Level } from '../contract.ts';

/**
 * Đóng chương 3 bằng sự cố duy nhất trong chương mà triệu chứng ĐẾN TỪ NGOÀI
 * cluster: 404 và 502. Bên trong mọi thứ xanh.
 *
 * Hai lỗi cùng lúc là chủ ý, không phải để làm khó: 404 và 502 là hai tầng khác
 * nhau (định tuyến sai và backend sai) và người chơi phải tách chúng ra. Sửa một
 * cái sẽ làm lỗi kia lộ ra rõ hơn chứ không làm level qua được.
 */
export const l17: Level = {
  id: 'k8s-17-ingress-tra-404',
  chapter: 3,
  title: 'Bên trong xanh hết, bên ngoài trả lỗi',
  mission:
    'Sửa Ingress `thu-vien` để `/muon-sach` tới Service `muon-sach` và `/api` tới Service `api`.',
  brief: `Trang \`https://thu-vien.dlp.vn\` vừa lên và người dùng báo hai lỗi khác nhau:
vào \`/\` thì ra trang chủ bình thường, vào \`/muon-sach\` thì nhận **404**, vào
\`/api\` thì nhận **502 Bad Gateway**.

Từ bên trong cluster, cả ba Service đều gọi được, đều có endpoint đầy đủ, mọi pod
đều Ready.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['thu-vien'],
    resources: [
      {
        kind: 'Deployment',
        name: 'muon-sach',
        namespace: 'thu-vien',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'muon-sach' } },
          template: {
            labels: { app: 'muon-sach' },
            containers: [
              {
                name: 'muon-sach',
                image: 'ghcr.io/dlp/muon-sach:1.1.0',
                ports: [{ containerPort: 3000 }],
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'muon-sach',
        namespace: 'thu-vien',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'muon-sach' },
          ports: [{ port: 8000, targetPort: 3000, protocol: 'TCP' }],
        },
      },
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'thu-vien',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'api' } },
          template: {
            labels: { app: 'api' },
            containers: [
              { name: 'api', image: 'ghcr.io/dlp/api:1.5.0', ports: [{ containerPort: 8080 }] },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'api',
        namespace: 'thu-vien',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'api' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
      },
      {
        kind: 'Ingress',
        name: 'thu-vien',
        namespace: 'thu-vien',
        spec: {
          rules: [
            {
              host: 'thu-vien.dlp.vn',
              paths: [
                {
                  path: '/tra-sach',
                  pathType: 'Prefix',
                  serviceName: 'muon-sach',
                  servicePort: 8000,
                },
                { path: '/api', pathType: 'Prefix', serviceName: 'api', servicePort: 8080 },
              ],
            },
          ],
        },
        seededIncident: 'ingress-sai-path',
      },
    ],
  },
  allowedResources: ['Ingress'],
  objectives: [
    {
      id: 'muon-sach-dung-duong',
      label: 'Đường dẫn `/muon-sach` đi tới Service `muon-sach`',
      check: 'ingress-routes',
      args: {
        name: 'thu-vien',
        namespace: 'thu-vien',
        path: '/muon-sach',
        serviceName: 'muon-sach',
      },
      required: true,
    },
    {
      id: 'api-dung-cong',
      label: 'Đường dẫn `/api` đi tới Service `api` ở đúng cổng của Service',
      check: 'ingress-routes',
      args: { name: 'thu-vien', namespace: 'thu-vien', path: '/api', serviceName: 'api' },
      required: true,
    },
    {
      id: 'het-su-co-ingress',
      label: 'Không còn sự cố định tuyến nào trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'thu-vien', kind: 'ingress-sai-path' },
      required: true,
    },
  ],
  hints: [
    '404 và 502 không cùng một lỗi, đừng đi tìm một nguyên nhân chung. Bắt đầu bằng `kubectl describe ingress thu-vien -n thu-vien` và đọc bảng luật: đường dẫn nào đang được khai, và mỗi đường trỏ tới đâu.',
    'Với 404: so danh sách path trong Ingress với đường dẫn người dùng thật sự gõ. Với 502: cổng ghi trong backend của Ingress phải là cổng của SERVICE (`port`), không phải cổng của container (`targetPort`) — đối chiếu với `kubectl get svc -n thu-vien`.',
    'Có hai chỗ sai. Path `/tra-sach` phải đổi thành `/muon-sach`. Và backend của `/api` đang ghi cổng 8080 (cổng container) trong khi Service `api` lắng nghe ở cổng 80 — sửa nó về 80.',
  ],
  parMoves: 2,
  teaches: [
    'IngressMisconfigured',
    '404 vs 502',
    'ingress backend port',
    'service port vs container port',
    'kubectl describe ingress',
  ],
  teaching: {
    primer: `Hai mã lỗi HTTP này nói hai chuyện khác hẳn nhau.

- **404** đến từ chính ingress controller: nó nhận request nhưng **không luật nào
  khớp** đường dẫn đó. Request chưa từng rời khỏi controller, nên mọi thứ phía
  sau đều vô can.
- **502** nghĩa là controller **đã** khớp một luật, đã chuyển tiếp, và cái đích
  đó không trả lời. Lỗi nằm ở backend của luật: sai tên Service, hoặc sai cổng
  Service.

Đây cũng là kiểu sự cố mà mọi thứ **bên trong cluster đều xanh**, vì tầng hỏng
nằm ở lớp ngoài cùng — lớp mà bảng theo dõi nội bộ không đi qua.`,
    cheatsheet: [
      {
        command: 'kubectl describe ingress thu-vien -n thu-vien',
        explain: 'In bảng luật: đường dẫn nào được khai, mỗi đường trỏ tới Service và cổng nào.',
      },
      {
        command: 'kubectl get svc -n thu-vien',
        explain: 'Cột PORT(S) là cổng thật của Service. Backend của Ingress phải khớp con số này.',
      },
      {
        command: 'kubectl get svc -n thu-vien',
        explain: 'Chứng minh các Service đều có pod phía sau, để loại trừ nguyên nhân bên trong.',
      },
      {
        command: 'curl -H "Host: thu-vien.dlp.vn" http://<dia-chi-ingress>/muon-sach',
        explain: 'Tái hiện đúng request của người dùng. Mã trả về nói bạn đang ở tầng nào.',
      },
      {
        command: 'kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx',
        explain: 'Controller ghi lại từng request và lý do nó trả 404 hay 502.',
      },
    ],
    takeaways: [
      '404 từ ingress controller nghĩa là không luật nào khớp, nên request chưa từng đi tới Service.',
      '502 nghĩa là luật đã khớp nhưng backend không trả lời, nên lỗi nằm ở tên hoặc cổng Service.',
      'Backend của Ingress luôn dùng cổng của Service, và đó là chỗ containerPort hay bị điền nhầm vào.',
      'Bên trong cluster xanh hết vẫn không đủ để kết luận người dùng vào được: lớp ngoài cùng nằm ngoài tầm nhìn đó.',
    ],
    proTips: [
      'Đọc mã lỗi như một chỉ dẫn về tầng, không phải như một lời phàn nàn. Nó thu hẹp phạm vi tìm kiếm trước khi bạn mở bất kỳ file YAML nào.',
      'Hai triệu chứng khác nhau xuất hiện cùng lúc thường là hai lỗi khác nhau. Gộp chúng lại làm một là cách nhanh nhất để sửa nửa vời.',
    ],
    pitfalls: [
      'Thấy 404 rồi đi kiểm pod và log ứng dụng. Đó là phản xạ đúng cho hầu hết lỗi khác, nhưng ở đây request chưa từng rời controller nên bạn đang đọc log của một thứ không liên quan.',
      'Điền cổng container vào backend của Ingress. Con số đó có thật, vừa đọc được trong Deployment, và nhìn hoàn toàn hợp lý; chỉ là Ingress nói chuyện với Service chứ không nói chuyện với container.',
    ],
  },
};
