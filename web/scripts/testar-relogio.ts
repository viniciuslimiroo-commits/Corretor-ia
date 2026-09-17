// O RELÓGIO DO VÍDEO e os comandos da montagem (fase 1 da linha do tempo).
//
//   1. relógio x conta antiga: em 300 vídeos sorteados (passando pelo saneador), o total
//      é o mesmo da `duracaoEstimada` de antes, e cada clipe começa no quadro em que o
//      xfade o põe (offset com 2 casas, arredondado PRA CIMA ao quadro);
//   2. comandos do ffmpeg x os de ANTES (scripts/fixtures/args-antes.json, gravado antes
//      da mudança): o que não é conserto sai idêntico; o que é conserto muda SÓ no que foi
//      consertado -- e a diferença é descrita aqui, não aceita no atacado.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-relogio.ts

import fs from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

process.env.FFMPEG_PATH ??= ffmpegStatic as unknown as string;
const { FPS, LIMITES, TRANSICOES, duracaoDaCena, emendasDoVideo, limparEspec, relogioDoEspec, precisaDoEditor } = await import("../src/lib/video.ts");
const { casosDeArgs } = await import("./fixtures/casos-de-args.ts");

const RAIZ = path.resolve(import.meta.dirname, "..");
let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---------- 1. relógio ----------
{
  // Sorteio determinístico: o mesmo conjunto a cada execução.
  let semente = 20260917;
  const acaso = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const escolher = <T,>(l: T[]) => l[Math.floor(acaso() * l.length)];
  let totaisIguais = 0;
  let iniciosCertos = 0;
  let casos = 0;
  const erros: string[] = [];
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(acaso() * 12);
    const cenas = Array.from({ length: n }, () => {
      const tipo = escolher(["foto", "foto", "foto", "animada", "tour360"]);
      const duracao = tipo === "tour360" ? escolher([4, 6, 8, 10]) : tipo === "animada" ? escolher([3, 4, 5]) : escolher([3, 4, 5, 6, 8]);
      return { tipo, jobId: "00000000-0000-0000-0000-000000000000", ...(tipo === "tour360" ? { arquivo: "uploads/teste/p360.jpg" } : {}), duracao, ...(acaso() < 0.4 ? { transicao: escolher(TRANSICOES.map((t) => t.id)) } : {}) };
    });
    const bruto = { formato: "9:16", cenas, transicao: escolher(TRANSICOES.map((t) => t.id)), telaFinal: acaso() < 0.5 };
    const { espec } = limparEspec(bruto);
    if (!espec) continue;
    casos++;
    // A conta ANTIGA, reescrita aqui como era (soma das cenas + tela final − emendas).
    const antigo = Math.max(0, espec.cenas.reduce((s, c) => s + duracaoDaCena(c), 0) + (espec.telaFinal ? LIMITES.telaFinalSegundos : 0) - emendasDoVideo(espec).reduce((s, t) => s + t.segundos, 0));
    const r = relogioDoEspec(espec);
    if (Math.abs(r.total - antigo) <= 0.001) totaisIguais++;
    else erros.push(`total ${r.total} x ${antigo}`);
    // Início de cada clipe: ceil(offset·FPS)/FPS, com o offset que o ffmpeg recebe.
    const d = [...espec.cenas.map(duracaoDaCena), ...(espec.telaFinal ? [LIMITES.telaFinalSegundos] : [])];
    const em = emendasDoVideo(espec);
    let acc = 0;
    let certo = true;
    for (let k = 0; k < d.length; k++) {
      if (k > 0) acc += d[k - 1] - em[k - 1].segundos;
      const esperado = k === 0 ? 0 : Math.ceil(Number(acc.toFixed(2)) * FPS - 1e-6) / FPS;
      if (Math.abs(r.clipes[k].inicio - esperado) > 1e-9) certo = false;
      if (r.clipes[k].inicio > acc + 1 / FPS + 1e-9 || r.clipes[k].inicio < acc - 0.006) certo = false;
    }
    if (r.emendas.length !== Math.max(0, d.length - 1)) certo = false;
    if (certo) iniciosCertos++;
  }
  conferir(casos >= 290, "300 vídeos sorteados passam pelo saneador", `${casos}`);
  conferir(totaisIguais === casos, "o total do relógio é o mesmo da conta antiga (±0,001s)", erros.slice(0, 3).join(" | ") || `${totaisIguais}/${casos}`);
  conferir(iniciosCertos === casos, "cada clipe começa no quadro em que o xfade o põe", `${iniciosCertos}/${casos}`);

  const r2 = relogioDoEspec({ cenas: [{ tipo: "foto", duracao: 4 }, { tipo: "foto", duracao: 4 }], transicao: "dissolver", telaFinal: true } as never);
  conferir(Math.abs(r2.total - (4 + 4 + LIMITES.telaFinalSegundos - 1.2)) < 1e-9 && r2.clipes[1].inicio === Math.ceil(3.4 * FPS - 1e-6) / FPS && r2.fimDasCenas === r2.clipes[1].fim, "caso à mão: 4s + 4s + tela final com dissolver", JSON.stringify(r2.clipes));
}

