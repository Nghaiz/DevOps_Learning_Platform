'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Compass,
  Flag,
  FlaskConical,
  GitBranch,
  Play,
  Shield,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { GIT_LEVELS } from '@devops-platform/games';
import { GitWorldArt } from './git-world-art';
import { readGitProgress, type GitProgress } from './git-progress';
import './git-odyssey.css';

export const GIT_REGIONS = {
  1: {
    name: 'Quần đảo khởi nguyên',
    subtitle: 'Nắn lịch sử',
    description: 'Rẽ nhánh, kết nối những commit và làm chủ dòng thời gian của bạn.',
    icon: GitBranch,
  },
  2: {
    name: 'Thành phố kết nối',
    subtitle: 'Làm việc nhóm',
    description: 'Đồng bộ hai thế giới. Phối hợp với đồng đội và đưa thay đổi về đúng nơi.',
    icon: Compass,
  },
  3: {
    name: 'Vùng thời gian thất lạc',
    subtitle: 'Cứu hộ',
    description: 'Lần theo dấu vết, tìm lại commit và giải cứu những lịch sử tưởng đã mất.',
    icon: Shield,
  },
} as const;
const DIFFICULTY = {
  basic: 'Nhập môn',
  intermediate: 'Thử thách',
  advanced: 'Chuyên sâu',
} as const;

