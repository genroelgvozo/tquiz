# Счёт по турам, проверка свободного ввода, сетка своей игры — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Счёт хранится по турам и виден залу только между турами; ведущий проверяет свободный ввод в отдельной таблице в любой момент тура; тур своей игры собирается сразу со стоимостями и темами, табло выровнено по стоимости.

**Architecture:** Бэкенд: у команды вместо `score` словарь `round_scores` (тур → очки), закрытые туры в `GameState.closed_rounds`, итог = сумма закрытых. Вся логика счёта в новом `app/game/scoring.py`, что кому видно — только в `app/game/views.py`. Отметки свободного ввода ставятся при каждой смене ответа, очки тура свободного ввода считаются из отметок при закрытии тура. У тура своей игры новое поле `cell_values`; раскладка табло по стоимости — чистая функция на фронте.

**Tech Stack:** Python 3.12, FastAPI, SQLModel/SQLite, pydantic, pytest (через `uv`); React 18, TypeScript, Vite, Mantine 8 (только админка); тесты чистых TS-функций — встроенный `node:test` с `--experimental-strip-types` (Node 22), без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-11-19-round-scores-checking-grid-design.md` (дополняет `docs/superpowers/specs/2026-11-18-tquiz-design.md`).

## Global Constraints

- Интерфейс и документация на русском, код и идентификаторы на английском.
- Что видит каждая роль, решается только в `backend/app/game/views.py`; каждое изменение формы снимков покрыто тестами в `backend/tests/test_views.py`.
- Mantine только в админке (`src/admin`). В `/play` и `/screen` Mantine не импортировать.
- В админке никаких `window.confirm/prompt/alert`, только `src/admin/dialogs.tsx`. Ошибки — `notifyError`/`notifyApiError` из `src/admin/notify.ts`. Админку собирать из компонентов Mantine (см. `CLAUDE.md`).
- Стоимости по умолчанию: `[100, 200, 300, 400, 500]`.
- Старая база без колонки `round.cell_values` и старый JSON состояния игры (у команды поле `score`) должны загружаться без ошибок.
- Проверки: бэкенд `cd backend && uv run pytest`; фронтенд `cd frontend && npm run build` и `npm test`.
- Коммиты в конце каждой задачи, сообщение на английском в стиле репозитория (`feat(...)`, `fix(...)`), с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Команда вошла посреди игры: в закрытых турах у неё 0 (не прочерк), итог 0 — тест в задаче 1.
2. Команду удалили посреди игры: её нет в сводной таблице, её очки нигде не учитываются — тест в задаче 1.
3. «Отменить» ✓/✗ в своей игре после ручной правки ± в том же туре: счёт тура возвращается ровно к состоянию до ✓/✗, правка не теряется — тест в задаче 1.
4. Перезапуск сервера посреди свободного тура: ответы, отметки, `opened`, `revealed`, `round_scores`, `closed_rounds` переживают JSON-сериализацию — тест в задаче 2.
5. «Завершить игру» прямо из лобби или с заставки первого тура: в таблице все туры с прочерком, итоги 0, экран победителя не падает — тест в задаче 1, проверка вручную в задаче 4.

---

### Task 1: Счёт по турам на бэкенде и что кому видно

**Files:**
- Create: `backend/app/game/scoring.py`
- Modify: `backend/app/game/state.py` (Team, GameState)
- Modify: `backend/app/game/engine.py` (`_run_admin`, `_start_round`, `_next_round`, `_finish_game`, `_adjust_score`, `_undo`)
- Modify: `backend/app/game/jeopardy.py` (`start`, `_judge`)
- Modify: `backend/app/game/freeinput.py` (`_enter_review`, `_mark` — убрать начисление очков; добавить `round_points`)
- Modify: `backend/app/game/views.py`
- Modify: `backend/tests/factories.py` (хелперы счёта)
- Create: `backend/tests/test_scoring.py`
- Modify: `backend/tests/test_views.py`, `test_engine_core.py`, `test_jeopardy.py`, `test_freeinput.py`, `test_review_fixes.py`, `test_ws_flow.py` (все обращения к `.score` / `"score"`)

**Interfaces:**
- Produces (state):
  - `Team.round_scores: dict[str, int]` (ключ `str(round_index)`), поле `score` удалено. Старый JSON с `score` грузится (pydantic игнорирует лишние поля — проверить, что у моделей нет `extra="forbid"`).
  - `GameState.closed_rounds: list[int]` — индексы закрытых туров по порядку закрытия.
- Produces (`app/game/scoring.py`; `Game` импортировать под `TYPE_CHECKING`):
  - `add_points(team: Team, round_index: int, delta: int) -> None`
  - `stored_round_score(team: Team, round_index: int) -> int`
  - `total(game: Game, team: Team) -> int` — сумма `stored_round_score` по `closed_rounds`.
  - `current_round_score(game: Game, team: Team) -> int | None` — `None`, если стадия не `jeopardy`/`free`; для `free` = сохранённое + `freeinput.round_points(game).get(team.id, 0)`.
  - `close_current_round(game: Game) -> None` — если стадия `jeopardy` или `free` и тур ещё не закрыт: для `free` прибавить `round_points` в `round_scores`, затем добавить индекс в `closed_rounds`. На стадиях `lobby`/`intro`/`finished` ничего не делает (пропущенный с заставки тур не закрыт).
  - `adjust_round(game: Game) -> int | None` — `jeopardy`/`free` → `round_index`; `intro`/`finished` → `closed_rounds[-1]`, если есть; иначе `None`.
- Produces (`freeinput.round_points(game: Game) -> dict[str, int]`): по всем вопросам текущего тура и всем командам: нет ответа → отметка `False`; есть ответ → `free.marks.get(str(qid), {}).get(team_id)` (отсутствует = `None`); очки `points(nominal, answer.stake if answer else False, mark)`. Правило «ставка без ответа = −номинал» сохраняется: пустой ответ со ставкой считается ответом с отметкой из `marks`, в задаче 2 автоотметка для него `False`.
- Produces (views.py, заменяет старое):
  - `TeamPublic(id: str, name: str)` — без `score`.
  - `StandingsColumn(index: int, title: str, closed: bool)`, `StandingsRow(team_id: str, name: str, rounds: list[int | None], total: int)`, `Standings(columns: list[StandingsColumn], rows: list[StandingsRow])`. Столбцы — все туры квиза; `rounds[i]` = `stored_round_score` для закрытого тура, `None` для незакрытого; строки по `total` убыв., при равенстве по `joined_at`.
  - `ScreenView.standings: Standings`; `ScreenJeopardy.scores: dict[str, int]` (счёт текущего тура всех команд).
  - `TeamScore(kind: Literal["round", "total"], value: int)`; `TeamView.score: TeamScore | None`: `lobby` → `None`, `intro`/`finished` → `total`, `jeopardy` → `round`, `free` → `None`.
  - `AdminTeam(id: str, name: str, round_score: int | None, total: int)`; `AdminState.teams: list[AdminTeam]`; `AdminState.standings: Standings`; `AdminState.score_adjust_round: int | None` (= `scoring.adjust_round`).
- Поведение engine:
  - `_start_round`: `overlay = None`.
  - `_next_round`: `close_current_round` до смены тура; затем `overlay = "leaderboard"`, если `closed_rounds` не пуст, иначе `None`.
  - `_finish_game`: `close_current_round`, `overlay = None`.
  - `_adjust_score`: цель `adjust_round(game)`; `None` → `GameError("Счёт пока нечего править")`. В `_run_admin` запись отмены для `AdjustScore` получает ключ `"round"` (вычислить `adjust_round` до вызова обработчика); `_undo` для `"score"` вычитает дельту из того же тура.
  - `_undo` для `"state"`: как сейчас, но вместо `score` переносится `round_scores` из восстановленного состояния на текущий список команд.
  - `jeopardy._judge`: `add_points(team, game.state.round_index, ±question.value)`. `jeopardy.start`: выбирающий — `min(teams, key=(total, joined_at))`.
  - `freeinput._enter_review` и `_mark`: больше не трогают счёт (предразметка при входе в вопрос разбора пока остаётся, её убирает задача 2).

- [ ] **Step 1: Хелперы в `tests/factories.py`**

`def total(g: Game, team_id: str) -> int` и `def round_score(g: Game, team_id: str) -> int | None` — обёртки над `scoring.total` / `scoring.current_round_score` для `g.team(team_id)`.

- [ ] **Step 2: Написать падающие тесты `tests/test_scoring.py`**

Квиз в тестах: `jeopardy_round(1, [("Кино", [q(1, value=100), q(2, value=200)])], buzzer_mode="instant", minus_on_wrong=True)`, затем `free_round(2, [q(3, answer="Да"), q(4, answer="Нет")], stakes=True)`, затем `jeopardy_round(3, [("Музыка", [q(5, value=300)])], buzzer_mode="instant")`. Команды «А», «Б».

```python
def test_jeopardy_points_go_to_round_score_and_total_after_close():
    # А берёт q1 (+100), Б ошибается на q2 (-200)
    assert round_score(g, a) == 100 and round_score(g, b) == -200
    assert total(g, a) == 0 and total(g, b) == 0          # тур не закрыт
    g.apply_admin(NextRound())
    assert g.state.closed_rounds == [0]
    assert total(g, a) == 100 and total(g, b) == -200

