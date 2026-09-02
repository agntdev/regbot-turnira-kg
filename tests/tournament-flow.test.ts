import { Composer } from "grammy";
import { describe, expect, it } from "vitest";
import { buildBot, type Ctx } from "../src/bot.js";
import adminPanel from "../src/handlers/admin-panel.js";
import registration from "../src/handlers/registration-start.js";
import start from "../src/handlers/start.js";
import viewBracket from "../src/handlers/view-bracket.js";
import viewTeams from "../src/handlers/view-teams.js";
import { runSpec, type BotSpec } from "../src/toolkit/index.js";

/** A tiny Durable Object double: all chats address the same tournament record. */
function tournamentBinding() {
  let value: unknown;
  return {
    idFromName(name: string) { return name; },
    get() {
      return {
        async fetch(_input: string, init?: { method?: string; body?: string }) {
          if (init?.method === "PUT") { value = JSON.parse(init.body ?? "{}"); return new Response(null, { status: 204 }); }
          return Response.json(value ?? { applications: [], applicationIds: [], matches: [], matchIds: [], nextApplication: 1, nextMatch: 1 });
        },
      };
    },
  };
}

function botWithTournament() {
  const attach = new Composer<Ctx>();
  const env = { ADMIN_CHAT_ID: "99,100", CHAT_DO: tournamentBinding() };
  attach.use((ctx, next) => { (ctx as Ctx & { env: typeof env }).env = env; return next(); });
  return buildBot("test-token", { handlers: [attach, start, registration, adminPanel, viewTeams, viewBracket] });
}

async function replay(spec: BotSpec) {
  const result = await runSpec(await botWithTournament(), spec);
  expect(result.ok, result.steps.flatMap((step) => step.failures).join("\n")).toBe(true);
}

describe("tournament durable cross-chat flow", () => {
  it("keeps a captain's application visible to organizers and viewers", async () => {
    await replay({
      name: "registration approval and public view", steps: [
        { send: { callback: "registration:start", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Введите название команды." } }] },
        { send: { text: "Bishkek Wolves", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Введите игровой ID капитана." } }] },
        { send: { text: "captain-1", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Введите никнейм капитана." } }] },
        { send: { text: "Aibek", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Введите Telegram @username капитана или отправьте «-»." } }] },
        { send: { text: "-", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Введите телефон капитана или отправьте «-»." } }] },
        { send: { text: "-", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Введите игровой ID первого игрока." } }] },
        { send: { text: "player-1", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Введите никнейм игрока." } }] },
        { send: { text: "Bek", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { text: "Добавьте следующего игрока или завершите список." } }] },
        { send: { callback: "registration:confirm", chatId: 1, userId: 1 }, expect: [{ method: "sendMessage", payload: { chat_id: "99", text: "Новая заявка: Bishkek Wolves. Статус: ожидает решения." } }, { method: "editMessageText", payload: { text: "Заявка отправлена организаторам." } }] },
        { send: { callback: "admin:apps", chatId: 99, userId: 99 }, expect: [{ method: "editMessageText", payload: { text: "Выберите заявку для решения." } }] },
        { send: { callback: "admin:app:1", chatId: 99, userId: 99 }, expect: [{ method: "editMessageText", payload: { text: "Команда: Bishkek Wolves\nКапитан: Aibek (captain-1)\nИгроков: 1\nСтатус: pending" } }] },
        { send: { callback: "admin:approve:1", chatId: 99, userId: 99 }, expect: [{ method: "editMessageText", payload: { text: "Заявка команды «Bishkek Wolves» принята." } }] },
        { send: { callback: "view:teams", chatId: 2, userId: 2 }, expect: [{ method: "sendMessage", payload: { text: "Подтверждённые команды:\n1. Bishkek Wolves" } }] },
        { send: { callback: "admin:undo:1", chatId: 99, userId: 99 }, expect: [{ method: "editMessageText", payload: { text: "Решение по заявке команды «Bishkek Wolves» отменено." } }] },
        { send: { callback: "view:teams", chatId: 2, userId: 2 }, expect: [{ method: "sendMessage", payload: { text: "Подтверждённых команд пока нет — список появится после решения организаторов." } }] },
      ],
    });
  });

  it("allows every organizer in a multi-id setting to open the panel", async () => {
    await replay({ name: "multi organizer access", steps: [
      { send: { callback: "admin:panel", chatId: 100, userId: 100 }, expect: [{ method: "editMessageText", payload: { text: "Панель организатора" } }] },
    ] });
  });
});
