"""Exporta cada slide de um carrossel HTML como PNG 1080x1350.

Uso:
    python exportar.py carrosseis/<slug>/carrossel.html

Os PNGs saem na mesma pasta do HTML: slide_1.png, slide_2.png, ...
Requer:  pip install playwright  &&  python -m playwright install chromium
"""
import asyncio
import re
import sys
from pathlib import Path

VIEW_W = 420
VIEW_H = 525
SCALE = 1080 / 420  # 2.5714

JS_MOVE = """
(idx) => {
  const t = document.querySelector('.carousel-track');
  t.style.transition = 'none';
  t.style.transform = 'translateX(' + (-idx * 420) + 'px)';
}
"""


def total_slides(html: str) -> int:
    m = re.search(r'<meta\s+name="total-slides"\s+content="(\d+)"', html)
    if m:
        return int(m.group(1))
    return len(re.findall(r'class="[^"]*\bslide\b', html))


async def main(path: str) -> None:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        sys.exit("Playwright não instalado. Rode: pip install playwright && python -m playwright install chromium")

    html_path = Path(path).resolve()
    if not html_path.exists():
        sys.exit(f"Arquivo não encontrado: {html_path}")
    out_dir = html_path.parent
    total = total_slides(html_path.read_text(encoding="utf-8"))
    if total == 0:
        sys.exit("Não achei o número de slides (meta total-slides ou class=\"slide\").")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(
            viewport={"width": VIEW_W, "height": VIEW_H},
            device_scale_factor=SCALE,
        )
        await page.goto(html_path.as_uri())
        await page.evaluate("document.body.classList.add('exportando')")
        await page.wait_for_timeout(3000)  # fontes do Google

        for i in range(total):
            await page.evaluate(JS_MOVE, i)
            await page.wait_for_timeout(100)
            out = out_dir / f"slide_{i + 1}.png"
            await page.screenshot(
                path=str(out),
                clip={"x": 0, "y": 0, "width": VIEW_W, "height": VIEW_H},
            )
            print(f"ok  {out.name}")

        await browser.close()
    print(f"\n{total} slides exportados em {out_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1]))
