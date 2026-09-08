import type { Level } from '../contract.ts';

/**
 * Level cuối chương 1 và là level đầu tiên phải TẠO một cấu trúc chứ không chỉ
 * một object. Nó chốt lại định nghĩa mà level 1 mới chỉ nói suông: pod là ranh
 * giới chia sẻ, không phải cái tên khác của container.
 *
 * Kiểm bằng `volume-mounted` chứ không bằng "đếm container": thứ đáng kiểm là
 * hai container có THẬT SỰ dùng chung một volume hay không, chứ không phải trong
 * pod có mấy cái tên.
 */
export const l05: Level = {
  id: 'k8s-05-hai-container-chung-mot-pod',
  chapter: 1,
  title: 'Hai container, một pod',
  brief: `Ứng dụng \`don-hang\` ghi log ra file trong thư mục \`/var/log/app\` thay vì ghi ra
stdout. Đó là một thiết kế cũ, bạn không sửa được image của nó, và hệ thống thu
log của công ty chỉ đọc được stdout.

Cách xử lý quen thuộc trong Kubernetes là đặt thêm một container thứ hai vào
**cùng pod**: nó không phục vụ request nào, chỉ đọc file log rồi in ra stdout.
Kiểu container này gọi là **sidecar**.

Cách này chạy được là vì pod không phải một cái tên khác của container. Pod là
một **ranh giới chia sẻ**: mọi container trong cùng pod nhìn thấy cùng địa chỉ
IP, gọi nhau qua \`localhost\`, và mount được cùng một volume. Một thư mục trống
sống cùng vòng đời với pod là đủ để hai container trao đổi file với nhau.

**Việc cần làm:** dựng pod \`don-hang\` trong namespace \`ban-hang\` gồm hai
container — ứng dụng chính (\`ghcr.io/dlp/don-hang:3.0.1\`) và một sidecar
(\`busybox:1.37\`) — cùng gắn một volume vào \`/var/log/app\`, rồi đưa pod tới
Running.

Nếu chỉ container chính mount volume, log vẫn nằm trong container đó và sidecar
không nhìn thấy gì. Chia sẻ chỉ có thật khi cả hai bên cùng mount.`,
  difficulty: 'basic',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['ban-hang'],
    resources: [],
  },
  allowedResources: ['Pod'],
  objectives: [
    {
      id: 'pod-chay',
      label: 'Pod `don-hang` ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'ban-hang', name: 'don-hang' },
      required: true,
    },
    {
      id: 'volume-chung',
      label: 'Pod có volume được mount vào `/var/log/app`',
      check: 'volume-mounted',
      args: { podName: 'don-hang', namespace: 'ban-hang', mountPath: '/var/log/app' },
      required: true,
    },
    {
      id: 'dung-image-chinh',
      label: 'Container chính dùng image `ghcr.io/dlp/don-hang:3.0.1`',
      check: 'container-image-is',
      args: {
        kind: 'Pod',
        name: 'don-hang',
        namespace: 'ban-hang',
        image: 'ghcr.io/dlp/don-hang:3.0.1',
      },
      required: false,
    },
  ],
  hints: [
    'Trường `containers` của pod là một danh sách. Không có luật nào bắt nó chỉ có một phần tử — mỗi phần tử cần tên riêng và image riêng.',
    'Volume khai ở cấp pod (trường `volumes`), rồi mỗi container tự khai `volumeMounts` trỏ tới tên volume đó. Loại volume đơn giản nhất là `emptyDir`: một thư mục trống sinh ra khi pod được xếp lên node và biến mất khi pod bị xoá.',
    'Khai một volume `emptyDir` tên `log`, rồi thêm `volumeMounts` với `mountPath: /var/log/app` vào CẢ HAI container. Sidecar dùng busybox chạy lệnh đọc file, ví dụ `tail -F /var/log/app/app.log`.',
  ],
  parMoves: 3,
  teaches: [
    'multi-container pod',
    'sidecar',
    'emptyDir',
    'volumeMounts',
    'shared network namespace',
    'localhost',
  ],
};
