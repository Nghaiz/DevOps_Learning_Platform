'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Activity, Container, GitMerge, ShipWheel, Terminal, Workflow, type LucideIcon } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { lineVar, SECTION_IDS, STATION_IDS, type StationId } from '../content';
import { IconMorph } from '../fx/icon-morph';
import { ScrambleText } from '../fx/scramble-text';
import { SplitFlap, type SplitFlapHandle } from '../fx/split-flap';
import {
  activeStationAt,
  JOURNEY_INTRO,
  PANEL_IN_END,
  PANEL_OUT_START,
  STATION_COUNT,
  STATION_SPAN,
  stationStart,
  TRAVEL_START,
} from '../journey-timeline';
import { EASE_OUT, gsap, type ScrollTrigger } from '../motion/gsap';
import { useMotionMode } from '../motion/motion-provider';
import { landingStore } from '../motion/store';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import base from '../landing.module.css';
import styles from './journey.module.css';

/** Đoạn ghim dài bằng ngần này chiều cao màn hình: nửa màn cho lời dẫn, hơn một màn mỗi ga. */
export const JOURNEY_SCREENS = 7;

const STATION_ICON: Readonly<Record<StationId, LucideIcon>> = {
  linux: Terminal,
  git: GitMerge,
  docker: Container,
  k8s: ShipWheel,
  cicd: Workflow,
  prod: Activity,
};

