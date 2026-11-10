#!/usr/bin/env python3
"""Собирает docs/olymp/*.md в одну страницу для чтения (учебник к ВсОШ).

    python3 tools/olymp/build-page.py <куда положить .html>

Нужен pandoc. Разделы идут по номеру в имени файла; заголовок раздела — его H1.
"""
import re, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "olymp"
SLUGS = {"00": "plan", "01": "format", "02": "society", "03": "sociology", "04": "economics",
         "05": "politics", "06": "law", "07": "constitution", "08": "theory", "09": "culture",
         "10": "logic", "11": "persons", "12": "countries"}
SHORT = {"plan": "План", "format": "Формат", "society": "Общество", "sociology": "Социология",
         "economics": "Экономика", "politics": "Политология", "law": "Право",
         "constitution": "Конституция", "theory": "Теория права", "culture": "Культура",
         "logic": "Логика", "persons": "Мыслители", "countries": "Страны"}

def html_of(path):
    out = subprocess.run(["pandoc", "-f", "gfm", "-t", "html", str(path)], capture_output=True, text=True, check=True).stdout
    out = re.sub(r"<table>", '<div class="tbl"><table>', out).replace("</table>", "</table></div>")
    out = re.sub(r"<colgroup>.*?</colgroup>", "", out, flags=re.S)
    out = re.sub(r' style="[^"]*"', "", out)
    return out

sections, tabs = [], []
for f in sorted(SRC.glob("[0-9][0-9]-*.md")):
    slug = SLUGS[f.name[:2]]
    body = html_of(f)
    # якоря подзаголовков: внутри страницы работает только простой #имя
    n = [0]
    def h2(m):
        n[0] += 1
        return '<h2 data-h="%d">' % n[0]
    body = re.sub(r'<h2 id="[^"]*">', h2, body)
    body = re.sub(r'<h([13]) id="[^"]*">', r"<h\1>", body)
    sections.append('<article id="%s" class="chapter" hidden>%s</article>' % (slug, body))
    tabs.append('<a href="#%s" data-tab="%s">%s</a>' % (slug, slug, SHORT[slug]))

page = (pathlib.Path(__file__).with_name("page.html").read_text(encoding="utf-8")
        .replace("<!--TABS-->", "\n".join(tabs)).replace("<!--CHAPTERS-->", "\n".join(sections)))
dst = pathlib.Path(sys.argv[1])
dst.write_text(page, encoding="utf-8")
print(dst, len(page) // 1024, "КБ,", len(sections), "разделов")
