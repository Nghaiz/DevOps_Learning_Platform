import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { parseJourneyColor, readJourneyPalette } from './experience-palette';

describe('journey production color adapter', () => {
  it('accepts the hex colors emitted by the production CSS optimizer', () => {
    const productionTokens: Record<string, string> = {
      '--journey-bg': '#0a1021',
      '--journey-panel': '#162034',
      '--journey-ink': '#eef5ff',
      '--journey-muted': '#a3b7d2',
      '--journey-coral': '#ff7e6b',
      '--journey-cyan': '#52d1f7',
      '--journey-violet': '#ab95ff',
      '--journey-mint': '#6de6b9',
      '--journey-amber': '#ffcd75',
      '--journey-metal': '#546b87',
    };
    const palette = readJourneyPalette({
      getPropertyValue: (name) => productionTokens[name] ?? '',
    });
    expect(palette).not.toBeNull();
    expect(new Color(palette?.bg).getHexString()).toBe('0a1021');
    expect(new Color(palette?.coral).getHexString()).toBe('ff7e6b');
    // The old /^rgb/ guard rejected every one of these valid production tokens.
    expect(Object.values(productionTokens).every((value) => !value.startsWith('rgb('))).toBe(true);
  });

  it.each([
    [' #3Af ', '33aaff'],
    ['rgb(10, 16, 33)', '0a1021'],
    ['rgb(10 16 33)', '0a1021'],
    ['rgb(100% 0% 0%)', 'ff0000'],
  ])('normalizes Three-compatible color %s', (raw, expected) => {
    const color = parseJourneyColor(raw);
    expect(color).not.toBeNull();
    expect(new Color(color ?? undefined).getHexString()).toBe(expected);
  });

  it.each([
    '',
    '#zzzzzz',
    '#abcd',
    'oklch(0.5 0.2 25)',
    'rgb(1, 2)',
    'rgb(1,,2)',
    'rgb(256 0 0)',
    'rgb(-1 0 0)',
    'rgb(101% 0% 0%)',
    'rgb(1 2 3 / .5)',
  ])('rejects unsupported or malformed color %s', (raw) => {
    expect(parseJourneyColor(raw)).toBeNull();
  });

  it('rejects a missing or unsupported token instead of substituting white', () => {
    expect(
      readJourneyPalette({
        getPropertyValue: (name) => (name === '--journey-coral' ? '' : '#123'),
      }),
    ).toBeNull();
    expect(readJourneyPalette({ getPropertyValue: () => 'oklch(0.5 0.2 25)' })).toBeNull();
  });
});
