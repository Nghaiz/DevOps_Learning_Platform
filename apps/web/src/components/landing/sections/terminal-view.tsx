import { Fragment, type ReactNode } from 'react';
import { GitBranch } from 'lucide-react';
import { t } from '@devops-platform/copy';
import styles from './terminal.module.css';

/**
 * Phần trình bày của khung terminal: prompt nhiều màu, tô màu output. Không có logic cuộn ở đây;
 * `terminal.tsx` dựng sẵn mọi dòng ở trạng thái CUỐI rồi chỉnh từng thuộc tính theo tiến độ.
 */

export const BUILD_TIMES = ['', '0.4s', '0.1s', '38.6s', '2.1s', '0.2s'];
export const POD_AGES = ['2s', '5s', '11s'];

export function Prompt() {
  return (
    <span className={styles.prompt} aria-hidden="true">
      <span className={styles.segUser}>
        {t('home.term.user')}@{t('home.term.host')}
      </span>
      <span className={styles.segDir}>{t('home.term.dir')}</span>
      <span className={styles.segGit}>
        <GitBranch size={12} strokeWidth={2.4} />
        {t('home.term.branch')}
      </span>
      <span className={styles.caret}>❯</span>
    </span>
  );
}

const DOCKER_WORDS = /\b(FROM|COPY|RUN|FINISHED)\b/g;

/** Tô một dòng output của `docker build`: mũi tên, số bước, từ khoá Dockerfile. */
export function BuildLine({ text }: { readonly text: string }): ReactNode {
  const match = /^(\s*)(=>|\[\+\])(\s*)(\[\d+\/\d+\])?(.*)$/.exec(text);
  if (match === null) return text;
  const [, lead, arrow, gap, step, rest = ''] = match;
  const parts = rest.split(DOCKER_WORDS);
  return (
    <>
      {lead}
      <span className={arrow === '=>' ? styles.tArrow : styles.tOk}>{arrow}</span>
      {gap}
      {step === undefined ? null : <span className={styles.tStep}>{step}</span>}
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className={part === 'FINISHED' ? styles.tOk : styles.tKeyword}>
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** `deployment.apps/web created`: tên tài nguyên một màu, động từ kết quả một màu. */
export function ApplyLine({ text }: { readonly text: string }): ReactNode {
  const space = text.lastIndexOf(' ');
  if (space < 0) return text;
  return (
    <>
      <span className={styles.tResource}>{text.slice(0, space)}</span>{' '}
      <span className={styles.tOk}>{text.slice(space + 1)}</span>
    </>
  );
}

const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|([{}[\],:])/g;

/** Tô JSON một dòng: khoá, chuỗi, số, dấu câu mỗi loại một màu. */
export function JsonLine({ text }: { readonly text: string }): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(JSON_TOKEN)) {
    const index = match.index;
    if (index > last) out.push(text.slice(last, index));
    const [token, str, colon, num] = match;
    if (str !== undefined && colon !== undefined) {
      out.push(
        <span key={index} className={styles.tKey}>
          {str}
        </span>,
        <span key={`${index}:`} className={styles.tPunct}>
          {colon}
        </span>,
      );
    } else if (str !== undefined) {
      out.push(
        <span key={index} className={styles.tOk}>
          {str}
        </span>,
      );
    } else if (num !== undefined) {
      out.push(
        <span key={index} className={styles.tStep}>
          {num}
        </span>,
      );
    } else {
      out.push(
        <span key={index} className={styles.tPunct}>
          {token}
        </span>,
      );
    }
    last = index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
