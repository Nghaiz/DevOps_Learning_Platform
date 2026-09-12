import type { JourneyPalette } from './experience-models';

const PALETTE_NAMES = [
  'bg',
  'panel',
  'ink',
  'muted',
  'coral',
  'cyan',
  'violet',
  'mint',
  'amber',
  'metal',
] as const;

/** Normalize source RGB and CSS-optimizer hex output to formats Three can read. */
export function parseJourneyColor(raw: string): string | null {
  const value = raw.trim();
  if (/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) return value;
  const rgb = /^rgb\(([^)]+)\)$/i.exec(value);
  if (!rgb?.[1]) return null;
  const body = rgb[1].trim();
  const channels = body.includes(',') ? body.split(',') : body.split(/\s+/);
  if (channels.length !== 3) return null;
  const bytes = channels.map((rawChannel) => {
    const channel = rawChannel.trim();
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(channel)) return null;
    const percentage = channel.endsWith('%');
    const amount = Number(percentage ? channel.slice(0, -1) : channel);
    if (!Number.isFinite(amount) || amount < 0 || amount > (percentage ? 100 : 255)) return null;
    return Math.round(percentage ? amount * 2.55 : amount);
  });
  return bytes.some((channel) => channel === null) ? null : `rgb(${bytes.join(', ')})`;
}

/** Reject an incomplete palette instead of silently rendering unsupported colors as white. */
export function readJourneyPalette(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): JourneyPalette | null {
  const colors: Partial<Record<keyof JourneyPalette, string>> = {};
  for (const name of PALETTE_NAMES) {
    const color = parseJourneyColor(style.getPropertyValue(`--journey-${name}`));
    if (color === null) return null;
    colors[name] = color;
  }
  return colors as JourneyPalette;
}
