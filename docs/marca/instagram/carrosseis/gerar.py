"""Gera os HTMLs dos carrosséis do Encena a partir de conteudo.json.

Uso:  python gerar.py          (todos)
      python gerar.py 01       (só os slugs que começam com 01)

Identidade (web/src/app/globals.css, docs/marca/instagram): índigo profundo #0F2D5B
(confiança), coral terracota #F06B4F (energia), pêssego #FAD7C4 (acolhimento), teal
#2CB1A3 (inovação); fonte Geist, a mesma do app; logo "E" branco com a barra do meio em
coral; assinatura "Encena" forte e ".ai" discreto.

Contraste medido (WCAG): índigo sobre creme 12,9 · branco sobre índigo 13,6 · índigo sobre
pêssego 10,1 · coral-texto #C4462C sobre creme 4,7. O coral PURO (#F06B4F) sobre creme dá
2,9: por isso ele fica em ícone, barra e número grande, nunca em texto pequeno.

As fotos (pasta fotos/) entram em base64, com o MIME lido dos primeiros bytes do arquivo
(extensão mente: print de celular costuma ser JPEG com nome .png).
"""
import base64
import html
import json
import sys
from pathlib import Path

PASTA = Path(__file__).parent
FOTOS = PASTA / "fotos"

MARCA = {
    "nome": "Encena",
    "sufixo": ".ai",
    # Confirmar o @ oficial do Instagram e trocar aqui (a prévia do kit usou "encena.app").
    "arroba": "@encena.app",
    "assinatura": "O imóvel inteiro, pronto para anunciar.",
}

# O "E" da marca (web/public/marca-encena.svg), em linha.
LOGO_SVG = (
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0F2D5B"/>'
    '<rect x="16" y="15" width="8" height="34" rx="2" fill="#fff"/><rect x="16" y="15" width="30" height="8" rx="2" fill="#fff"/>'
    '<rect x="16" y="41" width="30" height="8" rx="2" fill="#fff"/><rect x="16" y="28" width="38" height="8" rx="4" fill="#F06B4F"/></svg>'
)
# A foto de perfil: fundo índigo até a borda, porque o Instagram recorta em círculo.
AVATAR_SVG = (
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#0F2D5B"/>'
    '<g transform="translate(32 32) scale(0.86) translate(-35 -32)"><rect x="16" y="15" width="8" height="34" rx="2" fill="#fff"/>'
    '<rect x="16" y="15" width="30" height="8" rx="2" fill="#fff"/><rect x="16" y="41" width="30" height="8" rx="2" fill="#fff"/>'
    '<rect x="16" y="28" width="38" height="8" rx="4" fill="#F06B4F"/></g></svg>'
)

