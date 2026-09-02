import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { readTournament, writeTournament } from "../tournament-store.js";

registerMainMenuItem({ label: "Панель организатора", data: "admin:panel", order: 90 });
const composer = new Composer<Ctx>();
const back = [[inlineButton("В главное меню", "menu:main")]];
const appButtons = (ids: string[]) => inlineKeyboard([...ids.map((id) => [inlineButton(`Заявка ${id}`, `admin:app:${id}`)]), ...back]);
async function owner(ctx: Ctx) { return requireOwner(ctx as unknown as Parameters<typeof requireOwner>[0]); }
async function notifyDecision(ctx: Ctx, text: string) {
  const raw = (ctx as Ctx & { env?: Record<string, unknown> }).env?.ADMIN_CHAT_ID ?? (typeof process === "undefined" ? undefined : process.env.ADMIN_CHAT_ID);
  const ids = typeof raw === "string" ? raw.split(/[\s,;]+/).filter(Boolean) : [];
  for (const id of ids) try { await ctx.api.sendMessage(id, text); } catch { /* Other organizers may have blocked the bot. */ }
}

composer.callbackQuery("admin:panel", async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return;
  await ctx.editMessageText("Панель организатора", { reply_markup: inlineKeyboard([[inlineButton("Заявки", "admin:apps")], [inlineButton("Матчи", "admin:matches")], ...back]) });
});
composer.callbackQuery("admin:apps", async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return;
  const state = await readTournament(ctx); const open = state.applications.filter((a) => a.status === "pending" || a.status === "conflict");
  await ctx.editMessageText(open.length ? "Выберите заявку для решения." : "Новых заявок нет.", { reply_markup: open.length ? appButtons(open.map((a) => a.id)) : inlineKeyboard(back) });
});
composer.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data; if (!data.startsWith("admin:app:")) return next();
  await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return;
  const id = data.slice("admin:app:".length); const state = await readTournament(ctx); const app = state.applications.find((a) => a.id === id);
  if (!app) return void await ctx.editMessageText("Эта заявка уже недоступна.", { reply_markup: inlineKeyboard(back) });
  const note = app.conflictIds.length ? `\nПовтор ID: ${app.conflictIds.join(", ")}` : "";
  await ctx.editMessageText(`Команда: ${app.name}\nКапитан: ${app.captain.nickname} (${app.captain.gameId})\nИгроков: ${app.players.length}\nСтатус: ${app.status}${note}`, { reply_markup: inlineKeyboard([[inlineButton("Принять", `admin:approve:${id}`), inlineButton("Отклонить", `admin:reject:${id}`)], [inlineButton("К заявкам", "admin:apps")]]) });
});
composer.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data; const match = /^admin:(approve|reject):(\d+)$/.exec(data); if (!match) return next();
  await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return;
  const state = await readTournament(ctx); const app = state.applications.find((a) => a.id === match[2]);
  if (!app) return void await ctx.editMessageText("Эта заявка уже недоступна.", { reply_markup: inlineKeyboard(back) });
  const wasConflict = app.status === "conflict"; app.status = match[1] === "approve" ? "approved" : "rejected"; await writeTournament(ctx, state);
  const decision = app.status === "approved" ? "принята" : "отклонена";
  try { await ctx.api.sendMessage(app.chatId, `Ваша заявка команды «${app.name}» ${decision}.`); } catch { /* Users may block the bot after opting in. */ }
  if (wasConflict) await notifyDecision(ctx, `Конфликт по заявке «${app.name}» решён: заявка ${decision}.`);
  await ctx.editMessageText(`Заявка команды «${app.name}» ${decision}.`, { reply_markup: inlineKeyboard([[inlineButton("К заявкам", "admin:apps")], ...back]) });
});
composer.callbackQuery("admin:matches", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const state = await readTournament(ctx); await ctx.editMessageText(state.matches.length ? "Выберите матч или добавьте новый." : "Матчей пока нет — добавьте первый.", { reply_markup: inlineKeyboard([[inlineButton("Добавить матч", "admin:match:add")], ...state.matches.map((m) => [inlineButton(`${m.teamOne} — ${m.teamTwo}`, `admin:match:${m.id}`)]), ...back]) }); });
composer.callbackQuery("admin:match:add", async (ctx) => { await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; ctx.session.step = "admin_match_team_one"; await ctx.editMessageText("Введите название первой команды."); });
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step; if (!step?.startsWith("admin_")) return next();
  if (!(await owner(ctx))) return; const value = ctx.message.text.trim(); if (value.length < 2 || value.length > 60) return void await ctx.reply("Введите название от 2 до 60 символов.");
  if (step === "admin_match_team_one") { ctx.session.draft = { name: value, captain: {}, players: [] }; ctx.session.step = "admin_match_team_two"; return void await ctx.reply("Введите название второй команды."); }
  if (step === "admin_match_team_two") { const state = await readTournament(ctx); const id = String(state.nextMatch++); state.matches.push({ id, teamOne: ctx.session.draft?.name ?? "", teamTwo: value }); state.matchIds.push(id); await writeTournament(ctx, state); ctx.session.editingMatchId = id; ctx.session.step = undefined; return void await ctx.reply("Матч добавлен.", { reply_markup: inlineKeyboard([[inlineButton("Указать результат", `admin:result:${id}`), inlineButton("Добавить ссылку", `admin:link:${id}`)], [inlineButton("К матчам", "admin:matches")]]) }); }
  const state = await readTournament(ctx); const game = state.matches.find((m) => m.id === ctx.session.editingMatchId); if (!game) { ctx.session.step = undefined; return void await ctx.reply("Матч не найден. Откройте список матчей."); }
  if (step === "admin_match_result") { game.result = value; } else { if (!/^https?:\/\/\S+$/i.test(value)) return void await ctx.reply("Укажите полную ссылку, которая начинается с http:// или https://."); game.fightLink = value; }
  await writeTournament(ctx, state); ctx.session.step = undefined; await ctx.reply("Матч обновлён.", { reply_markup: inlineKeyboard([[inlineButton("К матчам", "admin:matches")]]) });
});
composer.on("callback_query:data", async (ctx, next) => { const hit = /^admin:match:(\d+)$/.exec(ctx.callbackQuery.data); if (!hit) return next(); await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; const state = await readTournament(ctx); const game = state.matches.find((m) => m.id === hit[1]); if (!game) return void await ctx.editMessageText("Матч не найден.", { reply_markup: inlineKeyboard(back) }); await ctx.editMessageText(`${game.teamOne} — ${game.teamTwo}\nРезультат: ${game.result ?? "ещё не указан"}\nСсылка: ${game.fightLink ?? "ещё не добавлена"}`, { reply_markup: inlineKeyboard([[inlineButton("Указать результат", `admin:result:${game.id}`), inlineButton("Добавить ссылку", `admin:link:${game.id}`)], [inlineButton("К матчам", "admin:matches")]]) }); });
composer.on("callback_query:data", async (ctx, next) => { const hit = /^admin:(result|link):(\d+)$/.exec(ctx.callbackQuery.data); if (!hit) return next(); await ctx.answerCallbackQuery(); if (!(await owner(ctx))) return; ctx.session.editingMatchId = hit[2]; ctx.session.step = hit[1] === "result" ? "admin_match_result" : "admin_match_link"; await ctx.editMessageText(hit[1] === "result" ? "Введите результат матча." : "Введите ссылку на бой."); });
export default composer;
