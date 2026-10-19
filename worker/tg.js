/* Telegram Bot API. TG_API можно подменить для локальной проверки. */

export async function tg(env, method, body) {
  const url = `${env.TG_API || "https://api.telegram.org"}/bot${env.TELEGRAM_TOKEN}/${method}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      ...(body instanceof FormData ? {} : { headers: { "content-type": "application/json" } }),
      body: body instanceof FormData ? body : JSON.stringify(body || {}),
    });
    const json = await res.json();
    if (!json.ok && !/not modified/i.test(json.description || ""))
      console.log("telegram", method, json.error_code, json.description);
    return json;
  } catch (e) {
    console.log("telegram fetch", method, String(e));
    return { ok: false };
  }
}

/* Секрет webhook выводим из токена: Telegram присылает его в заголовке,
   поэтому чужие POST на /tg/webhook отбрасываются, а отдельный секрет не нужен. */
export async function webhookSecret(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("schedule-webhook:" + token));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
