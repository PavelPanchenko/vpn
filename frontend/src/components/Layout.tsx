import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { authStore } from '../lib/authStore';

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="px-4 py-4">
            <div className="text-sm font-semibold tracking-tight text-slate-900">VLESS Admin</div>
            <div className="mt-1 text-xs text-slate-500">Internal dashboard</div>
          </div>
          <nav className="flex-1 px-2 pb-4">
            <NavItem to="/">Dashboard</NavItem>
            <NavItem to="/servers">Servers</NavItem>
            <NavItem to="/users">Users</NavItem>
            <NavItem to="/subscriptions">Subscriptions</NavItem>
            <NavItem to="/payments">Payments</NavItem>
            <NavItem to="/plans">Plans</NavItem>
            <NavItem to="/bot">Bot</NavItem>
            <NavItem to="/support">Support</NavItem>
          </nav>
          <div className="mt-auto px-4 pb-4">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                authStore.clear();
                navigate('/login');
              }}
            >
              Logout
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-semibold tracking-tight text-slate-900">VLESS Admin</div>
              <Button
                variant="secondary"
                onClick={() => {
                  authStore.clear();
                  navigate('/login');
                }}
              >
                Logout
              </Button>
            </div>
            <div className="flex gap-2 overflow-x-auto px-2 pb-3">
              <NavItem to="/">Dashboard</NavItem>
              <NavItem to="/servers">Servers</NavItem>
              <NavItem to="/users">Users</NavItem>
              <NavItem to="/subscriptions">Subscriptions</NavItem>
              <NavItem to="/payments">Payments</NavItem>
              <NavItem to="/plans">Plans</NavItem>
              <NavItem to="/bot">Bot</NavItem>
              <NavItem to="/support">Support</NavItem>
            </div>
          </header>

          <main className="flex-1 px-4 py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'block rounded-lg px-3 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-slate-900 text-white shadow-sm'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}

