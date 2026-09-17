// @vitest-environment jsdom
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import {
  AUTHORABLE_GAMES,
  authorFieldPaths,
  initialSpecFor,
  pluginViewFor,
} from './game-plugin-view';
import { emptyForm, formWithGame, type ProblemFormState } from './problem-form';
import { ProblemEditor } from './problem-editor';
import { GameSelectField } from './game-select-field';

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
 * | Bỏ `<legend>`, nhóm chọn game mất nhãn | `o chon game co nhan…` |
 * | Mỗi radio một `name` riêng — nhóm radio tan ra | `o chon game co nhan…` |
 * | Mũi tên hết chuyển được giữa hai lựa chọn | `o chon game co nhan…` |
 * | Bấm bàn phím đổi radio mà biểu mẫu đứng yên | `di bang ban phim doi ca…` |
 * | Biểu mẫu bỏ qua `gameId` và luôn dựng ô của K8s | `bieu mau doi theo game` |
 * | Chủ đề quay về chín chủ đề K8s dùng chung | `tap chu de doi theo game` |
 * | Đổi game mà giữ lại spec hoặc chủ đề của game cũ | `doi game nap lai spec` |
 *
 * Đối chứng dương đã chạy tay ngày 2026-09-14 (ghi trong báo cáo lane): thay
 * `view.authorFields` bằng `K8S_AUTHOR_FIELDS` cố định trong `problem-editor`
 * làm ô đầu đỏ với đúng nhãn Git bị thiếu, chứ không đỏ vì một lý do khác.
 * Ngày 2026-09-16 chạy thêm ba đối chứng: (1) bỏ `<legend>` → đỏ ở
 * `getByRole('group', { name })`; (2) đổi `name` chung thành `name={game.gameId}`
 * → đỏ ở phép đếm tập `name`; (3) lặp lại (2) NHƯNG tạm vô hiệu phép đếm đó, để
 * xem vế bàn phím có tự gác được không — đỏ ở `user.tab()`, vì điểm vào Tab rơi
 * về radio ĐẦU nhóm thay vì radio đang bật. Bước (3) đáng làm vì (2) đỏ sớm hơn
 * các vế bàn phím, nên một mình nó không chứng minh được các vế ấy gác gì.
 *
 * ## Ô chọn game là NHÓM RADIO, không phải `<select>`
 *
 * Bản trước tra `getByRole('combobox')` vì ô chọn từng là một `<select>`. Nó
 * nay là `<fieldset>` + radio gốc, nên vai đổi thành `group`. Đáng ghi lại là
 * NĂNG LỰC thì không đổi: radio gốc cùng một `name` được TRÌNH DUYỆT cấp sẵn
 * roving tabindex + điều hướng bằng mũi tên, đúng khuôn radio group của
 * WAI-ARIA — không cần một dòng `tabIndex`/`onKeyDown` nào trong component.
 *
 * Nhưng phải đo bằng đúng công cụ: `fireEvent` (và jsdom trần) KHÔNG mô phỏng
 * khuôn đó — đo 2026-09-16, hai radio gốc cùng `name` trả `tabIndex` [0,0] và
 * `keyDown{ArrowDown}` không đổi cả focus lẫn `checked`. `user-event` thì cài
 * đúng thuật toán của trình duyệt, nên các vế bàn phím dưới đây dùng nó.
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

/**
 * Bản có TRẠNG THÁI THẬT của trình soạn bài.
 *
 * `renderEditor` truyền `onChange: vi.fn()`, nên ở đó biểu mẫu là *controlled*
 * mà không ai đổi state: React ghi đè lại `checked` sau mỗi lần bấm. Điều đó
 * đúng cho ô chỉ đo ĐIỀU HƯỚNG (focus chạy đi đâu), nhưng nó làm mù ô đo HỆ
 * QUẢ — "chọn game đổi biểu mẫu". Harness này nối `onChange` về `setForm` để cú
 * bấm bàn phím đi hết đường dây thật: radio → `GameSelectField.onChange` →
 * `formWithGame` → `ProblemEditor` render lại.
 */
function EditorHarness(props: { readonly start: ProblemFormState }): ReactElement {
  const [form, setForm] = useState(props.start);
  return (
    <ProblemEditor
      form={form}
      onChange={setForm}
      issues={[]}
      code={null}
      state="draft"
      nextKey={() => 'k-harness'}
      hasUnsavedChanges={false}
      actions={null}
    />
  );
}

/** Nhóm chọn game, tra bằng VAI + NHÃN chứ không bằng class hay thẻ. */
function gameGroup(): HTMLElement {
  return screen.getByRole('group', { name: t('author.problem.game.label') });
}

function radiosIn(group: HTMLElement): readonly HTMLInputElement[] {
  return within(group).getAllByRole('radio') as HTMLInputElement[];
}

/*
 * Kiểu tham số nới từ `'k8s' | 'git'` sang `GameId` ngày 2026-09-16 (19.H).
 *
 * Danh sách hai tên là một bản chép tay của bảng đăng ký, và nó vừa lỗi thời
 * trong im lặng: `vitest` xanh với `'cicd'` vì nó không kiểm kiểu, chỉ `tsc` đỏ.
 * Đọc thẳng `GameId` thì game thứ tư không phải sửa dòng này.
 */
