# Иконки и splash HAULZ

Исходник: `haulz-logo-source.jpg` (синий фон `#3655ff`, белый логотип без чёрных углов).

Пересобрать все размеры:

```bash
./scripts/generate-haulz-brand-icons.sh
```

Файлы в `public/`: `pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`, `favicon-16.png`, `favicon-32.png`, `haulz-logo.png`.

**Telegram / MAX:** в настройках бота загрузите `public/pwa-512.png` как иконку мини-приложения (640×640), иначе при старте может показываться старая картинка с чёрными углами.