CSS = """
:root{--indigo:#0F2D5B;--indigo-2:#16386E;--coral:#F06B4F;--coral-escuro:#D9583E;--coral-texto:#C4462C;--pessego:#FAD7C4;--teal:#2CB1A3;--creme:#FFF8F3;--linha:#EFDFD5;--suave:#44546F}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#F3ECE6;font-family:'Geist',system-ui,sans-serif;color:var(--indigo)}
body{display:flex;justify-content:center;padding:32px 0}
.ig-frame{width:420px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(15,45,91,.14)}
.ig-header{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #EFEFEF}
.ig-avatar{width:32px;height:32px;border-radius:50%;overflow:hidden;flex:0 0 32px}
.ig-avatar svg{width:100%;height:100%;display:block}
.ig-header b{font-size:13px;font-weight:600}
.ig-header small{display:block;font-size:11px;color:#6B7280;font-weight:400}
.viewport{width:420px;height:525px;overflow:hidden;position:relative;touch-action:pan-y;cursor:grab}
.carousel-track{display:flex;height:100%;transition:transform .35s ease}
.slide{width:420px;height:525px;flex:0 0 420px;position:relative;padding:36px 32px 72px 32px;display:flex;flex-direction:column;overflow:hidden}
.slide.light{background:var(--creme);color:var(--indigo)}
.slide.dark{background:radial-gradient(circle at 100% 0%,rgba(240,107,79,.20),transparent 55%),var(--indigo);color:#fff}
.slide.grad{background:radial-gradient(circle at 0% 0%,rgba(15,45,91,.22),transparent 60%),linear-gradient(165deg,#B8402A 0%,#D9583E 50%,#F06B4F 100%);color:#fff}
.serif,.sans{font-family:'Geist',system-ui,sans-serif}
.tag{display:inline-block;align-self:flex-start;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:5px 10px;border-radius:999px;margin-bottom:16px}
.light .tag{background:var(--pessego);color:var(--indigo)}
.dark .tag{background:rgba(240,107,79,.16);color:var(--pessego);border:1px solid rgba(240,107,79,.45)}
.grad .tag{background:var(--indigo);color:var(--pessego)}
h1{font-size:30px;font-weight:700;line-height:1.12;letter-spacing:-.6px;margin-bottom:14px}
h1.big{font-size:33px}
h2{font-size:26px;font-weight:700;line-height:1.16;letter-spacing:-.4px;margin-bottom:14px}
p.body{font-size:14px;line-height:1.55;font-weight:400;max-width:350px}
.light p.body{color:var(--suave)}
.dark p.body{color:#C9D3E3}
.grad p.body{color:#fff}
.logo{display:flex;align-items:center;gap:9px;margin-bottom:auto}
.logo.junto{margin-bottom:16px}
.logo svg{width:30px;height:30px;display:block}
.logo span{font-weight:700;font-size:16px;letter-spacing:-.3px}
.logo span small{font-size:.58em;font-weight:600;opacity:.55;letter-spacing:0}
.spacer{flex:1}
.slide.center{justify-content:center}
.quote{background:rgba(15,45,91,.55);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:16px 18px;font-style:italic;font-size:15px;line-height:1.5;margin-top:14px;color:#fff}
.light .quote,.grad .quote{background:var(--indigo);border-color:var(--indigo)}
.list{margin-top:4px}
.list.compact{margin-top:0}.list.compact .item{padding:6px 0}.list.compact .icon{width:26px;height:26px;flex-basis:26px}.list.compact .item span{font-size:11px}
.item{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--linha);align-items:flex-start}
.dark .item{border-bottom-color:rgba(255,255,255,.1)}
.item:last-child{border-bottom:none}
.icon{width:30px;height:30px;border-radius:8px;flex:0 0 30px;display:flex;align-items:center;justify-content:center}
.light .icon{background:var(--coral);color:#fff}
.dark .icon{background:rgba(240,107,79,.14);color:var(--coral)}
.icon svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.item b{display:block;font-size:14px;font-weight:600;margin-bottom:2px}
.item span{font-size:12px;line-height:1.45}
.light .item span{color:var(--suave)}
.dark .item span{color:#C9D3E3}
.step{display:flex;gap:16px;padding:12px 0;border-bottom:1px solid var(--linha);align-items:flex-start}
.step:last-child{border-bottom:none}
.step .n{font-size:28px;font-weight:300;line-height:1;color:var(--coral-escuro);width:32px;flex:0 0 32px}
.step b{display:block;font-size:14px;font-weight:600;margin-bottom:2px}
.step span{font-size:12px;line-height:1.45;color:var(--suave)}
.bignum{font-size:92px;font-weight:300;line-height:.9;letter-spacing:-4px;margin-bottom:14px}
.light .bignum{color:var(--coral-escuro)}
.dark .bignum{color:var(--coral)}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.pill{font-size:11px;font-weight:600;padding:6px 11px;border-radius:999px;border:1px solid}
.light .pill{border-color:var(--coral-escuro);color:var(--indigo);background:#fff}
.dark .pill{border-color:rgba(255,255,255,.28);color:#fff}
.grad .pill{border-color:rgba(255,255,255,.6);color:#fff}
.pill.strike{text-decoration:line-through;opacity:.7}
.par{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:2px 0 6px}
.par figure,.foto figure{position:relative}
.par img{width:100%;aspect-ratio:4/3;object-fit:cover;object-position:100% 50%;border-radius:10px;display:block}
.foto img{width:100%;aspect-ratio:2/1;object-fit:cover;object-position:100% 60%;border-radius:12px;display:block}
.rot{position:absolute;left:6px;top:6px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:3px 7px;border-radius:999px;color:#fff}
.rot.antes{background:rgba(15,45,91,.88)}
.rot.depois{background:var(--coral-texto)}
.leg-foto{font-size:11px;line-height:1.4;margin-bottom:14px}
.light .leg-foto{color:var(--suave)}
.dark .leg-foto{color:#C9D3E3}
.grad .leg-foto{color:#fff}
.cta{display:inline-block;align-self:flex-start;margin-top:22px;padding:13px 26px;border-radius:999px;background:var(--creme);color:var(--indigo);font-size:15px;font-weight:700}
.handle{font-size:12px;font-weight:600;opacity:.9;margin-top:14px}
.nota{font-size:11.5px;line-height:1.45;margin-top:auto;padding-top:10px}
.light .nota{color:var(--suave)}
.progress{position:absolute;left:28px;right:28px;bottom:20px;display:flex;align-items:center;gap:10px}
.progress .track{flex:1;height:3px;border-radius:3px;background:rgba(15,45,91,.1);overflow:hidden}
.dark .progress .track,.grad .progress .track{background:rgba(255,255,255,.16)}
.progress .fill{height:100%;border-radius:3px;background:var(--coral)}
.grad .progress .fill{background:#fff}
.progress .count{font-size:11px;font-weight:500;opacity:.75}
.arrow{position:absolute;top:0;right:0;width:48px;height:100%;display:flex;align-items:center;justify-content:center;pointer-events:none}
.light .arrow{background:linear-gradient(90deg,transparent,rgba(15,45,91,.06))}
.dark .arrow,.grad .arrow{background:linear-gradient(90deg,transparent,rgba(255,255,255,.08))}
.arrow svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.6}
.ig-dots{display:flex;justify-content:center;gap:4px;padding:10px 0 4px}
.ig-dots i{width:6px;height:6px;border-radius:50%;background:#D1D5DB}
.ig-dots i.on{background:var(--coral)}
.ig-actions{display:flex;gap:14px;padding:6px 14px 8px}
.ig-actions svg{width:22px;height:22px;stroke:var(--indigo);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ig-actions .save{margin-left:auto}
.ig-caption{padding:0 14px 14px;font-size:13px;line-height:1.45}
.ig-caption b{margin-right:6px}
body.exportando{padding:0;background:transparent;display:block}
body.exportando .ig-frame{border-radius:0;box-shadow:none;width:420px}
body.exportando .ig-header,body.exportando .ig-dots,body.exportando .ig-actions,body.exportando .ig-caption{display:none}
"""

