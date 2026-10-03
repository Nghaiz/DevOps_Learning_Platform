'use client';

import { Button } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { authClient } from '../../lib/auth-client';

/**
 * Hai nút nhà cung cấp ngoài, dùng chung bởi `/login` và `/register`.
 *
 * ⚠ `disabled` cho tới khi React gắn xong handler, cùng lý do với nút submit của
 * hai form: bấm trước lúc hydrate thì nút `type="button"` này không làm gì cả,
 * im lặng. "Nút hiện ra không có nghĩa là nó chạy", nên cùng một khoá.
 *
 * `callbackURL` là đích mà form mật khẩu cũng dùng: trang người dùng vừa bị chặn
 * (đã qua `safeReturnPath`) hoặc `/me`. Better Auth tự kiểm thêm một lần nữa với
 * `trustedOrigins`, nên đây không phải lớp chặn duy nhất.
 */
export function AuthOAuth({
  hydrated,
  callbackURL,
}: {
  readonly hydrated: boolean;
  readonly callbackURL: string;
}) {
  function onOAuth(provider: 'google' | 'microsoft') {
    void authClient.signIn.social({ provider, callbackURL });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Vạch ngăn có chữ: hai nhóm nút trên và dưới là hai ĐƯỜNG khác nhau,
          không chỉ là hai khối cách nhau. */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="type-label text-muted-foreground">{t('auth.form.divider')}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={!hydrated}
          onClick={() => {
            onOAuth('google');
          }}
        >
          {t('auth.oauth.google')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={!hydrated}
          onClick={() => {
            onOAuth('microsoft');
          }}
        >
          {t('auth.oauth.microsoft')}
        </Button>
      </div>
    </div>
  );
}
