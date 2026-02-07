import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Table, Td, Th } from '../components/Table';
import { Badge } from '../components/Badge';
import { CURRENCY_CODES } from '../lib/currencies';
import { formatPrice } from '../lib/formatters';
import { ResponsiveSwitch } from '../components/ResponsiveSwitch';

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string;
  periodDays: number;
  isTrial: boolean;
  active: boolean;
  availableFor: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
  isTop: boolean;
  variants?: Array<{
    id: string;
    planId: string;
    code: string;
    currency: string;
    price: number;
    provider: string;
    active: boolean;
  }>;
};

type CreatePlanForm = {
  code: string;
  name: string;
  description?: string;
  periodDays: number;
  isTrial: boolean;
  active: boolean;
  availableFor?: 'ALL' | 'NEW_USERS' | 'EXISTING_USERS';
  isTop?: boolean;
  variants: Array<{
    currency: string;
    price: number;
    provider?: string;
    active?: boolean;
  }>;
};

type PlanVariant = NonNullable<Plan['variants']>[number];

function defaultVariantCode(planCode: string, currency: string) {
  const c = currency.toUpperCase();
  if (c === 'XTR') return `${planCode}_stars`;
  return `${planCode}_${c.toLowerCase()}`;
}

function defaultProviderForCurrency(currency: string) {
  const c = currency.toUpperCase();
  if (c === 'XTR') return 'TELEGRAM_STARS';
  if (c === 'USD' || c === 'UAH' || c === 'EUR') return 'CRYPTOCLOUD';
  return 'PLATEGA';
}

function formatVariantsPrice(variants: Plan['variants'] | undefined) {
  const v = variants ?? [];
  if (v.length === 0) return '—';
  return v
    .slice()
    .sort((a, b) => a.price - b.price)
    .map((x) => formatPrice(x.price, x.currency))
    .join(' | ');
}

function shortProvider(provider: string) {
  if (provider === 'TELEGRAM_STARS') return 'STARS';
  if (provider === 'PLATEGA') return 'CARD';
  if (provider === 'CRYPTOCLOUD') return 'CRYPTO';
  return provider;
}

function renderVariantsInline(variants: Plan['variants'] | undefined) {
  const v = (variants ?? []).slice().sort((a, b) => {
    const ax = a.currency === 'XTR';
    const bx = b.currency === 'XTR';
    if (ax !== bx) return ax ? 1 : -1;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return a.price - b.price;
  });

  if (v.length === 0) return <span className="text-slate-400">—</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {v.map((x) => (
        <span
          key={x.id}
          className={[
            'inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs',
            x.active ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-200 bg-slate-50 text-slate-400',
          ].join(' ')}
          title={`${x.currency} · ${x.price} · ${x.provider}${x.active ? '' : ' (inactive)'}`}
        >
          <span className="font-medium">{x.currency}</span>
          <span>{formatPrice(x.price, x.currency)}</span>
          <span className="text-slate-500">{shortProvider(x.provider)}</span>
        </span>
      ))}
    </div>
  );
}

