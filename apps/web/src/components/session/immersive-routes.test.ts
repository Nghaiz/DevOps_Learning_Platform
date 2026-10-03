import { describe, expect, it } from 'vitest';
import { isImmersiveRoute } from '../shell/immersive-routes';

/**
 * Route immersive (không header, không footer) của bản dựng lại PTIT.
 * Hai luật: `/session` khớp chính nó + trang con; danh mục chỉ immersive ở trang con.
 */
describe('trang con của bài học, lab, sân chơi, CI/CD là immersive', () => {
  it.each([
    '/lessons/intro-k8s',
    '/labs/docker-basics',
    '/playgrounds/ubuntu',
    '/games/cicd/cicd-c01-build',
    '/lessons/intro-k8s/',
  ])('%s', (path) => {
    expect(isImmersiveRoute(path)).toBe(true);
  });
});

describe('cửa sổ terminal riêng là immersive', () => {
  it('chính nó và trang con', () => {
    expect(isImmersiveRoute('/session')).toBe(true);
    expect(isImmersiveRoute('/session/abc/terminal')).toBe(true);
  });
});

describe('trang danh mục và các trang khác giữ header', () => {
  it.each([
    '/lessons',
    '/lessons/',
    '/labs',
    '/playgrounds',
    '/games',
    '/games/cicd',
    '/games/git',
    '/games/k8s',
    '/problems',
    '/me',
    '/admin',
    '/sessionized',
    '/labsomething/x',
  ])('%s', (path) => {
    expect(isImmersiveRoute(path)).toBe(false);
  });

  it('null và chuỗi rỗng', () => {
    expect(isImmersiveRoute(null)).toBe(false);
    expect(isImmersiveRoute('')).toBe(false);
  });
});
