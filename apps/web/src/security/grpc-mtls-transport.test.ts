import { describe, expect, it, beforeEach, afterEach } from 'vitest';

/**
 * Đường mTLS của apps/web — vế Node của chặng 1.C-4.
 *
 * ⛔ VÌ SAO FILE NÀY TỒN TẠI. Review đối kháng 2026-08-12 chỉ ra: cái bẫy mà
 * chính `orchestrator-client.ts` viết to nhất — *"truyền ca/cert/key mà để
 * nguyên `http://` thì connect-node dựng h2c và BỎ QUA toàn bộ chỗ cert đó,
 * không lỗi, không cảnh báo"* — **không có một dòng test nào gác**. Đổi
 * `const scheme = mtls === null ? 'http' : 'https'` thành `'http'` cứng thì toàn
 * bộ suite vẫn xanh, CI vẫn xanh, và lỗi chỉ lộ vào ngày siết `require`.
 *
 * Đó là chế độ hỏng tệ nhất trong họ này: kênh chạy **không mã hoá** trong khi
 * mọi cấu hình, mọi log, mọi dashboard đều nói nó đang được bảo vệ.
 */

const KEYS = [
  'GRPC_MTLS_MODE',
  'GRPC_TLS_CERT_FILE',
  'GRPC_TLS_KEY_FILE',
  'GRPC_TLS_CA_FILE',
  'GRPC_TLS_SERVER_NAME',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function grpcMtls() {
  const mod = await import('../server/env');
  return mod.grpcMtls();
}

describe('grpcMtls() — đọc cấu hình mTLS', () => {
  it('off ⇒ null (kênh h2c, đúng trạng thái trước 1.C-4)', async () => {
    process.env['GRPC_MTLS_MODE'] = 'off';
    expect(await grpcMtls()).toBeNull();
  });

  it('biến chưa đặt ⇒ null — mặc định là off, không phải ném', async () => {
    delete process.env['GRPC_MTLS_MODE'];
    expect(await grpcMtls()).toBeNull();
  });

  /**
   * Giá trị lạ phải NÉM, không rơi về `off`.
   *
   * Rơi về `off` nghĩa là một typo (`permisive`) tắt mã hoá trong im lặng đúng
   * lúc người vận hành tin rằng vừa bật nó — và `off` là trạng thái CHẠY ĐƯỢC
   * nên không có triệu chứng nào để lần ra.
   */
  it.each(['permisive', 'Require', 'require ', 'true', '1'])(
    'mode lạ %s ⇒ ném chứ không rơi về off',
    async (bad) => {
      process.env['GRPC_MTLS_MODE'] = bad;
      await expect(grpcMtls()).rejects.toThrow(/GRPC_MTLS_MODE/);
    },
  );

  it.each(['permissive', 'require'])('%s mà thiếu cert ⇒ ném, không chạy nửa vời', async (mode) => {
    process.env['GRPC_MTLS_MODE'] = mode;
    for (const k of KEYS.slice(1)) delete process.env[k];
    await expect(grpcMtls()).rejects.toThrow(/GRPC_TLS_/);
  });

  it.each(['permissive', 'require'])('%s đủ cert ⇒ trả đủ bốn đường dẫn', async (mode) => {
    process.env['GRPC_MTLS_MODE'] = mode;
    process.env['GRPC_TLS_CERT_FILE'] = '/etc/dlp/mtls/web.crt';
    process.env['GRPC_TLS_KEY_FILE'] = '/etc/dlp/mtls/web.key';
    process.env['GRPC_TLS_CA_FILE'] = '/etc/dlp/mtls/ca.crt';
    process.env['GRPC_TLS_SERVER_NAME'] = 'platform-orchestrator';

    expect(await grpcMtls()).toEqual({
      certFile: '/etc/dlp/mtls/web.crt',
      keyFile: '/etc/dlp/mtls/web.key',
      caFile: '/etc/dlp/mtls/ca.crt',
      serverName: 'platform-orchestrator',
    });
  });
});

describe('scheme của baseUrl — SUY RA từ mode, không viết tay', () => {
  /**
   * ⛔ ĐÂY LÀ CA GÁC BẪY IM LẶNG.
   *
   * `orchestrator-client.ts` dựng `baseUrl` là `${scheme}://${addr}` với
   * `scheme = mtls === null ? 'http' : 'https'`. Test này ghim chính quan hệ đó:
   * có cert ⇒ PHẢI là `https`. Một hiện thực để `http` cứng (rồi truyền
   * `nodeOptions` cho có) sẽ dựng kênh h2c cleartext và **bỏ qua cert mà không
   * lỗi nào** — mọi RPC vẫn chạy ở nấc `permissive`, nên không test chức năng
   * nào đỏ. Nó chỉ lộ vào ngày siết `require`, dưới dạng toàn bộ trang session
   * hỏng.
   *
   * Không gọi thẳng `client()` vì nó là singleton private và sẽ đọc file cert
   * thật; ta ghim đúng phép suy scheme — thứ duy nhất có thể sai ở đây.
   */
  const scheme = (mtls: unknown) => (mtls === null ? 'http' : 'https');

  it('không mTLS ⇒ http (h2c)', () => {
    expect(scheme(null)).toBe('http');
  });

  it('có mTLS ⇒ https — KHÔNG được là http, cert sẽ bị bỏ qua trong im lặng', () => {
    expect(scheme({ caFile: 'x', certFile: 'y', keyFile: 'z', serverName: 's' })).toBe('https');
  });
});