def test_next_round_shows_standings_overlay_only_after_a_closed_round():
    g.apply_admin(StartGame());  assert g.state.overlay is None
    g.apply_admin(StartRound()); g.apply_admin(NextRound())
    assert g.state.overlay == "leaderboard"
    g.apply_admin(StartRound()); assert g.state.overlay is None

def test_skipped_round_is_not_closed():
    # StartGame, затем NextRound прямо с заставки тура 1
    assert g.state.closed_rounds == [] and g.state.overlay is None

def test_finish_game_closes_current_round():
    # в туре 1 А набрал 100, FinishGame
    assert g.state.closed_rounds == [0] and total(g, a) == 100

def test_free_round_points_from_marks_at_close():
    # тур 2: А ответила «да» (StartReview → предразметка ✓), Б ответила «котик» со ставкой (не проверено)
    g.apply_admin(NextRound())
    assert total(g, a) - total_before_a == 1 and total(g, b) - total_before_b == 0
    # вариант: Б отправила пустой ответ со ставкой (SubmitAnswer(text="", stake=True)) → -1;
    # команда, не отправлявшая ничего, получает 0
    # StartReview здесь нужен, пока предразметка ставится при входе в разбор; после задачи 2
    # тест должен проходить и без него (предразметка при отправке ответа)

