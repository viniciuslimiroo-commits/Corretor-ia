// As peças NOVAS do P6 no navegador (chamado por conferir-barra-no-navegador.mjs).
//
// Vídeo do Você: o arquivo REAL de docs/testes-reais/voz/com-voz-propria.mp4 (12s), lido do
// disco e entregue à página como Blob -- a pasta docs não é servida, e pôr vídeo de teste
// em public/ mandaria o arquivo pra produção.

import fs from "node:fs";
import path from "node:path";
import { esperar } from "./chrome-cdp.mjs";

const VIDEO = path.join(import.meta.dirname, "..", "..", "docs", "testes-reais", "voz", "com-voz-propria.mp4");

export async function conferirNovos(c, BASE, conferir) {
  const caixa = (sel) => c.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
  const caixas = (sel) => c.avaliar(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => { const r = e.getBoundingClientRect(); return { x: r.left, w: r.width, h: r.height, r: r.right, t: r.top, b: r.bottom }; })`);
  const eventos = () => c.avaliar("JSON.parse(JSON.stringify(window.__bancadaBarra.eventos))");
  const toque = (pontos, tipo) => c.cdp("Input.dispatchTouchEvent", { type: tipo, touchPoints: pontos.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const tocar = async (x, y) => {
    await toque([[x, y]], "touchStart");
    await esperar(40);
    await toque([], "touchEnd");
    await esperar(250);
  };
  const arrastar = async (x0, y, x1) => {
    await toque([[x0, y]], "touchStart");
    for (let i = 1; i <= 12; i++) {
      await toque([[x0 + ((x1 - x0) * i) / 12, y]], "touchMove");
      await esperar(16);
    }
    await esperar(300);
    await toque([], "touchEnd");
    await esperar(500);
  };
  const pronto = "!!window.__bancadaBarra && !!document.querySelector('[data-bancada=barra-normal] [data-acao]')";

  // ---------- barra, sub-barra, aviso ----------
  await c.abrir(`${BASE}?parte=novos&flutuante=aviso`, { largura: 375, altura: 812, celular: true, pronto });
  const botoes = await caixas("[data-bancada=barra-normal] [data-acao]");
  const sobrepoe = botoes.some((b, i) => i > 0 && b.x < botoes[i - 1].r - 0.5);
  conferir(botoes.length >= 6 && botoes.every((b) => Math.round(b.h) === 44 && b.w >= 56) && !sobrepoe, "barra: botões com 44 de altura e 56+ de largura, sem sobrepor", `${botoes.length} botões · menor ${Math.round(Math.min(...botoes.map((b) => b.w)))}px`);
  const rolagem = await c.avaliar("(() => { const e = document.querySelector('[data-bancada=barra-normal] [data-rolagem-barra]'); return [e.scrollWidth, e.clientWidth]; })()");
  const fecharAntes = await caixa("[data-bancada=barra-normal] [data-fechar]");
  const primeiroAntes = botoes[0];
  await arrastar(300, fecharAntes.cy, 120);
  const fecharDepois = await caixa("[data-bancada=barra-normal] [data-fechar]");
  const primeiroDepois = (await caixas("[data-bancada=barra-normal] [data-acao]"))[0];
  conferir(
    rolagem[0] > rolagem[1] && Math.abs(fecharDepois.x - fecharAntes.x) < 0.5 && primeiroDepois.x < primeiroAntes.x - 40 && Math.round(fecharAntes.w) === 44,
    "barra: os botões rolam de lado com o dedo e o ✕ (44px) fica parado",
    `rolou ${Math.round(primeiroAntes.x - primeiroDepois.x)}px · ✕ ${Math.round(fecharAntes.x)} -> ${Math.round(fecharDepois.x)}`
  );
  const n0 = (await eventos()).length;
  const apagado = await c.avaliar("(() => { const b = document.querySelector('[data-bancada=barra-normal] [data-acao][aria-disabled=true]'); if (!b) return null; b.scrollIntoView({ inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: b.dataset.acao }; })()");
  await esperar(200);
  if (apagado) {
    await tocar(apagado.x, apagado.y);
    const ev = (await eventos()).slice(n0);
    conferir(ev.some((e) => e.tipo === "motivo" && typeof e.dado === "string" && e.dado.length > 5) && !ev.some((e) => e.tipo === "acao"), "barra: botão apagado continua tocável e diz o motivo", `${apagado.id}: ${ev.find((e) => e.tipo === "motivo")?.dado ?? "-"}`);
  } else conferir(false, "barra: achar um botão apagado (o cursor fora da música)");
  const fx = await caixa("[data-bancada=barra-normal] [data-fechar]");
  await tocar(fx.cx, fx.cy);
  conferir((await eventos()).some((e) => e.tipo === "fechar"), "barra: ✕ tira a seleção");

  const fonte = await c.avaliar("getComputedStyle(document.querySelector('[data-bancada=barra-sub] input[type=text]')).fontSize");
  conferir(fonte === "16px", "sub-barra: campo de texto em 16px mesmo com text-xs (o iOS não dá zoom)", fonte);
  const deslizante = await caixa("[data-bancada=barra-volume] input[type=range]");
  conferir(!!deslizante && Math.round(deslizante.h) >= 44, "sub-barra: controle deslizante com 44px de toque", deslizante && Math.round(deslizante.h));

  const aviso = await caixa("[data-aviso]");
  const linha = await caixa("[data-mock-linha]");
  const botaoDesfazer = await caixa("[data-aviso] [data-desfazer]");
  conferir(!!aviso && Math.abs(linha.y - aviso.b - 8) < 1 && Math.round(aviso.h) === 44 && aviso.w <= 343 && aviso.x >= 16, "aviso: 44px, até 343 de largura, 8px ACIMA da linha do tempo (sem cobrir)", aviso && `fundo ${Math.round(aviso.b)} · linha ${Math.round(linha.y)} · ${Math.round(aviso.w)}px`);
  conferir(!!botaoDesfazer && botaoDesfazer.w >= 44 && botaoDesfazer.h >= 44, "aviso: Desfazer com 44×44", botaoDesfazer && `${Math.round(botaoDesfazer.w)}×${Math.round(botaoDesfazer.h)}`);
  await tocar(botaoDesfazer.cx, botaoDesfazer.cy);
  conferir((await eventos()).some((e) => e.tipo === "desfazer") && !(await caixa("[data-aviso]")), "aviso: Desfazer chama o desfazer e o aviso some");

  // ---------- legenda no palco ----------
  const leg = await c.avaliar("(() => { const s = document.querySelector('[data-legenda-palco] span'); const p = document.querySelector('[data-palco]').getBoundingClientRect(); const r = s.getBoundingClientRect(); return { fonte: parseFloat(getComputedStyle(s).fontSize), baixo: p.bottom - r.bottom, alturaPalco: p.height, largura: r.width, larguraPalco: p.width }; })()");
  conferir(Math.abs(leg.fonte - leg.alturaPalco * 0.034) < 0.05 && leg.largura <= leg.larguraPalco * 0.86 + 0.5, "legenda no palco: letra 3,4% da altura, largura até 86% (a conta do ffmpeg)", `${leg.fonte.toFixed(2)}px · ${Math.round(leg.largura)} de ${Math.round(leg.larguraPalco)}`);

  // ---------- galeria de texto no texto certo ----------
  const n1 = (await eventos()).length;
  const anim = await c.avaliar("(() => { const b = [...document.querySelectorAll('[data-bancada=galeria-texto] button')].find(x => x.textContent.startsWith('Subir')); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
  await esperar(200);
  if (anim) {
    await tocar(anim.x, anim.y);
    const ev = (await eventos()).slice(n1).find((e) => e.tipo === "animacao");
    conferir(ev?.dado?.indice === 0 && ev?.dado?.id === "subir", "galeria de texto: a animação vai pro texto escolhido (indiceAlvo), não pro último", JSON.stringify(ev?.dado));
  } else conferir(false, "galeria de texto: achar o botão Subir na aba Animação (aba controlada)");
  const aviso2 = await c.avaliar("document.querySelector('[data-bancada=galeria-texto]').textContent.includes('Vale pro texto escolhido.')");
  conferir(aviso2, "galeria de texto: diz que vale pro texto escolhido");

  // ---------- Você no relógio, com o vídeo de verdade ----------
  const b64 = fs.readFileSync(VIDEO).toString("base64");
  await c.avaliar(`(() => { const bin = atob(${JSON.stringify(b64)}); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__bancadaBarra.usarVideo(URL.createObjectURL(new Blob([u], { type: 'video/mp4' }))); return true; })()`);
  for (let i = 0; i < 50 && !(await eventos()).some((e) => e.tipo === "duracao"); i++) await esperar(100);
  const dur = (await eventos()).find((e) => e.tipo === "duracao")?.dado;
  conferir(Math.abs((dur ?? 0) - 12) < 0.1, "Você: a duração do arquivo chega ao dono (aoMedirDuracao)", dur);
  const estadoVoce = () => c.avaliar("(() => { const d = document.querySelector('[aria-label^=\"Você no vídeo\"]'); const v = d.querySelector('video'); const s = getComputedStyle(d); return { vis: s.visibility, op: s.opacity, t: v.currentTime, parado: v.paused, loop: v.loop, auto: v.autoplay }; })()");
  await c.avaliar("window.__bancadaBarra.irPara(1)");
  await esperar(400);
  const fora = await estadoVoce();
  conferir(fora.vis === "hidden" && !fora.loop && !fora.auto, "Você no relógio: antes de entrar (1s; entra aos 2s) não aparece, e sem laço nem autoplay", JSON.stringify(fora));
  await c.avaliar("window.__bancadaBarra.irPara(3)");
  await esperar(500);
  const dentro = await estadoVoce();
  conferir(dentro.vis === "visible" && Math.abs(dentro.t - 1.5) <= 0.15 && dentro.parado, "Você no relógio: aos 3s aparece parado no quadro certo (início 0,5 + 1s = 1,5s ±0,15)", `${dentro.t.toFixed(3)}s`);
  await c.avaliar("window.__bancadaBarra.selecionarVoce(true); window.__bancadaBarra.irPara(1)");
  await esperar(400);
  const fantasma = await estadoVoce();
  conferir(fantasma.vis === "visible" && Math.abs(parseFloat(fantasma.op) - 0.4) < 0.01, "Você selecionado fora da janela: fantasma a 40%", `opacidade ${fantasma.op}`);
  await c.avaliar("window.__bancadaBarra.selecionarVoce(false); window.__bancadaBarra.irPara(2.2)");
  await esperar(400);
  await c.avaliar("window.__bancadaBarra.tocar(true)");
  const amostras = [];
  for (let i = 0; i < 8; i++) {
    await esperar(250);
    const r = await c.avaliar("(() => { const v = document.querySelector('[aria-label^=\"Você no vídeo\"] video'); return { tv: v.currentTime, t: window.__tempo, parado: v.paused }; })()");
    if (r.t >= 2.4 && r.t < 4.8) amostras.push(r);
  }
  await c.avaliar("window.__bancadaBarra.tocar(false)");
  const pior = Math.max(...amostras.map((a) => Math.abs(a.tv - (0.5 + a.t - 2))));
  conferir(amostras.length >= 5 && pior <= 0.15 && amostras.every((a) => !a.parado), "Você tocando: o vídeo segue o relógio (±0,15s em cada amostra)", `${amostras.length} amostras · pior ${pior.toFixed(3)}s`);
  await c.avaliar("window.__bancadaBarra.irPara(5.5)");
  await esperar(400);
  conferir((await estadoVoce()).vis === "hidden", "Você depois da janela (2 a 5s) some de novo");

  // ---------- lista da foto ----------
  await c.abrir(`${BASE}?parte=novos&flutuante=lista`, { largura: 375, altura: 812, celular: true, pronto: "!!document.querySelector('[data-lista]')" });
  const linhas = await caixas("[data-item-lista]");
  const lista = await caixa("[data-lista]");
  const linha2 = await caixa("[data-mock-linha]");
  const rolaDentro = await c.avaliar("(() => { const u = document.querySelector('[data-lista] ul'); return u.scrollHeight > u.clientHeight; })()");
  conferir(linhas.length === 4 && linhas.every((l) => Math.round(l.h) === 44), "lista da foto: uma linha de 44px por item", linhas.map((l) => Math.round(l.h)).join(","));
  conferir(Math.round(lista.h) === 164 && rolaDentro && Math.abs(linha2.y - lista.b - 8) < 1, "lista da foto: três à vista (164px), o quarto rolando por dentro, 8px acima da linha do tempo", `${Math.round(lista.h)}px`);
  conferir((await c.avaliar("document.documentElement.scrollWidth")) === 375, "a bancada não rola de lado em 375px");
}
