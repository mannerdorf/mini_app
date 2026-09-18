# Пилот общих UX-токенов

19 сентября 2026. UXA-23 остаётся частично выполненным.

Новые aliases в `src/components/shared/uxTokens.css` сохраняют действующую палитру:

| Назначение | Alias | Источник |
| --- | --- | --- |
| Поверхность | --ux-surface | --color-bg-card |
| Граница | --ux-border | --color-border |
| Основной текст | --ux-text | --color-text-primary |
| Вторичный текст | --ux-muted | --color-text-secondary |
| Фокус | --ux-focus | --color-primary-blue |
| Скругление контрола / панели | --ux-radius-control / --ux-radius-panel | 12 / 16 px |
| Сенсорная цель | --ux-touch-height | 44 px |

Пилот: DocumentsSectionTabs и TableControls. Изменение не переопределяет глобальные radius/shadow существующих экранов. Остаток: миграция Input/Select, Switch, StatusBadge, Drawer и финансовых таблиц с проверкой всех состояний и контраста. Разная плотность desktop/mobile сохраняется намеренно.

## Расширение пилота — этап 8

Pickup подключён к тому же alias-слою: поверхности, основной/вторичный текст и границы формы, таблицы и drawer. Поля ввода и select используют общие размеры 44 px / 12 px; панели — радиус 16 px. Добавлены scoped-состояния клавиатурного фокуса, aria-invalid и disabled. Геометрия бокового drawer сохранена.

Браузерная проверка карточки на 390×844 в обеих темах: ширина и scrollWidth 390 px, поле 44 px, радиус 12 px. Контраст **основного текста на поверхности**: 16.83:1 light, 15.63:1 dark. Это не измерение всех статусов, границ и вторичного текста приложения. Доказательства: `ux-audit-assets/stage8-form-{light,dark}.png`, `stage8-form-metrics.json`.

Остаток: Switch и семантические палитры StatusBadge, остальные формы приложения и полный замер контраста. UXA-23 не закрыт.

## Расширение пилота — этап 9

TapSwitch использует `tapSwitch.css` и общие focus/touch токены. Старые определения в профиле и pickup удалены. В `uxTokens.css` добавлены пары `--ux-status-{success,warning,danger,purple,neutral}-{bg,text}` для обеих тем. Их применяют только общие компоненты с классом `ux-status`, через `statusBadges.css`.

Проверены на стенде размеры обоих переключателей, клавиатура, disabled и четыре статуса оплаты. Контраст и ширины сохранены в `ux-audit-assets/stage9-controls-metrics.json`. Остаток — миграция остальных legacy-форм и проверка всех семантических состояний на интегрированных экранах. Полный аудит контраста приложения не завершён.

## Общие legacy-поля — этап 11

`src/styles/modules/ux-form-contract.css`, подключённый последним в стилях приложения, адаптирует admin-form-input/login-input (native и MAX UI wrapper) к общим радиусу, touch-height и состояниям. Фокус явно перекрывает прежний outline:none !important; вложенные inputs не получают двойную рамку. Mobile font-size 16 px снижает автоматический zoom поля в iOS. Проверка 36 сочетаний экранов/тем/ширин сохранена в stage11-responsive-matrix.json.

Специализированная геометрия CMS/гостевых страниц и калькулятора — исключения; весь CSS приложения не объявлен мигрированным. Общая приёмка: ux-release-acceptance.md.