export function Journey() {
  const mode = useMotionMode();
  const ref = useRef<HTMLElement>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const flaps = useRef<(SplitFlapHandle | null)[]>([]);
  const [active, setActive] = useState(-1);

  useLandingGSAP(
    () => {
      const section = ref.current;
      if (section === null) return undefined;
      const intro = section.querySelector('[data-journey-intro]');
      const panels = Array.from(section.querySelectorAll<HTMLElement>('[data-panel]'));
      const fill = section.querySelector('[data-rail-fill]');
      let lastActive = -2;
      const sync = (self: ScrollTrigger) => {
        landingStore.journey = self.progress;
        landingStore.visible.journey = self.isActive;
        const next = activeStationAt(self.progress);
        if (next !== lastActive) {
          lastActive = next;
          setActive(next);
        }
      };

      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${window.innerHeight * JOURNEY_SCREENS}`,
          pin: true,
          scrub: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => sync(self),
          onToggle: (self) => {
            landingStore.visible.journey = self.isActive;
          },
          /* Lượt đo đầu (và mọi lượt đo lại) không bắn onUpdate: đồng bộ store ở đây, nếu không
             tải trang giữa chừng thì camera đứng sai chỗ cho tới cú cuộn đầu tiên. */
          onRefresh: (self) => sync(self),
        },
      });
      triggerRef.current = timeline.scrollTrigger ?? null;

      /*
        opacity chứ KHÔNG autoAlpha: autoAlpha đặt visibility:hidden, gỡ lời dẫn và các ga đã qua
        khỏi cây trợ năng. Người dùng trình đọc màn hình duyệt theo heading sẽ chỉ thấy đúng một
        ga, và axe báo heading-order (h1 nhảy thẳng xuống h3).
      */
      timeline.to(intro, { opacity: 0, y: -80, duration: JOURNEY_INTRO * 0.85 }, JOURNEY_INTRO * 0.15);
      if (fill !== null) timeline.fromTo(fill, { scaleY: 0 }, { scaleY: 1, duration: 1 - JOURNEY_INTRO }, JOURNEY_INTRO);

      panels.forEach((panel, index) => {
        const start = stationStart(index);
        const event = panel.querySelector('[data-event]');
        gsap.set(panel, { opacity: 0 });
        timeline.fromTo(
          panel,
          { opacity: 0, y: 90, clipPath: 'inset(0% 0% 100% 0%)' },
          {
            opacity: 1,
            y: 0,
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: STATION_SPAN * PANEL_IN_END,
            ease: EASE_OUT,
          },
          start,
        );
        if (event !== null) {
          timeline.fromTo(
            event,
            { opacity: 0, x: -24 },
            { opacity: 1, x: 0, duration: STATION_SPAN * 0.08, ease: EASE_OUT },
            start + STATION_SPAN * TRAVEL_START * 0.82,
          );
        }
        if (index < STATION_COUNT - 1) {
          timeline.to(
            panel,
            { opacity: 0, y: -90, duration: STATION_SPAN * (1 - PANEL_OUT_START), ease: 'power2.in' },
            start + STATION_SPAN * PANEL_OUT_START,
          );
        }
      });
      /* Ép tổng thời lượng đúng bằng 1 để vị trí trong timeline trùng với tiến độ cuộn. */
      timeline.set({}, {}, 1);

      return () => {
        triggerRef.current = null;
        landingStore.visible.journey = false;
      };
    },
    { scope: ref },
  );

  useEffect(() => {
    if (mode === 'full' && active >= 0) flaps.current[active]?.flip();
  }, [active, mode]);

  /** Bấm một ga trên thanh tuyến: cuộn mượt tới đúng khoảng của ga đó trong đoạn ghim. */
  const jumpTo = (index: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    const trigger = triggerRef.current;
    const lenis = landingStore.lenis;
    if (mode !== 'full' || trigger === null || lenis === null) return;
    event.preventDefault();
    /* Bộ xử lý neo chung (motion-provider) bỏ qua cú bấm đã preventDefault; stopPropagation để
       không listener nào khác đổi đích cuộn. */
    event.stopPropagation();
    const fraction = stationStart(index) + STATION_SPAN * 0.32;
    lenis.scrollTo(trigger.start + (trigger.end - trigger.start) * fraction, { duration: 1.6 });
  };

  const current = STATION_IDS[Math.max(0, active)] ?? 'linux';

  return (
    <section
      ref={ref}
      id={SECTION_IDS.journey}
      data-testid="landing-journey"
      data-station={active}
      className={`${base.section} ${styles.journey}`}
    >
      <div className={styles.stage}>
        <header className={`${base.container} ${styles.intro}`} data-journey-intro>
          <p className={base.kicker}>{t('home.journey.kicker')}</p>
          <h2 className={base.h2}>{t('home.journey.title')}</h2>
          <p className={base.lede}>{t('home.journey.lede')}</p>
          <p className={styles.note}>{t('home.journey.note')}</p>
        </header>

        <ol className={styles.panels}>
          {STATION_IDS.map((id, index) => {
            const Icon = STATION_ICON[id];
            return (
              <li
                key={id}
                id={`ga-${id}`}
                data-panel
                data-testid={`journey-station-${id}`}
                className={styles.panel}
                style={{ '--line': lineVar(id) } as CSSProperties}
              >
                <SplitFlap
                  text={t(`home.station.${id}.line`)}
                  className={styles.board}
                  ref={(handle) => {
                    flaps.current[index] = handle;
                  }}
                />
                <h3 className={styles.name}>
                  <ScrambleText
                    text={t(`home.station.${id}.name`)}
                    trigger={mode === 'full' && active === index ? `ga-${index}` : false}
                  />
                </h3>
                <p className={styles.body}>{t(`home.station.${id}.body`)}</p>
                <p className={styles.cmd}>
                  <span aria-hidden="true">$</span>
                  <code>{t(`home.station.${id}.cmd`)}</code>
                </p>
                <p className={styles.event} data-event>
                  <Icon size={16} aria-hidden="true" />
                  <span>{t(`home.station.${id}.event`)}</span>
                </p>
              </li>
            );
          })}
        </ol>

        <nav className={styles.rail} aria-label={t('home.journey.rail')}>
          <div className={styles.railHead}>
            <IconMorph station={current} className={styles.railIcon} />
            <span className={styles.railCount}>
              {active >= 0 ? t('home.journey.progress', { n: active + 1, total: STATION_COUNT }) : ''}
            </span>
          </div>
          <ol className={styles.railList}>
            {STATION_IDS.map((id, index) => (
              <li
                key={id}
                data-reached={index <= active ? 'true' : 'false'}
                style={{ '--line': lineVar(id) } as CSSProperties}
              >
                <a href={`#ga-${id}`} onClick={jumpTo(index)}>
                  <span className={styles.railDot} aria-hidden="true" />
                  <span className={styles.railName}>{t(`home.station.${id}.name`)}</span>
                </a>
              </li>
            ))}
          </ol>
          <span className={styles.railTrack} aria-hidden="true">
            <span className={styles.railFill} data-rail-fill />
          </span>
        </nav>
      </div>
    </section>
  );
}
