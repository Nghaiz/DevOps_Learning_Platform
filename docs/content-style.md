# Soạn bài học và lab

Tài liệu cho người viết nội dung trong `content/`. Định dạng file nằm ở
[`scenario-format.md`](scenario-format.md) và [`lab-format.md`](lab-format.md);
sơ đồ ở [`diagrams.md`](diagrams.md). Ở đây là cách viết để người học thật sự học
được, và để bài chạy đúng trên sandbox.

## 1. Hai kiểu bài, hai lời hứa khác nhau

**Bài học** (`content/scenarios/`) giống Killercoda. Người học đi từng bước, đọc
một đoạn ngắn, bấm lệnh, nhìn kết quả, bấm Kiểm tra. Bài học được phép cầm tay:
đưa lệnh, giải thích từng cờ, chỉ ra chỗ cần nhìn.

**Lab** (`content/labs/`) giống KodeKloud. Người học nhận một việc và tự làm. Đề
nói trạng thái cuối phải đạt, với giá trị cụ thể (tên, cổng, đường dẫn, số bản
sao). Lab không có gợi ý, không có lệnh để bấm, và thông báo chấm không bao giờ
chỉ cách sửa. Ai chưa làm được thì quay lại bài học.

Một chủ đề gồm vài bài học, rồi một hai lab, rồi quiz. Lab kiểm đúng những kỹ năng
bài học đã dạy, cộng một chút suy luận: đề lab không chép lại bước của bài học.

## 2. Giọng văn

Viết như một kỹ sư đi trước kèm người mới ngồi cạnh: thẳng, cụ thể, đôi khi hài
hước, không rào đón. Xưng "bạn" với người học.

Những điều làm bài đọc như người viết:

- **Mở bằng tình huống, không mở bằng lời dẫn.** "Đêm qua dịch vụ thanh toán đứng
  hình 4 phút vì một tiến trình ăn hết CPU" thay cho "Trong bước này chúng ta sẽ
  tìm hiểu về tiến trình".
- **Số liệu và tên thật.** "Image này nặng 41 MB, gấp tám lần bản alpine" thay cho
  "image này khá lớn".
- **Câu dài ngắn xen nhau.** Một câu ba chữ đặt cạnh một câu ba mươi chữ. Một cột
  câu cùng độ dài là dấu hiệu máy viết.
- **Có quan điểm.** "Đừng dùng `latest` trong Dockerfile, vì sáu tháng sau không ai
  biết image đó là bản nào" thay cho "mỗi cách đều có ưu nhược điểm".
- **Kết ở chi tiết cuối cùng có ích**, không tóm tắt lại điều vừa nói.

Cấm (danh sách tiếng Việt của các dấu vết AI, xem thêm skill `t1k-human-writing`):

| Đừng viết | Viết thay |
|---|---|
| "không chỉ… mà còn…" | nói thẳng điều khẳng định |
| "đóng vai trò quan trọng / then chốt" | nói nó làm gì |
| "hãy cùng khám phá / tìm hiểu", "chúng ta sẽ đi sâu vào" | bắt đầu luôn |
| "trong thế giới DevOps ngày nay…" | bỏ câu đó |
| "một cách hiệu quả / liền mạch / toàn diện / tối ưu" | bỏ trạng từ, hoặc đưa số đo |
| "điều quan trọng cần lưu ý là…", "đáng chú ý là…" | nêu điều đó |
| "tóm lại", "nhìn chung", "như vậy chúng ta đã…" | dừng ở ý cuối |
| ba tính từ / ba vế song song liên tục | hai, bốn, hoặc một |
| in đậm mỗi câu một cụm | in đậm tối đa một thứ mỗi đoạn |
| emoji làm tiêu đề (🚀 💡 ✅) | không dùng |
| gạch ngang dài (—) mỗi câu một lần | dấu phẩy, dấu hai chấm, ngoặc, hoặc tách câu |
| "Chúc mừng! Bạn đã hoàn thành xuất sắc…" | nói người học giờ làm được gì |

