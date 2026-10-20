'use client';

import { Suspense, use, useRef, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { useViewer } from '../../shell/viewer-context';
import { lineVar, SECTION_IDS, type LineId } from '../content';
import type { LandingCatalog, LandingPath } from '../data/catalog-shape';
import { EASE_OUT, gsap, ScrollTrigger } from '../motion/gsap';
import { landingStore } from '../motion/store';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import base from '../landing.module.css';
import { routePathD, routePoints, ROUTE_HEIGHT, ROUTE_WIDTH, stopPoints } from './route-geometry';
import styles from './paths.module.css';

const PATH_LINES: readonly LineId[] = ['linux', 'docker', 'iac', 'git', 'cicd', 'prod', 'obs', 'observe', 'k8s'];
/** Lộ trình dài hơn ngần này chặng thì bản đồ chỉ vẽ ngần ấy ga, số thật vẫn ghi ở nhãn. */
const MAX_STOPS = 10;

export function Paths({ catalog }: { readonly catalog: Promise<LandingCatalog> }) {
  const viewer = useViewer();
  return (
    <section
      id={SECTION_IDS.paths}
      data-testid="landing-paths"
      className={`${base.section} ${base.solid} ${styles.section}`}
    >
      <Suspense fallback={<Shell gate={viewer === null}>{null}</Shell>}>
        <PathsBody catalog={catalog} gate={viewer === null} />
      </Suspense>
    </section>
  );
}

function Shell({ gate, children }: { readonly gate: boolean; readonly children: ReactNode }) {
  return (
    <div className={styles.stage} data-paths-stage>
      <header className={`${base.container} ${styles.header}`}>
        <p className={base.kicker}>{t('home.paths.kicker')}</p>
        <h2 className={base.h2}>{t('home.paths.title')}</h2>
        <p className={base.lede}>{t('home.paths.lede')}</p>
        {gate ? (
          <p className={styles.gate}>
            <Lock size={14} aria-hidden="true" />
            {t('home.paths.gate')}
          </p>
        ) : null}
      </header>
      {children}
    </div>
  );
}

function PathsBody({ catalog, gate }: { readonly catalog: Promise<LandingCatalog>; readonly gate: boolean }) {
  const { paths } = use(catalog);
  const ref = useRef<HTMLDivElement>(null);

  useLandingGSAP(
    () => {
      const root = ref.current;
      const stage = root?.closest<HTMLElement>('[data-paths-stage]');
      const track = root?.querySelector<HTMLElement>('[data-track]');
      if (root === null || stage === null || stage === undefined || track === null || track === undefined) {
        return;
      }
      const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-path-card]'));
      const animateCard = (card: HTMLElement) => {
        const route = card.querySelector<SVGPathElement>('[data-route]');
        const stops = card.querySelectorAll('[data-stop]');
        const train = card.querySelector('[data-train]');
        const timeline = gsap.timeline();
        if (route !== null) {
          timeline.fromTo(route, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.4, ease: 'power2.inOut' });
          if (train !== null) {
            timeline.fromTo(
              train,
              { opacity: 0 },
              {
                opacity: 1,
                duration: 2.4,
                ease: 'power1.inOut',
                motionPath: { path: route, align: route, alignOrigin: [0.5, 0.5] },
              },
              0.2,
            );
          }
        }
        timeline.fromTo(
          stops,
          { scale: 0, transformOrigin: '50% 50%' },
          { scale: 1, duration: 0.35, stagger: 0.08, ease: 'back.out(3)' },
          0.3,
        );
        return timeline;
      };

      const media = gsap.matchMedia();
      media.add('(min-width: 900px)', () => {
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
        const horizontal = gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        cards.forEach((card) => {
          const timeline = animateCard(card).pause();
          ScrollTrigger.create({
            trigger: card,
            containerAnimation: horizontal,
            start: 'left 85%',
            once: true,
            onEnter: () => timeline.play(),
          });
        });
        /*
          Dải thẻ trôi ngang bằng transform và không ancestor nào cuộn ngang được: Tab vào một thẻ
          còn nằm ngoài bên phải sẽ cho focus vô hình (WCAG 2.4.7). Khi focus vào thẻ, cuộn trang
          tới đúng vị trí dọc làm thẻ đó trượt vào khung.
        */
        const onFocus = (event: FocusEvent) => {
          const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-path-card]') : null;
          const trigger = horizontal.scrollTrigger;
          const max = distance();
          if (card === null || trigger === undefined || max <= 0) return;
          const lead = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
          const wanted = Math.min(max, Math.max(0, card.offsetLeft - lead));
          const y = trigger.start + (wanted / max) * (trigger.end - trigger.start);
          const lenis = landingStore.lenis;
          if (lenis === null) window.scrollTo(0, y);
          else lenis.scrollTo(y, { immediate: true });
        };
        track.addEventListener('focusin', onFocus);
        return () => track.removeEventListener('focusin', onFocus);
      });
      media.add('(max-width: 899px)', () => {
        cards.forEach((card) => {
          const timeline = animateCard(card).pause();
          ScrollTrigger.create({ trigger: card, start: 'top 85%', once: true, onEnter: () => timeline.play() });
        });
      });
      gsap.from(cards, {
        opacity: 0,
        y: 40,
        duration: 0.9,
        stagger: 0.1,
        ease: EASE_OUT,
        scrollTrigger: { trigger: stage, start: 'top 70%', once: true },
      });
      /*
        Danh sách stream tới SAU khi các đoạn ghim phía trên (hành trình, terminal) và các khu
        phía dưới (trò chơi, kết) đã tạo trigger. Đoạn ghim ngang này chèn thêm chiều cao vào
        giữa, nên phải xếp lại thứ tự theo vị trí rồi đo lại toàn bộ, nếu không mọi trigger bên
        dưới lệch đúng bằng quãng cuộn ngang.
      */
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
      return () => media.revert();
    },
    { scope: ref, dependencies: [paths] },
  );

  return (
    <Shell gate={gate}>
      <div ref={ref} className={styles.viewport}>
        {paths === null ? (
          <p className={`${base.container} ${styles.message}`}>{t('home.paths.unknown')}</p>
        ) : paths.length === 0 ? (
          <p className={`${base.container} ${styles.message}`}>{t('home.paths.empty')}</p>
        ) : (
          <ol className={styles.track} data-track>
            {paths.map((path, index) => (
              <PathCard key={path.id} path={path} index={index} />
            ))}
          </ol>
        )}
      </div>
    </Shell>
  );
}

