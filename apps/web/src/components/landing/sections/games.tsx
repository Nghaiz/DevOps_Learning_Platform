'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { GAMES, lineVar, SECTION_IDS, type GameCard } from '../content';
import { EASE_OUT, gsap, ScrollTrigger } from '../motion/gsap';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import base from '../landing.module.css';
import { GameArt } from './game-art';
import styles from './games.module.css';

/** Biên độ nghiêng tối đa của thẻ theo con trỏ, độ. Nhỏ để chữ trên thẻ vẫn đọc được. */
const TILT_DEG = 7;

const onTilt = (event: PointerEvent<HTMLElement>) => {
  if (event.pointerType !== 'mouse') return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  event.currentTarget.style.setProperty('--ry', `${(x * TILT_DEG * 2).toFixed(2)}deg`);
  event.currentTarget.style.setProperty('--rx', `${(-y * TILT_DEG * 2).toFixed(2)}deg`);
};

const onUntilt = (event: PointerEvent<HTMLElement>) => {
  event.currentTarget.style.setProperty('--ry', '0deg');
  event.currentTarget.style.setProperty('--rx', '0deg');
};

export function Games() {
  const ref = useRef<HTMLElement>(null);

  useLandingGSAP(
    () => {
      const section = ref.current;
      if (section === null) return;
      gsap.from(section.querySelectorAll('[data-game]'), {
        opacity: 0,
        y: 80,
        rotateX: -18,
        transformPerspective: 900,
        duration: 1.1,
        ease: EASE_OUT,
        stagger: 0.09,
        scrollTrigger: { trigger: section, start: 'top 70%', once: true },
      });
      /* Cảnh SVG chỉ chạy khi khu đang trên màn hình; ngoài đó CSS dừng hẳn animation. */
      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => {
          section.dataset.active = self.isActive ? 'true' : 'false';
        },
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      id={SECTION_IDS.games}
      data-testid="landing-games"
      className={`${base.section} ${base.solid} ${styles.section}`}
    >
      <div className={base.container}>
        <header className={styles.header}>
          <p className={base.kicker}>{t('home.games.kicker')}</p>
          <h2 className={base.h2}>{t('home.games.title')}</h2>
          <p className={base.lede}>{t('home.games.lede')}</p>
        </header>
        <ul className={styles.grid}>
          {GAMES.map((game) => (
            <GameTile key={game.id} game={game} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function GameTile({ game }: { readonly game: GameCard }) {
  const playable = game.href !== null;
  return (
    <li
      data-game={game.id}
      data-playable={playable ? 'true' : 'false'}
      className={styles.tile}
      style={{ '--line': lineVar(game.line) } as CSSProperties}
      onPointerMove={playable ? onTilt : undefined}
      onPointerLeave={playable ? onUntilt : undefined}
    >
      {/* Lớp nghiêng tách khỏi thẻ: GSAP để lại transform inline trên thẻ sau lượt vào khung. */}
      <div className={styles.inner}>
        <div className={styles.artWrap}>
          <GameArt id={game.id} />
        </div>
        <h3 className={styles.title}>{t(`home.game.${game.id}.title`)}</h3>
        <p className={styles.body}>{t(`home.game.${game.id}.body`)}</p>
        {game.href === null ? (
          <span className={styles.soon}>{t('home.games.soon')}</span>
        ) : (
          <Link className={styles.play} href={game.href}>
            {t('home.games.play')}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        )}
      </div>
    </li>
  );
}
