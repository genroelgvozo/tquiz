// Mirrors backend models field by field:
//   app/quizdata.py, app/game/state.py, app/game/views.py, app/game/commands.py, ws protocol in app/ws/hub.py

// ---------- quiz (app/quizdata.py) ----------

export type MediaKind = "image" | "audio";

export interface MediaRef {
  filename: string;
  kind: MediaKind;
  url: string;
}

export interface Theme {
  bg: string;
  text: string;
  accent: string;
  second: string;
}

export interface QuestionData {
  id: number;
  position: number;
  text: string;
  answer: string;
  media: MediaRef | null;
  value: number;
  is_secret: boolean;
  nominal: number;
  options: string[];
  correct_option: number | null;
  discuss_seconds: number | null;
  input_seconds: number | null;
}

export interface CategoryData {
  id: number;
  name: string;
  questions: QuestionData[];
}

export type RoundKind = "jeopardy" | "free";

export interface RoundData {
  id: number;
  title: string;
  kind: RoundKind;
  minus_on_wrong: boolean;
  buzzer_mode: "instant" | "bar";
  bar_seconds: number;
  discuss_seconds: number;
  input_seconds: number;
  stakes: boolean;
  cell_values: number[];
  background: MediaRef | null;
  intro_music: MediaRef | null;
  think_music: MediaRef | null;
  typewriter: boolean;
  type_speed: number;
  categories: CategoryData[];
  questions: QuestionData[];
}

export interface QuizData {
  id: number;
  title: string;
  logo: MediaRef | null;
  theme: Theme;
  background: MediaRef | null;
  lobby_music: MediaRef | null;
  rounds: RoundData[];
}

export interface EditorPayload {
  quiz: QuizData;
  locked: boolean;
}

export interface QuizListItem {
  id: number;
  title: string;
  locked: boolean;
}

// ---------- game state (app/game/state.py) ----------

export type Stage = "lobby" | "intro" | "jeopardy" | "free" | "finished";
export type JeopardyPhase = "board" | "secret" | "question" | "answer";
export type Buttons = "closed" | "bar" | "open" | "locked";
export type TimerStatus = "idle" | "running" | "paused" | "finished";
export type AudioAction = "play" | "pause" | "restart" | "stop";

export interface Buzz {
  team_id: string;
  at: number;
}

export interface JeopardyState {
  phase: JeopardyPhase;
  played: number[];
  chooser_team_id: string | null;
  question_id: number | null;
  secret_recipient_id: string | null;
  buttons: Buttons;
  bar_ends_at: number | null;
  lockouts: Record<string, number>;
  buzzes: Buzz[];
  answering_team_id: string | null;
  excluded: string[];
  starts_at: number | null;
  typed_base: number;
  typing_since: number | null;
}

export interface Timer {
  status: TimerStatus;
  total_seconds: number;
  input_seconds: number;
  deadline: number | null;
  remaining: number | null;
}

export interface Answer {
  text: string;
  option: number | null;
  stake: boolean;
}

export interface FreeState {
  phase: "question" | "review";
  index: number;
  timer: Timer;
  answers: Record<string, Record<string, Answer>>;
  review_index: number;
  marks: Record<string, Record<string, boolean | null>>;
  opened: number[];
  revealed: number[];
  answer_shown: boolean;
}

export interface AudioCmd {
  action: AudioAction;
  seq: number;
}

// ---------- views (app/game/views.py) ----------

export interface TeamPublic {
  id: string;
  name: string;
}

export interface StandingsColumn {
  index: number;
  title: string;
  closed: boolean;
}

export interface StandingsRow {
  team_id: string;
  name: string;
  rounds: (number | null)[];
  total: number;
}

export interface Standings {
  columns: StandingsColumn[];
  rows: StandingsRow[];
}

export interface TeamScore {
  kind: "round" | "total";
  value: number;
}

export interface AdminTeam {
  id: string;
  name: string;
  round_score: number | null;
  total: number;
}

export interface RejoinPublic {
  id: string;
  team_id: string;
  team_name: string;
}

export interface RoundPublic {
  index: number;
  title: string;
  kind: RoundKind;
  total: number;
}

export interface ScreenQuestion {
  title: string;
  text: string | null;
  media: MediaRef | null;
  options: string[];
  answer: string | null;
  highlight_option: number | null;
}

export interface BoardCell {
  question_id: number;
  value: number;
  played: boolean;
}

export interface BoardCategory {
  name: string;
  cells: BoardCell[];
}

export interface TypingView {
  base: number;
  since: number | null;
  speed: number;
}

export interface MusicNow {
  url: string;
  key: string;
  playing: boolean;
}

