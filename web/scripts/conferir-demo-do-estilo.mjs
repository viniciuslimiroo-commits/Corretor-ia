// A JANELINHA DE DEMONSTRAÇÃO, ao passar o mouse nos estilos.
//
// Ele em 10/10/2026: "ao passar o mouse em cima de 'Movimento na foto' e 'Tour pela casa',
// assim que o cursor ficar em cima dar uma breve demonstração, abrir janelinha ao lado
// mostrando um exemplo de como ficaria".
//
// O que importa aqui não é "a janela abriu" -- é que ela MOSTRA MOVIMENTO. Uma janelinha com
// a foto parada passa em qualquer teste de presença e não demonstra nada. Então o roteiro
// lê a matriz de transformação da imagem em dois instantes e exige que tenha mudado.
//
// Não gera vídeo e não gasta crédito.
//
//   BASE=http://localhost:3000 node scripts/conferir-demo-do-estilo.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirChrome, esperar } from "./chrome-cdp.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = process.env.BASE ?? "http://localhost:3000";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-demo-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const access_token = p.get("access_token");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` } }).then((x) => x.json());
const sessao = { access_token, refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='nextjs-portal{visibility:hidden!important}';document.head.appendChild(s);});" });
const shot = async (n) => {
  const { data } = await c.cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SAIDA, `${n}.png`), Buffer.from(data, "base64"));
};
const mover = (x, y) => c.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(x), y: Math.round(y), buttons: 0, pointerType: "mouse" });
const caixaDoTexto = (t) =>
  c.avaliar(`(() => { const b = [...document.querySelectorAll('button')].filter(e => e.offsetParent).find(e => e.innerText.includes(${JSON.stringify(t)})); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top + r.height/2 }; })()`);
const janela = () =>
  c.avaliar(`(() => {
    const d = document.querySelector('[data-demo-estilo]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const img = d.querySelector('img');
    return {
      estilo: d.dataset.demoEstilo,
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      fotos: [...d.querySelectorAll('img')].map(i => i.getAttribute('src')),
      selo: /filmado no celular/.test(d.innerText),
      legenda: (d.querySelector('p')?.innerText ?? '').slice(0, 60),
      transform: img ? getComputedStyle(img).transform : null,
      video: (() => { const v = d.querySelector('video'); return v ? { src: v.getAttribute('src'), tempo: v.currentTime, pausado: v.paused, largura: v.videoWidth, altura: v.videoHeight } : null; })(),
    };
  })()`);

