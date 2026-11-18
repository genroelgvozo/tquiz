import { useState } from "react";
import { ApiError, uploadMedia } from "../lib/api";
import type { QuestionData, RoundData } from "../lib/types";
import { confirmDialog } from "./dialogs";
import type { Mutate } from "./QuizEditor";

const MAX_OPTIONS = 4;

export default function QuestionForm({
  question,
  round,
  mutate,
  notify,
  onDeleted,
}: {
  question: QuestionData;
  round: RoundData;
  mutate: Mutate;
  notify: (m: string) => void;
  onDeleted: () => void;
}) {
  const path = `/api/questions/${question.id}`;
  const patch = (body: Record<string, unknown>) => mutate("PATCH", path, body);
  const isJeopardy = round.kind === "jeopardy";

  // options are edited locally and saved as a whole (server validates 2–4 non-empty)
  const [options, setOptions] = useState<string[]>(question.options);
  const [correct, setCorrect] = useState<number | null>(question.correct_option);
  const [uploading, setUploading] = useState(false);

  const saveOptions = (next: string[], nextCorrect: number | null) => {
    const filled = next.map((o) => o.trim());
    if (filled.length > 0 && (filled.length < 2 || filled.some((o) => !o))) return; // wait until valid
    patch({ options: filled, correct_option: filled.length ? nextCorrect : null });
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadMedia(file);
      await patch({ media_filename: media.filename, media_kind: media.kind });
    } catch (e) {
      notify(e instanceof ApiError ? e.detail : "Не удалось загрузить файл");
    } finally {
      setUploading(false);
    }
  };

  const textField = (label: string, key: "text" | "answer", rows = 3) => (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={rows}
        defaultValue={question[key]}
        onBlur={(e) => e.target.value !== question[key] && patch({ [key]: e.target.value })}
      />
    </label>
  );

  const optionalNumber = (label: string, key: "discuss_seconds" | "input_seconds", fallback: number) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        placeholder={`как в туре (${fallback})`}
        defaultValue={question[key] ?? ""}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const v = raw === "" ? null : Number(raw);
          if (v !== question[key]) patch({ [key]: v });
        }}
      />
    </label>
  );

  return (
    <div>
      <p className="label">Вопрос</p>

      {isJeopardy ? (
        <div className="grid-2">
          <label className="field">
            <span>Тип</span>
            <select value={question.is_secret ? "secret" : "normal"} onChange={(e) => patch({ is_secret: e.target.value === "secret" })}>
              <option value="normal">обычный</option>
              <option value="secret">секрет</option>
            </select>
          </label>
          <label className="field">
            <span>Стоимость</span>
            <input
              type="number"
              defaultValue={question.value}
              onBlur={(e) => Number(e.target.value) !== question.value && patch({ value: Number(e.target.value) })}
            />
          </label>
        </div>
      ) : (
        <label className="field" style={{ maxWidth: 200 }}>
          <span>Номинал</span>
          <input
            type="number"
            min={0}
            defaultValue={question.nominal}
            onBlur={(e) => Number(e.target.value) !== question.nominal && patch({ nominal: Number(e.target.value) })}
          />
        </label>
      )}

      {textField("Текст вопроса", "text", 4)}
      {textField("Правильный ответ (видишь только ты)", "answer", 2)}

      <div className="field">
        <span>Медиа (картинка или аудио)</span>
        <div className="row">
          <label className="btn">
            {uploading ? "Загружаем…" : question.media ? "Заменить файл" : "Загрузить файл"}
            <input
              type="file"
              accept="image/*,audio/*,.mp3,.m4a,.ogg,.wav"
              hidden
              onChange={(e) => onUpload(e.target.files?.[0])}
            />
          </label>
          {question.media && (
            <button className="btn" onClick={() => patch({ media_filename: null, media_kind: null })}>
              Убрать
            </button>
          )}
        </div>
        {question.media && (
          <div className="media-preview">
            {question.media.kind === "image" ? (
              <img src={question.media.url} alt="" />
            ) : (
              <audio controls src={question.media.url} preload="none" />
            )}
          </div>
        )}
      </div>

      {!isJeopardy && (
        <>
          <div className="field">
            <span>Варианты ответа (необязательно, до 4) — отметь правильный</span>
            {options.map((opt, i) => (
              <div className="option-row" key={i}>
                <input
                  type="radio"
                  name={`correct-${question.id}`}
                  checked={correct === i}
                  onChange={() => {
                    setCorrect(i);
                    saveOptions(options, i);
                  }}
                />
                <input
                  type="text"
                  className="field-input"
                  value={opt}
                  placeholder={`Вариант ${String.fromCharCode(65 + i)}`}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                  onBlur={() => saveOptions(options, correct)}
                  style={{ border: "1px solid var(--light-border)", borderRadius: 6, padding: "6px 8px" }}
                />
                <button
                  className="btn ghost small"
                  onClick={() => {
                    const next = options.filter((_, j) => j !== i);
                    const nextCorrect = correct === null || correct === i ? null : correct > i ? correct - 1 : correct;
                    setOptions(next);
                    setCorrect(nextCorrect);
                    if (next.length === 0 || next.length >= 2) saveOptions(next, nextCorrect);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <div>
                <button className="btn small" onClick={() => setOptions([...options, ""])}>
                  + вариант
                </button>
              </div>
            )}
          </div>
          <div className="grid-2">
            {optionalNumber("Своё время обсуждения, с", "discuss_seconds", round.discuss_seconds)}
            {optionalNumber("Своё время ввода, с", "input_seconds", round.input_seconds)}
          </div>
        </>
      )}

      <button
        className="btn no"
        onClick={async () => {
          if (!(await confirmDialog({ title: "Удалить вопрос?", confirmLabel: "Удалить", danger: true }))) return;
          if (await mutate("DELETE", path)) onDeleted();
        }}
      >
        Удалить вопрос
      </button>
    </div>
  );
}
