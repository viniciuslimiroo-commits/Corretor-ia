// SAI SOM NO PRIMEIRO PLAY? (defeito de 20/09/2026, relatado pelo dono: "coloco um áudio,
// aperto play e não escuto nada".)
//
// Por que este roteiro existe além de `conferir-previa-no-navegador.mjs`: aquele roda o
// Chrome com `--autoplay-policy=no-user-gesture-required`, então lá o AudioContext já nasce
// tocando e o caminho que quebrava -- esperar o DISPOSITIVO de áudio abrir depois do gesto
// -- nunca acontece. Aqui é o contrário: nada de flag, a montagem toda por clique de
// PROGRAMA (que não conta como gesto e deixa o áudio fechado) e o Play como PRIMEIRO toque
// de verdade. Foi assim que o defeito apareceu: o motor desistia em 300 ms, parava o que
// tinha agendado e tocava mudo, com o cabeçote andando.
//
// Mede SOM, não intenção: um analisador entra em tudo que chega ao destino do contexto e o
// teste lê o nível (RMS). Não gera vídeo, não gasta crédito, não escreve no banco.
//
// O que este roteiro NÃO garante: o defeito só aparece quando o aparelho demora a abrir o
// áudio. Medido em 20/09/2026, com a placa "fria": 1019, 974 e 1028 ms -- e o Play saía
// mudo. Depois de meia dúzia de rodadas seguidas, o Windows devolvia o dispositivo em
// ~70 ms e o mesmo código passava. Tentar forçar a lentidão atrasando o `resume` não
// funciona: o navegador destrava o áudio pelo GESTO, sem esperar a nossa chamada. Então a
// regra em si (esperar o estado do contexto em vez de desistir em 300 ms) está presa no
// `scripts/testar-previa-audio.ts`, que lê o código; aqui fica a prova de que sai som.
//
//   BASE=http://localhost:3002 node scripts/conferir-som-do-play.mjs [--celular]

import fs from "node:fs";
import path from "node:path";
import { abrirChrome, esperar } from "./chrome-cdp.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const CELULAR = process.argv.includes("--celular");
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const REF = new URL(SUPA).hostname.split(".")[0];
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
/** Nível acima disto é som de verdade; o silêncio absoluto do grafo mede 0,00000. */
const SOM = 0.005;

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---- o grampo: um analisador em tudo que chega ao destino do contexto ----
function grampo() {
  window.__som = { contextos: [] };
  const Ctx = window.AudioContext;
  if (!Ctx) return;
  window.AudioContext = class extends Ctx {
    constructor(...a) {
      super(...a);
      const an = super.createAnalyser();
      an.fftSize = 2048;
      an.connect(super.destination);
      this.__analisador = an;
      window.__som.contextos.push(this);
    }
  };
  const connectOriginal = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destino, ...resto) {
    try {
      const c = this.context;
      if (c && c.__analisador && destino === c.destination) connectOriginal.call(this, c.__analisador);
    } catch {
      /* grafo fora do padrão: o teste mede o que der */
    }
    return connectOriginal.call(this, destino, ...resto);
  };
}

function medir() {
  const ctx = (window.__som?.contextos ?? []).filter((c) => c.state !== "closed").at(-1);
  const area = document.querySelector('[data-area="linha"]');
  const comum = {
    play: area?.querySelector('button[aria-label="Tocar"], button[aria-label="Pausar"]')?.getAttribute("aria-label") ?? "?",
    relogio: (area?.innerText.match(/\d+:\d\d[.,]\d/) ?? ["?"])[0],
    aviso: ["Prévia sem som", "não carregou", "sem o som do Você"].find((t) => document.body.innerText.includes(t)) ?? null,
  };
  if (!ctx) return { ...comum, estado: "sem contexto", nivel: 0 };
  const dados = new Float32Array(ctx.__analisador.fftSize);
  ctx.__analisador.getFloatTimeDomainData(dados);
  let soma = 0;
  for (const v of dados) soma += v * v;
  return { ...comum, estado: ctx.state, nivel: Math.round(Math.sqrt(soma / dados.length) * 10000) / 10000 };
}

const r0 = await fetch(`${BASE}/login`).catch(() => null);
if (!r0 || !r0.ok) {
  console.log(`o servidor ${BASE} não respondeu; nada foi feito`);
  process.exit(1);
}

const c = await abrirChrome();
await c.cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(${grampo.toString()})(); document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{visibility:hidden!important}'; document.head.appendChild(st); });` });

const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const user = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${p.get("access_token")}` } }).then((x) => x.json());
const sessao = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };

const tela = CELULAR ? { largura: 375, altura: 812, celular: true } : { largura: 1280, altura: 900 };
/** Toque de gente: é ele que libera o áudio no navegador. */
async function tocarNaTela(seletor) {
  const r = await c.avaliar(`(() => { const e = ${seletor}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!r) return false;
  if (CELULAR) {
    await c.cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y, id: 0, radiusX: 4, radiusY: 4, force: 1 }] });
    await esperar(60);
    await c.cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await c.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", buttons: 1, clickCount: 1 });
    await c.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
  }
  await esperar(400);
  return true;
}

