import { describe, expect, it } from 'vitest';
import { isImmersiveRoute } from '../shell/immersive-routes';

/**
 * P16 · 16.D.1 — `/labs/<id>` và `/lessons/<id>` chạy immersive, hai trang danh
 * mục ở đúng tiền tố đó thì KHÔNG.
 *
 * ⚠ Vị trí file. Thứ được test sống ở `components/shell/immersive-routes.ts`,
 * nhưng lane 16.D chỉ được cấp quyền ghi theo TÊN cho đúng file nguồn ấy, không
 * cho cả thư mục `components/shell/`. Đặt test ở đây theo đúng tiền lệ
 * `landmark-contract.test.ts` (cùng thư mục này, cùng lý do: hợp đồng thuộc về
 * vỏ, quyền ghi thì không). Lead dời sang `components/shell/` khi lane 16.B mở.
 *
 * ## Vì sao một hàm bảy dòng đáng có mười ca test
 *
 * Cả hai chiều của hàm này hỏng IM LẶNG.
 *
 * - Khớp thừa (`/labs` đọc thành immersive) ⇒ trang danh mục mất thanh điều
 *   hướng. Không lỗi, không log; người dùng chỉ thấy một trang không đi đâu
 *   được nữa, và họ sẽ dùng nút Back của trình duyệt thay vì báo lỗi.
 * - Khớp thiếu (`/labs/abc` đọc thành thường) ⇒ trình học giữ nguyên thanh 56px
 *   và mất đúng phần chiều cao mà 16.D.1 tồn tại để lấy lại. Trang vẫn chạy
 *   đúng, chỉ chật hơn — tức không ai gọi nó là lỗi, và nó ở lại vĩnh viễn.
 *
 * Không phép kiểm nào khác trong repo nói được hai điều đó: `a11y.spec.ts` và
 * `csp.spec.ts` mở trang rồi đo trang, chúng không đo vỏ nào đang bọc.
 */

describe('trang CHÍNH nó immersive — /games/k8s', () => {
  it('khớp chính xác và khớp trang con', () => {
    expect(isImmersiveRoute('/games/k8s')).toBe(true);
    expect(isImmersiveRoute('/games/k8s/man-1')).toBe(true);
  });

  it('so theo ĐOẠN, không phải `startsWith` trần', () => {
    // `/games/k8s-nang-cao` là một route tương lai hợp lệ. Một phép so
    // `startsWith('/games/k8s')` sẽ nuốt nó, và trang đó mất thanh điều hướng
    // mà không ai hiểu vì sao.
    expect(isImmersiveRoute('/games/k8s-nang-cao')).toBe(false);
    expect(isImmersiveRoute('/games')).toBe(false);
  });
});

describe('16.D.1 — trình học immersive, trang danh mục thì KHÔNG', () => {
  it('trang con của /labs và /lessons chạy immersive', () => {
    expect(isImmersiveRoute('/labs/dlp-linux-triage')).toBe(true);
    expect(isImmersiveRoute('/lessons/intro-k8s')).toBe(true);
  });

  it('⛔ trang DANH MỤC giữ nguyên vỏ đầy đủ', () => {
    // Đây là ô phân biệt hai luật so khớp. Gộp chúng thành một danh sách duy
    // nhất là làm ô này đỏ hoặc làm ô trên đỏ — không có cách gộp nào giữ được
    // cả hai.
    expect(isImmersiveRoute('/labs')).toBe(false);
    expect(isImmersiveRoute('/lessons')).toBe(false);
  });

  it('dấu chéo cuối KHÔNG biến trang danh mục thành trang con id rỗng', () => {
    // Trình duyệt và một vài đường điều hướng tự thêm dấu chéo cuối. Thiếu bước
    // chuẩn hoá thì `/labs/` khớp `startsWith('/labs/')` và trang danh mục mất
    // vỏ ở đúng một dạng URL mà không ai gõ bằng tay.
    expect(isImmersiveRoute('/labs/')).toBe(false);
    expect(isImmersiveRoute('/lessons/')).toBe(false);
  });

  it('tiền tố phải kết thúc ở biên ĐOẠN', () => {
    expect(isImmersiveRoute('/labsomething')).toBe(false);
    expect(isImmersiveRoute('/lessons-cu/abc')).toBe(false);
  });

  it('trang con SÂU hơn cũng immersive', () => {
    expect(isImmersiveRoute('/labs/abc/xyz')).toBe(true);
  });
});

describe('19.D — màn chơi CI/CD immersive, danh mục thì KHÔNG', () => {
  it('màn chơi một level chạy immersive', () => {
    // AC-D7 đo chiều rộng > 95% viewport. Không immersive thì `.practice-shell`
    // chừa 224px sidebar, tức ~82.5% ở 1280px — ô đó đỏ vì VỎ TRANG chứ không
    // vì bố cục màn chơi.
    expect(isImmersiveRoute('/games/cicd/c13-gom-ket-qua-nhieu-nhanh')).toBe(true);
  });

  it('⛔ trang danh mục giữ nguyên thanh điều hướng', () => {
    // `CicdCampaign` KHÔNG có nút thoát nào — nó dựa hoàn toàn vào thanh điều
    // hướng của vỏ để rời `/games/cicd`. Đọc trang này thành immersive là nhốt
    // người dùng ở đó với đúng nút Back của trình duyệt.
    expect(isImmersiveRoute('/games/cicd')).toBe(false);
    expect(isImmersiveRoute('/games/cicd/')).toBe(false);
  });

  it('không nuốt một route anh em cùng tiền tố', () => {
    expect(isImmersiveRoute('/games/cicd-nang-cao')).toBe(false);
  });

  it('game Git KHÔNG immersive — nó chưa được dựng lại', () => {
    // Ghim CHỦ Ý: chủ dự án sẽ đập đi xây lại tầng giao diện game Git, và lúc
    // đó dòng này phải đổi. Để trống thì không ai biết nó là một lựa chọn hay
    // một chỗ bị bỏ quên.
    expect(isImmersiveRoute('/games/git')).toBe(false);
  });
});

describe('phần còn lại của ứng dụng KHÔNG immersive', () => {
  it('đối chứng âm — vỏ đầy đủ ở mọi route khác', () => {
    /*
      Không có nhóm này thì một `isImmersiveRoute` luôn trả `true` cũng làm mọi
      ô "immersive" ở trên xanh, và cả ứng dụng mất thanh điều hướng.

      `/playgrounds/<id>` nằm trong danh sách này một cách CÓ CHỦ Ý dù nó cũng có
      terminal — xem lý lẽ tại chỗ khai `IMMERSIVE_CHILD_PREFIXES`. Nếu ai đó
      quyết định đổi, ô này đỏ và buộc đọc lại lý lẽ đó trước.
    */
    for (const path of [
      '/',
      '/labs',
      '/lessons',
      '/paths/co-ban',
      '/quiz/abc',
      '/playgrounds',
      '/playgrounds/ubuntu',
      '/me',
      '/settings',
      '/admin/users',
      '/author/problems',
      '/login',
      '/problems/two-sum',
      '/session/abc/terminal',
    ]) {
      expect(isImmersiveRoute(path), path).toBe(false);
    }
  });

  it('pathname rỗng hoặc null ⇒ không immersive', () => {
    // `usePathname()` trả `null` ở lượt render đầu của một vài đường; đọc nó
    // thành immersive sẽ nháy mất thanh đầu trang ở MỌI trang.
    expect(isImmersiveRoute(null)).toBe(false);
    expect(isImmersiveRoute('')).toBe(false);
  });
});
