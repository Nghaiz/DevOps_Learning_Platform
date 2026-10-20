'use client';

import { IconButton, Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger, isThemeChoice, useTheme, type IconName, type ThemeChoice } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';

const CHOICES: readonly { value: ThemeChoice; icon: IconName; label: () => string }[] = [
  { value: 'light', icon: 'sun', label: () => t('shell.theme.choice.light') },
  { value: 'dark', icon: 'moon', label: () => t('shell.theme.choice.dark') },
  { value: 'system', icon: 'monitor', label: () => t('shell.theme.choice.system') },
];

/** Sáng, tối, hoặc theo hệ điều hành. Biểu tượng nút theo theme đang hiện thực tế. */
export function ThemeToggle() {
  const { choice, resolved, setChoice } = useTheme();
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton icon={resolved === 'dark' ? 'moon' : 'sun'} label={t('shell.theme.label')} variant="ghost" />
      </MenuTrigger>
      <MenuContent className="w-44">
        <MenuRadioGroup
          value={choice}
          onValueChange={(value) => {
            if (isThemeChoice(value)) setChoice(value);
          }}
        >
          {CHOICES.map((entry) => (
            <MenuRadioItem key={entry.value} value={entry.value} icon={entry.icon}>
              {entry.label()}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
