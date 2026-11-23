# TQuiz

Пет-проект: сайт для проведения живых квизов. Ведущий управляет игрой из админки на ноутбуке, вопросы выводятся на общий экран (ТВ или проектор), команды подключаются с телефонов по QR. Одна игра одновременно, 3–4 команды, свой VPS.

## Источники правды

- Дизайн и требования: `docs/superpowers/specs/2026-11-18-tquiz-design.md`. Прежде чем менять поведение игры, сверься с ним.
- Одобренные наброски экранов: `docs/superpowers/specs/mockups/`.
- Деплой на VPS: `docs/deploy.md`.

## Стек

- Бэкенд: Python, FastAPI (uvicorn), WebSocket, SQLite. Медиа хранятся файлами в `data/media`.
- Фронтенд: React, Vite, TypeScript. Одно SPA с маршрутами `/admin`, `/screen`, `/play`. В проде его раздаёт FastAPI.
- Админка на Mantine 8 (`@mantine/core`, `@mantine/modals`, `@mantine/notifications`). Mantine 9 требует React 19, поэтому пока восьмая версия. Админка грузится отдельным чанком (`React.lazy` в `App.tsx`), чтобы Mantine не попадал на телефоны и экран. В `/play` и `/screen` Mantine не импортируй.
- Админку собирай из компонентов Mantine: раскладка через `Stack`/`Group`/`Grid`, отступы через пропсы темы. Своих классов и `style={{ margin… }}` не заводи. Свой CSS (`admin.css`, `console/console.css`) только там, где у Mantine нет аналога: мини-сетка «Своей игры» и перекраска общего `PhaseTimerBar`. Ошибки показывай через `src/admin/notify.ts`, подписи блоков через `SectionLabel` из `src/admin/ui.tsx`.
- В админке никаких `window.confirm/prompt/alert`: нативный диалог снимает полноэкранный режим с окна экрана, если всё открыто на одном компьютере. Используй `src/admin/dialogs.tsx` (`confirmDialog`, `promptDialog`, `newRoundDialog`).
- Названия и описания типов туров для админки лежат в `src/admin/roundKinds.ts`. Окно «Новый тур» строится по этому списку. Если добавить тип в `RoundKind`, компилятор не даст собрать проект, пока тип не описан там.
- Горячие клавиши пульта — только через `src/admin/console/useConsoleHotkeys.ts` (физические клавиши, не срабатывают в полях и при открытом диалоге). Решения пульта (кнопка шага, подтверждения) — чистые функции в `src/admin/console/step.ts` и `freeNav.ts`.
- Чистые модули под `node:test` импортируют значения из других модулей с расширением (`./check.ts`): без него Node не найдёт файл. Типы — через `import type`, без расширения.
- Анимации общего экрана на Motion (`motion/react`); экран — отдельный ленивый чанк, в `/play` Motion не импортируй.
- Деплой: docker compose (приложение и Caddy с автоматическим HTTPS).

## Принципы

- **Максимально просто.** Один процесс, без Redis, очередей и микросервисов. Нагрузка минимальная, поэтому не усложняй архитектуру «на вырост».
- **Сервер — единственный источник правды** о состоянии игры. Клиенты только отображают снимок состояния и шлют команды.
- **Скрытые данные не утекают.** Правильные ответы и ответы других команд никогда не уходят на `/play` и `/screen` до момента показа. Медиа доступно только админке и экрану (по ключу), телефонам никогда. Любое изменение формы снимка состояния должно сохранять фильтрацию по ролям, и это покрыто тестами.
- **От команды один телефон.** Вход с нового устройства в существующую команду возможен только с подтверждением ведущего.
- **Игра переживает сбои:** перезагрузку телефона, обрыв WebSocket, рестарт сервера.
- **Язык:** интерфейс и документация на русском, код и идентификаторы на английском.

## Команды

Бэкенд (каталог `backend/`, Python через uv):

```bash
cd backend
uv sync                      # зависимости
uv run pytest                # тесты
ADMIN_PASSWORD=dev SECRET_KEY=dev-secret uv run uvicorn --factory app.main:create_app --reload --port 8000
```

`SECRET_KEY` не короче 8 символов, иначе бэк не стартует.

Приложение запускается только как фабрика (`--factory app.main:create_app`): модульного `app` нет.

Фронтенд (каталог `frontend/`, React + Vite):

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, проксирует /api, /media, /ws на бэк
npm test         # тесты чистых функций (node:test)
npm run build    # проверка типов + сборка в frontend/dist
```

- Если порт 8000 занят: запусти бэк на другом порту и укажи его прокси: `TQUIZ_BACKEND=http://localhost:8010 npm run dev`.
- Играть с телефонов в dev: бэк запускается с `PUBLIC_URL=http://<IP ноутбука>:5173`, и телефоны в той же Wi-Fi открывают QR из лобби.
- Прод-сборку раздаёт сам бэк, если задан `STATIC_DIR=../frontend/dist`.

## Деплой

Docker Compose (`app` + `caddy`) на VPS, домен **olegquiz.ru**, код в `/opt/tquiz`; подробно — `docs/deploy.md`.

- Автовыкатка: пуш в `main` → GitHub Actions (`.github/workflows/deploy.yml`): тесты → SSH на сервер → `git pull` + `deploy/remote-update.sh` → проверка `https://olegquiz.ru/api/health`. Секреты: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (+ необязательные `DEPLOY_PORT`, `DEPLOY_KNOWN_HOSTS`).
- Ручная выкатка: `TQUIZ_SSH=root@<IP> ./deploy/deploy.sh` (сервер берёт код с GitHub — сначала запушь).
- Первая установка сервера: `ssh root@<IP> 'DOMAIN=olegquiz.ru bash -s' < deploy/server-setup.sh`.

Локальная проверка прод-сборки без занятия 80/443: в `.env` поставить `DOMAIN=:80`, `HTTP_PORT=8088`, `PUBLIC_URL=http://localhost:8088` и запустить `docker compose up -d --build`.
