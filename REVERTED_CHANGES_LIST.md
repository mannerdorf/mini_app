# Список изменений (откатанный коммит 37bf90c5)

Коммит откатан через `git revert`. Ниже — что в нём было сделано (чтобы можно было восстановить по необходимости).

---

## 1. Карточка перевозки — блок «Данные курьера» (App.tsx)

- **Загрузка данных:** в `fetchPerevozkaDetails` при формировании `meta` добавлен приоритет полей с префиксом LM:
  - `LMAutoReg` → номер автомобиля (fallback: AutoReg, autoReg, AutoREG)
  - `LMAutoType` → марка (fallback: AutoType, autoType, TypeOfTranzit, TypeOfTransit)
  - `LMDriver` → водитель (fallback: Driver, driver, DriverFio, DriverName)

- **UI в служебном режиме:** вместо одного поля «Транспортное средство» выводится блок **«Данные курьера»** с тремя полями:
  - **Номер автомобиля** — значение из `LMAutoReg` / `AutoReg` / `perevozkaMeta.autoReg`
  - **Марка** — из `LMAutoType` / `AutoType` / `perevozkaMeta.autoType`
  - **Водитель** — из `LMDriver` / `Driver` / `perevozkaMeta.driver`

- **EXCLUDED_KEYS:** добавлены `LMAutoReg`, `LMAutoType`, `LMDriver`, чтобы они не дублировались в списке прочих полей из API.

---

## 2. Конфиг API плановой даты доставки (src/constants/config.ts)

- Добавлена константа `DELIVERY_WEBSERVICE_SET_PLAN_DATE_URL` для вызова метода `SetPlanDataDostavki` (установка плановой даты доставки по перевозке).

---

## 3. Документы / Отправки — EOR и плановая дата (DocumentsPage.tsx)

- **Колонка EOR:** отображается при `permissions?.service_mode`; редактирование при `permissions?.eor || isSuperAdmin`.
- **Состояние:** `selectedSendingRowKeys`, `planDateModalOpen`, `planDateValue`, `planDateLoading`, `eorToolbarDropdownOpen`.
- **Тулбар (при showEorColumn):** кнопки «Плановая дата доставки» и «EOR»; выпадающий список EOR (Въезд разрешен, Полный досмотр, Разворот).
- **Чекбоксы:** в основной таблице (с «выбрать все»), в развёрнутой строке — по перевозкам и по заказчику.
- **Плановая дата:** модальное окно с выбором даты; применение — запрос `GET .../GETAPI?metod=SetPlanDataDostavki&Perevozka=...&Date=...`, затем обновление списка (`mutateSendings`).
- **ColSpan:** обновлён для развёрнутой строки и итогов при наличии колонки с чекбоксами.

---

## 4. Типы (src/types.ts)

- В тип `CargoItem` добавлено поле `DateArrival` (плановая дата доставки).

---

## Как восстановить

- Либо откатить revert: `git revert HEAD` (вернёт изменения из 37bf90c5).
- Либо вручную перенести правки из этого списка в соответствующие файлы.
