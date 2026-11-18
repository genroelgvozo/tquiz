import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { EditorPayload, QuizListItem } from "../lib/types";
import { startGame } from "./startGame";
import { useToast } from "./useToast";

export default function QuizList() {
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const navigate = useNavigate();
  const { toast, show } = useToast();

  const load = () => {
    api<QuizListItem[]>("GET", "/api/quizzes").then(setQuizzes).catch((e) => show(String(e.message)));
  };
  useEffect(load, [show]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Ошибка");
    }
  };

  const create = () =>
    run(async () => {
      const title = window.prompt("Название квиза", "Новый квиз");
      if (!title) return;
      const p = await api<EditorPayload>("POST", "/api/quizzes", { title });
      navigate(`/admin/quiz/${p.quiz.id}`);
    });

  const copy = (id: number) =>
    run(async () => {
      await api<EditorPayload>("POST", `/api/quizzes/${id}/copy`);
      load();
    });

  const remove = (q: QuizListItem) =>
    run(async () => {
      if (!window.confirm(`Удалить квиз «${q.title}»?`)) return;
      await api("DELETE", `/api/quizzes/${q.id}`);
      load();
    });

  const start = (id: number) =>
    run(async () => {
      if (await startGame(id)) navigate("/admin/game");
    });

  return (
    <main className="admin-main">
      <div className="row" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Квизы</h2>
        <button className="btn primary" onClick={create}>
          + Создать
        </button>
      </div>
      <div className="card quiz-list">
        {quizzes.length === 0 && <p className="muted" style={{ padding: 14 }}>Пока нет квизов</p>}
        {quizzes.map((q) => (
          <div className="quiz-row" key={q.id}>
            <Link className="quiz-title" to={`/admin/quiz/${q.id}`}>
              {q.title}
            </Link>
            {q.locked && <span className="chip yellow">идёт игра</span>}
            <button className="btn" onClick={() => copy(q.id)}>
              Копировать
            </button>
            <button className="btn" onClick={() => remove(q)} disabled={q.locked}>
              Удалить
            </button>
            <button className="btn primary" onClick={() => start(q.id)}>
              Начать игру
            </button>
          </div>
        ))}
      </div>
      {toast}
    </main>
  );
}
