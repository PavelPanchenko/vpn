import { useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { toast } from 'react-toastify';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { IconButton } from '../components/IconButton';

type LogsResponse = { lines: string[] };

export function LogsPage() {
  const qc = useQueryClient();
  const preRef = useRef<HTMLPreElement>(null);

  const logsQ = useQuery({
    queryKey: ['logs'],
    queryFn: async () => (await api.get<LogsResponse>('/logs')).data,
    refetchInterval: 5000,
  });

  const clearM = useMutation({
    mutationFn: async () => (await api.delete<{ ok: boolean }>('/logs')).data,
    onSuccess: () => {
      toast.success('Логи очищены');
      qc.invalidateQueries({ queryKey: ['logs'] });
    },
    onError: (err: unknown) => toast.error(getApiErrorMessage(err, 'Не удалось очистить логи')),
  });

  const lines = logsQ.data?.lines ?? [];
  const text = lines.length ? lines.join('\n') : '';

  useEffect(() => {
    if (preRef.current && text) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [text]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Логи"
        description={
          logsQ.isSuccess && Array.isArray(logsQ.data?.lines)
            ? `Строк: ${logsQ.data.lines.length}. Обновление каждые 5 с.`
            : 'Логи приложения (последние 5000 строк).'
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={logsQ.isFetching}
              onClick={() => logsQ.refetch()}
            >
              {logsQ.isFetching ? 'Обновление…' : 'Обновить'}
            </Button>
            <IconButton
              icon="delete"
              variant="danger"
              title="Очистить логи"
              disabled={clearM.isPending || lines.length === 0}
              onClick={() => {
                if (lines.length && !window.confirm('Очистить все логи?')) return;
                clearM.mutate();
              }}
            />
          </div>
        }
      />

      <Card>
        {logsQ.isLoading ? (
          <div className="text-sm text-slate-500">Загрузка…</div>
        ) : (
          <pre
            ref={preRef}
            className="max-h-[70vh] overflow-auto rounded-lg bg-slate-900 p-4 text-left text-xs text-slate-100 font-mono whitespace-pre-wrap break-all"
          >
            {text || 'Логов пока нет.'}
          </pre>
        )}
      </Card>
    </div>
  );
}
