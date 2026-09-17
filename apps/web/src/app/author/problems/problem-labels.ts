import type { StaticTextKey } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';
import {
  PROBLEM_TOPIC_LABELS,
  type ProblemDifficulty,
  type ProblemState,
  type ProblemTopicId,
} from '@devops-platform/games';

/**
 * Nhãn và màu cho hai enum của bài OJ.
 *
 * ## ⚠ Bẫy tên — KHÔNG ghép chuỗi để suy ra biến thể badge
 *
 * Token màu mang tên theo thang BA bậc của hệ nội dung cũ
 * (`basic|intermediate|advanced`, cộng `expert` mới thêm), còn
 * `PROBLEM_DIFFICULTIES` là `easy|medium|hard|expert`. Bốn giá trị, bốn biến
 * thể, nhưng chỉ MỘT tên trùng nhau. `` `difficulty-${difficulty}` `` sẽ sinh ra
 * `difficulty-easy` — một class Tailwind không tồn tại, nên badge vẫn render và
 * chỉ mất màu. Không lỗi, không cảnh báo, và không ai để ý cho tới khi nhìn ảnh
 * chụp màn hình.
 *
 * Ánh xạ tường minh, và `satisfies Record<…>` bắt nó phải đủ bốn bậc.
 *
 * ## Chữ không còn ở đây, chỉ còn KHOÁ (P16 / 16.G2)
 *
 * `STATE_LABELS` từng giữ ba chuỗi tiếng Việt. Chúng đã sang
 * `packages/copy/src/surfaces/author.ts` dưới tiền tố `author.problem.state.`,
 * và bảng dưới đây trả `StaticTextKey`. Đổi này không phải chuyện phong cách: một
 * bảng chuỗi ở tầng ứng dụng thì cổng gạch ngang dài và cổng mất dấu của
 * `packages/copy` không soi tới, nên hai luật đó không có hiệu lực trên nó.
 *
 * ⛔ KHÔNG gộp với `author.state.*` của `components/author/content-state.ts`.
 * Đó là `ContentState` (bốn giá trị, có `publishing`); đây là `ProblemState`
 * (ba giá trị). Chúng trùng chữ ở hai mục và không trùng miền.
 */
export const DIFFICULTY_BADGE = {
  easy: 'difficulty-basic',
  medium: 'difficulty-intermediate',
  hard: 'difficulty-advanced',
  expert: 'difficulty-expert',
} satisfies Record<ProblemDifficulty, BadgeVariant>;

export const STATE_KEYS: Readonly<Record<ProblemState, StaticTextKey>> = {
  draft: 'author.problem.state.draft',
  published: 'author.problem.state.published',
  archived: 'author.problem.state.archived',
};

/**
 * `draft` dùng `outline` chứ không `secondary`: bản nháp là trạng thái CHƯA tới
 * đích, và một badge tô đặc đọc ra như một trạng thái đã xong.
 */
export const STATE_BADGE = {
  draft: 'outline',
  published: 'status-done',
  archived: 'secondary',
} satisfies Record<ProblemState, BadgeVariant>;

/** Bộ lọc trạng thái ở trang danh sách. `all` không phải một `ProblemState`. */
export const STATE_FILTERS = ['all', 'draft', 'published', 'archived'] as const;

export type StateFilter = (typeof STATE_FILTERS)[number];

/**
 * Trả KHOÁ chứ không trả nhãn, và tên hàm nói ra điều đó.
 *
 * Cùng lý do `filterLabel` của `components/author/content-state.ts` đổi thành
 * `filterLabelKey`: giữ tên cũ cho một kiểu trả về mới là cách chắc chắn để nơi
 * gọi tiếp theo dựng thẳng nó vào JSX và in ra chuỗi khoá.
 */
export function filterLabelKey(filter: StateFilter): StaticTextKey {
  return filter === 'all' ? 'author.problem.filter-all' : STATE_KEYS[filter];
}

/**
 * Chủ đề của một bài, ghép thành một câu cho hàng danh sách.
 *
 * ## Vì sao tra có phòng hờ
 *
 * §18.A đổi `topics` từ union đóng chín chủ đề K8s sang `ProblemTopicId`
 * (= `string`): tập đóng chuyển xuống từng plugin, nên `PROBLEM_TOPIC_LABELS`
 * vẫn đúng mà không còn ĐỦ. Tra hụt trả `undefined`, và `join(', ')` biến nó
 * thành chuỗi `"undefined"` in thẳng ra màn hình — hỏng nhìn thấy được nhưng
 * không lỗi, không test nào đỏ. Hiện chính id (`branching`) thì xấu hơn nhãn
 * thật và vẫn đọc được.
 *
 * ⛔ KHÔNG vá bằng `as ProblemTopic`: lời khai sai, và nó không ngăn được
 * `undefined` lúc chạy — chỉ làm trình biên dịch thôi nói.
 *
 * ## Vì sao KHÔNG tra qua plugin, dù trang soạn bài có sẵn đường đó
 *
 * `pluginViewFor(gameId).topics` cho nhãn đúng cho mọi game, nhưng nó đọc
 * `PROBLEM_PLUGINS`, và bảng đó `import` cả hai plugin ⇒ cả hai engine.
 * `/author/problems` (trang danh sách) hôm nay KHÔNG cõng cây đó —
 * `problem-list-client.tsx` không chạm `game-plugin-view.ts` — nên thêm vào là
 * kéo nguyên khối engine vào một route chỉ để in vài chữ. Đó đúng hình dạng
 * PR #124 đã đo và phải gỡ. Trang SOẠN (`[code]`, `new`) thì khác: nó đã trả
 * cái giá đó cho biểu mẫu, nên ở đó tra qua plugin là đúng.
 *
 * ⚠ Sinh đôi có chủ ý với `topicLabel` ở
 * `app/(session)/problems/problem-labels.ts`. Hai bản KHÔNG gộp được hôm nay:
 * chỗ gộp đúng là một module dùng chung dưới `src/components/`, nằm ngoài đường
 * sở hữu của lane này; còn nhập chéo nhóm route thì gần như không có tiền lệ
 * trong repo và sẽ kéo bảng nhãn của trang danh mục (dựng bằng `renderCopy` ở
 * tầng module) vào bundle trang soạn bài. Đã báo lead.
 */
/*
 * ⚠ Biến trung gian này KHÔNG thừa, đừng nội tuyến nó lại.
 *
 * `PROBLEM_TOPIC_LABELS` khai `Record<ProblemTopic, string>` — chín khoá cố
 * định. Tra thẳng nó bằng một khoá `string` là TS7053 ("không index được"), vì
 * kiểu mapped chỉ được cấp index signature ngầm khi ĐEM GÁN sang một kiểu có
 * index signature, chứ không phải khi bị index tại chỗ. Gán một lần ở đây là
 * phép nới rộng duy nhất, và nó an toàn theo đúng nghĩa: mọi khoá thật của bảng
 * vẫn trả đúng nhãn, chỉ khoá lạ mới rơi xuống nhánh `?? topic`.
 */
const TOPIC_LABELS: Readonly<Record<string, string>> = PROBLEM_TOPIC_LABELS;

export function joinTopicLabels(topics: readonly ProblemTopicId[]): string {
  return topics.map((topic) => TOPIC_LABELS[topic] ?? topic).join(', ');
}