ICONS = {
    "sofa": '<svg viewBox="0 0 24 24"><path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4H2z"/><path d="M4 17v2M20 17v2"/></svg>',
    "empty": '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/></svg>',
    "sun": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    "cloud": '<svg viewBox="0 0 24 24"><path d="M17.5 19a4.5 4.5 0 0 0 .5-9 7 7 0 0 0-13.4 2A4 4 0 0 0 6 19z"/></svg>',
    "check": '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    "shield": '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5z"/></svg>',
    "lock": '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    "coin": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3H11a1.5 1.5 0 0 0 0 3h3.5"/></svg>',
    "user": '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    "users": '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>',
    "building": '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></svg>',
    "clock": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    "x": '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    "layers": '<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
    "play": '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>',
    "globo": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>',
    "planta": '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 11h8V3M11 15v6M15 11h6M11 11h1"/></svg>',
    "lote": '<svg viewBox="0 0 24 24"><path d="m4 7 8-4 8 4-2 13H6z"/><path d="M9 12h6"/></svg>',
    "book": '<svg viewBox="0 0 24 24"><path d="M2 5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H2zM22 5a2 2 0 0 0-2-2h-6a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2h8z"/></svg>',
}

CHEVRON = '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>'


def e(s):
    return html.escape(s, quote=False)


