/**
 * Mười thử thách bấm giờ — nửa "THỬ" của cặp dạy/thử.
 *
 * ⛔ Đọc `contract.ts` § "PHÂN VAI GIỮA LEVEL VÀ CHALLENGE" trước khi sửa file
 * này. Level DẠY: có primer, cheatsheet, gợi ý, không đồng hồ. Challenge THỬ:
 * có đồng hồ, không gợi ý, không primer, và giả định người chơi đã học xong
 * phần tương ứng.
 *
 * Vì vậy brief ở đây cố ý ngắn và chỉ mô tả TRIỆU CHỨNG. Nó không giải thích cơ
 * chế — chỗ giải thích là level, và mỗi thử thách dưới đây đều ghi rõ nó dựa
 * trên level nào.
 *
 * ## Vì sao phần lớn thử thách dựng quanh một cặp dễ nhầm
 *
 * Áp lực thời gian chỉ có giá trị sư phạm khi nó ép người chơi CHỌN giữa vài
 * chẩn đoán trông giống nhau. Một thử thách "sửa cái hỏng" chỉ đo tốc độ gõ.
 * Một thử thách "hai thứ hỏng giống hệt nhau, khác nguyên nhân" đo đúng thứ
 * đáng đo: người chơi có phản xạ đọc bằng chứng trước khi hành động hay không.
 *
 * Ba cặp được dùng lại nhiều nhất, đều lấy từ đúng chỗ chúng được dạy:
 *
 * - `CrashLoopBackOff` / `OOMKilled` / liveness probe fail — l03, l24, l29.
 *   Cả ba đều là "container cứ restart mãi".
 * - selector lệch label / readiness fail — l13, l28. Cả hai đều là "endpoint rỗng".
 * - hết tài nguyên / nodeSelector không khớp / bị quota chặn — l23, l26, l27.
 *   Hai cái đầu đều là `Pending`; cái thứ ba thì pod không hề tồn tại.
 *
 * ## Chấm sao phải suy từ `timeLimitSec` CỦA CHÍNH thử thách đó
 *
 * ⚠ Bản gốc mà nhóm nghiên cứu khảo sát đặt ngưỡng sao bằng hằng số toàn cục
 * (180 giây và 120 giây) rồi áp cho mọi thử thách bất kể giới hạn riêng của
 * chúng. Kết quả là một thử thách 600 giây đòi hoàn thành trong 120 giây mới
 * được ba sao, còn hai thử thách 180 giây thì không bao giờ đạt nổi hai sao có
 * nghĩa. Đừng lặp lại: mọi ngưỡng phải là PHÂN SỐ của `timeLimitSec` của chính
 * thử thách đang chấm.
 *
 * Khuyến nghị cho `scoring.ts` (lane B sở hữu): ba sao khi xong dưới 50% giới
 * hạn, hai sao dưới 75%, một sao khi xong trước lúc hết giờ. Bảng này bất biến
 * theo độ dài vì nó không mang con số giây nào.
 *
 * `timeLimitSec` ở dưới được đặt theo số bước sửa tối thiểu, không theo cảm
 * tính: mỗi bước chẩn đoán khoảng 45 giây, mỗi thao tác sửa khoảng 30 giây, rồi
 * nhân đôi để người chơi có chỗ đi sai một lần.
 */

import type { Challenge } from './contract.ts';

