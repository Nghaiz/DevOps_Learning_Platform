import { describe, expect, it } from 'vitest';
import { pushSample, sampleFrom } from './metrics-history';
import { clusterView, podView } from '../shared/test-fixtures';
describe('metrics history', () => {
  it('updates a paused tick after resources change without duplicating time', () => {
    const first = sampleFrom(clusterView({ tick: 5 }));
    const edited = sampleFrom(clusterView({ tick: 5, objects: [podView('one', 'one')] }));
    expect(pushSample([first], edited)).toEqual([edited]);
    const stable = [edited];
    expect(pushSample(stable, edited)).toBe(stable);
  });
  it('discards the old run when the simulation clock resets', () => {
    const old = sampleFrom(clusterView({ tick: 100 }));
    const fresh = sampleFrom(clusterView({ tick: 0 }));
    expect(pushSample([old], fresh)).toEqual([fresh]);
  });
});
