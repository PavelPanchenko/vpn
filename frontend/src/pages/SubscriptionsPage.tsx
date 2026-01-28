import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { type Subscription, type VpnUser, type Plan } from '../lib/types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';

type CreateSubscriptionForm = {
  vpnUserId: string;
  periodDays: number;
  planId: string;
};

export function SubscriptionsPage() {
  const qc = useQueryClient();
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
    queryFn: async () => (await api.get<VpnUser[]>('/users')).data,
  });

  const subsQ = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => (await api.get<any[]>('/subscriptions')).data,
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
      toast.success('Subscription created');
      setCreateOpen(false);
      createForm.reset();
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to create subscription'),
  });

  const removeM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/subscriptions/${id}`)).data,
    onSuccess: async () => {
      toast.success('Subscription deleted');
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to delete subscription'),
  });

  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const subs = useMemo(() => subsQ.data ?? [], [subsQ.data]);

  const filteredSubs = useMemo(
    () =>
      subs.filter((s: any) => {
        if (userFilter !== 'ALL' && s.vpnUserId !== userFilter) return false;
        if (activeFilter === 'ACTIVE' && !s.active) return false;
        if (activeFilter === 'INACTIVE' && s.active) return false;
        return true;
      }),
    [subs, userFilter, activeFilter],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Subscriptions"
        description="Управление подписками пользователей."
        actions={
          <>
            <Button variant="secondary" onClick={() => subsQ.refetch()}>
              Refresh
            </Button>
            <Button
              onClick={() => {
                createForm.reset();
                setCreateOpen(true);
              }}
            >
              Create subscription
            </Button>
          </>
        }
      />

      <Card title="Subscriptions">
        {subsQ.isLoading ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
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
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              >
                <option value="ALL">All</option>
                <option value="ACTIVE">Active only</option>
                <option value="INACTIVE">Inactive only</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">User</th>
                  <th className="py-2">Starts</th>
                  <th className="py-2">Ends</th>
                  <th className="py-2">Days</th>
                  <th className="py-2">Active</th>
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
                        <Button
                          variant="danger"
                          onClick={() => {
                            if (confirm('Delete this subscription?')) {
                              removeM.mutate(s.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredSubs.length === 0 ? (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>
                        No subscriptions
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
              Cancel
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
              Create
            </Button>
          </div>
        }
      >
        <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <label className="block">
            <div className="text-sm font-medium text-slate-700">User *</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('vpnUserId', { required: true })}
            >
              <option value="" disabled>
                Select user…
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.telegramId ?? '-'}) — {u.uuid}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Plan (optional)</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('planId')}
            >
              <option value="">Без плана (кастомные дни)</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.periodDays} дн., {p.price} {p.currency}
                </option>
              ))}
            </select>
            {selectedPlan && (
              <div className="mt-1 text-xs text-slate-500">
                {selectedPlan.description || `${selectedPlan.periodDays} days access`}
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

