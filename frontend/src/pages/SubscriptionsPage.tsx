import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { type Subscription, type VpnUser, type Plan } from '../lib/types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { ResponsiveSwitch } from '../components/ResponsiveSwitch';

type CreateSubscriptionForm = {
  vpnUserId: string;
  periodDays: number;
  planId: string;
};

export function SubscriptionsPage() {
  const qc = useQueryClient();
  const PAGE_SIZE = 50;
  const [createOpen, setCreateOpen] = useState(false);
  const [userFilter, setUserFilter] = useState<string>('ALL');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');

  const createForm = useForm<CreateSubscriptionForm>({
    defaultValues: {
      vpnUserId: '',
      periodDays: 30,
      planId: '',
    },
  });

  const usersQ = useQuery({
    queryKey: ['users'],
    // Для выпадашки берём расширенный лимит (не для таблицы).
    queryFn: async () => (await api.get<VpnUser[]>('/users', { params: { limit: 1000, offset: 0 } })).data,
  });

  const subsQ = useInfiniteQuery({
    queryKey: ['subscriptions', { userFilter, activeFilter }],
    queryFn: async ({ pageParam }) =>
      (await api.get<any[]>('/subscriptions', {
        params: {
          offset: Number(pageParam ?? 0),
          limit: PAGE_SIZE,
          vpnUserId: userFilter !== 'ALL' ? userFilter : undefined,
          active:
            activeFilter === 'ACTIVE' ? 'true' : activeFilter === 'INACTIVE' ? 'false' : undefined,
        },
      })).data,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => (lastPage.length >= PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined),
  });

  // Для формы создания подписки используем выбранного пользователя
  const formUserId = createForm.watch('vpnUserId');
  const plansQ = useQuery({
    queryKey: ['plans', formUserId || selectedUserId],
    queryFn: async () => {
      const userId = formUserId || (selectedUserId !== 'ALL' ? selectedUserId : undefined);
      const url = userId ? `/plans?userId=${userId}` : '/plans';
      return (await api.get<Plan[]>(url)).data;
    },
    enabled: true,
  });

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);

  const selectedPlanId = createForm.watch('planId');
  const selectedPlan = useMemo(() => {
    return plans.find((p) => p.id === selectedPlanId);
  }, [plans, selectedPlanId]);

  // Автоматически заполняем periodDays при выборе тарифа
  useEffect(() => {
    if (selectedPlan) {
      createForm.setValue('periodDays', selectedPlan.periodDays);
    }
  }, [selectedPlan, createForm]);

  const createM = useMutation({
    mutationFn: async (payload: { vpnUserId: string; periodDays?: number; planId?: string }) =>
      (await api.post<Subscription>('/subscriptions', payload)).data,
    onSuccess: async () => {
      toast.success('Подписка создана');
      setCreateOpen(false);
      createForm.reset();
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to create subscription')),
  });

  const removeM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/subscriptions/${id}`)).data,
    onSuccess: async () => {
      toast.success('Подписка удалена');
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete subscription')),
  });

  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const subs = useMemo(() => subsQ.data?.pages.flatMap((p) => p) ?? [], [subsQ.data]);

  const filteredSubs = subs;

  function formatPlanVariantsShort(plan: Plan) {
    const vars = (plan as any).variants ?? [];
    if (!Array.isArray(vars) || vars.length === 0) return '—';
    return vars
      .slice()
      .filter((v: any) => v && typeof v.price === 'number' && typeof v.currency === 'string')
      .sort((a: any, b: any) => a.price - b.price)
      .map((v: any) => `${v.price} ${v.currency}`)
      .join(' | ');
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Подписки"
        description="Управление подписками пользователей."
        actions={
          <IconButton
            icon="add"
            variant="primary"
            title="Создать подписку"
            onClick={() => {
              createForm.reset();
              setCreateOpen(true);
            }}
          />
        }
      />

      <Card title="Подписки">
        {subsQ.isLoading ? (
          <div className="text-sm text-slate-600">Загрузка…</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={userFilter}
                onChange={(e) => {
                  setUserFilter(e.target.value);
                  setSelectedUserId(e.target.value);
                }}
              >
                <option value="ALL">All users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.telegramId ? `(${u.telegramId})` : ''}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              >
                <option value="ALL">All</option>
                <option value="ACTIVE">Только активные</option>
                <option value="INACTIVE">Inactive only</option>
              </select>
            </div>

            <ResponsiveSwitch
              mobile={
                <div className="grid gap-3">
                  {filteredSubs.map((s: any) => (
                    <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {s.vpnUser?.name ?? s.vpnUser?.telegramId ?? s.vpnUserId}
                          </div>
                          <div className="font-mono text-xs text-slate-500">{s.vpnUser?.telegramId ?? '—'}</div>
                        </div>
                        <div className="text-right text-xs text-slate-600">
                          <div>{s.active ? 'ACTIVE' : 'INACTIVE'}</div>
                          <div className="font-semibold text-slate-900">{s.periodDays}d</div>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-1 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Начало</span>
                          <span className="text-right">{new Date(s.startsAt).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Конец</span>
                          <span className="text-right">{new Date(s.endsAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <IconButton
                          icon="delete"
                          variant="danger"
                          title="Удалить"
                          onClick={() => {
                            if (confirm('Удалить эту подписку?')) removeM.mutate(s.id);
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {filteredSubs.length === 0 ? <div className="text-sm text-slate-500">Подписок нет</div> : null}
                </div>
              }
              desktop={
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2">Пользователь</th>
                        <th className="py-2">Начало</th>
                        <th className="py-2">Конец</th>
                        <th className="py-2">Дней</th>
                        <th className="py-2">Активна</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-800">
                      {filteredSubs.map((s: any) => (
                        <tr key={s.id} className="border-t border-slate-100">
                          <td className="py-2 text-sm">
                            <div className="font-medium text-slate-900">
                              {s.vpnUser?.name ?? s.vpnUser?.telegramId ?? s.vpnUserId}
                            </div>
                            <div className="font-mono text-xs text-slate-500">{s.vpnUser?.telegramId ?? '-'}</div>
                          </td>
                          <td className="py-2">{new Date(s.startsAt).toLocaleString()}</td>
                          <td className="py-2">{new Date(s.endsAt).toLocaleString()}</td>
                          <td className="py-2">{s.periodDays}</td>
                          <td className="py-2">{s.active ? 'yes' : 'no'}</td>
                          <td className="py-2 text-right">
                            <IconButton
                              icon="delete"
                              variant="danger"
                              title="Удалить"
                              onClick={() => {
                                if (confirm('Удалить эту подписку?')) removeM.mutate(s.id);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                      {filteredSubs.length === 0 ? (
                        <tr>
                          <td className="py-3 text-slate-500" colSpan={6}>
                            Подписок нет
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              }
            />

            {subsQ.hasNextPage ? (
              <div className="flex justify-center pt-3">
                <Button variant="secondary" disabled={subsQ.isFetchingNextPage} onClick={() => subsQ.fetchNextPage()}>
                  {subsQ.isFetchingNextPage ? 'Загрузка…' : 'Ещё'}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Create subscription"
        onClose={() => {
          setCreateOpen(false);
          createForm.reset();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={createM.isPending || !createForm.watch('vpnUserId')}
              onClick={createForm.handleSubmit((data) => {
                createM.mutate({
                  vpnUserId: data.vpnUserId,
                  planId: data.planId || undefined,
                  periodDays: data.planId ? undefined : data.periodDays,
                });
              })}
            >
              Создать
            </Button>
          </div>
        }
      >
        <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Пользователь *</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('vpnUserId', { required: true })}
            >
              <option value="" disabled>
                Выберите пользователя…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.telegramId ?? '-'}) — {u.uuid}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Тариф (необязательно)</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('planId')}
            >
              <option value="">Без плана (кастомные дни)</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.periodDays} дн., {formatPlanVariantsShort(p)}
                </option>
              ))}
            </select>
            {selectedPlan && (
              <div className="mt-1 text-xs text-slate-500">
                {selectedPlan.description || `Доступ на ${selectedPlan.periodDays} дн.`}
              </div>
            )}
          </label>

          <Input
            label="Period days *"
            type="number"
            {...createForm.register('periodDays', { required: true, min: 1, max: 3650, valueAsNumber: true })}
            disabled={!!selectedPlan}
            hint={selectedPlan ? 'Берётся из выбранного плана' : undefined}
          />

          <div className="text-xs text-slate-500">
            При создании активной подписки предыдущие активные подписки пользователя деактивируются, а `expiresAt`
            синхронизируется.
          </div>
        </form>
      </Modal>
    </div>
  );
}