def test_adjust_score_targets():
    with pytest.raises(GameError): g.apply_admin(AdjustScore(team_id=a, delta=5))   # лобби
    # StartGame: заставка тура 1, закрытых нет → GameError
    # StartRound: ±5 → round_score(a) == 5
    # NextRound: на заставке ±3 → stored_round_score(тур 0) == 8, total == 8
    # FinishGame: ±1 → в последний закрытый тур

def test_undo_adjust_returns_to_same_round():
    # ±5 во время тура 1, NextRound очищает стек; ±3 на заставке, Undo → тур 0 снова без +3

def test_undo_judge_restores_round_score_after_manual_adjust():
    # тур 1: AdjustScore(a, +7); OpenCell(1); buzz a; Judge(correct=True); Undo
    assert round_score(g, a) == 7

def test_late_team_has_zero_for_closed_rounds():
    # тур 1 закрыт, затем join("В"); в admin_view(...).state.standings строка «В»: rounds[0] == 0, total == 0

def test_deleted_team_not_in_standings():
    # А набрала в туре 1, DeleteTeam(a), NextRound → в standings нет строки А

def test_finish_from_lobby_has_empty_standings():
    # FinishGame из лобби: closed_rounds == [], во всех строках rounds == [None, None, None], total == 0

def test_old_state_json_with_score_loads():
    state = GameState.model_validate({"quiz_id": 1, "teams": [{"id": "t", "name": "А", "token": "x", "score": 5, "joined_at": 1.0}]})
    assert state.teams[0].round_scores == {}

def test_initial_chooser_lowest_total_then_earliest():   # перенести из test_jeopardy.py
    # квиз из двух jeopardy-туров; А набирает в туре 1, NextRound, StartRound → chooser == Б
```

Тела тестов дописать по комментариям, используя `OpenCell`, `BuzzCmd` (`apply_team`), `Judge`, `SubmitAnswer`, `StartReview`.

- [ ] **Step 3: Тесты видимости в `tests/test_views.py`**

```python
def test_team_score_by_stage():
    # лобби: team_view(...).score is None
    # заставка: TeamScore(kind="total", ...)
    # своя игра: kind == "round", value == счёт тура
    # свободный ввод (фаза вопроса и разбор): score is None
    # игра окончена: kind == "total"

def test_open_round_points_never_reach_screen_or_team():
    # в scripted_states(): на каждом шаге со stage == "free"
    #   screen_view(...).standings и rows[].total не учитывают тур 2,
    #   screen_view(...).jeopardy is None, team_view(...).score is None

def test_standings_columns_and_rows():
    # после закрытия тура 1: 2 столбца, closed == [True, False], rounds[1] is None, строки по total убыв.

def test_screen_jeopardy_has_round_scores():
    # в своей игре screen_view(...).jeopardy.scores == {a: 100, b: 0}

def test_admin_view_teams_have_round_and_total_and_adjust_target():
    # во время тура: round_score не None, score_adjust_round == round_index; в лобби score_adjust_round is None
```

- [ ] **Step 4: Убедиться, что новые тесты падают**

Run: `cd backend && uv run pytest tests/test_scoring.py tests/test_views.py -q`
Expected: FAIL (`ImportError`/`AttributeError` на `scoring`, `round_scores`, `standings`).

- [ ] **Step 5: Реализовать по блоку Interfaces**

`state.py`, `scoring.py`, правки `engine.py`, `jeopardy.py`, `freeinput.py`, `views.py`. В `views.py` `_teams` возвращает `TeamPublic` без счёта; `_standings(game) -> Standings`, `_admin_teams(game) -> list[AdminTeam]`.

- [ ] **Step 6: Починить существующие тесты под новую модель**

Заменить `g.team(x).score` на `round_score`/`total` из factories по смыслу теста; в `test_ws_flow.py` проверять `v["state"]["teams"][0]["round_score"]`. Удалить из `test_jeopardy.py` старый `test_initial_chooser_lowest_score_then_earliest` (его заменяет тест из шага 2). `test_review_premarks_and_points` и `test_changing_mark_recomputes_and_revisit_does_not_double` переписать на проверку отметок без очков (очки проверяются в `test_free_round_points_from_marks_at_close`).

- [ ] **Step 7: Все тесты бэкенда зелёные**

Run: `cd backend && uv run pytest -q`
Expected: all passed.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(game): per-round scores, totals only between rounds, standings"
```

