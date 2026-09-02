import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { readTournament, writeTournament, type Application } from "../tournament-store.js";

registerMainMenuItem({ label: "Регистрация команды", data: "registration:start", order: 10 });
const composer = new Composer<Ctx>();
const cancel = inlineKeyboard([[inlineButton("Отмена", "registration:cancel")]]);
const clean = (value: string) => value.trim();
const valid = (value: string, min: number, max: number) => value.length >= min && value.length <= max && !/[\r\n\u0000]/.test(value);
function reset(ctx: Ctx) { ctx.session.step = undefined; ctx.session.draft = undefined; ctx.session.editingApplicationId = undefined; }
type CompleteDraft = { name: string; captain: { gameId: string; nickname: string; username?: string; phone?: string }; players: { gameId: string; nickname: string }[] };
function draft(ctx: Ctx): CompleteDraft | undefined {
  const value = ctx.session.draft;
  if (!value?.name || !value.captain?.gameId || !value.captain.nickname || !value.players?.length) return undefined;
  return value as CompleteDraft;
}
function preview(value: NonNullable<ReturnType<typeof draft>>) {
  const captain = value.captain;
  return `Проверьте заявку:\nКоманда: ${value.name}\nКапитан: ${captain.nickname} (${captain.gameId})\nИгроков: ${value.players.length}`;
}
async function notify(ctx: Ctx, app: Application) {
  const raw = (ctx as Ctx & { env?: Record<string, unknown> }).env?.ADMIN_CHAT_ID ?? (typeof process === "undefined" ? undefined : process.env.ADMIN_CHAT_ID);
  const owner = adminChatId(ctx as { env?: Record<string, unknown> });
  const ids = typeof raw === "string" ? raw.split(/[\s,;]+/).filter(Boolean) : owner ? [owner] : [];
  for (const id of ids) {
    try { await ctx.api.sendMessage(id, `Новая заявка: ${app.name}. Статус: ${app.status === "conflict" ? "требует проверки" : "ожидает решения"}.`); } catch { /* A blocked owner must not cancel registration. */ }
  }
  return ids.length > 0;
}