try {
  await c.abrir(`${BASE}/login`, tela);
  await c.avaliar(`localStorage.setItem("sb-${REF}-auth-token", ${JSON.stringify(JSON.stringify(sessao))})`);
  await c.abrir(`${BASE}/editor/video`, { ...tela, pronto: "!!document.querySelector('[data-editor]')" });
  await esperar(1500);

  // Montagem por clique de PROGRAMA: não conta como gesto, então o áudio continua fechado.
  // No celular a mídia mora na folha, que abre pela aba -- e abrir a aba também é clique de
  // programa, senão o teste gastaria o "primeiro toque" antes do Play. Só clica se a lista
  // não estiver à vista: no computador a aba já está aberta e o clique FECHARIA o painel.
  if (!(await c.avaliar("!!document.querySelector('select')"))) {
    await c.avaliar("[...document.querySelectorAll('nav button, [data-trilho] button, aside button')].find(b => /Mídia/.test(b.innerText))?.click()");
    await esperar(800);
  }
  for (let i = 0; i < 40 && !(await c.avaliar("[...document.querySelectorAll('select option')].some(o => /^[0-9a-f-]{36}$/.test(o.value))")); i++) await esperar(300);
  const ids = await c.avaliar("(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /^[0-9a-f-]{36}$/.test(o.value))); return s ? [...s.options].map(o => o.value).filter(v => /^[0-9a-f-]{36}$/.test(v)) : []; })()");
  for (const id of ids) {
    await c.avaliar(`(() => { const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === ${JSON.stringify(id)})); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await esperar(1200);
    if (await c.avaliar("document.querySelectorAll('button[title*=\"clique pra pôr no fim\"]').length >= 2")) break;
  }
  const fotos = await c.avaliar("(() => { const b = [...document.querySelectorAll('button[title*=\"clique pra pôr no fim\"]')].slice(0, 2); b.forEach(x => x.click()); return b.length; })()");
  conferir(fotos >= 1, "duas fotos entram na linha do tempo", `${fotos}`);
  await esperar(1200);
  await c.avaliar("[...document.querySelectorAll('nav button, [data-trilho] button, aside button')].find(b => /Áudio/.test(b.innerText))?.click()");
  await esperar(900);
  const musica = await c.avaliar("(() => { const b = [...document.querySelectorAll('button')].find(x => x.previousElementSibling && (x.previousElementSibling.getAttribute('aria-label') || '').startsWith('Ouvir')); if (!b) return null; const nome = b.innerText.trim().split('\\n')[0]; b.click(); return nome; })()");
  conferir(!!musica, "uma música da biblioteca entra no vídeo", musica ?? "não achei a lista");
  await esperar(1800);

  const antes = await c.avaliar(`(${medir.toString()})()`);
  conferir(antes.estado === "suspended", "antes do primeiro toque o áudio está fechado (é o caso da vida real)", antes.estado);
  conferir(antes.nivel < SOM, "e não sai som nenhum", `nível ${antes.nivel}`);

  // O PLAY é o primeiro toque de verdade da pessoa.
  conferir(await tocarNaTela(`document.querySelector('[data-area="linha"] button[aria-label="Tocar"]')`), "o Play da linha do tempo responde ao toque");
  let pico = 0;
  let andou = null;
  const amostras = [];
  for (let i = 0; i < 10; i++) {
    await esperar(400);
    const m = await c.avaliar(`(${medir.toString()})()`);
    amostras.push(m);
    pico = Math.max(pico, m.nivel);
    if (m.relogio !== antes.relogio) andou = m.relogio;
  }
  const ultima = amostras.at(-1);
  conferir(pico > SOM, "NO PRIMEIRO PLAY sai som", `pico ${pico} (antes ${antes.relogio}, depois ${ultima.relogio})`);
  conferir(!ultima.aviso, "e sem o aviso de prévia muda", ultima.aviso ?? "nenhum");
  conferir(!!andou, "o cabeçote anda junto com o som", andou ?? "parado");
  conferir(ultima.play === "Pausar", "o botão vira Pausar enquanto toca", ultima.play);

  // Pausar e tocar de novo continua com som (o caminho que já funcionava).
  await tocarNaTela(`document.querySelector('[data-area="linha"] button[aria-label="Pausar"]')`);
  await esperar(500);
  const pausado = await c.avaliar(`(${medir.toString()})()`);
  conferir(pausado.nivel < SOM, "pausar cala o som na hora", `nível ${pausado.nivel}`);
  await tocarNaTela(`document.querySelector('[data-area="linha"] button[aria-label="Tocar"]')`);
  let pico2 = 0;
  for (let i = 0; i < 5; i++) {
    await esperar(400);
    pico2 = Math.max(pico2, (await c.avaliar(`(${medir.toString()})()`)).nivel);
  }
  conferir(pico2 > SOM, "e o segundo Play também toca", `pico ${pico2}`);
} catch (e) {
  conferir(false, "o roteiro chegou ao fim", e.message);
} finally {
  c.fechar();
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
