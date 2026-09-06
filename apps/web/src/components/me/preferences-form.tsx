'use client';

import { useEffect, useId, useState, type ReactElement } from 'react';
import { THEME_NAMES, type ThemeName } from '@devops-platform/terminal/themes';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import {
  SHELL_LABEL,
  SHELL_OPTIONS,
  TERMINAL_THEME_LABEL,
  describeLeaderboardPreference,
  describeShellPreference,
  describeTerminalThemePreference,
  type PreferenceNotice,
  type ShellName,
} from './preference-notices';

/** Giá trị `Select` không nhận `null`; đây là mã cho "đi theo giao diện trang". */
const FOLLOW_APP_THEME = 'theo-giao-dien';

export interface PreferencesFormProps {
  readonly defaultShell: ShellName;
  readonly terminalTheme: ThemeName | null;
  readonly leaderboardNamePublic: boolean;
}

/**
 * Ba tuỳ chọn cá nhân — shell mặc định, theme terminal, hiện tên trên bảng xếp
 * hạng.
 *
 * ## Vì sao có nút Lưu thay vì lưu ngay khi bấm
 *
 * Cả ba đều là tuỳ chọn có HỆ QUẢ cần đọc trước khi chốt (xem
 * `preference-notices.ts`), và câu hệ quả đi theo giá trị đang chọn. Lưu ngay
 * lúc bấm nghĩa là người dùng đọc lời cảnh báo SAU khi đã đổi — muộn đúng một
 * nhịp. Nháp cục bộ + một nút Lưu cho họ đọc trước rồi mới quyết.
 *
 * ⚠ Nháp là INPUT của người dùng, không phải bản sao của một con số server tính
 * (13.E mục 19 cấm cái sau). Giá trị ĐÃ LƯU luôn đọc từ `me.get`; `useEffect`
 * dưới đây kéo nháp về theo server mỗi khi server đổi, nên không có đường nào
 * để màn hình khẳng định một tuỳ chọn mà server không giữ.
 */
export function PreferencesForm(props: PreferencesFormProps): ReactElement {
  const fieldId = useId();
  const utils = api.useUtils();

  const [shell, setShell] = useState<ShellName>(props.defaultShell);
  const [theme, setTheme] = useState<ThemeName | null>(props.terminalTheme);
  const [leaderboard, setLeaderboard] = useState(props.leaderboardNamePublic);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setShell(props.defaultShell);
    setTheme(props.terminalTheme);
    setLeaderboard(props.leaderboardNamePublic);
  }, [props.defaultShell, props.terminalTheme, props.leaderboardNamePublic]);

  /*
   * Số phiên đang chạy CHỈ để nói đúng câu cảnh báo về shell. Trang này không
   * hiện danh sách phiên (đó là việc của `/me`), nên nó đọc đúng một trang đầu
   * và không phân trang — `nextCursor !== null` được chuyển thành "ít nhất N"
   * thay vì một tổng sai.
   */
  const sessions = api.me.activeSessions.useQuery({});
  const activeSessionCount = sessions.isSuccess ? sessions.data.items.length : null;
  const moreSessions = sessions.isSuccess && sessions.data.nextCursor !== null;

  const updatePreferences = api.me.updatePreferences.useMutation({
    onSuccess: async () => {
      setSaved(true);
      await utils.me.get.invalidate();
    },
  });

  const dirty =
    shell !== props.defaultShell ||
    theme !== props.terminalTheme ||
    leaderboard !== props.leaderboardNamePublic;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Tuỳ chọn</CardTitle>
          {dirty && <Badge variant="warning">Chưa lưu</Badge>}
        </div>
        <CardDescription>
          Áp dụng cho phiên và terminal bạn mở sau khi lưu, không đổi thứ đang chạy.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-shell`}>Shell mặc định</Label>
          <Select
            value={shell}
            onValueChange={(value) => {
              setShell(value as ShellName);
              setSaved(false);
            }}
          >
            <SelectTrigger id={`${fieldId}-shell`} className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHELL_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {SHELL_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NoticeText notice={describeShellPreference({ shell, activeSessionCount, moreSessions })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-theme`}>Màu terminal</Label>
          <Select
            value={theme ?? FOLLOW_APP_THEME}
            onValueChange={(value) => {
              setTheme(value === FOLLOW_APP_THEME ? null : (value as ThemeName));
              setSaved(false);
            }}
          >
            <SelectTrigger id={`${fieldId}-theme`} className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FOLLOW_APP_THEME}>Theo giao diện trang</SelectItem>
              {THEME_NAMES.map((name) => (
                <SelectItem key={name} value={name}>
                  {TERMINAL_THEME_LABEL[name]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NoticeText notice={describeTerminalThemePreference(theme)} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Switch
              id={`${fieldId}-leaderboard`}
              checked={leaderboard}
              onCheckedChange={(checked) => {
                setLeaderboard(checked);
                setSaved(false);
              }}
            />
            <Label htmlFor={`${fieldId}-leaderboard`}>Hiện tên tôi trên bảng xếp hạng</Label>
          </div>
          <NoticeText notice={describeLeaderboardPreference(leaderboard)} />
        </div>

        {updatePreferences.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              {describeTrpcError(updatePreferences.error)} Thử lưu lại; nếu vẫn hỏng thì tải lại
              trang để xem tuỳ chọn hiện tại của bạn.
            </AlertDescription>
          </Alert>
        )}

        {saved && !dirty && !updatePreferences.isPending && (
          <Alert variant="success">
            <AlertDescription>Đã lưu tuỳ chọn.</AlertDescription>
          </Alert>
        )}

        <div>
          <Button
            loading={updatePreferences.isPending}
            disabled={!dirty}
            onClick={() => {
              setSaved(false);
              updatePreferences.mutate({
                defaultShell: shell,
                terminalTheme: theme,
                leaderboardNamePublic: leaderboard,
              });
            }}
          >
            Lưu tuỳ chọn
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** `warning` dùng `Alert` để câu cảnh báo không lẫn vào chú thích thường. */
function NoticeText({ notice }: { readonly notice: PreferenceNotice }): ReactElement {
  if (notice.tone === 'warning') {
    return (
      <Alert variant="warning">
        <AlertDescription>
          {notice.lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {notice.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}
