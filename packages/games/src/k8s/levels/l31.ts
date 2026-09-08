import type { Level } from '../contract.ts';

/**
 * NetworkPolicy lành: dựng default-deny rồi mở đúng những đường cần thiết.
 *
 * Bẫy DNS được đặt tường minh làm một mục tiêu bắt buộc, không để nó thành một
 * bất ngờ khó chịu. Đây là sai lầm phổ biến nhất khi áp default-deny lần đầu:
 * chặn hết egress thì cổng 53 cũng bị chặn, và mọi lời gọi theo tên chết theo —
 * triệu chứng thì lại trông như 'DNS hỏng', xa nhất có thể khỏi nguyên nhân.
 */
export const l31: Level = {
  id: 'k8s-31-mac-dinh-cam-roi-mo-dung-duong',
  chapter: 6,
  title: 'Cấm hết trước, rồi mở đúng thứ cần',
  brief: `Namespace \`y-te\` chứa dữ liệu bệnh án và vừa bị đội an ninh gắn cờ: bất kỳ pod
nào trong namespace cũng gọi thẳng được vào \`api\`. Mặc định của Kubernetes là
**mọi pod nói chuyện được với mọi pod**, kể cả xuyên namespace — không có
NetworkPolicy nào thì không có rào nào.

Hiện có ba workload:

- \`web\` — giao diện, **cần** gọi \`api\` ở cổng 8080.
- \`api\` — dịch vụ giữ dữ liệu.
- \`bao-cao\` — công cụ xuất báo cáo, đọc thẳng từ cơ sở dữ liệu và **không được**
  gọi \`api\`.

**Việc cần làm:** dựng NetworkPolicy trong \`y-te\` sao cho \`web\` gọi được
\`api\` ở cổng 8080, \`bao-cao\` **không** gọi được \`api\`, và \`web\` vẫn phân
giải được tên \`api.y-te.svc.cluster.local\`.

Mục tiêu thứ ba trông thừa, và nó là phần đáng học nhất của level. NetworkPolicy
lọc ở tầng IP và cổng, nên nó không biết gì về DNS — nó chỉ thấy các gói UDP đi
ra cổng 53 nhắm tới CoreDNS ở một namespace khác. Một policy egress "cấm hết rồi
mở cổng 8080 tới api" là hợp lý về mặt ý định, và nó sẽ chặn luôn cổng 53.

Khi đó \`web\` không phân giải nổi tên nào nữa. Triệu chứng là \`no such host\`,
trông hệt như CoreDNS chết — trong khi bạn vừa tự tay gây ra nó bằng một policy
mà bạn tin là chỉ động tới cổng 8080.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['y-te'],
    resources: [
      {
        kind: 'Pod',
        name: 'web',
        namespace: 'y-te',
        spec: {
          labels: { app: 'web', tang: 'frontend' },
          containers: [
            { name: 'web', image: 'nginx:1.27-alpine', ports: [{ containerPort: 80 }] },
          ],
        },
      },
      {
        kind: 'Pod',
        name: 'api',
        namespace: 'y-te',
        spec: {
          labels: { app: 'api', tang: 'backend' },
          containers: [
            { name: 'api', image: 'ghcr.io/dlp/api:1.5.0', ports: [{ containerPort: 8080 }] },
          ],
        },
      },
      {
        kind: 'Pod',
        name: 'bao-cao',
        namespace: 'y-te',
        spec: {
          labels: { app: 'bao-cao', tang: 'cong-cu' },
          containers: [
            { name: 'bao-cao', image: 'ghcr.io/dlp/bao-cao:2.1.0', ports: [{ containerPort: 8080 }] },
          ],
        },
      },
      {
        kind: 'Service',
        name: 'api',
        namespace: 'y-te',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'api' },
          ports: [{ port: 8080, targetPort: 8080, protocol: 'TCP' }],
        },
      },
    ],
  },
  allowedResources: ['NetworkPolicy'],
  objectives: [
    {
      id: 'web-goi-duoc-api',
      label: '`web` gọi được `api` ở cổng 8080',
      check: 'netpol-allows',
      args: {
        namespace: 'y-te',
        fromLabels: { app: 'web' },
        toLabels: { app: 'api' },
        port: 8080,
      },
      required: true,
    },
    {
      id: 'bao-cao-bi-chan',
      label: '`bao-cao` KHÔNG gọi được `api`',
      check: 'netpol-denies',
      args: {
        namespace: 'y-te',
        fromLabels: { app: 'bao-cao' },
        toLabels: { app: 'api' },
        port: 8080,
      },
      required: true,
    },
    {
      id: 'dns-van-song',
      label: '`web` vẫn phân giải được tên của Service `api`',
      check: 'dns-resolves',
      args: { namespace: 'y-te', fromName: 'web', toName: 'api.y-te.svc.cluster.local' },
      required: true,
    },
  ],
  hints: [
    'NetworkPolicy chọn pod nó bảo vệ bằng `podSelector`, rồi khai `policyTypes` là Ingress, Egress, hoặc cả hai. Một pod chỉ cần bị MỘT policy chạm tới là nó chuyển từ "mở hết" sang "chỉ những gì được cho phép tường minh".',
    'Luật ingress trả lời "ai được vào tôi"; luật egress trả lời "tôi được đi đâu". Chúng độc lập, và một kết nối cần được cả hai đầu cho phép. Với `api`, ingress là đủ; nếu bạn cũng đặt egress cho `web` thì phải tự mở lấy mọi đường `web` cần đi.',
    'Cách gọn nhất: một policy chọn `app=api`, `policyTypes: [Ingress]`, với một luật ingress cho `podSelector: app=web` ở cổng 8080. `bao-cao` bị chặn tự động vì nó không nằm trong luật nào. Nếu bạn thêm policy egress cho `web`, nhớ mở thêm cổng 53 UDP và TCP tới CoreDNS — không có nó thì `web` mất khả năng phân giải tên.',
  ],
  parMoves: 2,
  teaches: [
    'NetworkPolicy',
    'default deny',
    'podSelector',
    'policyTypes ingress và egress',
    'egress DNS cổng 53',
    'chỉ cho phép tường minh',
  ],
  teaching: {
    primer: `Mặc định của Kubernetes là **mọi pod nói chuyện được với mọi pod**, kể cả xuyên
namespace. Namespace là ranh giới đặt tên và phân quyền, không phải ranh giới
mạng.

**NetworkPolicy** là thứ dựng ranh giới mạng, và nó hoạt động theo một quy tắc
cần nhớ chính xác:

> Một pod **không** bị policy nào chọn thì mở hết. Ngay khi có **một** policy
> chọn nó, pod chuyển sang chế độ chỉ-cho-phép-tường-minh cho **chiều** mà
> policy đó khai.

Ba phần của một policy:

- \`podSelector\` — chọn pod được bảo vệ. Để rỗng là chọn **mọi** pod trong
  namespace, và đó là cách viết luật default-deny.
- \`policyTypes\` — \`Ingress\` (ai được vào), \`Egress\` (được đi đâu), hoặc cả
  hai. Khai một chiều thì chiều còn lại vẫn mở.
- \`ingress\` / \`egress\` — danh sách luật cho phép. Nhiều policy cùng chạm một
  pod thì hợp lại là phép **hợp**, và **không có luật từ chối** — NetworkPolicy
  chỉ biết cho phép.

Một kết nối cần được cho phép ở **cả hai đầu**: egress của bên gọi và ingress của
bên nhận.

Cái bẫy lớn nhất là DNS. Policy egress chặn hết rồi chỉ mở cổng ứng dụng sẽ chặn
luôn cổng **53** đi tới CoreDNS, và mọi lời gọi theo tên chết theo. Triệu chứng
là \`no such host\`, trông y hệt CoreDNS hỏng.`,
    cheatsheet: [
      { command: 'kubectl get networkpolicy -n <ns>', explain: 'Liệt kê mọi policy đang có hiệu lực trong namespace.' },
      { command: 'kubectl describe networkpolicy <tên> -n <ns>', explain: 'Đọc podSelector, policyTypes và từng luật cho phép.' },
      { command: 'kubectl get pods -n <ns> --show-labels', explain: 'Policy chọn pod bằng label, nên label thật là thứ quyết định ai bị chạm.' },
      { command: 'kubectl exec <pod> -n <ns> -- nslookup <service>', explain: 'Tách lỗi DNS khỏi lỗi kết nối: phân giải được tên hay không.' },
      { command: 'kubectl exec <pod> -n <ns> -- wget -qO- --timeout=3 <đích>:<cổng>', explain: 'Thử kết nối thật từ đúng pod bị chặn.' },
    ],
    takeaways: [
      'Không có policy thì mọi pod nói chuyện được với mọi pod; namespace không chặn traffic.',
      'Một pod bị bất kỳ policy nào chọn sẽ chuyển sang chỉ-cho-phép-tường-minh cho chiều đó.',
      'NetworkPolicy chỉ có luật cho phép; nhiều policy hợp lại chứ không phủ định nhau.',
      'Policy egress mà quên mở cổng 53 sẽ giết DNS, và triệu chứng trông như CoreDNS hỏng.',
    ],
    pitfalls: [
      'Viết luôn một policy egress "cấm hết, chỉ mở cổng ứng dụng". Nó đọc rất chặt chẽ và đúng ý định, nhưng cổng 53 không phải cổng ứng dụng nên nó bị chặn cùng — và bạn sẽ đi tìm lỗi ở CoreDNS thay vì ở policy mình vừa viết.',
      'Nghĩ rằng khai một chiều là đủ để chặn cả hai. Khai `policyTypes: [Ingress]` thì egress của pod đó vẫn mở hoàn toàn.',
    ],
  },
};
