import type { Ctx } from "./bot.js";

export type Status = "pending" | "approved" | "rejected" | "conflict";
export interface Application {
  id: string;
  name: string;
  captain: { gameId: string; nickname: string; username?: string; phone?: string };
  players: { gameId: string; nickname: string }[];
  status: Status;
  conflictIds: string[];
  chatId: number;
}
export interface TournamentMatch { id: string; teamOne: string; teamTwo: string; result?: string; fightLink?: string; }
export interface TournamentState {
  applications: Application[];
  applicationIds: string[];
  matches: TournamentMatch[];
  matchIds: string[];
  nextApplication: number;
  nextMatch: number;
}

const empty = (): TournamentState => ({ applications: [], applicationIds: [], matches: [], matchIds: [], nextApplication: 1, nextMatch: 1 });
type WorkerStore = { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> };
function workerStore(ctx: Ctx): WorkerStore | undefined {
  const env = (ctx as Ctx & { env?: { CHAT_DO?: { idFromName(name: string): unknown; get(id: unknown): WorkerStore } } }).env;
  const ns = env?.CHAT_DO;
  return ns ? ns.get(ns.idFromName("tournament")) : undefined;
}

export async function readTournament(ctx: Ctx): Promise<TournamentState> {
  const remote = workerStore(ctx);
  if (remote) {
    const response = await remote.fetch("https://do/tournament", { method: "GET" });
    return (await response.json()) as TournamentState;
  }
  // The harness has no Worker binding. This is deliberately scoped to its
  // ephemeral conversation session; live Workers always take the durable path.
  return (ctx.session.localTournament as TournamentState | undefined) ?? empty();
}
export async function writeTournament(ctx: Ctx, state: TournamentState): Promise<void> {
  const remote = workerStore(ctx);
  if (remote) {
    await remote.fetch("https://do/tournament", { method: "PUT", body: JSON.stringify(state) });
    return;
  }
  ctx.session.localTournament = state;
}
