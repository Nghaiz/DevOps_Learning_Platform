'use client';

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { t } from '@devops-platform/copy';
import { Badge, Button, Card, EmptyState } from '@devops-platform/ui';
import { CatalogPage } from '../../components/catalog/catalog-page';
import { CatalogCard, CatalogGrid } from '../../components/catalog/catalog-grid';
import { CatalogIcon } from '../../components/catalog/catalog-icons';
import {
  DIFFICULTY_ACCENT,
  DIFFICULTY_BADGE,
  difficultyLabel,
} from '../../components/catalog/catalog-labels';
import { normalizeSearchQuery, searchPage } from '../../components/catalog/catalog-search';
import { GamesToolbar } from './games-toolbar';
import {
  GAMES,
  GAME_META,
  GAME_TOPIC_LABEL,
  NO_GAME_FILTER,
  filterGames,
  type GameEntry,
  type GameFilterState,
  type GameTopic,
} from './games-catalog';

/**
 * Trụ cột ③ Games, trang danh mục (hợp đồng C4, `phase-14-exec.md` §4.1).
 *
 * ## Không một lời gọi mạng nào
 *
 * Không `api.*`, không `fetch`, không `TrpcQueryProvider` (xem `layout.tsx`).
 * Danh sách là hằng số trong bundle. Đó là điều kiện của ô nghiệm thu "0 lời gọi
 * backend", và ô đó đo bằng network trace của Playwright chứ không bằng việc đọc
 * file này, nên đừng thêm một `useQuery` "chỉ để đếm lượt chơi".
 *
 * Ô tìm của 16.C không phá điều đó: nó lọc `GAMES`, một mảng đã nằm sẵn trong
 * bundle, bằng cùng hàm thuần mà năm trang danh mục dùng.
 *
 * ## Trạng thái lọc ở `useState`, không ở URL
 *
 * Khác `useCatalogControls` (giữ cursor + bộ lọc cho một danh sách phân trang từ
 * server), ở đây bốn mục nằm sẵn trong bộ nhớ nên bộ lọc không có gì để đồng bộ
 * với server. Chưa đưa vào query string vì trang này chưa có gì đáng chia sẻ
 * bằng đường link: bốn ô nhìn hết trong một màn hình.
 */
export function GamesClient(): ReactElement {
  const [filters, setFilters] = useState<GameFilterState>(NO_GAME_FILTER);
  const [search, setSearch] = useState('');

  const setTopic = useCallback((topic: GameTopic | 'all') => {
    setFilters((prev) => ({ ...prev, topic }));
  }, []);
  const setDifficulty = useCallback((difficulty: ScenarioDifficulty | 'all') => {
    setFilters((prev) => ({ ...prev, difficulty }));
  }, []);
  const clearFilters = useCallback(() => {
    setFilters(NO_GAME_FILTER);
    setSearch('');
  }, []);

  const normalizedSearch = useMemo(() => normalizeSearchQuery(search), [search]);
  const games = useMemo(
    () => searchPage(filterGames(GAMES, filters), normalizedSearch, gameSearchFields),
    [filters, normalizedSearch],
  );

  return (
    <CatalogPage title={t('catalog.title.games')} description={t('catalog.lead.games')}>
      <GamesToolbar
        filters={filters}
        shown={games.length}
        search={search}
        onSearch={setSearch}
        onTopic={setTopic}
        onDifficulty={setDifficulty}
        onClearFilters={clearFilters}
      />

      {games.length === 0 ? (
        <EmptyState
          title={t('catalog.empty.games.title')}
          description={t('catalog.empty.games.body')}
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t('catalog.action.clear-filter')}
            </Button>
          }
        />
      ) : (
        <CatalogGrid>
          {games.map((game) =>
            game.href === null ? (
              <GameSoonCard key={game.id} game={game} />
            ) : (
              <CatalogCard
                key={game.id}
                href={game.href}
                title={game.title}
                description={game.description}
                difficulty={game.difficulty}
                meta={GAME_META}
                tags={game.topics.map((topic) => GAME_TOPIC_LABEL[topic])}
              />
            ),
          )}
        </CatalogGrid>
      )}

      <ChallengeNote />
    </CatalogPage>
  );
}

/** Ô tìm soi đúng thứ hiện trên thẻ: tiêu đề, mô tả, và nhãn chủ đề. */
function gameSearchFields(game: GameEntry): readonly string[] {
  return [game.title, game.description, ...game.topics.map((topic) => GAME_TOPIC_LABEL[topic])];
}

