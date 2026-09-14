// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  AUTHORABLE_GAMES,
  authorFieldPaths,
  initialSpecFor,
  pluginViewFor,
} from './game-plugin-view';
import { emptyForm, formWithGame, type ProblemFormState } from './problem-form';
import { ProblemEditor } from './problem-editor';

/**
 * Ô nghiệm thu AC-A, vế "chọn `gameId` trên `/author/problems` đổi form đúng
 * plugin" — §18.A.6 / §18.D.1.
 *
 * ## Ô này ĐỎ khi nào, và vì sao câu hỏi đó phải trả lời được trước
 *
 * `rules/green-that-proves-nothing.md` hỏi thẳng: nếu thứ đang gác bị hỏng, ô
 * này có đỏ không? Một ô chỉ khẳng định "trang render được" sẽ XANH cả khi biểu
 * mẫu đứng yên, nên nó không gác gì. Ba ô dưới đây đỏ ở ba kiểu hỏng KHÁC nhau:
 *
 * | Nếu hỏng thế này | Ô đỏ |
 * |---|---|
 * | Biểu mẫu bỏ qua `gameId` và luôn dựng ô của K8s | `bieu mau doi theo game` |
 * | Chủ đề quay về chín chủ đề K8s dùng chung | `tap chu de doi theo game` |
 * | Đổi game mà giữ lại spec hoặc chủ đề của game cũ | `doi game nap lai spec` |
 *
 * Đối chứng dương đã chạy tay ngày 2026-09-14 (ghi trong báo cáo lane): thay
 * `view.authorFields` bằng `K8S_AUTHOR_FIELDS` cố định trong `problem-editor`
 * làm ô đầu đỏ với đúng nhãn Git bị thiếu, chứ không đỏ vì một lý do khác.
 *
 * ## Vì sao so bằng TÊN chứ không bằng SỐ ĐẾM
 *
 * "Hai game có số ô khác nhau" là một khẳng định mà hai game hỏng hoàn toàn
 * khác nhau vẫn thoả. Ô dưới so TẬP PATH và so NHÃN hiện trên màn hình, nên nó
 * nói được game nào đang render, không chỉ nói "có gì đó khác".
 */

afterEach(cleanup);

/** Nhãn chỉ có ở biểu mẫu K8s, và nhãn chỉ có ở biểu mẫu Git. */
const K8S_ONLY_PATH = 'nodes';
const GIT_ONLY_PATH = 'commits';

function formFor(gameId: 'k8s' | 'git'): ProblemFormState {
  let counter = 0;
  const nextKey = (): string => {
    counter += 1;
    return `k-${String(counter)}`;
  };
  return formWithGame(emptyForm(nextKey), gameId);
}

/**
 * Mở tab trạng thái ban đầu.
 *
 * Bắt buộc, và lý do đáng ghi lại: Radix `Tabs` CHỈ render nội dung của tab
 * đang mở. Bản đầu của ô này đọc `document.body.textContent` ngay sau khi
 * render, lúc tab mặc định còn là "Mô tả", nên vế `not.toContain` xanh vì nội
 * dung tab kia chưa tồn tại chứ không phải vì biểu mẫu đúng. Một ô xanh theo
 * kiểu đó là ô không gác gì.
 *
 * `mouseDown` chứ không chỉ `click`: `TabsTrigger` của Radix đổi tab ở
 * `onMouseDown`, và `fireEvent.click` KHÔNG phát sự kiện đó. Bản thứ hai của ô
 * này vẫn đỏ đúng vì chuyện đó, và nó đỏ theo kiểu dễ đọc nhầm nhất: nội dung
 * tab "Mô tả" vẫn hiện ra đầy đủ nên màn hình trông như đã render xong.
 */
function openSpecTab(label: string): void {
  const trigger = screen.getByRole('tab', { name: label });
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-selected')).toBe('true');
}

function renderEditor(form: ProblemFormState): void {
  render(
    <ProblemEditor
      form={form}
      onChange={vi.fn()}
      issues={[]}
      code={null}
      state="draft"
      nextKey={() => 'k-render'}
      hasUnsavedChanges={false}
      actions={null}
    />,
  );
}

