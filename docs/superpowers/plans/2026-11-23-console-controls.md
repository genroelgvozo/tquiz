# Пульт: кнопки хода игры, горячие клавиши, подтверждения, пустые вопросы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка следующего шага игры всегда в одном месте, управление экраном отдельно, частые действия с клавиатуры, опасные переходы с подтверждением, незаполненные вопросы видны в редакторе.

**Architecture:**
- **Бэкенд.** Каждая запись стека отмены получает подпись (`label`), пульт видит подпись верхней записи в поле `undo_label` вместо `undo_available`.
- **Фронт, решения.** Все решения пульта («какая кнопка шага, залита ли, какое подтверждение», «нужно ли подтверждение при ←/→», «чего не хватает вопросу») — чистые функции без Mantine, покрытые `node:test`.
- **Фронт, вид.** Над панелями пульта две закреплённые строки: `ScreenBar` (экран) и `FlowBar` (ход игры). Панели этапов теряют свои кнопки шага. Горячие клавиши — через одну обёртку `useConsoleHotkeys` над `useHotkeys` из `@mantine/hooks`.

**Tech Stack:** Python 3.12, FastAPI, pydantic, pytest (через `uv`); React 18, TypeScript, Vite, Mantine 8.3.18 (`@mantine/core`, `@mantine/hooks`, `@mantine/modals`); тесты чистых TS-функций на `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-23-console-controls-design.md` (дополняет `docs/superpowers/specs/2026-11-18-tquiz-design.md`).

## Global Constraints

- Интерфейс и документация на русском, код и идентификаторы на английском.
- Что видит каждая роль, решается только в `backend/app/game/views.py`; новое поле есть только в `AdminView`, тест в `backend/tests/test_views.py` это проверяет.
- Админка из компонентов Mantine: раскладка `Stack`/`Group`/`Grid`, отступы пропсами темы, без своих классов и `style={{ margin… }}` (`style={{ zIndex }}` для закреплённой полосы допустим). Подтверждения только через `confirmDialog` из `src/admin/dialogs.tsx`, ошибки через `src/admin/notify.ts`.
- Чистые функции (`step.ts`, `freeNav.ts`, `questionStatus.ts`) не импортируют Mantine и React: их запускает `node --experimental-strip-types --test`. Типы импортировать только через `import type`.
- Минус в подписях — символ `−` (U+2212), как в «✗ Неверно −100».
- Старый JSON игры (записи `undo_stack` без `label`) загружается и отменяется.
- Ширины проверки: 1280×800 и 1440×900; строка хода игры не переносится.
- Проверки: `cd backend && uv run pytest`; `cd frontend && npm test && npm run build`.
- Работа в ветке `console-controls` (создать от `main` перед задачей 1). Коммит в конце каждой задачи, сообщение на английском в стиле репозитория (`feat(admin): …`), с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Не пушить: пуш в `main` выкатывает прод.

## Review Focus

1. **Ведущий печатает в поле ± или в окне переименования, а пульт ловит клавиши** (Space, `-`, стрелки). Клавиши не должны срабатывать. Ручная проверка в задаче 3.
2. **Фокус остался на кнопке после клика мышью, ведущий жмёт Space.** Должно случиться одно действие, а не два (например, таймер запустился и сразу встал на паузу). Ручная проверка в задачах 3 и 5.
3. **Двойной клик по кнопке шага на смене этапа** («Старт» → «Начать тур»). Должен сработать только «Старт». Ручная проверка в задаче 3.
4. **Игра, начатая до выкатки: в стеке отмены записи без подписи.** Пульт показывает «↶ Отменить», отмена работает. Тест в задаче 1.
5. **Последняя ячейка своей игры открыта, вопрос ещё идёт.** Кнопка шага не залита, «След. тур» спрашивает «Тур не закончен». Тест в задаче 2.

---

### Task 1: Подписи у записей отмены на сервере

