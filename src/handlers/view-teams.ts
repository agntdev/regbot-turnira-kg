import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { readTournament } from "../tournament-store.js";
registerMainMenuItem({ label: "Просмотр команд", data: "view:teams", order: 20 });
const composer = new Composer<Ctx>();
composer.callbackQuery("view:teams", async (ctx) => { await ctx.answerCallbackQuery(); const state = await readTournament(ctx); const teams = state.applications.filter((a) => a.status === "approved"); const text = teams.length ? `Подтверждённые команды:\n${teams.map((a, i) => `${i + 1}. ${a.name}`).join("\n")}` : "Подтверждённых команд пока нет — список появится после решения организаторов."; await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("Турнирная таблица", "view:bracket")], [inlineButton("В главное меню", "menu:main")]]) }); });
export default composer;
