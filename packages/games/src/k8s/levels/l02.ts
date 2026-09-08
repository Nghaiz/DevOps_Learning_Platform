import type { Level } from '../contract.ts';

/**
 * Sự cố đầu tiên, và cố ý chọn loại DỄ ĐỌC NHẤT: kubelet ghi thẳng lý do vào
 * Events. Người chơi học được một thói quen sẽ dùng lại ở 30 level sau — pod
 * không lên thì đọc `describe` trước, đoán sau.
 *
 * Đáp án nằm TRONG cụm chứ không nằm trong brief: pod `api-cu` đang chạy cùng
 * ứng dụng với tag có thật. Đây là chủ ý — ở production không ai đưa sẵn tag
 * đúng cho bạn, bạn phải tìm nó từ thứ đang chạy được.
 */
export const l02: Level = {
  id: 'k8s-02-tag-image-khong-ton-tai',
  chapter: 1,
  title: 'Pod không bao giờ khởi động',
  brief: `Một đồng nghiệp vừa đẩy pod \`api\` lên namespace \`nen-tang\` rồi tan ca.
Pod đó đã nằm đó mười lăm phút và chưa từng chạy. Cột READY ghi \`0/1\`, cột
STATUS không phải Running.

Điều đáng chú ý: bên cạnh nó, pod \`api-cu\` vẫn chạy bình thường, phục vụ đúng
ứng dụng đó. Nghĩa là node khoẻ, mạng thông, namespace không có gì chặn — vấn đề
nằm ở chính pod mới.

**Việc cần làm:** đưa pod \`api\` về trạng thái Running.

Đây là lúc học một thói quen quan trọng hơn cả đáp án của level này: khi một pod
không lên được, thứ đầu tiên cần đọc không phải là log của ứng dụng. Ứng dụng
còn chưa chạy thì lấy đâu ra log. Thứ cần đọc là những gì **kubelet** đã ghi lại
khi nó cố tạo container và thất bại.`,
  difficulty: 'basic',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['nen-tang'],
    resources: [
      {
        kind: 'Pod',
        name: 'api-cu',
        namespace: 'nen-tang',
        spec: {
          labels: { app: 'api', phien_ban: 'cu' },
          containers: [
            { name: 'api', image: 'ghcr.io/dlp/api:1.4.2', ports: [{ containerPort: 8080 }] },
          ],
        },
      },
      {
        kind: 'Pod',
        name: 'api',
        namespace: 'nen-tang',
        spec: {
          labels: { app: 'api', phien_ban: 'moi' },
          containers: [
            { name: 'api', image: 'ghcr.io/dlp/api:1.4.2-hotfix', ports: [{ containerPort: 8080 }] },
          ],
        },
        seededIncident: 'image-tag-sai',
      },
    ],
  },
  allowedResources: ['Pod'],
  objectives: [
    {
      id: 'api-chay',
      label: 'Pod `api` ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'nen-tang', name: 'api' },
      required: true,
    },
    {
      id: 'dung-tag',
      label: 'Pod `api` dùng một tag image có thật',
      check: 'container-image-is',
      args: { kind: 'Pod', name: 'api', namespace: 'nen-tang', image: 'ghcr.io/dlp/api:1.4.2' },
      required: true,
    },
    {
      id: 'khong-lam-hong-cai-dang-chay',
      label: 'Pod `api-cu` vẫn chạy nguyên vẹn',
      check: 'pod-running',
      args: { namespace: 'nen-tang', name: 'api-cu' },
      required: true,
    },
  ],
  hints: [
    '`kubectl get pods` chỉ cho bạn biết pod KHÔNG ổn. Muốn biết vì sao, dùng `kubectl describe pod api -n nen-tang` và đọc phần Events ở cuối — đó là nhật ký kubelet ghi lại từng bước nó thử làm.',
    'Events nói kubelet không kéo được image về. Trước khi sửa, hãy đọc chính xác chuỗi image mà pod đang khai báo: `kubectl get pod api -n nen-tang -o jsonpath="{.spec.containers[*].image}"`.',
    'Trong namespace này có một pod khác đang chạy được cùng ứng dụng đó. Tag mà nó dùng là tag chắc chắn tồn tại trong registry. So hai chuỗi image với nhau, rồi sửa pod `api` về tag đó.',
  ],
  parMoves: 2,
  teaches: [
    'ImagePullBackOff',
    'kubectl describe',
    'pod events',
    'image tag',
    'container registry',
  ],
  teaching: {
    primer: `Để một pod chạy được, kubelet trên node làm ba việc theo thứ tự: **kéo image**
về máy, **tạo container** từ image đó, rồi **chạy** nó. Mỗi bước hỏng cho một
triệu chứng khác nhau, và biết pod chết ở bước nào là một nửa việc chẩn đoán.

Level này dừng ở bước một. \`ImagePullBackOff\` nghĩa là kubelet đã thử kéo image
và thất bại, nên chưa có container nào tồn tại. Hệ quả rất thực tế: **không có
log để đọc**. Ứng dụng còn chưa khởi động thì không có gì để ghi ra.

Thứ có ghi lại là **Events** của pod. Kubelet ghi vào đó từng lần thử và từng
lỗi, và \`kubectl describe pod\` in chúng ở cuối. Chữ *BackOff* nghĩa là nó vẫn
đang thử lại, mỗi lần chờ lâu hơn lần trước, nên trạng thái này không tự khỏi.

Một chuỗi image gồm ba phần: \`registry/repository:tag\`. Ba nguyên nhân thường
gặp là tag không tồn tại, registry không với tới được, và registry riêng tư mà
pod không có thông tin đăng nhập. Ở đây node vẫn kéo được image cho pod khác
trong cùng namespace, nên hai nguyên nhân sau đã tự loại trừ.

Nhìn vào đâu: Events của pod, rồi chuỗi image mà pod đang khai, rồi một thứ đang
chạy được để đối chiếu.`,
    cheatsheet: [
      {
        command: 'kubectl describe pod api -n nen-tang',
        explain: 'Events ở cuối là nhật ký kubelet. Lỗi kéo image nằm ở đó, không nằm trong log.',
      },
      {
        command: 'kubectl get pod api -n nen-tang -o jsonpath="{.spec.containers[*].image}"',
        explain: 'In đúng chuỗi image pod đang khai, tránh đọc nhầm bằng mắt.',
      },
      {
        command: 'kubectl get pods -n nen-tang -o wide',
        explain: 'So pod hỏng với pod đang chạy cạnh nó: cùng node thì loại trừ được lỗi mạng của node.',
      },
      {
        command: 'kubectl get events -n nen-tang --sort-by=.lastTimestamp',
        explain: 'Xem mọi sự kiện trong namespace theo thứ tự thời gian khi chưa biết pod nào có lỗi.',
      },
      {
        command: 'kubectl set image pod/api api=ghcr.io/dlp/api:1.4.2 -n nen-tang',
        explain: 'Đổi image của một container đã khai, không phải viết lại cả pod.',
      },
    ],
    takeaways: [
      'Pod chưa từng có container thì chưa từng có log: chỗ đọc là Events, không phải `kubectl logs`.',
      'ImagePullBackOff là chuyện giữa kubelet và registry, xảy ra trước khi ứng dụng của bạn được đụng tới.',
      'Tag là một phần của tên image, nên sai tag là sai tên chứ không phải sai phiên bản.',
      'Một pod đang chạy cùng ứng dụng là nguồn đáng tin để tra ra tag có thật, đáng tin hơn trí nhớ.',
    ],
    proTips: [
      'Phân biệt hai lỗi hay bị gộp: `ErrImagePull` là lần thử vừa hỏng, `ImagePullBackOff` là kubelet đang chờ trước khi thử lại.',
      'Đọc Events ngay cả khi bạn đã đoán ra nguyên nhân. Nó tốn hai giây và loại bỏ được cả một nhánh phỏng đoán sai.',
    ],
    pitfalls: [
      'Chạy `kubectl logs` đầu tiên vì đó là phản xạ quen. Log trống làm nhiều người tưởng ứng dụng im lặng, trong khi thật ra nó chưa bao giờ được khởi động.',
      'Xoá pod rồi tạo lại y hệt. Bộ đếm BackOff về không nên trạng thái trông khá hơn trong vài giây, nhưng chuỗi image vẫn sai và pod hỏng lại đúng như cũ.',
    ],
  },
};
