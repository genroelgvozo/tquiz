# Деплой TQuiz на VPS

> Это целевая инструкция. Файлы `docker-compose.yml`, `Caddyfile`, `Dockerfile` и `.env.example` появятся на этапе реализации. Когда они будут готовы, сверь шаги с ними.

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
git clone https://github.com/<user>/tquiz.git /opt/tquiz
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
| `SECRET_KEY` | результат `openssl rand -hex 32` | подпись cookie сессии |

Если репозиторий приватный, клонируй через deploy key (GitHub → Settings → Deploy keys) или через personal access token.

## 4. Запуск

```bash
docker compose up -d --build
docker compose ps          # оба контейнера в статусе running
docker compose logs -f app # логи приложения, выход: Ctrl+C
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

Не обновляй во время игры: при перезапуске сервера состояние игры восстановится, но телефоны и экран на несколько секунд потеряют связь.

## 6. Данные и бэкап

Всё постоянное лежит в каталоге `data/` на сервере (`/opt/tquiz/data`): база SQLite и загруженные картинки и аудио. Бэкап делается так:

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

## Если что-то не работает

- **Сертификат не выпускается.** Проверь, что A-запись указывает на этот VPS, а порты 80 и 443 открыты. Смотри логи: `docker compose logs caddy`.
- **Телефоны не подключаются по QR.** Проверь `PUBLIC_URL` в `.env`: это должен быть внешний адрес, а не `localhost`.
- **Нет звука на общем экране.** Нажми на экране кнопку «Включить звук». Браузеры не дают сайту играть звук без клика.
