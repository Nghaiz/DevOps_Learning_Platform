import type { IntentionalThree, Surface } from '../types.ts';

/** Landing copy: a practical workbench and the published learning paths. */
export const home = {
  'home.identity.name': 'PTIT / DevOps Learning Platform',
  'home.footer.note': 'Từ dòng lệnh đầu tiên đến hệ thống bạn tự vận hành.',
  'home.hero.eyebrow': 'Không gian thực hành DevOps',
  'home.hero.title': 'Học DevOps.',
  'home.hero.title-accent': 'Tự tay vận hành.',
  'home.hero.lede':
    'Từ lệnh Linux đầu tiên đến triển khai Kubernetes. Học trong sandbox riêng, giải những bài lab thực tế và hiểu vì sao hệ thống chạy.',
  'home.hero.footnote': 'Mở trình duyệt là sẵn sàng. Không cần cài môi trường.',
  'home.hero.preview-note':
    'Thử một ví dụ bên dưới. Khi vào bài học, bạn sẽ tự gõ lệnh trong sandbox của mình.',
  'home.hero.scroll-hint': 'Khám phá lộ trình',
  'home.cta.enter.guest': 'Tạo tài khoản để học',
  'home.cta.enter.member': 'Vào học',
  'home.cta.paths': 'Xem lộ trình',

  'home.preview.name': 'Bàn thực hành',
  'home.preview.disclosure': 'Bản minh hoạ tương tác',
  'home.preview.topic-label': 'Chọn công nghệ để xem ví dụ',
  'home.preview.task-label': 'Nhiệm vụ của bạn',
  'home.preview.run': 'Chạy ví dụ',
  'home.preview.ran': 'Đã chạy ví dụ',
  'home.preview.reset': 'Đặt lại ví dụ',
  'home.preview.console-label': 'Terminal minh hoạ',
  'home.preview.terminal-title': 'terminal / preview',
  'home.preview.waiting': 'Chọn “Chạy ví dụ” để xem kết quả và giải thích.',
  'home.preview.sandbox-note':
    'Kết quả mẫu, không kết nối sandbox. Bài học thật mở môi trường riêng sau khi đăng nhập.',
  'home.topic.linux': 'Linux',
  'home.topic.docker': 'Docker',
  'home.topic.kubernetes': 'Kubernetes',
  'home.demo.linux.title': 'Trao đúng quyền cho một file.',
  'home.demo.linux.description':
    'File deploy.sh đã có, nhưng chưa chạy được. Thêm quyền thực thi cho chủ sở hữu rồi kiểm tra lại.',
  'home.demo.linux.comment': '# Cấp quyền thực thi cho chủ sở hữu',
  'home.demo.linux.command': '$ chmod u+x deploy.sh\n$ ls -l deploy.sh',
  'home.demo.linux.output': '-rwxr--r-- 1 learner learner 128 deploy.sh',
  'home.demo.linux.result':
    'Chữ x trong nhóm quyền đầu tiên cho biết chủ sở hữu đã có quyền chạy file.',
  'home.demo.docker.title': 'Đưa một web server lên chạy.',
  'home.demo.docker.description':
    'Chạy Nginx trong container, mở cổng 8080 và kiểm tra trạng thái bằng một lệnh Docker.',
  'home.demo.docker.comment': '# Khởi chạy web server từ image Nginx',
  'home.demo.docker.command':
    '$ docker run -d --name web -p 8080:80 nginx:alpine\n$ docker ps --format "{{.Names}}  {{.Status}}  {{.Ports}}"',
  'home.demo.docker.output': 'web  Up 2 seconds  0.0.0.0:8080->80/tcp',
  'home.demo.docker.result':
    'Container web đang chạy. Cổng 8080 của môi trường đã nối đến cổng 80 trong container.',
  'home.demo.kubernetes.title': 'Khai báo ứng dụng bạn muốn chạy.',
  'home.demo.kubernetes.description':
    'Tạo một Deployment chạy Nginx. Sau khi Pod sẵn sàng, kiểm tra trạng thái mà Kubernetes đã thực hiện.',
  'home.demo.kubernetes.comment': '# Tạo Deployment và kiểm tra khi Pod đã sẵn sàng',
  'home.demo.kubernetes.command':
    '$ kubectl create deployment web --image=nginx:alpine\n$ kubectl rollout status deployment/web\n$ kubectl get deployment web',
  'home.demo.kubernetes.output':
    'deployment.apps/web created\ndeployment "web" successfully rolled out\nNAME  READY  UP-TO-DATE  AVAILABLE\nweb   1/1    1           1',
  'home.demo.kubernetes.result':
    'Deployment đã có đủ 1 Pod sẵn sàng, đúng với trạng thái bạn yêu cầu.',

  'home.curriculum.kicker': 'Lộ trình học',
  'home.curriculum.title': 'Có điểm bắt đầu.\nCó hướng đi tiếp.',
  'home.curriculum.description':
    'Đi từ nền tảng đến vận hành cụm. Mỗi lộ trình nối bài học với thực hành và phần kiểm tra kiến thức.',
  'home.curriculum.auth-note':
    'Chọn lộ trình để xem nội dung. Bạn cần đăng nhập trước khi vào học.',
  'home.path-level.linux': 'Bắt đầu với hệ điều hành',
  'home.path-level.docker': 'Đóng gói và chạy ứng dụng',
  'home.path-level.kubernetes': 'Vận hành trên cụm',
  'home.path-level.delivery': 'Kết nối kiến thức',
  'home.path-title.linux': 'Linux cho DevOps',
  'home.path-title.docker': 'Docker từ số 0',
  'home.path-title.kubernetes': 'Kubernetes căn bản',
  'home.path-title.delivery': 'Từ container tới cụm',
  'home.path-description.linux':
    'Làm quen terminal, quản lý quyền truy cập và xử lý những sự cố thường gặp trên Linux.',
  'home.path-description.docker':
    'Kéo image, chạy container, công bố cổng và build image của riêng bạn.',
  'home.path-description.kubernetes':
    'Làm việc với Pod, Deployment, ConfigMap và Service trên cụm k3s trong sandbox.',
  'home.path-description.delivery':
    'Theo ứng dụng từ một container đến cụm nhiều node, rồi tự sửa một Deployment bị lỗi.',

  'home.practice.kicker': 'Cách bạn sẽ học',
  'home.practice.title': 'Hiểu bằng cách làm.\nNhớ bằng cách sửa.',
  'home.practice.description':
    'Đọc một yêu cầu, thử một lệnh, kiểm tra kết quả. Từng bước nhỏ giúp bạn hiểu điều gì đang diễn ra trong hệ thống.',
  'home.practice.aside':
    'Bạn được phép thử sai. Mỗi phiên thực hành là một môi trường riêng để bắt đầu lại.',
  'home.value-title.sandbox': 'Một sandbox của riêng bạn',
  'home.value-title.grading': 'Phản hồi từ chính hệ thống',
  'home.value-title.progress': 'Tiến độ gắn với tài khoản',
  'home.value-title.local': 'Tập trung vào bài học',
  'home.value-body.sandbox':
    'Mở terminal ngay trong trình duyệt. Lệnh chạy trong môi trường phía máy chủ, tách biệt với máy cá nhân của bạn.',
  'home.value-body.grading':
    'Các bước thực hành được kiểm tra bằng lệnh trong sandbox. Xem kết quả, sửa cấu hình và thử lại khi chưa đạt.',
  'home.value-body.progress':
    'Theo dõi bài đã học, tiếp tục lộ trình và dùng quiz để kiểm tra phần kiến thức vừa thực hành.',
  'home.value-body.local':
    'Không phải cài Docker Desktop hay tự dựng cụm để bắt đầu. Môi trường được chuẩn bị khi bạn mở phiên.',

  'home.catalog.heading': 'Nội dung đang có',
  'home.catalog.lede': 'Từ danh mục đã xuất bản.',
  'home.catalog.unknown-count': 'Chưa đọc được số lượng',
  'home.catalog.partial':
    'Một số lượng nội dung chưa tải được. Tải lại trang sau ít phút để cập nhật.',
  'home.catalog.loading': 'Đang đọc số lượng nội dung.',
  'home.catalog-label.lessons': 'Bài học',
  'home.catalog-label.labs': 'Lab thực hành',
  'home.catalog-label.playgrounds': 'Playground',
  'home.catalog-label.quizzes': 'Quiz',
  'home.catalog-note.lessons': 'Thực hành theo từng bước có hướng dẫn.',
  'home.catalog-note.labs': 'Nhiệm vụ để tự giải và kiểm tra kết quả.',
  'home.catalog-note.playgrounds': 'Môi trường trống để tự thử lệnh.',
  'home.catalog-note.quizzes': 'Câu hỏi để ôn lại kiến thức.',

  'home.start.kicker': 'Bắt đầu thực hành',
  'home.start.title': 'Lệnh tiếp theo,\nbạn tự gõ.',
  'home.start.description':
    'Tạo tài khoản, chọn bài đầu tiên và mở terminal. Phần còn lại bắt đầu từ những gì bạn thử.',
  'home.og.title': 'DevOps Learning Platform',
  'home.og.subtitle': 'Học DevOps bằng lab sandbox chạy thật',
} as const satisfies Surface<'home'>;

export const homeIntentionalThree = {
  'home.topic':
    '2026-09-12: ba ví dụ tương tác ứng với ba công nghệ Linux, Docker, Kubernetes đang có lộ trình thật trong content/paths. Đây là bộ chọn công nghệ, không phải nhóm luận điểm tiếp thị.',
  'home.start':
    '2026-09-12: phần kết có nhãn dẫn, tiêu đề và mô tả. Ba vai trò văn bản của một phần trang, không phải ba tính năng.',
} as const satisfies IntentionalThree;
