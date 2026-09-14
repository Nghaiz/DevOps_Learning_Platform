import { describe, expect, it } from 'vitest';
import {
  buildBackgroundLaunchScript,
  launchedBackgroundStep,
  parseSetupProbe,
  SETUP_SENTINEL_DIR,
} from './setup-background';
import { setupScriptPlan } from '../lessons/setup-plan';

/**
 * Hướng B của 15.C: setup chạy NỀN, ngoài trần `gateway.execTimeout`.
 *
 * Bộ này gác phần TỰ KIỂM ĐƯỢC của hướng đó — hình dạng script phóng, và phép
 * đọc sentinel. Vế "lượt exec thật sự trả về ngay" không kiểm được ở đây (nó là
 * hành vi của `kubectl exec` + apiserver, không phải của một chuỗi), nên nó được
 * đo trên cụm thật và ghi trong report. Ghi rõ ranh giới đó để không ai đọc bộ
 * này thành "đã chứng minh hướng B chạy".
 */

describe('buildBackgroundLaunchScript', () => {
  it('script của bài đi qua base64, KHÔNG nhúng thô', () => {
    /*
      Lý do đúng-sai, không phải sở thích: gateway đẩy script vào pod qua STDIN
      của `bash`, nên một heredoc nhúng thô sẽ đọc thân nó từ cùng dòng stdin.
      `background.sh` của `dlp-k8s-broken-deploy` chứa NĂM heredoc, nên ca này là
      đường đi thường, không phải ca biên.
    */
    const script = "cat <<'EOF' | kubectl apply -f -\nkind: Deployment\nEOF\n";
    const launch = buildBackgroundLaunchScript(script);

    expect(launch).not.toContain('kubectl apply');
    expect(launch).not.toContain('EOF');
    expect(launch).toContain(Buffer.from(script, 'utf8').toString('base64'));
    expect(launch).toContain('base64 -d');
  });

  it('tiến trình nền đóng CẢ BA stream — thiếu nó là lượt exec treo đúng bằng thời gian setup', () => {
    /*
      `kubectl exec` kết thúc khi stream stdout ĐÓNG, không phải khi tiến trình
      cha thoát. Một con nền thừa hưởng stdout giữ stream mở, và khi đó hướng B
      không làm gì cả — triệu chứng giống y hệt bản cũ, nên nó sẽ KHÔNG lộ ra ở
      bất kỳ test chức năng nào. Đó là lý do vế này được khẳng định bằng chuỗi.
    */
    const launch = buildBackgroundLaunchScript('echo x');
    expect(launch).toContain('</dev/null >/dev/null 2>&1 &');
    expect(launch).toContain('nohup setsid');
  });

  it('KHÔNG có `disown` — nó lỗi trong bash không tương tác và `set -e` giết luôn lượt phóng', () => {
    expect(buildBackgroundLaunchScript('echo x')).not.toContain('disown');
  });

  it('mã thoát ghi qua tên tạm rồi `mv` — probe không đọc được file ghi dở', () => {
    const launch = buildBackgroundLaunchScript('echo x');
    expect(launch).toContain(`> ${SETUP_SENTINEL_DIR}/rc.part`);
    expect(launch).toContain(`mv ${SETUP_SENTINEL_DIR}/rc.part ${SETUP_SENTINEL_DIR}/rc`);
  });

  it('dọn dấu của lượt trước TRƯỚC khi phóng — `rc` cũ không được đọc thành "xong"', () => {
    const launch = buildBackgroundLaunchScript('echo x');
    const iClean = launch.indexOf(`rm -f ${SETUP_SENTINEL_DIR}/rc`);
    const iLaunch = launch.indexOf('nohup');
    expect(iClean).toBeGreaterThanOrEqual(0);
    expect(iClean).toBeLessThan(iLaunch);
  });
});