def data_uri(nome):
    """Arquivo da pasta fotos/ em base64, com o MIME dos primeiros bytes (não da extensão)."""
    caminho = next((p for p in FOTOS.glob(nome + ".*")), None)
    if caminho is None:
        sys.exit(f"Foto não encontrada em fotos/: {nome}")
    dados = caminho.read_bytes()
    if dados[:3] == b"\xff\xd8\xff":
        mime = "image/jpeg"
    elif dados[:8] == b"\x89PNG\r\n\x1a\n":
        mime = "image/png"
    elif dados[:4] == b"RIFF" and dados[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        sys.exit(f"Formato de imagem desconhecido: {caminho.name}")
    return f"data:{mime};base64," + base64.b64encode(dados).decode("ascii")


def par(base, legenda):
    """Antes e depois lado a lado. O 'depois' sempre diz que é imagem ilustrativa."""
    return (
        '<div class="par">'
        f'<figure><img src="{data_uri(base + "-antes")}" alt="Antes"><span class="rot antes">Antes</span></figure>'
        f'<figure><img src="{data_uri(base + "-depois")}" alt="Depois"><span class="rot depois">Depois</span></figure>'
        "</div>"
        f'<p class="leg-foto sans">{e(legenda)} · imagem ilustrativa</p>'
    )


def foto(nome, legenda):
    return (
        f'<div class="foto"><figure><img src="{data_uri(nome)}" alt=""><span class="rot depois">Depois</span></figure></div>'
        f'<p class="leg-foto sans" style="margin-top:6px">{e(legenda)} · imagem ilustrativa</p>'
    )


def assinatura():
    return f'<span>{MARCA["nome"]}<small>{MARCA["sufixo"]}</small></span>'


def render_slide(s, i, total):
    bg = s.get("bg", "light")
    center = " center" if s.get("bignum") and not (s.get("items") or s.get("steps")) else ""
    parts = [f'<section class="slide {bg}{center}">']
    topo = s.get("par_topo") or s.get("foto_topo")
    if s.get("logo"):
        parts.append(f'<div class="logo{" junto" if topo else ""}">{LOGO_SVG}{assinatura()}</div>')
    if s.get("par_topo"):
        parts.append(par(*s["par_topo"]))
    if s.get("foto_topo"):
        parts.append(foto(*s["foto_topo"]))
    if topo:
        parts.append('<div class="spacer"></div>')
    if s.get("tag"):
        parts.append(f'<span class="tag sans">{e(s["tag"])}</span>')
    if s.get("bignum"):
        parts.append(f'<div class="bignum serif">{e(s["bignum"])}</div>')
    if s.get("h1"):
        cls = "serif big" if s.get("big") else "serif"
        parts.append(f'<h1 class="{cls}">{e(s["h1"])}</h1>')
    if s.get("h2"):
        parts.append(f'<h2 class="serif">{e(s["h2"])}</h2>')
    if s.get("par"):
        parts.append(par(*s["par"]))
    if s.get("par2"):
        parts.append(par(*s["par2"]))
    if s.get("body"):
        parts.append(f'<p class="body sans">{e(s["body"])}</p>')
    if s.get("quote"):
        parts.append(f'<div class="quote sans">“{e(s["quote"])}”</div>')
    if s.get("items"):
        parts.append('<div class="list compact">' if len(s["items"]) >= 5 else '<div class="list">')
        for icon, label, desc in s["items"]:
            parts.append(f'<div class="item"><div class="icon">{ICONS[icon]}</div><div><b class="sans">{e(label)}</b><span class="sans">{e(desc)}</span></div></div>')
        parts.append("</div>")
    if s.get("steps"):
        parts.append('<div class="list">')
        for n, (label, desc) in enumerate(s["steps"], 1):
            parts.append(f'<div class="step"><div class="n serif">{n}</div><div><b class="sans">{e(label)}</b><span class="sans">{e(desc)}</span></div></div>')
        parts.append("</div>")
    if s.get("pills"):
        parts.append('<div class="pills">')
        for p in s["pills"]:
            strike = " strike" if p.startswith("~") else ""
            parts.append(f'<span class="pill sans{strike}">{e(p.lstrip("~"))}</span>')
        parts.append("</div>")
    if s.get("footnote"):
        parts.append(f'<p class="nota sans">{e(s["footnote"])}</p>')
    if s.get("cta"):
        parts.append(f'<div class="spacer"></div><a class="cta sans">{e(s["cta"])}</a><div class="handle sans">{MARCA["arroba"]}</div>')
    pct = (i + 1) / total * 100
    parts.append(f'<div class="progress"><div class="track"><div class="fill" style="width:{pct:.1f}%"></div></div><span class="count sans">{i+1}/{total}</span></div>')
    if i < total - 1:
        parts.append(f'<div class="arrow">{CHEVRON}</div>')
    parts.append("</section>")
    return "\n".join(parts)


def render(car):
    slides = car["slides"]
    total = len(slides)
    dots = "".join(f'<i class="{"on" if k == 0 else ""}"></i>' for k in range(total))
    corpo = "\n".join(render_slide(s, i, total) for i, s in enumerate(slides))
    arroba = MARCA["arroba"][1:]
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="total-slides" content="{total}">
<title>{e(car['titulo'])} · {MARCA['nome']}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
{CSS}
</style>
</head>
<body>
<div class="ig-frame">
  <div class="ig-header"><div class="ig-avatar">{AVATAR_SVG}</div><div><b>{arroba}</b><small>{MARCA['assinatura']}</small></div></div>
  <div class="viewport" id="viewport">
    <div class="carousel-track" id="track">
{corpo}
    </div>
  </div>
  <div class="ig-dots" id="dots">{dots}</div>
  <div class="ig-actions">
    <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
    <svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg>
    <svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>
    <svg class="save" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
  </div>
  <div class="ig-caption"><b>{arroba}</b>{e(car['legenda'])}</div>
</div>
<script>
(function(){{
  var total={total},idx=0,track=document.getElementById('track'),vp=document.getElementById('viewport'),dots=document.getElementById('dots').children;
  function go(n){{idx=Math.max(0,Math.min(total-1,n));track.style.transform='translateX('+(-idx*420)+'px)';for(var k=0;k<total;k++)dots[k].className=k===idx?'on':'';}}
  var x0=null;
  vp.addEventListener('pointerdown',function(ev){{x0=ev.clientX;}});
  vp.addEventListener('pointerup',function(ev){{if(x0===null)return;var d=ev.clientX-x0;x0=null;if(d<-30)go(idx+1);else if(d>30)go(idx-1);else go(ev.clientX>210?idx+1:idx-1);}});
  document.addEventListener('keydown',function(ev){{if(ev.key==='ArrowRight')go(idx+1);if(ev.key==='ArrowLeft')go(idx-1);}});
}})();
</script>
</body>
</html>
"""


def main():
    filtro = sys.argv[1] if len(sys.argv) > 1 else ""
    data = json.loads((PASTA / "conteudo.json").read_text(encoding="utf-8"))
    for car in data:
        if not car["slug"].startswith(filtro):
            continue
        d = PASTA / car["slug"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "carrossel.html").write_text(render(car), encoding="utf-8")
        print("ok", d / "carrossel.html")


if __name__ == "__main__":
    main()