**Files:**
- Modify: `backend/app/game/engine.py` (`_run_admin`, новая `_undo_label`)
- Modify: `backend/app/game/views.py` (`AdminView`, `admin_view`)
- Modify: `frontend/src/lib/types.ts` (`AdminView`)
- Modify: `frontend/src/admin/console/TeamsPanel.tsx:23` (временная правка, чтобы сборка проходила)
- Test: `backend/tests/test_undo_label.py` (новый), `backend/tests/test_views.py`

**Interfaces:**
- Produces: `AdminView.undo_label: str | None` (Python) / `undo_label: string | null` (TS). `None` — отменять нечего; `""` — есть запись без подписи (старая игра); иначе подпись верхней записи. Поле `undo_available` удаляется.

- [ ] **Step 1: Write the failing tests** in `backend/tests/test_undo_label.py`. Игра — как `setup()` в `tests/test_jeopardy.py`: тур «Своя игра» с темами `Кино: q(1, value=100), q(2, value=200, is_secret=True)` и `Музыка: q(3, value=300)`, команды «А», «Б», «В», `buzzer_mode="instant"`; хелпер `label(g) = admin_view(g, "u", set()).undo_label`.

```python
def test_empty_stack_has_no_label():            # после StartRound
    assert label(g) is None

def test_open_cell_label():                     # OpenCell(question_id=1)
    assert label(g) == "открыта Кино · 100"

def test_judge_labels_with_minus():             # reveal, buzz А, Judge(False); buzz Б, Judge(True)
    # после Judge(False):
    assert label(g) == "✗ А −100"
    # после Judge(True):
    assert label(g) == "✓ Б +100"

def test_judge_wrong_without_minus():           # setup(minus=False), buzz А, Judge(False)
    assert label(g) == "✗ А"

def test_secret_recipient_label():              # SetChooser(team_id=А), OpenCell(question_id=2), SetSecretRecipient(team_id=Б)
    assert label(g) == "секрет → Б"

def test_adjust_score_labels():
    # AdjustScore(team=А, delta=50) -> "правка А +50"; AdjustScore(team=А, delta=-5) -> "правка А −5"

def test_undo_shows_previous_label():           # OpenCell(1), reveal, buzz А, Judge(True), Undo()
    assert label(g) == "открыта Кино · 100"

def test_old_entry_without_label_still_undoes():
    # после StartRound: scoring.add_points(g.team(a), 0, 3)
    # g.state.undo_stack.append({"kind": "score", "team_id": a, "delta": 3, "round": 0})  # запись старого формата
    assert label(g) == ""
    g.apply_admin(Undo())
    assert label(g) is None and round_score(g, a) == 0

def test_judge_with_nobody_answering_still_raises_game_error():
    with pytest.raises(GameError, match="Никто не отвечает"):
        g.apply_admin(Judge(correct=True))      # сразу после OpenCell, до нажатий
```

В `backend/tests/test_views.py` добавить:

```python
def test_undo_label_only_in_admin_view():
    for g, _ in scripted_states():
        assert "undo_label" not in screen_view(g, "u").model_dump_json()
        for t in g.state.teams:
            assert "undo_label" not in team_view(g, t.id).model_dump_json()
```

