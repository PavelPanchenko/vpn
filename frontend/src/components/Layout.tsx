import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  Package,
  ScrollText,
  PanelLeft,
  PanelLeftClose,
  Server,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from './Button';
import { authStore } from '../lib/authStore';

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen w-full">
        <aside
          className={[
            'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 md:flex',
            collapsed ? 'w-[4.5rem]' : 'w-56',
          ].join(' ')}
        >
          <div className={['flex items-center border-b border-slate-200', collapsed ? 'justify-center px-0 py-3' : 'flex-col items-start px-4 py-4'].join(' ')}>
            {collapsed ? (
              <span className="text-lg font-bold text-slate-800" title="FreeRoam VPN">F</span>
            ) : (
              <>
                <div className="text-sm font-semibold tracking-tight text-slate-900">FreeRoam VPN</div>
                <div className="mt-1 text-xs text-slate-500">Внутренняя панель</div>
              </>
            )}
          </div>
          <nav className={['flex-1 overflow-hidden px-2 pb-4', collapsed ? 'flex flex-col items-center gap-0.5 pt-2' : 'pt-2'].join(' ')}>
            <NavItem to="/" icon={LayoutDashboard} collapsed={collapsed} title="Главная">Главная</NavItem>
            <NavItem to="/servers" icon={Server} collapsed={collapsed} title="Серверы">Серверы</NavItem>
            <NavItem to="/users" icon={Users} collapsed={collapsed} title="Пользователи">Пользователи</NavItem>
            <NavItem to="/subscriptions" icon={CreditCard} collapsed={collapsed} title="Подписки">Подписки</NavItem>
            <NavItem to="/payments" icon={Wallet} collapsed={collapsed} title="Платежи">Платежи</NavItem>
            <NavItem to="/plans" icon={Package} collapsed={collapsed} title="Тарифы">Тарифы</NavItem>
            <NavItem to="/settings" icon={Settings} collapsed={collapsed} title="Настройки">Настройки</NavItem>
            <NavItem to="/support" icon={MessageCircle} collapsed={collapsed} title="Поддержка">Поддержка</NavItem>
            <NavItem to="/broadcast" icon={Megaphone} collapsed={collapsed} title="Рассылка">Рассылка</NavItem>
            <NavItem to="/logs" icon={ScrollText} collapsed={collapsed} title="Логи">Логи</NavItem>
          </nav>
          <div className={['mt-auto flex flex-col border-t border-slate-200 gap-2 pt-2', collapsed ? 'items-center px-2 pb-3' : 'px-4 pb-4'].join(' ')}>
            {!collapsed && (
              <Button
                variant="secondary"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => {
                  authStore.clear();
                  navigate('/login');
                }}
              >
                <LogOut size={18} aria-hidden />
                Выйти
              </Button>
            )}
            {collapsed && (
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => {
                  authStore.clear();
                  navigate('/login');
                }}
                title="Выйти"
                aria-label="Выйти"
              >
                <LogOut size={20} aria-hidden />
              </button>
            )}
            <button
              type="button"
              className={['flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700', collapsed ? 'h-10 w-10' : 'h-9 w-full gap-2'].join(' ')}
              onClick={toggleSidebar}
              title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
              aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            >
              {collapsed ? <PanelLeft size={20} aria-hidden /> : <><PanelLeftClose size={18} aria-hidden /><span className="text-sm font-medium">Свернуть</span></>}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white md:hidden">
            <div className="flex items-center justify-between px-3 py-3">
              <div className="text-sm font-semibold tracking-tight text-slate-900">FreeRoam VPN</div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm"
                onClick={() => setMobileOpen(true)}
                aria-label="Открыть меню"
              >
                <span className="text-lg leading-none">≡</span>
              </button>
            </div>
          </header>

          {/* Mobile drawer */}
          {mobileOpen ? (
            <div className="fixed inset-0 z-50 md:hidden">
              <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
              <div className="absolute inset-y-0 left-0 w-[84%] max-w-xs bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-slate-900">FreeRoam VPN</div>
                    <div className="mt-1 text-xs text-slate-500">Внутренняя панель</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    onClick={() => setMobileOpen(false)}
                  >
                    Закрыть
                  </button>
                </div>
                <nav className="px-2 py-2">
                  <NavItem to="/" icon={LayoutDashboard} onClick={() => setMobileOpen(false)}>Главная</NavItem>
                  <NavItem to="/servers" icon={Server} onClick={() => setMobileOpen(false)}>Серверы</NavItem>
                  <NavItem to="/users" icon={Users} onClick={() => setMobileOpen(false)}>Пользователи</NavItem>
                  <NavItem to="/subscriptions" icon={CreditCard} onClick={() => setMobileOpen(false)}>Подписки</NavItem>
                  <NavItem to="/payments" icon={Wallet} onClick={() => setMobileOpen(false)}>Платежи</NavItem>
                  <NavItem to="/plans" icon={Package} onClick={() => setMobileOpen(false)}>Тарифы</NavItem>
                  <NavItem to="/settings" icon={Settings} onClick={() => setMobileOpen(false)}>Настройки</NavItem>
                  <NavItem to="/support" icon={MessageCircle} onClick={() => setMobileOpen(false)}>Поддержка</NavItem>
                  <NavItem to="/broadcast" icon={Megaphone} onClick={() => setMobileOpen(false)}>Рассылка</NavItem>
                  <NavItem to="/logs" icon={ScrollText} onClick={() => setMobileOpen(false)}>Логи</NavItem>
                </nav>
                <div className="mt-auto px-4 py-4 border-t border-slate-200">
                  <Button
                    variant="secondary"
                    className="w-full flex items-center justify-center gap-2"
                    onClick={() => {
                      authStore.clear();
                      navigate('/login');
                    }}
                  >
                    <LogOut size={18} aria-hidden />
                    Выйти
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <main className="flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  children,
  onClick,
  collapsed,
  title,
}: {
  to: string;
  icon?: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  children: ReactNode;
  onClick?: () => void;
  collapsed?: boolean;
  title?: string;
}) {
  return (
    <NavLink
      to={to}
      title={title}
      className={({ isActive }) =>
        [
          'flex items-center rounded-lg text-sm font-medium transition',
          collapsed ? 'justify-center p-2.5 w-10' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-slate-900 text-white shadow-sm'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')
      }
      onClick={onClick}
    >
      {Icon ? <Icon size={20} className="shrink-0" aria-hidden /> : null}
      {!collapsed ? <span className="truncate">{children}</span> : null}
    </NavLink>
  );
}

