import { describe, expect, it } from 'vitest';
import { renderCopy } from '@devops-platform/copy';
import { SCENARIO_DIFFICULTIES } from '@devops-platform/shared-types/scenario';
import {
  GAMES,
  GAME_META,
  GAME_TOPICS,
  GAME_TOPIC_LABEL,
  NO_GAME_FILTER,
  NO_LOGIN_LABEL,
  NO_SANDBOX_LABEL,
  describeGameCount,
  filterGames,
  hasActiveGameFilter,
} from './games-catalog';

describe('GAMES — hình dạng dữ liệu', () => {
  /*
   * ⚠ Ô này là một PIN theo DANH TÍNH, không theo số đếm — và đó là lý do nó
   * sửa được một cách an toàn.
   *
   * P17 thêm game Git, nên con số đi từ 4 lên 5 và tập "chơi được" đi từ
   * `['k8s']` lên `['k8s','git']`. Hướng đi LÊN vì có thêm một game thật, không
   * phải vì một game cũ hỏng — nên việc phải làm là cập nhật danh sách, không
   * phải nới ô. Nếu một ngày nào đó một id BIẾN MẤT khỏi vế "chơi được" thì đó
   * là hồi quy và ô này phải đỏ.
   *
   * 19.H là lượt cập nhật thứ hai, và nó có một khác biệt đáng đọc kỹ: TỔNG
   * không đổi (vẫn năm mục), một id CHUYỂN PHE. Mục `pipeline` không biến mất
   * mà được đổi tên thành `cicd` cùng lúc nhận `href` — xem chú thích của chính
   * mục đó ở `games-catalog.ts` về lý do đổi tên. Nên hai danh sách dưới đây
   * phải sửa CẢ HAI VẾ trong một lượt: chỉ sửa vế "chơi được" thì vế "sắp có"
   * còn giữ một id không tồn tại, và ô sẽ đỏ vì đúng lý do nhưng với một thông
   * báo khó đọc.
   */
  it('năm mục: ba chơi được, hai sắp có', () => {
    expect(GAMES).toHaveLength(5);
    expect(GAMES.filter((game) => game.href !== null).map((game) => game.id)).toEqual([
      'k8s',
      'git',
      'cicd',
    ]);
    expect(GAMES.filter((game) => game.href === null).map((game) => game.id)).toEqual([
      'maze',
      'forge',
    ]);
  });

  /*
   * Ô này gác đúng một thứ mà ô trên KHÔNG gác: một mục có thể mang `href` khác
   * `null` mà vẫn trỏ sai đường. Ba dòng, mỗi dòng cho một route đã dựng thật.
   */
  it('mục chơi được trỏ đúng route đã dựng', () => {
    expect(GAMES.find((game) => game.id === 'k8s')?.href).toBe('/games/k8s');
    expect(GAMES.find((game) => game.id === 'git')?.href).toBe('/games/git');
    expect(GAMES.find((game) => game.id === 'cicd')?.href).toBe('/games/cicd');
  });

  it('mọi mục có id duy nhất, tiêu đề và mô tả không rỗng', () => {
    expect(new Set(GAMES.map((game) => game.id)).size).toBe(GAMES.length);
    for (const game of GAMES) {
      expect(game.title.trim()).not.toBe('');
      expect(game.description.trim()).not.toBe('');
    }
  });

  /**
   * Chủ đề và độ khó là thứ BỘ LỌC đọc. Một mục không chủ đề sẽ biến mất khỏi
   * mọi lượt lọc theo chủ đề mà không lệnh nào kêu — nó chỉ đơn giản không bao
   * giờ xuất hiện, và trông y hệt "chưa có game nào ở chủ đề đó".
   */
  it('mọi mục có ít nhất một chủ đề, và chủ đề nằm trong danh sách đã khai', () => {
    for (const game of GAMES) {
      expect(game.topics.length).toBeGreaterThan(0);
      for (const topic of game.topics) {
        expect(GAME_TOPICS).toContain(topic);
      }
    }
  });

  it('mọi mục có độ khó hợp lệ theo hợp đồng ScenarioDifficulty', () => {
    for (const game of GAMES) {
      expect(SCENARIO_DIFFICULTIES).toContain(game.difficulty);
    }
  });

  /**
   * Hai chiều (`pinned-baseline-test-companion`): thiếu nhãn chủ đề là một lỗi
   * (chip hiện ra rỗng), nhãn thừa trỏ tới chủ đề không còn tồn tại là một lỗi
   * khác — bảng biến thành nghĩa địa và bộ lọc mọc một chip không lọc được gì.
   */
  it('bảng nhãn chủ đề khớp đúng danh sách chủ đề, không thiếu không thừa', () => {
    expect(Object.keys(GAME_TOPIC_LABEL).sort()).toEqual([...GAME_TOPICS].sort());
    for (const topic of GAME_TOPICS) {
      expect(GAME_TOPIC_LABEL[topic].trim()).not.toBe('');
    }
  });
});

