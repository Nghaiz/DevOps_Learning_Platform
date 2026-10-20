'use client';

import { useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { list, t } from '@devops-platform/copy';
import { SECTION_IDS } from '../content';
import { ScrambleText, SCRAMBLE_CHARS } from '../fx/scramble-text';
import { gsap, ScrollTrigger } from '../motion/gsap';
import { useMotionMode } from '../motion/motion-provider';
import { landingStore } from '../motion/store';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import base from '../landing.module.css';
import {
  COMMAND_WINDOWS,
  runningPods,
  TERMINAL_STEPS,
  terminalStateAt,
  type TerminalState,
} from './terminal-script';
import { ApplyLine, BUILD_TIMES, BuildLine, JsonLine, POD_AGES, Prompt } from './terminal-view';
import styles from './terminal.module.css';

export const TERMINAL_SCREENS = 3.2;

const COMMAND_KEYS = [
  'home.term.cmd.build',
  'home.term.cmd.apply',
  'home.term.cmd.watch',
  'home.term.cmd.curl',
] as const;

/* Chỉ ghi khi giá trị đổi: hàm này chạy mỗi khung lúc cuộn qua đoạn ghim, và mỗi lần ghi DOM
   (kể cả ghi lại đúng giá trị cũ) đều có thể buộc trình duyệt tính lại style. */
const setFlag = (element: Element | null, name: string, on: boolean) => {
  if (!(element instanceof HTMLElement)) return;
  const next = on ? 'true' : 'false';
  if (element.dataset[name] !== next) element.dataset[name] = next;
};

const setText = (element: HTMLElement, text: string) => {
  if (element.textContent !== text) element.textContent = text;
};

export function Terminal() {
  const mode = useMotionMode();
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(TERMINAL_STEPS.length - 1);
  const commands = COMMAND_KEYS.map((key) => t(key));
  const buildLines = t('home.term.out.build').split('\n');
  const applyLines = t('home.term.out.apply').split('\n');
  const head = t('home.term.out.watch-head').split(' ');
  const pods = t('home.term.pods').split('\n');
  const statuses = list('home.term.statuses');

  useLandingGSAP(
    () => {
      const section = ref.current;
      if (section === null) return undefined;
      const q = <T extends Element>(selector: string) => Array.from(section.querySelectorAll<T>(selector));
      const blocks = q<HTMLElement>('[data-block]');
      const cmdEls = q<HTMLElement>('[data-cmd]');
      const buildEls = q<HTMLElement>('[data-build-line]');
      const applyEls = q<HTMLElement>('[data-apply-line]');
      const headEl = section.querySelector('[data-watch-head]');
      const podEls = q<HTMLElement>('[data-pod]');
      const curlEl = section.querySelector('[data-curl]');
      const checkEl = section.querySelector('[data-check]');
      const segEls = q<HTMLElement>('[data-seg]');
      let previous: TerminalState | null = null;

      const apply = (progress: number, instant = false) => {
        const state = terminalStateAt(progress, commands, applyLines.length, pods.length);
        landingStore.terminal = progress;
        landingStore.runningPods = runningPods(state);
        if (previous === null || previous.step !== state.step) setStep(state.step);

        blocks.forEach((block, index) => {
          setFlag(block, 'shown', progress >= (COMMAND_WINDOWS[index]?.[0] ?? 1) - 0.012);
        });
        cmdEls.forEach((element, index) => {
          const typed = state.typed[index] ?? 0;
          const full = commands[index] ?? '';
          setText(element, full.slice(0, typed));
          setFlag(element, 'typing', typed > 0 && typed < full.length);
        });
        buildEls.forEach((element, index) => {
          const fill = Math.min(1, Math.max(0, state.build * buildEls.length - index));
          setFlag(element, 'shown', fill > 0);
          setFlag(element, 'done', fill >= 1);
          const fillText = fill.toFixed(3);
          if (element.dataset.fill !== fillText) {
            element.dataset.fill = fillText;
            element.style.setProperty('--fill', fillText);
          }
        });
        applyEls.forEach((element, index) => setFlag(element, 'shown', index < state.applyLines));
        setFlag(headEl, 'shown', state.header);
        podEls.forEach((row, index) => {
          setFlag(row, 'shown', index < state.pods);
          const phase = state.phases[index] ?? 0;
          if (row.dataset.phase === String(phase)) return;
          row.dataset.phase = String(phase);
          const status = row.querySelector<HTMLElement>('[data-status]');
          const ready = row.querySelector<HTMLElement>('[data-ready]');
          const age = row.querySelector<HTMLElement>('[data-age]');
          if (ready !== null) ready.textContent = phase === 2 ? '1/1' : '0/1';
          if (age !== null) age.textContent = POD_AGES[phase] ?? '';
          if (status !== null && instant) {
            status.textContent = statuses[phase] ?? '';
          } else if (status !== null) {
            gsap.to(status, {
              duration: 0.55,
              ease: 'none',
              scrambleText: { text: statuses[phase] ?? '', chars: SCRAMBLE_CHARS, speed: 0.8 },
            });
          }
        });
        setFlag(curlEl, 'shown', state.curl);
        setFlag(checkEl, 'checked', state.checked);
        const filled = state.step + (state.checked ? 1 : 0);
        segEls.forEach((segment, index) => setFlag(segment, 'on', index < filled));
        previous = state;
      };

      apply(0);
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: () => `+=${window.innerHeight * TERMINAL_SCREENS}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => apply(self.progress),
        onRefresh: (self) => apply(self.progress),
      });
      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: () => `+=${window.innerHeight * (TERMINAL_SCREENS + 2)}`,
        /* Khoảng này dài TERMINAL_SCREENS + 2 màn: một màn đi vào, phần ghim, một màn đi ra.
           Màn đầu tiên chính là đoạn camera bay từ ga cuối sang giá máy sandbox. */
        onUpdate: (self) => {
          landingStore.terminalIn = Math.min(1, self.progress * (TERMINAL_SCREENS + 2));
        },
        onToggle: (self) => {
          landingStore.visible.terminal = self.isActive;
        },
        onRefresh: (self) => {
          landingStore.terminalIn = Math.min(1, self.progress * (TERMINAL_SCREENS + 2));
          landingStore.visible.terminal = self.isActive;
        },
      });
      return () => {
        /* Bật giảm chuyển động giữa chừng: trả DOM về trạng thái cuối, không để lệnh gõ dở. */
        gsap.killTweensOf(q('[data-status]'));
        apply(1, true);
        setStep(TERMINAL_STEPS.length - 1);
        landingStore.visible.terminal = false;
        landingStore.runningPods = 0;
      };
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      id={SECTION_IDS.terminal}
      data-testid="landing-terminal"
      data-step={step}
      className={`${base.section} ${styles.section}`}
    >
      <div className={`${base.container} ${styles.grid}`}>
        <div className={styles.copy}>
          <p className={base.kicker}>{t('home.term.kicker')}</p>
          <h2 className={`${base.h2} ${styles.title}`}>{t('home.term.title')}</h2>
          <p className={base.lede} data-term-lede>
            {t('home.term.lede')}
          </p>
          <ol className={styles.steps} aria-label={t('home.term.steps')}>
            {TERMINAL_STEPS.map((name, index) => (
              <li
                key={name}
                data-state={index < step ? 'done' : index === step ? 'active' : 'todo'}
              >
                <span className={styles.stepNum}>{`0${index + 1}`}</span>
                <ScrambleText
                  text={t(`home.term.step.${name}`)}
                  trigger={mode === 'full' && index === step ? `step-${index}` : false}
                  duration={0.6}
                />
              </li>
            ))}
          </ol>
        </div>

        <figure className={styles.window}>
          <figcaption className="sr-only">{t('home.term.window')}</figcaption>
          <div className={styles.titlebar} aria-hidden="true">
            <span className={styles.lights}>
              <i />
              <i />
              <i />
            </span>
            <span className={styles.title}>
              {t('home.term.user')}@{t('home.term.host')}: {t('home.term.dir')}
            </span>
            <span className={styles.shell}>zsh</span>
          </div>
          <div className={styles.screen}>
            <div className={styles.block} data-block>
              <Prompt />
              <span className={styles.cmd} data-cmd>
                {commands[0]}
              </span>
              <div className={styles.out}>
                {buildLines.map((line, index) => (
                  <div key={index} className={styles.buildLine} data-build-line>
                    <span className={styles.lineText}>
                      <BuildLine text={line} />
                    </span>
                    <span className={styles.time}>{BUILD_TIMES[index]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.block} data-block>
              <Prompt />
              <span className={styles.cmd} data-cmd>
                {commands[1]}
              </span>
              <div className={styles.out}>
                {applyLines.map((line, index) => (
                  <div key={index} className={styles.reveal} data-apply-line>
                    <ApplyLine text={line} />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.block} data-block>
              <Prompt />
              <span className={styles.cmd} data-cmd>
                {commands[2]}
              </span>
              <div className={`${styles.out} ${styles.table}`}>
                <div className={`${styles.row} ${styles.head} ${styles.reveal}`} data-watch-head>
                  {head.map((cell) => (
                    <span key={cell}>{cell}</span>
                  ))}
                </div>
                {pods.map((pod) => (
                  <div key={pod} className={`${styles.row} ${styles.reveal}`} data-pod data-phase="2">
                    <span className={styles.podName}>{pod}</span>
                    <span data-ready>1/1</span>
                    <span className={styles.status} data-status>
                      {statuses[2]}
                    </span>
                    <span>0</span>
                    <span data-age>{POD_AGES[2]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.block} data-block>
              <Prompt />
              <span className={styles.cmd} data-cmd>
                {commands[3]}
              </span>
              <div className={`${styles.out} ${styles.reveal}`} data-curl>
                <JsonLine text={t('home.term.out.curl')} />
              </div>
            </div>
          </div>
          <div className={styles.checkbar} data-check data-checked="true">
            <span className={styles.checkButton}>{t('home.term.check')}</span>
            <span className={styles.meter} aria-hidden="true">
              {TERMINAL_STEPS.map((name) => (
                <span key={name} data-seg data-on="true" />
              ))}
            </span>
            <span className={styles.result}>
              <CircleCheck size={16} aria-hidden="true" />
              {t('home.term.check-done')}
            </span>
          </div>
        </figure>
      </div>
    </section>
  );
}