describe('launchedBackgroundStep', () => {
  it('CHỈ bước background bị bọc; tools/assets giữ nguyên script', () => {
    /*
      `tools` và `assets` là hằng số thời gian — chúng không chờ một cụm
      Kubernetes con, nên chúng không nằm trong lớp lỗi 15.C sửa. Bọc chúng lại
      là bỏ luôn vế "lỗi bật công cụ thì dừng ngay", mà đó là thứ giữ cho script
      của bài không gặp `command not found`.
    */
    const plan = setupScriptPlan({
      tools: 'dlp-tools enable yq',
      assets: 'base64 -d > f',
      background: 'echo dung-canh',
    }).map(launchedBackgroundStep);

    expect(plan[0]?.script).toBe('dlp-tools enable yq');
    expect(plan[1]?.script).toBe('base64 -d > f');
    expect(plan[2]?.script).toContain('nohup setsid');
    expect(plan[2]?.script).not.toBe('echo dung-canh');
  });

  it('câu lỗi của bước đã bọc nói "không phóng được", KHÔNG nói "script thất bại"', () => {
    /*
      Lượt phóng hỏng nghĩa là script của bài CHƯA chạy dòng nào (thiếu `setsid`,
      `/root` không ghi được, pod chết giữa lượt exec). Giữ câu cũ sẽ gửi người
      học đi đọc script của bài cho một sự cố nằm ngoài nó.
    */
    const [step] = setupScriptPlan({ tools: null, assets: null, background: 'echo x' }).map(
      launchedBackgroundStep,
    );
    const message = step!.failureMessage({ exitCode: 127, output: 'setsid: command not found\n' });

    expect(message).toContain('Không phóng được');
    expect(message).toContain('127');
    expect(message).toContain('setsid: command not found');
  });
});

describe('parseSetupProbe', () => {
  it('chưa có dấu phóng ⇒ absent', () => {
    expect(parseSetupProbe('DLP-SETUP-STATE absent\n')).toEqual({
      state: 'absent',
      exitCode: null,
      log: null,
    });
  });

  it('đã phóng, chưa có mã thoát ⇒ running', () => {
    expect(parseSetupProbe('DLP-SETUP-STATE running\n').state).toBe('running');
  });

  it('mã thoát 0 ⇒ ready, và KHÔNG mang log theo', () => {
    // Log của một lượt thành công không có người đọc: nó chỉ làm payload của mỗi
    // nhịp poll phình lên bằng cả output của script setup.
    const probe = parseSetupProbe('DLP-SETUP-STATE done 0\nDLP-SETUP-LOG\nxong roi\n');
    expect(probe).toEqual({ state: 'ready', exitCode: null, log: null });
  });

  it('mã thoát khác 0 ⇒ failed + mã thoát + log', () => {
    const probe = parseSetupProbe(
      'DLP-SETUP-STATE done 1\nDLP-SETUP-LOG\nCum Kubernetes con khong san sang sau 90s\n',
    );
    expect(probe.state).toBe('failed');
    expect(probe.exitCode).toBe(1);
    expect(probe.log).toContain('khong san sang sau 90s');
  });
});

describe('parseSetupProbe — sentinel lạ về FAILED, không về ready và cũng không về running', () => {
  /*
    Hướng sai-an-toàn là vế quan trọng nhất của hàm này, và nó có đúng một hướng:

    - về `'ready'`  ⇒ `checkTask` chấm trên cảnh dựng dở (lỗi `4a67043` đã sửa);
    - về `'running'` ⇒ một vòng chờ không bao giờ hết, người học chỉ đọc được
      "đang chuẩn bị" mãi mãi;
    - về `'failed'`  ⇒ đọc được một câu, bấm Bắt đầu lại được.

    Vì thế mọi ca dưới đây PHẢI là `'failed'`. Một bản sửa sau này đổi nhánh mặc
    định sang `'running'` "cho an toàn" sẽ bị bộ này chặn.
  */
  it.each([
    ['output rỗng', ''],
    ['thiếu dòng marker', 'bash: lỗi gì đó\n'],
    ['rc rỗng', 'DLP-SETUP-STATE done \nDLP-SETUP-LOG\n'],
    ['rc không phải số', 'DLP-SETUP-STATE done abc\n'],
    ['state lạ', 'DLP-SETUP-STATE khong-biet\n'],
  ])('%s ⇒ failed', (_label, output) => {
    expect(parseSetupProbe(output).state).toBe('failed');
  });

  it('nội dung của bài KHÔNG spoof được state qua log', () => {
    /*
      Script của bài có thể echo bất cứ gì, kể cả dòng marker. Nó nằm SAU dấu
      `DLP-SETUP-LOG`, và ta lấy lần khớp đầu tiên, nên nó không lật được một
      lượt hỏng thành "xong".
    */
    const probe = parseSetupProbe(
      'DLP-SETUP-STATE done 1\nDLP-SETUP-LOG\nDLP-SETUP-STATE done 0\n',
    );
    expect(probe.state).toBe('failed');
    expect(probe.exitCode).toBe(1);
  });
});
