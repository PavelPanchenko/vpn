import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { authStore } from '../lib/authStore';

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
          <div className="px-4 py-4">
            <div className="text-sm font-semibold tracking-tight text-slate-900">FreeRoam VPN</div>
            <div className="mt-1 text-xs text-slate-500">Internal dashboard</div>
          </div>
          <nav className="flex-1 px-2 pb-4">
            <NavItem to="/">Dashboard</NavItem>
            <NavItem to="/servers">Servers</NavItem>
            <NavItem to="/users">Users</NavItem>
            <NavItem to="/subscriptions">Subscriptions</NavItem>
            <NavItem to="/payments">Payments</NavItem>
            <NavItem to="/plans">Plans</NavItem>
            <NavItem to="/settings">Settings</NavItem>
            <NavItem to="/support">Support</NavItem>
            <NavItem to="/broadcast">Broadcast</NavItem>
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
            <div className="flex items-center justify-between px-3 py-3">
              <div className="text-sm font-semibold tracking-tight text-slate-900">FreeRoam VPN</div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm"
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
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
                    <div className="mt-1 text-xs text-slate-500">Internal dashboard</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    onClick={() => setMobileOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <nav className="px-2 py-2">
                  <NavItem to="/" onClick={() => setMobileOpen(false)}>Dashboard</NavItem>
                  <NavItem to="/servers" onClick={() => setMobileOpen(false)}>Servers</NavItem>
                  <NavItem to="/users" onClick={() => setMobileOpen(false)}>Users</NavItem>
                  <NavItem to="/subscriptions" onClick={() => setMobileOpen(false)}>Subscriptions</NavItem>
                  <NavItem to="/payments" onClick={() => setMobileOpen(false)}>Payments</NavItem>
                  <NavItem to="/plans" onClick={() => setMobileOpen(false)}>Plans</NavItem>
                  <NavItem to="/settings" onClick={() => setMobileOpen(false)}>Settings</NavItem>
                  <NavItem to="/support" onClick={() => setMobileOpen(false)}>Support</NavItem>
                  <NavItem to="/broadcast" onClick={() => setMobileOpen(false)}>Broadcast</NavItem>
                </nav>
                <div className="mt-auto px-4 py-4 border-t border-slate-200">
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
              </div>
            </div>
          ) : null}

          <main className="flex-1 px-3 py-4 sm:px-4 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

function NavItem({ to, children, onClick }: { to: string; children: ReactNode; onClick?: () => void }) {
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
      onClick={onClick}
    >
      {children}
    </NavLink>
  );
}

