import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { Badge, statusBadgeVariant } from '../components/Badge';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type ChartPoint = { date: string; count: number };

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
    botBlocked: number;
    today: number;
    week: number;
    month: number;
  };
  subscriptions: {
    active: number;
  };
  payments: {
    total: number;
    today: number;
    week: number;
    month: number;
  };
  revenue: {
    total: Record<string, number>;
    today: Record<string, number>;
    week: Record<string, number>;
    month: Record<string, number>;
  };
  charts: {
    users: ChartPoint[];
    payments: ChartPoint[];
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
      status: 'NEW' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
      createdAt: string;
    }>;
  };
};

function formatMoney(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '—';
  const c = String(currency || '').toUpperCase();
  if (c === 'XTR') return `${amount} ⭐`;
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: c || 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${c || 'RUB'}`;
  }
}

function revenueEntries(byCurrency: Record<string, number> | null | undefined) {
  const entries = Object.entries(byCurrency ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v !== 0);
  const weight = (c: string) => (c.toUpperCase() === 'RUB' ? 0 : c.toUpperCase() === 'XTR' ? 1 : 2);
  return entries.sort(([a], [b]) => weight(a) - weight(b) || a.localeCompare(b));
}

function currencyChipClass(currency: string) {
  const c = String(currency || '').toUpperCase();
  if (c === 'RUB')
    return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (c === 'XTR')
    return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-slate-200 bg-slate-50 text-slate-900';
}

function RevenueChips({ byCurrency }: { byCurrency: Record<string, number> | null | undefined }) {
  const entries = revenueEntries(byCurrency);
  if (entries.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([currency, amount]) => {
        const c = String(currency || '').toUpperCase();
        const label = c === 'XTR' ? 'STARS' : c;
        return (
          <span
            key={currency}
            className={[
              'inline-flex items-center gap-2 rounded-full border px-3 py-1',
              'text-sm leading-none',
              currencyChipClass(c),
            ].join(' ')}
          >
            <span className="font-semibold">{formatMoney(amount, c)}</span>
            <span className="text-[11px] opacity-70">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Форматирует дату для оси X графика: "08.02" */
function formatChartDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}.${m}`;
}

/** Mini stat row: label + value */
function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function StatsChart({
  data,
  color,
  gradientId,
}: {
  data: ChartPoint[];
  color: string;
  gradientId: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tickFormatter={formatChartDate}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={{ stroke: '#e2e8f0' }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={40}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          labelFormatter={(label) => {
            const [y, m, d] = String(label).split('-');
            return `${d}.${m}.${y}`;
          }}
          formatter={(value) => [value ?? 0, 'Кол-во']}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            fontSize: '13px',
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DashboardPage() {
  const statsQ = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await api.get<DashboardStats>('/dashboard/stats')).data,
    refetchInterval: 30000,
  });

  const stats = statsQ.data;
  const revenue = stats?.revenue ?? null;

  const chartsData = useMemo(() => stats?.charts ?? null, [stats]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Главная"
        description="Общая статистика и мониторинг системы VPN"
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
                <div className="text-2xl font-bold text-slate-900 sm:text-3xl">{stats.servers.total}</div>
                <div className="text-sm text-slate-500">
                  {stats.servers.active} активных
                </div>
              </div>
            </Card>

            <Card title="Пользователи">
              <div className="space-y-2">
                <div className="text-2xl font-bold text-slate-900 sm:text-3xl">{stats.users.total}</div>
                <div className="space-y-1">
                  <StatRow label="Сегодня" value={stats.users.today} />
                  <StatRow label="Неделя" value={stats.users.week} />
                  <StatRow label="Месяц" value={stats.users.month} />
                </div>
                <div className="text-xs text-slate-400 pt-1">
                  {stats.users.active} активных · {stats.users.blocked} заблок. · {stats.users.expired} истёк.
                </div>
                <StatRow label="Заблокировали бота" value={stats.users.botBlocked ?? 0} />
              </div>
            </Card>

            <Card title="Подписки">
              <div className="space-y-1">
                <div className="text-2xl font-bold text-slate-900 sm:text-3xl">{stats.subscriptions.active}</div>
                <div className="text-sm text-slate-500">Активных подписок</div>
              </div>
            </Card>

            <Card title="Платежи">
              <div className="space-y-2">
                <div className="text-2xl font-bold text-slate-900 sm:text-3xl">{stats.payments.total}</div>
                <div className="space-y-1">
                  <StatRow label="Сегодня" value={stats.payments.today} />
                  <StatRow label="Неделя" value={stats.payments.week} />
                  <StatRow label="Месяц" value={stats.payments.month} />
                </div>
              </div>
            </Card>
          </div>

          {/* Доходы */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card title="Доход (всего)">
              <div className="text-xl font-bold sm:text-2xl">
                <RevenueChips byCurrency={revenue?.total} />
              </div>
            </Card>
            <Card title="Доход (сегодня)">
              <div className="text-xl font-bold sm:text-2xl">
                <RevenueChips byCurrency={revenue?.today} />
              </div>
            </Card>
            <Card title="Доход (неделя)">
              <div className="text-xl font-bold sm:text-2xl">
                <RevenueChips byCurrency={revenue?.week} />
              </div>
            </Card>
            <Card title="Доход (месяц)">
              <div className="text-xl font-bold sm:text-2xl">
                <RevenueChips byCurrency={revenue?.month} />
              </div>
            </Card>
          </div>

          {/* Графики */}
          {chartsData && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Новые пользователи (30 дней)">
                <StatsChart
                  data={chartsData.users}
                  color="#3b82f6"
                  gradientId="usersGradient"
                />
              </Card>
              <Card title="Оплаты (30 дней)">
                <StatsChart
                  data={chartsData.payments}
                  color="#10b981"
                  gradientId="paymentsGradient"
                />
              </Card>
            </div>
          )}

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
                          {p.plan?.name || 'Вручную'} • {new Date(p.createdAt).toLocaleString('ru-RU')}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-green-600">
                        {formatMoney(p.amount, p.currency)}
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
