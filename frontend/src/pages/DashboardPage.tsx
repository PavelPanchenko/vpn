import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { Badge, statusBadgeVariant } from '../components/Badge';
import { Link } from 'react-router-dom';

type DashboardStats = {
  servers: {
    total: number;
    active: number;
  };
  users: {
    total: number;
    active: number;
    blocked: number;
    expired: number;
  };
  subscriptions: {
    active: number;
  };
  payments: {
    total: number;
    today: number;
    month: number;
  };
  revenue: {
    total: number;
    today: number;
    month: number;
  };
  recent: {
    payments: Array<{
      id: string;
      amount: number;
      currency: string;
      createdAt: string;
      vpnUser: { name: string; uuid: string };
      plan: { name: string } | null;
    }>;
    users: Array<{
      id: string;
      name: string;
      uuid: string;
      status: 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
      createdAt: string;
    }>;
  };
};

function formatCurrency(amount: number, currency: string = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function DashboardPage() {
  const statsQ = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await api.get<DashboardStats>('/dashboard/stats')).data,
    refetchInterval: 30000, // Обновляем каждые 30 секунд
  });

  const stats = statsQ.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dashboard"
        description="Общая статистика и мониторинг системы VPN"
        actions={
          <button
            onClick={() => statsQ.refetch()}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Обновить
          </button>
        }
      />

      {statsQ.isLoading ? (
        <div className="text-sm text-slate-600">Загрузка...</div>
      ) : !stats ? (
        <div className="text-sm text-slate-600">Ошибка загрузки данных</div>
      ) : (
        <>
          {/* Основная статистика */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card title="Серверы">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-slate-900">{stats.servers.total}</div>
                <div className="text-sm text-slate-500">
                  {stats.servers.active} активных
                </div>
              </div>
            </Card>

            <Card title="Пользователи">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-slate-900">{stats.users.total}</div>
                <div className="text-sm text-slate-500">
                  {stats.users.active} активных, {stats.users.blocked} заблокированных, {stats.users.expired} истекших
                </div>
              </div>
            </Card>

            <Card title="Подписки">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-slate-900">{stats.subscriptions.active}</div>
                <div className="text-sm text-slate-500">Активных подписок</div>
              </div>
            </Card>

            <Card title="Платежи">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-slate-900">{stats.payments.total}</div>
                <div className="text-sm text-slate-500">
                  {stats.payments.today} сегодня, {stats.payments.month} за месяц
                </div>
              </div>
            </Card>
          </div>

          {/* Доходы */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Доход (всего)">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.revenue.total)}
              </div>
            </Card>
            <Card title="Доход (сегодня)">
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(stats.revenue.today)}
              </div>
            </Card>
            <Card title="Доход (месяц)">
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(stats.revenue.month)}
              </div>
            </Card>
          </div>

          {/* Недавние данные */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Недавние платежи">
              {stats.recent.payments.length === 0 ? (
                <div className="text-sm text-slate-500">Нет платежей</div>
              ) : (
                <div className="space-y-2">
                  {stats.recent.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">
                          {p.vpnUser.name || p.vpnUser.uuid}
                        </div>
                        <div className="text-xs text-slate-500">
                          {p.plan?.name || 'Manual'} • {new Date(p.createdAt).toLocaleString('ru-RU')}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-green-600">
                        {formatCurrency(p.amount, p.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Недавние пользователи">
              {stats.recent.users.length === 0 ? (
                <div className="text-sm text-slate-500">Нет пользователей</div>
              ) : (
                <div className="space-y-2">
                  {stats.recent.users.map((u) => (
                    <Link
                      key={u.id}
                      to={`/users/${u.id}`}
                      className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 transition-colors hover:bg-slate-50 -mx-3 px-3 py-1 rounded"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">
                          {u.name || u.uuid}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(u.createdAt).toLocaleString('ru-RU')}
                        </div>
                      </div>
                      <Badge variant={statusBadgeVariant(u.status)}>{u.status}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