export function PlansPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const plansQ = useQuery({
    queryKey: ['plans'],
    queryFn: async () => (await api.get<Plan[]>('/plans')).data,
  });

  const createM = useMutation({
    mutationFn: async (payload: CreatePlanForm) => (await api.post<Plan>('/plans', payload)).data,
    onSuccess: async () => {
      toast.success('Тариф создан');
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to create plan')),
  });

  const updateM = useMutation({
    mutationFn: async (payload: { id: string; data: Partial<CreatePlanForm> }) =>
      (await api.patch<Plan>(`/plans/${payload.id}`, payload.data)).data,
    onSuccess: async () => {
      toast.success('Тариф обновлён');
      setEditTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to update plan')),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/plans/${id}`)).data,
    onSuccess: async () => {
      toast.success('Тариф удалён');
      setDeleteTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to delete plan')),
  });

  const plans = useMemo(() => plansQ.data ?? [], [plansQ.data]);

  const createForm = useForm<CreatePlanForm>({
    defaultValues: {
      code: '',
      name: '',
      description: '',
      periodDays: 30,
      isTrial: false,
      active: true,
      availableFor: 'ALL',
      isTop: false,
      variants: [
        {
          currency: 'RUB',
          price: 0,
          provider: defaultProviderForCurrency('RUB'),
          active: true,
        },
      ],
    },
  });

  const editForm = useForm<CreatePlanForm>({
    defaultValues: {
      code: '',
      name: '',
      description: '',
      periodDays: 30,
      isTrial: false,
      active: true,
      availableFor: 'ALL',
      isTop: false,
      variants: [],
    },
  });

  const [newVariantCurrency, setNewVariantCurrency] = useState<string>('USD');
  const [newVariantPrice, setNewVariantPrice] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState(false);

  function getAllCurrencies(formVariants: Array<{ currency: string }> | undefined) {
    return new Set((formVariants ?? []).map((v) => String(v.currency ?? '').toUpperCase()));
  }

  function findVariantIndexByCurrency(currency: string): number {
    const c = currency.toUpperCase();
    const vars = createForm.getValues('variants') ?? [];
    return vars.findIndex((v) => String(v.currency ?? '').toUpperCase() === c);
  }

  function getRubVariantIndexOrZero() {
    const idx = findVariantIndexByCurrency('RUB');
    return idx >= 0 ? idx : 0;
  }

  function upsertCreateVariantRow(currency: string) {
    const c = currency.toUpperCase();
    const cur = createForm.getValues('variants') ?? [];
    if (cur.some((v) => String(v.currency).toUpperCase() === c)) {
      toast.error(`Вариант с валютой ${c} уже добавлен`);
      return;
    }
    const planCode = String(createForm.getValues('code') ?? '').trim();
    createForm.setValue(
      'variants',
      [
        ...cur,
        {
          currency: c,
          price: 0,
          provider: defaultProviderForCurrency(c),
          active: true,
        },
      ],
      { shouldDirty: true },
    );
  }

  async function savePlanEditsWithVariants() {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      // 1) plan fields
      const v = editForm.getValues();
      await api.patch(`/plans/${editTarget.id}`, {
        name: v.name,
        description: v.description?.trim() || undefined,
        periodDays: Number(v.periodDays),
        isTrial: Boolean(v.isTrial),
        active: Boolean(v.active),
        availableFor: v.availableFor,
        isTop: Boolean(v.isTop),
      });

      // 2) variants (best-effort: apply per-variant changes)
      const vars = editTarget.variants ?? [];
      for (const vv of vars) {
        const price = Number((editForm.getValues() as any)[`__v_price_${vv.id}`] ?? vv.price);
        const active = Boolean((editForm.getValues() as any)[`__v_active_${vv.id}`] ?? vv.active);
        const provider = String((editForm.getValues() as any)[`__v_provider_${vv.id}`] ?? vv.provider);
        if (price !== vv.price || active !== vv.active || provider !== vv.provider) {
          await api.patch(`/plans/variants/${vv.id}`, { price, active, provider });
        }
      }

      toast.success('Сохранено');
      setEditTarget(null);
      await qc.invalidateQueries({ queryKey: ['plans'] });
    } catch (err: any) {
      toast.error(getApiErrorMessage(err, 'Не удалось сохранить'));
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Тарифы"
        description="Тарифные планы и варианты оплаты (валюта/цена/провайдер)."
        actions={
          <>
            <Button variant="secondary" onClick={() => plansQ.refetch()}>
              Обновить
            </Button>
            <Button
              onClick={() => {
                createForm.reset({
                  code: '',
                  name: '',
                  description: '',
                  periodDays: 30,
                  isTrial: false,
                  active: true,
                  availableFor: 'ALL',
                  isTop: false,
                  variants: [
                    {
                      currency: 'RUB',
                      price: 0,
                      provider: defaultProviderForCurrency('RUB'),
                      active: true,
                    },
                  ],
                });
                setNewVariantCurrency('USD');
                setNewVariantPrice(0);
                setCreateOpen(true);
              }}
            >
              Добавить тариф
            </Button>
          </>
        }
      />

      {plansQ.isLoading ? (
        <div className="text-sm text-slate-600">Загрузка…</div>
      ) : (
        <ResponsiveSwitch
          mobile={
            <div className="grid gap-3">
              {plans.map((p) => {
                const variants = p.variants ?? [];
                const anyInactive = variants.some((v) => !v.active);
                const activeLabel = p.active ? (anyInactive ? 'АКТИВЕН (есть неактивные варианты)' : 'АКТИВЕН') : 'НЕАКТИВЕН';
                const activeVariant = p.active ? (anyInactive ? 'warning' : 'success') : 'warning';
                return (
                  <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-slate-500">{p.code}</div>
                        <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                        {p.description ? <div className="mt-1 text-xs text-slate-500">{p.description}</div> : null}
                        <div className="mt-2 text-sm text-slate-700">{p.periodDays} дн.</div>
                      </div>
                      <div className="shrink-0 text-right space-y-2">
                        <Badge variant={activeVariant as any}>{activeLabel}</Badge>
                        <div className="flex justify-end gap-1">
                          {p.isTrial ? <Badge variant="info">Пробный</Badge> : null}
                          {p.isTop ? <Badge variant="info">Топ</Badge> : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs text-slate-500 mb-2">Варианты</div>
                      {renderVariantsInline(p.variants)}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => {
                          setEditTarget(p as any);
                          editForm.reset({
                            code: p.code,
                            name: p.name,
                            description: p.description ?? '',
                            periodDays: p.periodDays,
                            isTrial: p.isTrial,
                            active: p.active,
                            availableFor: p.availableFor,
                            isTop: p.isTop,
                            variants: [],
                          });
                        }}
                      >
                        Редактировать
                      </Button>
                      <Button variant="danger" className="flex-1" onClick={() => setDeleteTarget(p as any)}>
                        Удалить
                      </Button>
                    </div>
                  </div>
                );
              })}

              {plans.length === 0 ? (
                <div className="text-sm text-slate-500">Тарифов пока нет</div>
              ) : null}
            </div>
          }
          desktop={
            <Table
              columns={
                <tr>
                  <Th>Код</Th>
                  <Th>Тариф</Th>
                  <Th>Период</Th>
                  <Th>Варианты</Th>
                  <Th>Статус</Th>
                  <Th className="text-right">Действия</Th>
                </tr>
              }
            >
              {plans.map((p) => {
                const variants = p.variants ?? [];
                const anyInactive = variants.some((v) => !v.active);
                const activeLabel = p.active ? (anyInactive ? 'АКТИВЕН (есть неактивные варианты)' : 'АКТИВЕН') : 'НЕАКТИВЕН';
                const activeVariant = p.active ? (anyInactive ? 'warning' : 'success') : 'warning';

                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <Td className="font-mono text-xs">{p.code}</Td>
                    <Td className="font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{p.name}</span>
                        {p.isTrial ? <Badge variant="info">Пробный</Badge> : null}
                        {p.isTop ? <Badge variant="info">Топ</Badge> : null}
                      </div>
                      {p.description ? <div className="text-xs text-slate-500">{p.description}</div> : null}
                    </Td>
                    <Td>{p.periodDays} дн.</Td>
                    <Td>{renderVariantsInline(p.variants)}</Td>
                    <Td>
                      <Badge variant={activeVariant as any}>{activeLabel}</Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditTarget(p as any);
                            editForm.reset({
                              code: p.code,
                              name: p.name,
                              description: p.description ?? '',
                              periodDays: p.periodDays,
                              isTrial: p.isTrial,
                              active: p.active,
                              availableFor: p.availableFor,
                              isTop: p.isTop,
                              variants: [],
                            });
                          }}
                        >
                          Редактировать
                        </Button>
                        <Button variant="danger" onClick={() => setDeleteTarget(p as any)}>
                          Удалить
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}

              {plans.length === 0 ? (
                <tr className="border-t border-slate-100">
                  <Td className="text-slate-500" colSpan={6}>
                    Тарифов пока нет
                  </Td>
                </tr>
              ) : null}
            </Table>
          }
        />
      )}

      <Modal
        open={createOpen}
        title="Новый тариф"
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={createM.isPending}
              onClick={createForm.handleSubmit((v) => {
                const planCode = (v.code ?? '').trim();
                const variants = (v.variants ?? []).map((x) => ({
                  ...x,
                  code: defaultVariantCode(planCode, x.currency),
                  provider: (x.provider ?? '').trim() || defaultProviderForCurrency(x.currency),
                  active: x.active ?? true,
                }));
                const uniqByCurrency = new Set(variants.map((x) => x.currency));
                if (uniqByCurrency.size !== variants.length) {
                  toast.error('Варианты должны быть уникальны по валюте');
                  return;
                }
                createM.mutate({
                  ...v,
                  description: v.description?.trim() || undefined,
                  variants,
                });
              })}
            >
              Создать
            </Button>
          </div>
        }
      >
        <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Данные тарифа</div>
            <div className="mt-3 grid gap-3">
          <Input
            label="Код (уникальный)"
            placeholder="например: 1m"
            {...createForm.register('code', { required: 'Обязательно', minLength: { value: 2, message: 'Слишком коротко' } })}
            error={createForm.formState.errors.code?.message}
          />
          <Input
            label="Название"
            placeholder="например: 1 месяц"
            {...createForm.register('name', { required: 'Обязательно', minLength: { value: 2, message: 'Слишком коротко' } })}
            error={createForm.formState.errors.name?.message}
          />
          <Input label="Описание (необязательно)" {...createForm.register('description')} />
          <Input
            label="Период (дней)"
            type="number"
            {...createForm.register('periodDays', { valueAsNumber: true, required: 'Обязательно', min: 1, max: 3650 })}
            error={createForm.formState.errors.periodDays?.message}
          />
          <Input
            label="Цена (RUB)"
            type="number"
            value={(() => {
              const idx = getRubVariantIndexOrZero();
              const vars = createForm.getValues('variants') ?? [];
              return Number(vars[idx]?.price ?? 0);
            })()}
            onChange={(e) => {
              const idx = getRubVariantIndexOrZero();
              const next = Number(e.target.value ?? 0);
              createForm.setValue(`variants.${idx}.price` as const, Number.isFinite(next) ? next : 0, {
                shouldDirty: true,
              });
              createForm.setValue(`variants.${idx}.currency` as const, 'RUB', { shouldDirty: true });
              createForm.setValue(`variants.${idx}.provider` as const, defaultProviderForCurrency('RUB'), {
                shouldDirty: true,
              });
              createForm.setValue(`variants.${idx}.active` as const, true, { shouldDirty: true });
            }}
          />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Варианты оплаты</div>
                <div className="mt-1 text-xs text-slate-500">
                  Дополнительные валюты/оплаты для этого же тарифа. Код варианта генерируется автоматически: <span className="font-mono">1m_stars</span>.
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
              <div className="grid grid-cols-3 gap-3 items-end">
                <label className="block">
                  <div className="text-sm font-medium text-slate-700">Валюта</div>
                  <select
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                    value={newVariantCurrency}
                    onChange={(e) => setNewVariantCurrency(String(e.target.value ?? '').toUpperCase())}
                  >
                    {(() => {
                      const used = getAllCurrencies(createForm.watch('variants'));
                      return CURRENCY_CODES.filter((c) => c !== 'RUB' && !used.has(c)).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ));
                    })()}
                  </select>
                </label>
                <Input
                  label="Цена"
                  type="number"
                  value={newVariantPrice}
                  onChange={(e) => setNewVariantPrice(Number(e.target.value ?? 0))}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const used = getAllCurrencies(createForm.getValues('variants'));
                    const cur = String(newVariantCurrency ?? '').toUpperCase();
                    if (!cur) return;
                    if (used.has(cur)) {
                      toast.error(`Вариант с валютой ${cur} уже добавлен`);
                      return;
                    }
                    upsertCreateVariantRow(cur);
                    const idx = findVariantIndexByCurrency(cur);
                    if (idx !== -1) {
                      createForm.setValue(`variants.${idx}.price` as const, Number(newVariantPrice ?? 0), {
                        shouldDirty: true,
                      });
                      createForm.setValue(`variants.${idx}.provider` as const, defaultProviderForCurrency(cur), {
                        shouldDirty: true,
                      });
                      createForm.setValue(`variants.${idx}.active` as const, true, { shouldDirty: true });
                    }
                    setNewVariantPrice(0);
                    // выберем следующую доступную валюту
                    const nextUsed = getAllCurrencies(createForm.getValues('variants'));
                    const next = CURRENCY_CODES.find((c) => c !== 'RUB' && !nextUsed.has(c)) ?? 'USD';
                    setNewVariantCurrency(next);
                  }}
                  disabled={!newVariantCurrency}
                >
                  Добавить вариант
                </Button>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Код варианта будет создан автоматически на основе кода тарифа (например, <span className="font-mono">1m_stars</span>).
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              {(createForm.watch('variants') ?? [])
                .map((x, idx) => ({ ...x, idx }))
                .filter((x) => String(x.currency ?? '').toUpperCase() !== 'RUB')
                .map(({ idx }) => {
                  const currency = String(createForm.getValues(`variants.${idx}.currency` as const) ?? '').toUpperCase();
                  const planCode = String(createForm.getValues('code') ?? '').trim();
                  const preview = planCode ? defaultVariantCode(planCode, currency) : '—';
                  return (
                    <div key={idx} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-700">
                          <span className="font-semibold">{currency}</span>{' '}
                          <span className="text-xs text-slate-500 font-mono">{preview}</span>
                        </div>
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => {
                            const cur = createForm.getValues('variants') ?? [];
                            createForm.setValue(
                              'variants',
                              cur.filter((_, i) => i !== idx),
                              { shouldDirty: true },
                            );
                          }}
                        >
                          Удалить
                        </Button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <Input
                          label="Цена"
                          type="number"
                          {...createForm.register(`variants.${idx}.price` as const, { valueAsNumber: true, required: 'Обязательно', min: 0 })}
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
                          <input type="checkbox" {...createForm.register(`variants.${idx}.active` as const)} defaultChecked />
                          Активен
                        </label>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Доступно для</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...createForm.register('availableFor', { required: 'Обязательно' })}
            >
              <option value="ALL">Все пользователи</option>
              <option value="NEW_USERS">Только новые</option>
              <option value="EXISTING_USERS">Только существующие</option>
            </select>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...createForm.register('isTrial')} />
              Пробный тариф
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...createForm.register('isTop')} />
              Топ тариф (в Mini App)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...createForm.register('active')} defaultChecked />
              Активен
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        title="Редактирование тарифа"
        onClose={() => setEditTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEditTarget(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={savingEdit || !editTarget}
              onClick={() => savePlanEditsWithVariants()}
            >
              Сохранить
            </Button>
          </div>
        }
      >
        <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
          <Input label="Код" value={editTarget?.code ?? ''} disabled />
          <Input
            label="Название"
            {...editForm.register('name', { required: 'Обязательно', minLength: { value: 2, message: 'Слишком коротко' } })}
            error={editForm.formState.errors.name?.message}
          />
          <Input label="Описание (необязательно)" {...editForm.register('description')} />
          <Input
            label="Период (дней)"
            type="number"
            {...editForm.register('periodDays', { valueAsNumber: true, required: 'Обязательно', min: 1, max: 3650 })}
            error={editForm.formState.errors.periodDays?.message}
          />
          <label className="block">
            <div className="text-sm font-medium text-slate-700">Доступно для</div>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              {...editForm.register('availableFor', { required: 'Обязательно' })}
            >
              <option value="ALL">Все пользователи</option>
              <option value="NEW_USERS">Только новые</option>
              <option value="EXISTING_USERS">Только существующие</option>
            </select>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('isTrial')} />
              Пробный тариф
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('isTop')} />
              Топ тариф (в Mini App)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" {...editForm.register('active')} />
              Активен
            </label>
          </div>

          {/* Variants: edit only here to avoid extra buttons in table */}
          {editTarget?.variants?.length ? (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Варианты оплаты</div>
              <div className="mt-1 text-xs text-slate-500">
                Управление вариантами делаем здесь, чтобы не перегружать таблицу кнопками.
              </div>

              <div className="mt-3 grid gap-3">
                {editTarget.variants.map((v) => {
                  const preview = defaultVariantCode(editTarget.code, v.currency);
                  return (
                    <div key={v.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-700">
                          <span className="font-semibold">{v.currency}</span>{' '}
                          <span className="text-xs text-slate-500 font-mono">{preview}</span>
                        </div>
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Удалить вариант ${v.currency}?`)) return;
                            try {
                              await api.delete(`/plans/variants/${v.id}`);
                              toast.success('Вариант удалён');
                              await qc.invalidateQueries({ queryKey: ['plans'] });
                              setEditTarget((prev) =>
                                prev ? { ...prev, variants: (prev.variants ?? []).filter((x) => x.id !== v.id) } : prev,
                              );
                            } catch (err: any) {
                              toast.error(getApiErrorMessage(err, 'Не удалось удалить вариант'));
                            }
                          }}
                        >
                          Удалить
                        </Button>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3 items-end">
                        <Input
                          label="Цена"
                          type="number"
                          defaultValue={v.price}
                          onChange={(e) => {
                            (editForm as any).setValue(`__v_price_${v.id}`, Number(e.target.value ?? v.price), {
                              shouldDirty: true,
                            });
                          }}
                        />
                        <label className="block">
                          <div className="text-sm font-medium text-slate-700">Провайдер</div>
                          <select
                            className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            defaultValue={v.provider}
                            onChange={(e) => {
                              (editForm as any).setValue(`__v_provider_${v.id}`, String(e.target.value ?? v.provider), {
                                shouldDirty: true,
                              });
                            }}
                          >
                            <option value="PLATEGA">PLATEGA</option>
                            <option value="CRYPTOCLOUD">CRYPTOCLOUD</option>
                            <option value="TELEGRAM_STARS">TELEGRAM_STARS</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                          <input
                            type="checkbox"
                            defaultChecked={v.active}
                            onChange={(e) => {
                              (editForm as any).setValue(`__v_active_${v.id}`, Boolean(e.target.checked), {
                                shouldDirty: true,
                              });
                            }}
                          />
                          Активен
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                <div className="text-sm font-medium text-slate-700">Добавить вариант</div>
                <div className="mt-2 grid grid-cols-3 gap-3 items-end">
                  <label className="block">
                    <div className="text-sm font-medium text-slate-700">Валюта</div>
                    <select
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      value={newVariantCurrency}
                      onChange={(e) => setNewVariantCurrency(String(e.target.value ?? '').toUpperCase())}
                    >
                      {(() => {
                        const used = new Set((editTarget.variants ?? []).map((x) => String(x.currency ?? '').toUpperCase()));
                        return CURRENCY_CODES.filter((c) => !used.has(c)).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ));
                      })()}
                    </select>
                  </label>
                  <Input
                    label="Цена"
                    type="number"
                    value={newVariantPrice}
                    onChange={(e) => setNewVariantPrice(Number(e.target.value ?? 0))}
                  />
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={async () => {
                      if (!editTarget) return;
                      const used = new Set((editTarget.variants ?? []).map((x) => String(x.currency ?? '').toUpperCase()));
                      const cur = String(newVariantCurrency ?? '').toUpperCase();
                      if (!cur || used.has(cur)) {
                        toast.error('Выберите новую валюту');
                        return;
                      }
                      try {
                        await api.post(`/plans/${editTarget.id}/variants`, {
                          currency: cur,
                          price: Number(newVariantPrice ?? 0),
                          provider: defaultProviderForCurrency(cur),
                          active: true,
                          code: defaultVariantCode(editTarget.code, cur),
                        });
                        toast.success('Вариант добавлен');
                        await qc.invalidateQueries({ queryKey: ['plans'] });
                        // best-effort: обновим локально через refetch данных
                        setNewVariantPrice(0);
                      } catch (err: any) {
                        toast.error(getApiErrorMessage(err, 'Не удалось добавить вариант'));
                      }
                    }}
                  >
                    Добавить
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Удалить тариф"
        onClose={() => setDeleteTarget(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDeleteTarget(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              type="button"
              disabled={deleteM.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteM.mutate(deleteTarget.id)}
            >
              Удалить
            </Button>
          </div>
        }
      >
        <div className="text-sm text-slate-700">
          Удалить тариф <span className="font-semibold">{deleteTarget?.name}</span>? Это действие нельзя отменить.
        </div>
      </Modal>
    </div>
  );
}
