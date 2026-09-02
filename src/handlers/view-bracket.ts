import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { readTournament } from "../tournament-store.js";
registerMainMenuItem({ label: "Турнирная таблица", data: "view:bracket", order: 30 });
const composer = new Composer<Ctx>();
composer.callbackQuery("view:bracket", async (ctx) => { await ctx.answerCallbackQuery(); const state = await readTournament(ctx); const text = state.matches.length ? `Турнирная таблица:\n${state.matches.map((m, i) => `${i + 1}. ${m.teamOne} — ${m.teamTwo}${m.result ? `: ${m.result}` : ""}${m.fightLink ? `\n${m.fightLink}` : ""}`).join("\n")}` : "Турнирная таблица пока не сформирована. Следите за обновлениями."; await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("Просмотр команд", "view:teams")], [inlineButton("В главное меню", "menu:main")]]) }); });
export default composer;