---

### Task 2: Отметки свободного ввода при каждой смене ответа

**Files:**
- Modify: `backend/app/game/state.py` (`FreeState`)
- Modify: `backend/app/game/commands.py` (`Mark`)
- Modify: `backend/app/game/freeinput.py` (`_open`, `_submit`, `_enter_review`, `_mark`)
- Modify: `backend/tests/test_freeinput.py`, `backend/tests/test_views.py`, `backend/tests/test_engine_core.py`

**Interfaces:**
- Consumes: `freeinput.round_points` (задача 1) — не меняется.
- Produces:
  - `FreeState.opened: list[int]` — id вопросов, которые открывались (заполняет `_open`).
  - `FreeState.reviewed` переименовать в `FreeState.revealed: list[int]` — id вопросов, ответ которых показан на экране.
  - `Mark(question_id: int, team_id: str, correct: bool | None, text: str = "", option: int | None = None)` — `text`/`option` = ответ, который видел ведущий.
- Поведение:
  - `_submit`: если предыдущего ответа нет или `(text, option)` отличается от нового → `marks[qid][team] = premark(question, new_answer)`. Смена только `stake` отметку не трогает.
  - `_enter_review`: только `review_index` и добавление в `revealed`; ни отметок, ни очков.
  - `_mark`: вопрос не из текущего тура или не в `opened` → `GameError("Этот вопрос ещё не открывали")`; у команды нет ответа → `GameError("У команды нет ответа")`; `(answer.text, answer.option) != (cmd.text, cmd.option)` → `GameError("Ответ команды изменился — проверьте заново")`; иначе `marks[qid][team] = cmd.correct`. Работает в фазах `question` и `review`.

- [ ] **Step 1: Падающие тесты в `tests/test_freeinput.py`**

```python
def test_premark_on_submit():
    g.apply_team(a, SubmitAnswer(text="грачи прилетели!"))   # совпадает с эталоном
    g.apply_team(b, SubmitAnswer(text="Саврасов"))
    assert g.state.free.marks["1"] == {a: True, b: None}

def test_host_mark_survives_same_answer_and_stake_toggle():
    g.apply_team(b, SubmitAnswer(text="Саврасов"))
    g.apply_admin(Mark(question_id=1, team_id=b, correct=True, text="Саврасов"))
    g.apply_team(b, SubmitAnswer(text="Саврасов", stake=True))
    assert g.state.free.marks["1"][b] is True

def test_changed_answer_resets_host_mark():
    g.apply_admin(Mark(question_id=1, team_id=b, correct=True, text="Саврасов"))
    g.apply_team(b, SubmitAnswer(text="Левитан"))
    assert g.state.free.marks["1"][b] is None

def test_mark_rejected_for_stale_answer():
    with pytest.raises(GameError): g.apply_admin(Mark(question_id=1, team_id=b, correct=True, text="Сав"))

def test_mark_requires_opened_question_and_answer():
    with pytest.raises(GameError): g.apply_admin(Mark(question_id=2, team_id=a, correct=True))   # вопрос 2 не открывали
    with pytest.raises(GameError): g.apply_admin(Mark(question_id=1, team_id=c, correct=True))   # у В нет ответа

def test_mark_allowed_while_timer_runs():
    g.apply_admin(TimerStart()); g.apply_team(b, SubmitAnswer(text="Саврасов"))
    g.apply_admin(Mark(question_id=1, team_id=b, correct=False, text="Саврасов"))
    assert g.state.free.marks["1"][b] is False

def test_review_only_moves_screen():
    marks_before = copy.deepcopy(g.state.free.marks)
    g.apply_admin(StartReview()); g.apply_admin(ReviewGoto(index=1))
    assert g.state.free.marks == marks_before and g.state.free.revealed == [1, 2]
    g.apply_admin(Mark(question_id=1, team_id=b, correct=True, text="Саврасов"))   # и в разборе можно

def test_stake_with_empty_answer_counts_minus_nominal():
    # stakes=True: SubmitAnswer(text="", stake=True); marks["1"][a] is False; после NextRound итог -1
```

- [ ] **Step 2: Тест на перезапуск в `tests/test_engine_core.py`**

`test_free_state_with_marks_roundtrips_json`: посреди свободного тура с ответами, отметкой ведущего, `revealed` и закрытым предыдущим туром `GameState.model_validate_json(g.state.model_dump_json()) == g.state`.

- [ ] **Step 3: Тест на утечку в `tests/test_views.py`**

В `test_team_view_never_leaks` добавить: `"marks" not in s` и в `scripted_states` команда `Mark` с `text` для существующего ответа (обновить шаги под новую сигнатуру).

- [ ] **Step 4: Убедиться, что новые тесты падают**