(сигнатуру `team_view` взять из существующих тестов в этом файле).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_undo_label.py tests/test_views.py -q`
Expected: FAIL — у `AdminView` нет атрибута `undo_label`.

- [ ] **Step 3: Implement `_undo_label(game: Game, cmd) -> str` in `backend/app/game/engine.py`** и записать результат в `entry["label"]` в `_run_admin` для обоих видов записей (`"score"` и `"state"`), вычисляя подпись **до** вызова `handler`. Форматы (имена команд — `team.name`, стоимость — `value` текущего вопроса, тема — имя категории текущего тура, где лежит вопрос):
  - `Judge(correct=True)`: `"✓ {name} +{value}"`; `Judge(correct=False)`: `"✗ {name} −{value}"`, если в туре `minus_on_wrong`, иначе `"✗ {name}"`; отвечающая команда — `jeopardy.answering_team_id`.
  - `OpenCell`: `"открыта {category} · {value}"`.
  - `SetSecretRecipient`: `"секрет → {name}"`.
  - `AdjustScore`: `"правка {name} +{delta}"` / `"правка {name} −{abs(delta)}"`.
  - Если данных нет (никто не отвечает, команды или вопроса нет) — вернуть `""`, не бросать: проверку и `GameError` делает сам обработчик.

- [ ] **Step 4: Replace `undo_available: bool` with `undo_label: str | None` in `AdminView`** (`backend/app/game/views.py`): `st.undo_stack[-1].get("label", "") if st.undo_stack else None`. В `frontend/src/lib/types.ts` поле `undo_label: string | null` вместо `undo_available`. В `TeamsPanel.tsx:23` временно `disabled={view.undo_label === null}` (кнопка переедет в задаче 3).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest -q && cd ../frontend && npm run build`
Expected: все тесты PASS, сборка без ошибок типов.

- [ ] **Step 6: Commit**

```bash
git add backend/app/game/engine.py backend/app/game/views.py backend/tests/test_undo_label.py backend/tests/test_views.py frontend/src/lib/types.ts frontend/src/admin/console/TeamsPanel.tsx
git commit -m "feat(game): label undo entries and send the top label to the console"
```

---

### Task 2: Чистые функции хода игры

**Files:**
- Create: `frontend/src/admin/console/step.ts`
- Test: `frontend/tests/step.test.ts`

**Interfaces:**
- Consumes: `AdminView` из `src/lib/types.ts`; `uncheckedCount(view)` из `src/admin/console/check.ts`.
- Produces:

```ts
export type StepAction = "start_game" | "start_round" | "next_round" | "start_review" | "finish_game" | "close_game";
export interface StepButton { action: StepAction; label: string; highlighted: boolean }
export interface MenuItem { action: StepAction; label: string }
export interface ConfirmSpec { title: string; message?: string; confirmLabel: string; danger?: boolean }

export function stageTitle(view: AdminView): string;
export function roundProgress(view: AdminView): { unchecked: number; unfinished: boolean };
export function stepButton(view: AdminView): StepButton;
export function menuItems(view: AdminView): MenuItem[];
export function stepConfirm(view: AdminView, action: StepAction): ConfirmSpec | null;
```

`ConfirmSpec` структурно совместим с аргументом `confirmDialog`.

- [ ] **Step 1: Write the failing tests** in `frontend/tests/step.test.ts`. Фикстура — как в `tests/check.test.ts`: частичный объект, приведённый `as unknown as AdminView`; квиз из трёх туров (`rounds.length = 3`), своя игра с 6 вопросами, свободный ввод с 3 вопросами.