Thuật ngữ: giữ tiếng Anh cho từ chuẩn của nghề (container, image, pod, commit,
branch, namespace), giải thích một lần bằng tiếng Việt ở chỗ xuất hiện đầu tiên.
Không dịch tên lệnh, cờ, trường YAML. Tiêu đề viết hoa chữ đầu câu, ngắn.

## 3. Cấu trúc một bài học

- **20–35 phút**, 4–7 bước. Bài dài hơn thì tách đôi.
- **intro.md**: hai đoạn. Một tình huống thật cho thấy vì sao kỹ năng này đáng học,
  và người học sẽ làm được gì khi xong. Không liệt kê lại tên các bước (FE đã hiện).
- **Mỗi bước**: một ý duy nhất. Khung thường gặp:
  1. Một hai câu đặt vấn đề.
  2. Lệnh để bấm (`{{exec}}`), mỗi khối một việc.
  3. Chỉ ra chỗ cần nhìn trong output ("cột `RESTARTS` đang là 4").
  4. Một nhận xét đáng nhớ hoặc một cái bẫy thật. Không phải lần nào cũng cần.
- Mỗi bước có verify trừ khi thật sự chỉ để đọc. Verify kiểm trạng thái mà lệnh
  của bước tạo ra, không kiểm việc người học đã bấm nút.
- **finish.md**: người học giờ làm được gì (một câu), một thử thách nhỏ tự làm
  không chấm, và lab nên làm tiếp theo.
- Sơ đồ khi một hình nói nhanh hơn ba đoạn chữ: lớp image, đường đi của gói tin,
  quan hệ Deployment → ReplicaSet → Pod, đồ thị commit. Không vẽ hình trang trí.

## 4. Cấu trúc một lab

