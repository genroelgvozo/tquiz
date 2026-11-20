# Оформление общего экрана — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Темы квиза, фоны, фоновая музыка, переходы в стиле «Шоу», ответ в разборе по кнопке, печать вопроса своей игры по буквам и две маленькие иконки звука и полного экрана вместо плашки.

**Architecture:**
- **Бэкенд.** Новые поля оформления хранятся в `Quiz`/`Round` и приезжают в `QuizData`. Сервер, как и раньше, — источник правды:
  - вопрос своей игры стартует после анимации раскрытия (`starts_at`), печать задаётся временем (`typed_base`/`typing_since`);
  - какая фоновая музыка звучит, решает `app/game/music.py`;
  - в разборе ответ скрыт до команды `review_show_answer`.
- **Фронт.** Тема превращается в CSS-переменные чистой функцией `themeVars`. Экран грузится отдельным чанком с Motion:
  - снимок переводится в «сцену» чистой функцией `sceneOf`;
  - выбор перехода — чистой функцией `planTransition`;
  - анимации описаны в `screen/motion.ts`.

**Tech Stack:** Python 3.12, FastAPI, SQLModel/SQLite, pydantic, pytest (через `uv`); React 18, TypeScript, Vite, Mantine 8 (только админка), `motion@12.43.0` (только экран); тесты чистых TS-функций на `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-20-screen-polish-design.md` (дополняет `docs/superpowers/specs/2026-11-18-tquiz-design.md`). Эталоны вида и таймингов: `docs/superpowers/specs/mockups/screen-polish-*.html`.

## Global Constraints

- Интерфейс и документация на русском, код и идентификаторы на английском.
- Что видит каждая роль, решается только в `backend/app/game/views.py`; каждое изменение формы снимков покрыто тестами в `backend/tests/test_views.py`. Телефоны никогда не получают текст вопроса, медиа, фоны и музыку.
- Mantine только в `src/admin`. Motion только в `src/screen` (экран — отдельный ленивый чанк). В `/play` ни Mantine, ни Motion.
- В админке никаких `window.confirm/prompt/alert`; ошибки через `src/admin/notify.ts`; раскладка из компонентов Mantine (см. `CLAUDE.md`).
- Тема по умолчанию «Сливки»: `{"bg": "#FBF5EA", "text": "#2B2420", "accent": "#E2552F", "second": "#2F7FA8"}`. Остальные пресеты: Мята `#EEF6F1 #17302A #0E9F74 #F0A202`, Лаванда `#F4F1FB #241D40 #6B48E0 #E8467C`, Ночь `#16192B #F3F1EA #FF8A5B #5CC8C2` (порядок: bg, text, accent, second).
- Скорость печати по умолчанию 15 знаков/с, допустимо 1–100. Длительность раскрытия вопроса на сервере `REVEAL_SECONDS = 1.2`; анимации экрана, после которых вопрос «стартует», укладываются в 1200 мс.
- Старая база (без новых колонок) и старый JSON состояния игры (без новых полей) загружаются без ошибок.
- Проверки: бэкенд `cd backend && uv run pytest`; фронтенд `cd frontend && npm test && npm run build`.
- Коммит в конце каждой задачи, сообщение на английском в стиле репозитория (`feat(...)`, `fix(...)`), с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Не пушить: пуш в `main` выкатывает прод.

## Review Focus

1. **Новый снимок посреди мигания, раскрытия или заставки-заголовка.** Например, ведущий быстро кликнул ячейку, «Показать ответ» и следующую ячейку, или нажал «Отменить» во время раскрытия. Экран должен прийти к последней сцене, ничего не застревает. Тесты `planTransition` на прерывание — в задаче 9.
2. **Перезагрузка или переподключение экрана посреди вопроса или музыки.** Анимации не проигрываются заново, печать продолжается с правильного символа, трек при переподключении с тем же ключом не перезапускается. Тесты в задачах 6, 9, 10.
3. **«Отменить» после ✗, которое возобновило печать.** Печать снова заморожена на том же символе, отвечает та же команда. Тест в задаче 2.
4. **Открыты два экрана, звук включён только на одном** (превью на ноутбуке и ТВ). Предупреждения на пульте нет. Тест в задаче 5.
5. **Файл фона или музыки удалён с диска (404).** На экране цвет темы без значка битой картинки, музыка молча не играет, игра идёт. Ручная проверка в задаче 10.

---

### Task 1: Поля оформления в базе, `QuizData` и API редактора

**Files:**
- Modify: `backend/app/models.py`, `backend/app/db.py`, `backend/app/quizdata.py`, `backend/app/api/media.py`, `backend/app/api/quizzes.py`
- Test: `backend/tests/test_quizzes_api.py`

**Interfaces:**
- Produces:
  - `app.models.DEFAULT_THEME: dict[str, str]` (Сливки);
  - `Quiz.theme: dict` (JSON), `Quiz.background_filename`, `Quiz.lobby_music_filename: str | None`;
  - `Round.background_filename`, `Round.intro_music_filename`, `Round.think_music_filename: str | None`, `Round.typewriter: bool = False`, `Round.type_speed: int = 15`.
  - `app.quizdata.Theme(BaseModel)` с полями `bg`, `text`, `accent`, `second` (каждое — `str` с `pattern=r"^#[0-9a-fA-F]{6}$"`);
  - `QuizData.theme: Theme`, `QuizData.background`, `QuizData.lobby_music: MediaRef | None`;
  - `RoundData.background`, `RoundData.intro_music`, `RoundData.think_music: MediaRef | None`, `RoundData.typewriter: bool = False`, `RoundData.type_speed: int = 15`.
  - `app.api.media.media_kind_of(filename: str) -> Literal["image", "audio"] | None` — по расширению из `IMAGE_EXT`/`AUDIO_EXT`.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_quizzes_api.py`

```python
CREAM = {"bg": "#FBF5EA", "text": "#2B2420", "accent": "#E2552F", "second": "#2F7FA8"}
NIGHT = {"bg": "#16192B", "text": "#F3F1EA", "accent": "#FF8A5B", "second": "#5CC8C2"}
IMG, MP3 = "a" * 32 + ".png", "b" * 32 + ".mp3"

def test_new_quiz_has_cream_theme_and_no_media(admin_client):
    quiz = admin_client.post("/api/quizzes", json={"title": "Q"}).json()["quiz"]
    assert quiz["theme"] == CREAM and quiz["background"] is None and quiz["lobby_music"] is None

def test_patch_quiz_theme_background_and_lobby_music(admin_client):
    qid = make_quiz(admin_client)
    p = admin_client.patch(f"/api/quizzes/{qid}", json={"theme": NIGHT, "background_filename": IMG, "lobby_music_filename": MP3})
    quiz = p.json()["quiz"]
    assert quiz["theme"] == NIGHT and quiz["background"]["url"] == f"/media/{IMG}" and quiz["lobby_music"]["kind"] == "audio"
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"theme": {**NIGHT, "bg": "red"}}).status_code == 422
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"background_filename": MP3}).status_code == 422
    assert admin_client.patch(f"/api/quizzes/{qid}", json={"lobby_music_filename": IMG}).status_code == 422
    quiz = admin_client.patch(f"/api/quizzes/{qid}", json={"background_filename": None}).json()["quiz"]
    assert quiz["background"] is None and quiz["theme"] == NIGHT