```ts
test("lobby: Старт, highlighted, menu has close_game", ...)
  // stepButton -> { action: "start_game", label: "Старт", highlighted: true }
  // menuItems -> [{ action: "close_game", label: "Закрыть игру" }]
  // stageTitle -> "Лобби · Демо-квиз"
test("intro: Начать тур; menu: Пропустить тур + Завершить игру; last round menu has only Завершить игру", ...)
  // stageTitle (round_index 0, title "Разминка") -> "Тур 1 из 3 · Заставка · Разминка"
test("jeopardy mid-round: След. тур →, not highlighted; menu: Завершить игру", ...)
  // stageTitle -> "Тур 1 из 3 · Своя игра · Разминка"
test("jeopardy all played but last question open (phase question or secret): not highlighted, unfinished", ...)
  // played.length === 6, phase "question" -> highlighted false, roundProgress().unfinished true
test("jeopardy all played, phase board or answer: highlighted, finished", ...)
test("jeopardy in last round: Завершить игру", ...)
  // { action: "finish_game", label: "Завершить игру" }, menuItems -> []
test("free questions: Начать разбор highlighted only on last question with finished timer", ...)
  // index 2 + timer finished -> true; index 2 + timer idle -> false; index 1 + finished -> false
  // menuItems -> [{ next_round, "След. тур без разбора" }, { finish_game, "Завершить игру" }]
test("free questions in last round: menu has only Завершить игру", ...)
test("free review: След. тур → highlighted when last question answer shown", ...)
  // review_index 2 + answer_shown -> true; review_index 1 + answer_shown -> false
  // menuItems -> [{ finish_game, "Завершить игру" }]; in last round: Завершить игру is the step, menuItems -> []
  // stageTitle -> "Тур 2 из 3 · Свободный ввод · Разбор · <title>"
test("finished: Закрыть игру highlighted, empty menu; title Игра окончена", ...)
test("stepConfirm: next_round from intro is null", ...)
test("stepConfirm: next_round unfinished free round lists unchecked count", ...)
  // { title: "Тур не закончен", message: "Есть неразобранные ответы или несыгранные вопросы. Не проверено ответов: 2. Перейти к следующему туру? Вернуться будет нельзя.", confirmLabel: "Перейти", danger: true }
test("stepConfirm: next_round finished round asks plainly", ...)
  // { title: "Перейти к следующему туру?", confirmLabel: "Перейти" }
test("stepConfirm: finish_game warns only for unfinished free round", ...)
  // free unfinished: { title: "Тур не закончен", message: "Есть неразобранные ответы или несыгранные вопросы.[ Не проверено ответов: N.] Завершить игру и показать победителя?", confirmLabel: "Завершить", danger: true }
  // otherwise: { title: "Завершить игру и показать победителя?", confirmLabel: "Завершить" }
test("stepConfirm: start_review early vs on time", ...)
  // early (not last question, or timer running/paused): { title: "Начать разбор?", message: "Вернуться к вопросам этого тура будет нельзя.", confirmLabel: "Начать разбор" }
  // last question, timer finished or idle -> null
test("stepConfirm: close_game", ...)
  // { title: "Закрыть игру?", message: "Экран и телефоны вернутся в ожидание.", confirmLabel: "Закрыть игру", danger: true }
test("stepConfirm: start_game and start_round are null", ...)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — нет модуля `src/admin/console/step.ts`.

- [ ] **Step 3: Implement `step.ts`.** Правила — таблица «Кнопка шага» и раздел «Меню «⋯»» спеки; «последний тур» — `round_index + 1 >= quiz.rounds.length`. `roundProgress` переносит логику из `Console.tsx` (`roundProgress` внутри компонента) с одним изменением: своя игра не закончена ещё и пока `jeopardy.phase` равна `"question"` или `"secret"`. Тексты подтверждений — ровно нынешние из `Console.tsx` и `FreePanel.tsx` (перечислены в тестах). В названии тура при пустом `title` — «Без названия».

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (вместе со старыми тестами).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/console/step.ts frontend/tests/step.test.ts
git commit -m "feat(admin): pure step-button, menu and confirmation rules for the console"
```

---

### Task 3: Строки «Экран» и «Ход игры», горячие клавиши, перенос «Отменить»

**Files:**
- Create: `frontend/src/admin/console/useConsoleHotkeys.ts`
- Create: `frontend/src/admin/console/ScreenBar.tsx`
- Create: `frontend/src/admin/console/FlowBar.tsx`
- Modify: `frontend/src/admin/console/Console.tsx` (шапка, заставка, конец игры, `closeGame`)
- Modify: `frontend/src/admin/console/LobbyPanel.tsx` (убрать «Старт»)
- Modify: `frontend/src/admin/console/FreePanel.tsx:34-50` (убрать «Начать разбор»)
- Modify: `frontend/src/admin/console/TeamsPanel.tsx:21-26` (убрать «Отменить»)

