import type { Level } from '../contract.ts';

/**
 * Level cuối chương 1 và là level đầu tiên phải TẠO một cấu trúc chứ không chỉ
 * một object. Nó chốt lại định nghĩa mà level 1 mới chỉ nói suông: pod là ranh
 * giới chia sẻ, không phải cái tên khác của container.
 *
 * Kiểm bằng `volume-mounted` chứ không bằng "đếm container": thứ đáng kiểm là
 * hai container có THẬT SỰ dùng chung một volume hay không, chứ không phải trong
 * pod có mấy cái tên.
 *
 * ⚠ HAI mountPath khác nhau (`/var/log/app` cho ứng dụng, `/logs` cho sidecar)
 * là chủ ý, và lý do là một ràng buộc của vị từ chứ không phải sở thích.
 * `volume-mounted` nhận `{ podName, namespace, mountPath }` — không có chiều
 * container. Nếu hai container cùng mount một đường dẫn thì MỘT ô mục tiêu là
 * tất cả những gì diễn đạt được, và nó đạt ngay cả khi người chơi chỉ mount
 * container chính: đúng cái sai lầm mà level này dạy sẽ lọt qua cửa, và
 * takeaway sẽ khẳng định một điều chưa hề được kiểm.
 *
 * Cho mỗi container một đường dẫn riêng làm hai ô mục tiêu tách nhau ra, nên
 * thiếu một bên là không qua được. Nó cũng dạy thêm được một điều đúng và hay bị
 * hiểu nhầm: thứ chung là VOLUME chứ không phải ĐƯỜNG DẪN.
 */