def test_patch_round_appearance_and_typewriter(admin_client):
    qid = make_quiz(admin_client)
    rnd = admin_client.post(f"/api/quizzes/{qid}/rounds", json={"title": "Т", "kind": "jeopardy"}).json()["quiz"]["rounds"][0]
    assert (rnd["typewriter"], rnd["type_speed"], rnd["background"], rnd["intro_music"]) == (False, 15, None, None)
    body = {"background_filename": IMG, "intro_music_filename": MP3, "think_music_filename": MP3, "typewriter": True, "type_speed": 20}
    rnd = admin_client.patch(f"/api/rounds/{rnd['id']}", json=body).json()["quiz"]["rounds"][0]
    assert rnd["background"]["kind"] == "image" and rnd["intro_music"]["kind"] == "audio" and rnd["think_music"]
    assert (rnd["typewriter"], rnd["type_speed"]) == (True, 20)
    assert admin_client.patch(f"/api/rounds/{rnd['id']}", json={"intro_music_filename": IMG}).status_code == 422
    assert admin_client.patch(f"/api/rounds/{rnd['id']}", json={"type_speed": 0}).status_code == 422
    rnd = admin_client.patch(f"/api/rounds/{rnd['id']}", json={"intro_music_filename": None}).json()["quiz"]["rounds"][0]
    assert rnd["intro_music"] is None and rnd["background"] is not None

def test_copy_quiz_copies_appearance(admin_client):
    # theme NIGHT, quiz background + lobby music, round background + typewriter → копия содержит всё то же

def test_old_db_gets_appearance_columns(tmp_path):
    # как test_old_db_without_cell_values_column_migrates: старая таблица quiz (id, title, logo_filename) с одной строкой
    # и старая round; после init_db: колонки есть, theme строки == CREAM (json), typewriter == 0, type_speed == 15
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_quizzes_api.py -q`
Expected: новые тесты FAIL (нет полей `theme`, `background`, …).

- [ ] **Step 3: Implement**
  - **Модели** — поля из Interfaces. `theme` хранится как `sa_column=Column(JSON, nullable=False)` с `default_factory=lambda: dict(DEFAULT_THEME)`.
  - **Миграция** `_add_missing_columns` превращается в цикл по `{table: [(column, ddl)]}`:
    - `quiz.theme JSON NOT NULL DEFAULT '<json.dumps(DEFAULT_THEME)>'`;
    - `VARCHAR` для имён файлов;
    - `typewriter BOOLEAN NOT NULL DEFAULT 0`;
    - `type_speed INTEGER NOT NULL DEFAULT 15`;
    - существующую `cell_values` сохранить.
  - **Загрузчик** `load_quiz_data` заполняет новые поля через `media_ref(filename, kind)`, если имя задано.
  - **API.** `QuizUpdate` получает `theme: Theme | None`, `background_filename: str | None`, `lobby_music_filename: str | None`. `RoundUpdate` получает три имени файлов, `typewriter: bool | None` и `type_speed: int | None = Field(ge=1, le=100)`.
    - Для полей с именами файлов явный `null` очищает значение. Для остальных полей тура `None` по-прежнему пропускается.
    - Проверка типа файла: фон должен быть `"image"`, иначе 422 «Фон должен быть картинкой». Музыка должна быть `"audio"`, иначе 422 «Музыка должна быть аудиофайлом».
    - `copy_quiz` переносит `theme`, `background_filename`, `lobby_music_filename`. Поля тура уже копируются через `model_dump`.

- [ ] **Step 4: Run the whole backend suite**

Run: `cd backend && uv run pytest -q`
Expected: всё PASS.

- [ ] **Step 5: Commit** — `feat(editor): quiz theme, backgrounds, music and typewriter settings`

---

### Task 2: Своя игра — вопрос стартует после раскрытия, печать по буквам

**Files:**
- Modify: `backend/app/game/constants.py`, `backend/app/game/state.py`, `backend/app/game/jeopardy.py`, `backend/app/game/views.py`
- Modify: `backend/tests/factories.py` и существующие тесты, открывающие ячейку (`test_jeopardy.py`, `test_scoring.py`, `test_views.py`)
- Test: `backend/tests/test_jeopardy.py`, `backend/tests/test_views.py`

**Interfaces:**
- Consumes: `RoundData.typewriter`, `RoundData.type_speed` (Task 1).
- Produces:
  - `constants.REVEAL_SECONDS = 1.2` (комментарий: держать в соответствии с `frontend/src/screen/motion.ts`).
  - `JeopardyState`: `starts_at: float | None = None`, `typed_base: float = 0.0`, `typing_since: float | None = None`.
  - `views.TypingView(BaseModel)`: `base: float`, `since: float | None`, `speed: int`.
  - `ScreenJeopardy`: `question_id: int | None`, `typing: TypingView | None`.
  - `tests.factories.reveal(g, clock)` — `clock.advance(REVEAL_SECONDS); g.tick()`.

- [ ] **Step 1: Update existing tests for the reveal delay**

Добавь `reveal` в `factories.py`. Во всех тестах, где после `OpenCell` обычного (не секретного) вопроса ждут открытых кнопок, полоску или нажатие, вызови `reveal(g, clock)` сразу после `OpenCell`. В `scripted_states()` из `test_views.py` для этого заведи шаг `("wait", REVEAL_SECONDS)`: он сдвигает часы и вызывает `g.tick()`. Вставь его после `OpenCell(question_id=1)`.

- [ ] **Step 2: Write the failing tests** in `test_jeopardy.py` (через `setup()`, у которого появятся `typewriter=False, speed=15`)

```python
def test_buttons_closed_during_reveal_then_open_instant():
    g, clock, (a, b, c) = setup()
    g.apply_admin(OpenCell(question_id=1))
    j = g.state.jeopardy
    assert (j.buttons, j.starts_at) == ("closed", 1000 + REVEAL_SECONDS)
    g.apply_team(a, BuzzCmd())
    assert j.answering_team_id is None and g.state.jeopardy.lockouts == {}
    clock.advance(REVEAL_SECONDS)
    assert g.tick() is True and g.state.jeopardy.buttons == "open" and g.state.jeopardy.starts_at is None

def test_bar_starts_after_reveal():
    # mode="bar": после reveal bar_ends_at == 1000 + REVEAL_SECONDS + 5; нажатие во время раскрытия не даёт lockout

def test_open_buttons_during_reveal_starts_question_now():
    # OpenCell, clock.advance(0.5), OpenButtons() → buttons "open", starts_at None

def test_question_audio_starts_after_reveal():
    # q3 с AUDIO: после OpenCell audio.action == "stop"; после reveal audio.action == "play"

def test_secret_audio_starts_on_recipient():
    # секрет с AUDIO: после OpenCell "stop", starts_at None; после SetSecretRecipient audio.action == "play"

