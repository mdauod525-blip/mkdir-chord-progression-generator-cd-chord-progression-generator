"""Inline fonts, film code and score into a single self-contained index.html."""
import base64, pathlib

here = pathlib.Path(__file__).parent
b64 = lambda p: base64.b64encode((here / p).read_bytes()).decode()
html = (here / "template.html").read_text()
html = html.replace("{{ANTON}}", b64("build/anton.woff2")).replace("{{PLEX}}", b64("build/plex.woff2"))
html = html.replace("{{AUDIO}}", b64("build/score.mp3"))
html = html.replace("/*FILM*/", (here / "film.js").read_text())
(here / "index.html").write_text(html)
print("index.html", len(html) // 1024, "KB")
