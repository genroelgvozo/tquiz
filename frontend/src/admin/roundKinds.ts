import type { RoundKind } from "../lib/types";

export interface RoundKindInfo {
  title: string;
  /** Short label for chips in the editor tree. */
  short: string;
  description: string;
}

/** Every round kind must be described here — Record makes the compiler enforce it when a kind is added. */
export const ROUND_KINDS: Record<RoundKind, RoundKindInfo> = {
  jeopardy: {
    title: "Своя игра",
    short: "своя",
    description: "Табло тем и стоимостей. Команды жмут на скорость и отвечают голосом, ты отмечаешь верно или нет.",
  },
  free: {
    title: "Свободный ввод",
    short: "ввод",
    description: "Вопрос с таймером, команды вписывают ответ или выбирают вариант на телефоне. Ответы видны сразу, проверяешь в любой момент тура.",
  },
};

export const ROUND_KIND_LIST = Object.keys(ROUND_KINDS) as RoundKind[];