export const l05: Level = {
  id: 'k8s-05-hai-container-chung-mot-pod',
  chapter: 1,
  title: 'Hai container, một pod',
  mission: 'Dựng pod `don-hang` gồm hai container dùng chung một volume, rồi đưa nó tới Running.',
  brief: `Ứng dụng \`don-hang\` ghi log ra file trong \`/var/log/app\` thay vì ra stdout. Bạn
không sửa được image của nó, và hệ thống thu log của công ty chỉ đọc stdout.

Cách xử lý quen thuộc là đặt thêm một container thứ hai vào cùng pod: nó chỉ đọc
file log rồi in ra stdout.`,
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
      id: 'ung-dung-ghi-duoc',
      label: 'Volume được mount vào `/var/log/app` cho ứng dụng ghi log',
      check: 'volume-mounted',
      args: { podName: 'don-hang', namespace: 'ban-hang', mountPath: '/var/log/app' },
      required: true,
    },
    {
      id: 'sidecar-doc-duoc',
      label: 'Cùng volume đó được mount vào `/logs` cho sidecar đọc',
      check: 'volume-mounted',
      args: { podName: 'don-hang', namespace: 'ban-hang', mountPath: '/logs' },
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
    'Volume khai ở cấp pod (trường `volumes`), rồi mỗi container tự khai `volumeMounts` trỏ tới tên volume đó. Hai container trỏ về CÙNG MỘT TÊN volume là đang dùng chung một chỗ, kể cả khi `mountPath` của chúng khác nhau. Loại volume đơn giản nhất là `emptyDir`: một thư mục trống sinh ra khi pod được xếp lên node và biến mất khi pod bị xoá.',
    'Khai một volume `emptyDir` tên `log`. Container chính thêm `volumeMounts` với `name: log` và `mountPath: /var/log/app`; sidecar cũng `name: log` nhưng `mountPath: /logs`. Sidecar dùng busybox đọc file ở chỗ của chính nó, ví dụ `tail -F /logs/app.log`.',
  ],
  parMoves: 3,
  teaches: [
    'multi-container pod',
    'sidecar',
    'emptyDir',
    'volumeMounts',
    'mountPath',
    'shared network namespace',
    'localhost',
  ],
  teaching: {
    primer: `Pod không phải cái tên khác của container. Nó là một **ranh giới chia sẻ**: mọi
container trong cùng pod dùng chung một địa chỉ IP và dùng chung được volume.

Volume khai ở **cấp pod**; mỗi container tự khai \`volumeMounts\` để gắn nó vào một
đường dẫn bên trong mình.

Thứ được chia sẻ là **volume**, không phải đường dẫn: hai container trỏ về cùng
một tên volume là dùng chung một chỗ, kể cả khi \`mountPath\` khác nhau.

\`emptyDir\` là loại volume đơn giản nhất: một thư mục rỗng sinh ra cùng pod và mất
cùng pod. **Sidecar** là container phụ thêm năng lực cho container chính mà không
phải sửa image.`,
    cheatsheet: [
      {
        command: 'kubectl get pods -n ban-hang',
        explain: 'Cột READY dạng `2/2` xác nhận pod có HAI container chứ không phải một.',
      },
      {
        command: 'kubectl describe pod don-hang -n ban-hang',
        explain:
          'Mỗi container một khối riêng kèm tên và image. Đây là chỗ xác nhận sidecar nằm trong ĐÚNG pod đó, không phải một pod thứ hai.',
      },
      {
        command: 'kubectl logs don-hang -c don-hang -n ban-hang',
        explain:
          'Log của container chính. Nó ghi ra file chứ không ra stdout nên chỗ này gần như trống — và đó chính là lý do pod cần một sidecar.',
      },
      {
        command: 'kubectl logs don-hang -c sidecar -n ban-hang',
        explain:
          'Log của sidecar, và là bằng chứng cuối cùng: thấy log ứng dụng hiện ra ở đây nghĩa là volume chung đã hoạt động thật.',
      },
    ],
    takeaways: [
      'Pod là ranh giới chia sẻ mạng và volume, và sidecar là cách khai thác ranh giới đó mà không phải sửa image của ứng dụng.',
      'Volume khai ở cấp pod còn mount khai ở cấp container: thiếu vế nào thì cũng không có chia sẻ.',
      'Thứ được chia sẻ là volume chứ không phải đường dẫn, nên hai container mount cùng một volume ở hai mountPath khác nhau vẫn nhìn vào đúng một thư mục.',
      'emptyDir sống và chết cùng pod, nên nó là chỗ trao đổi tạm chứ không phải chỗ lưu dữ liệu.',
    ],
    proTips: [
      'Đặt tên container rõ vai trò (`app`, `log-sidecar`), vì mọi lệnh logs và exec sau này đều phải gọi đúng tên đó.',
      'Sidecar chỉ đọc thì cho nó `readOnly: true` trong `volumeMounts`. Nó không thể lỡ tay ghi đè log của ứng dụng, và ý định của bạn hiện ngay trong manifest.',
      'Cần một việc chạy XONG trước khi ứng dụng khởi động thì đó là `initContainers`, không phải sidecar. Sidecar chạy song song, init chạy trước.',
      'Không lệnh nào trong game in ra danh sách mount, nên chỗ xác nhận chia sẻ là chính bản khai: `volumes` ở cấp pod, rồi `volumeMounts` của CẢ HAI container cùng trỏ về một `name`. Hai `mountPath` khác nhau vẫn là dùng chung.',
    ],
    pitfalls: [
      'Chỉ mount volume ở container chính, vì nghe hợp lý rằng log là của ứng dụng. Pod vẫn lên Running bình thường và sidecar mở ra một thư mục rỗng, nên nếu chỉ nhìn trạng thái pod thì lỗi này hoàn toàn im lặng.',
      'Nghĩ rằng hai container phải dùng CÙNG một mountPath thì mới chia sẻ được. Hình dung "cùng một thư mục" nghe rất tự nhiên, nhưng thứ nối hai container là tên volume trong `volumeMounts`, còn `mountPath` chỉ nói volume đó xuất hiện ở chỗ nào bên trong mỗi container.',
      'Cho hai container cùng nghe cổng 8080. Chúng chia nhau một không gian mạng nên cái thứ hai sẽ không bind được, dù trong hai pod riêng thì việc đó hoàn toàn hợp lệ.',
    ],
  },
};
