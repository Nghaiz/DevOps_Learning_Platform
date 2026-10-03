import type { Dynamic, IntentionalThree, List, Surface } from '../types.ts';

/**
 * Landing 3D (2026-10-03): hành trình một commit qua sáu ga, terminal tua theo cuộn, bốn cửa
 * vào học, lộ trình và trò chơi thật. Kế hoạch: plans/devops-learning-platform/landing-3d/plan.md.
 *
 * Ba khoá home.journey.heading, home.journey.accent, home.journey.stage2.command còn sống vì
 * app/opengraph-image.tsx đọc chúng cho ảnh chia sẻ.
 */
export const home = {
  'home.meta.title': 'PTIT DevOps · Học DevOps trên máy thật',
  'home.meta.description':
    'Nền tảng thực hành DevOps của Học viện Công nghệ Bưu chính Viễn thông. Mỗi bài mở một máy Linux riêng trong trình duyệt, có Docker và Kubernetes khi bài cần.',

  'home.brand.name': 'PTIT DevOps',
  'home.brand.org': 'Học viện Công nghệ Bưu chính Viễn thông',

  'home.nav.label': 'Các phần của trang',
  'home.nav.home': 'PTIT DevOps, lên đầu trang',
  'home.nav.journey': 'Hành trình',
  'home.nav.terminal': 'Terminal',
  'home.nav.modes': 'Cách học',
  'home.nav.paths': 'Lộ trình',
  'home.nav.games': 'Trò chơi',
  'home.nav.sign-in': 'Đăng nhập',
  'home.nav.register': 'Tạo tài khoản',
  'home.nav.enter': 'Vào học',

  'home.skip.label': 'Bỏ qua phần trình diễn, tới lộ trình',

  'home.hero.eyebrow': 'Nền tảng thực hành DevOps · PTIT',
  'home.hero.title-a': 'Gõ lệnh thật',
  'home.hero.title-b': 'trên cụm thật.',
  'home.hero.lede':
    'Mỗi bài học mở cho bạn một máy Linux riêng ngay trong trình duyệt, có Docker, có cả cụm Kubernetes khi bài cần. Làm hỏng thì xoá đi dựng lại, chẳng ai mất gì.',
  'home.hero.cta-guest': 'Mở máy đầu tiên',
  'home.hero.cta-member': 'Học tiếp',
  'home.hero.cta-tour': 'Đi một vòng sáu ga',
  'home.hero.note': 'Chỉ cần email để tạo tài khoản. Chơi game thì khỏi cần cả email.',
  'home.hero.scroll': 'Cuộn để đẩy commit đầu tiên',
  'home.hero.stats': 'Nội dung đang mở',

  'home.stat.lessons': 'bài học',
  'home.stat.labs': 'phòng lab',
  'home.stat.playgrounds': 'sân chơi',
  'home.stat.quizzes': 'bộ quiz',
  'home.stat.paths': 'lộ trình',
  'home.stat.games': 'trò chơi',
  'home.stat.unknown': '?',
  'home.stat.unknown-sr': 'chưa đọc được số lượng',

  'home.journey.heading': 'Từ một dòng lệnh.',
  'home.journey.accent': 'Đến cả hệ thống.',
  'home.journey.stage2.command': '$ kubectl apply -f deployment.yaml',
  'home.journey.kicker': 'Hành trình',
  'home.journey.title': 'Sáu ga từ laptop tới production',
  'home.journey.lede':
    'Một commit phải đi qua chừng ấy chặng mới tới được người dùng. Cuộn xuống, bạn lái nó qua từng ga.',
  'home.journey.note': 'Cảnh 3D là mô phỏng. Máy thật chỉ mở khi bạn vào bài.',
  'home.journey.rail': 'Tiến độ qua sáu ga',
  'home.journey.progress': (({ n, total }) => `Ga ${n} trên ${total}`) as Dynamic<{
    n: number;
    total: number;
  }>,

  'home.station.linux.line': 'Tuyến 01 · Linux',
  'home.station.linux.name': 'Ga Linux',
  'home.station.linux.body':
    'Mọi thứ phía sau đều chạy trên Linux, nên ta bắt đầu từ shell. Tìm tiến trình đang ngốn RAM, đọc log, sửa quyền một file mà không cần ai cầm tay.',
  'home.station.linux.cmd': 'ps aux --sort=-%mem | head -5',
  'home.station.linux.event': 'kill 4012 xong, RAM trống lại 1,8 GB',

  'home.station.git.line': 'Tuyến 02 · Git',
  'home.station.git.name': 'Ga Git',
  'home.station.git.body':
    'Nhánh, rebase, cherry-pick. Có hẳn một phòng thí nghiệm Git để bạn làm rối lịch sử commit rồi tự gỡ ra bằng reflog.',
  'home.station.git.cmd': 'git rebase -i HEAD~3',
  'home.station.git.event': 'Nhánh feature đã vào main, không xung đột',

  'home.station.docker.line': 'Tuyến 03 · Docker',
  'home.station.docker.name': 'Ga Docker',
  'home.station.docker.body':
    'Viết Dockerfile, build, rồi soi từng layer xem nặng bao nhiêu. Có khi bỏ một dòng COPY thừa là image nhẹ đi cả trăm MB.',
  'home.station.docker.cmd': 'docker build -t web:1.0 .',
  'home.station.docker.event': 'Đóng gói xong web:1.0, gồm 5 layer',

  'home.station.k8s.line': 'Tuyến 04 · Kubernetes',
  'home.station.k8s.name': 'Ga Kubernetes',
  'home.station.k8s.body':
    'Deploy ba replica, xoá tay một pod rồi đứng nhìn cụm tự dựng lại nó. Lần đầu thấy cảnh đó, ai cũng bật cười.',
  'home.station.k8s.cmd': 'kubectl delete pod web-7d4f9-8mzrt',
  'home.station.k8s.event': 'Pod mới đã lên thay, 3/3 sẵn sàng',

  'home.station.cicd.line': 'Tuyến 05 · CI/CD',
  'home.station.cicd.name': 'Ga CI/CD',
  'home.station.cicd.body':
    'Ghép build, test, quét lỗ hổng và deploy thành một đường ống. Trong trò chơi CI/CD, bạn sửa từng stage đỏ cho tới khi cả tuyến xanh.',
  'home.station.cicd.cmd': 'stages: [build, test, scan, deploy]',
  'home.station.cicd.event': 'Test đỏ lần đầu, sửa xong chạy lại thì xanh',

  'home.station.prod.line': 'Tuyến 06 · Production',
  'home.station.prod.name': 'Ga cuối: production',
  'home.station.prod.body':
    'Hệ thống đã chạy. Việc còn lại là biết nó chạy ổn hay không: đọc metric, đọc log, bắt lỗi trước khi người dùng kịp thấy.',
  'home.station.prod.cmd': 'kubectl logs -f deploy/web',
  'home.station.prod.event': 'Độ trễ vọt lên, thêm hai node là êm',

  'home.term.kicker': 'Terminal',
  'home.term.title': 'Một terminal bạn muốn ngồi lâu',
  'home.term.lede':
    'Prompt kiểu oh-my-posh, font có icon, gợi ý lệnh theo lịch sử. Khung bên cạnh chạy theo nhịp cuộn; vào bài học thì mọi dòng chữ là đầu ra thật từ máy của bạn.',
  'home.term.window': 'Terminal chạy thử theo nhịp cuộn',
  'home.term.steps': 'Bốn bước trong khung terminal',
  'home.term.user': 'sv',
  'home.term.host': 'ptit-lab',
  'home.term.dir': '~/web',
  'home.term.branch': 'main',
  'home.term.check': 'Kiểm tra',
  'home.term.check-done': 'Đạt 4/4 yêu cầu',
  'home.term.cmd.build': 'docker build -t web:1.0 .',
  'home.term.cmd.apply': 'kubectl apply -f k8s/',
  'home.term.cmd.watch': 'kubectl get pods -w',
  'home.term.cmd.curl': 'curl -s http://web/healthz',
  'home.term.out.build':
    '[+] Building 41.2s (9/9) FINISHED\n => [1/4] FROM node:24-alpine\n => [2/4] COPY package.json pnpm-lock.yaml ./\n => [3/4] RUN pnpm install --frozen-lockfile\n => [4/4] COPY . .\n => naming to docker.io/library/web:1.0',
  'home.term.out.apply': 'deployment.apps/web created\nservice/web created',
  'home.term.out.watch-head': 'NAME READY STATUS RESTARTS AGE',
  'home.term.out.curl': '{"status":"ok","pods":3}',
  'home.term.pods': 'web-7d4f9-2xkqp\nweb-7d4f9-8mzrt\nweb-7d4f9-lq6vn',
  'home.term.statuses': {
    items: ['Pending', 'ContainerCreating', 'Running'],
    intentionalThree:
      '2026-10-03: ba trạng thái thật mà kubectl in ra theo đúng thứ tự một pod đi qua khi khởi động, không phải nhóm luận điểm.',
  } satisfies List,
  'home.term.step.build': 'Build image',
  'home.term.step.apply': 'Đưa lên cụm',
  'home.term.step.watch': 'Chờ pod chạy',
  'home.term.step.check': 'Bấm Kiểm tra',

  'home.modes.kicker': 'Cách học',
  'home.modes.title': 'Bốn cửa vào, một cỗ máy phía sau',
  'home.modes.lede':
    'Bài học, lab, sân chơi hay trò chơi đều chạy trên cùng hệ thống sandbox. Hôm nay muốn được dắt tay hay muốn tự bơi, cứ chọn cửa tương ứng.',
  'home.modes.engine': 'Mỗi phiên là một pod riêng trên Kubernetes, cách ly bằng Sysbox',
  'home.mode.lesson.tag': 'Bài học',
  'home.mode.lesson.title': 'Có người dẫn đường',
  'home.mode.lesson.body':
    'Đi theo từng bước, bước nào cũng có nút Kiểm tra. Giống Killercoda, khác ở chỗ viết bằng tiếng Việt.',
  'home.mode.lesson.cta': 'Xem bài học',
  'home.mode.lab.tag': 'Phòng lab',
  'home.mode.lab.title': 'Chỉ có đề bài',
  'home.mode.lab.body':
    'Không gợi ý, không lệnh mẫu. Làm xong bấm chấm, máy tự kiểm từng yêu cầu. Bài nào cần sửa nhiều file thì có sẵn IDE Theia.',
  'home.mode.lab.cta': 'Xem phòng lab',
  'home.mode.playground.tag': 'Sân chơi',
  'home.mode.playground.title': 'Một máy trống trơn',
  'home.mode.playground.body':
    'Linux hoặc Docker dựng sẵn, không đề, không đồng hồ. Gõ thử lệnh lạ mà không sợ làm hỏng máy ai.',
  'home.mode.playground.cta': 'Mở sân chơi',
  'home.mode.game.tag': 'Trò chơi',
  'home.mode.game.title': 'Nghỉ tay thì chơi',
  'home.mode.game.body':
    'Kéo pod lên node, gỡ một lịch sử Git rối tung, nối đường ống CI/CD. Chơi được cả khi chưa đăng nhập.',
  'home.mode.game.cta': 'Vào phòng game',

  'home.marquee.label': 'Công cụ có mặt trong các bài',
  'home.marquee.words':
    'Linux · Bash · Git · Docker · Kubernetes · kubectl · YAML · CI/CD · Loki · Nginx · ConfigMap · Theia',

  'home.paths.kicker': 'Lộ trình',
  'home.paths.title': 'Chọn một tuyến mà đi',
  'home.paths.lede':
    'Mỗi lộ trình xâu bài học, lab và quiz thành một tuyến có thứ tự. Đi hết tuyến này rồi đổi sang tuyến khác cũng được.',
  'home.paths.steps': (({ n }) => `${n} chặng`) as Dynamic<{ n: number }>,
  'home.paths.open': 'Lên tàu',
  'home.paths.gate': 'Cần đăng nhập để vào học.',
  'home.paths.empty': 'Chưa có lộ trình nào được xuất bản.',
  'home.paths.unknown': 'Chưa đọc được danh sách lộ trình. Tải lại trang sau ít phút.',

  'home.games.kicker': 'Trò chơi',
  'home.games.title': 'Phòng game không cần đăng nhập',
  'home.games.lede':
    'Mỗi màn là một sự cố DevOps có thật ngoài đời, chỉ khác là thua thì bấm chơi lại.',
  'home.games.play': 'Chơi ngay',
  'home.games.soon': 'Đang làm',
  'home.game.k8s.title': 'Kubernetes Game',
  'home.game.k8s.body':
    'Dựng rồi cứu một cluster: tạo pod, phơi service, chịu sự cố ngẫu nhiên. Mỗi level hỏng theo một kiểu.',
  'home.game.git.title': 'Phòng thí nghiệm Git',
  'home.game.git.body':
    'Gõ lệnh git thật trên một kho chạy ngay trong trình duyệt, rồi cứu lại những commit tưởng đã mất.',
  'home.game.cicd.title': 'Đường ống CI/CD',
  'home.game.cicd.body':
    'Xếp job thành đồ thị phụ thuộc, bật cache, chia runner. 14 level, chấm theo đường găng và số lần chạy lại.',
  'home.game.maze.title': 'Mê cung mạng',
  'home.game.maze.body':
    'Đưa gói tin qua một mê cung NetworkPolicy: mở đúng đường cần mở, đóng phần còn lại.',
  'home.game.forge.title': 'Lò rèn Image',
  'home.game.forge.body':
    'Ghép một Dockerfile chạy được rồi rèn cho nhỏ lại. Mỗi layer thừa là một điểm trừ.',

  'home.closing.title-a': 'Vòng lặp DevOps',
  'home.closing.title-b': 'không có ga cuối.',
  'home.closing.lede':
    'Code, build, deploy, theo dõi, rồi quay lại code. Vòng đầu sẽ chậm. Tới vòng thứ mười, bạn quên mất mình từng ngại cái màn hình đen.',
  'home.closing.cta-guest': 'Tạo tài khoản',
  'home.closing.cta-member': 'Vào học tiếp',
  'home.closing.cta-games': 'Chơi thử một game',
  'home.closing.loop': 'PLAN · CODE · BUILD · TEST · RELEASE · DEPLOY · OPERATE · MONITOR',

  'home.footer.note':
    'Đề tài nghiên cứu khoa học sinh viên, Học viện Công nghệ Bưu chính Viễn thông.',
  'home.footer.links': 'Liên kết nhanh',
  'home.footer.top': 'Lên đầu trang',
  'home.footer.stack': 'Next.js · Go · Kubernetes · Sysbox',

  'home.scene.fallback':
    'Bản đồ tuyến: sáu tuyến Linux, Git, Docker, Kubernetes, CI/CD và production cùng đổ về tuyến đỏ.',
  'home.scene.reduced': 'Đang ở chế độ ít chuyển động, nên cảnh 3D được thay bằng hình tĩnh.',
} as const satisfies Surface<'home'>;

/** Không còn nhóm ba khoá nào cần biện minh; nhóm ba trạng thái pod tự mang lý do trong List. */
export const homeIntentionalThree = {} as const satisfies IntentionalThree;
