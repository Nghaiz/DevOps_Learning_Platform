'use client';

import { Button, Separator } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { authClient } from '../../lib/auth-client';

/**
 * Hai nút nhà cung cấp ngoài, dùng chung bởi `/login` và `/register`.
 *
 * ⚠ `disabled` cho tới khi React gắn xong handler, cùng lý do với nút submit
 * của hai form: hai nút này là `type="button"` + `onClick`, nên bấm trước lúc
 * hydrate KHÔNG mất dữ liệu, nó chỉ **không làm gì cả**, im lặng. Cùng một lớp
 * lỗi ("nút hiện ra không có nghĩa là nó chạy"), nên cùng một khoá.
 *
 * `callbackURL: '/me'` khớp đích sau khi đăng nhập bằng mật khẩu (D12:
 * `/dashboard` nay chỉ còn là một 308 tới đúng chỗ đó).
 */
export function AuthOAuth({ hydrated }: { readonly hydrated: boolean }) {
  function onOAuth(provider: 'google' | 'microsoft') {
    void authClient.signIn.social({ provider, callbackURL: '/me' });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Vạch ngăn có chữ ở giữa: một `Separator` trần không nói hai nhóm nút
          trên và dưới là hai ĐƯỜNG khác nhau, nó chỉ nói "có ngăn cách". */}
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">{t('auth.form.divider')}</span>
        <Separator className="flex-1" />
      </div>
      <Button type="button" variant="outline" disabled={!hydrated} onClick={() => { onOAuth('google'); }}>
        {t('auth.oauth.google')}
      </Button>
      <Button type="button" variant="outline" disabled={!hydrated} onClick={() => { onOAuth('microsoft'); }}>
        {t('auth.oauth.microsoft')}
      </Button>
    </div>
  );
}
