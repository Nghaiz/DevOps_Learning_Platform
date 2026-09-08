import type { Level } from '../contract.ts';

/**
 * DNS xuyên namespace. Chọn nguyên nhân "gọi tên ngắn từ namespace khác" chứ
 * không chọn "CoreDNS chết" vì nguyên nhân này người chơi SỬA ĐƯỢC bằng thứ họ
 * đã học, còn CoreDNS chết thì chỉ còn nước restart — không dạy được gì.
 *
 * Namespace cố ý không phải là ranh giới mạng: hai pod ở hai namespace vẫn gọi
 * thẳng nhau được. Đó là chỗ hay bị hiểu nhầm nhất, và chương 6 (NetworkPolicy)
 * dựa hẳn vào việc người chơi đã hiểu đúng điều này từ đây.
 */
export const l15: Level = {
  id: 'k8s-15-goi-nham-ten-dns',
  chapter: 3,
  title: 'Tên gọi được ở namespace này, không gọi được ở namespace kia',
  mission: 'Sửa cấu hình `don-hang` để nó phân giải và gọi được Service kho hàng, giữ pod chạy.',
  brief: `Dịch vụ \`don-hang\` cần hỏi tồn kho trước khi chốt đơn. Nó gọi
\`http://kho-hang\` — đúng cái tên mà đội kho đã đưa.

Ở namespace \`don-hang\`, lời gọi đó chết ngay ở bước phân giải tên: log ghi
\`no such host\`.

Địa chỉ đích nằm trong ConfigMap \`don-hang-cau-hinh\`, key \`KHO_URL\`.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['don-hang', 'kho'],
    resources: [
      {
        kind: 'ConfigMap',
        name: 'don-hang-cau-hinh',
        namespace: 'don-hang',
        spec: {
          data: {
            KHO_URL: 'http://kho-hang',
            TIMEOUT_MS: '2000',
          },
        },
      },
      {
        kind: 'Pod',
        name: 'don-hang',
        namespace: 'don-hang',
        spec: {
          labels: { app: 'don-hang' },
          containers: [
            {
              name: 'don-hang',
              image: 'ghcr.io/dlp/don-hang:3.0.1',
              ports: [{ containerPort: 8080 }],
              envFrom: [{ configMapRef: { name: 'don-hang-cau-hinh' } }],
            },
          ],
        },
        seededIncident: 'dns-khong-phan-giai',
      },
      {
        kind: 'Deployment',
        name: 'kho-hang',
        namespace: 'kho',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'kho-hang' } },
          template: {
            labels: { app: 'kho-hang' },
            containers: [
              {
                name: 'kho-hang',
                image: 'ghcr.io/dlp/kho-hang:2.2.0',
                ports: [{ containerPort: 9090 }],
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'kho-hang',
        namespace: 'kho',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'kho-hang' },
          ports: [{ port: 80, targetPort: 9090, protocol: 'TCP' }],
        },
      },
    ],
  },
  allowedResources: ['ConfigMap', 'Pod', 'Service'],
  objectives: [
    {
      id: 'phan-giai-duoc',
      label: 'Pod `don-hang` phân giải được tên đầy đủ của Service kho hàng',
      check: 'dns-resolves',
      args: {
        namespace: 'don-hang',
        fromName: 'don-hang',
        toName: 'kho-hang.kho.svc.cluster.local',
      },
      required: true,
    },
    {
      id: 'pod-van-chay',
      label: 'Pod `don-hang` vẫn ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'don-hang', name: 'don-hang' },
      required: true,
    },
    {
      id: 'key-con-nguyen',
      label: 'ConfigMap vẫn giữ key `KHO_URL`',
      check: 'configmap-key-set',
      args: { name: 'don-hang-cau-hinh', namespace: 'don-hang', key: 'KHO_URL' },
      required: true,
    },
  ],
  hints: [
    '`no such host` là lỗi ở tầng phân giải tên, không phải ở tầng kết nối. Trước khi nghi ngờ Service phía kho, hãy kiểm tra xem cái tên đó có tồn tại ở phía bạn đang gọi hay không: `kubectl get svc -n don-hang`.',
    '`kubectl get svc --all-namespaces` cho thấy Service `kho-hang` sống ở namespace `kho`, không phải `don-hang`. Tên ngắn trong pod luôn được ghép với namespace của chính pod trước tiên — nên từ `don-hang`, `kho-hang` nghĩa là `kho-hang.don-hang.svc.cluster.local`, một cái tên không có thật.',
    'Sửa key `KHO_URL` trong ConfigMap `don-hang-cau-hinh` thành `http://kho-hang.kho.svc.cluster.local`. Pod nạp ConfigMap qua biến môi trường, nên nó cần được tạo lại để đọc giá trị mới.',
  ],
  parMoves: 2,
  teaches: [
    'cluster DNS',
    'FQDN',
    'svc.cluster.local',
    'search domain',
    'cross-namespace',
    'namespace không phải ranh giới mạng',
    'ConfigMap qua biến môi trường',
  ],
  teaching: {
    primer: `\`no such host\` là lỗi ở tầng **phân giải tên**, không phải tầng kết nối: chưa
tìm ra địa chỉ để mà kết nối, nên mọi giả thuyết về firewall, cổng hay pod chết
đều chưa tới lượt.

Mỗi Service có một tên đầy đủ trong cụm:
\`<service>.<namespace>.svc.cluster.local\`. Rút gọn được là vì Kubernetes ghi sẵn
vào pod một danh sách **hậu tố tìm kiếm**, và hậu tố đầu tiên là namespace của
**chính pod đó**.

**Namespace không chặn traffic.** Hai pod ở hai namespace gọi thẳng nhau được;
namespace là ranh giới đặt tên và phân quyền, không phải ranh giới mạng.

ConfigMap nạp qua biến môi trường chỉ được đọc **lúc container khởi động**.`,
    cheatsheet: [
      {
        command: 'kubectl get svc --all-namespaces',
        explain:
          'Tìm Service đang nằm ở namespace nào. Bước này trả lời được câu hỏi ngay lập tức.',
      },
      {
        command: 'kubectl get svc kho-hang -n kho',
        explain:
          'Xác nhận Service đích có thật, và đọc đúng tên lẫn namespace của nó trước khi ghép tên đầy đủ.',
      },
      {
        command: 'kubectl describe configmap don-hang-cau-hinh -n don-hang',
        explain: 'Đọc thẳng giá trị `KHO_URL` ứng dụng đang dùng, thay vì đoán từ mã nguồn.',
      },
      {
        command: 'kubectl describe pod don-hang -n don-hang',
        explain:
          'Pod gọi vẫn Running và Events sạch. Đó là cách loại trừ pod ra khỏi danh sách nghi ngờ, để còn lại đúng cái tên bị gọi sai.',
      },
    ],
    takeaways: [
      'Tên ngắn trong pod luôn được hiểu là namespace của chính pod đó trước tiên.',
      'Tên đầy đủ `<service>.<namespace>.svc.cluster.local` gọi được từ bất kỳ namespace nào.',
      'Namespace là ranh giới đặt tên và phân quyền, không chặn traffic giữa các pod.',
      'ConfigMap nạp qua biến môi trường chỉ đọc lúc khởi động, nên đổi nó xong phải tạo lại pod.',
    ],
    proTips: [
      'Một tên hỏng trong khi các tên khác vẫn chạy thì lỗi ở cái tên; mọi tên cùng hỏng thì mới nghi CoreDNS.',
      'Mount ConfigMap thành file thay vì bơm thành biến môi trường: file được cập nhật khi ConfigMap đổi, biến thì không.',
      'Không có lệnh nào trong game phân giải tên hộ bạn, nên phép kiểm là đối chiếu: namespace của pod gọi, đặt cạnh namespace của Service đích. Khác nhau thì tên ngắn chắc chắn hỏng, không cần thử.',
    ],
    pitfalls: [
      'Nghĩ namespace cách ly mạng nên đi tìm firewall hoặc quyền truy cập. Giả thuyết đó nghe rất hợp lý vì namespace vẫn được gọi là ranh giới, chỉ có điều nó là ranh giới của tên chứ không phải của gói tin.',
      'Sửa ConfigMap rồi chờ pod tự nhận. Lệnh sửa báo thành công và ConfigMap đúng thật, nhưng tiến trình trong container vẫn giữ nguyên biến nó đọc từ lúc khởi động.',
    ],
  },
};