const HAI_NODE = [
  { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
  { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
] as const;

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'ch-01-ba-kieu-restart',
    title: 'Ba dịch vụ cùng restart, ba lý do khác nhau',
    brief: `Namespace \`san-xuat\` có ba Deployment và cả ba đều restart liên tục. Cột
RESTARTS của cả ba đều tăng đều, cả ba đều luân phiên Running rồi chết.

Không cái nào hỏng vì cùng một lý do với cái nào.

Đưa cả ba về chạy ổn định. Bạn có bốn phút.`,
    difficulty: 'advanced',
    initialState: {
      nodes: [...HAI_NODE],
      namespaces: ['san-xuat'],
      resources: [
        {
          kind: 'Deployment',
          name: 'thu-nhat',
          namespace: 'san-xuat',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'thu-nhat' } },
            template: {
              labels: { app: 'thu-nhat' },
              containers: [
                {
                  name: 'thu-nhat',
                  image: 'ghcr.io/dlp/thu-nhat:1.0.0',
                  command: ['/app/serve-r'],
                  resources: {
                    requests: { cpu: '100m', memory: '256Mi' },
                    limits: { cpu: '500m', memory: '512Mi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'lenh-entrypoint-sai',
        },
        {
          kind: 'Deployment',
          name: 'thu-hai',
          namespace: 'san-xuat',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'thu-hai' } },
            template: {
              labels: { app: 'thu-hai' },
              containers: [
                {
                  name: 'thu-hai',
                  image: 'ghcr.io/dlp/thu-hai:2.0.0',
                  resources: {
                    requests: { cpu: '100m', memory: '48Mi' },
                    limits: { cpu: '500m', memory: '64Mi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'memory-limit-qua-thap',
        },
        {
          kind: 'Deployment',
          name: 'thu-ba',
          namespace: 'san-xuat',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'thu-ba' } },
            template: {
              labels: { app: 'thu-ba' },
              containers: [
                {
                  name: 'thu-ba',
                  image: 'ghcr.io/dlp/thu-ba:3.0.0',
                  ports: [{ containerPort: 8080 }],
                  thoiGianKhoiDongGiay: 35,
                  livenessProbe: {
                    httpGet: { path: '/healthz', port: 8080 },
                    initialDelaySeconds: 0,
                    periodSeconds: 5,
                    timeoutSeconds: 1,
                    failureThreshold: 1,
                  },
                  resources: {
                    requests: { cpu: '200m', memory: '512Mi' },
                    limits: { cpu: '800m', memory: '1Gi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'liveness-probe-qua-gat',
        },
      ],
    },
    objectives: [
      {
        id: 'thu-nhat-on',
        label: '`thu-nhat` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'thu-nhat', namespace: 'san-xuat', replicas: 2 },
        required: true,
      },
      {
        id: 'thu-hai-on',
        label: '`thu-hai` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'thu-hai', namespace: 'san-xuat', replicas: 2 },
        required: true,
      },
      {
        id: 'thu-ba-on',
        label: '`thu-ba` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'thu-ba', namespace: 'san-xuat', replicas: 2 },
        required: true,
      },
      {
        id: 'sach-su-co',
        label: 'Không pod nào trong `san-xuat` còn mang lý do lỗi',
        check: 'all-pods-healthy',
        args: { namespace: 'san-xuat' },
        required: true,
      },
    ],
    timeLimitSec: 240,
  },
  {
    id: 'ch-02-hai-endpoint-rong',
    title: 'Hai Service, không cái nào có endpoint',
    brief: `Cổng dịch vụ \`cong-dan\` ngừng phục vụ. Hai Service \`ho-so\` và \`lich-hen\`
đều không có endpoint nào, trong khi mọi Deployment vẫn báo đủ số pod.

Đưa cả hai Service về đủ 3 endpoint. Ba phút.`,
    difficulty: 'intermediate',
    initialState: {
      nodes: [...HAI_NODE],
      namespaces: ['cong-dan'],
      resources: [
        {
          kind: 'Deployment',
          name: 'ho-so',
          namespace: 'cong-dan',
          spec: {
            replicas: 3,
            selector: { matchLabels: { app: 'ho-so' } },
            template: {
              labels: { app: 'ho-so', tang: 'backend' },
              containers: [
                { name: 'ho-so', image: 'ghcr.io/dlp/ho-so:1.2.0', ports: [{ containerPort: 8080 }] },
              ],
            },
          },
        },
        {
          kind: 'Service',
          name: 'ho-so',
          namespace: 'cong-dan',
          spec: {
            type: 'ClusterIP',
            selector: { app: 'ho-so', tang: 'api' },
            ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
          },
          seededIncident: 'service-selector-lech-label',
        },
        {
          kind: 'Deployment',
          name: 'lich-hen',
          namespace: 'cong-dan',
          spec: {
            replicas: 3,
            selector: { matchLabels: { app: 'lich-hen' } },
            template: {
              labels: { app: 'lich-hen' },
              containers: [
                {
                  name: 'lich-hen',
                  image: 'ghcr.io/dlp/lich-hen:2.5.0',
                  ports: [{ containerPort: 5000 }],
                  readinessProbe: {
                    httpGet: { path: '/san-sang', port: 8080 },
                    initialDelaySeconds: 3,
                    periodSeconds: 10,
                  },
                },
              ],
            },
          },
          seededIncident: 'readiness-probe-sai-cong',
        },
        {
          kind: 'Service',
          name: 'lich-hen',
          namespace: 'cong-dan',
          spec: {
            type: 'ClusterIP',
            selector: { app: 'lich-hen' },
            ports: [{ port: 80, targetPort: 5000, protocol: 'TCP' }],
          },
        },
      ],
    },
    objectives: [
      {
        id: 'ho-so-co-endpoint',
        label: 'Service `ho-so` có đủ 3 endpoint',
        check: 'service-has-endpoints',
        args: { name: 'ho-so', namespace: 'cong-dan', min: 3 },
        required: true,
      },
      {
        id: 'lich-hen-co-endpoint',
        label: 'Service `lich-hen` có đủ 3 endpoint',
        check: 'service-has-endpoints',
        args: { name: 'lich-hen', namespace: 'cong-dan', min: 3 },
        required: true,
      },
      {
        id: 'giu-readiness',
        label: '`lich-hen` vẫn khai readiness probe',
        check: 'probe-configured',
        args: { kind: 'Deployment', name: 'lich-hen', namespace: 'cong-dan', probe: 'readiness' },
        required: true,
      },
    ],
    timeLimitSec: 180,
  },
  {
    id: 'ch-03-rollout-treo',
    title: 'Rollout treo, dịch vụ còn sống, đồng hồ đang chạy',
    brief: `Deployment \`cong-noi-bo\` đang có 5 pod cho 4 replica. Một số pod
mới không bao giờ Ready. Người dùng chưa bị ảnh hưởng.

Đưa nó về trạng thái ổn định với 4 replica chạy image lành. Ba phút.`,
    difficulty: 'intermediate',
    initialState: {
      nodes: [...HAI_NODE],
      namespaces: ['noi-bo'],
      resources: [
        {
          kind: 'ReplicaSet',
          name: 'cong-noi-bo-a1b2c3',
          namespace: 'noi-bo',
          spec: {
            replicas: 0,
            revision: 7,
            selector: { matchLabels: { app: 'cong-noi-bo', 'pod-template-hash': 'a1b2c3' } },
            template: {
              labels: { app: 'cong-noi-bo', 'pod-template-hash': 'a1b2c3' },
              containers: [
                { name: 'cong', image: 'ghcr.io/dlp/cong-noi-bo:2.8.0', ports: [{ containerPort: 8080 }] },
              ],
            },
          },
        },
        {
          kind: 'Deployment',
          name: 'cong-noi-bo',
          namespace: 'noi-bo',
          spec: {
            replicas: 4,
            revision: 8,
            selector: { matchLabels: { app: 'cong-noi-bo' } },
            strategy: { type: 'RollingUpdate', maxSurge: 1, maxUnavailable: 0 },
            template: {
              labels: { app: 'cong-noi-bo' },
              containers: [
                {
                  name: 'cong',
                  image: 'ghcr.io/dlp/cong-noi-bo:2.9.0-rc3',
                  ports: [{ containerPort: 8080 }],
                  resources: {
                    requests: { cpu: '200m', memory: '256Mi' },
                    limits: { cpu: '600m', memory: '512Mi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'image-tag-sai',
        },
      ],
    },
    objectives: [
      {
        id: 'bon-replica',
        label: '`cong-noi-bo` có đủ 4 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'cong-noi-bo', namespace: 'noi-bo', replicas: 4 },
        required: true,
      },
      {
        id: 'image-lanh',
        label: 'Chạy lại image lành `ghcr.io/dlp/cong-noi-bo:2.8.0`',
        check: 'container-image-is',
        args: {
          kind: 'Deployment',
          name: 'cong-noi-bo',
          namespace: 'noi-bo',
          image: 'ghcr.io/dlp/cong-noi-bo:2.8.0',
        },
        required: true,
      },
      {
        id: 'khong-con-pod-loi',
        label: 'Không pod nào còn mang lý do lỗi',
        check: 'pod-no-reason',
        args: { namespace: 'noi-bo', labelSelector: 'app=cong-noi-bo' },
        required: true,
      },
    ],
    timeLimitSec: 180,
  },
  {
    id: 'ch-04-hai-pod-cung-pending',
    title: 'Hai workload cùng Pending, hai lý do',
    brief: `Namespace \`phan-tich\` có hai Deployment kẹt \`Pending\`. Cluster nhìn qua thì
rảnh. Không cái nào Pending vì cùng lý do với cái kia.

Đưa cả hai lên chạy, và đừng giảm số replica của cái nào. Bốn phút.`,
    difficulty: 'advanced',
    initialState: {
      nodes: [
        { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true, labels: { loai: 'thuong' } },
        { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true, labels: { loai: 'thuong' } },
      ],
      namespaces: ['phan-tich'],
      resources: [
        {
          kind: 'Deployment',
          name: 'chiem-cho',
          namespace: 'phan-tich',
          spec: {
            replicas: 6,
            selector: { matchLabels: { app: 'chiem-cho' } },
            template: {
              labels: { app: 'chiem-cho' },
              containers: [
                {
                  name: 'chiem-cho',
                  image: 'ghcr.io/dlp/chiem-cho:1.0.0',
                  resources: {
                    requests: { cpu: '1100m', memory: '256Mi' },
                    limits: { cpu: '1400m', memory: '512Mi' },
                  },
                },
              ],
            },
          },
        },
        {
          kind: 'Deployment',
          name: 'tong-hop',
          namespace: 'phan-tich',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'tong-hop' } },
            template: {
              labels: { app: 'tong-hop' },
              containers: [
                {
                  name: 'tong-hop',
                  image: 'ghcr.io/dlp/tong-hop:2.0.0',
                  resources: {
                    requests: { cpu: '800m', memory: '512Mi' },
                    limits: { cpu: '1000m', memory: '1Gi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'node-het-cpu',
        },
        {
          kind: 'Deployment',
          name: 'gom-so-lieu',
          namespace: 'phan-tich',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'gom-so-lieu' } },
            template: {
              labels: { app: 'gom-so-lieu' },
              nodeSelector: { 'may-loai': 'thuong' },
              containers: [
                {
                  name: 'gom-so-lieu',
                  image: 'ghcr.io/dlp/gom-so-lieu:1.3.0',
                  resources: {
                    requests: { cpu: '100m', memory: '128Mi' },
                    limits: { cpu: '300m', memory: '256Mi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'nodeselector-khong-khop',
        },
      ],
    },
    objectives: [
      {
        id: 'tong-hop-chay',
        label: '`tong-hop` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'tong-hop', namespace: 'phan-tich', replicas: 2 },
        required: true,
      },
      {
        id: 'gom-so-lieu-chay',
        label: '`gom-so-lieu` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'gom-so-lieu', namespace: 'phan-tich', replicas: 2 },
        required: true,
      },
      {
        id: 'giu-chiem-cho',
        label: '`chiem-cho` vẫn giữ đủ 6 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'chiem-cho', namespace: 'phan-tich', replicas: 6 },
        required: true,
      },
    ],
    timeLimitSec: 240,
  },
  {
    id: 'ch-05-ngoai-loi-trong-xanh',
    title: 'Ngoài trả lỗi, trong xanh hết',
    brief: `Người dùng ngoài Internet báo lỗi trên hai đường dẫn. Bên trong cluster mọi
Service đều gọi được và mọi pod đều Ready.

Sửa Ingress \`cong-vao\` trong namespace \`dich-vu\` để \`/tra-cuu\` tới Service
\`tra-cuu\` và \`/ho-tro\` tới Service \`ho-tro\`. Bốn phút.`,
    difficulty: 'advanced',
    initialState: {
      nodes: [...HAI_NODE],
      namespaces: ['dich-vu'],
      resources: [
        {
          kind: 'Deployment',
          name: 'tra-cuu',
          namespace: 'dich-vu',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'tra-cuu' } },
            template: {
              labels: { app: 'tra-cuu' },
              containers: [
                { name: 'tra-cuu', image: 'ghcr.io/dlp/tra-cuu:2.0.0', ports: [{ containerPort: 8080 }] },
              ],
            },
          },
        },
        {
          kind: 'Service',
          name: 'tra-cuu',
          namespace: 'dich-vu',
          spec: {
            type: 'ClusterIP',
            selector: { app: 'tra-cuu' },
            ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
          },
        },
        {
          kind: 'Deployment',
          name: 'ho-tro',
          namespace: 'dich-vu',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'ho-tro' } },
            template: {
              labels: { app: 'ho-tro' },
              containers: [
                { name: 'ho-tro', image: 'ghcr.io/dlp/ho-tro:1.4.0', ports: [{ containerPort: 3000 }] },
              ],
            },
          },
        },
        {
          kind: 'Service',
          name: 'ho-tro',
          namespace: 'dich-vu',
          spec: {
            type: 'ClusterIP',
            selector: { app: 'ho-tro' },
            ports: [{ port: 8000, targetPort: 3000, protocol: 'TCP' }],
          },
        },
        {
          kind: 'Ingress',
          name: 'cong-vao',
          namespace: 'dich-vu',
          spec: {
            rules: [
              {
                host: 'dich-vu.dlp.vn',
                paths: [
                  { path: '/lookup', pathType: 'Prefix', serviceName: 'tra-cuu', servicePort: 80 },
                  { path: '/ho-tro', pathType: 'Prefix', serviceName: 'ho-tro', servicePort: 3000 },
                ],
              },
            ],
          },
          seededIncident: 'ingress-sai-path',
        },
      ],
    },
    objectives: [
      {
        id: 'tra-cuu-dung-duong',
        label: '`/tra-cuu` đi tới Service `tra-cuu`',
        check: 'ingress-routes',
        args: { name: 'cong-vao', namespace: 'dich-vu', path: '/tra-cuu', serviceName: 'tra-cuu' },
        required: true,
      },
      {
        id: 'ho-tro-dung-cong',
        label: '`/ho-tro` đi tới Service `ho-tro` ở đúng cổng Service',
        check: 'ingress-routes',
        args: { name: 'cong-vao', namespace: 'dich-vu', path: '/ho-tro', serviceName: 'ho-tro' },
        required: true,
      },
      {
        id: 'het-su-co-dinh-tuyen',
        label: 'Không còn sự cố định tuyến trong namespace',
        check: 'no-incident-active',
        args: { namespace: 'dich-vu', kind: 'ingress-sai-path' },
        required: true,
      },
    ],
    timeLimitSec: 240,
  },
  {
    id: 'ch-06-o-dia-khong-gan-duoc',
    title: 'Cụm dữ liệu không lên nổi pod đầu tiên',
    brief: `StatefulSet \`kho-ban-ghi\` trong namespace \`luu-tru\` khai 3 replica và
cluster chỉ có một pod, đang Pending.

Đưa cả 3 pod lên chạy với ổ đĩa riêng. Năm phút.`,
    difficulty: 'advanced',
    initialState: {
      nodes: [
        { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
        { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
        { name: 'may-chu-3', cpu: 4000, memory: 8192, ready: true },
      ],
      namespaces: ['luu-tru'],
      resources: [
        {
          kind: 'Service',
          name: 'kho-ban-ghi',
          namespace: 'luu-tru',
          spec: {
            type: 'ClusterIP',
            clusterIP: 'None',
            selector: { app: 'kho-ban-ghi' },
            ports: [{ port: 5432, targetPort: 5432, protocol: 'TCP' }],
          },
        },
        {
          kind: 'StatefulSet',
          name: 'kho-ban-ghi',
          namespace: 'luu-tru',
          spec: {
            replicas: 3,
            serviceName: 'kho-ban-ghi',
            podManagementPolicy: 'OrderedReady',
            selector: { matchLabels: { app: 'kho-ban-ghi' } },
            template: {
              labels: { app: 'kho-ban-ghi' },
              containers: [
                {
                  name: 'kho-ban-ghi',
                  image: 'postgres:17-alpine',
                  ports: [{ containerPort: 5432 }],
                  volumeMounts: [{ name: 'du-lieu', mountPath: '/var/lib/postgresql/data' }],
                  resources: {
                    requests: { cpu: '400m', memory: '512Mi' },
                    limits: { cpu: '1000m', memory: '1Gi' },
                  },
                },
              ],
            },
            volumeClaimTemplates: [
              {
                name: 'du-lieu',
                accessModes: ['ReadWriteOnce'],
                storageClassName: 'ben-vung',
                storage: '20Gi',
              },
            ],
          },
          seededIncident: 'storageclass-khong-ton-tai',
        },
      ],
    },
    objectives: [
      {
        id: 'pvc-0-bound',
        label: 'PVC của pod số 0 đã Bound',
        check: 'pvc-bound',
        args: { name: 'du-lieu-kho-ban-ghi-0', namespace: 'luu-tru' },
        required: true,
      },
      {
        id: 'pvc-2-bound',
        label: 'PVC của pod số 2 đã Bound',
        check: 'pvc-bound',
        args: { name: 'du-lieu-kho-ban-ghi-2', namespace: 'luu-tru' },
        required: true,
      },
      {
        id: 'ba-pod-chay',
        label: 'Cả 3 pod `app=kho-ban-ghi` đang chạy',
        check: 'pod-count-running',
        args: { namespace: 'luu-tru', labelSelector: 'app=kho-ban-ghi', min: 3 },
        required: true,
      },
    ],
    timeLimitSec: 300,
  },
  {
    id: 'ch-07-thieu-hai-manh-cau-hinh',
    title: 'Container không dựng nổi, hai lý do khác nhau',
    brief: `Hai Deployment trong namespace \`ky-thuat\` cùng ở \`CreateContainerConfigError\`.
RESTARTS của cả hai đều bằng 0 và không có log nào.

Đưa cả hai lên chạy. Ba phút.`,
    difficulty: 'intermediate',
    initialState: {
      nodes: [...HAI_NODE],
      namespaces: ['ky-thuat'],
      resources: [
        {
          kind: 'ConfigMap',
          name: 'dong-bo-cau-hinh',
          namespace: 'ky-thuat',
          spec: {
            data: { NGUON_URL: 'https://noi-bo.dlp.vn/api', CHU_KY_PHUT: '15' },
          },
        },
        {
          kind: 'Deployment',
          name: 'dong-bo',
          namespace: 'ky-thuat',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'dong-bo' } },
            template: {
              labels: { app: 'dong-bo' },
              containers: [
                {
                  name: 'dong-bo',
                  image: 'ghcr.io/dlp/dong-bo:1.9.0',
                  env: [
                    {
                      name: 'NGUON_URL',
                      valueFrom: { configMapKeyRef: { name: 'dong-bo-cau-hinh', key: 'NGUON_URL' } },
                    },
                    {
                      name: 'MA_XAC_THUC',
                      valueFrom: { configMapKeyRef: { name: 'dong-bo-cau-hinh', key: 'MA_XAC_THUC' } },
                    },
                  ],
                },
              ],
            },
          },
          seededIncident: 'key-configmap-sai',
        },
        {
          kind: 'Deployment',
          name: 'gui-thong-bao',
          namespace: 'ky-thuat',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'gui-thong-bao' } },
            template: {
              labels: { app: 'gui-thong-bao' },
              volumes: [{ name: 'khoa', secret: { secretName: 'khoa-gui-thu' } }],
              containers: [
                {
                  name: 'gui-thong-bao',
                  image: 'ghcr.io/dlp/gui-thong-bao:3.0.0',
                  volumeMounts: [{ name: 'khoa', mountPath: '/etc/khoa' }],
                },
              ],
            },
          },
          seededIncident: 'thieu-secret',
        },
      ],
    },
    objectives: [
      {
        id: 'them-khoa-thieu',
        label: 'ConfigMap `dong-bo-cau-hinh` có khoá `MA_XAC_THUC`',
        check: 'configmap-key-set',
        args: { name: 'dong-bo-cau-hinh', namespace: 'ky-thuat', key: 'MA_XAC_THUC' },
        required: true,
      },
      {
        id: 'dong-bo-chay',
        label: '`dong-bo` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'dong-bo', namespace: 'ky-thuat', replicas: 2 },
        required: true,
      },
      {
        id: 'co-secret',
        label: 'Secret `khoa-gui-thu` tồn tại',
        check: 'resource-exists',
        args: { kind: 'Secret', name: 'khoa-gui-thu', namespace: 'ky-thuat' },
        required: true,
      },
      {
        id: 'gui-thong-bao-chay',
        label: '`gui-thong-bao` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'gui-thong-bao', namespace: 'ky-thuat', replicas: 2 },
        required: true,
      },
    ],
    timeLimitSec: 180,
  },
  {
    id: 'ch-08-policy-cat-nham-hai-duong',
    title: 'Một policy, hai thứ bị cắt nhầm',
    brief: `Sau khi siết mạng namespace \`vien-thong\`, hai chuyện xảy ra: \`web\` không
phân giải được tên nào nữa, và biểu đồ giám sát của \`loi-tong\` trống trơn.

Sửa để \`web\` gọi và phân giải được \`loi-tong\`, và \`thu-thap-metric\` lấy
được metric ở cổng 9100 — trong khi \`khach-la\` vẫn bị chặn. Năm phút.`,
    difficulty: 'advanced',
    initialState: {
      nodes: [...HAI_NODE],
      namespaces: ['vien-thong'],
      resources: [
        {
          kind: 'Pod',
          name: 'loi-tong',
          namespace: 'vien-thong',
          spec: {
            labels: { app: 'loi-tong', tang: 'backend' },
            containers: [
              {
                name: 'loi-tong',
                image: 'ghcr.io/dlp/loi-tong:5.0.0',
                ports: [{ containerPort: 8080 }, { containerPort: 9100 }],
              },
            ],
          },
        },
        {
          kind: 'Pod',
          name: 'web',
          namespace: 'vien-thong',
          spec: {
            labels: { app: 'web', tang: 'frontend' },
            containers: [{ name: 'web', image: 'nginx:1.27-alpine', ports: [{ containerPort: 80 }] }],
          },
        },
        {
          kind: 'Pod',
          name: 'thu-thap-metric',
          namespace: 'vien-thong',
          spec: {
            labels: { app: 'thu-thap-metric', tang: 'giam-sat' },
            containers: [
              {
                name: 'thu-thap-metric',
                image: 'ghcr.io/dlp/thu-thap-metric:1.6.0',
                ports: [{ containerPort: 9090 }],
              },
            ],
          },
        },
        {
          kind: 'Pod',
          name: 'khach-la',
          namespace: 'vien-thong',
          spec: {
            labels: { app: 'khach-la', tang: 'khong-ro' },
            containers: [{ name: 'khach-la', image: 'busybox:1.37', command: ['sleep', '86400'] }],
          },
        },
        {
          kind: 'Service',
          name: 'loi-tong',
          namespace: 'vien-thong',
          spec: {
            type: 'ClusterIP',
            selector: { app: 'loi-tong' },
            ports: [{ port: 8080, targetPort: 8080, protocol: 'TCP' }],
          },
        },
        {
          kind: 'NetworkPolicy',
          name: 'siet-mang',
          namespace: 'vien-thong',
          spec: {
            podSelector: {},
            policyTypes: ['Ingress', 'Egress'],
            ingress: [
              {
                from: [{ podSelector: { matchLabels: { tang: 'frontend' } } }],
                ports: [{ port: 8080, protocol: 'TCP' }],
              },
            ],
            egress: [
              {
                to: [{ podSelector: { matchLabels: { tang: 'backend' } } }],
                ports: [{ port: 8080, protocol: 'TCP' }],
              },
            ],
          },
          seededIncident: 'networkpolicy-chan-nham',
        },
      ],
    },
    objectives: [
      {
        id: 'web-goi-duoc',
        label: '`web` gọi được `loi-tong` ở cổng 8080',
        check: 'netpol-allows',
        args: {
          namespace: 'vien-thong',
          fromLabels: { app: 'web' },
          toLabels: { app: 'loi-tong' },
          port: 8080,
        },
        required: true,
      },
      {
        id: 'web-phan-giai-duoc',
        label: '`web` phân giải được tên của Service `loi-tong`',
        check: 'dns-resolves',
        args: {
          namespace: 'vien-thong',
          fromName: 'web',
          toName: 'loi-tong.vien-thong.svc.cluster.local',
        },
        required: true,
      },
      {
        id: 'metric-thu-duoc',
        label: '`thu-thap-metric` lấy được metric ở cổng 9100',
        check: 'netpol-allows',
        args: {
          namespace: 'vien-thong',
          fromLabels: { app: 'thu-thap-metric' },
          toLabels: { app: 'loi-tong' },
          port: 9100,
        },
        required: true,
      },
      {
        id: 'khach-la-bi-chan',
        label: '`khach-la` vẫn KHÔNG gọi được `loi-tong`',
        check: 'netpol-denies',
        args: {
          namespace: 'vien-thong',
          fromLabels: { app: 'khach-la' },
          toLabels: { app: 'loi-tong' },
          port: 8080,
        },
        required: true,
      },
    ],
    timeLimitSec: 300,
  },
  {
    id: 'ch-09-quyen-qua-rong',
    title: 'Thu quyền lại mà không làm sập bảng điều khiển',
    brief: `Đợt rà soát an ninh phát hiện ServiceAccount \`bot-bao-cao\` trong namespace
\`quan-tri\` đang được nối tới một Role cho phép mọi động từ trên mọi tài nguyên.

Nó chỉ cần đọc danh sách pod và service. Thu quyền lại về đúng mức đó: sau khi
xong, nó vẫn liệt kê được pod và service, và **không** đọc được Secret, **không**
xoá được gì. Bốn phút.`,
    difficulty: 'advanced',
    initialState: {
      nodes: [...HAI_NODE],
      namespaces: ['quan-tri'],
      resources: [
        { kind: 'ServiceAccount', name: 'bot-bao-cao', namespace: 'quan-tri', spec: {} },
        {
          kind: 'Secret',
          name: 'khoa-noi-bo',
          namespace: 'quan-tri',
          spec: { type: 'Opaque', data: { KHOA: 'noi-dung-nhay-cam' } },
        },
        {
          kind: 'Role',
          name: 'toan-quyen-tam',
          namespace: 'quan-tri',
          spec: {
            rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
          },
        },
        {
          kind: 'RoleBinding',
          name: 'bot-bao-cao-toan-quyen',
          namespace: 'quan-tri',
          spec: {
            roleRef: { kind: 'Role', name: 'toan-quyen-tam' },
            subjects: [{ kind: 'ServiceAccount', name: 'bot-bao-cao', namespace: 'quan-tri' }],
          },
        },
        {
          kind: 'Deployment',
          name: 'bao-cao-noi-bo',
          namespace: 'quan-tri',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'bao-cao-noi-bo' } },
            template: {
              labels: { app: 'bao-cao-noi-bo' },
              serviceAccountName: 'bot-bao-cao',
              containers: [
                {
                  name: 'bao-cao-noi-bo',
                  image: 'ghcr.io/dlp/bao-cao-noi-bo:1.1.0',
                  ports: [{ containerPort: 8080 }],
                  resources: {
                    requests: { cpu: '100m', memory: '128Mi' },
                    limits: { cpu: '300m', memory: '256Mi' },
                  },
                },
              ],
            },
          },
        },
      ],
    },
    objectives: [
      {
        id: 'con-liet-ke-duoc-pod',
        label: '`bot-bao-cao` vẫn liệt kê được pod',
        check: 'rbac-allows',
        args: { serviceAccount: 'bot-bao-cao', namespace: 'quan-tri', verb: 'list', resource: 'pods' },
        required: true,
      },
      {
        id: 'con-liet-ke-duoc-service',
        label: '`bot-bao-cao` vẫn liệt kê được service',
        check: 'rbac-allows',
        args: { serviceAccount: 'bot-bao-cao', namespace: 'quan-tri', verb: 'list', resource: 'services' },
        required: true,
      },
      {
        id: 'khong-doc-secret',
        label: '`bot-bao-cao` KHÔNG đọc được Secret',
        check: 'rbac-denies',
        args: { serviceAccount: 'bot-bao-cao', namespace: 'quan-tri', verb: 'get', resource: 'secrets' },
        required: true,
      },
      {
        id: 'khong-xoa-pod',
        label: '`bot-bao-cao` KHÔNG xoá được pod',
        check: 'rbac-denies',
        args: { serviceAccount: 'bot-bao-cao', namespace: 'quan-tri', verb: 'delete', resource: 'pods' },
        required: true,
      },
      {
        id: 'ung-dung-van-chay',
        label: '`bao-cao-noi-bo` vẫn có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'bao-cao-noi-bo', namespace: 'quan-tri', replicas: 2 },
        required: true,
      },
    ],
    timeLimitSec: 240,
  },
  {
    id: 'ch-10-dem-truc',
    title: 'Đêm trực: ba sự cố, hai namespace, mười phút',
    brief: `Bạn nhận ca trực lúc 2 giờ sáng với ba việc đang mở:

- \`nen-tang\` — Deployment \`api\` khai 6 replica và **không có pod nào tồn tại**.
- \`van-hanh\` — Deployment \`xu-ly\` restart liên tục, log sạch.
- \`van-hanh\` — HPA \`giao-tiep\` báo tải cao suốt hai giờ mà số replica không đổi.

Ba nguyên nhân khác nhau, không cái nào liên quan tới cái nào. Mười phút.`,
    difficulty: 'advanced',
    initialState: {
      nodes: [
        { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
        { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
        { name: 'may-chu-3', cpu: 4000, memory: 8192, ready: true },
      ],
      namespaces: ['nen-tang', 'van-hanh'],
      resources: [
        {
          kind: 'ResourceQuota',
          name: 'han-muc',
          namespace: 'nen-tang',
          spec: { hard: { 'requests.memory': '1600Mi', 'requests.cpu': '3', pods: '10' } },
        },
        {
          kind: 'LimitRange',
          name: 'khung',
          namespace: 'nen-tang',
          spec: {
            limits: [
              {
                type: 'Container',
                min: { memory: '128Mi', cpu: '50m' },
                max: { memory: '512Mi', cpu: '1' },
              },
            ],
          },
        },
        {
          kind: 'Deployment',
          name: 'api',
          namespace: 'nen-tang',
          spec: {
            replicas: 6,
            selector: { matchLabels: { app: 'api' } },
            template: {
              labels: { app: 'api' },
              containers: [
                {
                  name: 'api',
                  image: 'ghcr.io/dlp/api:1.5.0',
                  ports: [{ containerPort: 8080 }],
                  resources: {
                    requests: { cpu: '400m', memory: '512Mi' },
                    limits: { cpu: '1000m', memory: '512Mi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'replica-vuot-quota',
        },
        {
          kind: 'Deployment',
          name: 'xu-ly',
          namespace: 'van-hanh',
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: 'xu-ly' } },
            template: {
              labels: { app: 'xu-ly' },
              containers: [
                {
                  name: 'xu-ly',
                  image: 'ghcr.io/dlp/xu-ly:4.1.0',
                  resources: {
                    requests: { cpu: '200m', memory: '64Mi' },
                    limits: { cpu: '600m', memory: '96Mi' },
                  },
                },
              ],
            },
          },
          seededIncident: 'memory-limit-qua-thap',
        },
        {
          kind: 'Deployment',
          name: 'giao-tiep',
          namespace: 'van-hanh',
          spec: {
            replicas: 3,
            selector: { matchLabels: { app: 'giao-tiep' } },
            template: {
              labels: { app: 'giao-tiep' },
              containers: [
                {
                  name: 'giao-tiep',
                  image: 'ghcr.io/dlp/giao-tiep:2.2.0',
                  ports: [{ containerPort: 8080 }],
                },
              ],
            },
          },
        },
        {
          kind: 'HorizontalPodAutoscaler',
          name: 'giao-tiep',
          namespace: 'van-hanh',
          spec: {
            scaleTargetRef: { kind: 'Deployment', name: 'giao-tiep' },
            minReplicas: 3,
            maxReplicas: 12,
            metrics: [{ type: 'Resource', resource: { name: 'cpu', targetAverageUtilization: 70 } }],
          },
          seededIncident: 'hpa-khong-co-metrics',
        },
      ],
    },
    objectives: [
      {
        id: 'api-du-sau',
        label: '`api` có đủ 6 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'api', namespace: 'nen-tang', replicas: 6 },
        required: true,
      },
      {
        id: 'trong-han-muc',
        label: 'Namespace `nen-tang` không vượt ResourceQuota',
        check: 'quota-within-limit',
        args: { namespace: 'nen-tang' },
        required: true,
      },
      {
        id: 'xu-ly-on-dinh',
        label: '`xu-ly` có đủ 2 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'xu-ly', namespace: 'van-hanh', replicas: 2 },
        required: true,
      },
      {
        id: 'hpa-doc-duoc',
        label: 'HPA `giao-tiep` đọc được metric nguồn hợp lệ',
        check: 'hpa-has-metrics',
        args: { name: 'giao-tiep', namespace: 'van-hanh' },
        required: true,
      },
      {
        id: 'giao-tiep-khai-du',
        label: '`giao-tiep` khai đầy đủ requests và limits',
        check: 'resource-limits-set',
        args: { kind: 'Deployment', name: 'giao-tiep', namespace: 'van-hanh' },
        required: true,
      },
      {
        id: 'van-hanh-sach',
        label: 'Mọi pod trong `van-hanh` đều khoẻ',
        check: 'all-pods-healthy',
        args: { namespace: 'van-hanh' },
        required: true,
      },
    ],
    timeLimitSec: 600,
  },
];
