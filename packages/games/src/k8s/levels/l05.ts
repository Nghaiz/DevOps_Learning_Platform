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
  teaching: {
    primer: `Level 1 nói pod là một lớp bọc quanh container. Level này là chỗ định nghĩa đó
trở thành thứ dùng được: pod là một **ranh giới chia sẻ**.

Mọi container trong cùng một pod dùng chung hai thứ:

- **Mạng.** Chung một địa chỉ IP, gọi nhau qua \`localhost\`. Hệ quả kèm theo: hai
  container trong cùng pod không được nghe cùng một cổng, vì chúng chia nhau đúng
  một bộ cổng.
- **Volume.** Volume khai ở **cấp pod**, rồi mỗi container tự khai \`volumeMounts\`
  để gắn nó vào một đường dẫn bên trong mình.

Hai bước đó là hai bước riêng, và đây là chỗ hay hỏng: khai volume mà chỉ một
container mount thì không có chia sẻ nào cả, chỉ có một container nhìn thấy thư
mục còn container kia mở ra khoảng trống.

Loại volume đơn giản nhất là \`emptyDir\`: một thư mục rỗng sinh ra khi pod được
xếp lên node và biến mất khi pod bị xoá. Nó hợp cho việc trao đổi tạm giữa các
container, không hợp cho dữ liệu cần sống lâu hơn pod.

**Sidecar** là tên của khuôn mẫu bạn đang dựng: một container phụ thêm năng lực
cho container chính (thu log, đẩy metric, làm proxy) mà không phải sửa image của
ứng dụng.

Nhìn vào đâu: phần Mounts trong \`describe\` của **từng** container.`,
    cheatsheet: [
      {
        command: 'kubectl logs don-hang -c sidecar -n ban-hang',
        explain: 'Pod nhiều container thì bắt buộc chỉ tên container bằng `-c`, không thì kubectl hỏi lại.',
      },
      {
        command: 'kubectl describe pod don-hang -n ban-hang',
        explain: 'Mỗi container có phần Mounts riêng. So hai phần đó là cách thấy volume có thật sự chung hay không.',
      },
      {
        command: 'kubectl exec -it don-hang -c sidecar -n ban-hang -- ls /var/log/app',
        explain: 'Đứng từ trong sidecar nhìn ra thư mục chung, bằng chứng trực tiếp nhất.',
      },
      {
        command: 'kubectl get pod don-hang -n ban-hang -o jsonpath="{.spec.volumes[*].name}"',
        explain: 'Liệt kê volume đang khai ở cấp pod, trước khi đi kiểm từng container.',
      },
    ],
    takeaways: [
      'Pod là ranh giới chia sẻ mạng và volume, không phải một cái tên khác của container.',
      'Volume khai ở cấp pod còn mount khai ở cấp container: thiếu một trong hai thì không có chia sẻ.',
      'Sidecar thêm năng lực cho ứng dụng mà không cần sửa image của nó.',
      'emptyDir sống và chết cùng pod, nên nó là chỗ trao đổi tạm chứ không phải chỗ lưu dữ liệu.',
    ],
    proTips: [
      'Đặt tên container rõ vai trò (`app`, `log-sidecar`), vì mọi lệnh logs và exec sau này đều phải gọi đúng tên đó.',
      'Cần một việc chạy XONG trước khi ứng dụng khởi động thì đó là `initContainers`, không phải sidecar. Sidecar chạy song song, init chạy trước.',
    ],
    pitfalls: [
      'Chỉ mount volume ở container chính, vì nghe hợp lý rằng log là của ứng dụng. Pod vẫn lên Running bình thường và sidecar mở ra một thư mục rỗng, nên lỗi này im lặng.',
      'Cho hai container cùng nghe cổng 8080. Chúng chia nhau một không gian mạng nên cái thứ hai sẽ không bind được, dù trong hai pod riêng thì việc đó hoàn toàn hợp lệ.',
    ],
  },
};