describe('chon game doi bieu mau soan bai', () => {
  it('bang dang ky liet ke dung hai game co bai tap', () => {
    expect(AUTHORABLE_GAMES.map((game) => game.gameId)).toEqual(['k8s', 'git']);
    expect(AUTHORABLE_GAMES.map((game) => game.codePrefix)).toEqual(['K8S', 'GIT']);
  });

  it('o chon game co nhan va di duoc bang ban phim', () => {
    renderEditor(formFor('k8s'));
    // `getByRole` với `name` là phép đo A11Y, không phải phép đo DOM: nó đi qua
    // cây tên có thể tính (accessible name). Một ô chọn không nối nhãn sẽ
    // KHÔNG tìm thấy ở đây, và đó đúng là thứ AC-8 (0 vi phạm axe) đòi.
    expect(screen.getByRole('combobox', { name: 'Game' })).toBeTruthy();
  });

  it('tap path cua hai plugin khac nhau, do tu chinh hop dong', () => {
    // Đọc qua `pluginViewFor` chứ không import thẳng hằng của plugin: barrel
    // của `packages/games` KHÔNG export `K8S_AUTHOR_FIELDS` / `GIT_AUTHOR_FIELDS`
    // (đo 2026-09-14, bản đầu của ô này đỏ đúng vì chuyện đó), và đi qua bảng
    // đăng ký cũng đúng hơn: đó là đường mà tầng UI thật sự dùng.
    const k8s = authorFieldPaths(pluginViewFor('k8s')?.authorFields ?? []);
    const git = authorFieldPaths(pluginViewFor('git')?.authorFields ?? []);
    expect(k8s).toContain(K8S_ONLY_PATH);
    expect(git).toContain(GIT_ONLY_PATH);
    expect(k8s).not.toContain(GIT_ONLY_PATH);
    expect(git).not.toContain(K8S_ONLY_PATH);
  });

  it('bieu mau doi theo game', () => {
    const k8sView = pluginViewFor('k8s');
    const gitView = pluginViewFor('git');
    if (k8sView === null || gitView === null) {
      throw new Error('hai game nay phai co plugin; xem PROBLEM_PLUGINS');
    }

    // Nhãn LẤY TỪ HỢP ĐỒNG, không gõ lại ở đây: gõ lại thì đổi nhãn trong
    // plugin sẽ làm ô này đỏ vì một lý do sai (chữ đổi, không phải biểu mẫu
    // đứng yên).
    const gitLabels = gitView.authorFields.map((field) => field.label);

    renderEditor(formFor('k8s'));
    expect(screen.getByRole('tab', { name: k8sView.specTabLabel })).toBeTruthy();
    openSpecTab(k8sView.specTabLabel);
    const k8sScreen = document.body.textContent ?? '';
    cleanup();

    renderEditor(formFor('git'));
    expect(screen.getByRole('tab', { name: gitView.specTabLabel })).toBeTruthy();
    openSpecTab(gitView.specTabLabel);
    const gitScreen = document.body.textContent ?? '';

    // Nhãn tab trạng thái ban đầu đổi theo game.
    expect(k8sView.specTabLabel).not.toBe(gitView.specTabLabel);

    // Và ô nhập của Git thật sự hiện ra khi chọn Git. Kiểm CẢ HAI CHIỀU: chỉ
    // kiểm "có nhãn Git" thì một biểu mẫu dựng cả hai game cùng lúc vẫn xanh.
    for (const label of gitLabels) {
      expect(gitScreen).toContain(label);
      expect(k8sScreen).not.toContain(label);
    }

    // Không sót khoá bản đồ chữ nào ra màn hình.
    expect(gitScreen).not.toMatch(/(?:author|problem)\.[a-z]/);
  });

  it('tap chu de doi theo game', () => {
    const k8sView = pluginViewFor('k8s');
    const gitView = pluginViewFor('git');
    if (k8sView === null || gitView === null) {
      throw new Error('hai game nay phai co plugin; xem PROBLEM_PLUGINS');
    }
    const k8sTopics = k8sView.topics.map((topic) => topic.id);
    const gitTopics = gitView.topics.map((topic) => topic.id);

    // Hai tập chủ đề KHÔNG giao nhau. Đây là điều kiện làm phép đo dưới có
    // nghĩa: nếu chúng giao nhau thì một ô chủ đề hiện trên màn hình không nói
    // được game nào đang mở.
    expect(k8sTopics.filter((id) => gitTopics.includes(id))).toEqual([]);

    renderEditor(formFor('git'));
    for (const option of gitView.topics) {
      expect(screen.getByRole('checkbox', { name: option.label })).toBeTruthy();
    }
    for (const option of k8sView.topics) {
      expect(screen.queryByRole('checkbox', { name: option.label })).toBeNull();
    }
  });

  it('doi game nap lai spec va xoa chu de cua game cu', () => {
    const started = formFor('k8s');
    const withTopic: ProblemFormState = {
      ...started,
      topics: [pluginViewFor('k8s')?.topics[0]?.id ?? ''],
    };
    const moved = formWithGame(withTopic, 'git');

    expect(moved.gameId).toBe('git');
    // Chủ đề của game cũ bị xoá, không mang theo.
    expect(moved.topics).toEqual([]);
    // Và spec nạp lại từ `initialSpec()` của game MỚI: khoá của nó phải là khoá
    // Git, không phải khoá cụm K8s còn sót.
    expect(Object.keys(moved.specText)).toContain(GIT_ONLY_PATH);
    expect(Object.keys(moved.specText)).not.toContain(K8S_ONLY_PATH);
    expect(initialSpecFor('git')).not.toBeNull();
  });
});
