import { eq } from 'drizzle-orm';
import type { ThemeName } from '@devops-platform/terminal';
import type { Database, DbOrTx } from '../db/client';
import { userPreferences, type UserPreferencesRow } from '../db/schema';

/**
 * Tuỳ chọn cá nhân (P13, contract §2 C4) — SSOT ở đây, dùng chung bởi
 * `trpc/routers/me.ts` (`me.get`/`me.updatePreferences`), `sessions/preferences.ts`
 * (D7 — áp shell mặc định lúc mở sandbox), và `trpc/routers/labs.ts`
 * (`startAttempt` seed `displayNamePublic` từ đây).
 *
 * ⚠ KHÔNG có dòng `user_preferences` là trạng thái BÌNH THƯỜNG — bảng được tạo
 * LƯỜI (không insert lúc đăng ký), nên "chưa từng đặt tuỳ chọn" và "đã đặt về
 * đúng mặc định" là hai điều không phân biệt được và KHÔNG CẦN phân biệt: cả
 * hai đọc ra CÙNG một `PreferencesView`.
 */
export interface PreferencesView {
  readonly defaultShell: UserPreferencesRow['defaultShell'];
  readonly terminalTheme: ThemeName | null;
  readonly leaderboardNamePublic: boolean;
}

export const DEFAULT_PREFERENCES: PreferencesView = {
  defaultShell: 'bash',
  terminalTheme: null,
  leaderboardNamePublic: false,
};

function toView(row: UserPreferencesRow | undefined): PreferencesView {
  if (row === undefined) {
    return DEFAULT_PREFERENCES;
  }
  return {
    defaultShell: row.defaultShell,
    // `terminal_theme` được ép hợp lệ Ở BIÊN GHI (`me.updatePreferences` kiểm
    // bằng `THEME_NAMES`), nên đọc lại không cần validate lần hai — cùng kỷ
    // luật với `content_items.difficulty`/`tier` (validate ở biên nhập, không
    // ở mọi điểm đọc).
    terminalTheme: row.terminalTheme as ThemeName | null,
    leaderboardNamePublic: row.leaderboardNamePublic,
  };
}

export async function readUserPreferences(db: DbOrTx, userId: string): Promise<PreferencesView> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return toView(row);
}

/**
 * Upsert TOÀN BỘ ba field cùng lúc — `me.updatePreferences` nhận input tuỳ
 * chọn (mỗi field optional) nên PHẢI đọc dòng hiện có trước để giữ nguyên field
 * không được gửi, rồi ghi đè bằng chính hàm này. Tách upsert khỏi "merge với
 * input" để `sessions/preferences.ts` không phải biết hình dạng input router.
 */
export async function writeUserPreferences(
  db: Database,
  userId: string,
  prefs: PreferencesView,
): Promise<void> {
  const now = new Date();
  await db
    .insert(userPreferences)
    .values({
      userId,
      defaultShell: prefs.defaultShell,
      terminalTheme: prefs.terminalTheme,
      leaderboardNamePublic: prefs.leaderboardNamePublic,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        defaultShell: prefs.defaultShell,
        terminalTheme: prefs.terminalTheme,
        leaderboardNamePublic: prefs.leaderboardNamePublic,
        updatedAt: now,
      },
    });
}
