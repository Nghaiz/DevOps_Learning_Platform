'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Box,
  Code2,
  FlaskConical,
  Gamepad2,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  Menu,
  PenLine,
  Route,
  Settings,
  Terminal,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  cn,
} from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { ZOD_JITLESS_APPLIED } from '../../lib/zod-jitless';
import { isImmersiveRoute } from './immersive-routes';
import { type Viewer } from './nav';
import { CapacityIndicator } from './capacity-indicator';
import { CapacityProvider, useCapacity } from './use-capacity';
import { describeProfileCapacity } from './capacity';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { ViewerProvider } from './viewer-context';

const LEARN = [
  { href: '/games', label: 'Games', icon: Gamepad2 },
  { href: '/problems', label: 'Bài tập OJ', icon: Code2 },
  { href: '/exams', label: 'Kỳ thi', icon: Trophy },
];
const LIBRARY = [
  { href: '/lessons', label: 'Bài học', icon: BookOpen },
  { href: '/labs', label: 'Labs', icon: Terminal },
  { href: '/playgrounds', label: 'Playground', icon: FlaskConical },
  { href: '/paths', label: 'Lộ trình', icon: Route },
  { href: '/quiz', label: 'Quiz', icon: GraduationCap },
];
const STUDIO = [
  { href: '/author', label: 'Soạn bài', icon: PenLine },
  { href: '/author/problems', label: 'Problem creator', icon: Code2 },
  { href: '/games/git?mode=builder', label: 'Level builder', icon: GitBranch },
];

function Brand() {
  return (
    <Link href="/" className="practice-brand" aria-label={t('shell.brand.home')}>
      <span>
        <Box size={22} strokeWidth={1.7} />
      </span>
      <div>
        DevOps<small>PRACTICE SPACE</small>
      </div>
    </Link>
  );
}

function Navigation({
  viewer,
  close = false,
}: {
  readonly viewer: Viewer | null;
  readonly close?: boolean;
}) {
  const pathname = usePathname();
  const groups = [
    { label: 'THỰC HÀNH', items: LEARN },
    { label: 'THƯ VIỆN', items: LIBRARY },
    ...(viewer?.role === 'author' || viewer?.role === 'admin'
      ? [{ label: 'STUDIO', items: STUDIO }]
      : []),
    ...(viewer?.role === 'admin'
      ? [
          {
            label: 'QUẢN LÝ',
            items: [
              { href: '/admin/exams', label: 'Tổ chức kỳ thi', icon: Trophy },
              { href: '/admin/classes', label: 'Lớp học', icon: Users },
              { href: '/admin', label: 'Quản trị', icon: Settings },
            ],
          },
        ]
      : []),
  ];
  return (
    <nav className="practice-navigation" aria-label="Điều hướng chính">
      {groups.map((group) => (
        <section key={group.label}>
          <h2>{group.label}</h2>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/games'
                ? pathname === '/' || pathname === '/games'
                : href === '/author' || href === '/admin'
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
            const link = (
              <Link
                href={href}
                className={cn('practice-nav-item', active && 'is-active')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{label}</span>
              </Link>
            );
            return close ? (
              <DialogClose asChild key={href}>
                {link}
              </DialogClose>
            ) : (
              <div key={href}>{link}</div>
            );
          })}
        </section>
      ))}
      {viewer && (
        <Link className="practice-nav-item practice-personal" href="/me">
          <LayoutDashboard size={19} />
          Tiến độ của tôi
        </Link>
      )}
    </nav>
  );
}

function MobileNavigation({ viewer }: { readonly viewer: Viewer | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="practice-mobile-trigger" aria-label="Mở điều hướng">
          <Menu size={21} />
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="practice-mobile-drawer">
        <DialogHeader>
          <DialogTitle>DevOps Practice</DialogTitle>
        </DialogHeader>
        <Navigation viewer={viewer} close />
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({
  viewer,
  children,
}: {
  readonly viewer: Viewer | null;
  readonly children: ReactNode;
}) {
  void ZOD_JITLESS_APPLIED;
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);
  const auth = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);
  const active = [...LEARN, ...LIBRARY, ...STUDIO].find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return (
    <ViewerProvider viewer={viewer}>
      <CapacityProvider enabled={viewer !== null}>
        <div
          className={cn(
            'practice-shell',
            immersive && 'practice-immersive',
            auth && 'practice-auth',
          )}
          data-area={
            pathname.startsWith('/author')
              ? 'studio'
              : pathname.startsWith('/admin')
                ? 'admin'
                : 'learn'
          }
        >
          <a href="#noi-dung" className="practice-skip">
            Bỏ qua điều hướng
          </a>
          {!immersive && (
            <>
              {!auth && (
                <aside className="practice-sidebar">
                  <Brand />
                  <Navigation viewer={viewer} />
                  <div className="practice-sidebar-bottom">
                    <span className="practice-status-dot" /> Học bằng thực hành
                  </div>
                </aside>
              )}
              <header className="practice-topbar">
                <div className="practice-topbar-title">
                  {!auth && <MobileNavigation viewer={viewer} />}
                  {auth ? (
                    <Brand />
                  ) : (
                    <>
                      <span className="practice-breadcrumb">Workspace</span>
                      <span aria-hidden="true">/</span>
                      <strong>{pathname === '/' ? 'Games' : (active?.label ?? 'DevOps')}</strong>
                    </>
                  )}
                </div>
                <div className="practice-topbar-actions">
                  {viewer && (
                    <span className="practice-capacity">
                      <CapacityIndicator />
                    </span>
                  )}
                  <ThemeToggle />
                  {viewer ? (
                    <UserMenu viewer={viewer} />
                  ) : (
                    <Button asChild size="sm">
                      <Link href="/login">Đăng nhập</Link>
                    </Button>
                  )}
                </div>
              </header>
            </>
          )}
          <main id="noi-dung" tabIndex={-1} className="practice-main">
            {viewer && !immersive && <CapacityFullBanner />}
            {children}
          </main>
        </div>
      </CapacityProvider>
    </ViewerProvider>
  );
}

function CapacityFullBanner() {
  const { data } = useCapacity();
  if (data === null) return null;
  const reading = describeProfileCapacity(data);
  if (reading === null || reading.tone !== 'full') return null;
  return (
    <div className="px-6 py-3">
      <Alert variant="warning">
        <AlertTitle>{t('shell.capacity.full-title')}</AlertTitle>
        <AlertDescription>{reading.detail}</AlertDescription>
      </Alert>
    </div>
  );
}
