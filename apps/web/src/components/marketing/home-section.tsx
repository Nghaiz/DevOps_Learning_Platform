import type { ReactNode } from 'react';
import { cn } from '@devops-platform/ui';
import styles from './landing.module.css';

/** Shared page alignment without individual card surfaces. */
export function HomeSection({
  tone = 'plain',
  labelledBy,
  innerClassName,
  children,
}: {
  readonly tone?: 'plain' | 'muted';
  readonly labelledBy?: string;
  readonly innerClassName?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(styles.section, tone === 'muted' && styles.sectionMuted)}
    >
      <div className={cn(styles.sectionInner, innerClassName)}>{children}</div>
    </section>
  );
}
