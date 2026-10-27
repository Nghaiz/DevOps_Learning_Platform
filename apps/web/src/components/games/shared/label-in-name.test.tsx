// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FaceText, nameWithVisibleLabel, spokenFace } from './label-in-name';
import { curateTokens, isLabelInName, visibleText } from './label-in-name-check';

afterEach(cleanup);

/*
 * ĐỐI CHỨNG CỦA BẢN SAO: mỗi cặp dưới đây đã được chấm bằng axe-core 4.14 THẬT
 * trong Chromium 156 (Playwright 1.64.1, 2026-10-27), `runOnly:
 * label-content-name-mismatch`, trên `<g role="button">` trong `<svg>`. Cột
 * `axe` là kết quả đo được, không phải kết quả mong muốn. `visible` là chuỗi
 * `axe.commons.text.visibleVirtual()` trả về ở lượt đo đó.
 *
 * Nếu bản sao lệch khỏi axe (một bản axe mới đổi cách tách từ), ô này đỏ trước
 * khi các ô thành phần dựa vào bản sao kịp xanh khống.
 */
const MEASURED: readonly { visible: string; name: string; axe: boolean; why: string }[] = [
  {
    visible: 'cloneclone✓ đã xong',
    name: 'clone clone đã xong',
    axe: false,
    why: 'hai <text> liền nhau dính thành một từ',
  },
  {
    visible: 'clone clone ✓ đã xong',
    name: 'clone clone đã xong',
    axe: true,
    why: 'có khoảng trắng giữa hai thẻ',
  },
  {
    visible: 'clone clone ✓ đã xong',
    name: 'clone, clone, đã xong. clone — đã xong',
    axe: true,
    why: 'chữ nhìn thấy đứng đầu tên, mô tả theo sau',
  },
  {
    visible: 'a1b2c3d init repo * main',
    name: 'a1b2c3d init repo',
    axe: false,
    why: 'chữ trong aria-hidden VẪN là chữ nhìn thấy',
  },
  {
    visible: 'deploy-producti… deploy ↻ đang thử lại · lần 2',
    name: 'deploy-producti…, deploy, lần 2. deploy-production (os=linux) — đã xong, lần thứ 2',
    axe: false,
    why: 'thiếu "đang thử lại" giữa stage và "lần 2"',
  },
];

describe('bản sao luật label-content-name-mismatch', () => {
  for (const pair of MEASURED) {
    it(`khớp axe thật: ${pair.why}`, () => {
      expect(isLabelInName(pair.visible, pair.name)).toBe(pair.axe);
    });
  }

  it('chữ bị cắt KHÔNG phải từ gốc', () => {
    expect(curateTokens('deploy-producti…')).toEqual(['deploy', 'producti']);
    expect(isLabelInName('deploy-producti…', 'deploy-production, đang chạy')).toBe(false);
  });

  it('nối text node như axe: rỗng giữa hai thẻ, bỏ <title>', () => {
    const { container } = render(
      <svg>
        <g data-probe="a">
          <title>tooltip không tính</title>
          <text>clone</text>
          <text>kiem-tra</text>
        </g>
      </svg>,
    );
    const g = container.querySelector('[data-probe="a"]');
    if (g === null) throw new Error('không dựng được nút thử');
    expect(visibleText(g)).toBe('clonekiem-tra');
  });
});

describe('FaceText + nameWithVisibleLabel', () => {
  it('mỗi dòng mang một ranh giới từ NGOÀI thẻ <text>, nên hai dòng là hai từ', () => {
    const { container } = render(
      <svg>
        <g data-probe="b">
          <FaceText>clone</FaceText>
          <FaceText>kiem-tra</FaceText>
        </g>
      </svg>,
    );
    const g = container.querySelector('[data-probe="b"]');
    if (g === null) throw new Error('không dựng được nút thử');
    expect([...g.querySelectorAll('text')].map((el) => el.textContent)).toEqual([
      'clone',
      'kiem-tra',
    ]);
    expect(curateTokens(visibleText(g))).toEqual(['clone', 'kiem', 'tra']);
  });

  it('bỏ glyph không mang từ, giữ thứ tự, mô tả đứng sau', () => {
    expect(spokenFace(['✓', 'clone', null, '@', 'đã xong'])).toBe('clone, đã xong');
    expect(nameWithVisibleLabel(['✓', 'clone', 'đã xong'], 'clone — đã xong')).toBe(
      'clone, đã xong. clone — đã xong',
    );
    expect(nameWithVisibleLabel(['✓'], 'clone — đã xong')).toBe('clone — đã xong');
  });
});
