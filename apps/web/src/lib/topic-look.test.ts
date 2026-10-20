import { describe, expect, it } from 'vitest';
import { TOPIC_ICON, topicLook, topicOf } from './topic-look';

describe('topicOf', () => {
  it('chủ đề khai trong nội dung thắng mọi tag', () => {
    expect(topicOf({ topic: 'bash', tags: ['kubernetes'] })).toBe('bash');
  });

  it('game thắng tag khi nội dung không khai chủ đề', () => {
    expect(topicOf({ gameId: 'netpol', tags: ['docker'] })).toBe('networking');
  });

  it('suy từ tag và id theo thứ tự luật', () => {
    expect(topicOf({ tags: ['helm', 'shell'] })).toBe('kubernetes');
    expect(topicOf({ id: 'bash-loops-101' })).toBe('bash');
    expect(topicOf({ id: 'linux-permissions' })).toBe('linux');
  });

  it('không khớp gì thì ra general, không đoán', () => {
    expect(topicOf({ tags: ['excel'], id: 'xyz' })).toBe('general');
    expect(topicOf({})).toBe('general');
  });
});

describe('topicLook', () => {
  it('mọi chủ đề đều có biểu tượng', () => {
    for (const icon of Object.values(TOPIC_ICON)) {
      expect(icon.length).toBeGreaterThan(0);
    }
    expect(topicLook({ topic: 'docker' })).toEqual({ topic: 'docker', icon: 'container' });
  });
});
