# Деплой TQuiz на VPS

Стек: два контейнера из `docker-compose.yml` — `app` (FastAPI + собранный фронт, см. `Dockerfile`) и `caddy` (реверс-прокси с автоматическим HTTPS, см. `Caddyfile`). Настройки — в `.env` (шаблон `.env.example`).

## Быстрый путь (olegquiz.ru)

1. **DNS.** У регистратора A-запись `olegquiz.ru → <IP VPS>`.
2. **Первая установка одной командой с ноутбука** (ставит Docker, клонирует код в `/opt/tquiz`, создаёт `.env` со сгенерированными паролем и ключом, запускает стек):
   ```bash
   ssh root@<IP VPS> 'DOMAIN=olegquiz.ru bash -s' < deploy/server-setup.sh
   ```
   В конце скрипт печатает пароль ведущего. Он хранится в `/opt/tquiz/.env`. Свой пароль можно задать сразу: `'DOMAIN=olegquiz.ru ADMIN_PASSWORD=... bash -s'`.
3. **Автовыкатка.** Каждый пуш в `main` запускает GitHub Actions (`.github/workflows/deploy.yml`): тесты бэка, сборка фронта, затем по SSH `git pull` и пересборка на сервере, затем проверка `https://olegquiz.ru/api/health`. Чтобы включить, добавь в GitHub → Settings → Secrets and variables → Actions:

   | Secret | Значение |
   |---|---|
   | `DEPLOY_HOST` | IP или имя VPS |
   | `DEPLOY_USER` | пользователь SSH (по умолчанию `root`) |
   | `DEPLOY_SSH_KEY` | приватный ключ, отдельный для деплоя (см. ниже) |
   | `DEPLOY_PORT` | необязательно, если SSH не на 22 |
   | `DEPLOY_KNOWN_HOSTS` | необязательно: вывод `ssh-keyscan <IP>`, чтобы закрепить ключ сервера |

   Ключ для деплоя:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/tquiz_deploy -N "" -C tquiz-deploy
   ssh-copy-id -i ~/.ssh/tquiz_deploy.pub root@<IP VPS>
   cat ~/.ssh/tquiz_deploy   # целиком → в секрет DEPLOY_SSH_KEY
   ```
   Пока `DEPLOY_HOST` не задан, workflow только гоняет тесты, а шаг выкатки пропускается.
4. **Ручная выкатка с ноутбука** (тот же `git pull` и пересборка, сервер забирает код с GitHub, поэтому сначала запушь):
   ```bash
   TQUIZ_SSH=root@<IP VPS> ./deploy/deploy.sh
   ```

Ниже — то же самое по шагам вручную и обслуживание.

## Что нужно

- VPS с Ubuntu 22.04 или 24.04 (подойдёт любой Linux с Docker): 1 vCPU, 1 ГБ RAM, 10 ГБ диска.
- Открытые порты 80 и 443 (с доменом) или 80 (без домена).
- Желательно домен или поддомен, например `quiz.example.ru`. Без него тоже работает, но по `http://IP`.

## 1. DNS (если есть домен)

У регистратора добавь A-запись: `quiz.example.ru → <IP VPS>`. Подожди, пока она обновится; проверить можно командой `dig +short quiz.example.ru`.

## 2. Подготовка сервера (один раз)

```bash
ssh root@<IP VPS>

# Docker и плагин compose
curl -fsSL https://get.docker.com | sh

# Файрвол (если включён ufw)
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

## 3. Код и настройки

```bash
git clone https://github.com/genroelgvozo/tquiz.git /opt/tquiz
cd /opt/tquiz
cp .env.example .env
nano .env
```

Что заполнить в `.env`:

| Переменная | Пример | Зачем |
|---|---|---|
| `DOMAIN` | `quiz.example.ru` | для какого домена Caddy выпустит HTTPS-сертификат |
| `PUBLIC_URL` | `https://quiz.example.ru` | адрес, который зашивается в QR-код |
| `ADMIN_PASSWORD` | длинный пароль | вход в `/admin` |
| `SECRET_KEY` | результат `openssl rand -hex 32` | подпись cookie и ключ ссылки на общий экран |
| `HTTP_PORT` / `HTTPS_PORT` | `80` / `443` | необязательно: другие порты на хосте, если стандартные заняты |

Смена `SECRET_KEY` разлогинит админку и сделает старую ссылку на экран недействительной — возьми новую в пульте.

Если репозиторий приватный, клонируй через deploy key (GitHub → Settings → Deploy keys) или через personal access token.

## 4. Запуск

```bash
docker compose up -d --build   # первая сборка — несколько минут
docker compose ps              # app и caddy в статусе running
docker compose logs -f app     # логи приложения, выход: Ctrl+C
curl -s http://localhost/api/health   # {"ok":true}
```

Проверка:
- `https://quiz.example.ru/admin` открывает форму входа;
- кнопка «Открыть экран» в админке открывает общий экран (ссылка с ключом; на ТВ её удобно открыть через QR из админки);
- QR в лобби ведёт на `https://quiz.example.ru/play`.

## 5. Обновление

```bash
cd /opt/tquiz
git pull
docker compose up -d --build
```

Не обновляй во время игры: при перезапуске контейнера игра восстановится с того же места (проверено), но телефоны и экран на несколько секунд потеряют связь и переподключатся сами.

## 6. Данные и бэкап

Всё постоянное лежит в каталоге `data/` на сервере (`/opt/tquiz/data`, примонтирован в контейнер как `/app/data`): база SQLite `tquiz.db` и загруженные картинки и аудио в `media/`. Бэкап делается так:

```bash
cd /opt/tquiz
tar czf ~/tquiz-backup-$(date +%F).tgz data/
# скачать к себе:
# scp root@<IP VPS>:~/tquiz-backup-*.tgz .
```

Чтобы восстановить, останови контейнеры (`docker compose down`), распакуй архив в `/opt/tquiz` и снова запусти `docker compose up -d`.

## 7. Без домена

1. В `.env` укажи `DOMAIN=:80` и `PUBLIC_URL=http://<IP VPS>`.
2. Caddy будет отдавать сайт по HTTP без сертификата.
3. Всё работает, но браузеры покажут «Не защищено».

**Осторожно:** пуш в `main` выкатывает приложение сразу, и идущая игра может потерять состояние. Пушь и мержь в `main`, только когда игра не идёт.

## Если что-то не работает

- **Сертификат не выпускается.** Проверь, что A-запись указывает на этот VPS, а порты 80 и 443 открыты. Смотри логи: `docker compose logs caddy`.
- **Телефоны не подключаются по QR.** Проверь `PUBLIC_URL` в `.env`: это должен быть внешний адрес, а не `localhost`.
- **Нет звука на общем экране.** Пока звук выключен, на пульте висит красное предупреждение. Кликни в любом месте окна экрана или по перечёркнутому динамику справа вверху. Браузеры не дают сайту играть звук без клика, поэтому после перезагрузки страницы экрана кликнуть нужно снова. На весь экран окно разворачивает соседняя иконка ⛶.
- **«Откройте экран по ссылке из админки».** Экран открыт без ключа: возьми ссылку кнопкой «Открыть экран» или «QR экрана» в пульте.
- **Порт 80 или 443 уже занят** другим веб-сервером на VPS. Либо останови его, либо задай `HTTP_PORT`/`HTTPS_PORT` в `.env` (но тогда автоматический HTTPS для домена работать не будет — Let's Encrypt проверяет именно 80/443).
