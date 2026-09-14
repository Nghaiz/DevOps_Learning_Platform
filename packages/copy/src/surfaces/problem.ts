import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Chữ của trình soạn bài tập và các nhãn phân loại bài tập k8s.
 * packages/games giữ API PROBLEM_*_LABELS để tương thích, còn giá trị đọc
 * từ surface này. Không phụ thuộc ngược vào games nên không có vòng import.
 * Tên kỹ thuật trong dữ liệu bài tập (ResourceKind, PredicateName) giữ nguyên.
 */
export const problem = {
  'problem.node-labels-example': 'disktype=ssd\nzone=a',
  'problem.topic.workload': 'Workload',
  'problem.topic.scheduling': 'Lập lịch',
  'problem.topic.networking': 'Mạng',
  'problem.topic.storage': 'Lưu trữ',
  'problem.topic.config': 'Cấu hình',
  'problem.topic.security': 'Bảo mật',
  'problem.topic.scaling': 'Co giãn',
  'problem.topic.observability': 'Quan sát',
  'problem.topic.troubleshooting': 'Gỡ sự cố',
  'problem.difficulty.easy': 'Dễ',
  'problem.difficulty.medium': 'Trung bình',
  'problem.difficulty.hard': 'Khó',
  'problem.difficulty.expert': 'Rất khó',
  'problem.allowed-resources-fields-gioi-han-loai-tai-nguyen-nguoi-lam-duoc-tao':
    'Giới hạn loại tài nguyên người làm được tạo',
  'problem.allowed-resources-fields-cho-dung-moi-loai-khac-han-chon-nhung-de-trong-cai-do-nghia-la-khong-tao-du':
    'Cho dùng mọi loại. Khác hẳn "chọn nhưng để trống": cái đó nghĩa là không tạo được gì.',
  'problem.classify-fields-phan-loai': 'Phân loại',
  'problem.classify-fields-do-kho': 'Độ khó',
  'problem.classify-fields-bon-bac-co-y-khac-ba-bac-cua-bai-lab-ranh-gioi-kho-rat-kho-la-thu-nguoi-lam':
    'Bốn bậc, cố ý khác ba bậc của bài lab. Ranh giới Khó / Rất khó là thứ người làm dựa vào để chọn bài kế tiếp.',
  'problem.classify-fields-chu-de-chon-1-den-3': 'Chủ đề, chọn 1 đến 3',
  'problem.classify-fields-tag-tu-do': 'Tag tự do',
  'problem.classify-fields-crashloop-chan-doan-image': 'crashloop, chẩn đoán, image',
  'problem.classify-fields-ngan-bang-dau-phay-tu-chuan-hoa-ve-chu-thuong-khong-dau-va-gach-noi-khi-luu':
    'Ngăn bằng dấu phẩy. Tự chuẩn hoá về chữ thường không dấu và gạch nối khi lưu.',
  'problem.classify-fields-dat-han-gio': 'Đặt hạn giờ',
  'problem.classify-fields-han-gio-giay': 'Hạn giờ (giây)',
  'problem.classify-fields-khong-gioi-han-gio-khong-phai-bai-nao-cung-nen-chay-dua-bai-chan-doan-can-t':
    'Không giới hạn giờ. Không phải bài nào cũng nên chạy đua: bài chẩn đoán cần thời gian để đọc.',
  'problem.classify-fields-so-nuoc-di-chuan-tuy-chon': 'Số nước đi chuẩn (tuỳ chọn)',
  'problem.classify-fields-dung-de-cham-sao-de-trong-nghia-la-khong-cham-theo-so-nuoc-di':
    'Dùng để chấm sao. Để trống nghĩa là không chấm theo số nước đi.',
  'problem.cluster-fields-trang-thai-cum-ban-dau': 'Trạng thái cụm ban đầu',
  'problem.cluster-fields-bieu-mau': 'Biểu mẫu',
  'problem.cluster-fields-dan-json': 'Dán JSON',
  'problem.cluster-fields-node': 'Node',
  'problem.cluster-fields-them-node': 'Thêm node',
  'problem.cluster-fields-namespace': 'Namespace',
  'problem.cluster-fields-moi-dong-mot-namespace-tai-nguyen-chi-dat-duoc-vao-namespace-da-khai-o-day':
    'Mỗi dòng một namespace. Tài nguyên chỉ đặt được vào namespace đã khai ở đây.',
  'problem.cluster-fields-tai-nguyen': 'Tài nguyên',
  'problem.cluster-fields-chua-co-tai-nguyen-nao-mot-bai-chan-doan-thuong-bat-dau-bang-mot-workload-d':
    'Chưa có tài nguyên nào. Một bài chẩn đoán thường bắt đầu bằng một workload đã hỏng sẵn; một bài dựng từ đầu thì để trống chỗ này.',
  'problem.cluster-fields-them-tai-nguyen': 'Thêm tài nguyên',
  'problem.cluster-json-fields-bieu-mau-dang-co-o-sai-nen-chua-doc-ra-json-duoc-sua-o-tab-bieu-mau-hoac-da':
    '// Biểu mẫu đang có ô sai nên chưa đọc ra JSON được. Sửa ở tab Biểu mẫu, hoặc dán một cụm mới vào đây.',
  'problem.cluster-json-fields-trang-thai-cum-dang-json': 'Trạng thái cụm dạng JSON',
  'problem.cluster-json-fields-khong-ap-dung-duoc': 'Không áp dụng được',
  'problem.cluster-json-fields-cum-doc-duoc-nhung-chua-hop-le': (p: { value1: string }) =>
    `Cụm đọc được nhưng chưa hợp lệ: ${p.value1}`,
  'problem.cluster-json-fields-ap-dung-vao-bieu-mau': 'Áp dụng vào biểu mẫu',
  'problem.cluster-json-fields-bo-thay-doi': 'Bỏ thay đổi',
  'problem.cluster-json-fields-json-khong-doc-duoc': (p: { value1: string }) => ({
    what: `JSON không đọc được: ${p.value1}`,
    next: 'Sửa JSON theo lỗi được nêu rồi nhập lại.',
  }),
  'problem.cluster-json-fields-phai-la-mot-object-json-co-ba-khoa-nodes-namespaces-resources':
    'Phải là một object JSON có ba khoá nodes, namespaces, resources.',
  'problem.cluster-json-fields-thieu-mot-trong-ba-khoa-bat-buoc-nodes-namespaces-resources-deu-phai-la-man':
    'Thiếu một trong ba khoá bắt buộc: nodes, namespaces, resources (đều phải là mảng).',
  'problem.cluster-to-spec-chua-khai': (p: { label: string }) => ({
    what: `${p.label} chưa khai.`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.cluster-to-spec-phai-la-so-nguyen-khong-am': (p: { label: string }) => ({
    what: `${p.label} phải là số nguyên không âm.`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.cluster-to-spec-node-phai-co-ten': {
    what: 'Node phải có tên.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.cluster-to-spec-trung-ten-node': (p: { name: string }) => ({
    what: `Trùng tên node "${p.name}".`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.cluster-to-spec-bo-nho-mib': 'Bộ nhớ (MiB)',
  'problem.cluster-to-spec-can-it-nhat-mot-namespace': {
    what: 'Cần ít nhất một namespace.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.cluster-to-spec-tai-nguyen-phai-co-ten': {
    what: 'Tài nguyên phải có tên.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.cluster-to-spec-tai-nguyen-co-namespace-phai-khai-namespace': {
    what: 'Tài nguyên có namespace phải khai namespace.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.cluster-to-spec-namespace-chua-duoc-khai-o-danh-sach-namespace': (p: {
    namespace: string;
  }) => ({
    what: `Namespace "${p.namespace}" chưa được khai ở danh sách namespace.`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.cluster-to-spec-phan-than-phai-la-mot-object-json-khong-phai-mang-hay-gia-tri-don': {
    what: 'Phần thân phải là một object JSON, không phải mảng hay giá trị đơn.',
    next: 'Sửa JSON theo lỗi được nêu rồi nhập lại.',
  },
  'problem.hint-fields-goi-y': 'Gợi ý',
  'problem.hint-fields-chua-co-goi-y-nao-bai-khong-co-goi-y-van-xuat-ban-duoc-nhung-voi-bai-kho-tr':
    'Chưa có gợi ý nào. Bài không có gợi ý vẫn xuất bản được, nhưng với bài Khó trở lên, một gợi ý mở đầu thường là thứ giữ người làm ở lại thay vì bỏ dở.',
  'problem.hint-fields-dinh-danh': 'Định danh',
  'problem.hint-fields-lich-su-mo-goi-y-luu-theo-id-nay-doi-la-mo-coi-du-lieu-cu':
    'Lịch sử mở gợi ý lưu theo id này. Đổi là mồ côi dữ liệu cũ.',
  'problem.hint-fields-diem-bi-tru': 'Điểm bị trừ',
  'problem.hint-fields-0-mien-phi': '0 = miễn phí.',
  'problem.hint-fields-noi-dung': 'Nội dung',
  'problem.hint-fields-goi-y-sau-nen-cu-the-hon-goi-y-truoc':
    'Gợi ý sau nên cụ thể hơn gợi ý trước.',
  'problem.hint-fields-them-goi-y': 'Thêm gợi ý',
  'problem.node-fields-ten-node': 'Tên node',
  'problem.node-fields-node-1': 'node-1',
  'problem.node-fields-cpu-milli-core-1-core-1000': 'CPU (milli-core, 1 core = 1000)',
  'problem.node-fields-node-o-trang-thai-ready': 'Node ở trạng thái Ready',
  'problem.node-fields-nhan': 'Nhãn',
  'problem.node-fields-moi-dong-mot-cap-k-v': 'Mỗi dòng một cặp k=v.',
  'problem.node-fields-taint': 'Taint',
  'problem.node-fields-dedicated-gpu-noschedule': 'dedicated=gpu:NoSchedule',
  'problem.node-fields-moi-dong-mot-taint': 'Mỗi dòng một taint.',
  'problem.objective-arg-field-tuy-chon': (p: { propsSpecLabel: string }) =>
    `${p.propsSpecLabel} (tuỳ chọn)`,
  'problem.objective-arg-field-readiness-san-sang-nhan-luu-luong':
    'readiness: sẵn sàng nhận lưu lượng',
  'problem.objective-arg-field-liveness-con-song': 'liveness: còn sống',
  'problem.objective-arg-field-chon': 'Chọn…',
  'problem.objective-arg-field-khong-dat': 'Không đặt',
  'problem.objective-arg-field-app-web-tier-front': 'app=web,tier=front',
  'problem.objective-arg-field-dang-l-cua-kubectl-cap-k-v-ngan-bang-dau-phay':
    'Dạng -l của kubectl: cặp k=v ngăn bằng dấu phẩy.',
  'problem.objective-arg-field-dang-co-trong-cum': 'Đang có trong cụm:',
  'problem.objective-fields-muc-tieu': 'Mục tiêu',
  'problem.objective-fields-on-dinh-lich-su-nop-bai-tham-chieu-toi-no':
    'Ổn định. Lịch sử nộp bài tham chiếu tới nó.',
  'problem.objective-fields-nhan-tieng-viet': 'Nhãn tiếng Việt',
  'problem.objective-fields-deployment-thanh-toan-co-du-3-replica-san-sang':
    'Deployment thanh-toan có đủ 3 replica sẵn sàng',
  'problem.objective-fields-noi-nguoi-lam-phai-lam-duoc-gi-khong-noi-lam-the-nao':
    'Nói người làm phải làm ĐƯỢC gì, không nói làm THẾ NÀO.',
  'problem.objective-fields-vi-tu-kiem-tra': 'Vị từ kiểm tra',
  'problem.objective-fields-chon-mot-trong-32-vi-tu': 'Chọn một trong 32 vị từ…',
  'problem.objective-fields-phai-dien-it-nhat-mot-trong': 'Phải điền ít nhất một trong:',
  'problem.objective-fields-hoac': ' hoặc ',
  'problem.objective-fields-thieu-ca-hai-thi-vi-tu-luon-tra-sai-va-bai-khong-bao-gio-qua-duoc':
    '. Thiếu cả hai thì vị từ luôn trả sai, và bài không bao giờ qua được.',
  'problem.objective-fields-bat-buoc-khong-dat-thi-khong-qua-bai':
    'Bắt buộc: không đạt thì không qua bài',
  'problem.objective-fields-thuong-an-diem-khong-chan': 'Thưởng: ăn điểm, không chặn',
  'problem.predicate-arg-types-loai-tai-nguyen': 'Loại tài nguyên',
  'problem.predicate-arg-types-ten': 'Tên',
  'problem.predicate-arg-types-bo-chon-nhan': 'Bộ chọn nhãn',
  'problem.predicate-spec-tai-nguyen-ton-tai': 'Tài nguyên tồn tại',
  'problem.predicate-spec-tai-nguyen-da-bi-xoa': 'Tài nguyên đã bị xoá',
  'problem.predicate-spec-co-pod-khop-dang-running': 'Có pod khớp đang Running',
  'problem.predicate-spec-du-so-pod-khop-dang-running': 'Đủ số pod khớp đang Running',
  'problem.predicate-spec-so-pod-toi-thieu': 'Số pod tối thiểu',
  'problem.predicate-spec-khong-pod-khop-nao-mang-reason-loi': 'Không pod khớp nào mang reason lỗi',
  'problem.predicate-spec-pod-nam-tren-dung-node': 'Pod nằm trên đúng node',
  'problem.predicate-spec-pod-khong-nam-tren-node-do': 'Pod KHÔNG nằm trên node đó',
  'problem.predicate-spec-moi-pod-trong-namespace-deu-khoe': 'Mọi pod trong namespace đều khoẻ',
  'problem.predicate-spec-deployment-du-replica-san-sang': 'Deployment đủ replica SẴN SÀNG',
  'problem.predicate-spec-so-replica-san-sang': 'Số replica sẵn sàng',
  'problem.predicate-spec-workload-co-it-nhat-n-replica': 'Workload có ít nhất N replica',
  'problem.predicate-spec-so-replica-toi-thieu': 'Số replica tối thiểu',
  'problem.predicate-spec-container-chay-dung-image': 'Container chạy đúng image',
  'problem.predicate-spec-image-day-du-gom-ca-tag': 'Image đầy đủ, gồm cả tag',
  'problem.predicate-spec-da-khai-ca-requests-lan-limits': 'Đã khai cả requests lẫn limits',
  'problem.predicate-spec-da-cau-hinh-probe': 'Đã cấu hình probe',
  'problem.predicate-spec-loai-probe': 'Loại probe',
  'problem.predicate-spec-job-ket-thuc-succeeded': 'Job kết thúc Succeeded',
  'problem.predicate-spec-cronjob-dung-lich': 'CronJob đúng lịch',
  'problem.predicate-spec-lich-dang-cron-vi-du-0-3': 'Lịch dạng cron, ví dụ 0 3 * * *',
  'problem.predicate-spec-service-co-endpoint': 'Service có endpoint',
  'problem.predicate-spec-so-endpoint-toi-thieu-mac-dinh-1': 'Số endpoint tối thiểu (mặc định 1)',
  'problem.predicate-spec-ingress-dinh-tuyen-dung': 'Ingress định tuyến đúng',
  'problem.predicate-spec-duong-dan': 'Đường dẫn',
  'problem.predicate-spec-service-dich': 'Service đích',
  'problem.predicate-spec-networkpolicy-cho-phep-luong-nay': 'NetworkPolicy CHO PHÉP luồng này',
  'problem.predicate-spec-nhan-ben-gui': 'Nhãn bên gửi',
  'problem.predicate-spec-nhan-ben-nhan': 'Nhãn bên nhận',
  'problem.predicate-spec-cong': 'Cổng',
  'problem.predicate-spec-networkpolicy-chan-luong-nay': 'NetworkPolicy CHẶN luồng này',
  'problem.predicate-spec-phan-giai-duoc-ten-dich-vu': 'Phân giải được tên dịch vụ',
  'problem.predicate-spec-pod-nguon': 'Pod nguồn',
  'problem.predicate-spec-ten-dich-vu-can-phan-giai': 'Tên dịch vụ cần phân giải',
  'problem.predicate-spec-configmap-co-key': 'ConfigMap có key',
  'problem.predicate-spec-ten-key': 'Tên key',
  'problem.predicate-spec-secret-da-duoc-gan-vao-pod': 'Secret đã được gắn vào pod',
  'problem.predicate-spec-ten-secret': 'Tên Secret',
  'problem.predicate-spec-ten-pod': 'Tên pod',
  'problem.predicate-spec-pvc-o-trang-thai-bound': 'PVC ở trạng thái Bound',
  'problem.predicate-spec-volume-da-gan-vao-dung-duong-dan': 'Volume đã gắn vào đúng đường dẫn',
  'problem.predicate-spec-duong-dan-mount': 'Đường dẫn mount',
  'problem.predicate-spec-pod-chiu-duoc-taint-cua-node-dich': 'Pod chịu được taint của node đích',
  'problem.predicate-spec-khong-tai-nguyen-nao-vuot-resourcequota':
    'Không tài nguyên nào vượt ResourceQuota',
  'problem.predicate-spec-hpa-co-nguon-metric-hop-le': 'HPA có nguồn metric hợp lệ',
  'problem.predicate-spec-poddisruptionbudget-duoc-thoa': 'PodDisruptionBudget được thoả',
  'problem.predicate-spec-minavailable-mac-dinh-lay-tu-spec': 'minAvailable (mặc định lấy từ spec)',
  'problem.predicate-spec-rbac-cho-phep-thao-tac': 'RBAC CHO PHÉP thao tác',
  'problem.predicate-spec-dong-tu-vi-du-get': 'Động từ, ví dụ get',
  'problem.predicate-spec-tai-nguyen-vi-du-pods': 'Tài nguyên, ví dụ pods',
  'problem.predicate-spec-rbac-tu-choi-thao-tac': 'RBAC TỪ CHỐI thao tác',
  'problem.predicate-spec-khong-con-su-co-nao-hoat-dong': 'Không còn sự cố nào hoạt động',
  'problem.predicate-spec-chi-xet-mot-loai-su-co': 'Chỉ xét một loại sự cố',
  'problem.problem-draft-phai-la-so': (p: { specLabel: string }) => ({
    what: `${p.specLabel} phải là số.`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.problem-draft-chua-chon-vi-tu-kiem-tra': {
    what: 'Chưa chọn vị từ kiểm tra.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-draft-muc-tieu-phai-co-dinh-danh': {
    what: 'Mục tiêu phải có định danh.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-draft-muc-tieu-phai-co-nhan-tieng-viet': {
    what: 'Mục tiêu phải có nhãn tiếng Việt.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-draft-goi-y-phai-co-dinh-danh': {
    what: 'Gợi ý phải có định danh.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-draft-goi-y-phai-co-noi-dung': {
    what: 'Gợi ý phải có nội dung.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-draft-da-bat-han-gio-thi-phai-khai-so-giay': {
    what: 'Đã bật hạn giờ thì phải khai số giây.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-draft-so-nuoc-di-chuan': 'Số nước đi chuẩn',
  'problem.problem-json-bai-dang-co-o-sai-nen-chua-xuat-duoc-sua-cac-loi-duoc-neu-roi-xuat-lai': {
    what: 'Bài đang có ô sai nên chưa xuất được. Sửa các lỗi được nêu rồi xuất lại.',
    next: 'Sửa JSON theo lỗi được nêu rồi nhập lại.',
  },
  'problem.problem-json-noi-dung-phai-la-mot-object-json': {
    what: 'Nội dung phải là một object JSON.',
    next: 'Sửa JSON theo lỗi được nêu rồi nhập lại.',
  },
  'problem.problem-json-thieu-initialstate-hoac-initialstate-nodes-khong-phai-mang': {
    what: 'Thiếu `initialState` hoặc `initialState.nodes` không phải mảng.',
    next: 'Sửa JSON theo lỗi được nêu rồi nhập lại.',
  },
  'problem.problem-json-do-kho-khong-thuoc-bon-bac-hop-le-da-dat-lai-thanh-de': (p: {
    difficulty: string;
  }) => `độ khó "${p.difficulty}" không thuộc bốn bậc hợp lệ, đã đặt lại thành "Dễ"`,
  'problem.problem-json-chu-de-khong-co-trong-tap-dong': (p: { topic: string }) =>
    `chủ đề "${p.topic}" không có trong tập đóng`,
  'problem.problem-json-loai-tai-nguyen-khong-co-trong-26-loai': (p: { kind: string }) =>
    `loại tài nguyên "${p.kind}" không có trong 26 loại`,
  'problem.problem-validate-bai-phai-co-ten': {
    what: 'Bài phải có tên.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-validate-slug-phai-la-chu-thuong-so-va-gach-noi-vi-du-pod-khong-khoi-dong': {
    what: 'Slug phải là chữ thường, số và gạch nối, ví dụ "pod-khong-khoi-dong".',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-validate-de-bai-khong-duoc-de-trong': {
    what: 'Đề bài không được để trống.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-validate-de-bai-dai-tu-vuot-tran-tu-cat-tu': (p: {
    words: string;
    statementWordLimit: string;
    wordsStatementWordLimit: string;
  }) => ({
    what: `Đề bài dài ${p.words} từ, vượt trần ${p.statementWordLimit} từ. Cắt ${p.wordsStatementWordLimit} từ.`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.problem-validate-chon-it-nhat-mot-chu-de': {
    what: 'Chọn ít nhất một chủ đề.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-validate-toi-da-ba-chu-de-nhieu-hon-nghia-la-bai-dang-lam-qua-nhieu-viec': {
    what: 'Tối đa ba chủ đề. Nhiều hơn nghĩa là bài đang làm quá nhiều việc.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-validate-da-bat-gioi-han-loai-tai-nguyen-nhung-chua-chon-loai-nao-nen-nguoi-lam-se-k':
    {
      what: 'Đã bật giới hạn loại tài nguyên nhưng chưa chọn loại nào, nên người làm sẽ không tạo được gì.',
      next: 'Sửa ô được đánh dấu rồi thử lại.',
    },
  'problem.problem-validate-cum-phai-co-it-nhat-mot-node': {
    what: 'Cụm phải có ít nhất một node.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-validate-bai-phai-co-it-nhat-mot-muc-tieu': {
    what: 'Bài phải có ít nhất một mục tiêu.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.problem-validate-can-it-nhat-mot-muc-tieu-bat-buoc-bai-chi-toan-muc-tieu-thuong-thi-qua-ngay':
    {
      what: 'Cần ít nhất một mục tiêu BẮT BUỘC. Bài chỉ toàn mục tiêu thưởng thì qua ngay khi vừa mở.',
      next: 'Sửa ô được đánh dấu rồi thử lại.',
    },
  'problem.problem-validate-trung-dinh-danh-muc-tieu': (p: { id: string }) => ({
    what: `Trùng định danh mục tiêu "${p.id}".`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.problem-validate-vi-tu-khong-co-trong-bang-tra-nen-bai-nay-se-khong-bao-gio-qua-duoc':
    (p: { objectiveCheck: string }) => ({
      what: `Vị từ "${p.objectiveCheck}" không có trong bảng tra, nên bài này sẽ không bao giờ qua được.`,
      next: 'Sửa ô được đánh dấu rồi thử lại.',
    }),
  'problem.problem-validate-thieu-tham-so-bat-buoc': (p: { argspecLabel: string }) => ({
    what: `Thiếu tham số bắt buộc "${p.argspecLabel}".`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.problem-validate-phai-dien-thieu-ca-hai-thi-vi-tu-luon-tra-sai': (p: {
    labels: string;
  }) => ({
    what: `Phải điền ${p.labels}. Thiếu cả hai thì vị từ luôn trả sai.`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.problem-validate-trung-dinh-danh-goi-y': (p: { id: string }) => ({
    what: `Trùng định danh gợi ý "${p.id}".`,
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  }),
  'problem.problem-validate-diem-bi-tru-phai-la-so-khong-am': {
    what: 'Điểm bị trừ phải là số không âm.',
    next: 'Sửa ô được đánh dấu rồi thử lại.',
  },
  'problem.resource-fields-loai': 'Loại',
  'problem.resource-fields-co-pham-vi-cluster-nen-khong-thuoc-namespace-nao-o-namespace-bi-bo-qua':
    'có phạm vi cluster nên không thuộc namespace nào, ô Namespace bị bỏ qua.',
  'problem.resource-fields-phai-la-mot-trong-cac-namespace-da-khai-o-tren':
    'Phải là một trong các namespace đã khai ở trên.',
  'problem.resource-fields-phan-than-json': 'Phần thân (JSON)',
  'problem.resource-fields-hinh-dang-tuy-loai-tai-nguyen-engine-chi-doc-nhung-field-no-can-va-bo-qua-p':
    'Hình dạng tuỳ loại tài nguyên. Engine chỉ đọc những field nó cần và bỏ qua phần còn lại.',
  'problem.resource-fields-gieo-san-su-co-tuy-chon': 'Gieo sẵn sự cố (tuỳ chọn)',
  'problem.resource-fields-khong-gieo-su-co': 'Không gieo sự cố',
  'problem.statement-fields-mo-ta': 'Mô tả',
  'problem.statement-fields-ten-bai': 'Tên bài',
  'problem.statement-fields-pod-khong-khoi-dong-duoc-sau-khi-doi-image':
    'Pod không khởi động được sau khi đổi image',
  'problem.statement-fields-ma-bai': 'Mã bài',
  'problem.statement-fields-may-chu-cap-khi-ban-luu-lan-dau-ma-on-dinh-vinh-vien-khong-doi-ke-ca-khi-ba':
    'Máy chủ cấp khi bạn lưu lần đầu. Mã ổn định vĩnh viễn, không đổi kể cả khi bạn sửa đề.',
  'problem.statement-fields-slug-trong-url': 'Slug trong URL',
  'problem.statement-fields-chu-thuong-so-va-gach-noi-slug-doi-duoc-khi-sua-ten-bai-khac-ma-bai-la-thu':
    'Chữ thường, số và gạch nối. Slug đổi được khi sửa tên bài, khác mã bài là thứ không bao giờ đổi. Sẽ lưu thành',
  'problem.statement-fields-trong': '(trống)',
  'problem.statement-fields-sinh-lai-tu-ten-bai': 'Sinh lại từ tên bài',
  'problem.statement-fields-viet-de': 'Viết đề',
  'problem.statement-fields-xem-truoc': 'Xem trước',
  'problem.statement-fields-de-bai-markdown': 'Đề bài (markdown)',
  'problem.statement-fields-namespace-thanh-toan-co-mot-deployment-khong-len-noi-replica-nao-tim-nguyen':
    'Namespace `thanh-toan` có một Deployment không lên nổi replica nào.\n\nTìm nguyên nhân và đưa nó về đủ 3 replica sẵn sàng.',
  'problem.statement-fields-bai-oj-khong-day-ly-thuyet-chi-noi-de-kien-thuc-nen-de-nguoi-lam-tu-tra':
    'Bài OJ KHÔNG dạy lý thuyết, chỉ nói đề. Kiến thức nền để người làm tự tra.',
  'problem.statement-fields-chua-co-gi-de-xem-truoc': 'Chưa có gì để xem trước.',
  'problem.statement-fields-tu': 'từ.',
  'problem.statement-fields-vuot-tran-phai-cat-tu-moi-xuat-ban-duoc': (p: { remaining: string }) =>
    `Vượt trần: phải cắt ${p.remaining} từ mới xuất bản được.`,
  'problem.statement-fields-con-tu-bai-oj-noi-de-khong-giang-bai': (p: { remaining: string }) =>
    `Còn ${p.remaining} từ. Bài OJ nói đề, không giảng bài.`,
  'problem.statement-fields-con-tu': (p: { remaining: string }) => `Còn ${p.remaining} từ.`,
  'problem.vocabulary-tag-image-sai-pod-ket-imagepullbackoff':
    'Tag image sai, pod kẹt ImagePullBackOff',
  'problem.vocabulary-khong-toi-duoc-registry': 'Không tới được registry',
  'problem.vocabulary-thieu-imagepullsecret-cho-registry-rieng':
    'Thiếu imagePullSecret cho registry riêng',
  'problem.vocabulary-memory-limit-qua-thap-container-bi-oomkilled':
    'Memory limit quá thấp, container bị OOMKilled',
  'problem.vocabulary-entrypoint-sai-container-thoat-ngay': 'Entrypoint sai, container thoát ngay',
  'problem.vocabulary-configmap-duoc-tham-chieu-khong-ton-tai':
    'ConfigMap được tham chiếu không tồn tại',
  'problem.vocabulary-secret-duoc-tham-chieu-khong-ton-tai': 'Secret được tham chiếu không tồn tại',
  'problem.vocabulary-readiness-probe-tro-sai-cong': 'Readiness probe trỏ sai cổng',
  'problem.vocabulary-liveness-probe-qua-gat-pod-bi-giet-vong-lap':
    'Liveness probe quá gắt, pod bị giết vòng lặp',
  'problem.vocabulary-probe-khong-co-initialdelay': 'Probe không có initialDelay',
  'problem.vocabulary-selector-cua-service-lech-label-cua-pod':
    'Selector của Service lệch label của pod',
  'problem.vocabulary-service-khong-co-endpoint-nao': 'Service không có endpoint nào',
  'problem.vocabulary-dns-khong-phan-giai-duoc-ten-dich-vu': 'DNS không phân giải được tên dịch vụ',
  'problem.vocabulary-networkpolicy-chan-nham-luu-luong-hop-le':
    'NetworkPolicy chặn nhầm lưu lượng hợp lệ',
  'problem.vocabulary-pvc-khong-co-pv-nao-khop': 'PVC không có PV nào khớp',
  'problem.vocabulary-storageclass-khong-ton-tai': 'StorageClass không tồn tại',
  'problem.vocabulary-pvc-readwriteonce-bi-doi-tu-hai-node': 'PVC ReadWriteOnce bị đòi từ hai node',
  'problem.vocabulary-node-o-trang-thai-notready': 'Node ở trạng thái NotReady',
  'problem.vocabulary-node-het-cpu': 'Node hết CPU',
  'problem.vocabulary-node-het-bo-nho': 'Node hết bộ nhớ',
  'problem.vocabulary-node-co-taint-ma-pod-khong-co-toleration':
    'Node có taint mà pod không có toleration',
  'problem.vocabulary-nodeselector-khong-khop-node-nao': 'nodeSelector không khớp node nào',
  'problem.vocabulary-resourcequota-chan-viec-tao-tai-nguyen':
    'ResourceQuota chặn việc tạo tài nguyên',
  'problem.vocabulary-limitrange-tu-choi-tai-nguyen-khai-sai':
    'LimitRange từ chối tài nguyên khai sai',
  'problem.vocabulary-serviceaccount-thieu-quyen-rbac': 'ServiceAccount thiếu quyền RBAC',
  'problem.vocabulary-serviceaccount-khong-ton-tai': 'ServiceAccount không tồn tại',
  'problem.vocabulary-poddisruptionbudget-chan-luot-drain': 'PodDisruptionBudget chặn lượt drain',
  'problem.vocabulary-hpa-khong-co-nguon-metric': 'HPA không có nguồn metric',
  'problem.vocabulary-so-replica-vuot-quota': 'Số replica vượt quota',
  'problem.problems-client-dang-tai-danh-sach-bai': 'Đang tải danh sách bài',
  'problem.cluster-json-fields-loi-cu-phap': 'lỗi cú pháp',
  'problem.resource-cpu': 'CPU (milli-core)',
  'problem.resource-service-account': 'ServiceAccount',
} as const satisfies Surface<'problem'>;

export const problemIntentionalThree = {} as const satisfies IntentionalThree;
