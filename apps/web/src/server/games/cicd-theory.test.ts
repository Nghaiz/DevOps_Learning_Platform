import { describe, expect, it } from 'vitest';
import { CICD_LEVELS } from '@devops-platform/games';

import { loadCicdTheory } from './cicd-theory';

/**
 * Ghim bộ bài lý thuyết CI/CD với dữ liệu level — ở CẢ HAI chiều.
 *
 * `validateTheoryDocs` chỉ kiểm chiều bài → level (`usedByLevels`). Chiều level →
 * bài (`level.theoryId`) là trường của level, và không mã nào đọc nó ngoài màn
 * chơi: một `theoryId` gõ sai làm nút bài giảng biến mất trong im lặng.
 */
describe('bài lý thuyết CI/CD', () => {
  const docs = loadCicdTheory();

  it('nạp được và mọi bài mang gameId cicd', () => {
    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) expect(doc.frontmatter.gameId, doc.frontmatter.id).toBe('cicd');
  });

  it.each(CICD_LEVELS.map((level) => ({ level })))('$level.id — theoryId trỏ đúng bài khai level này', ({ level }) => {
    const doc = docs.find((d) => d.frontmatter.id === level.theoryId);
    expect(doc, `${level.id} → ${String(level.theoryId)}`).toBeDefined();
    expect(doc?.frontmatter.usedByLevels).toContain(level.id);
  });
});
