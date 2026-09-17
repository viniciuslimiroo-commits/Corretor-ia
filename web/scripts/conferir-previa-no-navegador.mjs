// A PRÉVIA DE ÁUDIO no navegador de verdade (docs/planos/linha-do-tempo-spec.md, P4).
//
// O que o Node não alcança: o AudioContext sai de "suspended"? sai SOM do grafo? a busca
// cai no segundo certo do arquivo? uma URL quebrada vira aviso ou vira silêncio calado? um
// arquivo grande demais toca por elemento em vez de encher a memória?
//
// Dirige o Chrome instalado por CDP (o Node 24 já tem WebSocket), na bancada
// `app/dev/previa-audio`, com a tela em 375×812. Sem Puppeteer: uma dependência a mais pra
// abrir uma aba e ler cinco números não se paga.
//
// `--autoplay-policy=no-user-gesture-required` porque não há dedo nenhum aqui. O gesto de
// verdade (o dedo do dono no iPhone) é o teste F7; este mede o resto.
//
//   node scripts/conferir-previa-no-navegador.mjs [--porta 3104] [--ver]
//
// Não chama banco, storage nem IA: só a bancada local.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const argumentos = process.argv.slice(2);
const valor = (nome, padrao) => {
  const i = argumentos.indexOf(nome);
  return i >= 0 && argumentos[i + 1] ? argumentos[i + 1] : padrao;
};
const PORTA = Number(valor("--porta", "3104"));
const PORTA_CDP = Number(valor("--porta-cdp", "9333"));
const VER = argumentos.includes("--ver");
const ENDERECO = `http://localhost:${PORTA}/dev/previa-audio`;

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  path.join(os.homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
].filter(Boolean);
const chrome = CHROMES.find((c) => fs.existsSync(c));
if (!chrome) throw new Error(`Chrome não encontrado. Tentei: ${CHROMES.join(", ")}`);

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra !== "" ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP ----------

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "encena-previa-"));
const processo = spawn(
  chrome,
  [
    VER ? "--headless=false" : "--headless=new",
    `--remote-debugging-port=${PORTA_CDP}`,
    `--user-data-dir=${perfil}`,
    "--autoplay-policy=no-user-gesture-required",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-gpu",
    "--window-size=375,812",
    "about:blank",
  ].filter((a) => a !== "--headless=false"),
  { stdio: "ignore" },
);

function fechar() {
  try {
    processo.kill();
  } catch {
    // já morreu
  }
  try {
    fs.rmSync(perfil, { recursive: true, force: true });
  } catch {
    // o Chrome ainda segura um arquivo: o temp do sistema resolve depois
  }
}
process.on("exit", fechar);

async function esperarOChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA_CDP}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {
      // ainda subindo
    }
    await esperar(250);
  }
  throw new Error("o Chrome não abriu a porta de depuração");
}

const ws = new WebSocket(await esperarOChrome());
await new Promise((ok, falhou) => {
  ws.addEventListener("open", ok, { once: true });
  ws.addEventListener("error", () => falhou(new Error("não consegui falar com o Chrome")), { once: true });
});