composer.callbackQuery("registration:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Регистрация доступна только в личном чате с ботом, чтобы сохранить данные команды приватными.");
    return;
  }
  ctx.session.draft = { captain: {}, players: [] };
  ctx.session.step = "team_name";
  await ctx.reply("Введите название команды.", { reply_markup: { force_reply: true, input_field_placeholder: "Например, Bishkek Wolves" } });
});
composer.callbackQuery("registration:cancel", async (ctx) => { await ctx.answerCallbackQuery(); reset(ctx); await ctx.editMessageText("Регистрация отменена.", { reply_markup: cancel }); });
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step || step.startsWith("admin_")) return next();
  const value = clean(ctx.message.text);
  const d = ctx.session.draft ?? { captain: {}, players: [] };
  if (step === "team_name") {
    if (!valid(value, 2, 40)) return void await ctx.reply("Название должно содержать от 2 до 40 символов. Попробуйте ещё раз.");
    d.name = value; ctx.session.draft = d; ctx.session.step = "captain_id";
    return void await ctx.reply("Введите игровой ID капитана.", { reply_markup: { force_reply: true, input_field_placeholder: "Игровой ID" } });
  }
  if (step === "captain_id") {
    if (!valid(value, 2, 40)) return void await ctx.reply("Игровой ID должен содержать от 2 до 40 символов. Попробуйте ещё раз.");
    d.captain!.gameId = value; ctx.session.draft = d; ctx.session.step = "captain_nick";
    return void await ctx.reply("Введите никнейм капитана.", { reply_markup: { force_reply: true, input_field_placeholder: "Никнейм" } });
  }
  if (step === "captain_nick") {
    if (!valid(value, 2, 32)) return void await ctx.reply("Никнейм должен содержать от 2 до 32 символов. Попробуйте ещё раз.");
    d.captain!.nickname = value; ctx.session.draft = d; ctx.session.step = "captain_username";
    return void await ctx.reply("Введите Telegram @username капитана или отправьте «-».", { reply_markup: { force_reply: true, input_field_placeholder: "@username или -" } });
  }
  if (step === "captain_username") {
    if (value !== "-" && !/^@[A-Za-z0-9_]{5,32}$/.test(value)) return void await ctx.reply("Укажите @username или «-», если его нет.");
    if (value !== "-") d.captain!.username = value; ctx.session.draft = d; ctx.session.step = "captain_phone";
    return void await ctx.reply("Введите телефон капитана или отправьте «-».", { reply_markup: { force_reply: true, input_field_placeholder: "+996 … или -" } });
  }
  if (step === "captain_phone") {
    if (value !== "-" && !/^[+\d][\d\s()-]{5,20}$/.test(value)) return void await ctx.reply("Укажите телефон в понятном формате или «-».");
    if (value !== "-") d.captain!.phone = value; ctx.session.draft = d; ctx.session.step = "player_id";
    return void await ctx.reply("Введите игровой ID первого игрока.", { reply_markup: { force_reply: true, input_field_placeholder: "Игровой ID игрока" } });
  }
  if (step === "player_id") {
    if (!valid(value, 2, 40)) return void await ctx.reply("Игровой ID должен содержать от 2 до 40 символов. Попробуйте ещё раз.");
    (d as typeof d & { pendingPlayerId?: string }).pendingPlayerId = value; ctx.session.draft = d; ctx.session.step = "player_nick";
    return void await ctx.reply("Введите никнейм игрока.", { reply_markup: { force_reply: true, input_field_placeholder: "Никнейм игрока" } });
  }
  if (step === "player_nick") {
    const withPending = d as typeof d & { pendingPlayerId?: string };
    if (!valid(value, 2, 32) || !withPending.pendingPlayerId) return void await ctx.reply("Никнейм должен содержать от 2 до 32 символов. Попробуйте ещё раз.");
    d.players!.push({ gameId: withPending.pendingPlayerId, nickname: value }); delete withPending.pendingPlayerId; ctx.session.draft = d; ctx.session.step = undefined;
    return void await ctx.reply("Добавьте следующего игрока или завершите список.", { reply_markup: inlineKeyboard([[inlineButton("Добавить игрока", "registration:player"), inlineButton("Готово", "registration:preview")], [inlineButton("Отмена", "registration:cancel")]]) });
  }
  return next();
});
composer.callbackQuery("registration:player", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "player_id"; await ctx.editMessageText("Введите игровой ID следующего игрока.", { reply_markup: cancel }); });
composer.callbackQuery("registration:preview", async (ctx) => {
  await ctx.answerCallbackQuery(); const value = draft(ctx);
  if (!value) return void await ctx.editMessageText("Не удалось собрать заявку. Начните регистрацию заново.", { reply_markup: cancel });
  await ctx.editMessageText(preview(value), { reply_markup: inlineKeyboard([[inlineButton("Подтвердить", "registration:confirm"), inlineButton("Изменить", "registration:edit")], [inlineButton("Отмена", "registration:cancel")]]) });
});
composer.callbackQuery("registration:edit", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "team_name"; await ctx.editMessageText("Введите новое название команды.", { reply_markup: cancel }); });
composer.on("callback_query:data", async (ctx, next) => {
  const hit = /^registration:change:(\d+)$/.exec(ctx.callbackQuery.data);
  if (!hit) return next();
  await ctx.answerCallbackQuery();
  const state = await readTournament(ctx);
  const app = state.applications.find((item) => item.id === hit[1]);
  if (!app || app.chatId !== ctx.chat?.id) return void await ctx.editMessageText("Эта заявка недоступна для изменения.", { reply_markup: cancel });
  ctx.session.editingApplicationId = app.id;
  ctx.session.draft = { name: app.name, captain: { ...app.captain }, players: [...app.players] };
  ctx.session.step = "team_name";
  await ctx.editMessageText("Введите новое название команды.", { reply_markup: cancel });
});
composer.callbackQuery("registration:confirm", async (ctx) => {
  await ctx.answerCallbackQuery(); const value = draft(ctx);
  if (!value || !ctx.chat) return void await ctx.editMessageText("Не удалось подтвердить заявку. Начните регистрацию заново.", { reply_markup: cancel });
  const state = await readTournament(ctx); const editingId = ctx.session.editingApplicationId; const ids = [value.captain.gameId, ...value.players.map((p) => p.gameId)];
  const normalized = ids.map((id) => id.toLocaleLowerCase());
  const used = state.applications
    .filter((a) => a.id !== editingId)
    .flatMap((a) => [a.captain.gameId, ...a.players.map((p) => p.gameId)])
    .map((id) => id.toLocaleLowerCase());
  const conflictIds = ids.filter((id, index) => normalized.indexOf(normalized[index]) !== index || used.includes(normalized[index]));
  const duplicate = state.applications.some((a) => a.id !== editingId && (a.chatId === ctx.chat!.id || a.captain.gameId.toLocaleLowerCase() === value.captain.gameId.toLocaleLowerCase()));
  const app: Application = { id: editingId ?? String(state.nextApplication++), name: value.name, captain: value.captain, players: value.players, status: conflictIds.length || duplicate ? "conflict" : "pending", conflictIds: [...new Set(conflictIds)], chatId: ctx.chat.id };
  const oldAt = state.applications.findIndex((a) => a.id === editingId);
  if (oldAt >= 0) state.applications[oldAt] = app; else { state.applications.push(app); state.applicationIds.push(app.id); }
  await writeTournament(ctx, state); reset(ctx);
  const delivered = await notify(ctx, app);
  const status = app.status === "conflict" ? "В заявке найден повтор игрового ID. Организаторы проверят её вручную." : editingId ? "Изменённая заявка отправлена организаторам." : "Заявка отправлена организаторам.";
  await ctx.editMessageText(`${status}${delivered ? "" : " Уведомления организаторов пока не настроены."}`, { reply_markup: inlineKeyboard([[inlineButton("Изменить заявку", `registration:change:${app.id}`)], [inlineButton("В главное меню", "menu:main")]]) });
});
export default composer;
