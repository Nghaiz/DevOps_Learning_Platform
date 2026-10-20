'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { err, t } from '@devops-platform/copy';
import { THEMES, THEME_NAMES, type ThemeName } from '@devops-platform/terminal/themes';
import {
  Button,
  Field,
  Icon,
  Label,
  Notice,
  RadioGroup,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  RadioItem,
  Switch,
  cn,
} from '@devops-platform/ds';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { saveStateOf } from './account-sections';
import { SaveStatus } from './save-status';
import {
  SHELL_OPTIONS,
  describeLeaderboardPreference,
  describeShellPreference,
  describeTerminalThemePreference,
  shellLabel,
  terminalThemeLabel,
  type PreferenceNotice,
  type ShellName,
} from './preference-notices';

/** `RadioGroup` không nhận `null`; đây là mã cho "dùng mặc định của hệ thống". */
const DEFAULT_CHOICE = 'mac-dinh';

export interface PreferencesFormProps {
  readonly defaultShell: ShellName;
  readonly terminalTheme: ThemeName | null;
  readonly leaderboardNamePublic: boolean;
}

/**
 * Ba tuỳ chọn cá nhân: shell mặc định, màu terminal, hiện tên trên bảng xếp hạng.
 *
 * ## Vì sao có nút Lưu thay vì lưu ngay khi bấm
 *
 * Cả ba đều là tuỳ chọn có HỆ QUẢ cần đọc trước khi chốt (xem
 * `preference-notices.ts`), và câu hệ quả đi theo giá trị đang chọn. Lưu ngay
 * lúc bấm nghĩa là người dùng đọc lời cảnh báo SAU khi đã đổi. Nháp cục bộ + một
 * nút Lưu cho họ đọc trước rồi mới quyết.
 *
 * Giá trị ĐÃ LƯU luôn đọc từ `me.get`; `useEffect` kéo nháp về theo server mỗi khi
 * server đổi, nên màn hình không khẳng định một tuỳ chọn mà server không giữ.
 */
export function PreferencesForm(props: PreferencesFormProps): ReactElement {
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
   * Số máy đang chạy CHỈ để nói đúng câu cảnh báo về shell. Đọc đúng một trang đầu;
   * `nextCursor !== null` thành "ít nhất N" thay vì một tổng sai.
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
    shell !== props.defaultShell || theme !== props.terminalTheme || leaderboard !== props.leaderboardNamePublic;

  const state = saveStateOf({
    dirty,
    pending: updatePreferences.isPending,
    saved,
    failed: updatePreferences.isError,
  });

  const saveError = updatePreferences.isError
    ? err('me.error.preferences-save', { reason: describeTrpcError(updatePreferences.error) })
    : null;

  return (
    <Section title={t('me.preferences.title')} description={t('me.preferences.description')} icon="sliders">
      <div className="flex flex-col gap-8">
        <Field label={t('me.preferences.shell-label')}>
          <Select
            value={shell}
            onValueChange={(value) => {
              setShell(value as ShellName);
              setSaved(false);
            }}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHELL_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {shellLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <NoticeText notice={describeShellPreference({ shell, activeSessionCount, moreSessions })} />

        <fieldset className="flex flex-col gap-3">
          <legend className="pb-2 text-sm font-medium text-ink">{t('me.preferences.theme-label')}</legend>
          <RadioGroup
            value={theme ?? DEFAULT_CHOICE}
            onValueChange={(value) => {
              setTheme(value === DEFAULT_CHOICE ? null : (value as ThemeName));
              setSaved(false);
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <ThemeOption value={DEFAULT_CHOICE} name="dlp-dark" label={t('me.preferences.theme-follow')} />
            {THEME_NAMES.map((name) => (
              <ThemeOption key={name} value={name} name={name} label={terminalThemeLabel(name)} />
            ))}
          </RadioGroup>
          <NoticeText notice={describeTerminalThemePreference(theme)} />
        </fieldset>

        <div className="flex flex-col gap-2">
          <Switch
            checked={leaderboard}
            label={t('me.preferences.leaderboard-label')}
            onCheckedChange={(checked) => {
              setLeaderboard(checked);
              setSaved(false);
            }}
          />
          <NoticeText notice={describeLeaderboardPreference(leaderboard)} />
        </div>

        {saveError === null ? null : (
          <Notice tone="bad" role="alert" title={saveError.what}>
            {saveError.next}
          </Notice>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
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
            {t('me.preferences.save')}
          </Button>
          <SaveStatus state={state} />
        </div>
      </div>
    </Section>
  );
}

/**
 * Một lựa chọn màu terminal: mẫu ba dòng lệnh vẽ bằng đúng bảng màu xterm sẽ dùng,
 * nên thứ người dùng thấy ở đây là thứ họ nhận trong terminal.
 */
function ThemeOption({ value, name, label }: { value: string; name: ThemeName; label: string }): ReactElement {
  const palette = THEMES[name];
  return (
    <Label className="block cursor-pointer">
      <span className="group/opt flex items-center gap-3 rounded-md border border-rule-2 bg-paper p-2 pr-3 transition-colors duration-150 hover:border-control has-[[data-state=checked]]:border-acc-solid has-[[data-state=checked]]:bg-acc-wash has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
        <RadioItem value={value} className="peer sr-only" aria-label={label} />
        <span
          aria-hidden="true"
          className="grid w-28 shrink-0 gap-0.5 rounded-sm px-2 py-1.5 font-mono text-[10px] leading-tight"
          style={{ backgroundColor: palette.background, color: palette.foreground }}
        >
          <span>
            <span style={{ color: palette.green }}>dev</span>
            <span style={{ color: palette.blue }}> ~/lab</span>
            <span style={{ color: palette.foreground }}> $ ls</span>
          </span>
          <span>
            <span style={{ color: palette.cyan }}>app </span>
            <span style={{ color: palette.yellow }}>k8s </span>
            <span style={{ color: palette.magenta }}>ci</span>
          </span>
          <span className="flex items-center gap-1">
            <span style={{ color: palette.red }}>x</span>
            <span className="inline-block h-2.5 w-1.5" style={{ backgroundColor: palette.cursor }} />
          </span>
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{label}</span>
        <Icon
          name="check"
          size={16}
          className={cn('shrink-0 text-acc-ink opacity-0 transition-opacity duration-150 group-has-[[data-state=checked]]/opt:opacity-100')}
        />
      </span>
    </Label>
  );
}

/** Cảnh báo thì là một Notice vàng; chú thích thường thì là chữ nhỏ màu xám. */
function NoticeText({ notice }: { readonly notice: PreferenceNotice }): ReactElement {
  if (notice.tone === 'warning') {
    return (
      <Notice tone="warn">
        {notice.lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Notice>
    );
  }
  return (
    <div className="-mt-1 flex flex-col gap-0.5 text-sm text-ink-3">
      {notice.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}