export interface ScreenJeopardy {
  phase: JeopardyPhase;
  board: BoardCategory[];
  chooser_team_id: string | null;
  answering_team_id: string | null;
  buttons: Buttons;
  bar_ends_at: number | null;
  bar_seconds: number;
  question_id: number | null;
  question: ScreenQuestion | null;
  typing: TypingView | null;
  scores: Record<string, number>;
}

export interface ScreenFree {
  phase: "question" | "review";
  number: number;
  total: number;
  timer: Timer;
  question: ScreenQuestion;
}

export interface ScreenView {
  kind: "screen";
  now: number;
  quiz_title: string;
  logo_url: string | null;
  theme: Theme;
  background_url: string | null;
  quiz_background_url: string | null;
  stage: Stage;
  join_url: string;
  qr_visible: boolean;
  teams: TeamPublic[];
  round: RoundPublic | null;
  overlay: "leaderboard" | null;
  audio: AudioCmd;
  music: MusicNow | null;
  preload: string[];
  standings: Standings;
  jeopardy: ScreenJeopardy | null;
  free: ScreenFree | null;
}

export type BuzzerStatus =
  | "closed"
  | "bar"
  | "open"
  | "locked_out"
  | "answering_me"
  | "answering_other"
  | "excluded";

export interface TeamJeopardy {
  label: string | null;
  buzzer: BuzzerStatus;
  bar_ends_at: number | null;
  bar_seconds: number;
  locked_until: number | null;
}

export interface TeamFree {
  phase: "question" | "review";
  question_id: number;
  number: number;
  total: number;
  options: string[];
  stakes: boolean;
  input_open: boolean;
  answer: Answer;
  timer: Timer;
}

export interface TeamView {
  kind: "team";
  now: number;
  theme: Theme;
  team: TeamPublic;
  score: TeamScore | null;
  stage: Stage;
  round: RoundPublic | null;
  jeopardy: TeamJeopardy | null;
  free: TeamFree | null;
}

export interface AdminState {
  quiz_id: number;
  stage: Stage;
  qr_visible: boolean;
  teams: AdminTeam[];
  standings: Standings;
  score_adjust_round: number | null;
  rejoin_requests: RejoinPublic[];
  round_index: number;
  jeopardy: JeopardyState | null;
  free: FreeState | null;
  overlay: "leaderboard" | null;
  audio: AudioCmd;
  music: MusicNow | null;
  music_paused: boolean;
}

export interface AdminView {
  kind: "admin";
  now: number;
  join_url: string;
  quiz: QuizData;
  state: AdminState;
  online_team_ids: string[];
  /** null: nothing to undo; "": an entry from a game started before labels existed */
  undo_label: string | null;
  screen_sound: "none" | "on" | "off";
}

// ---------- WebSocket protocol (app/ws/hub.py) ----------

export type ServerMessage<V> =
  | { type: "state"; view: V | null }
  | { type: "error"; message: string }
  | { type: "need_join"; theme?: Theme }
  | { type: "no_game" }
  | { type: "joined"; token: string }
  | { type: "pending" }
  | { type: "rejected" }
  | { type: "kicked" }
  | { type: "pong" };

// ---------- commands (app/game/commands.py) ----------

export type AdminCommand =
  | { type: "show_qr"; visible: boolean }
  | { type: "start_game" }
  | { type: "start_round" }
  | { type: "next_round" }
  | { type: "finish_game" }
  | { type: "rename_team"; team_id: string; name: string }
  | { type: "delete_team"; team_id: string }
  | { type: "approve_rejoin"; request_id: string }
  | { type: "reject_rejoin"; request_id: string }
  | { type: "adjust_score"; team_id: string; delta: number }
  | { type: "undo" }
  | { type: "set_overlay"; overlay: "leaderboard" | null }
  | { type: "audio"; action: "play" | "pause" | "restart" }
  | { type: "music_toggle" }
  | { type: "set_chooser"; team_id: string }
  | { type: "open_cell"; question_id: number }
  | { type: "set_secret_recipient"; team_id: string }
  | { type: "open_buttons" }
  | { type: "judge"; correct: boolean }
  | { type: "reveal" }
  | { type: "to_board" }
  | { type: "open_question"; index: number }
  | { type: "timer_start" }
  | { type: "timer_pause" }
  | { type: "timer_resume" }
  | { type: "timer_add" }
  | { type: "timer_finish" }
  | { type: "start_review" }
  | { type: "review_goto"; index: number }
  | { type: "review_show_answer" }
  | { type: "mark"; question_id: number; team_id: string; correct: boolean | null; text: string; option: number | null };

export type TeamCommand =
  | { type: "join"; name: string }
  | { type: "buzz" }
  | { type: "answer"; question_id: number; text: string; option: number | null; stake: boolean };