def test_typing_freezes_on_buzz_resumes_after_wrong_and_undo_refreezes():
    g, clock, (a, b, c) = setup(typewriter=True, speed=10)
    g.apply_admin(OpenCell(question_id=1)); reveal(g, clock)
    j = g.state.jeopardy
    assert (j.typed_base, j.typing_since) == (0.0, 1000 + REVEAL_SECONDS)
    clock.advance(2); g.apply_team(a, BuzzCmd())
    assert (g.state.jeopardy.typed_base, g.state.jeopardy.typing_since) == (20.0, None)
    clock.advance(5); g.apply_admin(Judge(correct=False))
    assert g.state.jeopardy.typing_since == clock.t and g.state.jeopardy.typed_base == 20.0
    g.apply_admin(Undo())
    j = g.state.jeopardy
    assert (j.typing_since, j.typed_base, j.answering_team_id) == (None, 20.0, a)

def test_typing_off_by_default():
    # setup(): после reveal typing_since is None
```

В `test_views.py`:

```python
def test_screen_typing_view_only_for_live_typewriter_question():
    # раунд typewriter=True, speed=12: после reveal screen_view(...).jeopardy.typing == TypingView(base=0, since=start, speed=12)
    # и .question_id == 1; после Reveal() (фаза answer) typing is None; секретный вопрос → typing is None;
    # раунд без typewriter → typing is None
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && uv run pytest tests/test_jeopardy.py tests/test_views.py -q`
Expected: новые тесты FAIL. Обновлённые старые тоже падают, пока нет задержки. Это нормально.

- [ ] **Step 4: Implement in `jeopardy.py`**
  - `_open_cell`, обычный вопрос: `buttons="closed"`, `starts_at=now+REVEAL_SECONDS`, печать сброшена, `game.set_audio("stop")`. Секретный вопрос: `game.set_audio("stop")`.
  - Новая `_start_question(game, j, at: float) -> None`:
    - режим `instant` → `buttons="open"`;
    - режим `bar` → `buttons="bar"`, `bar_ends_at=at+bar_seconds`;
    - если `typewriter` → `typed_base=0`, `typing_since=at`;
    - `starts_at=None`;
    - `game.audio_for(question)`.
  - Вызовы `_start_question`:
    - `tick()`: фаза `question`, `starts_at` задан, `now >= starts_at` → `_start_question(game, j, j.starts_at)`, вернуть `True`;
    - `_open_buttons` при заданном `starts_at`: `_start_question(game, j, now)`, затем открыть кнопки;
    - иначе `_open_buttons` работает как раньше.
  - Принятое нажатие в `_buzz`: если `typing_since` задан, `typed_base += (now - typing_since) * type_speed`, затем `typing_since = None`.
  - `_after_wrong`, ветка повторного открытия: при `typewriter` и не секрете ставь `typing_since = now`.
  - `_set_secret_recipient`: `game.audio_for(question)`.
  - `_to_board`, `_reveal`, ✓ и уход в ответ: `starts_at=None`, `typing_since=None`.
  - Во views: `question_id` = id текущего вопроса вне фазы `board`. `typing` задан, только если у тура `typewriter`, фаза `question` и вопрос не секрет.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && uv run pytest -q`
Expected: всё PASS.

- [ ] **Step 6: Commit** — `feat(jeopardy): question starts after the reveal animation, typewriter printing`

---

### Task 3: Разбор — ответ по кнопке ведущего

**Files:**
- Modify: `backend/app/game/state.py`, `backend/app/game/commands.py`, `backend/app/game/freeinput.py`, `backend/app/game/views.py`
- Test: `backend/tests/test_freeinput.py`, `backend/tests/test_views.py`

**Interfaces:**
- Produces:
  - `FreeState.answer_shown: bool = False`;
  - команда `ReviewShowAnswer` (`type="review_show_answer"`) в `AdminCommand`;
  - `ScreenQuestion.highlight_option: int | None`. Имя выбрано намеренно: ключ `correct_option` не должен появляться в JSON экрана, это проверяет существующий тест.

- [ ] **Step 1: Write the failing tests**

В `test_freeinput.py`:
- `test_review_answer_hidden_until_shown`:
  - `StartReview` → `answer_shown is False`, `revealed == []`;
  - `ReviewShowAnswer` → `True`, `revealed == [id вопроса 0]`;
  - `ReviewGoto(1)` → `False`, `ReviewGoto(0)` → снова `False`;
  - `ReviewShowAnswer` вне разбора → `GameError`.
- В `test_review_only_moves_screen` ожидание `revealed == [1, 2]` замени: `revealed` пополняется только через `ReviewShowAnswer`.

В `test_views.py`:
- В `scripted_states()` после `StartReview()` и после `ReviewGoto(index=1)` добавь `ReviewShowAnswer()`.
- В `test_screen_view_answer_only_when_revealed` признак показа:

```python
revealed = (s.jeopardy and s.jeopardy.phase == "answer") or (g.state.free and g.state.free.phase == "review" and g.state.free.answer_shown)
```

- Новый тест `test_review_highlight_option_only_after_show`: для вопроса 4 (варианты, верный 1) после `ReviewGoto(1)` → `highlight_option is None`, `answer is None`; после `ReviewShowAnswer` → `highlight_option == 1`, `answer == SECRET_ANS`.

- [ ] **Step 2: Run to verify they fail** — `cd backend && uv run pytest tests/test_freeinput.py tests/test_views.py -q` → FAIL.

- [ ] **Step 3: Implement**
  - `_enter_review` ставит `answer_shown=False` и больше не трогает `revealed`.
  - `_review_show_answer` проверяет фазу `review`, иначе `GameError("Разбор ещё не начат")`. Ставит `answer_shown=True` и добавляет id в `revealed` без повторов.
  - `_screen_free` отдаёт `answer` и `highlight_option` только при `review` и `answer_shown`. У своей игры `highlight_option=None`.

- [ ] **Step 4: Run the whole backend suite** — `uv run pytest -q` → PASS.

- [ ] **Step 5: Commit** — `feat(review): show the answer on the screen by the host's button`

---

### Task 4: Фоновая музыка на сервере

**Files:**
- Create: `backend/app/game/music.py`, `backend/tests/test_music.py`
- Modify: `backend/app/game/state.py`, `backend/app/game/commands.py`, `backend/app/game/engine.py`, `backend/app/game/freeinput.py`, `backend/app/game/views.py`

**Interfaces:**
- Consumes: `QuizData.lobby_music`, `RoundData.intro_music`, `RoundData.think_music` (Task 1).
- Produces:
  - `GameState.music_seq: int = 0`, `GameState.music_paused: bool = False`.
  - `Game.new_music_context() -> None` — `music_seq += 1`, `music_paused = False`.
  - команда `MusicToggle` (`type="music_toggle"`).
  - `music.MusicNow(BaseModel)`: `url: str`, `key: str`, `playing: bool`.
  - `music.current_music(game) -> MusicNow | None`.
  - `music.HANDLERS = {MusicToggle: _toggle}`, подмешан в `engine.HANDLERS`.
  - `ScreenView.music: MusicNow | None`, `AdminState.music: MusicNow | None`, `AdminState.music_paused: bool`.

Правила `current_music` (трек `None` → результат `None`):

| Стадия | Трек | Ключ | `playing` |
|---|---|---|---|
| `lobby` | `quiz.lobby_music` | `lobby:{seq}` | `not paused and overlay is None` |
| `intro` | `round.intro_music` | `intro:{seq}` | `not paused and overlay is None` |
| `free`, фаза `question`, таймер `running`/`paused`, у вопроса нет аудио | `round.think_music` | `think:{seq}` | `not paused and overlay is None and timer.status == "running"` |
| иначе | — | — | — |

