import { useState, useEffect } from 'react';
import { useTelegram } from './hooks/useTelegram';
import './index.css';

function App() {
  const { tg, user, onClose } = useTelegram();
  const [count, setCount] = useState(0);

  // Управление "Главной кнопкой" (MainButton)
  useEffect(() => {
    if (!tg) return;

    // Настраиваем кнопку
    tg.MainButton.setParams({
      text: `ОТПРАВИТЬ ЗАКАЗ (${count * 100} ₽)`,
      color: '#2ecc71' // Можно переопределить цвет вручную
    });

    // Показываем или скрываем в зависимости от логики
    if (count > 0) {
      tg.MainButton.show();
    } else {
      tg.MainButton.hide();
    }

    // Обработчик нажатия на MainButton
    const handleMainBtn = () => {
      tg.sendData(JSON.stringify({ action: 'buy', amount: count }));
      // Haptic Feedback - вибрация успеха
      tg.HapticFeedback.notificationOccurred('success');
    };

    tg.MainButton.onClick(handleMainBtn);

    // Очистка (очень важно удалять слушатели!)
    return () => {
      tg.MainButton.offClick(handleMainBtn);
    };
  }, [count, tg]);

  // Обработка кнопки "Назад" в шапке Телеграма
  useEffect(() => {
    if(!tg) return;
    
    // Если есть куда возвращаться (логика роутера), показываем стрелку
    // tg.BackButton.show();
    // tg.BackButton.onClick(() => navigate(-1));
  }, [tg]);

  return (
    <div className="page-container">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Привет, {user?.first_name || 'Гость'}! 👋</h1>
        <p style={{ color: 'var(--tg-theme-hint-color)' }}>
          Это улучшенный шаблон Mini App.
        </p>
      </div>

      <div className="card">
        <h3>Корзина товаров</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Товар "Супер-Бот"</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="tg-button" 
              style={{ width: '40px', padding: 0 }} 
              onClick={() => {
                setCount(c => Math.max(0, c - 1));
                tg?.HapticFeedback.impactOccurred('light'); // Легкая вибрация
              }}
            >
              -
            </button>
            <span style={{ fontSize: '1.2em', fontWeight: 'bold', minWidth: '20px', textAlign: 'center' }}>
              {count}
            </span>
            <button 
              className="tg-button" 
              style={{ width: '40px', padding: 0 }} 
              onClick={() => {
                setCount(c => c + 1);
                tg?.HapticFeedback.impactOccurred('medium'); // Средняя вибрация
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <button 
        onClick={onClose} 
        style={{ 
          background: 'transparent', 
          border: 'none', 
          color: 'var(--tg-theme-link-color)', 
          marginTop: '20px', 
          width: '100%' 
        }}
      >
        Закрыть приложение
      </button>
    </div>
  );
}

export default App;