let proximoId = 0;
const pendentes = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  const p = m.id && pendentes.get(m.id);
  if (!p) return;
  pendentes.delete(m.id);
  if (m.error) p.falhou(new Error(m.error.message));
  else p.ok(m.result);
});
const enviar = (method, params, sessionId) =>
  new Promise((ok, falhou) => {
    const id = ++proximoId;
    pendentes.set(id, { ok, falhou });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
const { sessionId } = await enviar("Target.attachToTarget", { targetId, flatten: true });
await enviar("Page.enable", {}, sessionId);
await enviar("Runtime.enable", {}, sessionId);
await enviar("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }, sessionId);

/**
 * Avalia uma expressão async na página e devolve o valor. `userGesture` libera o áudio.
 *
 * Dentro do corpo, `P()` devolve a bancada NA HORA. Guardar `const p = window.__encenaPrevia`
 * no começo de um bloco parece igual e não é: cada render do React troca o objeto, então um
 * `p` guardado antes de `cenario(...)` ou de `tocar(...)` lê os valores de antes da troca --
 * e o teste reprova (ou aprova) a versão errada.
 */
async function avaliar(corpo) {
  const expressao = `(async () => { const P = () => window.__encenaPrevia; ${corpo} })()`;
  const r = await enviar("Runtime.evaluate", { expression: expressao, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

await enviar("Page.navigate", { url: ENDERECO }, sessionId);
let pronta = false;
for (let i = 0; i < 80 && !pronta; i++) {
  await esperar(500);
  pronta = await avaliar("return !!window.__encenaPrevia;").catch(() => false);
}
if (!pronta) throw new Error(`a bancada não carregou em ${ENDERECO} -- o servidor de desenvolvimento está de pé?`);

// A tela é a do iPhone da spec, e o teste só vale nela.
const tela = await avaliar("return { l: innerWidth, a: innerHeight, rolagem: document.documentElement.scrollWidth };");
conferir(tela.l === 375 && tela.a === 812, "a bancada roda em 375×812", `${tela.l}×${tela.a}`);
conferir(tela.rolagem === 375, "sem rolagem lateral", String(tela.rolagem));

// ---------- 1. música: contexto, som e silêncio ----------

/** Espera a fonte sair de "carregando". A primeira decodificação de 45 s leva segundos, e
 *  em desenvolvimento o 404 do Next ainda compila a página de erro antes de responder. */
const esperarFonte = (chave, limite = 30000) =>
  avaliar(`
    const fim = Date.now() + ${limite};
    let e = P().estadoDaFonte(${JSON.stringify(chave)});
    while ((e === "carregando" || e === "ausente") && Date.now() < fim) {
      await new Promise(r => setTimeout(r, 200));
      e = P().estadoDaFonte(${JSON.stringify(chave)});
    }
    return e;
  `);

await avaliar("P().cenario('musica'); await new Promise(r => setTimeout(r, 300)); return 1;");
const estadoDaFaixa = await esperarFonte("musica/calma");
const duracao = await avaliar("return P().duracaoDe('musica/calma');");
conferir(estadoDaFaixa === "pronta", "a faixa do catálogo decodifica no navegador", estadoDaFaixa);
conferir(Math.abs((duracao ?? 0) - 45.013) < 0.05, "e a duração decodificada bate com a cópia de prévia", String(duracao));

// As leituras são guiadas pelo RELÓGIO DA PRÉVIA, não por `setTimeout`: o relógio já
// desconta a latência de saída, então "esperar 1 s" e "estar no segundo 1" são coisas
// diferentes -- em headless a latência medida passa de 0,2 s.
const medida = await avaliar(`
  P().tocar(0);
  const ler = () => ({ t: P().agora(), rms: P().rms(), estado: P().estadoDoContexto() });
  const ate = async (alvo) => { while (P().agora() < alvo) await new Promise(r => setTimeout(r, 20)); };
  const amostrar = async () => { const l = []; for (let i = 0; i < 8; i++) { l.push(ler()); await new Promise(r => setTimeout(r, 25)); } return l; };
  await ate(1);
  const fora = await amostrar();
  await ate(5);
  const dentro = await amostrar();
  const m = P().marcador();
  const agora = P().agora();
  const doContexto = P().tempoDoContexto();
  P().pausar();
  return { fora, dentro, estado: fora[0].estado, m, agora, doContexto };
`);
const rmsFora = Math.max(...medida.fora.map((x) => x.rms));
const rmsDentro = Math.max(...medida.dentro.map((x) => x.rms));
const tFora = medida.fora[0].t;
const tDentro = medida.dentro[0].t;
conferir(medida.estado === "running", "o contexto está tocando depois do Play", String(medida.estado));
conferir(tFora >= 1 && tFora < 1.4, "a primeira leitura é no segundo 1 do vídeo", tFora.toFixed(3));
conferir(tDentro >= 5 && tDentro < 5.4, "a segunda é no segundo 5, dentro da música", tDentro.toFixed(3));
conferir(rmsFora < 0.002, "em t = 1 (a música só entra em 2) o grafo está em silêncio", rmsFora.toFixed(5));
conferir(rmsDentro > 0.01, "em t = 5, dentro do trecho [2, 9), sai som", rmsDentro.toFixed(5));
conferir(rmsDentro > rmsFora * 20, "e a diferença entre os dois não é ruído", `${rmsDentro.toFixed(5)} contra ${rmsFora.toFixed(5)}`);

// A latência sai do relógio: `agora()` = t0 + (tempo do contexto − base) − latência.
if (!medida.m) {
  conferir(false, "o relógio desconta a latência da saída", "sem marcador: o contexto não existia no Play");
} else {
  const semDescontar = medida.m.t0 + (medida.doContexto - medida.m.base);
  const descontado = semDescontar - medida.m.latencia;
  conferir(Math.abs(medida.agora - descontado) < 0.02, "o relógio desconta a latência da saída", `latência ${medida.m.latencia.toFixed(4)} s · agora ${medida.agora.toFixed(4)} · sem descontar ${semDescontar.toFixed(4)}`);
}

// ---------- 2. busca ----------

const busca = await avaliar(`
  P().tocar(0);
  await new Promise(r => setTimeout(r, 400));
  P().buscar(6);
  const imediato = P().agora();
  const marco = performance.now();
  await new Promise(r => setTimeout(r, 600));
  const t = P().agora();
  const decorrido = (performance.now() - marco) / 1000;
  const agenda = P().agenda(6);
  P().pausar();
  return { agenda, imediato, t, decorrido };
`);
const trecho = busca.agenda[0];
conferir(Math.abs(busca.imediato - 6) < 0.001, "buscar 6 s põe o cabeçote em 6 s na hora", busca.imediato.toFixed(4));
// Buscar tocando PARA o som e remonta a agenda 60 ms depois, com 50 ms de folga -- então o
// cabeçote fica parado esse tanto e depois anda junto com o som de novo. O que o teste
// exige é que ele nunca ande pra trás, nunca corra na frente do relógio de parede, e que o
// custo do reagendamento caiba numa fração de segundo.
const atraso = 6 + busca.decorrido - busca.t;
conferir(busca.t >= 6 && atraso >= 0 && atraso < 0.25, "e continua de lá, sem pulo e sem andar pra trás", `${busca.t.toFixed(3)} · o reagendamento custou ${atraso.toFixed(3)} s`);
conferir(!!trecho && Math.abs(trecho.offset - (10 + (6 - 2))) < 0.1, "o trecho parte do segundo corte + (t − noVideo) = 14 do arquivo", String(trecho?.offset));
conferir(!!trecho && Math.abs(trecho.atraso) < 0.001, "sem atraso: a música já está tocando em 6 s", String(trecho?.atraso));

// ---------- 3. URL quebrada ----------

await avaliar("P().cenario('url-ruim'); await new Promise(r => setTimeout(r, 300)); return 1;");
const estadoRuim = await esperarFonte("musica/nao-existe");
const ruim = await avaliar("return { semSom: P().semSom(), avisos: P().avisos() };");
conferir(estadoRuim === "falhou", "URL quebrada termina em 'falhou', não em 'carregando' pra sempre", estadoRuim);
conferir(ruim.semSom.includes("musica/nao-existe"), "e marca o bloco como sem som", JSON.stringify(ruim.semSom));
conferir(ruim.avisos.some((a) => a.motivo === "decodificar"), "e conta um aviso de decodificação (o contador do resumo)", JSON.stringify(ruim.avisos));

// ---------- 4. arquivo grande: modo elemento ----------

await avaliar("P().cenario('elemento'); await new Promise(r => setTimeout(r, 300)); return 1;");
const estadoGrande = await esperarFonte("voce/grande");
const elemento = await avaliar(`
  P().tocar(0);
  while (P().agora() < 5) await new Promise(r => setTimeout(r, 20));
  const rms = P().rms();
  const videos = document.querySelectorAll('video').length;
  const tocandoElemento = [...document.querySelectorAll('video')].some(v => !v.paused);
  P().pausar();
  return { rms, videos, tocandoElemento };
`);
conferir(estadoGrande === "elemento", "acima de 25 MB a fonte não é decodificada: vira modo elemento", estadoGrande);
conferir(elemento.videos >= 1, "um <video> escondido entra no grafo", String(elemento.videos));
conferir(elemento.tocandoElemento, "e ele está tocando dentro da janela");
conferir(elemento.rms > 0.005, "sai som pelo MediaElementAudioSourceNode", elemento.rms.toFixed(5));

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
ws.close();
fechar();
process.exit(falhas ? 1 : 0);
