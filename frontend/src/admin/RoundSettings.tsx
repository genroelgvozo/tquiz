import type { RoundData } from "../lib/types";
import { confirmDialog } from "./dialogs";
import type { Mutate } from "./QuizEditor";

const DISCUSS_PRESETS = [30, 60];

function NumberField(props: { label: string; value: number; min?: number; onSave: (v: number) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        min={props.min ?? 0}
        key={props.value}
        defaultValue={props.value}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== props.value) props.onSave(v);
        }}
      />
    </label>
  );
}

export default function RoundSettings({
  round,
  mutate,
  onDeleted,
}: {
  round: RoundData;
  mutate: Mutate;
  onDeleted: () => void;
}) {
  const patch = (body: Partial<RoundData>) => mutate("PATCH", `/api/rounds/${round.id}`, body);

  return (
    <div>
      <p className="label">Тур · {round.kind === "jeopardy" ? "Своя игра" : "Свободный ввод"}</p>
      <label className="field">
        <span>Название</span>
        <input
          type="text"
          key={round.title}
          defaultValue={round.title}
          onBlur={(e) => e.target.value !== round.title && patch({ title: e.target.value })}
        />
      </label>

      {round.kind === "jeopardy" ? (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={round.minus_on_wrong}
              onChange={(e) => patch({ minus_on_wrong: e.target.checked })}
            />
            Минус за неверный ответ
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Кнопка</span>
              <select
                value={round.buzzer_mode}
                onChange={(e) => patch({ buzzer_mode: e.target.value as RoundData["buzzer_mode"] })}
              >
                <option value="instant">сразу</option>
                <option value="bar">после полоски</option>
              </select>
            </label>
            {round.buzzer_mode === "bar" && (
              <NumberField label="Полоска, секунд" value={round.bar_seconds} onSave={(v) => patch({ bar_seconds: v })} />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <span>Обсуждение, секунд</span>
            <div className="presets">
              {DISCUSS_PRESETS.map((p) => (
                <button
                  key={p}
                  className={`btn small ${round.discuss_seconds === p ? "primary" : ""}`}
                  onClick={() => patch({ discuss_seconds: p })}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              key={round.discuss_seconds}
              defaultValue={round.discuss_seconds}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v !== round.discuss_seconds) patch({ discuss_seconds: v });
              }}
            />
          </div>
          <NumberField label="Ввод ответа, секунд" value={round.input_seconds} onSave={(v) => patch({ input_seconds: v })} />
          <label className="check">
            <input type="checkbox" checked={round.stakes} onChange={(e) => patch({ stakes: e.target.checked })} />
            Ставки (верно ×2, неверно −1 номинал)
          </label>
        </>
      )}

      <button
        className="btn no"
        onClick={async () => {
          const ok = await confirmDialog({
            title: `Удалить тур «${round.title}»?`,
            message: "Вместе с ним удалятся все его вопросы.",
            confirmLabel: "Удалить",
            danger: true,
          });
          if (!ok) return;
          if (await mutate("DELETE", `/api/rounds/${round.id}`)) onDeleted();
        }}
      >
        Удалить тур
      </button>
    </div>
  );
}