- **30–60 phút**, 5–9 task, trọng số theo độ khó (1–3), mốc đạt 70–80%.
- `description` trong `lab.json`: bối cảnh ngắn kiểu ticket ("Bạn vừa nhận ca trực
  của nhóm nền tảng…"), một hai câu.
- **Mỗi task** (`task-<id>.md`):
  - Một câu bối cảnh nếu cần.
  - Yêu cầu dạng danh sách, mỗi dòng một điều kiện kiểm được, có giá trị cụ thể:
    tên tài nguyên, namespace, cổng, đường dẫn, nội dung file, số bản sao, nhãn.
  - Không lệnh. Không "dùng lệnh X để…". Không ẩn ý gợi cách làm.
  - Được phép đưa DỮ LIỆU người học cần chép nguyên văn (một chuỗi cấu hình, một
    khoá), trong khối code thường (không hậu tố hành động).
- Task độc lập với nhau, làm theo thứ tự nào cũng được. Setup dựng cảnh MỘT lần
  cho cả lab.
- Nếu có dữ liệu sinh ngẫu nhiên (log, số liệu), verify tính lại đáp án từ chính dữ
  liệu trong pod. Hai người học không chép được đáp án của nhau.

## 5. Khối lệnh trong bài học

- `` `lệnh`{{exec}} `` hoặc khối ```` ``` ````…```` ```{{exec}} ```` để bấm chạy;
  `{{copy}}` để chép. Mỗi khối phải **tự kết thúc**: cấm `-f`, `-w`, `watch`, `top`
  không có `-b -n1`, trình soạn thảo, `less`. Lệnh chạy mãi thì để `{{copy}}` và
  dặn người học bấm Ctrl+C.
- Lệnh gõ vào terminal **zsh** của người học, trong tmux, thư mục đầu là `/root`.
  `cd` ở bước trước còn hiệu lực ở bước sau. Lệnh phải chạy đúng trong zsh: glob
  không khớp gì thì zsh báo lỗi, khác bash.
- Đừng ghép mười lệnh vào một khối để "tiện". Người học cần thấy output từng việc.

## 6. Verify script

Áp cho cả bài học lẫn lab. Server ghép prelude vào đầu mọi verify
([`plans/labs-rebuild/contracts.md`](../plans/labs-rebuild/contracts.md) §C1),
nên trong script có sẵn:

```bash
pass "tiêu chí đã đạt"
fail "tiêu chí chưa đạt (hiện: giá trị thật)"
check "tiêu chí" lệnh_kiểm --cờ   # chạy lệnh, đạt khi exit 0
```

Một `fail` bất kỳ làm script thoát ≠ 0 kể cả khi quên `exit 1`.

- Bắt đầu `#!/bin/bash` + `set -uo pipefail`. Không `set -e`.
- Lab: mỗi task in ít nhất một dòng tiêu chí, nhãn nói điều kiện cần đạt và có thể
  kèm trạng thái thấy được, **không bao giờ** nói lệnh. Bài học: được nhắc lệnh của
  chính bước đó khi trượt.
- Chạy dưới 20 giây trên node rảnh. Chỉ đọc trạng thái (`inspect`, `get`, đọc file,
  `curl` tới localhost). Không `pull`, không `build`, không cài gì.
- Mọi lệnh có thể treo phải có `timeout` (`curl --max-time`, `timeout 10 …`,
  `kubectl --request-timeout=10s`).
- Chứng minh hai trạng thái: trượt khi chưa làm, đạt khi làm đúng. Bộ kiểm thử
  `scripts/content-smoke` làm việc này tự động; một bước chưa qua smoke là bước
  chưa xong.
- Chống đỗ giả: kiểm kết quả, không kiểm dấu vết. "File tồn tại" chưa đủ nếu đề đòi
  nội dung; "container tồn tại" chưa đủ nếu đề đòi nó đang chạy và trả lời HTTP.

## 7. Setup

- Bài học: `intro/background.sh` chạy ẩn khi mở bài, `intro/foreground.sh` được gõ
  vào terminal để người học thấy "đang chuẩn bị…". Giữ dưới 60 giây.
- Lab: `setup/background.sh` chạy nền, nút Kiểm tra mở khi nó xong. Được lâu hơn
  (dựng cụm k8s), nhưng mọi vòng chờ bên trong phải dưới 90 giây.
- `set -euo pipefail` trong setup (khác verify): setup hỏng phải đỏ ngay.
- Tạo đúng cảnh mà đề mô tả, và chỉ cảnh đó.

## 8. Môi trường chạy

| | |
|---|---|
| Hệ điều hành | Ubuntu 24.04, user `root`, shell zsh trong tmux |
| Có sẵn | git, curl, jq, vim, nano, tree, iproute2 (`ip`, `ss`), netcat, dig, docker + buildx + compose, kubectl; bật thêm qua `toolset`: btop, tldr, ripgrep, fd, duf, ncdu, delta, yq |
| Không có | python3 trên máy (dùng image `python:3.12-slim`), make, systemd/journalctl, man đầy đủ |
| Mạng | Chỉ kéo image từ Docker Hub (qua mirror trong cụm). `apt`, `pip`, `npm`, `curl` ra internet đều không chạy |
| Kubernetes | `backend.imageid` k8s ⇒ cụm k3s trong sandbox, `kubectl` đã trỏ sẵn; chờ cụm bằng `dlp-k8s-wait 90`. Hai node: `kubernetes-kubeadm-2nodes-rapid` |
| IDE | `interface.layout: "ide"` ⇒ Theia mở `/root`. Không kết hợp được với Kubernetes |
| Thời gian | Phiên 1 giờ (gia hạn được tới 2 giờ); một lượt exec (setup, verify) tối đa 120 giây |

Image Docker Hub nên dùng (nhỏ, đã ghim tag): `nginx:1.27-alpine`, `alpine:3.20`,
`busybox:1.36`, `python:3.12-slim`, `golang:1.23-alpine`, `redis:7-alpine`,
`httpd:2.4-alpine`, `traefik/whoami:v1.10`. Thêm image khác thì đo thời gian kéo
trước.

## 9. Định nghĩa "xong" cho một bài

1. `pnpm --filter @devops-platform/scenario test` xanh (nạp được, markdown parse được).
2. `pnpm diagrams:check` xanh nếu bài có sơ đồ.
3. `node scripts/content-smoke/… lesson <id>` hoặc `lab <id>` xanh, báo cáo nằm ở
   `plans/labs-rebuild/reports/smoke/`.
4. Đọc lại toàn bài một lượt theo mục 2, sửa mọi câu nghe như máy viết.