function radioFor(group: HTMLElement, gameId: GameId): HTMLInputElement {
  const found = radiosIn(group).find((radio) => radio.value === gameId);
  if (found === undefined) {
    throw new Error(`khong thay radio cho game ${gameId}`);
  }
  return found;
}

function checkedValues(group: HTMLElement): readonly string[] {
  return radiosIn(group)
    .filter((radio) => radio.checked)
    .map((radio) => radio.value);
}

describe('chon game doi bieu mau soan bai', () => {
  /*
   * ĐẢO 2026-09-16 (19.H): `cicd` có plugin chấm bài, nên nó vào bảng đăng ký.
   *
   * `AUTHORABLE_GAMES` suy ra từ `PROBLEM_PLUGINS` chứ không khai tay, nên ô này
   * ghim DANH TÍNH và đỏ đúng lúc bảng đăng ký đổi — đó là việc của nó. Lời dặn
   * khi nó đỏ là đọc xem cái tên mới có đáng ở đó không, không phải nới số.
   *
   * Ba `GameId` còn lại (`pipeline`, `netpol`, `dockerfile`) vẫn chưa có engine
   * chấm; ngày một trong số đó có plugin, ô này phải đỏ lại.
   */
  it('bang dang ky liet ke dung ba game co bai tap', () => {
    expect(AUTHORABLE_GAMES.map((game) => game.gameId)).toEqual(['k8s', 'git', 'cicd']);
    expect(AUTHORABLE_GAMES.map((game) => game.codePrefix)).toEqual(['K8S', 'GIT', 'CICD']);
  });

  it('o chon game co nhan va di duoc bang ban phim', async () => {
    const user = userEvent.setup();
    // Mở bằng Git chứ không phải K8s: điểm vào Tab của một nhóm radio là lựa
    // chọn ĐANG BẬT, nên mở bằng lựa chọn THỨ HAI mới phân biệt được "roving
    // tabindex" với "cứ rơi vào phần tử đầu tiên".
    renderEditor(formFor('git'));

    // `getByRole` + `name` là phép đo A11Y, không phải phép đo DOM: nó đi qua
    // cây tên có thể tính. Nhãn lấy từ BẢN ĐỒ CHỮ, không gõ lại chuỗi — gõ lại
    // thì đổi chữ trong bản đồ sẽ làm ô này đỏ vì một lý do sai.
    const group = gameGroup();
    const radios = radiosIn(group);
    expect(radios).toHaveLength(AUTHORABLE_GAMES.length);

    // Mỗi lựa chọn có tên khả truy cập chứa nhãn game. Tách `<input>` ra khỏi
    // `<label>` bọc ngoài mà quên `for` sẽ làm tên rỗng, và ô này đỏ ngay.
    for (const game of AUTHORABLE_GAMES) {
      expect(
        within(group).getByRole('radio', { name: (name) => name.includes(game.label) }),
      ).toBeTruthy();
    }

    // CÙNG MỘT `name` là thứ DUY NHẤT tạo ra nhóm radio theo HTML spec, và là
    // thứ trình duyệt dựa vào để cấp roving tabindex + phím mũi tên. Tách nó ra
    // (ví dụ `name={game.gameId}`) thì mỗi radio thành một nhóm một-phần-tử:
    // mọi radio vào thứ tự Tab, mũi tên hết chuyển, và bỏ chọn lẫn nhau cũng
    // mất — nhưng màn hình trông y hệt. Đây là chế độ hỏng dễ xảy ra nhất.
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);

    // Đúng MỘT lựa chọn bật, và là game đang mở.
    expect(checkedValues(group)).toEqual(['git']);

    // Không lựa chọn nào bị khoá khi `canChange` — nhóm phải vào được thứ tự Tab.
    expect(radios.filter((radio) => radio.disabled)).toEqual([]);

    // --- Đi bằng bàn phím, đo trực tiếp ---
    // `fireEvent` KHÔNG mô phỏng khuôn radio group (đo 2026-09-16: jsdom trả
    // `tabIndex` [0,0] cho hai radio và `keyDown ArrowDown` không đổi gì cả).
    // `user-event` thì có: nó cài đúng thuật toán thứ tự Tab và xử lý mũi tên
    // của trình duyệt, nên ba vế dưới là phép đo hành vi thật chứ không phải
    // phép đo thuộc tính.
    await user.tab();
    // Điểm vào Tab là lựa chọn ĐANG BẬT (Git), không phải phần tử đầu nhóm.
    expect(document.activeElement).toBe(radioFor(group, 'git'));

    // Và Tab kế tiếp RỜI HẲN khỏi nhóm: chỉ MỘT radio nằm trong thứ tự Tab.
    await user.tab();
    expect(group.contains(document.activeElement)).toBe(false);

    /*
     * Trong nhóm thì phím mũi tên mới là thứ chuyển giữa các lựa chọn.
     *
     * ⚠ Đích của `{ArrowRight}` ĐỔI 2026-09-16 (19.H): trước đây nhóm có hai ô
     * nên từ `git` mũi tên phải QUAY VÒNG về `k8s`. Nay có ba, và ô kế `git`
     * theo thứ tự `AUTHORABLE_GAMES` là `cicd`. Ô này đo "mũi tên đi được hai
     * chiều trong nhóm", không đo phép quay vòng — nên đích đổi là đúng, và một
     * ngày nào đó thêm game thứ tư thì nó KHÔNG đổi nữa.
     */
    radioFor(group, 'git').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(radioFor(group, 'cicd'));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radioFor(group, 'git'));
  });

  it('di bang ban phim doi ca lua chon lan bieu mau soan bai', async () => {
    const user = userEvent.setup();
    const k8sView = pluginViewFor('k8s');
    const gitView = pluginViewFor('git');
    if (k8sView === null || gitView === null) {
      throw new Error('hai game nay phai co plugin; xem PROBLEM_PLUGINS');
    }

    // Harness có state thật: cú bấm bàn phím phải đi hết đường dây, không dừng
    // ở `onChange` rồi bị React ghi đè lại.
    render(<EditorHarness start={formFor('k8s')} />);
    const group = gameGroup();
    expect(checkedValues(group)).toEqual(['k8s']);
    expect(screen.getByRole('tab', { name: k8sView.specTabLabel })).toBeTruthy();

    // Mũi tên trên nhóm radio vừa chuyển focus VỪA chốt lựa chọn — đó là khuôn
    // WAI-ARIA, và cũng là cách duy nhất người dùng bàn phím đổi game.
    radioFor(group, 'k8s').focus();
    await user.keyboard('{ArrowDown}');

    expect(document.activeElement).toBe(radioFor(group, 'git'));
    expect(checkedValues(group)).toEqual(['git']);

    // Và biểu mẫu soạn bài đi theo: nhãn tab trạng thái ban đầu đổi sang của
    // Git, và của K8s biến mất. Chỉ kiểm một chiều thì một biểu mẫu dựng cả hai
    // game cùng lúc vẫn xanh.
    expect(screen.getByRole('tab', { name: gitView.specTabLabel })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: k8sView.specTabLabel })).toBeNull();

    // Ô nhập riêng của Git thật sự render khi mở tab trạng thái ban đầu.
    openSpecTab(gitView.specTabLabel);
    for (const field of gitView.authorFields) {
      expect(document.body.textContent ?? '').toContain(field.label);
    }
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

