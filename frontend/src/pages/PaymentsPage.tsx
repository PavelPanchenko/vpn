import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { type Payment, type PaymentStatus, type VpnUser, type Plan, type PaymentIntent } from '../lib/types';
import type { CurrencyCode } from '../lib/currencies';
import { CURRENCY_CODES } from '../lib/currencies';
import { pickExternalVariant } from '../lib/variantPicking';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { ResponsiveSwitch } from '../components/ResponsiveSwitch';

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

  const intentsQ = useQuery({
    queryKey: ['payment-intents'],
    queryFn: async () => (await api.get<PaymentIntent[]>('/payment-intents')).data,
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
    return pickExternalVariant(vars) ?? vars[0] ?? null;
  }, [selectedPlan, selectedVariantId]);

  // Автоматически заполняем сумму и валюту при выборе тарифа
  useEffect(() => {
    if (selectedPlan) {
      // при смене тарифа — выбираем дефолтный вариант
      const vars = selectedPlan.variants ?? [];
      const def = pickExternalVariant(vars) ?? vars[0] ?? null;
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
      toast.success('Платёж создан');
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
      toast.success('Платёж удалён');
      await qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete payment')),
  });

  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const intents = useMemo(() => intentsQ.data ?? [], [intentsQ.data]);

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
        title="Платежи"
        description="Управление платежами и подписками пользователей."
        actions={
          <IconButton
            icon="add"
            variant="primary"
            title="Создать платёж"
            onClick={() => {
              createForm.reset();
              setCreateOpen(true);
            }}
          />
        }
      />

      <Card title="Платежи">
        {paymentsQ.isLoading ? (
          <div className="text-sm text-slate-600">Загрузка…</div>
        ) : (
          <ResponsiveSwitch
            mobile={
              <div className="grid gap-3">
                {payments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {p.vpnUser?.name ?? p.vpnUser?.uuid ?? p.vpnUserId}
                        </div>
                        <div className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">{p.status}</div>
                        <div className="font-semibold">
                          {p.amount} {p.currency}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-slate-700">
                      {p.plan ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Тариф</span>
                          <span className="text-right">
                            {p.plan.name} · {p.plan.periodDays}d
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Тариф</span>
                          <span className="text-slate-400">Manual</span>
                        </div>
                      )}
                      {p.planPriceAtPurchase !== null && p.planPriceAtPurchase !== p.amount ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Цена тарифа на момент: {p.planPriceAtPurchase} {p.currency}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3">
                      <IconButton
                        icon="delete"
                        variant="danger"
                        title="Удалить"
                        onClick={() => {
                          if (confirm('Удалить этот платёж?')) removeM.mutate(p.id);
                        }}
                      />
                    </div>
                  </div>
                ))}

                {payments.length === 0 ? <div className="text-sm text-slate-500">Платежей нет</div> : null}
              </div>
            }
            desktop={
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">Пользователь</th>
                      <th className="py-2">Тариф</th>
                      <th className="py-2">Дата</th>
                      <th className="py-2">Сумма</th>
                      <th className="py-2">Валюта</th>
                      <th className="py-2">Статус</th>
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
                              Цена тарифа на момент: {p.planPriceAtPurchase} {p.currency}
                            </div>
                          )}
                        </td>
                        <td className="py-2">{p.currency}</td>
                        <td className="py-2">{p.status}</td>
                        <td className="py-2 text-right">
                          <IconButton
                            icon="delete"
                            variant="danger"
                            title="Delete"
                            onClick={() => {
                              if (confirm('Delete this payment?')) removeM.mutate(p.id);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                    {payments.length === 0 ? (
                      <tr>
                        <td className="py-3 text-slate-500" colSpan={7}>
                          Платежей нет
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            }
          />
        )}
      </Card>

      <Card title="Платежные намерения">
        {intentsQ.isLoading ? (
          <div className="text-sm text-slate-600">Загрузка…</div>
        ) : (
          <ResponsiveSwitch
            mobile={
              <div className="grid gap-3">
                {intents.map((it) => (
                  <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {it.vpnUser?.name ?? it.vpnUser?.uuid ?? it.vpnUserId}
                        </div>
                        <div className="text-xs text-slate-500">{new Date(it.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">{it.status}</div>
                        <div className="font-semibold">
                          {it.amount} {it.currency}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid gap-1 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Provider</span>
                        <span className="text-right">{it.provider}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">Тариф</span>
                        <span className="text-right">{it.plan?.name ?? it.planId}</span>
                      </div>
                      {it.expiresAt ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Expires</span>
                          <span className="text-right">{new Date(it.expiresAt).toLocaleString()}</span>
                        </div>
                      ) : null}
                      {it.externalId ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">External ID</span>
                          <span className="font-mono text-xs break-all text-right">{it.externalId}</span>
                        </div>
                      ) : null}
                    </div>

                    {it.checkoutUrl ? (
                      <div className="mt-3">
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => window.open(it.checkoutUrl!, '_blank', 'noopener,noreferrer')}
                        >
                          Открыть оплату
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {intents.length === 0 ? <div className="text-sm text-slate-500">Платежных намерений нет</div> : null}
              </div>
            }
            desktop={
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 w-[16%]">Пользователь</th>
                      <th className="py-2 w-[8%]">Тариф</th>
                      <th className="py-2 w-[13%]">Дата</th>
                      <th className="py-2 w-[7%]">Amount</th>
                      <th className="py-2 w-[7%]">Currency</th>
                      <th className="py-2 w-[12%]">Provider</th>
                      <th className="py-2 w-[10%]">Status</th>
                      <th className="py-2 w-[18%]">External ID</th>
                      <th className="py-2 w-[9%]"></th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-800">
                    {intents.map((it) => (
                      <tr key={it.id} className="border-t border-slate-100">
                        <td className="py-2 text-sm overflow-hidden text-ellipsis whitespace-nowrap" title={it.vpnUser?.uuid ?? it.vpnUserId}>
                          <div className="font-medium text-slate-900 truncate">{it.vpnUser?.name ?? it.vpnUser?.uuid ?? it.vpnUserId}</div>
                          <div className="font-mono text-xs text-slate-500 truncate">{it.vpnUser?.uuid ?? ''}</div>
                        </td>
                        <td className="py-2 truncate">{it.plan?.name ?? it.planId}</td>
                        <td className="py-2 truncate">{new Date(it.createdAt).toLocaleString()}</td>
                        <td className="py-2">{it.amount}</td>
                        <td className="py-2">{it.currency}</td>
                        <td className="py-2 truncate">{it.provider}</td>
                        <td className="py-2 truncate">{it.status}</td>
                        <td className="py-2 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap" title={it.externalId ?? undefined}>
                          {it.externalId ?? ''}
                        </td>
                        <td className="py-2 text-right">
                          {it.checkoutUrl ? (
                            <Button variant="secondary" onClick={() => window.open(it.checkoutUrl!, '_blank', 'noopener,noreferrer')}>
                              Открыть
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {intents.length === 0 ? (
                      <tr>
                        <td className="py-3 text-slate-500" colSpan={9}>
                          Платежных намерений нет
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            }
          />
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
              Отмена
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
                  {u.name} ({u.status}) — {u.uuid}
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
              <option value="">Manual payment (no plan)</option>
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatPlanVariantsShort(p)} ({p.periodDays} дн.)
                </option>
              ))}
            </select>
            {selectedPlan && (
              <div className="mt-1 text-xs text-slate-500">
                {selectedPlan.description || `Доступ на ${selectedPlan.periodDays} дн.`}
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
              <option value="PENDING">PENDING</option>
              <option value="PAID">PAID</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELED">CANCELED</option>
              <option value="CHARGEBACK">CHARGEBACK</option>
            </select>
            {selectedPlan && createForm.watch('status') === 'PAID' && (
              <div className="mt-1 text-xs text-green-600">
                Подписка будет создана автоматически при статусе оплаты PAID
              </div>
            )}
          </label>
        </form>
      </Modal>
    </div>
  );
}

