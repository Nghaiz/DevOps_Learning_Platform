/**
 * Dọn pod sandbox rơi lại trong namespace E2E dùng-một-lần.
 *
 * ── Vì sao file này tồn tại ─────────────────────────────────────────────────
 * Khi harness tự dựng orchestrator (chế độ services-local, `SANDBOX_NAMESPACE`
 * trỏ vào một namespace riêng như `dlp-e2e-p16`), reaper của CỤM không dọn hộ:
 * nó chỉ quét namespace của chính nó (`dlp-sandbox`). Orchestrator cục bộ chết
 * theo tiến trình harness, và mọi pod nó đã tạo ở lại VĨNH VIỄN — không ai sở
 * hữu, không ai reap.
 *
 * Đã xảy ra thật 2026-09-14: một pod sống 8 tiếng trong `dlp-e2e-p16`. Thiệt
 * hại không phải vài trăm MB RAM — ResourceQuota của namespace đó là `pods: 1`,
 * nên pod mồ côi CHIẾM TRỌN quota và lượt E2E kế tiếp chết bằng
 * `ResourceExhausted`. Triệu chứng đó trỏ người đọc đi truy quota/capacity,
 * cách xa nguyên nhân thật (một lượt chạy cũ chưa dọn).
 *
 * ── Vì sao phải khai báo tường minh, không tự đoán ──────────────────────────
 * Namespace KHÔNG được suy ra từ cấu hình mặc định. Đoán sai namespace ở một
 * lệnh `delete pod -l app=sandbox` là xoá pod của cụm thật. Biến vắng mặt ⇒
 * không làm gì và nói ra là không làm gì.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Namespace sandbox mà HARNESS sở hữu. Rỗng = harness không tự dựng orchestrator. */
export const E2E_SANDBOX_NAMESPACE = process.env.E2E_SANDBOX_NAMESPACE?.trim() ?? '';

/**
 * Xoá mọi pod `app=sandbox` trong namespace harness sở hữu.
 *
 * `phase` chỉ để đọc log: `setup` là lượt tự lành (lượt trước chết giữa chừng
 * thì teardown của nó chưa bao giờ chạy), `teardown` là lượt dọn bình thường.
 *
 * ⛔ NÉM khi kubectl lỗi, không nuốt. Bản im lặng chính là thứ vừa gây ra sự cố
 * ở trên: không ai biết pod còn đó cho tới lượt chạy sau, và lúc đó triệu chứng
 * đã đổi dạng. Một lượt dọn thất bại đáng để cả suite đỏ.
 */
export async function cleanSandboxNamespace(phase: 'setup' | 'teardown'): Promise<void> {
  if (!E2E_SANDBOX_NAMESPACE) {
    console.warn(
      `[e2e:${phase}] E2E_SANDBOX_NAMESPACE trống — bỏ qua lượt dọn pod. ` +
        'Đặt biến này khi harness tự dựng orchestrator vào một namespace riêng, ' +
        'nếu không pod rơi lại sẽ chiếm quota của lượt chạy sau.',
    );
    return;
  }

  // ⛔ Khẳng định namespace CÓ THẬT trước, và đây không phải phòng thủ thừa.
  // Đã đo 2026-09-14: `kubectl delete pod -l app=sandbox --ignore-not-found` với
  // một namespace KHÔNG TỒN TẠI in ra `No resources found` và thoát 0 — y hệt
  // lượt dọn thành công trên một namespace sạch. Nghĩa là gõ sai tên biến một
  // chữ thì lượt dọn báo "xong" mãi mãi trong khi namespace thật vẫn rò.
  try {
    await exec('kubectl', ['get', 'namespace', E2E_SANDBOX_NAMESPACE], { timeout: 30_000 });
  } catch (err) {
    throw new Error(
      `[e2e:${phase}] namespace ${E2E_SANDBOX_NAMESPACE} không tồn tại (hoặc kubectl ` +
        'không tới được cụm). Lượt dọn trên một namespace sai KHÔNG báo lỗi — nó in ' +
        '`No resources found` và thoát 0 — nên phải chặn ở đây, không thì mọi lượt sau ' +
        'đều "xanh" mà chẳng dọn gì.',
      { cause: err },
    );
  }

  const args = [
    '-n',
    E2E_SANDBOX_NAMESPACE,
    'delete',
    'pod',
    '-l',
    'app=sandbox',
    '--ignore-not-found',
    '--wait=false',
  ];

  try {
    const { stdout } = await exec('kubectl', args, { timeout: 60_000 });
    const done = stdout.trim();
    console.warn(
      `[e2e:${phase}] dọn ns ${E2E_SANDBOX_NAMESPACE}: ${done === '' ? 'không có pod nào' : done}`,
    );
  } catch (err) {
    throw new Error(
      `[e2e:${phase}] không dọn được pod sandbox trong ns ${E2E_SANDBOX_NAMESPACE}. ` +
        'Pod còn lại sẽ chiếm ResourceQuota và làm lượt chạy sau chết bằng ' +
        'ResourceExhausted — một triệu chứng trỏ sai hướng.',
      { cause: err },
    );
  }
}
