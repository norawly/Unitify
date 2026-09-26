#!/usr/bin/env python3
"""Собирает сайт из расписаний.

Каждая папка public/<имя>/ со своим schedule.js становится страницей s.zhengisbay.com/<имя>/:
  • public/<имя>/index.html          — из шаблона tools/page.html
  • public/<имя>/manifest.webmanifest — чтобы на телефоне ставилось отдельным приложением
Плюс корневая страница выбора (public/index.html) и 404.

Запускается сам перед каждым `npx wrangler deploy` (см. build в wrangler.jsonc).
"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
TEMPLATE = open(os.path.join(ROOT, "tools", "page.html"), encoding="utf-8").read()
FIRST = "nurali"                                  # основное расписание — первым в списке


def field(src, name):
    m = re.search(name + r'\s*:\s*"([^"]*)"', src)
    return m.group(1) if m else ""


def write(path, text):
    """пишем только при изменениях, чтобы не трогать файлы зря"""
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old != text:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        print("  обновлён", os.path.relpath(path, ROOT))


def manifest(owner):
    return json.dumps({
        "id": "./",
        "name": f"Schedule · {owner}",
        "short_name": "Schedule",
        "description": f"Расписание: {owner}",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "orientation": "portrait",
        "background_color": "#0e1013",
        "theme_color": "#0e1013",
        "icons": [
            {"src": "../icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "../icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "../icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }, ensure_ascii=False, indent=2) + "\n"


def chooser(people, prefix, heading, note):
    cards = "\n".join(
        f'    <a class="p" href="{prefix}{slug}/"><b>{html.escape(owner)}</b>'
        f'<span>{html.escape(group or "расписание")}</span><i>→</i></a>'
        for slug, owner, group, *_ in people)
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">
<title>Schedule</title>
<link rel="icon" href="{prefix}icons/icon-192.png">
<!-- Сгенерировано tools/build-pages.py -->
<style>
:root{{--bg:#f5f5f7;--surface:#fff;--text:#17181c;--muted:#6b6f78;--line:#e5e6ea;--accent:#2f6feb;color-scheme:light}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#0e1013;--surface:#16181d;--text:#e7e9ec;--muted:#949aa4;--line:#262a31;--accent:#5b8cf5;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#0e1013;--surface:#16181d;--text:#e7e9ec;--muted:#949aa4;--line:#262a31;--accent:#5b8cf5;color-scheme:dark}}
*{{box-sizing:border-box}}
body{{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);
  font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:24px 16px;
  -webkit-font-smoothing:antialiased}}
main{{width:100%;max-width:380px}}
h1{{margin:0;font-size:24px;font-weight:650;letter-spacing:-.02em}}
p{{margin:4px 0 20px;color:var(--muted);font-size:13.5px}}
.p{{display:grid;grid-template-columns:1fr auto;align-items:center;gap:1px 12px;padding:14px 16px;margin-bottom:8px;
  background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:12px;
  color:inherit;text-decoration:none;transition:transform .12s,border-color .15s}}
.p:hover{{transform:translateY(-1px);border-color:var(--accent)}}
.p b{{font-size:16px;font-weight:620}}
.p span{{grid-column:1;font-size:12.5px;color:var(--muted)}}
.p i{{grid-column:2;grid-row:1/3;font-style:normal;color:var(--muted);font-size:18px}}
</style>
<script>try{{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}}catch(e){{}}</script>
</head>
<body>
<main>
  <h1>{heading}</h1>
  <p>{note}</p>
{cards}
</main>
</body>
</html>
"""


people = []
for slug in os.listdir(PUB):
    src_path = os.path.join(PUB, slug, "schedule.js")
    if not re.fullmatch(r"[a-z0-9-]+", slug) or not os.path.isfile(src_path):
        continue
    src = open(src_path, encoding="utf-8").read()
    owner = field(src, "owner") or slug.capitalize()
    hidden = bool(re.search(r"(?:hidden|private)\s*:\s*true", src))   # личные — не в списке на главной
    people.append((slug, owner, field(src, "group"), hidden))

people.sort(key=lambda p: (p[0] != FIRST, p[0]))
shown = [p for p in people if not p[3]]     # скрытые — только по прямой ссылке и через бота

for slug, owner, _, _hidden in people:
    title = f"Schedule · {owner}"
    src = open(os.path.join(PUB, slug, "schedule.js"), encoding="utf-8").read()
    alias = field(src, "aliasOf")
    if alias and not re.fullmatch(r"[a-z0-9-]+", alias):
        raise ValueError(f"Некорректный aliasOf для {slug}: {alias}")
    base_script = f'<script src="../{alias}/schedule.js"></script>\n' if alias else ""
    page = (TEMPLATE.replace("{{title}}", html.escape(title))
                    .replace("{{owner}}", html.escape(owner))
                    .replace("{{base_script}}", base_script))
    write(os.path.join(PUB, slug, "index.html"), page)
    write(os.path.join(PUB, slug, "manifest.webmanifest"), manifest(owner))

write(os.path.join(PUB, "robots.txt"), "User-agent: *\nDisallow: /\n")      # сайт личный, поисковикам тут нечего делать
note = "Чьё расписание открыть?" if shown else "Расписание открывается по прямой ссылке — её выдаёт бот @nxxschedule_bot"
write(os.path.join(PUB, "index.html"), chooser(shown, "", "Schedule", note))
write(os.path.join(PUB, "404.html"), chooser(shown, "/", "Такого расписания нет",
                                             note if shown else "Проверь ссылку из бота"))

print("расписания:", ", ".join(f"/{s}/" + (" (скрыто)" if h else "") for s, _, _, h in people))