/**
 * Bài đã lưu thì không đổi game được nữa, và cách KHOÁ nó là một quyết định
 * trợ năng, không phải một dòng `disabled` tiện tay.
 *
 * ## Ô này đỏ khi nào
 *
 * | Nếu hỏng thế này | Vế đỏ |
 * |---|---|
 * | Quay lại `disabled` trên input | `disabled` phải là `false`, và `user.tab()` không còn rơi vào nhóm |
 * | Bỏ `aria-disabled` | vế đầu tiên |
 * | Bỏ chặn `onChange` | `onChange` bị gọi |
 * | Chặn `onChange` nhưng quên `onKeyDown` | lựa chọn ĐỔI theo mũi tên |
 * | Chỉ chặn ArrowDown/ArrowUp | vế `{ArrowRight}` đổi lựa chọn |
 * | Hiện câu gợi ý thay vì câu khoá | `getByText(locked)` không tìm thấy |
 *
 * Vế mũi tên là vế dễ quên nhất và cũng là vế người dùng thấy: `aria-disabled`
 * KHÔNG chặn gì cả, nên radio gốc vẫn tự dời lựa chọn rồi bị React kéo ngược
 * lại ở lượt render sau. Người dùng thấy lựa chọn nhảy một cái rồi bật về,
 * không kèm lời giải thích nào.
 */
describe('bai da luu: nhom chon game khoa nhung khong bien mat', () => {
  it('con trong thu tu Tab, giai thich doc duoc, mui ten khong doi duoc gi', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<GameSelectField gameId="k8s" onChange={onChange} canChange={false} />);

    const group = screen.getByRole('group', { name: t('author.problem.game.label') });
    const radios = within(group).getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(1);

    for (const radio of radios) {
      expect(radio.getAttribute('aria-disabled')).toBe('true');
      // `disabled` THẬT là thứ đẩy cả nhóm ra khỏi thứ tự Tab. Vế này là chỗ
      // một lượt "dọn dẹp" quay về `disabled={!canChange}` sẽ đỏ.
      expect((radio as HTMLInputElement).disabled).toBe(false);
    }

    await user.tab();
    expect(group.contains(document.activeElement)).toBe(true);

    // Câu KHOÁ, không phải câu gợi ý: hai câu nói hai chuyện khác nhau và chỉ
    // một trong hai đúng ở trạng thái này.
    expect(within(group).getByText(t('author.problem.game.locked'))).toBeTruthy();

    const before = radios.map((radio) => (radio as HTMLInputElement).checked);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowRight}');
    expect(radios.map((radio) => (radio as HTMLInputElement).checked)).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();
  });
});
