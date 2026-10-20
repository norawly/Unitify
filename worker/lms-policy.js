import { blocks, KEYS } from "./sched.js";
import { SUBJECT_EN } from "./i18n.js";
import { DEFAULT_POLICY, RELEASE } from "../extension/lib/sync-policy.mjs";

// Authenticated, account-specific data only; no Moodle credentials or HTML.
export async function linkedSchedule(env, chatId) {
  const user = await env.DB.prepare("SELECT person FROM users WHERE chat_id=?").bind(chatId).first();
  if (env.ASSETS && /^[a-z0-9-]{1,40}$/.test(user?.person || "")) {
    const response = await env.ASSETS.fetch(new Request(`https://assets.local/${user.person}/schedule.json`));
    if (response.ok) {
      return response.json();
    }
  }
  return null;
}
export async function syncContext(env, chatId) {
  const S = await linkedSchedule(env, chatId);
  const group = String(S?.group || "").slice(0, 40);
  const timetable = S ? { study: S.term?.study || [], holidays: Object.keys(S.term?.holidays || {}),
    days: Object.fromEntries(KEYS.map(key => [key, blocks(S, key).map(g => ({ start: g.rs, end: g.re,
      names: [...new Set([g.it.subject, SUBJECT_EN[g.it.subject]].filter(Boolean))] }))])) } : null;
  return { version: RELEASE, policy: DEFAULT_POLICY, timetable, group };
}
