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
  brief: `Một đồng nghiệp vừa đẩy pod \`api\` lên namespace \`thanh-toan\` rồi tan ca.
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
    namespaces: ['thanh-toan'],
    resources: [
      {
        kind: 'Pod',
        name: 'api-cu',
        namespace: 'thanh-toan',
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
        namespace: 'thanh-toan',
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
      args: { namespace: 'thanh-toan', name: 'api' },
      required: true,
    },
    {
      id: 'dung-tag',
      label: 'Pod `api` dùng một tag image có thật',
      check: 'container-image-is',
      args: { kind: 'Pod', name: 'api', namespace: 'thanh-toan', image: 'ghcr.io/dlp/api:1.4.2' },
      required: true,
    },
    {
      id: 'khong-lam-hong-cai-dang-chay',
      label: 'Pod `api-cu` vẫn chạy nguyên vẹn',
      check: 'pod-running',
      args: { namespace: 'thanh-toan', name: 'api-cu' },
      required: true,
    },
  ],
  hints: [
    '`kubectl get pods` chỉ cho bạn biết pod KHÔNG ổn. Muốn biết vì sao, dùng `kubectl describe pod api -n thanh-toan` và đọc phần Events ở cuối — đó là nhật ký kubelet ghi lại từng bước nó thử làm.',
    'Events nói kubelet không kéo được image về. Trước khi sửa, hãy đọc chính xác chuỗi image mà pod đang khai báo: `kubectl get pod api -n thanh-toan -o jsonpath="{.spec.containers[*].image}"`.',
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
};
