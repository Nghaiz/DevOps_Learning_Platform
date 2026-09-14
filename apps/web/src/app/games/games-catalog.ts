import { t, type CopyRef } from '@devops-platform/copy';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import type { CatalogIconName } from '../../components/catalog/catalog-icons';

/**
 * Dữ liệu của trụ cột ③ Games — hợp đồng C4 (`phase-14-exec.md` §4.1, §5).
 *
 * ## Vì sao là một hằng số trong mã, không phải một lời gọi API
 *
 * Ô nghiệm thu của phase là **0 lời gọi backend trong lúc chơi**, đo bằng
 * network trace của Playwright. Một `games.list` qua tRPC sẽ phá đúng ô đó ngay
 * ở trang danh mục — trước cả khi người chơi bấm vào game nào. Bốn mục là dữ
 * liệu do lập trình viên viết ra chứ không phải nội dung do author soạn, nên
 * không có gì để một bảng DB làm ở đây ngoài việc mua một lượt round-trip.
 *
 * Hệ quả có chủ ý: thêm một game là một lần deploy, không phải một lần nhập
 * liệu. Đó là đúng hình dạng của thứ này — mỗi game là một bó mã, không phải
 * một bản ghi.
 *
 * ## Phần LOGIC nằm ở đây, phần JSX nằm ở `games-client.tsx`
 *
 * `apps/web` chạy vitest ở môi trường `node` theo mặc định (xem
 * `vitest.config.ts`), nên thứ kiểm được rẻ nhất là hàm thuần. Lọc, đếm, và
 * hai nhãn bắt buộc của mọi thẻ đều ở đây để `games-catalog.test.ts` khẳng định
 * được mà không phải dựng DOM.
 */

export const GAME_TOPICS = ['kubernetes', 'cicd', 'network', 'container', 'git'] as const;
export type GameTopic = (typeof GAME_TOPICS)[number];

/**
 * Nhãn chủ đề. Thuật ngữ hạ tầng GIỮ tiếng Anh (`Kubernetes`, `CI/CD`,
 * `container`) — dịch chúng ra tiếng Việt là tạo một từ vựng thứ hai mà không
 * tài liệu nào ngoài kia dùng. Chỉ `network` có bản tiếng Việt đủ phổ thông.
 */
export const GAME_TOPIC_LABEL: Record<GameTopic, string> = {
  kubernetes: t('catalog.games.topic.kubernetes'),
  cicd: t('catalog.games.topic.cicd'),
  network: t('catalog.games.topic.network'),
  container: t('catalog.games.topic.container'),
  git: t('catalog.games.topic.git'),
};

export interface GameEntry {
  readonly id: string;
  readonly title: string;
  /** `null` ⇒ **chưa chơi được**; thẻ hiện ở trạng thái "sắp có" và không bấm được. */
  readonly href: string | null;
  readonly description: string;
  /**
   * Độ khó **lúc bắt đầu**, không phải độ khó trung bình.
   *
   * Mỗi game đi từ dễ tới khó qua nhiều level, nên một con số duy nhất không
   * mô tả được cả game. Chọn "mức bắt đầu" vì đó là thứ người học cần để quyết
   * định mở hay không — và trang nói thẳng điều đó trong phần mô tả đầu trang
   * thay vì để người đọc tự đoán badge nghĩa là gì.
   */
  readonly difficulty: ScenarioDifficulty;
  readonly topics: readonly GameTopic[];
}

/**
 * Bốn game của đợt này: một chơi được, ba ở trạng thái "sắp có".
 *
 * Ba ô "sắp có" là **lựa chọn có ý thức** (quyết định #4 của phase), không phải
 * chỗ còn thiếu: đợt này chỉ hiện thực Kubernetes Game, ba game kia mới có thiết kế
 * (`docs/games/`, lane F). Hiện chúng ở trạng thái không bấm được là cách nói
 * ra kế hoạch mà không hứa một đường link dẫn tới trang trắng.
 */
