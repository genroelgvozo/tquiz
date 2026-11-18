import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, uploadMedia } from "../lib/api";
import type { EditorPayload, QuestionData, RoundData } from "../lib/types";
import QuestionForm from "./QuestionForm";
import RoundSettings from "./RoundSettings";
import { startGame } from "./startGame";
import { useToast } from "./useToast";

type Selection = { kind: "round"; id: number } | { kind: "question"; id: number } | null;

export type Mutate = (method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => Promise<boolean>;

export default function QuizEditor() {
  const { id } = useParams();
  const quizId = Number(id);
  const navigate = useNavigate();
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const { toast, show } = useToast();

  useEffect(() => {
    api<EditorPayload>("GET", `/api/quizzes/${quizId}`)
      .then(setPayload)
      .catch((e) => show(e instanceof ApiError ? e.detail : "Не удалось загрузить квиз"));
  }, [quizId, show]);

  const mutate: Mutate = useCallback(
    async (method, path, body) => {
      try {
        const p = await api<EditorPayload>(method, path, body);
        setPayload(p);
        return true;
      } catch (e) {
        show(e instanceof ApiError ? e.detail : "Ошибка сохранения");
        return false;
      }
    },
    [show],
  );

  if (!payload) return <main className="admin-main">{toast}</main>;
  const { quiz, locked } = payload;

  const selectedRound: RoundData | undefined =
    selection?.kind === "round" ? quiz.rounds.find((r) => r.id === selection.id) : undefined;
  let selectedQuestion: QuestionData | undefined;
  let questionRound: RoundData | undefined;
  if (selection?.kind === "question") {
    for (const r of quiz.rounds) {
      const all = r.kind === "jeopardy" ? r.categories.flatMap((c) => c.questions) : r.questions;
      const found = all.find((q) => q.id === selection.id);
      if (found) {
        selectedQuestion = found;
        questionRound = r;
      }
    }
  }

  const addRound = async () => {
    const kind = window.confirm("Создать тур «Своя игра»?\nОК — своя игра, Отмена — свободный ввод")
      ? "jeopardy"
      : "free";
    const title = window.prompt("Название тура", kind === "jeopardy" ? "Своя игра" : "Свободный ввод");
    if (title === null) return;
    await mutate("POST", `/api/quizzes/${quizId}/rounds`, { title, kind });
  };

  const addQuestion = async (round: RoundData, categoryId?: number) => {
    const before = new Set(
      (round.kind === "jeopardy" ? round.categories.flatMap((c) => c.questions) : round.questions).map((q) => q.id),
    );
    try {
      const p = await api<EditorPayload>("POST", `/api/rounds/${round.id}/questions`, {
        category_id: categoryId ?? null,
      });
      setPayload(p);
      const r = p.quiz.rounds.find((x) => x.id === round.id);
      const all = r ? (r.kind === "jeopardy" ? r.categories.flatMap((c) => c.questions) : r.questions) : [];
      const created = all.find((q) => !before.has(q.id));
      if (created) setSelection({ kind: "question", id: created.id });
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Ошибка");
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const media = await uploadMedia(file);
      if (media.kind !== "image") {
        show("Эмблема должна быть картинкой");
        return;
      }
      await mutate("PATCH", `/api/quizzes/${quizId}`, { logo_filename: media.filename });
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Не удалось загрузить файл");
    }
  };

  const start = async () => {
    try {
      if (await startGame(quizId)) navigate("/admin/game");
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Не удалось начать игру");
    }
  };

  return (
    <main className="admin-main">
      {locked && <div className="banner">Идёт игра — редактирование недоступно</div>}
      <div className="editor-head">
        <fieldset className="plain" disabled={locked} style={{ display: "contents" }}>
          <div className="logo-preview">{quiz.logo && <img src={quiz.logo.url} alt="" />}</div>
          <input
            key={quiz.title}
            className="title-input"
            defaultValue={quiz.title}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== quiz.title) mutate("PATCH", `/api/quizzes/${quizId}`, { title });
            }}
          />
          <label className="btn">
            Загрузить эмблему
            <input type="file" accept="image/*" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
          </label>
          {quiz.logo && (
            <button className="btn" onClick={() => mutate("PATCH", `/api/quizzes/${quizId}`, { logo_filename: null })}>
              Убрать эмблему
            </button>
          )}
        </fieldset>
        <button className="btn primary" onClick={start}>
          Начать игру
        </button>
      </div>

      <div className="editor-body">
        <fieldset className="plain card tree" disabled={locked}>
          <p className="label">Туры</p>
          {quiz.rounds.map((r, i) => (
            <div className="tree-round" key={r.id}>
              <div
                className={`tree-item ${selection?.kind === "round" && selection.id === r.id ? "selected" : ""}`}
                onClick={() => setSelection({ kind: "round", id: r.id })}
              >
                <span className="grow tree-round-title">
                  {i + 1}. {r.title || "Без названия"}
                </span>
                <span className="chip">{r.kind === "jeopardy" ? "своя" : "ввод"}</span>
                {r.kind === "free" && r.stakes && <span className="chip yellow">ставки</span>}
                <button className="btn ghost small" title="Выше" onClick={(e) => (e.stopPropagation(), mutate("POST", `/api/rounds/${r.id}/move`, { delta: -1 }))}>
                  ↑
                </button>
                <button className="btn ghost small" title="Ниже" onClick={(e) => (e.stopPropagation(), mutate("POST", `/api/rounds/${r.id}/move`, { delta: 1 }))}>
                  ↓
                </button>
              </div>
              <div className="tree-children">
                {r.kind === "jeopardy" ? (
                  <>
                    {r.categories.map((c) => (
                      <div key={c.id}>
                        <div className="tree-item">
                          <span className="grow tree-cat-name">{c.name || "Без названия"}</span>
                          <button
                            className="btn ghost small"
                            title="Переименовать"
                            onClick={() => {
                              const name = window.prompt("Название категории", c.name);
                              if (name !== null) mutate("PATCH", `/api/categories/${c.id}`, { name });
                            }}
                          >
                            ✎
                          </button>
                          <button className="btn ghost small" onClick={() => mutate("POST", `/api/categories/${c.id}/move`, { delta: -1 })}>
                            ↑
                          </button>
                          <button className="btn ghost small" onClick={() => mutate("POST", `/api/categories/${c.id}/move`, { delta: 1 })}>
                            ↓
                          </button>
                          <button
                            className="btn ghost small"
                            title="Удалить категорию"
                            onClick={() => window.confirm(`Удалить категорию «${c.name}» со всеми вопросами?`) && mutate("DELETE", `/api/categories/${c.id}`)}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="value-chips">
                          {c.questions.map((q) => (
                            <button
                              key={q.id}
                              className={`value-chip ${q.is_secret ? "secret" : ""} ${selection?.kind === "question" && selection.id === q.id ? "selected" : ""}`}
                              title={q.text}
                              onClick={() => setSelection({ kind: "question", id: q.id })}
                            >
                              {q.value}
                              {q.is_secret ? " 🎁" : ""}
                              {q.media ? (q.media.kind === "audio" ? " ♪" : " ▣") : ""}
                            </button>
                          ))}
                          <button className="value-chip" onClick={() => addQuestion(r, c.id)}>
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                    <div
                      className="tree-item muted"
                      onClick={() => {
                        const name = window.prompt("Название категории");
                        if (name) mutate("POST", `/api/rounds/${r.id}/categories`, { name });
                      }}
                    >
                      + категория
                    </div>
                  </>
                ) : (
                  <>
                    {r.questions.map((q, qi) => (
                      <div
                        key={q.id}
                        className={`tree-item ${selection?.kind === "question" && selection.id === q.id ? "selected" : ""}`}
                        onClick={() => setSelection({ kind: "question", id: q.id })}
                      >
                        <span className="grow">
                          {qi + 1}. {q.text || <span className="muted">пустой вопрос</span>}
                        </span>
                        {q.options.length > 0 && <span className="chip">варианты</span>}
                        {q.media && <span className="chip">{q.media.kind === "audio" ? "♪" : "▣"}</span>}
                      </div>
                    ))}
                    <div className="tree-item muted" onClick={() => addQuestion(r)}>
                      + вопрос
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          <div className="tree-item" style={{ color: "#0071e3" }} onClick={addRound}>
            + тур
          </div>
        </fieldset>

        <fieldset className="plain card pane" disabled={locked}>
          {selectedRound && (
            <RoundSettings
              key={selectedRound.id}
              round={selectedRound}
              mutate={mutate}
              onDeleted={() => setSelection(null)}
            />
          )}
          {selectedQuestion && questionRound && (
            <QuestionForm
              key={selectedQuestion.id}
              question={selectedQuestion}
              round={questionRound}
              mutate={mutate}
              notify={show}
              onDeleted={() => setSelection(null)}
            />
          )}
          {!selectedRound && !selectedQuestion && (
            <p className="muted">Выберите тур или вопрос слева.</p>
          )}
        </fieldset>
      </div>
      {toast}
    </main>
  );
}
