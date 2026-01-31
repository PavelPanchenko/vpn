import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { type Payment, type PaymentStatus, type VpnUser, type Plan } from '../lib/types';
import type { CurrencyCode } from '../lib/currencies';
import { CURRENCY_CODES } from '../lib/currencies';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';

type CreatePaymentPayload = {
  vpnUserId: string;
  planId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
};

type CreatePaymentForm = {
  vpnUserId: string;
  planId: string;
  variantId: string;
  amount: number;
  currency: CurrencyCode;
  status: PaymentStatus;
};

export function PaymentsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const createForm = useForm<CreatePaymentForm>({
    defaultValues: {
      vpnUserId: '',
      planId: '',
      variantId: '',
      amount: 0,
      currency: 'RUB',
      status: 'PAID',
    },
  });

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<VpnUser[]>('/users')).data,
  });

  const selectedUserId = createForm.watch('vpnUserId');
  const plansQ = useQuery({
    queryKey: ['plans', selectedUserId],
    queryFn: async () => {
      const url = selectedUserId ? `/plans?userId=${selectedUserId}` : '/plans';
      return (await api.get<Plan[]>(url)).data;
    },
    enabled: true, // Загружаем всегда, но фильтруем по userId если выбран
  });

  const paymentsQ = useQuery({
    queryKey: ['payments'],
    queryFn: async () => (await api.get<Payment[]>('/payments')).data,
  });

  // Фильтруем только активные платные тарифы
  const availablePlans = useMemo(() => {
    return (plansQ.data ?? []).filter((p) => p.active && !p.isTrial);
  }, [plansQ.data]);

  const selectedPlanId = createForm.watch('planId');
  const selectedPlan = useMemo(() => {
    return availablePlans.find((p) => p.id === selectedPlanId);
  }, [availablePlans, selectedPlanId]);

  const selectedVariantId = createForm.watch('variantId');
  const selectedVariant = useMemo(() => {
    const vars = selectedPlan?.variants ?? [];
    if (!selectedPlan) return null;
    const byId = vars.find((v) => v.id === selectedVariantId) ?? null;
    if (byId) return byId;
    const rub = vars.find((v) => v.currency === 'RUB') ?? null;
    const nonXtr = vars.find((v) => v.currency !== 'XTR') ?? null;
    return rub ?? nonXtr ?? vars[0] ?? null;
  }, [selectedPlan, selectedVariantId]);

  // Автоматически заполняем сумму и валюту при выборе тарифа
  useEffect(() => {
    if (selectedPlan) {
      // при смене тарифа — выбираем дефолтный вариант
      const vars = selectedPlan.variants ?? [];
      const rub = vars.find((v) => v.currency === 'RUB') ?? null;
      const nonXtr = vars.find((v) => v.currency !== 'XTR') ?? null;
      const def = rub ?? nonXtr ?? vars[0] ?? null;
      createForm.setValue('variantId', def?.id ?? '');
      if (def) {
        createForm.setValue('amount', def.price);
        createForm.setValue('currency', def.currency as CurrencyCode);
      }
    }
  }, [selectedPlan, createForm]);

  useEffect(() => {
    if (selectedVariant) {
      createForm.setValue('amount', selectedVariant.price);
      createForm.setValue('currency', selectedVariant.currency as CurrencyCode);
    }
  }, [selectedVariant, createForm]);

  const createM = useMutation({
    mutationFn: async (payload: CreatePaymentPayload) => (await api.post<Payment>('/payments', payload)).data,
    onSuccess: async () => {
      toast.success('Payment created');
      setCreateOpen(false);
      createForm.reset();
      await qc.invalidateQueries({ queryKey: ['payments'] });
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      await qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to create payment')),
  });

  const removeM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/payments/${id}`)).data,
    onSuccess: async () => {
      toast.success('Payment deleted');
      await qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete payment')),
  });

  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);

  function formatPlanVariantsShort(plan: Plan) {
    const vars = plan.variants ?? [];
    if (vars.length === 0) return '—';
    return vars
      .slice()
      .sort((a, b) => a.price - b.price)
      .map((v) => `${v.price} ${v.currency}`)
      .join(' | ');
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Payments"
        description="Управление платежами и подписками пользователей."
        actions={
          <Button
            onClick={() => {
              createForm.reset();
              setCreateOpen(true);
            }}
          >
            Create payment
          </Button>
        }
      />

      <Card title="Payments" right={<Button variant="secondary" onClick={() => paymentsQ.refetch()}>Refresh</Button>}>
        {paymentsQ.isLoading ? (
          <div className="text-sm text-slate-600">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">User</th>
                  <th className="py-2">Plan</th>
                  <th className="py-2">Created</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Currency</th>
                  <th className="py-2">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 text-sm">
                      <div className="font-medium text-slate-900">{p.vpnUser?.name ?? p.vpnUser?.uuid ?? p.vpnUserId}</div>
                      <div className="font-mono text-xs text-slate-500">{p.vpnUser?.uuid ?? ''}</div>
                    </td>
                    <td className="py-2">
                      {p.plan ? (
                        <div>
                          <div className="font-medium text-slate-900">{p.plan.name}</div>
                          <div className="text-xs text-slate-500">{p.plan.periodDays} days</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Manual</span>
                      )}
                    </td>
                    <td className="py-2">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="py-2">
                      <div className="font-medium">{p.amount} {p.currency}</div>
                      {p.planPriceAtPurchase !== null && p.planPriceAtPurchase !== p.amount && (
                        <div className="text-xs text-slate-500">
                          Plan price was: {p.planPriceAtPurchase} {p.currency}
                        </div>
                      )}
                    </td>
                    <td className="py-2">{p.currency}</td>
                    <td className="py-2">{p.status}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (confirm('Delete this payment?')) {
                            removeM.mutate(p.id);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={7}>
                      No payments
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={createOpen}
        title="Create payment"
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
              disabled={createM.isPending || !createForm.watch('vpnUserId') || createForm.watch('amount') <= 0}
              onClick={createForm.handleSubmit((data) => {
                createM.mutate({
                  vpnUserId: data.vpnUserId,
                  planId: data.planId || undefined,
                  amount: data.amount,
                  currency: data.currency,
                  status: data.status,
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
                  {u.name} ({u.status}) — {u.uuid}
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
              <option value="">Manual payment (no plan)</option>
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatPlanVariantsShort(p)} ({p.periodDays} days)
                </option>
              ))}
            </select>
            {selectedPlan && (
              <div className="mt-1 text-xs text-slate-500">
                {selectedPlan.description || `${selectedPlan.periodDays} days access`}
              </div>
            )}
          </label>

          {selectedPlan && (selectedPlan.variants ?? []).length > 0 ? (
            <label className="block">
              <div className="text-sm font-medium text-slate-700">Variant (for autofill)</div>
              <select
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                {...createForm.register('variantId')}
              >
                {(selectedPlan.variants ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.currency} — {v.price} ({v.provider}) {v.active ? '' : ' (INACTIVE)'}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-slate-500">Используется только для автозаполнения суммы/валюты.</div>
            </label>
          ) : null}

          <Input
            label="Amount *"
            type="number"
            {...createForm.register('amount', { required: true, min: 1, valueAsNumber: true })}
            hint={
              selectedVariant
                ? `Текущий вариант: ${selectedVariant.currency} ${selectedVariant.price}. Можно изменить вручную.`
                : undefined
            }
          />

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Currency *</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('currency', { required: true })}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {selectedPlan && (
              <div className="mt-1 text-xs text-slate-500">Currency is set from selected plan (can be changed for existing clients)</div>
            )}
          </label>

          <label className="block">
            <div className="text-sm font-medium text-slate-700">Status *</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('status', { required: true })}
            >
              <option value="PAID">PAID</option>
              <option value="FAILED">FAILED</option>
            </select>
            {selectedPlan && createForm.watch('status') === 'PAID' && (
              <div className="mt-1 text-xs text-green-600">
                Subscription will be automatically created when payment is PAID
              </div>
            )}
          </label>
        </form>
      </Modal>
    </div>
  );
}

