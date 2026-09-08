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
  mission: 'Đưa pod `api` trong `nen-tang` về Running mà không đụng tới pod `api-cu` đang chạy.',
  brief: `Một đồng nghiệp đẩy pod \`api\` lên namespace \`nen-tang\` rồi tan ca. Mười lăm phút
sau nó vẫn chưa từng chạy: READY \`0/1\`, STATUS không phải Running.

Ngay cạnh nó, pod \`api-cu\` phục vụ đúng ứng dụng đó bình thường. Node khoẻ, mạng
thông — vấn đề nằm ở chính pod mới.`,
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
            {
              name: 'api',
              image: 'ghcr.io/dlp/api:1.4.2-hotfix',
              ports: [{ containerPort: 8080 }],
            },
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
    'Events nói kubelet không kéo được image về. Trước khi sửa, hãy đọc chính xác chuỗi image mà pod đang khai báo: `kubectl describe pod api -n nen-tang`, dòng Image trong khối Containers.',
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
    primer: `Để một pod chạy được, kubelet làm ba việc theo thứ tự: **kéo image** về node,
**tạo container** từ image đó, rồi **chạy** nó. Biết pod chết ở bước nào là một
nửa việc chẩn đoán.

\`ImagePullBackOff\` là hỏng ở bước một: kubelet đã thử kéo image và thất bại, nên
chưa có container nào tồn tại. Hệ quả: **không có log để đọc**. Chữ *BackOff*
nghĩa là nó vẫn thử lại, mỗi lần chờ lâu hơn, nên trạng thái này không tự khỏi.

Thứ có ghi lại là **Events** của pod — nhật ký kubelet, in ở cuối \`describe\`.

Một chuỗi image gồm ba phần: \`registry/repository:tag\`. Sai bất kỳ phần nào cũng
cho cùng một triệu chứng.`,
    cheatsheet: [
      {
        command: 'kubectl describe pod api -n nen-tang',
        explain: 'Events ở cuối là nhật ký kubelet. Lỗi kéo image nằm ở đó, không nằm trong log.',
      },
      {
        command: 'kubectl get pods -n nen-tang',
        explain: 'Cột READY `0/1` cộng STATUS tách "chưa từng chạy" khỏi "chạy rồi chết".',
      },
      {
        command: 'kubectl describe pod api-cu -n nen-tang',
        explain:
          'Đọc chuỗi image của pod đang chạy được: đó là tag chắc chắn có thật trong registry.',
      },
      {
        command: 'kubectl edit pod api -n nen-tang',
        explain:
          'Sửa thẳng trường `image`. Với pod trần, đây là một trong số rất ít field đổi được.',
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
      'Tin vào trí nhớ về tag thay vì đọc từ một pod đang chạy được. Tag nghe hợp lý và tag có thật là hai chuyện khác nhau, và registry không tha thứ.',
    ],
  },
};