/**
 * Thẻ của một game **chưa chơi được**.
 *
 * Vì sao không dùng `CatalogCard`: thẻ đó bọc toàn bộ nội dung trong một
 * `<Link>`, tức nó luôn bấm được. Một link dẫn tới trang chưa tồn tại là lời hứa
 * suông đúng nghĩa, và `Card` cố ý mặc định `interactive: false` để chặn chính
 * hình dạng đó. Nên thẻ này là bản KHÔNG-link của cùng bố cục: cùng dải độ khó,
 * cùng badge, cùng `min-h-10` giữ chỗ mô tả, để bốn thẻ có chung một đường đáy.
 *
 * "Sắp có" nằm ở đúng chỗ badge trạng thái của `CatalogCard`, nên người quét
 * lưới đọc được "cái nào mở được" mà không phải thử bấm từng ô. `status-todo` là
 * biến thể trung tính; `status-locked` (ổ khoá) sẽ nói sai, vì không ai bị khoá ở
 * đây, game chỉ chưa được viết.
 */
function GameSoonCard({ game }: { readonly game: GameEntry }): ReactElement {
  return (
    <li>
      <Card accent={DIFFICULTY_ACCENT[game.difficulty]} className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl leading-snug font-semibold text-balance text-foreground">
            {game.title}
          </h2>
          <Badge variant="status-todo">{t('catalog.games.soon')}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={DIFFICULTY_BADGE[game.difficulty]}>
            {difficultyLabel(game.difficulty)}
          </Badge>
        </div>

        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{game.description}</p>

        <div className="mt-auto flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {GAME_META.map((item) => (
              <Badge key={item.label} variant="secondary" icon={<CatalogIcon name={item.icon} />}>
                {item.label}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {game.topics.map((topic) => (
              <Badge key={topic} variant="outline" icon={<CatalogIcon name="topic" />}>
                {GAME_TOPIC_LABEL[topic]}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </li>
  );
}

/**
 * Khối CTF, yêu cầu 14.B.6 của phase gốc.
 *
 * ## Vì sao là một khối riêng, KHÔNG phải thẻ thứ năm trong lưới
 *
 * Nếu CTF là một mục trong `GAMES`, bộ lọc chủ đề/độ khó và ô tìm sẽ **giấu nó
 * đi** ở phần lớn tổ hợp, và cả điểm của mục này là để người học biết TRƯỚC KHI
 * BẤM cái gì tốn một chỗ sandbox và cái gì không. Một cảnh báo chi phí mà bộ lọc
 * ẩn được thì không phải cảnh báo.
 *
 * Lý do thứ hai: nó không cùng loại. Bốn thẻ trên chạy trong trình duyệt; CTF
 * chạy trên hạ tầng thật với runtime gVisor (P11). Xếp chung một lưới là nói
 * rằng chúng cùng một hạng, rồi để hai badge nhỏ đính chính lại.
 *
 * ⛔ KHÔNG hardcode đường tới một CTF cụ thể: `content/` hiện chưa có scenario
 * CTF nào (đo 2026-09-08). Trỏ tới `/labs` là trỏ tới nơi nó sẽ nằm, và câu chữ
 * không hứa rằng đã có bài ở đó.
 *
 * ⚠ Đoạn văn dưới đây mang thẻ `<strong>` giữa câu, nên nó KHÔNG dựng được từ
 * một khoá `catalog.*` duy nhất: `Params` của `packages/copy` cố ý chỉ nhận
 * `string | number`, và nhét một `ReactNode` vào đó sẽ biến bản đồ thông điệp
 * thành tầng render, thứ làm bộ dò mất khả năng đọc giá trị ra chuỗi (§1.1). Đây
 * là chỗ duy nhất trong lane còn văn xuôi trong JSX, và nó ở đây có chủ ý chứ
 * không phải sót. Đường đúng để đóng nốt là một khoá `List` cộng một renderer
 * nhấn mạnh, và việc đó vượt phạm vi 16.C.
 */
function ChallengeNote(): ReactElement {
  return (
    <section
      aria-labelledby="games-challenge-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-elevation-1"
    >
      <h2 id="games-challenge-title" className="text-xl font-semibold text-foreground">
        {t('catalog.games.challenge-title')}
      </h2>
      <p className="max-w-(--measure) text-sm text-muted-foreground">
        CTF cho bạn quyền root trong một sandbox thật để đi tìm cờ. Vì nó chạy trên hạ tầng chứ
        không phải trong trình duyệt,{' '}
        <strong className="font-semibold text-foreground">CTF tốn một sandbox</strong> và{' '}
        <strong className="font-semibold text-foreground">cần đăng nhập</strong>, ngược hẳn với bốn
        game ở trên. Bài CTF nằm cùng chỗ với Lab; lọc theo sandbox gVisor để tìm.
      </p>
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/labs">{t('catalog.games.challenge-cta')}</Link>
        </Button>
      </div>
    </section>
  );
}