export function GitCampaign({
  onPick,
  onSandbox,
}: {
  readonly onPick: (id: string) => void;
  readonly onSandbox: () => void;
}) {
  const [chapter, setChapter] = useState<1 | 2 | 3>(1);
  const [selectedId, setSelectedId] = useState(GIT_LEVELS[0]?.id ?? '');
  const [progress, setProgress] = useState<GitProgress>({});
  useEffect(() => {
    setProgress(readGitProgress());
  }, []);
  const region = GIT_REGIONS[chapter];
  const levels = GIT_LEVELS.filter((level) => level.chapter === chapter);
  const selected = levels.find((level) => level.id === selectedId) ?? levels[0];
  const completed = GIT_LEVELS.filter((level) => progress[level.id]?.completed).length;
  const next = GIT_LEVELS.find((level) => !progress[level.id]?.completed) ?? GIT_LEVELS[0];
  const Icon = region.icon;
  return (
    <div className="git-odyssey git-campaign" data-chapter={chapter}>
      <header className="git-campaign-nav">
        <div className="git-wordmark">
          <span className="git-brand-icon">
            <GitBranch size={22} />
          </span>
          <span>
            GIT <b>ODYSSEY</b>
            <small>HỌC GIT · CHƠI ĐỂ HIỂU</small>
          </span>
        </div>
        <div className="git-nav-actions">
          <span className="git-campaign-score">
            <Trophy size={16} /> {completed}/{GIT_LEVELS.length} trạm
          </span>
          <button className="git-button" onClick={onSandbox}>
            <FlaskConical size={16} /> Sandbox & Builder
          </button>
        </div>
      </header>
      <section className="git-campaign-hero">
        <div className="git-hero-copy">
          <p className="git-eyebrow">
            <Sparkles size={14} /> CUỘC PHIÊU LƯU QUA NHỮNG DÒNG LỊCH SỬ
          </p>
          <h1>
            Mỗi nhánh rẽ.
            <br />
            <em>Một khả năng mới.</em>
          </h1>
          <p>
            Biến lệnh Git thành những bước khám phá. Kết nối commit, chinh phục nhiệm vụ và tự tay
            kiến tạo lịch sử.
          </p>
          <button className="git-button git-button-primary" onClick={() => next && onPick(next.id)}>
            <Play size={17} fill="currentColor" />{' '}
            {completed === 0
              ? 'Bắt đầu hành trình'
              : completed === GIT_LEVELS.length
                ? 'Khám phá lại'
                : 'Đến trạm tiếp theo'}
            <ArrowRight size={17} />
          </button>
          <div className="git-hero-facts">
            <span>
              <i /> {GIT_LEVELS.length} nhiệm vụ
            </span>
            <span>03 vùng khám phá</span>
            <span>Chơi ngay trên trình duyệt</span>
          </div>
        </div>
        <GitWorldArt chapter={chapter} />
      </section>
      <nav className="git-region-tabs" aria-label="Vùng khám phá">
        {([1, 2, 3] as const).map((number) => {
          const WorldIcon = GIT_REGIONS[number].icon;
          const done = GIT_LEVELS.filter(
            (level) => level.chapter === number && progress[level.id]?.completed,
          ).length;
          const count = GIT_LEVELS.filter((level) => level.chapter === number).length;
          return (
            <button
              key={number}
              data-chapter={number}
              aria-pressed={chapter === number}
              onClick={() => {
                setChapter(number);
                setSelectedId(GIT_LEVELS.find((level) => level.chapter === number)?.id ?? '');
              }}
            >
              <span className="git-region-symbol">
                <WorldIcon size={21} />
              </span>
              <span>
                <small>
                  VÙNG 0{number} · {done}/{count}
                </small>
                <strong>{GIT_REGIONS[number].name}</strong>
              </span>
              <ArrowRight size={18} />
            </button>
          );
        })}
      </nav>
      <section className="git-expedition">
        <div className="git-map-panel">
          <header>
            <div>
              <p className="git-eyebrow">
                CHƯƠNG 0{chapter} / {region.subtitle}
              </p>
              <h2>
                <Icon size={23} /> {region.name}
              </h2>
            </div>
            <span className="git-map-label">BẢN ĐỒ HÀNH TRÌNH</span>
          </header>
          <p className="git-region-description">{region.description}</p>
          <ol className="git-route-list">
            {levels.map((level, i) => {
              const done = progress[level.id]?.completed === true;
              return (
                <li key={level.id} data-selected={selected?.id === level.id} data-completed={done}>
                  <button
                    onClick={() => setSelectedId(level.id)}
                    aria-pressed={selected?.id === level.id}
                  >
                    <span className="git-route-node">
                      {done ? <Check size={20} /> : String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="git-route-copy">
                      <strong>{level.title}</strong>
                      <small>
                        {DIFFICULTY[level.difficulty]}
                        <span>·</span>
                        {level.objectives.length} mục tiêu
                      </small>
                    </span>
                    <span className="git-route-status">
                      {done ? 'Đã chinh phục' : progress[level.id] ? 'Đã ghé thăm' : 'Khám phá'}
                      <ArrowRight size={15} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        {selected && (
          <aside className="git-mission-preview" key={selected.id}>
            <div className="git-preview-art">
              <GitWorldArt chapter={chapter} />
              <span className="git-preview-badge">
                <Flag size={14} /> TRẠM {String(levels.indexOf(selected) + 1).padStart(2, '0')}
              </span>
            </div>
            <div className="git-preview-body">
              <p className="git-eyebrow">NHIỆM VỤ CỦA BẠN</p>
              <h2>{selected.title}</h2>
              <p>{selected.mission}</p>
              <ul>
                {selected.objectives.map((objective) => (
                  <li key={objective.id}>
                    <span className="git-objective-dot" />
                    {objective.label}
                    {!objective.required && <small>Thưởng</small>}
                  </li>
                ))}
              </ul>
              <div className="git-preview-skills">
                {(selected.allowedCommands ?? ['status', 'branch', 'commit'])
                  .slice(0, 5)
                  .map((command) => (
                    <code key={command}>git {command}</code>
                  ))}
              </div>
              <button className="git-button git-button-primary" onClick={() => onPick(selected.id)}>
                <Play size={16} />
                {progress[selected.id]?.completed ? 'Chơi lại nhiệm vụ' : 'Bắt đầu nhiệm vụ'}
                <ArrowRight size={17} />
              </button>
              <small className="git-preview-note">
                Mỗi lượt bắt đầu từ kho ban đầu · Mốc hoàn thành lưu trên máy
              </small>
            </div>
          </aside>
        )}
      </section>
      <footer className="git-campaign-footer">
        <span>
          <GitBranch size={15} /> Tạo nhánh. Thử nghiệm. Học từ mỗi bước.
        </span>
        <button onClick={onSandbox}>
          Tự xây thế giới trong Sandbox <ArrowRight size={14} />
        </button>
      </footer>
    </div>
  );
}
