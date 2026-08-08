'use client';

import { createAuthClient } from 'better-auth/react';
import { jwtClient } from 'better-auth/client/plugins';

/**
 * Client Better Auth cho Client Component. `baseURL` bỏ trống = same-origin
 * (`/api/auth/*`) — không cần biết `BETTER_AUTH_URL` ở phía trình duyệt.
 */
export const authClient = createAuthClient({
  plugins: [jwtClient()],
});