/**
 * Yêu cầu 14.B.6: **mọi** thẻ game phải nói ra rằng nó không tốn sandbox và
 * không cần đăng nhập. Bảo đảm đó là CẤU TRÚC — `games-client.tsx` render đúng
 * một hằng số `GAME_META` cho cả bốn thẻ, nên không có đường để một thẻ thiếu
 * nhãn. Khẳng định dưới đây ghim NỘI DUNG của hằng số đó; nếu ai xoá một dòng
 * để "cho thẻ gọn hơn", ô này đỏ.
 */
describe('GAME_META — hai điều mọi thẻ phải nói', () => {
  it('có cả nhãn sandbox lẫn nhãn đăng nhập', () => {
    expect(GAME_META.map((item) => item.label)).toEqual([NO_SANDBOX_LABEL, NO_LOGIN_LABEL]);
  });

  it('hai nhãn nói ra chữ KHÔNG — chúng là lời phủ định, không phải nhãn phân loại', () => {
    expect(NO_SANDBOX_LABEL).toMatch(/không.*sandbox/i);
    expect(NO_LOGIN_LABEL).toMatch(/không.*đăng nhập/i);
  });
});

describe('filterGames', () => {
  it('không lọc gì thì trả về nguyên danh sách', () => {
    expect(filterGames(GAMES, NO_GAME_FILTER)).toEqual(GAMES);
  });

  it('lọc theo chủ đề chỉ giữ mục MANG chủ đề đó', () => {
    const result = filterGames(GAMES, { topic: 'kubernetes', difficulty: 'all' });
    expect(result.map((game) => game.id)).toEqual(['k8s', 'maze']);
  });

  it('mục nhiều chủ đề khớp ở CẢ HAI chủ đề của nó', () => {
    const byNetwork = filterGames(GAMES, { topic: 'network', difficulty: 'all' });
    expect(byNetwork.map((game) => game.id)).toEqual(['maze']);
  });

  it('lọc theo độ khó chỉ giữ đúng mức đó', () => {
    expect(filterGames(GAMES, { topic: 'all', difficulty: 'beginner' }).map((g) => g.id)).toEqual([
      'k8s',
      'git',
      'forge',
    ]);
    expect(filterGames(GAMES, { topic: 'all', difficulty: 'advanced' }).map((g) => g.id)).toEqual([
      'maze',
    ]);
  });

  it('hai điều kiện là AND, không phải OR', () => {
    expect(filterGames(GAMES, { topic: 'kubernetes', difficulty: 'advanced' }).map((g) => g.id)).toEqual([
      'maze',
    ]);
  });

  /**
   * Đối chứng ÂM. Không có ô này thì mọi khẳng định trên vẫn xanh với một hàm
   * `filterGames = (games) => games` — chúng chỉ tình cờ khớp ở những tổ hợp có
   * kết quả. Đây là tổ hợp hợp lệ mà kho KHÔNG có mục nào, và nó phải ra rỗng.
   */
  it('tổ hợp không mục nào khớp thì ra danh sách RỖNG', () => {
    expect(filterGames(GAMES, { topic: 'kubernetes', difficulty: 'intermediate' })).toEqual([]);
    expect(filterGames(GAMES, { topic: 'container', difficulty: 'advanced' })).toEqual([]);
  });

  it('mọi chủ đề đã khai đều có ít nhất một game — không chip nào lọc ra rỗng ngay từ đầu', () => {
    for (const topic of GAME_TOPICS) {
      expect(filterGames(GAMES, { topic, difficulty: 'all' }).length).toBeGreaterThan(0);
    }
  });
});

describe('hasActiveGameFilter', () => {
  it('mặc định là KHÔNG lọc', () => {
    expect(hasActiveGameFilter(NO_GAME_FILTER)).toBe(false);
  });

  it('bật một trong hai chiều là đã lọc', () => {
    expect(hasActiveGameFilter({ topic: 'cicd', difficulty: 'all' })).toBe(true);
    expect(hasActiveGameFilter({ topic: 'all', difficulty: 'beginner' })).toBe(true);
  });
});

describe('describeGameCount', () => {
  it('không lọc thì KHÔNG nói "khớp bộ lọc" — câu đó sẽ là một khẳng định sai', () => {
    expect(renderCopy(describeGameCount(4, false))).toBe('4 game');
  });

  it('có lọc thì nói rõ con số là con số ĐÃ LỌC', () => {
    expect(renderCopy(describeGameCount(2, true))).toBe('2 game khớp bộ lọc');
  });
});
