import { describe, expect, it } from 'vitest';
import { createCluster, findByUid } from './model.ts';
import { reduce } from './reducer.ts';
import { toView } from './view.ts';

const seed = () => createCluster({ nodes: [{ name: 'host', cpu: 4000, memory: 8192, ready: true }], namespaces: ['lab'], resources: [] }, 42);
const yaml = (kind: string, name: string) => `apiVersion: v1\nkind: ${kind}\nmetadata:\n  name: ${name}\n`;

describe('interactive infrastructure', () => {
  it('exposes seeded infrastructure with stable inspectable IDs without consuming replay IDs', () => {
    const state = seed();
    const view = toView(state);
    expect(view.objects.filter(o => o.kind === 'Node')).toHaveLength(1);
    expect(view.objects.filter(o => o.kind === 'Namespace')).toHaveLength(2);
    for (const object of view.objects) expect(findByUid(state, object.uid)?.name).toBe(object.name);
    expect(state.nextUid).toBe(0);
  });
  it('creates and edits Node capacity in the scheduler index, without duplicate rendering', () => {
    const created = reduce(seed(), { tick: 0, kind: 'apply', yaml: yaml('Node', 'extra') });
    expect(created.accepted).toBe(true);
    expect(created.state.nodes).toHaveLength(2);
    const edited = reduce(created.state, { tick: 0, kind: 'edit', target: { kind: 'Node', name: 'host', namespace: '' }, yaml: yaml('Node', 'host') + 'spec:\n  capacity:\n    cpu: 6000\n    memory: 16384\n' });
    expect(edited.accepted).toBe(true);
    expect(edited.state.nodes.find(n => n.name === 'host')?.cpu).toBe(6000);
    expect(toView(edited.state).objects.filter(o => o.kind === 'Node')).toHaveLength(2);
  });
  it('creates and removes Namespace in both API and namespace index', () => {
    const created = reduce(seed(), { tick: 0, kind: 'apply', yaml: yaml('Namespace', 'new-space') });
    expect(created.state.namespaces).toContain('new-space');
    const deleted = reduce(created.state, { tick: 0, kind: 'delete', target: { kind: 'Namespace', name: 'new-space', namespace: '' } });
    expect(deleted.state.namespaces).not.toContain('new-space');
    expect(toView(deleted.state).objects.some(o => o.name === 'new-space')).toBe(false);
  });
  it('removes seeded Node from the scene and scheduler', () => {
    const deleted = reduce(seed(), { tick: 0, kind: 'delete', target: { kind: 'Node', name: 'host', namespace: '' } });
    expect(deleted.accepted).toBe(true);
    expect(deleted.state.nodes).toHaveLength(0);
    expect(toView(deleted.state).objects.some(o => o.kind === 'Node')).toBe(false);
  });
});