function PathCard({ path, index }: { readonly path: LandingPath; readonly index: number }) {
  const line = PATH_LINES[index % PATH_LINES.length] ?? 'red';
  const points = routePoints(index);
  const stops = stopPoints(points, Math.min(path.steps, MAX_STOPS));
  return (
    <li className={styles.card} data-path-card style={{ '--line': lineVar(line) } as CSSProperties}>
      <svg
        className={styles.map}
        viewBox={`0 0 ${ROUTE_WIDTH} ${ROUTE_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        <path d={routePathD(points)} className={styles.ghost} />
        <path d={routePathD(points)} className={styles.route} data-route />
        {stops.map((stop, stopIndex) => (
          <rect
            key={stopIndex}
            x={stop.x - 6}
            y={stop.y - 6}
            width="12"
            height="12"
            className={styles.stop}
            data-stop
          />
        ))}
        <rect x="-5" y="-5" width="10" height="10" className={styles.train} data-train />
      </svg>
      <p className={styles.code}>
        <span>{`L${String(index + 1).padStart(2, '0')}`}</span>
        <span>{t('home.paths.steps', { n: path.steps })}</span>
      </p>
      <h3 className={styles.title}>{path.title}</h3>
      {path.description === null ? null : <p className={styles.description}>{path.description}</p>}
      <Link className={styles.link} href={`/paths/${encodeURIComponent(path.id)}`}>
        {t('home.paths.open')}
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </li>
  );
}
