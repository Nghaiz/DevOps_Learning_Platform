'use client';

import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';
import { SECTION_IDS } from './content';
import type { LandingCatalog } from './data/catalog-shape';
import { LANDING_FONT_CLASS } from './fonts';
import { VelocityMarquee } from './fx/velocity-marquee';
import { LandingMotion, useMotionMode } from './motion/motion-provider';
import { Closing } from './sections/closing';
import { Footer } from './sections/footer';
import { Games } from './sections/games';
import { Hero } from './sections/hero';
import { Journey } from './sections/journey';
import { Modes } from './sections/modes';
import { Paths } from './sections/paths';
import { Terminal } from './sections/terminal';
import { TopBar } from './sections/top-bar';
import { Stage } from './stage/stage';
import styles from './landing.module.css';

const MARQUEE_SEPARATOR = ' · ';

/**
 * Landing 3D: một canvas cố định phía sau (cảnh metro DevOps), các khu DOM cuộn phía trên.
 * Khu "trong suốt" (hero, hành trình, terminal, kết) để lộ cảnh 3D; khu "đặc" (cách học, lộ
 * trình, trò chơi) che nó, và lúc đó canvas ngừng vẽ hẳn.
 */
export function Landing({ catalog }: { readonly catalog: Promise<LandingCatalog> }) {
  return (
    <LandingMotion>
      <LandingRoot catalog={catalog} />
    </LandingMotion>
  );
}

function LandingRoot({ catalog }: { readonly catalog: Promise<LandingCatalog> }) {
  const mode = useMotionMode();
  return (
    <div className={cn(styles.root, LANDING_FONT_CLASS)} data-testid="landing-root" data-motion={mode}>
      <a className={styles.skip} href={`#${SECTION_IDS.paths}`}>
        {t('home.skip.label')}
      </a>
      <Stage />
      <TopBar />
      <Hero catalog={catalog} />
      <Journey />
      <Terminal />
      <Modes />
      <VelocityMarquee
        words={t('home.marquee.words').split(MARQUEE_SEPARATOR)}
        label={t('home.marquee.label')}
      />
      <Paths catalog={catalog} />
      <Games />
      <Closing catalog={catalog} />
      <Footer />
    </div>
  );
}