`new_music_context()` вызывается в `_start_game`, `_next_round` и в `freeinput._open` (каждое открытие вопроса, включая первое).

- [ ] **Step 1: Write the failing tests** in `test_music.py` (через `factories`; медиа `media_ref("d"*32+".mp3", "audio")`)
  - `test_lobby_music_plays_and_none_without_track`: ключ `"lobby:0"`, `playing` True; квиз без музыки лобби → `None`.
  - `test_intro_music_new_key_per_round_and_toggle_reset`:
    - `StartGame` → ключ `"intro:1"`;
    - `MusicToggle` → `playing` False, `music_paused` True;
    - `NextRound` → ключ `"intro:2"`, `playing` True.
  - `test_leaderboard_overlay_pauses_without_new_context`: на заставке `SetOverlay(overlay="leaderboard")` → `playing` False, ключ не меняется. `SetOverlay(overlay=None)` → `playing` True с тем же ключом.
  - `test_think_music_follows_timer`:
    - до `TimerStart` → `None`;
    - после старта ключ `think:{n}`, `playing` True;
    - `TimerPause` → False с тем же ключом, `TimerResume` → True;
    - `TimerFinish` → `None`;
    - `OpenQuestion(1)` + `TimerStart` → ключ другой.
  - `test_no_think_music_on_audio_question` — вопрос с аудио, таймер идёт → `None`.
  - `test_toggle_without_music_is_error` — своя игра → `MusicToggle` → `GameError`. Сообщение «Сейчас фоновая музыка не играет».
  - `test_views_carry_music`: `screen_view(...).music` и `admin_view(...).state.music` равны `current_music(g)`. `team_view` JSON не содержит `".mp3"`.

- [ ] **Step 2: Run to verify they fail** — `uv run pytest tests/test_music.py -q` → FAIL.

- [ ] **Step 3: Implement**
  - `music.py`: `current_music` по таблице, `_toggle` бросает `GameError`, если `current_music` → `None`.
  - Тип `Game` в `music.py` импортируется только под `TYPE_CHECKING`, как в `jeopardy.py`.

- [ ] **Step 4: Run the whole backend suite** — `uv run pytest -q` → PASS.

- [ ] **Step 5: Commit** — `feat(music): lobby, intro and thinking background music driven by the server`

---

### Task 5: Тема и фоны в снимках, предзагрузка, звук экрана на пульте

**Files:**
- Modify: `backend/app/game/views.py`, `backend/app/ws/hub.py`
- Test: `backend/tests/test_views.py`, `backend/tests/test_ws_flow.py`

**Interfaces:**
- Consumes: Task 1 (поля квиза и тура), Task 4 (`current_music`).
- Produces:
  - `ScreenView`: `theme: Theme`, `background_url: str | None`, `quiz_background_url: str | None`.
  - `TeamView.theme: Theme`.
  - `AdminView.screen_sound: Literal["none", "on", "off"]`.
  - `admin_view(game, join_url, online, screen_sound="none")`.
  - `hub.screen_sound_status(flags: Iterable[bool]) -> Literal["none", "on", "off"]`: нет экранов → `"none"`, хоть один `True` → `"on"`, иначе `"off"`.
  - Сообщение экрана серверу: `{"type": "sound", "on": bool}`.
  - Сообщение телефону `{"type": "need_join", "theme": {...}}`. Тема есть всегда, когда игра есть.

Правила:
- **Фон.** `lobby`/`finished` → фон квиза; `intro`/`jeopardy`/`free` → фон тура, иначе фон квиза.
- **`preload`** (без повторов, по порядку):
  1. медиа вопросов текущего тура (как сейчас, только на стадиях тура);
  2. фон квиза и музыка лобби;
  3. фон, музыка заставки и музыка размышления тура `round_index` (если он в пределах);
  4. фон и музыка заставки тура `round_index + 1`.

  В лобби `round_index = -1`, поэтому «следующий» тур — первый.

- [ ] **Step 1: Write the failing tests**

В `test_views.py`:
- `test_theme_and_backgrounds_per_stage`:
  - квиз: тема Ночь, фон квиза, у тура 1 свой фон, у тура 2 нет;
  - лобби: `background_url` = фон квиза;
  - заставка и табло тура 1 → фон тура;
  - заставка тура 2 → фон квиза;
  - `quiz_background_url` всегда = фон квиза;
  - `team_view(...).theme` = Ночь;
  - JSON `team_view` не содержит `"/media/"`.
- `test_preload_includes_appearance_media`: в лобби `preload` содержит фон квиза, музыку лобби, фон и заставку тура 1, но не их же у тура 2. Существующий `test_screen_preload_lists_round_media` остаётся зелёным (в его квизе нет медиа оформления).

В `test_ws_flow.py`:
- `test_screen_sound_status_reaches_admin`:
  - старт игры, админ-сокет;
  - `client.post("/api/screen/auth", json={"key": screen_key(settings)})`, сокет `/ws/screen`;
  - админ дожидается `screen_sound == "off"`;
  - экран шлёт `{"type": "sound", "on": True}` → админ дожидается `"on"`;
  - после закрытия экрана → `"none"`.
- `test_need_join_carries_theme`: телефон без токена получает `need_join` с `theme["bg"] == "#FBF5EA"`.
- `test_screen_sound_status_any_on`, юнит:

```python
assert screen_sound_status([]) == "none"
assert screen_sound_status([False, True]) == "on"
assert screen_sound_status([False]) == "off"
```

- [ ] **Step 2: Run to verify they fail** — `uv run pytest tests/test_views.py tests/test_ws_flow.py -q` → FAIL.

- [ ] **Step 3: Implement**
  - Views: `_preload(game)` с новой сигнатурой и `_background(game)`.
  - Hub:
    - `self.screen_sound: dict[WebSocket, bool]`;
    - при подключении экрана — `False` и рассылка админам;
    - сообщение `sound` обновляет флаг под `self.lock` и рассылает админам;
    - при отключении — удалить и разослать;
    - все `need_join` строятся через `_need_join_message()`.

- [ ] **Step 4: Run the whole backend suite** — `uv run pytest -q` → PASS.

- [ ] **Step 5: Commit** — `feat(views): theme and backgrounds in snapshots, appearance preload, screen sound status`

---

