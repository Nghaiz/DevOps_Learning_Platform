import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * T4 cho lane L3b (chữ của game CI/CD và cảnh đồ thị game Git).
 *
 * Mọi chữ người chơi đọc được ở đây đã đi qua `packages/copy/src/surfaces/games.ts`.
 * Cổng này giữ cho nó ở yên đó: một literal tiếng Việt mới trong glob dưới đây
 * làm ô đỏ. Bộ dò là `scanLatinLiteral` của gói copy, cùng khuôn với
 * `components/me/copy-gate.test.ts`.
 *
 * File test bị loại khỏi phạm vi: ô test phải viết THẲNG chuỗi nó khẳng định,
 * nếu không nó chỉ so bản đồ với chính nó.
 */

const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const GAMES = path.join('components', 'games');

/** Thư mục quét trọn, và ba file lẻ của game Git mà lane này sở hữu. */
const LANE_DIRS: readonly string[] = [path.join(GAMES, 'cicd'), path.join(GAMES, 'git', 'scene3d')];
const LANE_FILES: readonly string[] = [
  path.join(GAMES, 'git', 'git-palette.ts'),
  path.join(GAMES, 'git', 'git-svg-scene.tsx'),
  path.join(GAMES, 'git', 'mode-toggle.tsx'),
];

/**
 * Literal tiếng Việt được phép ở lại. Mỗi dòng là chữ cho người phát triển đọc,
 * không tới tay người chơi: cảnh báo console, lỗi ném ra khi dữ liệu level hỏng,
 * mã nguồn shader, lý do hạ bậc truyền cho một callback chưa ai hiển thị, và
 * fixture chỉ test nhập. Ghi ngày 2026-10-03.
 *
 * Khoá theo FILE và MẢNH NỘI DUNG, không theo số đếm: một literal mới trong
 * cùng file mà không khớp mảnh nào vẫn làm đỏ. Hai chiều đều gác (ô dưới): một
 * mảnh không còn khớp literal nào cũng làm đỏ. Mảnh chết thì XOÁ, đừng sửa cho
 * khớp một chuỗi khác.
 */
const DEV_ONLY: ReadonlyMap<string, readonly string[]> = new Map([
  // Fixture cho test cảnh 2D, không được mã sản phẩm nào nhập.
  ['cicd/scene2d/scene-fixtures.ts', ['đã xong', 'đỏ', 'đang chạy', 'đang xếp hàng', 'chưa chạy']],
  // Lý do hạ bậc gửi cho onQualityDowngrade; chưa nơi nào truyền callback đó.
  ['cicd/scene3d/frame-pump-3d.tsx', ['GPU đổ hoạ', 'Khung hình tụt']],
  // Lỗi khi vá shader viền sáng, ném ra cho người phát triển.
  ['cicd/scene3d/rim-shader.ts', ['thiếu mốc', 'định danh dùng mà chưa khai']],
  // Lỗi gộp hình học, và console.warn khi vá viền thất bại.
  ['cicd/scene3d/scene-geometry.ts', ['Không gộp được', 'Không vá được viền sáng', 'Cảnh vẫn chạy']],
  // Lý do suy giảm bảng màu gửi cho onDegraded; cảnh tự vẽ thông báo riêng qua t().
  ['cicd/scene3d/use-cicd-colors.ts', ['Không đọc được một số token màu']],
  // console.warn về token màu thiếu và ô file lệch cột.
  ['git/scene3d/file-plates.tsx', ['token màu', 'màu mặc định của vật liệu', 'hai cột khác nhau', 'rơi chéo']],
  // console.warn khi bảng màu suy giảm.
  ['git/scene3d/git-canvas.tsx', ['Bảng màu suy giảm']],
  // console.warn khi một commit đứng ở hai mốc thời gian.
  ['git/scene3d/git-scene-3d.tsx', ['hai mốc thời gian', 'đi chéo thay vì thẳng']],
  // RangeError của ba hàm cắt nhãn.
  ['git/scene3d/label-priority.ts', ['phải >= 1']],
  // console.warn khi bỏ cạnh có toạ độ không hữu hạn.
  ['git/scene3d/lane-edges.tsx', ['toạ độ không hữu hạn', 'Một NaN lọt vào', 'vứt TOÀN BỘ']],
  // Chú thích bên trong mã nguồn GLSL.
  ['git/scene3d/node-material.ts', ['void main()']],
  // Bất biến bố cục của level, ném ra cho người soạn level.
  ['git/scene3d/scene3d-contract.ts', ['Vùng DAG cao tới', 'độ lệch nhánh']],
  // Lý do suy giảm bảng màu, chỉ đi vào console.
  ['git/scene3d/use-git-scene-colors.ts', ['design token', 'oklch()']],
]);

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES: readonly string[] = [
  ...LANE_DIRS.flatMap((dir) => collect(path.join(SRC_ROOT, dir))),
  ...LANE_FILES.map((file) => path.join(SRC_ROOT, file)),
];

