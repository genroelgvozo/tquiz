import type { AdminCommand, AdminView } from "../../lib/types";

export interface PanelProps {
  view: AdminView;
  send: (cmd: AdminCommand) => void;
}