### Task 6: Типы фронта, тема и печать как чистые функции

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/theme.ts`, `frontend/src/lib/typing.ts`, `frontend/tests/theme.test.ts`, `frontend/tests/typing.test.ts`

**Interfaces:**
- Consumes: формы снимков из Tasks 1–5.
- Produces:
  - **`types.ts`** зеркалит все новые поля:
    - `Theme`, `MusicNow`, `TypingView`;
    - `QuizData.theme/background/lobby_music`;
    - `RoundData.background/intro_music/think_music/typewriter/type_speed`;
    - `JeopardyState.starts_at/typed_base/typing_since`;
    - `FreeState.answer_shown`;
    - `ScreenQuestion.highlight_option`;
    - `ScreenJeopardy.question_id/typing`;
    - `ScreenView.theme/background_url/quiz_background_url/music`;
    - `TeamView.theme`;
    - `AdminState.music/music_paused`;
    - `AdminView.screen_sound`;
    - `need_join` с `theme?: Theme`;
    - команды `music_toggle`, `review_show_answer`.
  - **`theme.ts`:**
    - `THEME_PRESETS: { id: "cream" | "mint" | "lavender" | "night"; name: string; theme: Theme }[]` (имена «Сливки», «Мята», «Лаванда», «Ночь»);
    - `DEFAULT_THEME: Theme`;
    - `mix(a: string, b: string, t: number): string` — hex, `t=0` → `a`, `t=1` → `b`, каналы округляются;
    - `contrast(a: string, b: string): number` — WCAG-отношение;
    - `onAccent(accent: string, bg: string): string` — `"#ffffff"` или `bg`, у кого контраст с акцентом больше;
    - `themeVars(theme: Theme): Record<string, string>` — ключи `--bg --text --accent --second --surface --muted --line --accent-dim --second-dim --on-accent --shadow`;
    - `presetOf(theme: Theme): string | null` — id пресета при совпадении всех четырёх цветов без учёта регистра.
  - **`typing.ts`:** `typedChars(t: TypingView | null, now: number, length: number): number`:
    - `null` → `length`;
    - иначе `min(length, floor(base + (since === null ? 0 : max(0, now - since) * speed)))`.

Формулы производных цветов. Светлая тема — когда яркость `bg` по WCAG > 0.5.

| Переменная | Значение |
|---|---|
| `--surface` | светлая тема: `mix(bg, #ffffff, 0.75)`; тёмная: `mix(bg, text, 0.08)` |
| `--muted` | `mix(text, bg, 0.45)` |
| `--line` | `mix(bg, text, 0.12)` |
| `--accent-dim` | `mix(bg, accent, 0.25)` |
| `--second-dim` | `mix(bg, second, 0.25)` |
| `--on-accent` | `onAccent(accent, bg)` |
| `--shadow` | `rgb(<text> / 0.08)` для светлой, `rgb(0 0 0 / 0.25)` для тёмной |

- [ ] **Step 1: Write the failing tests**

```ts
// theme.test.ts
assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
assert.equal(onAccent("#E2552F", "#FBF5EA"), "#ffffff");
assert.equal(onAccent("#FF8A5B", "#16192B"), "#16192B");
assert.equal(themeVars(DEFAULT_THEME)["--on-accent"], "#ffffff");
assert.deepEqual(Object.keys(themeVars(DEFAULT_THEME)).sort(), [...11 ключей].sort());
assert.equal(presetOf({ bg: "#16192b", text: "#F3F1EA", accent: "#FF8A5B", second: "#5CC8C2" }), "night");
assert.equal(presetOf({ ...DEFAULT_THEME, accent: "#000000" }), null);
assert.equal(THEME_PRESETS.length, 4); // цвета пресетов — из Global Constraints

// typing.test.ts
assert.equal(typedChars(null, 100, 42), 42);
assert.equal(typedChars({ base: 0, since: 10, speed: 15 }, 12, 100), 30);
assert.equal(typedChars({ base: 20.7, since: null, speed: 15 }, 999, 100), 20);
assert.equal(typedChars({ base: 0, since: 10, speed: 15 }, 9, 100), 0);   // часы экрана чуть отстают
assert.equal(typedChars({ base: 90, since: 10, speed: 15 }, 20, 100), 100);
```

- [ ] **Step 2: Run** `cd frontend && npm test` → FAIL (модулей нет).
- [ ] **Step 3: Implement** `theme.ts`, `typing.ts`, `types.ts`.
- [ ] **Step 4: Run** `npm test && npm run build` → PASS.
- [ ] **Step 5: Commit** — `feat(front): theme presets and derived colours, typewriter progress, new snapshot types`

---

### Task 7: Тема на экране и телефонах, экран отдельным чанком

**Files:**
- Modify: `frontend/src/theme.css`, `frontend/src/screen/screen.css`, `frontend/src/play/play.css`, `frontend/src/screen/ScreenApp.tsx`, `frontend/src/play/PlayApp.tsx`, `frontend/src/play/*View.tsx` (только классы), `frontend/src/components/BuzzBar.tsx` (комментарий), `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `themeVars`, `DEFAULT_THEME` (Task 6).
- Produces:
  - CSS-класс `.hall` (заменяет `.dark`): `background: var(--bg); color: var(--text)`.
  - Постоянные переменные в `:root`: `--buzz-go: #E5484D`, `--buzz-me: #2E9E5B`, `--danger: #E5484D`.
  - В `:root` также лежат значения `themeVars(DEFAULT_THEME)`, их видит админка.

- [ ] **Step 1: Перевести CSS на переменные темы**
  - В `theme.css`:
    - убрать `--dark-*`, `--blue*`, `--accent-dim`;
    - `body` и `.hall` берут `--bg`/`--text`;
    - `.phase-timer`: обсуждение — `--accent`/`--accent-dim`, ввод — `--second`/`--second-dim`, приглушённое — `--muted`;
    - `.buzz-bar`: дорожка `--line`, заливка `--text`.
  - В `screen.css` и `play.css` заменить все `--dark-*` и зашитые цвета (`#c8c8cc`, `#2c2c30`, `#ccc`, `#fff`, `#8d8d92`, `rgb(18 18 20)`, `#444`, `#aaa`) на переменные темы.
  - На телефоне:
    - `.buzzer.active` → `var(--buzz-go)`;
    - `.buzzer.me` и подпись «Вы отвечаете!» → `var(--buzz-me)`;
    - офлайн-баннер и ошибки → `var(--danger)`.

- [ ] **Step 2: Применить тему**
  - `ScreenApp`: корень `className="hall scr-root"`, `style={themeVars(view?.theme ?? DEFAULT_THEME)}`.
  - `PlayApp` хранит `theme` в состоянии:
    - из `state.view.theme` и из `need_join.theme`;
    - `no_game` → `DEFAULT_THEME`;
    - корень `className="hall play"`, `style={themeVars(theme)}`;
    - эффект ставит `document.body.style.background = theme.bg` (перетяжка на iOS).
  - `App.tsx`: `const ScreenApp = lazy(() => import("./screen/ScreenApp"))` внутри `Suspense fallback={null}`, как админка.

- [ ] **Step 3: Verify**

Run: `cd frontend && npm test && npm run build`
Expected: PASS. В выводе сборки экран — отдельный чанк.

Вручную (бэк + `npm run dev`): `/screen` и `/play` в «Сливках».
- Кнопка «ЖМИ» красная, «Вы отвечаете!» зелёная.
- В админке таймер свободного ввода читается.

- [ ] **Step 4: Commit** — `feat(theme): quiz theme on the hall screen and phones, screen as a lazy chunk`

---

### Task 8: Редактор — оформление квиза и тура, настройки печати

**Files:**
- Create: `frontend/src/admin/MediaField.tsx`, `frontend/src/admin/QuizAppearance.tsx`
- Modify: `frontend/src/admin/QuizEditor.tsx`, `frontend/src/admin/RoundSettings.tsx`

**Interfaces:**
- Consumes: `THEME_PRESETS`, `presetOf` (Task 6); API из Task 1; `uploadMedia` из `src/lib/api.ts`.
- Produces:
  - `MediaField(props: { label: string; description?: string; kind: "image" | "audio"; value: MediaRef | null; disabled: boolean; onChange: (filename: string | null) => void })`:
    - картинка → маленькое превью, аудио → `<audio controls>`;
    - «Загрузить» (`FileButton`) и «×»;
    - если загружен файл не того типа → `notifyError` («Нужна картинка» / «Нужен аудиофайл»).
  - `QuizAppearance(props: { quiz: QuizData; locked: boolean; mutate: Mutate })`.

- [ ] **Step 1: `QuizAppearance` под шапкой квиза в `QuizEditor`**
  - `SectionLabel` «Оформление».
  - Четыре образца темы: кнопки с полосками четырёх цветов и названием. Активный — `presetOf(quiz.theme)`. Клик → `PATCH {theme}`.
  - Четыре `ColorInput` («Фон», «Текст», «Акцент», «Цвет ввода»), формат hex. `onChangeEnd` → `PATCH {theme: {...quiz.theme, [key]: value}}`.
  - `MediaField` «Фон по умолчанию» с описанием «лучше 1920×1080, украшения по краям, центр спокойный».
  - `MediaField` «Музыка лобби».

- [ ] **Step 2: Блок «Оформление» в `RoundSettings`**
  - `MediaField` «Фон тура» с описанием «пусто — фон квиза».
  - «Музыка заставки».
  - Только для `free`: «Музыка размышления» (играет, пока идёт таймер).
  - Только для `jeopardy`: `Checkbox` «Печатать вопрос по буквам». Если отмечен — `NumberField` «Скорость печати, знаков в секунду» (min 1).

- [ ] **Step 3: Verify** — `npm run build` PASS.

Вручную:
- выбрать «Ночь» и поправить акцент;
- загрузить фон и музыку, убрать их «×»;
- отметить печать;
- всё сохраняется после перезагрузки страницы;
- в квизе с идущей игрой поля недоступны.

- [ ] **Step 4: Commit** — `feat(editor): appearance block for quiz and round, typewriter settings`

---

### Task 9: Motion, сцены и новые заголовки

**Files:**
- Modify: `frontend/package.json` (`"motion": "12.43.0"`), `CLAUDE.md` (строка про Motion в разделе «Стек»), `frontend/src/screen/ScreenApp.tsx`, `frontend/src/screen/views/QuestionView.tsx`, `frontend/src/screen/screen.css`
- Create: `frontend/src/screen/scene.ts`, `frontend/src/screen/motion.ts`, `frontend/src/screen/SceneStage.tsx`, `frontend/src/screen/useSceneSequence.ts`, `frontend/src/screen/views/SceneHeader.tsx`, `frontend/tests/scene.test.ts`

**Interfaces:**
- Consumes: `ScreenView` (Task 6).
- Produces:

```ts
// scene.ts
export type Scene =
  | { kind: "blank"; key: "blank" }
  | { kind: "lobby"; key: "lobby" }
  | { kind: "intro"; key: string }                        // intro:{round}
  | { kind: "board"; key: string }                        // board:{round}
  | { kind: "secret"; key: string; questionId: number }   // secret:{qid}
  | { kind: "jq"; key: string; questionId: number }       // jq:{qid} — вопрос и ответ своей игры
  | { kind: "free"; key: string; number: number }         // free:{round}:{number}
  | { kind: "review"; key: string; number: number }       // review:{round} — номер меняется внутри сцены
  | { kind: "winner"; key: "winner" };
export function sceneOf(view: ScreenView | null): Scene;

export type Entrance = "none" | "fade" | "zoom" | "title";
export interface Transition { entrance: Entrance; holdMs: number } // holdMs: сколько ещё держать прежнюю сцену (мигание ячейки)
export function planTransition(prev: Scene | null, next: Scene): Transition;

// motion.ts — тайминги и варианты анимаций (данные, не код сцен)
export const REVEAL_MS = 1200; // = backend REVEAL_SECONDS
export const BLINK_MS = 110;   // одно включение/выключение, мигание = 4 × BLINK_MS
export const ZOOM_MS = 420, CONTENT_MS = 250, TITLE_POP_MS = 350, TITLE_HOLD_MS = 200, TITLE_FLY_MS = 400;
export const ZOOM_TOTAL_MS = 4 * BLINK_MS + ZOOM_MS + CONTENT_MS;
export const TITLE_TOTAL_MS = TITLE_POP_MS + TITLE_HOLD_MS + TITLE_FLY_MS + CONTENT_MS;
export const variants: { fade; rise; pop; slide; staggerPop } // объекты вариантов Motion

// useSceneSequence.ts
export function useSceneSequence(scene: Scene): { shown: Scene; entrance: Entrance; blinkId: number | null };

// SceneHeader.tsx
export function SceneHeader(props: { main: string; tail?: string; layoutId?: string }): JSX.Element;
```

Правила `planTransition`:
- `prev === null` или ключи равны → `none`, 0.
- `board` → `jq` → `zoom`, `4 * BLINK_MS`.
- `jq` из чего-то кроме `board` и `secret` → `title`, 0.
- `free` → `title`, 0. В `review` не из `review` → `title`, 0.
- Иначе `fade`, 0.

`useSceneSequence` держит показанную сцену. На новую сцену считает `planTransition(shown, newest)`. При `holdMs > 0` отдаёт `blinkId` и подменяет `shown` после задержки. Пришедшая во время задержки новая сцена отменяет таймер, и расчёт идёт заново от показанной сцены.

- [ ] **Step 1: Write the failing tests** in `scene.test.ts`. Фикстура `view(overrides)` собирает минимальный `ScreenView`.

```ts
assert.deepEqual(sceneOf(null), { kind: "blank", key: "blank" });
// lobby / intro:0 / board:0 / secret:7 / jq:7 (фаза question и answer — один ключ) / free:1:3 / review:1 с number / winner
assert.equal(sceneOf(view({ stage: "free", free: { phase: "review", number: 2 } })).key, sceneOf(view({ stage: "free", free: { phase: "review", number: 3 } })).key);
assert.deepEqual(planTransition(null, board), { entrance: "none", holdMs: 0 });
assert.deepEqual(planTransition(board, jq7), { entrance: "zoom", holdMs: 4 * BLINK_MS });
assert.equal(planTransition(jq5, jq7).entrance, "title");      // ответ → сразу следующая ячейка
assert.equal(planTransition(secret7, jq7).entrance, "fade");
assert.equal(planTransition(board, board).entrance, "none");   // прерывание: во время мигания снова табло
assert.equal(planTransition(free1, review).entrance, "title");
assert.equal(planTransition(review, review).entrance, "none");
assert.ok(ZOOM_TOTAL_MS <= REVEAL_MS && TITLE_TOTAL_MS <= REVEAL_MS);
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement**
  - `npm install --save-exact motion@12.43.0`.
  - `scene.ts`, `motion.ts`, `useSceneSequence.ts`.
  - `SceneStage`: `LayoutGroup` + `AnimatePresence initial={false}` по `shown.key`. Вход и выход сцены — по `entrance`; в этой задаче `zoom` и `title` пока работают как `fade`.
  - `ScreenApp` рендерит текущие view-компоненты через `SceneStage`.
  - `SceneHeader` стоит слева вверху рядом с эмблемой: `main` — акцент и жирный, `tail` — `--muted`. Без эмблемы заголовок начинается от левого поля.
  - `QuestionView` показывает `SceneHeader` вместо `.scr-tag`:
    - свободный ввод — `Вопрос {n}` / ` из {total}`;
    - своя игра — `question.title`;
    - разбор — `Правильные ответы` / ` · вопрос {n} из {total}`.
  - `.scr-tag` удалить.
  - В `CLAUDE.md` дописать: «Анимации общего экрана на Motion (`motion/react`); экран — отдельный ленивый чанк, в `/play` Motion не импортируй».

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS.

Вручную:
- сцены сменяются перетеканием;
- перезагрузка экрана посреди вопроса показывает его сразу, без анимации;
- заголовки как в `mockups/screen-polish-transitions.html`.

- [ ] **Step 5: Commit** — `feat(screen): scene model on Motion, bold question headers`

---

### Task 10: Звук, полный экран, фоны и фоновая музыка на экране; музыка и звук на пульте

**Files:**
- Create: `frontend/src/screen/SoundControls.tsx`, `frontend/src/screen/Backdrop.tsx`, `frontend/src/screen/musicPlan.ts`, `frontend/src/screen/useBackgroundMusic.ts`, `frontend/tests/musicPlan.test.ts`
- Modify: `frontend/src/screen/ScreenApp.tsx`, `frontend/src/screen/screen.css`, `frontend/src/admin/console/Console.tsx`

**Interfaces:**
- Consumes:
  - `ScreenView.music/background_url/quiz_background_url`, `AdminState.music/music_paused`, `AdminView.screen_sound` (Task 6);
  - `useScreenAudio` (уже есть, возвращает функцию разблокировки).
- Produces:

```ts
// musicPlan.ts
export type MusicStep = "none" | "load-play" | "load-pause" | "play" | "pause" | "fade-out";
export function musicStep(prev: MusicNow | null, next: MusicNow | null): MusicStep;
// next null: prev null → none, иначе fade-out; другой key или url → next.playing ? load-play : load-pause;
// тот же key: playing не изменился → none, иначе play / pause

// useBackgroundMusic.ts — свой <audio loop>; возвращает функцию разблокировки (звать внутри клика)
export function useBackgroundMusic(music: MusicNow | null, unlocked: boolean): () => void;
export const MUSIC_FADE_MS = 1000;

// SoundControls.tsx
export function SoundControls(props: { soundOn: boolean; onSound: () => void }): JSX.Element;

// Backdrop.tsx — картинка на весь экран (cover), перетекание ~0.5 с при смене url; onError — слой скрывается
export function Backdrop(props: { url: string | null }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests** in `musicPlan.test.ts`

```ts
const m = (key: string, playing = true, url = "/media/a.mp3") => ({ key, playing, url });
assert.equal(musicStep(null, null), "none");
assert.equal(musicStep(null, m("lobby:0")), "load-play");
assert.equal(musicStep(null, m("intro:1", false)), "load-pause");
assert.equal(musicStep(m("intro:1", false), m("intro:1")), "play");          // сняли рейтинг
assert.equal(musicStep(m("think:3"), m("think:3", false)), "pause");
assert.equal(musicStep(m("think:3"), m("think:3")), "none");                  // переподключение с тем же ключом
assert.equal(musicStep(m("think:3"), m("think:4")), "load-play");
assert.equal(musicStep(m("think:3"), null), "fade-out");
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement**
  - **Иконки и разблокировка звука.** Плашку `.scr-gate` удалить. `SoundControls` — две полупрозрачные иконки справа вверху, ярче при наведении:
    - звук: 🔇 пока выключен, 🔊 после;
    - полный экран ⛶: `requestFullscreen` только по этой иконке.
  - `enableSound()` разблокирует оба плеера и `AudioContext` сигнала и ставит `unlocked`. Её вызывают:
    - клик по иконке звука;
    - первый `pointerdown` в любом месте окна (слушатель снимается после первого раза).
  - **Автозапуск.** При загрузке создать `AudioContext`; если `state === "running"`, браузер разрешает звук → `setUnlocked(true)` без клика.
  - **Отчёт серверу.** `ScreenApp` берёт `send` из `useSocket` и шлёт `{"type": "sound", "on": unlocked}`, когда меняется `unlocked` и когда сокет снова `open`.
  - **Фон.** `Backdrop` — первый слой под сценой с `view.background_url`. Слой рейтинга рисуется со своим `Backdrop url={view.quiz_background_url}`.
  - **`useBackgroundMusic`** выполняет `musicStep(prev, next)`:
    - `load-*` — сменить `src`, `currentTime = 0`;
    - `fade-out` — громкость к 0 за `MUSIC_FADE_MS`, потом пауза; новый `load-play` во время затихания отменяет его;
    - после разблокировки текущая играющая музыка запускается (`load-play`).
  - **Пульт** (`Console.tsx`, шапка):
    - при `st.music` — кнопка `Музыка ⏸` / `Музыка ▶` по `st.music_paused` → `{type: "music_toggle"}`;
    - при `view.screen_sound === "off"` — `Badge color="red"` «На экране выключен звук — кликните по окну экрана».

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS.

Вручную на квизе с фоном квиза, фоном тура, музыкой лобби, заставки и размышления:
- **Звук.** Плашки нет. Пока нет клика, на пульте висит предупреждение; клик в любом месте экрана включает звук, и предупреждение пропадает.
- **Музыка лобби** играет. После «Начать игру» звучит заставка, после «Начать тур» затихает.
- **Музыка размышления** идёт с таймером: встаёт на паузу вместе с ним и затихает в конце.
- **Пауза с пульта.** Кнопка «Музыка ⏸» на пульте останавливает и продолжает музыку.
- **Рейтинг** глушит музыку, после снятия она продолжается.
- **Удалённый файл.** Удали файл фона из `data/media`: на экране цвет темы без битой картинки, игра идёт (Review Focus 5).

- [ ] **Step 5: Commit** — `feat(screen): sound and fullscreen icons, backgrounds, background music; console music button`

---

### Task 11: Своя игра — мигание и раскрытие, ответ, печать на экране и пульте

**Files:**
- Create: `frontend/src/screen/views/TypedText.tsx`, `frontend/src/screen/views/TitleIntro.tsx`
- Modify: `frontend/src/screen/views/BoardView.tsx`, `frontend/src/screen/views/QuestionView.tsx`, `frontend/src/screen/SceneStage.tsx`, `frontend/src/screen/ScreenApp.tsx`, `frontend/src/screen/screen.css`, `frontend/src/admin/console/JeopardyPanel.tsx`, `frontend/src/admin/console/common.tsx`

**Interfaces:**
- Consumes: `useSceneSequence` (`blinkId`, `entrance`), `variants`, тайминги (Task 9); `typedChars` (Task 6); `ScreenJeopardy.question_id/typing` (Task 6).
- Produces:

```ts
// TypedText.tsx — напечатанная часть + курсор + невидимый остаток (занимает место, раскладка не прыгает)
export function TypedText(props: { text: string; typing: TypingView | null; now: () => number }): JSX.Element;
// TitleIntro.tsx — крупный заголовок в центре, затем он улетает в SceneHeader с тем же layoutId, после — children
export function TitleIntro(props: { title: string; layoutId: string; play: boolean; children: ReactNode }): JSX.Element;
// common.tsx: QuestionBox получает необязательный typed?: number — напечатанная часть обычным цветом, остаток dimmed
```

- [ ] **Step 1: Board → вопрос** (эталон `mockups/screen-polish-typing.html`)
  - Ячейки `BoardView` — `motion.div` с `layoutId={`cell-${question_id}`}`.
  - При `blinkId` ячейка дважды мигает акцентом, `4 × BLINK_MS`.
  - Контейнер вопроса своей игры — `motion.div` с тем же `layoutId`. Он раскрывается за `ZOOM_MS`, фон уходит из акцента в `--bg`. Затем за `CONTENT_MS` проявляются заголовок и текст.
  - Возврат к табло: ячейки появляются волной `staggerPop`.
  - Вход `title` (ответ → сразу следующая ячейка): `TitleIntro` с `question.title`.

- [ ] **Step 2: Ответ, «Отвечает», секрет**
  - **Ответ (фаза `answer`).** Текст вопроса тускнеет до 0.55 и уменьшается до 0.9 от левого верхнего угла. Строка «Ответ: …» появляется вариантом `pop`.
  - **«Отвечает: …».** Появляется `pop`, при уходе сдвигается вбок.
  - **«Секрет!».** `pop` и короткое покачивание.
  - **Полоска кнопки** (`BuzzBar`) показывается только при `buttons === "bar"`, как сейчас.

- [ ] **Step 3: Печать на экране** — текст обычного вопроса рендерится через `TypedText`:
  - `typing` и `now` из `useServerClock`;
  - курсор мигает, пока идёт печать, и замирает при `since === null`;
  - курсор исчезает, когда напечатано всё;
  - пока идёт раскрытие (`base=0`, `since=null`), текста не видно, но место под ним занято.
  - При `typing === null` — весь текст.

- [ ] **Step 4: Пульт**
  - В `JeopardyPanel` новая ветка до «Кнопки открыты»: при `j.starts_at !== null` — «Вопрос раскрывается на экране…» и кнопка «Открыть кнопки сейчас».
  - При `round.typewriter` и фазе `question` в `QuestionBox` передаётся `typed`:

```ts
typedChars({ base: j.typed_base, since: j.typing_since, speed: round.type_speed }, now(), text.length)
```

  Пульт перерисовывается `useTicker(100)` только пока идёт печать.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: PASS.

Вручную по прототипу, режимы «сразу» и «полоска», с печатью и без:
- клик ячейки → мигание → раскрытие → текст. Кнопки на телефоне открываются вместе с началом текста;
- нажатие останавливает печать, ✗ продолжает её, ✓ показывает весь текст и ответ;
- **прерывание:** «Показать ответ» и «К сетке» во время раскрытия — экран приходит к табло без застрявших слоёв (Review Focus 1);
- перезагрузка экрана посреди печати продолжает с того же места.

- [ ] **Step 6: Commit** — `feat(screen): jeopardy cell blink and expand, answer pop, typewriter on screen and console`

---

### Task 12: Свободный ввод и разбор — номер в заголовок, «Правильные ответы», кнопка ответа

**Files:**
- Create: `frontend/src/screen/views/ReviewView.tsx`
- Modify: `frontend/src/screen/views/QuestionView.tsx`, `frontend/src/screen/ScreenApp.tsx`, `frontend/src/screen/screen.css`, `frontend/src/admin/console/ReviewPanel.tsx`

**Interfaces:**
- Consumes: `TitleIntro`, `SceneHeader`, `variants` (Tasks 9, 11); `ScreenQuestion.highlight_option`, `FreeState.answer_shown` (Task 6).
- Produces: `ReviewView(props: { free: ScreenFree; play: boolean })`.

- [ ] **Step 1: Новый вопрос свободного ввода** (эталон `mockups/screen-polish-transitions.html`). При входе `title` — `TitleIntro` с `Вопрос {n}` и `layoutId="scene-head"`. Крупное «Вопрос {n}» улетает в заголовок, затем проявляются текст, варианты и таймер.
- [ ] **Step 2: `ReviewView`**
  - При входе `title` — `TitleIntro` «Правильные ответы». Заголовок с хвостом ` · вопрос {n} из {total}` дальше стоит на месте, хвост меняется перетеканием.
  - Тело — `AnimatePresence mode="popLayout"` по `number`, вариант `slide`: старое уходит влево, новое въезжает справа.
  - `question.answer !== null` → строка ответа `pop`.
  - `highlight_option !== null`: верный вариант на акценте с `--on-accent`, остальные с прозрачностью 0.45.
- [ ] **Step 3: Пульт** — `ReviewPanel`:
  - строка «На экране: вопрос {n} / {total} · {free.answer_shown ? "с ответом" : "без ответа"}»;
  - кнопка «Показать ответ» (`{type: "review_show_answer"}`), `disabled` при `free.answer_shown`.
- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: PASS.

Вручную:
- вопросы свободного ввода открываются с прилётом номера;
- в разборе ответ скрыт до кнопки, стрелки снова скрывают ответ;
- у вопроса с вариантами подсвечивается верный;
- перезагрузка экрана в разборе не проигрывает «Правильные ответы» заново.

- [ ] **Step 5: Commit** — `feat(review): answers title, slide between questions, answer by the host's button`

---

### Task 13: Остальные сцены и правка основной спеки

**Files:**
- Modify: `frontend/src/screen/views/LobbyView.tsx`, `IntroView.tsx`, `LeaderboardView.tsx`, `WinnerView.tsx`, `StandingsTable.tsx`, `frontend/src/screen/ScreenApp.tsx`
- Modify: `docs/superpowers/specs/2026-11-18-tquiz-design.md`

**Interfaces:**
- Consumes: `variants` (Task 9).

- [ ] **Step 1: Анимации остальных сцен**
  - **Лобби.** Новая команда «впрыгивает» в список: `AnimatePresence` по `team.id`, `pop`.
  - **Заставка.** «Тур N из M», название и тип появляются по очереди, название через `pop`.
  - **Рейтинг.** Слой появляется и снимается через `fade`, строки таблицы въезжают по очереди сверху вниз (`staggerPop` или `rise`). Сцена под ним при снятии не проигрывает свой вход: её ключ не меняется.
  - **Победитель.** Имя `pop`, затем таблица.
- [ ] **Step 2: Основная спека** — внести правки из раздела «Что меняется в основной спеке» новой спеки:
  - §4 — тема и фоны;
  - §5 — новые поля;
  - §7 — старт после раскрытия и печать;
  - §8 — ответ в разборе по кнопке, «Правильные ответы»;
  - §9 — иконки звука и предупреждение на пульте.
- [ ] **Step 3: Verify**

Run: `cd backend && uv run pytest -q && cd ../frontend && npm test && npm run build`
Expected: всё PASS.

Вручную — полный проход игры на 3 команды:
- лобби с музыкой;
- своя игра с печатью;
- свободный ввод с музыкой и разбором;
- рейтинг между турами;
- победитель.

- [ ] **Step 4: Commit** — `feat(screen): lobby, intro, standings and winner animations; docs: main spec update`