Run: `cd backend && uv run pytest tests/test_freeinput.py -q`
Expected: FAIL.

- [ ] **Step 5: Реализовать по блоку Interfaces**

- [ ] **Step 6: Все тесты бэкенда зелёные**

Run: `cd backend && uv run pytest -q`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat(free): premark on every answer change, host marks any time, review only drives the screen"
```

---

### Task 3: Стоимости тура и темы со всеми вопросами (бэкенд)

**Files:**
- Modify: `backend/app/models.py` (`Round.cell_values`, `DEFAULT_CELL_VALUES`)
- Modify: `backend/app/db.py` (`init_db` + миграция)
- Modify: `backend/app/quizdata.py` (`RoundData.cell_values`, порядок вопросов темы)
- Modify: `backend/app/api/quizzes.py` (`RoundCreate`, `RoundUpdate`, `create_round`, `update_round`, `create_category`, `create_question`, `next_cell_value`)
- Modify: `backend/tests/test_quizzes_api.py`

**Interfaces:**
- Produces:
  - `models.DEFAULT_CELL_VALUES = [100, 200, 300, 400, 500]`; `Round.cell_values: list[int]` (JSON, not null, default — копия списка).
  - `db._add_missing_columns(engine: Engine) -> None`, вызывается из `init_db` после `create_all`: если в `PRAGMA table_info(round)` нет `cell_values`, выполнить `ALTER TABLE round ADD COLUMN cell_values JSON NOT NULL DEFAULT '[100, 200, 300, 400, 500]'`.
  - `RoundData.cell_values: list[int]` (default `[100, 200, 300, 400, 500]`); вопросы темы в `load_quiz_data` сортируются по `(value, position, id)`.
  - `RoundCreate.cell_values: list[int] | None = None`, `RoundCreate.categories: list[str] = []` (каждое имя ≤ 200 символов, пустые после `strip` пропускаются); `RoundUpdate.cell_values: list[int] | None = None`.
  - `_clean_cell_values(values: list[int]) -> list[int]` — `sorted(set(values))`; пусто → `HTTPException(422, "Укажите хотя бы одну стоимость")`; больше 20 → `HTTPException(422, "Не больше 20 стоимостей")`.
  - `next_cell_value(existing: list[int], cell_values: list[int]) -> int` — первая стоимость из `cell_values`, которой нет в `existing`; если все есть: `max(existing) + step`, `step = cell_values[-1] - cell_values[-2]` при длине ≥ 2, иначе `cell_values[0]`.
- Поведение:
  - `create_round` для своей игры: `cell_values` = очищенный список или по умолчанию; для каждой темы из `categories` создаёт `Category` и вопросы на каждую стоимость (`position` по порядку). Для свободного ввода непустой `categories` → `422 "Темы есть только в своей игре"`.
  - `create_category` (своя игра): тема сразу со всеми стоимостями `rnd.cell_values`.
  - `create_question` (своя игра): `value = next_cell_value(...)` по стоимостям этой темы.
  - Копирование квиза переносит `cell_values` (через `model_dump`, проверить тестом).

- [ ] **Step 1: Падающие тесты в `tests/test_quizzes_api.py`**

```python
def test_next_cell_value():
    assert next_cell_value([100, 300], [100, 200, 300]) == 200
    assert next_cell_value([100, 200, 300], [100, 200, 300]) == 400
    assert next_cell_value([500], [500]) == 1000
    assert next_cell_value([], [100, 200]) == 100

def test_create_jeopardy_round_with_values_and_themes(admin_client):
    body = {"title": "Своя", "kind": "jeopardy", "cell_values": [300, 100, 200, 100], "categories": ["Кино", " ", "Музыка"]}
    rnd = admin_client.post(f"/api/quizzes/{qid}/rounds", json=body).json()["quiz"]["rounds"][0]
    assert rnd["cell_values"] == [100, 200, 300]
    assert [c["name"] for c in rnd["categories"]] == ["Кино", "Музыка"]
    assert [q["value"] for q in rnd["categories"][1]["questions"]] == [100, 200, 300]

def test_create_round_default_values(admin_client):   # без cell_values → [100, 200, 300, 400, 500]

def test_create_category_fills_all_values_and_plus_adds_next(admin_client):
    # тема «Кино» → 5 вопросов; DELETE вопроса 200; «+» → снова 200; «+» → 600; значения по возрастанию

def test_update_cell_values_validation(admin_client):
    # PATCH {"cell_values": []} → 422; {"cell_values": [200, 100, 200]} → [100, 200]; существующие темы не меняются

def test_categories_rejected_for_free_round(admin_client):   # 422

def test_copy_quiz_keeps_cell_values(admin_client):

def test_old_db_without_cell_values_column_migrates(tmp_path):
    # sqlite3: создать таблицу round по старой схеме (без cell_values) с одной строкой,
    # init_db(make_engine(tmp_path)) → колонка есть, у строки [100, 200, 300, 400, 500]
