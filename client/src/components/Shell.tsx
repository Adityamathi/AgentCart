import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronRight,
  LayoutGrid,
  Menu,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  SplitSquareHorizontal,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cx, StatusDot } from './ui';

const GROUPS = [
  {
    label: 'Shopping',
    items: [
      { to: '/app', label: 'Agent', icon: Sparkles },
      { to: '/catalog', label: 'Catalogue', icon: LayoutGrid },
      { to: '/compare', label: 'Compare', icon: SplitSquareHorizontal },
      { to: '/cart', label: 'Cart', icon: ShoppingBag, badge: true },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/orders', label: 'Orders', icon: Receipt },
      { to: '/activity', label: 'Agent activity', icon: Activity },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function Wordmark({ className }: { className?: string }) {
  return (
    <NavLink to="/" className={cx('group inline-flex items-center gap-2.5', className)}>
      <img src="/mark.svg" alt="" className="h-6 w-6 rounded-[5px]" />
      <span className="text-[16px] font-medium tracking-[-0.01em] text-ink">AgentCart</span>
    </NavLink>
  );
}

function NavList({ cartCount, onNavigate }: { cartCount: number; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'group relative flex h-9 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors duration-150 ease-ease',
                    isActive ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised/70 hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={16} strokeWidth={1.5} className={isActive ? 'text-ink' : 'text-ink-3'} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && cartCount > 0 ? (
                      <span className="font-mono text-[11px] tabular-nums text-ink-2">{cartCount}</span>
                    ) : null}
                    {isActive ? <span className="absolute -left-2 top-2 h-5 w-[2px] bg-accent" aria-hidden /> : null}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: cartData } = useQuery({ queryKey: ['cart'], queryFn: api.cart, enabled: Boolean(user) });
  const cartCount = cartData?.cart.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const integrations = me?.integrations;

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <div className="px-2">
          <Wordmark />
        </div>
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavList cartCount={cartCount} />
        </div>
        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-3 flex flex-col gap-1.5 px-2">
            <StatusDot
              tone={integrations?.ai.live ? 'ok' : 'warn'}
              label={integrations?.ai.live ? `Agent · ${integrations.ai.provider}` : 'Agent · local planner'}
            />
            <StatusDot
              tone={integrations?.paypal.configured ? 'ok' : 'warn'}
              label={integrations?.paypal.configured ? `PayPal · ${integrations.paypal.environment}` : 'PayPal · needs keys'}
            />
            <StatusDot tone="neutral" label={`Data · ${integrations?.database.driver ?? 'sqlite'}`} />
          </div>
          {user ? (
            <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">{user.name}</p>
                <p className="truncate font-mono text-[10.5px] text-ink-3">{user.email}</p>
              </div>
              <button
                onClick={() => void logout()}
                className="shrink-0 text-[12px] text-ink-3 transition-colors hover:text-ink"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-paper/90 px-4 backdrop-blur-sm lg:hidden">
          <Wordmark />
          <button
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-ink-2"
            aria-label="Open navigation"
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>
        </header>

        {menuOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-ink/25" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-[268px] border-r border-line bg-surface p-4">
              <div className="mb-6 flex items-center justify-between">
                <Wordmark />
                <button
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-raised"
                  aria-label="Close navigation"
                >
                  <X size={17} strokeWidth={1.5} />
                </button>
              </div>
              <NavList cartCount={cartCount} onNavigate={() => setMenuOpen(false)} />
              <button
                onClick={() => void logout()}
                className="mt-8 flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink"
              >
                Sign out <ChevronRight size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
