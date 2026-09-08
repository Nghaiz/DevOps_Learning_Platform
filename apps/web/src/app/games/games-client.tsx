'use client';

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import type { ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { Badge, Button, Card, EmptyState } from '@devops-platform/ui';
import { CatalogPage } from '../../components/catalog/catalog-page';
import { CatalogCard, CatalogGrid } from '../../components/catalog/catalog-grid';
import { CatalogIcon } from '../../components/catalog/catalog-icons';
import {
  DIFFICULTY_ACCENT,
  DIFFICULTY_BADGE,
  DIFFICULTY_LABEL,
} from '../../components/catalog/catalog-labels';
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
 * Trụ cột ③ Games — trang danh mục (hợp đồng C4, `phase-14-exec.md` §4.1).
 *
 * ## Không một lời gọi mạng nào
 *
 * Không `api.*`, không `fetch`, không `TrpcQueryProvider` (xem `layout.tsx`).
 * Danh sách là hằng số trong bundle. Đó là điều kiện của ô nghiệm thu "0 lời
 * gọi backend", và ô đó đo bằng network trace của Playwright chứ không bằng
 * việc đọc file này — nên đừng thêm một `useQuery` "chỉ để đếm lượt chơi".
 *
 * ## Trạng thái lọc ở `useState`, không ở URL
 *
 * Khác `useCatalogControls` (giữ cursor + bộ lọc cho một danh sách phân trang
 * từ server), ở đây bốn mục nằm sẵn trong bộ nhớ nên bộ lọc không có gì để đồng
 * bộ với server. Chưa đưa vào query string vì trang này chưa có gì đáng chia sẻ
 * bằng đường link — bốn ô nhìn hết trong một màn hình.
 */
export function GamesClient(): ReactElement {
  const [filters, setFilters] = useState<GameFilterState>(NO_GAME_FILTER);

  const setTopic = useCallback((topic: GameTopic | 'all') => {
    setFilters((prev) => ({ ...prev, topic }));
  }, []);
  const setDifficulty = useCallback((difficulty: ScenarioDifficulty | 'all') => {
    setFilters((prev) => ({ ...prev, difficulty }));
  }, []);
  const clearFilters = useCallback(() => {
    setFilters(NO_GAME_FILTER);
  }, []);

  const games = useMemo(() => filterGames(GAMES, filters), [filters]);

  return (
    <CatalogPage
      title="Games"
      description="Game chạy hoàn toàn trong trình duyệt: không tốn sandbox, không cần đăng nhập, tiến độ lưu ngay trên máy bạn. Độ khó ghi trên thẻ là mức lúc BẮT ĐẦU — mỗi game còn tăng dần qua nhiều level."
    >
      <GamesToolbar
        filters={filters}
        shown={games.length}
        onTopic={setTopic}
        onDifficulty={setDifficulty}
        onClearFilters={clearFilters}
      />

      {games.length === 0 ? (
        <EmptyState
          title="Không có game nào khớp bộ lọc"
          description="Bốn game vẫn ở đó — bỏ bớt điều kiện lọc để xem lại toàn bộ."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Xoá bộ lọc
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

/**
 * Thẻ của một game **chưa chơi được**.
 *
 * Vì sao không dùng `CatalogCard`: thẻ đó bọc toàn bộ nội dung trong một
 * `<Link>`, tức nó luôn bấm được. Một link dẫn tới trang chưa tồn tại là lời
 * hứa suông đúng nghĩa — và `Card` cố ý mặc định `interactive: false` để chặn
 * chính hình dạng đó. Nên thẻ này là bản KHÔNG-link của cùng bố cục: cùng dải
 * độ khó, cùng badge, cùng `min-h-10` giữ chỗ mô tả, để bốn thẻ có chung một
 * đường đáy.
 *
 * "Sắp có" nằm ở đúng chỗ badge trạng thái của `CatalogCard` — người quét lưới
 * đọc được "cái nào mở được" mà không phải thử bấm từng ô. `status-todo` là
 * biến thể trung tính; `status-locked` (ổ khoá) sẽ nói sai — không ai bị khoá
 * ở đây, game chỉ chưa được viết.
 */
function GameSoonCard({ game }: { readonly game: GameEntry }): ReactElement {
  return (
    <li>
      <Card accent={DIFFICULTY_ACCENT[game.difficulty]} className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base leading-snug font-semibold text-foreground">{game.title}</h3>
          <Badge variant="status-todo">Sắp có</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={DIFFICULTY_BADGE[game.difficulty]}>{DIFFICULTY_LABEL[game.difficulty]}</Badge>
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
 * Khối CTF — yêu cầu 14.B.6 của phase gốc.
 *
 * ## Vì sao là một khối riêng, KHÔNG phải thẻ thứ năm trong lưới
 *
 * Nếu CTF là một mục trong `GAMES`, bộ lọc chủ đề/độ khó sẽ **giấu nó đi** ở
 * phần lớn tổ hợp — và cả điểm của mục này là để người học biết TRƯỚC KHI BẤM
 * cái gì tốn một chỗ sandbox và cái gì không. Một cảnh báo chi phí mà bộ lọc
 * ẩn được thì không phải cảnh báo.
 *
 * Lý do thứ hai: nó không cùng loại. Bốn thẻ trên chạy trong trình duyệt; CTF
 * chạy trên hạ tầng thật với runtime gVisor (P11). Xếp chung một lưới là nói
 * rằng chúng cùng một hạng, rồi để hai badge nhỏ đính chính lại.
 *
 * ⛔ KHÔNG hardcode đường tới một CTF cụ thể: `content/` hiện chưa có scenario
 * CTF nào (đo 2026-09-08). Trỏ tới `/labs` là trỏ tới nơi nó sẽ nằm, và câu chữ
 * không hứa rằng đã có bài ở đó.
 */
function ChallengeNote(): ReactElement {
  return (
    <section
      aria-labelledby="games-challenge-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
    >
      <h2 id="games-challenge-title" className="text-base font-semibold text-foreground">
        Thử thách CTF — thứ nằm cạnh game và tốn chỗ thật
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        CTF cho bạn quyền root trong một sandbox thật để đi tìm cờ. Vì nó chạy trên hạ tầng chứ không
        phải trong trình duyệt, <strong className="font-semibold text-foreground">CTF tốn một sandbox</strong>{' '}
        và <strong className="font-semibold text-foreground">cần đăng nhập</strong> — ngược hẳn với bốn game ở
        trên. Bài CTF nằm cùng chỗ với Lab; lọc theo sandbox gVisor để tìm.
      </p>
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/labs">Xem Lab</Link>
        </Button>
      </div>
    </section>
  );
}
