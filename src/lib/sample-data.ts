// The shapes the dashboard draws, and each space's starting point from command.config.json.
// Cards, email and people start empty: they fill in from Claude threads, GitHub and your mailboxes.
import { CONFIG, type SpaceId } from "./config";

export type Column = "now" | "next" | "wait" | "idle" | "done";

export interface CardItem {
  id: string;
  title: string;
  project: string;
  column: Column;
  age: string;
  thread?: { last: string; stopped?: boolean; url?: string };
  cmd?: string;
}

export interface Mail {
  id: string;
  project: string;
  dir: "in" | "out";
  who: string;
  subject: string;
  time: string;
  unread: boolean;
  address?: string;
  box?: string;
  date?: string;
  spam?: boolean;
}

export interface Person {
  id: string;
  who: string;
  project: string;
  last: string;
  next: string;
  due: string;
  late: boolean;
  /** Live follow-ups only: where to draft the follow-up from. */
  live?: { boxId: string; address: string; subject: string; mailId: string };
}

export interface Deadline { title: string; when: string; soon: boolean }

export interface Space {
  id: SpaceId;
  title: string;
  name: string;
  projects: string[];
  inbox: Record<string, boolean>;
  cards: CardItem[];
  mails: Mail[];
  people: Person[];
  deadlines: Deadline[];
  filteredToday: number;
  captured: string[];
}

export const SPACES: Record<SpaceId, Space> = Object.fromEntries(CONFIG.spaces.map((c) => [c.id, {
  id: c.id,
  title: c.title,
  name: c.name,
  projects: c.projects,
  inbox: {},
  cards: [],
  mails: [],
  people: [],
  deadlines: [],
  filteredToday: 0,
  captured: [],
} satisfies Space]));