**Interfaces:**
- Consumes: `stageTitle`, `stepButton`, `menuItems`, `stepConfirm`, `StepAction` (задача 2); `view.undo_label` (задача 1).
- Produces:

```ts
// key: hotkey string for Mantine with physical keys ("space", "equal", "shift+equal", "numpadadd",
// "minus", "numpadsubtract", "escape", "arrowleft", "arrowright", "mod+z"); null handler = key is off
export function useConsoleHotkeys(bindings: [key: string, handler: (() => void) | null][]): void;
```

- [ ] **Step 1: Implement `useConsoleHotkeys`.** Обёртка над `useHotkeys` из `@mantine/hooks` (теги по умолчанию — `INPUT`, `TEXTAREA`, `SELECT` — игнорируются самим Mantine); каждая запись с `{ preventDefault: true, usePhysicalKeys: true }`; записи с `null` не регистрируются. Внутри обработчика, перед вызовом:
  - если в документе есть открытый диалог (`document.querySelector('[role="dialog"]')`), ничего не делать;
  - если `document.activeElement` — кнопка (`tagName === "BUTTON"`), снять с неё фокус (`blur()`), чтобы отпускание Space не нажало её второй раз.

- [ ] **Step 2: Implement `ScreenBar({ view, send, status })`.** Один `Group gap="xs"`: подпись `SectionLabel mb={0}` «Экран»; `Button variant="default"` «Открыть» (`window.open(screenUrl, "tquiz-screen")`) и «QR экрана» (модалка с QR переезжает сюда из `Console.tsx` вместе с загрузкой `/api/game/screen-link`); три `Chip` (`checked` = включено): «QR входа» (`qr_visible`, команда `show_qr`), «Рейтинг» (`overlay === "leaderboard"`, команда `set_overlay`), «Музыка» (`music !== null && !music_paused`, `disabled` при `music === null`, команда `music_toggle`). В правом конце (`ml="auto"`), только при `view.screen_sound === "off"`: `Badge color="red"` «Нет звука на экране — кликните по нему».

- [ ] **Step 3: Implement `FlowBar({ view, send, status, onCloseGame })`.** Один `Group gap="xs" wrap="nowrap"`:
  1. `Badge color="yellow"` «нет связи…», если `status !== "open"`;
  2. `Text fw={700} truncate flex={1} miw={0}` со `stageTitle(view)`;
  3. «Отменить»: `Button variant="default" maw={260}`, неактивна при `undo_label === null`; текст «↶ Отменить» или «↶ Отменить: {undo_label}», обрезка многоточием, полный текст в `title`; клавиша `mod+z` через `useConsoleHotkeys` (обработчик `null`, когда отменять нечего), подсказка `Kbd` «⌘Z»;
  4. кнопка шага: `Button miw={170} variant={highlighted ? "filled" : "default"}` с `label` из `stepButton`;
  5. меню: `Menu` с `ActionIcon variant="default" size="input-sm"` «⋯» и пунктами `menuItems`; если пунктов нет — пустой `Box w={36}` того же размера.

  Нажатие кнопки шага или пункта меню: `stepConfirm(view, action)` → если не `null`, `confirmDialog(spec)`; затем `close_game` → `onCloseGame()` (POST `/api/game/stop`, как нынешний `closeGame`, без своего подтверждения — оно уже в `stepConfirm`), остальные — `send({ type: action })`.

  Защита от двойного клика: ключ этапа `${stage}:${round_index}:${free?.phase ?? ""}`; при его смене запомнить время; нажатия кнопки шага в течение 1000 мс после смены игнорировать.

- [ ] **Step 4: Rewire `Console.tsx`.** Вместо нынешней шапки (`Group` с заголовком и кнопками) — `Box pos="sticky" top={52}` (высота `AppShell.Header`) с фоном `gray.0`, `style={{ zIndex: 10 }}` и `Stack gap="xs" py="xs"` из `ScreenBar` и `FlowBar`. Убрать `STAGE_TITLES`, `roundProgress`, `hasNextRound`, `inGame` и обработчики «След. тур»/«Завершить игру». Из панели заставки убрать «Начать тур» (оставить «Показать заставку тура»), из панели конца игры — «Закрыть игру». Из `LobbyPanel` — «Старт», из `FreePanel` — «Начать разбор» с его подтверждением, из `TeamsPanel` — «Отменить».

