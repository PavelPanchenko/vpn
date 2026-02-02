import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type PublicMeta = {
  botName: string;
  botUsername: string | null;
  companyName: string | null;
  supportEmail: string | null;
  supportTelegram: string | null;
  updatedAt: string;
};

export function PrivacyPolicyPage() {
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<PublicMeta>('/public/meta');
        setMeta(res.data);
      } catch {
        // fallback
        setMeta({
          botName: 'VPN',
          botUsername: null,
          companyName: null,
          supportEmail: null,
          supportTelegram: null,
          updatedAt: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const botName = meta?.botName || 'VPN';
  const companyName = meta?.companyName || botName;
  const contact =
    meta?.supportEmail || meta?.supportTelegram || (meta?.botUsername ? `@${meta.botUsername}` : null);

  const updatedAt = meta?.updatedAt ? new Date(meta.updatedAt).toLocaleDateString('ru-RU') : '';

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-8 sm:px-4 sm:py-10">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-2 text-xl font-bold text-slate-900 sm:text-2xl">Политика конфиденциальности</div>
        <div className="text-sm text-slate-600">
          Сервис: <span className="font-medium">{botName}</span>
          {updatedAt ? <span> · Обновлено: {updatedAt}</span> : null}
        </div>

        {loading ? <div className="mt-4 text-sm text-slate-600">Загрузка…</div> : null}

        <div className="mt-6 space-y-4 text-sm text-slate-800 leading-6">
          <p>
            Настоящая политика описывает, какие данные обрабатывает сервис <b>{botName}</b> (далее — «Сервис») и
            как они используются.
          </p>

          <div>
            <div className="font-semibold">1. Какие данные мы обрабатываем</div>
            <ul className="mt-2 list-disc pl-5 text-slate-700">
              <li>Идентификатор пользователя в Telegram (Telegram ID) и имя/username (если доступны).</li>
              <li>Технические данные подписки: статус доступа, даты начала/окончания, выбранная локация.</li>
              <li>Технические данные подключения (конфигурация VPN), сформированные для вашего аккаунта.</li>
              <li>Обращения в поддержку и ответы администратора (если вы используете поддержку).</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">2. Цели обработки</div>
            <ul className="mt-2 list-disc pl-5 text-slate-700">
              <li>Предоставление доступа к VPN и управление подпиской.</li>
              <li>Техническая поддержка пользователей.</li>
              <li>Обеспечение безопасности и предотвращение злоупотреблений.</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">3. Передача данных</div>
            <p className="mt-2 text-slate-700">
              Сервис может передавать данные только тем поставщикам инфраструктуры, которые необходимы для работы
              (например, хостинг/серверы). Мы не продаём персональные данные третьим лицам.
            </p>
          </div>

          <div>
            <div className="font-semibold">4. Хранение и безопасность</div>
            <p className="mt-2 text-slate-700">
              Мы применяем технические меры для защиты данных (контроль доступа, шифрование чувствительных секретов
              в конфигурации, журналирование ошибок).
            </p>
          </div>

          <div>
            <div className="font-semibold">5. Контакты</div>
            <p className="mt-2 text-slate-700">
              Владелец/оператор: <b>{companyName}</b>
              {contact ? (
                <>
                  <br />
                  Связаться с нами: <b>{contact}</b>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

