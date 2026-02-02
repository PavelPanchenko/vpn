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

export function TermsPage() {
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<PublicMeta>('/public/meta');
        setMeta(res.data);
      } catch {
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
        <div className="mb-2 text-xl font-bold text-slate-900 sm:text-2xl">Пользовательское соглашение</div>
        <div className="text-sm text-slate-600">
          Сервис: <span className="font-medium">{botName}</span>
          {updatedAt ? <span> · Обновлено: {updatedAt}</span> : null}
        </div>

        {loading ? <div className="mt-4 text-sm text-slate-600">Загрузка…</div> : null}

        <div className="mt-6 space-y-4 text-sm text-slate-800 leading-6">
          <p>
            Настоящее соглашение регулирует использование сервиса <b>{botName}</b> (далее — «Сервис»). Используя
            Сервис, вы подтверждаете согласие с условиями ниже.
          </p>

          <div>
            <div className="font-semibold">1. Описание сервиса</div>
            <p className="mt-2 text-slate-700">
              Сервис предоставляет техническую возможность управления доступом к VPN и получения конфигураций
              подключения.
            </p>
          </div>

          <div>
            <div className="font-semibold">2. Ограничения</div>
            <ul className="mt-2 list-disc pl-5 text-slate-700">
              <li>Запрещено использовать Сервис для незаконной деятельности.</li>
              <li>Запрещены попытки взлома, злоупотребления, перегрузки инфраструктуры.</li>
              <li>Мы можем ограничить доступ при нарушениях (блокировка/отключение).</li>
            </ul>
          </div>

          <div>
            <div className="font-semibold">3. Подписка и оплата</div>
            <p className="mt-2 text-slate-700">
              Доступ может предоставляться по пробному периоду и/или по платным тарифам. Сроки и условия
              отображаются внутри бота/мини‑приложения.
            </p>
          </div>

          <div>
            <div className="font-semibold">4. Отказ от гарантий</div>
            <p className="mt-2 text-slate-700">
              Сервис предоставляется «как есть». Мы не гарантируем бесперебойную работу и можем проводить
              технические работы.
            </p>
          </div>

          <div>
            <div className="font-semibold">5. Контакты</div>
            <p className="mt-2 text-slate-700">
              Владелец/оператор: <b>{companyName}</b>
              {contact ? (
                <>
                  <br />
                  Поддержка: <b>{contact}</b>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