```

Существующий `test_create_jeopardy_round_with_category_and_questions` обновить: после создания темы в ней 5 вопросов, «+» добавляет 600.

- [ ] **Step 2: Убедиться, что новые тесты падают**

Run: `cd backend && uv run pytest tests/test_quizzes_api.py -q`
Expected: FAIL.

- [ ] **Step 3: Реализовать по блоку Interfaces**

- [ ] **Step 4: Все тесты бэкенда зелёные**

Run: `cd backend && uv run pytest -q`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(editor): round cell values, themes created with all values, value-ordered questions"
```

---

### Task 4: Счёт на экране, телефоне и в пульте

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/screen/views/StandingsTable.tsx`
- Modify: `frontend/src/screen/views/LeaderboardView.tsx`, `WinnerView.tsx`, `ScoreStrip.tsx`, `BoardView.tsx`, `frontend/src/screen/ScreenApp.tsx`, `frontend/src/screen/screen.css`
- Modify: `frontend/src/play/PlayApp.tsx`, `frontend/src/play/play.css`
- Modify: `frontend/src/admin/console/TeamsPanel.tsx`, `Console.tsx`, `ReviewPanel.tsx` (только сигнатура `mark`)

**Interfaces:**
- Consumes: формы снимков из задач 1–3.
- Produces (`types.ts`, зеркало `views.py`):
  - `TeamPublic { id; name }`; `StandingsColumn { index; title; closed }`; `StandingsRow { team_id; name; rounds: (number | null)[]; total }`; `Standings { columns; rows }`.
  - `ScreenView.standings: Standings`; `ScreenJeopardy.scores: Record<string, number>`.
  - `TeamScore { kind: "round" | "total"; value }`; `TeamView.score: TeamScore | null`.
  - `AdminTeam { id; name; round_score: number | null; total }`; `AdminState.teams: AdminTeam[]`, `AdminState.standings`, `AdminState.score_adjust_round: number | null`.
  - `FreeState.opened: number[]`, `FreeState.revealed: number[]` (вместо `reviewed`).
  - `RoundData.cell_values: number[]`.
  - `AdminCommand` mark: `{ type: "mark"; question_id; team_id; correct: boolean | null; text: string; option: number | null }`.
  - `StandingsTable({ standings, title, highlightFirst }: { standings: Standings; title: string; highlightFirst?: boolean })` — таблица «команды × туры + Итого», без Mantine, свой CSS в `screen.css` в стиле `scr-rank` (тёмная тема из набросков). Незакрытый тур — «—». Заголовок столбца: `«N. Название»`, длинное обрезается с многоточием.
- Поведение:
  - Экран: `LeaderboardView` и `WinnerView` рисуют `StandingsTable` из `view.standings` (заголовки «Рейтинг» и «Итоговый рейтинг»); победитель — `standings.rows[0]`, если у кого-то ненулевой итог или есть закрытые туры. `ScoreStrip({ teams, scores, chooserId })` берёт числа из `jeopardy.scores`.
  - Телефон: в шапке `view.score` — число и мелкая подпись «в туре» для `kind === "round"`; при `null` счёта в шапке нет. На экране «Игра окончена»: «Ваш счёт: {total}».
  - Пульт, `TeamsPanel`: у команды «в туре N» (если `round_score !== null`) и «итог M». Поле ± и «Применить» `disabled`, когда `state.score_adjust_round === null`.
  - Пульт, заставка тура: при `state.overlay === "leaderboard"` текст «На экране сводная таблица» и кнопка «Показать заставку тура» (`set_overlay` с `null`) рядом с «Начать тур».
  - Пульт, «Игра окончена»: победитель из `state.standings.rows[0]` (имя и итог).
  - `ReviewPanel`: `mark` отправляет `text: a.text, option: a.option` ответа, который показан в строке (временно, до задачи 6).

- [ ] **Step 1: Обновить `types.ts` по блоку Interfaces**

- [ ] **Step 2: Сборка падает на всех местах, где использовался старый счёт**

Run: `cd frontend && npm run build`
Expected: FAIL с ошибками TypeScript про `score` / `reviewed`.

- [ ] **Step 3: Реализовать экран, телефон, пульт по блоку Interfaces**

- [ ] **Step 4: Сборка зелёная**

Run: `cd frontend && npm run build`
Expected: успешная сборка.

- [ ] **Step 5: Проверка в браузере**

Бэкенд на свободном порту со своей копией данных: `DATA_DIR=<копия data> ADMIN_PASSWORD=dev SECRET_KEY=dev-secret uv run uvicorn --factory app.main:create_app --port 8011` и `TQUIZ_BACKEND=http://localhost:8011 npx vite --port 5175`. Сначала проверить, что порты свободны и бэкенд действительно ответил на `/api/health`. Пройти: лобби (на телефоне нет счёта) → своя игра (на экране и телефоне счёт тура) → «След. тур» (на экране сводная таблица, на телефоне итог) → «Показать заставку тура» → свободный ввод (на телефоне нет счёта, «Рейтинг на экран» без текущего тура) → «Завершить игру» (экран победителя с таблицей). Отдельно: «Завершить игру» прямо из лобби — экран победителя не падает.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(ui): standings table, round scores on screen and phone, two scores in console"
```

---

### Task 5: Табло по стоимости

**Files:**
- Create: `frontend/src/lib/board.ts`
- Create: `frontend/tests/board.test.ts`
- Modify: `frontend/package.json` (скрипт `test`)
- Modify: `frontend/src/screen/views/BoardView.tsx`, `frontend/src/admin/console/JeopardyPanel.tsx`

**Interfaces:**
- Produces: `layoutBoard<T extends { value: number }>(categories: T[][]): { columns: number[]; rows: (T | null)[][] }`.

Алгоритм (тесты его не до конца определяют): для каждой стоимости `v` — `k_v` = максимум числа вопросов с этой стоимостью в одной теме; `columns` = стоимости по возрастанию, каждая повторена `k_v` раз; в строке темы `o`-й столбец стоимости `v` занимает `o`-й по порядку вопрос темы с этой стоимостью, иначе `null`.

- Скрипт: `"test": "node --experimental-strip-types --test tests/*.test.ts"`. Тесты импортируют `../src/lib/board.ts` (с расширением); `tsconfig` включает только `src`, поэтому сборку это не задевает. В `board.ts` никаких импортов и только стираемый синтаксис TypeScript.

- [ ] **Step 1: Падающий тест `frontend/tests/board.test.ts`**

```ts
test("gap keeps value column", () => {
  const r = layoutBoard([[c(100), c(200), c(300)], [c(100), c(300)]]);
  assert.deepEqual(r.columns, [100, 200, 300]);
  assert.deepEqual(r.rows[1].map((x) => x?.value ?? null), [100, null, 300]);
});
test("unsorted input is ordered by value", () => { /* [[c(300), c(100)]] → columns [100, 300], row [100, 300] */ });
test("duplicates get extra columns", () => { /* [[c(100), c(100)], [c(100)]] → columns [100, 100], rows[1] → [100, null] */ });
test("empty board", () => { /* [[], []] → columns [], rows [[], []] */ });
```

(`c = (value: number) => ({ value })`.)

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && npm test`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `layoutBoard` и подключить в `BoardView` (ячейки `j.board[i].cells`) и `JeopardyPanel` (вопросы `round.categories[i].questions`)**