function laneName(file: string): string {
  return path.relative(path.join(SRC_ROOT, GAMES), file).split(path.sep).join('/');
}

/** File nào còn literal tiếng Việt, và literal nào. `jsx-text` chỉ có nghĩa trên `.tsx`. */
function literalsByFile(): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const file of FILES) {
    const jsx = file.endsWith('.tsx');
    const found = scanLatinLiteral(readFileSync(file, 'utf8'))
      .filter((v) => jsx || v.kind !== 'jsx-text')
      .map((v) => `${String(v.line)} [${v.kind}] ${v.text}`);
    if (found.length > 0) out.set(laneName(file), found);
  }
  return out;
}

describe('T4 · chữ game CI/CD và cảnh Git đều đi qua bản đồ', () => {
  it('bộ quét nhìn thấy một tập file THẬT', () => {
    expect(FILES.length, 'glob rỗng, bộ quét đang nhìn sai chỗ').toBeGreaterThan(60);
    const names = FILES.map(laneName);
    expect(names).toContain('cicd/cicd-result-panel.tsx');
    expect(names).toContain('cicd/hud/cicd-inspector.tsx');
    expect(names).toContain('cicd/scene2d/cicd-svg-scene.tsx');
    expect(names).toContain('git/git-svg-scene.tsx');
    expect(names).toContain('git/scene3d/label-priority.ts');
  });

  it('không literal tiếng Việt nào ngoài bảng DEV_ONLY', () => {
    const offenders = [...literalsByFile()].flatMap(([file, found]) => {
      const allowed = DEV_ONLY.get(file) ?? [];
      return found
        .filter((line) => !allowed.some((piece) => line.includes(piece)))
        .map((line) => `${file}:${line}`);
    });
    expect(
      offenders,
      'Chuyển từng chuỗi trên vào packages/copy/src/surfaces/games.ts rồi gọi qua t(). ' +
        'Chỉ thêm mảnh vào DEV_ONLY khi chữ đó KHÔNG BAO GIỜ tới tay người chơi.',
    ).toEqual([]);
  });

  it('bảng DEV_ONLY không có mảnh chết', () => {
    const live = literalsByFile();
    const stale = [...DEV_ONLY].flatMap(([file, pieces]) =>
      pieces
        .filter((piece) => !(live.get(file) ?? []).some((line) => line.includes(piece)))
        .map((piece) => `${file}: ${piece}`),
    );
    expect(
      stale,
      'Các mảnh trên không còn khớp literal nào. Xoá chúng khỏi DEV_ONLY; ' +
        'dòng thừa là chỗ một chuỗi người chơi đọc lọt qua sau này.',
    ).toEqual([]);
  });

  it('đối chứng dương: bộ dò ĐỎ được, và không đỏ với lời gọi t()', () => {
    expect(scanLatinLiteral("const x = 'Đang chạy thử';")).toHaveLength(1);
    expect(scanLatinLiteral('<p>Chạy thử</p>')).toHaveLength(1);
    expect(scanLatinLiteral("<p>{t('games.cicd.hud.run')}</p>")).toEqual([]);
  });
});
