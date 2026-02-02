import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { api } from '../lib/api';
import { getApiErrorMessage } from '../lib/apiError';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Table, Td, Th } from '../components/Table';
import { Badge } from '../components/Badge';

type SupportMessage = {
  id: string;
  vpnUserId: string;
  type: 'USER_MESSAGE' | 'ADMIN_REPLY';
  message: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  vpnUser: {
    id: string;
    name: string;
    telegramId: string | null;
    status: string;
  };
};

type ReplyForm = {
  message: string;
};

export function SupportPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [userFilter, setUserFilter] = useState<string>('ALL');
  const [replyTarget, setReplyTarget] = useState<SupportMessage | null>(null);
  const [closeTarget, setCloseTarget] = useState<string | null>(null);
  // Состояние для свернутых/развернутых сообщений (по ID сообщения)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const messagesQ = useQuery({
    queryKey: ['support', statusFilter, userFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.append('status', statusFilter);
      }
      if (userFilter !== 'ALL') {
        params.append('vpnUserId', userFilter);
      }
      const res = await api.get<SupportMessage[]>(`/support?${params.toString()}`);
      return res.data;
    },
  });

  const statsQ = useQuery({
    queryKey: ['support-stats'],
    queryFn: async () => (await api.get<{ openTickets: number }>('/support/stats')).data,
  });

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<any[]>('/users')).data,
  });

  const replyForm = useForm<ReplyForm>({
    defaultValues: {
      message: '',
    },
  });

  const replyM = useMutation({
    mutationFn: async (payload: { id: string; message: string }) =>
      (await api.post<SupportMessage>(`/support/${payload.id}/reply`, { message: payload.message })).data,
    onSuccess: async () => {
      toast.success('Reply sent');
      setReplyTarget(null);
      replyForm.reset();
      await qc.invalidateQueries({ queryKey: ['support'] });
      await qc.invalidateQueries({ queryKey: ['support-stats'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to send reply')),
  });

  const closeTicketM = useMutation({
    mutationFn: async (vpnUserId: string) => (await api.patch(`/support/user/${vpnUserId}/close`)).data,
    onSuccess: async () => {
      toast.success('Ticket closed');
      setCloseTarget(null);
      await qc.invalidateQueries({ queryKey: ['support'] });
      await qc.invalidateQueries({ queryKey: ['support-stats'] });
    },
    onError: (err: any) => toast.error(getApiErrorMessage(err, 'Failed to close ticket')),
  });

  const messages = useMemo(() => messagesQ.data ?? [], [messagesQ.data]);
  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);

  // Группируем сообщения по пользователям для удобства
  const groupedMessages = useMemo(() => {
    const groups: Record<string, SupportMessage[]> = {};
    messages.forEach((msg) => {
      if (!groups[msg.vpnUserId]) {
        groups[msg.vpnUserId] = [];
      }
      groups[msg.vpnUserId].push(msg);
    });
    return groups;
  }, [messages]);

  const handleReply = (msg: SupportMessage) => {
    if (msg.type !== 'USER_MESSAGE') {
      toast.error('Можно отвечать только на сообщения пользователей');
      return;
    }
    setReplyTarget(msg);
  };

  const onSubmitReply = (data: ReplyForm) => {
    if (!replyTarget) return;
    replyM.mutate({ id: replyTarget.id, message: data.message });
  };

  const handleCloseTicket = (vpnUserId: string) => {
    setCloseTarget(vpnUserId);
    closeTicketM.mutate(vpnUserId);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Поддержка" />
      
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-slate-700">Статус</div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'OPEN' | 'CLOSED')}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              >
                <option value="ALL">Все</option>
                <option value="OPEN">Открытые</option>
                <option value="CLOSED">Закрытые</option>
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-slate-700">Пользователь</div>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              >
                <option value="ALL">Все</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.telegramId ? `(${u.telegramId})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-sm text-slate-600">Открытых тикетов</div>
            <div className="text-2xl font-bold text-slate-900">{statsQ.data?.openTickets ?? 0}</div>
          </div>
        </div>

        {messagesQ.isLoading ? (
          <div className="text-center py-8 text-slate-500">Загрузка...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-slate-500">Нет сообщений</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMessages).map(([vpnUserId, userMessages]) => {
              const user = userMessages[0].vpnUser;
              const hasOpenMessages = userMessages.some((m) => m.status === 'OPEN');
              
              return (
                <div key={vpnUserId} className="border border-slate-200 rounded-lg p-4">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{user.name}</h3>
                      {user.telegramId && (
                        <p className="text-sm text-slate-500">Telegram ID: {user.telegramId}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {hasOpenMessages && (
                        <Badge variant="success">Открыт</Badge>
                      )}
                      {!hasOpenMessages && (
                        <Badge variant="secondary">Закрыт</Badge>
                      )}
                      {hasOpenMessages && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleCloseTicket(vpnUserId)}
                          disabled={closeTicketM.isPending}
                        >
                          Закрыть тикет
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {(() => {
                      // Сортируем сообщения по дате (от старых к новым)
                      const sortedMessages = [...userMessages].sort(
                        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                      );
                      
                      // Последнее сообщение (самое новое)
                      const lastMessage = sortedMessages[sortedMessages.length - 1];
                      // Все остальные сообщения (кроме последнего)
                      const otherMessages = sortedMessages.slice(0, -1);
                      const isOtherMessagesExpanded = expandedMessages.has(`group_${vpnUserId}`);

                      return (
                        <>
                          {/* Группа старых сообщений (свернута) */}
                          {otherMessages.length > 0 && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50">
                              <div
                                className="p-3 cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => {
                                  const newExpanded = new Set(expandedMessages);
                                  if (isOtherMessagesExpanded) {
                                    newExpanded.delete(`group_${vpnUserId}`);
                                  } else {
                                    newExpanded.add(`group_${vpnUserId}`);
                                  }
                                  setExpandedMessages(newExpanded);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-700">
                                    {isOtherMessagesExpanded ? '▼' : '▶'} Старые сообщения ({otherMessages.length})
                                  </span>
                                </div>
                              </div>
                              {isOtherMessagesExpanded && (
                                <div className="border-t border-slate-200 p-3 space-y-2">
                                  {otherMessages.map((msg) => (
                                    <div
                                      key={msg.id}
                                      className={`p-2 rounded ${
                                        msg.type === 'USER_MESSAGE'
                                          ? 'bg-blue-50 border-l-2 border-blue-500'
                                          : 'bg-green-50 border-l-2 border-green-500'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium">
                                          {msg.type === 'USER_MESSAGE' ? '👤 Пользователь' : '👨‍💼 Администратор'}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          {new Date(msg.createdAt).toLocaleString('ru-RU')}
                                        </span>
                                      </div>
                                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.message}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Последнее сообщение (всегда развернуто) */}
                          {lastMessage && (
                            <div
                              className={`rounded-lg border ${
                                lastMessage.type === 'USER_MESSAGE'
                                  ? 'bg-blue-50 border-blue-500'
                                  : 'bg-green-50 border-green-500'
                              }`}
                            >
                              <div className="p-3">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                      {lastMessage.type === 'USER_MESSAGE' ? '👤 Пользователь' : '👨‍💼 Администратор'}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {new Date(lastMessage.createdAt).toLocaleString('ru-RU')}
                                    </span>
                                  </div>
                                  {lastMessage.type === 'USER_MESSAGE' && lastMessage.status === 'OPEN' && (
                                    <Button
                                      variant="primary"
                                      className="shrink-0"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleReply(lastMessage);
                                      }}
                                    >
                                      Ответить
                                    </Button>
                                  )}
                                </div>
                                <p className="text-slate-700 whitespace-pre-wrap">{lastMessage.message}</p>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Модальное окно для ответа */}
      <Modal
        open={!!replyTarget}
        onClose={() => {
          setReplyTarget(null);
          replyForm.reset();
        }}
        title="Ответить на сообщение"
      >
        <form onSubmit={replyForm.handleSubmit(onSubmitReply)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Сообщение</label>
            <textarea
              {...replyForm.register('message', { required: true })}
              rows={6}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              placeholder="Введите ответ..."
            />
            {replyForm.formState.errors.message && (
              <p className="mt-1 text-sm text-red-600">Это поле обязательно</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setReplyTarget(null);
                replyForm.reset();
              }}
            >
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={replyM.isPending}>
              {replyM.isPending ? 'Отправка...' : 'Отправить'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
