'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Code2,
  GitBranch,
  Layers3,
  Search,
  Terminal,
  Trophy,
} from 'lucide-react';
import { t } from '@devops-platform/copy';
import { GAMES, GAME_TOPIC_LABEL } from '../../app/games/games-catalog';
import { normalizeSearchQuery } from '../catalog/catalog-search';
import { useViewer } from '../shell/viewer-context';

/** SVG artwork stays lightweight on machines running a lab alongside the browser. */
function GameArtwork({ kind }: { readonly kind: string }) {
  return (
    <svg viewBox="0 0 560 260" fill="none" aria-hidden="true" className="game-artwork">
      <path
        d="M0 220 280 60l280 160M0 160l280 100 280-160M0 100l280 160"
        stroke="currentColor"
        opacity=".08"
      />
      {kind === 'git' ? (
        <>
          <path
            d="M84 184h128c54 0 38-110 96-110h150M212 184h246"
            stroke="currentColor"
            strokeWidth="5"
            opacity=".6"
          />
          <path
            d="M310 74c54 0 34 110 86 110"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="7 7"
            opacity=".35"
          />
          {[84, 174, 290, 396, 458].map((x, i) => (
            <g key={x}>
              <circle
                cx={x}
                cy={i === 2 ? 74 : 184}
                r="17"
                fill="var(--art-surface)"
                stroke="currentColor"
                strokeWidth="4"
              />
              <circle cx={x} cy={i === 2 ? 74 : 184} r="5" fill="currentColor" />
            </g>
          ))}
          <rect x="280" y="17" width="96" height="28" rx="7" fill="currentColor" opacity=".14" />
          <text x="298" y="36" fill="currentColor" fontSize="13" fontFamily="monospace">
            feature
          </text>
          <text x="86" y="226" fill="currentColor" fontSize="13" fontFamily="monospace">
            main
          </text>
        </>
      ) : (
        <>
          <path
            d="m280 66-148 85m148-85 148 85M132 151l148 65 148-65M280 66v150"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 6"
            opacity=".5"
          />
          {[
            { x: 280, y: 38 },
            { x: 132, y: 126 },
            { x: 428, y: 126 },
            { x: 280, y: 191 },
          ].map(({ x, y }, i) => (
            <g key={x + y}>
              <path
                d={`M${x} ${y - 26}l42 23v47l-42 23-42-23v-47z`}
                fill="var(--art-surface)"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d={`M${x - 42} ${y - 3}l42 23 42-23m-42 23v47`}
                stroke="currentColor"
                strokeWidth="2"
                opacity=".6"
              />
              <circle cx={x} cy={y - 3} r="5" fill="currentColor" />
              {i === 0 && (
                <text x={x + 56} y={y + 5} fill="currentColor" fontSize="12" fontFamily="monospace">
                  cluster
                </text>
              )}
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

const TOPICS = [
  ['all', 'Tất cả'],
  ['git', 'Git'],
  ['kubernetes', 'Kubernetes'],
  ['cicd', 'CI/CD'],
  ['container', 'Container'],
] as const;

export function GamesHub() {
  const viewer = useViewer();
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('all');
  const query = normalizeSearchQuery(search);
  const matches = GAMES.filter(
    (game) =>
      (topic === 'all' || game.topics.some((value) => value === topic)) &&
      normalizeSearchQuery(`${game.title} ${game.description} ${game.topics.join(' ')}`).includes(
        query,
      ),
  );
  const available = matches.filter((game) => game.href !== null);
  const upcoming = matches.filter((game) => game.href === null);
  const author = viewer?.role === 'author' || viewer?.role === 'admin';

  return (
    <div className="practice-home">
      <header className="practice-heading">
        <div>
          <p className="practice-eyebrow">PLAY · LEARN · BUILD</p>
          <h1>Chọn game. Bắt đầu thực hành.</h1>
          <p>Thử lệnh, giải bài và nhìn thấy hệ thống thay đổi.</p>
        </div>
        <Link href="/problems" className="practice-link">
          Kho bài tập <ArrowRight size={17} />
        </Link>
      </header>
      <div className="practice-home-grid">
        <section className="practice-library" aria-labelledby="game-library-title">
          <div className="practice-section-heading">
            <h2 id="game-library-title">{t('catalog.title.games')}</h2>
            <span>{t('catalog.lead.games')}</span>
          </div>
          <div className="practice-discovery">
            <div className="practice-filter" aria-label="Chủ đề game">
              {TOPICS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={topic === value}
                  onClick={() => setTopic(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="practice-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Tìm game</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm game…"
                type="search"
              />
            </label>
          </div>
          <div className="practice-game-grid">
            {available.map((game) => (
              <Link className={`practice-game game-${game.id}`} key={game.id} href={game.href!}>
                <div className="practice-game-art">
                  <span className="practice-game-label">
                    {game.id === 'git' ? 'VERSION CONTROL' : 'CLUSTER OPERATIONS'}
                  </span>
                  <GameArtwork kind={game.id} />
                  <span className="practice-play">
                    <ArrowRight size={22} />
                  </span>
                </div>
                <div className="practice-game-info">
                  <div>
                    <span className="practice-eyebrow">
                      {game.topics.map((item) => GAME_TOPIC_LABEL[item]).join(' / ')}
                    </span>
                    <h3>{game.id === 'git' ? 'Git Odyssey' : game.title}</h3>
                  </div>
                  <p>
                    {game.id === 'git'
                      ? 'Rẽ nhánh, hợp nhất và cứu lại commit.'
                      : 'Dựng cluster, triển khai ứng dụng và xử lý sự cố.'}
                  </p>
                  <div className="practice-game-footer">
                    <span>Từ cơ bản</span>
                    <strong>
                      Vào chơi <ChevronRight size={15} />
                    </strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {matches.length === 0 && (
            <div className="practice-empty">
              <Search size={28} />
              <h3>{t('catalog.empty.games.title')}</h3>
              <p>{t('catalog.empty.games.body')}</p>
              <button
                type="button"
                className="practice-link"
                onClick={() => {
                  setSearch('');
                  setTopic('all');
                }}
              >
                Xóa bộ lọc
              </button>
            </div>
          )}
          {upcoming.length > 0 && (
            <section className="practice-upcoming" aria-label="Game đang phát triển">
              <h3>{t('catalog.games.soon')}</h3>
              {upcoming.map((game) => (
                <div key={game.id}>
                  <Layers3 size={20} aria-hidden="true" />
                  <span>
                    {game.title}
                    <small>{game.topics.map((item) => GAME_TOPIC_LABEL[item]).join(' · ')}</small>
                  </span>
                  <span className="practice-soon">Sắp có</span>
                </div>
              ))}
            </section>
          )}
          <p className="practice-footnote">Game không cần đăng nhập và không dùng sandbox.</p>
        </section>
        <aside className="practice-aside" aria-label="Hoạt động thực hành">
          <section className="practice-challenge">
            <span className="practice-icon">
              <Code2 size={22} />
            </span>
            <p className="practice-eyebrow">ONLINE JUDGE</p>
            <h2>
              Một bài toán.
              <br />
              Tự tìm lời giải.
            </h2>
            <p>Chọn game, đọc đề và nộp bài để nhận kết quả chấm.</p>
            <Link href="/problems">
              Giải bài tập <ArrowRight size={18} />
            </Link>
          </section>
          <section className="practice-shortcuts">
            <h2>Không gian của bạn</h2>
            <Link href="/exams">
              <Trophy size={20} />
              <span>
                Kỳ thi thực hành<small>Lịch thi và bài làm</small>
              </span>
              <ChevronRight size={16} />
            </Link>
            <Link href="/lessons">
              <BookOpen size={20} />
              <span>
                Bài học<small>Học theo từng bước</small>
              </span>
              <ChevronRight size={16} />
            </Link>
            <Link href="/labs">
              <Terminal size={20} />
              <span>
                Lab & CTF<small>Sandbox thật · Cần đăng nhập</small>
              </span>
              <ChevronRight size={16} />
            </Link>
          </section>
          {author && (
            <section className="practice-studio-card">
              <GitBranch size={20} />
              <h2>Tạo thử thách của bạn</h2>
              <Link href="/author/problems/new">
                Problem creator <ArrowRight size={16} />
              </Link>
              <Link href="/games/git?mode=builder">
                Level builder <ArrowRight size={16} />
              </Link>
              <Link href="/author/new">
                Soạn bài học <ArrowRight size={16} />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