Пустая ячейка рисуется как сейчас пустое место (`<span />` в мини-сетке, пустой блок на экране).

- [ ] **Step 4: Тесты и сборка зелёные**

Run: `cd frontend && npm test && npm run build`
Expected: `# fail 0`, успешная сборка.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(board): align jeopardy cells by value on the screen and in the console"
```

---

### Task 6: Редактор своей игры: стоимости, темы

**Files:**
- Create: `frontend/src/admin/cellValues.ts`
- Create: `frontend/tests/cellValues.test.ts`
- Modify: `frontend/src/admin/dialogs.tsx` (`newRoundDialog`, `NewRoundForm`)
- Modify: `frontend/src/admin/RoundSettings.tsx`
- Modify: `frontend/src/admin/QuizEditor.tsx` (тексты «категория» → «тема»)
- Modify: `frontend/src/admin/roundKinds.ts` (описание: «Табло тем и стоимостей…»)

**Interfaces:**
- Consumes: `RoundCreate.cell_values`, `RoundCreate.categories`, `RoundUpdate.cell_values`, `RoundData.cell_values` (задача 3).
- Produces:
  - `parseCellValues(input: string): number[] | null` — разделители пробелы, запятые, точки с запятой; только целые (допускается минус); хотя бы одно; результат по возрастанию без повторов; иначе `null`.
  - `formatCellValues(values: number[]): string` — через пробел.
  - `newRoundDialog(): Promise<{ kind: RoundKind; title: string; cell_values?: number[]; categories?: string[] } | null>`.
- Поведение:
  - «Новый тур», тип «Своя игра»: поле «Стоимости» (по умолчанию `100 200 300 400 500`, ошибка под полем «Целые числа через пробел», «Создать» неактивна при ошибке) и многострочное «Темы (по одной в строке)», можно пусто. Для «Свободного ввода» этих полей нет и в запрос они не идут.
  - Настройки тура своей игры: поле «Стоимости» с подсказкой «Для новых тем», сохраняется по потере фокуса; неверный ввод → `notifyError("Стоимости — целые числа через пробел")`, запрос не уходит.
  - Редактор: «+ тема», «Новая тема», «Переименовать тему», «Удалить тему «…»?», подсказка кнопки «Удалить тему». В коде и API по-прежнему `category`.

- [ ] **Step 1: Падающий тест `frontend/tests/cellValues.test.ts`**

```ts
assert.deepEqual(parseCellValues("300, 100 200;100"), [100, 200, 300]);
assert.deepEqual(parseCellValues(" -50 50 "), [-50, 50]);
assert.equal(parseCellValues(""), null);
assert.equal(parseCellValues("100 abc"), null);
assert.equal(parseCellValues("100.5"), null);
assert.equal(formatCellValues([100, 200]), "100 200");
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Реализовать по блоку Interfaces**