try {
  await c.abrir(`${BASE}/login`, { largura: 1400, altura: 950 });
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/videos`, { largura: 1400, altura: 950 });
  for (let i = 0; i < 50 && !(await caixaDoTexto("Movimento na foto")); i++) await esperar(300);

  // ---- escolhe um imóvel: a janelinha deve usar as fotos DELE ----
  const temImovel = await c.avaliar(`(() => {
    const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value)));
    if (!s) return false;
    const op = [...s.options].find(o => /^[0-9a-f-]{36}$/.test(o.value));
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, op.value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (temImovel) await esperar(5000);

  conferir(!(await janela()), "sem o mouse em cima, não há janelinha nenhuma");

  // ---- MOVIMENTO NA FOTO ----
  const bm = await caixaDoTexto("Movimento na foto");
  conferir(!!bm, "achei o cartão “Movimento na foto”");
  await mover(bm.cx, bm.cy);
  await esperar(800);
  const jm = await janela();
  conferir(!!jm && jm.estilo === "recomendado", "passar o mouse ABRE a janelinha", jm ? `${jm.w}x${jm.h}` : "não abriu");
  await shot("01-movimento-na-foto");

  if (jm) {
    conferir(jm.x + jm.w <= bm.x + 4, "ela abre AO LADO do cartão, não por cima", `janela termina em ${jm.x + jm.w}, cartão começa em ${Math.round(bm.x)}`);
    conferir(jm.x >= 0 && jm.y >= 0, "e não vaza pra fora da tela", `x=${jm.x} y=${jm.y}`);
    conferir(jm.h > jm.w, "o quadro é em pé, como o vídeo que ela vai gerar", `${jm.w}x${jm.h}`);

    // O QUE IMPORTA: a imagem está se MEXENDO.
    const t0 = (await janela())?.transform;
    await esperar(500);
    const t1 = (await janela())?.transform;
    await esperar(500);
    const t2 = (await janela())?.transform;
    conferir(t0 !== t1 || t1 !== t2, "a foto se MOVE (não é uma miniatura parada)", `${String(t0).slice(0, 34)} → ${String(t1).slice(0, 34)}`);

    // Sem imóvel escolhido, este caso não tem o que medir. Dizer isso em voz alta: um caso
    // pulado em silêncio parece um caso aprovado quando se lê a lista de cima pra baixo.
    if (temImovel) conferir(jm.fotos.some((f) => f && !f.startsWith("/exemplos/")), "usa as fotos DELE, não as de exemplo", jm.fotos.map((f) => String(f).slice(0, 38)).join(" · "));
    else console.log("pulei  usa as fotos DELE · a conta não tinha imóvel com foto pra escolher");
    conferir(jm.fotos.length >= 1, "a janelinha tem foto pra mostrar", `${jm.fotos.length}`);
    conferir(!jm.selo, "“Movimento na foto” não promete filmagem nenhuma");
    conferir(/exatamente este movimento/.test(jm.legenda), "e diz que o movimento é o mesmo do vídeo", jm.legenda);
  }

  // ---- TOUR PELA CASA ----
  const bt = await caixaDoTexto("Tour pela casa");
  await mover(bt.cx, bt.cy);
  await esperar(900);
  const jt = await janela();
  conferir(!!jt && jt.estilo === "tour", "o cartão “Tour pela casa” abre a janelinha dele");
  await shot("02-tour-pela-casa");
  if (jt) {
    // O TOUR TEM QUE SER UM CLIPE DE VERDADE. Ele viu a primeira versão (foto com zoom) e
    // disse "parece somente efeito aproximando" -- e tinha razão: aquilo fazia o recurso de
    // 2 créditos parecer igual ao grátis. Foto animada aqui é reprovação.
    conferir(!!jt.video, "o tour mostra um VÍDEO, não uma foto animada", jt.video ? jt.video.src : "não achei <video> na janelinha");
    if (jt.video) {
      conferir(jt.video.largura > 0, "o clipe carregou de verdade (tem quadro)", `${jt.video.largura}x${jt.video.altura}`);
      conferir(!jt.video.pausado, "e ele toca sozinho, sem pedir clique");
      const t0 = jt.video.tempo;
      await esperar(900);
      const t1 = (await janela())?.video?.tempo ?? t0;
      conferir(t1 > t0, "o clipe ANDA (não é um quadro congelado)", `${t0.toFixed(2)}s → ${t1.toFixed(2)}s`);
    }
    conferir(jt.selo, "o tour diz de onde o clipe veio (“filmado no celular”)");
    conferir(/filma|Encena/.test(jt.legenda), "e a legenda explica que a pessoa filma e o Encena monta", jt.legenda);
  }

  // ---- sair fecha ----
  await mover(40, 500);
  await esperar(700);
  conferir(!(await janela()), "tirar o mouse FECHA a janelinha");

  // ---- onde NÃO HÁ MOUSE a janelinha não aparece: no dedo não existe "passar por cima" ----
  // Encolher a tela NÃO basta: `hover` é característica do PONTEIRO, não do tamanho.
  // `setEmulatedMedia` também não resolve -- tentei, e `matchMedia("(hover: none)")`
  // continuou falso; o que o Chrome lê pra decidir `hover`/`pointer` é a emulação de TOQUE.
  // Enquanto eu usava só o tamanho, o roteiro reprovava uma tela que estava certa.
  await c.cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await c.cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await esperar(900);
  // ANTES de julgar a tela, conferir o INSTRUMENTO: a emulação mudou mesmo o `hover`?
  // Sem isto, um "não escondeu" pode ser a página certa com a emulação que não pegou.
  const semMouse = await c.avaliar(`matchMedia("(hover: none)").matches`);
  conferir(semMouse, "a emulação realmente pôs a página em “sem mouse”", semMouse ? "" : "matchMedia ainda diz que há mouse — o teste abaixo não valeria");
  const bc = await caixaDoTexto("Movimento na foto");
  if (bc && semMouse) {
    await mover(bc.cx, bc.cy);
    await esperar(800);
    const escondida = await c.avaliar(`(() => { const d = document.querySelector('[data-demo-estilo]'); if (!d) return true; const r = d.getBoundingClientRect(); return getComputedStyle(d).display === 'none' || r.width === 0; })()`);
    conferir(escondida, "sem mouse (hover: none) a janelinha não aparece");
    await shot("03-celular");
  } else if (semMouse) {
    conferir(false, "achei o cartão do estilo na tela de celular");
  }
  await c.cdp("Emulation.setTouchEmulationEnabled", { enabled: false });
  await c.cdp("Emulation.clearDeviceMetricsOverride");

  conferir(!(await c.avaliar("(() => { const p = document.querySelector('nextjs-portal'); const t = p?.shadowRoot?.textContent ?? ''; return /Unhandled|Runtime Error/.test(t); })()")), "nenhum erro de execução");
} catch (e) {
  conferir(false, "o roteiro terminou sem estourar", e.message?.slice(0, 200));
} finally {
  await c.fechar?.();
}

console.log(`\ncapturas em ${SAIDA}`);
console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