export const GAMES: readonly GameEntry[] = [
  {
    id: 'k8s',
    title: 'Kubernetes Game',
    href: '/games/k8s',
    description:
      'Dựng rồi cứu một cluster: tạo pod, phơi service, chịu sự cố ngẫu nhiên. Mỗi level là một cluster hỏng theo một kiểu khác nhau.',
    difficulty: 'beginner',
    topics: ['kubernetes'],
  },
  {
    /*
     * Game thứ hai chơi được, thêm ở P17.
     *
     * ⚠ `id` ở đây là `string` tự do, KHÔNG phải `GameId` của
     * `@devops-platform/games`. Hai trục đó hiện không nối với nhau và tên cũng
     * không trùng (danh mục dùng `pipeline`, union dùng `cicd`). Nối chúng lại
     * sẽ là một thay đổi có chủ ý đáng ghi ra, không phải hệ quả tự nhiên của
     * việc mở union — nên ở đây vẫn là một chuỗi.
     */
    id: 'git',
    title: 'Phòng thí nghiệm Git',
    href: '/games/git',
    description:
      'Gõ lệnh git thật trên một kho mô phỏng chạy trong trình duyệt. Ba chương: nắn lịch sử, làm việc nhóm, và cứu commit tưởng đã mất.',
    difficulty: 'beginner',
    topics: ['git'],
  },
  {
    id: 'pipeline',
    title: 'Đường ống',
    href: null,
    description:
      'Nối các bước của một pipeline CI/CD thành đồ thị chạy được: build, test, quét, phát hành. Sai thứ tự thì pipeline đỏ.',
    difficulty: 'intermediate',
    topics: ['cicd'],
  },
  {
    id: 'maze',
    title: 'Mê cung mạng',
    href: null,
    description:
      'Đưa gói tin từ pod này sang pod kia qua một mê cung NetworkPolicy: mở đúng đường cần mở, đóng phần còn lại.',
    difficulty: 'advanced',
    topics: ['kubernetes', 'network'],
  },
  {
    id: 'forge',
    title: 'Lò rèn Image',
    href: null,
    description:
      'Ghép một Dockerfile chạy được rồi rèn cho nhỏ lại. Mỗi layer thừa là một điểm trừ, mỗi lần cache trượt cũng vậy.',
    difficulty: 'beginner',
    topics: ['container'],
  },
];

/**
 * Hai điều MỌI thẻ game phải nói ra — yêu cầu 14.B.6 của phase gốc.
 *
 * Là MỘT hằng số dùng chung chứ không phải hai dòng chép vào từng mục: người
 * học cần biết **trước khi bấm** cái gì tốn chỗ và cái gì không, và một field
 * `noSandbox: true` viết lại ở bốn mục là bốn dịp để mục thứ năm quên. Ở đây
 * không có đường nào để một thẻ game hiện ra mà thiếu hai nhãn này.
 *
 * Đối lập là CTF (P11): nó chạy trên hạ tầng thật nên **tốn một sandbox** và
 * **cần đăng nhập**. Trang danh mục nói cả hai vế cạnh nhau — xem khối CTF ở
 * `games-client.tsx`.
 */
export const NO_SANDBOX_LABEL = t('catalog.games.no-sandbox');
export const NO_LOGIN_LABEL = t('catalog.games.no-login');

export interface GameMetaItem {
  readonly icon: CatalogIconName;
  readonly label: string;
}

/**
 * ⚠ `icon: 'selected'` (dấu tích) cho nhãn đăng nhập là lựa chọn CÓ CÂN NHẮC.
 * Registry `catalog-icons.tsx` không có icon khoá/người dùng, và file đó là tài
 * sản dùng chung của năm trang danh mục — thêm một icon vào giữa lượt fan-out
 * song song là chạm một file lane khác cũng có thể đang chạm. Dấu tích cạnh một
 * mệnh đề khẳng định ("✓ Không cần đăng nhập") đọc đúng nghĩa, nên cái giá duy
 * nhất là tên khoá trong registry hơi lệch ngữ cảnh.
 */
export const GAME_META: readonly GameMetaItem[] = [
  { icon: 'sandbox', label: NO_SANDBOX_LABEL },
  { icon: 'selected', label: NO_LOGIN_LABEL },
];

export interface GameFilterState {
  readonly topic: GameTopic | 'all';
  readonly difficulty: ScenarioDifficulty | 'all';
}

export const NO_GAME_FILTER: GameFilterState = { topic: 'all', difficulty: 'all' };

export function hasActiveGameFilter(filters: GameFilterState): boolean {
  return filters.topic !== 'all' || filters.difficulty !== 'all';
}

/**
 * Lọc theo chủ đề + độ khó. Lọc CHẠY Ở CLIENT trên toàn bộ danh sách, nên
 * KHÔNG có cảnh báo phạm vi kiểu `describeSortScope` của các trang danh mục
 * khác: ở đó server phân trang keyset nên sắp xếp chỉ áp cho trang đang tải,
 * còn ở đây bốn mục đã nằm sẵn trong bundle — "khớp bộ lọc" là khớp toàn bộ kho.
 */
export function filterGames(
  games: readonly GameEntry[],
  filters: GameFilterState,
): readonly GameEntry[] {
  return games.filter(
    (game) =>
      (filters.topic === 'all' || game.topics.includes(filters.topic)) &&
      (filters.difficulty === 'all' || game.difficulty === filters.difficulty),
  );
}

/**
 * Dòng đếm của `/games`, trả về KHOÁ chứ không trả về câu (§1.6).
 *
 * Không có vế “trong trang này”, và đó là một khác biệt CÓ THẬT so với năm trang
 * danh mục: bốn mục nằm sẵn trong bundle nên bộ lọc và ô tìm đều chạy trên TOÀN
 * BỘ kho. Mượn câu cảnh báo phạm vi của các trang kia sang đây sẽ là cảnh báo
 * về một giới hạn không tồn tại.
 */
export function describeGameCount(shown: number, filtering: boolean): CopyRef {
  return filtering
    ? { key: 'catalog.games.count-filtered', params: { shown } }
    : { key: 'catalog.games.count', params: { shown } };
}