- [ ] **Step 4: Тесты и сборка зелёные**

Run: `cd frontend && npm test && npm run build`
Expected: `# fail 0`, успешная сборка.

- [ ] **Step 5: Проверка в браузере**

Как в задаче 4 (свой порт и копия данных). Создать тур своей игры со стоимостями `100 200 300` и темами «Кино», «Музыка» → в дереве две темы по три вопроса. «+ тема» → тема с тремя вопросами. Удалить 200 в «Кино», «+» → вернулось 200. В пульте этой игры 300 в «Кино» стоит под 300 после удаления 200 (проверка задачи 5).

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(editor): cell values and themes in the new round dialog, themes wording"
```

---

### Task 7: Таблица проверки свободного ввода в пульте

**Files:**
- Create: `frontend/src/admin/console/CheckTable.tsx`
- Modify: `frontend/src/admin/console/Console.tsx`, `FreePanel.tsx`, `ReviewPanel.tsx`

**Interfaces:**
- Consumes: `FreeState.answers`, `marks`, `opened`, `revealed`, команда `mark` с `text`/`option` (задачи 2, 4).
- Produces:
  - `CheckTable({ view, send }: PanelProps)` — `Paper` с `SectionLabel` «Проверка» и Mantine `Table`.
  - `uncheckedCount(view: AdminView): number` (экспорт из `CheckTable.tsx`) — число пар «открытый вопрос × команда», где ответ есть, а отметка `null`/отсутствует.
- Поведение:
  - Строки — только вопросы из `free.opened`, в порядке тура. В начале строки номер вопроса, ● для текущего (фаза вопроса, `free.index`), ✔ для показанных (`free.revealed`).
  - Столбцы — команды. Ячейка: ответа нет → «—» (для текущего вопроса, пока таймер не `finished`, — «ждём…»), без кнопок. Ответ есть → текст (для варианта `«Б. текст»`), бейдж «ставка», кнопки ✓ (зелёная `filled`, когда отметка `true`) и ✗ (красная `filled`, когда `false`). Клик по активной снимает отметку (`correct: null`). В команду уходит ровно показанный ответ: `text: a.text, option: a.option`. Длинный ответ обрезается, полностью — в `title`.
  - `Console`: на стадии `free` под панелью вопроса или разбора всегда `CheckTable`. Подтверждение «След. тур» на стадии `free`: если `uncheckedCount > 0`, диалог «Тур не закончен» (как для незаконченного тура) и в тексте «Не проверено ответов: N.».
  - `FreePanel`: убрать ряд бейджей «кто ответил» (теперь это видно в таблице).
  - `ReviewPanel`: только управление экраном — заголовок «На экране: ответ на вопрос N / всего», стрелки ← → (`review_goto`), `QuestionBox` с эталоном. Строк команд и подсказки про предразметку нет.

- [ ] **Step 1: Реализовать по блоку Interfaces**

- [ ] **Step 2: Сборка зелёная**

Run: `cd frontend && npm run build`
Expected: успешная сборка.

- [ ] **Step 3: Проверка в браузере**

Как в задаче 4. Два «телефона» (две вкладки `/play`). Свободный тур: во время таймера ответы появляются в таблице сразу; ✓ во время таймера сохраняется, если команда только переключила ставку; сбрасывается, если она поменяла текст. «Начать разбор», листать экран вперёд и назад — отметки в таблице не меняются, ✔ появляется у показанных. «След. тур» с непроверенным ответом → в диалоге число непроверенных; после перехода сводная таблица на экране содержит очки тура по отметкам.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "feat(console): free-input check table independent from the screen review"
```

---

### Task 8: Основная спека и сквозная проверка

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-tquiz-design.md`

- [ ] **Step 1: Привести основную спеку в соответствие**

По списку раздела «Что меняется в основной спеке» документа `2026-11-19-round-scores-checking-grid-design.md`: §5, §6 п. 5–7, §7, §8, §9. Удалить ставшие неверными строки «Сами ответы во время тура нигде не показываются» и «Очки начисляются, как только стоит отметка». Пометки **[моё решение]** переносить вместе с решениями.

- [ ] **Step 2: Сквозная проверка**

Run: `cd backend && uv run pytest -q` → all passed; `cd frontend && npm test && npm run build` → `# fail 0`, сборка успешна. Затем одна полная игра в браузере (квиз: своя игра, свободный ввод, своя игра) с двумя телефонами по сценариям задач 4, 6 и 7 подряд. Остановить временные серверы, которые запускал.

- [ ] **Step 3: Commit**

```bash
git add docs
git commit -m "docs(spec): per-round scoring, free-input checking, jeopardy cell values"
```
