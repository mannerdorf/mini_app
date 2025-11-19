import { useEffect, useState } from 'react';

const tg = window.Telegram?.WebApp;

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (tg) {
      tg.ready(); // Сообщаем, что приложение загрузилось
      tg.expand(); // Раскрываем на полный экран
      setIsReady(true);
    }
  }, []);

  const onClose = () => {
    tg?.close();
  };

  const onToggleButton = () => {
    if (tg?.MainButton.isVisible) {
      tg.MainButton.hide();
    } else {
      tg.MainButton.show();
    }
  };

  return {
    onClose,
    onToggleButton,
    tg,
    user: tg?.initDataUnsafe?.user,
    queryId: tg?.initDataUnsafe?.query_id,
    isExpanded: tg?.isExpanded,
    themeParams: tg?.themeParams, // Цвета темы
    platform: tg?.platform, // 'ios', 'android', 'tdesktop'
  };
}