// ---------- 2. precisa do editor ----------
{
  const simples = { formato: "9:16", cenas: [{ tipo: "foto", duracao: 4 }], musica: "calma", transicao: "dissolver", telaFinal: true } as never;
  conferir(!precisaDoEditor(simples), "vídeo da página rápida não é mandado pro editor");
  conferir(precisaDoEditor({ ...(simples as object), cenas: [{ tipo: "foto", duracao: 4, textos: [{ texto: "UAU" }] }] } as never), "vídeo com texto na cena vai pro editor");
  conferir(precisaDoEditor({ ...(simples as object), apresentador: { arquivo: "x", formato: "circulo" } } as never), "vídeo com o Você vai pro editor");
}

// ---------- 3. comandos do ffmpeg x antes ----------
{
  const antes = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "fixtures", "args-antes.json"), "utf8")) as Record<string, string[]>;
  const depois = casosDeArgs();
  const CONSERTOS = new Set(["montagem_efeito_sem_musica", "montagem_voce_circulo_entra_tarde", "montagem_voce_rodape_do_inicio", "cena_clipe_textos", "cena_antes_depois_textos", "cena_360_textos"]);
  for (const nome of Object.keys(antes)) {
    const a = antes[nome];
    const d = depois[nome];
    if (!CONSERTOS.has(nome)) {
      conferir(JSON.stringify(a) === JSON.stringify(d), `sem mudança: ${nome}`);
      continue;
    }
    // Conserto: tira do DEPOIS exatamente o que o conserto põe; tem que sobrar o ANTES.
    //
    // Fase 2 (áudio do Você que entra com `inicio` > 0, spec B3): o som dele passou a vir
    // de uma entrada SEPARADA, sem `-ss`, e por outra cadeia. Desfazer = tirar do depois a
    // entrada repetida e apagar dos dois lados o trecho `[N:a]…[voz1]` inteiro.
    let arrA = a;
    let arrD = d;
    {
      const i = arrD.lastIndexOf("-i");
      if (i >= 0 && i + 1 < arrD.length && arrD.slice(0, i).includes(arrD[i + 1])) {
        arrD = [...arrD.slice(0, i), ...arrD.slice(i + 2)];
        const semVoz1 = (args: string[]) => args.map((x) => x.replace(/;\[\d+:a\][^;]*\[voz1\]/, ""));
        arrA = semVoz1(arrA);
        arrD = semVoz1(arrD);
      }
    }
    let desfeito = JSON.stringify(arrD);
    if (nome.startsWith("montagem_voce")) {
      desfeito = desfeito.replace(/setpts=PTS-STARTPTS\+[\d.]+\/TB/g, "setpts=PTS-STARTPTS").replace(/overlay=([^"]*?):eof_action=pass:/g, "overlay=$1:");
    }
    if (nome === "montagem_efeito_sem_musica") {
      desfeito = desfeito.replace(/;anullsrc=r=48000:cl=stereo,atrim=0:[\d.]+\[silencio\]/, "").replace("[silencio][ef0]", "[ef0]").replace("amix=inputs=3", "amix=inputs=2");
    }
    if (nome.startsWith("cena_")) {
      // "só no fim" aos 62% da duração da cena, e não de 4s: 8s → 4.96; 6s → 3.72.
      const dur = nome === "cena_antes_depois_textos" ? 6 : 8;
      desfeito = desfeito.split(`gte(t\\\\,${(dur * 0.62).toFixed(2)})`).join(`gte(t\\\\,${(4 * 0.62).toFixed(2)})`);
    }
    const igual = desfeito === JSON.stringify(arrA);
    conferir(igual && JSON.stringify(d) !== JSON.stringify(a), `conserto só onde devia: ${nome}`, igual ? "" : primeiraDiferenca(JSON.stringify(arrA), desfeito));
  }
}

function primeiraDiferenca(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `antes …${a.slice(Math.max(0, i - 60), i + 60)}… | depois …${b.slice(Math.max(0, i - 60), i + 60)}…`;
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