- [ ] **Step 5: Build and run tests**

Run: `cd frontend && npm test && npm run build`
Expected: PASS, сборка без ошибок.

- [ ] **Step 6: Verify in the browser** (бэк на копии данных, `TQUIZ_BACKEND`, 3 телефона — как в `CLAUDE.md`; можно автоматизировать Playwright'ом с `channel: "chrome"`). На 1280×800 и 1440×900, по всем этапам (лобби → заставка → своя игра → свободный ввод → разбор → конец):
  - строка хода игры в одну строку, кнопка шага и «⋯» не сдвигаются при смене этапа, при открытии экрана без звука (плашка) и после включения звука;
  - обе строки остаются на месте при прокрутке страницы вниз;
  - (Review Focus 1) фокус в поле ± у команды: `⌘Z` и другие клавиши не срабатывают; открыт диалог переименования — тоже;
  - (Review Focus 3) двойной клик по «Старт» запускает только игру, заставка остаётся на «Начать тур»;
  - `⌘Z` после ручной правки счёта отменяет её, подпись на кнопке «правка … +N».

- [ ] **Step 7: Commit**

```bash
git add frontend/src/admin/console/
git commit -m "feat(admin): fixed screen and game-flow bars with a single step button"
```

---

### Task 4: Своя игра: «Пропустить вопрос», «К сетке», клавиши

**Files:**
- Modify: `frontend/src/admin/console/JeopardyPanel.tsx:131-193`

**Interfaces:**
- Consumes: `useConsoleHotkeys` (задача 3), `confirmDialog`.

- [ ] **Step 1: Split the action row.** В фазах `question` и `secret`: слева «Показать ответ» (как сейчас, без клавиши), справа (`ml="auto"`) `Button variant="subtle" color="gray"` «Пропустить вопрос» → `confirmDialog({ title: "Пропустить вопрос?", message: "Ответ не покажется, ячейка будет сыграна.", confirmLabel: "Пропустить", danger: true })` → `send({ type: "to_board" })`. В фазе `answer`: только `Button` (filled) «К сетке →» с `Kbd` «Esc», без подтверждения.

- [ ] **Step 2: Bind keys** через `useConsoleHotkeys`, каждая — только когда соответствующая кнопка видна:
  - `space` → `open_buttons` (идёт раскрытие `starts_at !== null` или полоска `buttons === "bar"`, никто не отвечает);
  - `equal`, `shift+equal`, `numpadadd` → `judge` верно; `minus`, `numpadsubtract` → `judge` неверно (кто-то отвечает);
  - `escape` → `to_board` (фаза `answer`).

  Подсказки `Kbd` на кнопках: «Открыть кнопки сейчас» — «Space», «✓ Верно» — «+», «✗ Неверно» — «−».

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: без ошибок.

- [ ] **Step 4: Verify in the browser:** открыть ячейку в режиме «полоска» → Space открывает кнопки; нажатие с телефона → `+` даёт «✓», в другом вопросе `-` даёт «✗»; Esc после ответа возвращает к сетке; «Пропустить вопрос» спрашивает подтверждение; (Review Focus 2) кликнуть мышью «Открыть кнопки сейчас», потом в следующем вопросе нажать Space — одно действие, без повторного нажатия кнопки в фокусе. Enter ничего не делает.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/console/JeopardyPanel.tsx
git commit -m "feat(admin): jeopardy hotkeys and a guarded skip-question button"
```

---

### Task 5: Свободный ввод: подтверждение ←/→, клавиши

**Files:**
- Create: `frontend/src/admin/console/freeNav.ts`
- Test: `frontend/tests/freeNav.test.ts`
- Modify: `frontend/src/admin/console/FreePanel.tsx`, `frontend/src/admin/console/ReviewPanel.tsx`

**Interfaces:**
- Consumes: `ConfirmSpec` из `step.ts` (задача 2), `useConsoleHotkeys` (задача 3).
- Produces: `export function freeNavConfirm(view: AdminView, target: number): ConfirmSpec | null;` (`target` — индекс вопроса в туре, с нуля).

- [ ] **Step 1: Write the failing tests** in `frontend/tests/freeNav.test.ts` (тур из 4 вопросов с id 31–34; `free.opened`, `free.timer.status`, `free.index` задаются в фикстуре):

```ts
test("timer finished, new question: no confirm", ...)          // index 0, opened [31], finished, target 1 -> null
test("timer idle, new question: no confirm", ...)              // idle -> null
test("timer running: confirm", ...)
  // -> { title: "Перейти к вопросу 2?", message: "Таймер ещё идёт — текущий вопрос закроется.", confirmLabel: "Перейти", danger: true }
test("timer paused counts as running", ...)
test("already opened question: confirm", ...)                  // index 2, finished, opened [31,32,33], target 1
  // -> { title: "Перейти к вопросу 2?", message: "Вопрос 2 уже был: таймер начнётся сначала, команды смогут поменять ответ.", confirmLabel: "Перейти", danger: true }
test("both reasons: one dialog with both sentences", ...)      // running + target opened
  // message === "Таймер ещё идёт — текущий вопрос закроется. Вопрос 2 уже был: таймер начнётся сначала, команды смогут поменять ответ."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — нет модуля `freeNav.ts`.

- [ ] **Step 3: Implement `freeNavConfirm`** по тестам: «уже открывался» — id вопроса `target` есть в `free.opened`; «таймер идёт» — `free.timer.status` равен `"running"` или `"paused"`; номер вопроса в текстах — `target + 1`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Wire FreePanel and ReviewPanel.** `FreePanel`: кнопки «←»/«→» и клавиши `arrowleft`/`arrowright` идут через одну функцию `go(target)`: `freeNavConfirm` → при необходимости `confirmDialog` → `send({ type: "open_question", index: target })`; на первом/последнем вопросе соответствующая клавиша выключена, как и кнопка. Клавиша `space` → «Запустить таймер» / «Пауза» / «Продолжить» по `timer.status` (при `finished` — выключена). `ReviewPanel`: клавиши `arrowleft`/`arrowright` → `review_goto` без подтверждения, на краях выключены. Подсказки `Kbd` на «←», «→», кнопках таймера («Space»).

- [ ] **Step 6: Build and verify in the browser**

Run: `cd frontend && npm test && npm run build`
Then: свободный ввод с двумя телефонами — запустить таймер, нажать → (подтверждение «Таймер ещё идёт…»), отменить; дождаться конца таймера, → без подтверждения; ← на прошлый вопрос — подтверждение «Вопрос N уже был…»; Space запускает и ставит на паузу таймер; (Review Focus 1) пока фокус в поле ± у команды, стрелки и Space не срабатывают; в разборе стрелки листают, Enter ничего не делает.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/admin/console/freeNav.ts frontend/tests/freeNav.test.ts frontend/src/admin/console/FreePanel.tsx frontend/src/admin/console/ReviewPanel.tsx
git commit -m "feat(admin): confirm risky free-round navigation, timer and arrow hotkeys"
```

---

### Task 6: Незаполненные вопросы в редакторе

**Files:**
- Create: `frontend/src/admin/questionStatus.ts`
- Test: `frontend/tests/questionStatus.test.ts`
- Modify: `frontend/src/admin/QuizEditor.tsx:213-320` (дерево туров)

**Interfaces:**
- Produces:

```ts
export function missingParts(q: Pick<QuestionData, "text" | "answer" | "media" | "options" | "correct_option">): string[];
export function incompleteCount(round: RoundData): number;  // jeopardy: по всем темам; free: по questions
```

- [ ] **Step 1: Write the failing tests** in `frontend/tests/questionStatus.test.ts`:

```ts
test("filled question is complete", ...)                         // text "Q", answer "A" -> []
test("no text and no media", ...)                                 // text "  ", answer "A", media null -> ["нет текста"]
test("media without text is fine", ...)                           // text "", media {kind:"audio",...} -> []
test("empty answer", ...)                                         // text "Q", answer " " -> ["нет ответа"]
test("options without correct one", ...)                          // options ["x","y"], correct_option null, answer "" -> ["не отмечен верный вариант"]
test("options with correct one need no text answer", ...)        // correct_option 1, answer "" -> []
test("several reasons are all listed", ...)                       // text "", answer "" -> ["нет текста", "нет ответа"]
test("incompleteCount counts jeopardy categories and free questions", ...)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — нет модуля.

- [ ] **Step 3: Implement `questionStatus.ts`** по разделу «Часть 4» спеки и тестам (порядок причин: «нет текста», затем «не отмечен верный вариант» или «нет ответа»).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Mark the tree in `QuizEditor.tsx`.**
  - Кнопка стоимости вопроса своей игры с непустым `missingParts`: `color="orange" variant="light"` (если не выбрана); выбранный вопрос остаётся `filled`; пунктир секрета сохраняется. `title` = текст вопроса, а у незаполненного — причины через «, ».
  - Строка вопроса свободного ввода: `Badge color="orange"` с причинами в `rightSection` рядом с «варианты» и значком медиа.
  - У тура рядом с бейджами типа: `Badge color="orange"` «не заполнено: N», если `incompleteCount(r) > 0`.

- [ ] **Step 6: Build and verify in the browser:** создать тур «Своя игра» с двумя темами — все ячейки оранжевые, у тура «не заполнено: 10»; заполнить текст и ответ одного вопроса — ячейка становится обычной, счётчик 9; вопрос ввода с вариантами без отметки — бейдж «не отмечен верный вариант».

Run: `cd frontend && npm test && npm run build`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/admin/questionStatus.ts frontend/tests/questionStatus.test.ts frontend/src/admin/QuizEditor.tsx
git commit -m "feat(admin): highlight incomplete questions in the quiz editor"
```

---

### Task 7: Документация и итоговая проверка

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-tquiz-design.md` (§6 п. 5, 7, 8; §7; §8; новый абзац)
- Modify: `CLAUDE.md` (раздел «Стек», строка про админку)
- Add: `docs/superpowers/specs/2026-11-23-console-controls-design.md` (уже написан, закоммитить)

- [ ] **Step 1: Update the main spec** по разделу «Что меняется в основной спеке» новой спеки, коротко и со ссылкой на `2026-11-23-console-controls-design.md`. Статус новой спеки сверху не менять.

- [ ] **Step 2: Add one line to `CLAUDE.md`** после строки про `roundKinds.ts`: «Горячие клавиши пульта — только через `src/admin/console/useConsoleHotkeys.ts` (физические клавиши, не срабатывают в полях и при открытом диалоге). Решения пульта (кнопка шага, подтверждения) — чистые функции в `src/admin/console/step.ts` и `freeNav.ts`.»

- [ ] **Step 3: Full check**

Run: `cd backend && uv run pytest -q && cd ../frontend && npm test && npm run build`
Expected: всё PASS.

- [ ] **Step 4: Screenshot pass** на 1280×800 и 1440×900 по всем этапам игры (как в шаге 6 задачи 3); приложить пути к скриншотам в отчёт.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-11-18-tquiz-design.md docs/superpowers/specs/2026-11-23-console-controls-design.md CLAUDE.md
git commit -m "docs: console controls, hotkeys and incomplete-question markers"
```
