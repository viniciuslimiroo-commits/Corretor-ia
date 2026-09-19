// A BIBLIOTECA DA LINHA DO TEMPO (lib/linha-do-tempo.ts; docs/planos/linha-do-tempo-spec.md,
// seção C e invariantes I2, I6, I7; pacote P3).
//
//   I2  ida e volta: espec -> estado -> espec -> saneador devolve o mesmo espec, em toda
//       fixture de scripts/fixtures/especs-linha.ts;
//   I6  a voz de IA só volta com `arquivo` (reaproveitada, sem cobrar) com o MESMO roteiro e voz;
//   I7  o que se vê é o que sai: 2000 sequências sorteadas de gestos; depois de salvar,
//       sanear e reabrir, cada bloco está no mesmo lugar (±0,01s; Você ±0,1s), nenhuma
//       faixa se sobrepõe, nada sai de [0, total], e o saneador não descarta nada;
//   e as tabelas de cada gesto por tipo (mover, encaixe, vizinhos, "até o fim" que volta,
//   deslizar o trecho, arredondamento do Você, legenda que muda de índice), dividir com id
//   de fora, apagar voz com as legendas de dentro, campo extra da cena que atravessa tudo,
//   legendas da transcrição em dois pedaços, texto entre fotos, a barra em 6 posições do
//   cursor e durante a geração, qual faixa abre e o zoom de ajustar.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-linha-gestos.ts
//
// Não toca banco, rede, nem API paga: é só conta.

import { deepStrictEqual } from "node:assert";
import { LIMITES, limparEspec, relogioDoEspec, type EspecVideo, type ItemAudio, type Legendas } from "../src/lib/video.ts";
import * as L from "../src/lib/linha-do-tempo.ts";
import { ESPECS_ANTIGAS } from "./fixtures/especs-antigas.ts";
import { ESPECS_LINHA, ESPECS_V2 } from "./fixtures/especs-linha.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const igual = (a: unknown, b: unknown) => {
  try {
    deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    return true;
  } catch {
    return false;
  }
};
const perto = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

function saneado(bruto: unknown): EspecVideo {
  const r = limparEspec(bruto);
  if (!r.espec) throw new Error(`fixture recusada: ${r.erro}`);
  return r.espec;
}

/** Cena com campos que só o editor conhece: têm que atravessar qualquer operação. */
type CenaT = L.CenaBase & { miniatura: string; rotulo: string; animacaoGuardada: null };
const VOZ_CONHECIDA: L.Medidas = { segundosDaVoz: 9.4, vozEstimada: false, segundosEstimadosDaVoz: 7, segundosDoVoce: 12.3 };

function ctxDe(e: EspecVideo, medidas: L.Medidas = VOZ_CONHECIDA): L.Ctx<CenaT> {
  const s = L.estadoDoEspec(e, e.cenas.map((_, i) => `k${i}`));
  const cenas: CenaT[] = s.cenas.map((c, i) => ({ ...c, miniatura: `/exemplos/${i}.jpg`, rotulo: `Foto ${i + 1}`, animacaoGuardada: null }));
  return L.ctxDoEstado({ ...s, cenas }, medidas);
}
const comEstado = (ctx: L.Ctx<CenaT>, estado: L.EstadoLinha<CenaT>) => L.ctxDoEstado(estado, ctx.medidas);
const extrasVivos = (s: L.EstadoLinha<CenaT>) => s.cenas.every((c) => c.miniatura.startsWith("/exemplos/") && c.rotulo.startsWith("Foto ") && c.animacaoGuardada === null);
const musicas = (s: L.EstadoLinha<CenaT>) => L.audiosEfetivos(s.audios, s.narracao).filter((a) => a.fonte.tipo === "musica");
const vozes = (s: L.EstadoLinha<CenaT>) => L.audiosEfetivos(s.audios, s.narracao).filter((a) => a.fonte.tipo === "voz");
const bloco = (ctx: L.Ctx<CenaT>, ref: L.RefItem) => {
  const f = L.blocosDoEstado(ctx);
  return f.trilhas[L.trilhaDoRef(ref)].find((b) => L.mesmoRef(b.ref, ref) || b.itens?.some((i) => L.mesmoRef(i, ref)));
};
let extrasOk = true;
const olhar = <T extends { estado: L.EstadoLinha<CenaT> }>(r: T) => {
  if (!extrasVivos(r.estado)) extrasOk = false;
  return r;
};

// ---------- I2: ida e volta em todas as fixtures ----------
{
  let n = 0;
  const erradas: string[] = [];
  for (const [nome, bruto] of Object.entries(ESPECS_LINHA)) {
    const r = limparEspec(bruto);
    if (!r.espec) continue;
    n++;
    const S = r.espec;
    const volta = limparEspec(L.especDoEstado(S, L.estadoDoEspec(S)));
    if (!volta.espec || !igual(volta.espec, S) || volta.avisos.length) erradas.push(nome);
  }
  conferir(n >= 30 && erradas.length === 0, "I2 · espec -> estado -> espec -> saneador devolve o mesmo espec", `${n} fixtures${erradas.length ? " · erradas: " + erradas.join(", ") : ""}`);
}

// ---------- I6: reaproveitar a voz de IA ----------
{
  const guardada = { caminho: "uploads/7c2e9f4a-3b6d-4d1e-8a5f-1e0b9c7d2a64/voz-2b9e7c41-0d3a-4f68-9a15-c7e2d8b4f309.mp3", roteiro: "Casa com quintal e piscina.", voz: "laura" as const };
  const ia = { origem: "ia" as const, roteiro: "Casa com quintal e piscina.", voz: "laura" as const };
  conferir(L.narracaoComReuso(ia, guardada)?.arquivo === guardada.caminho, "I6 · mesmo roteiro e mesma voz: a voz gravada volta (sem TTS, sem crédito)");
  conferir(L.narracaoComReuso({ ...ia, roteiro: ia.roteiro + " Agende." }, guardada)?.arquivo === undefined, "I6 · roteiro mudou: voz nova");
  conferir(L.narracaoComReuso({ ...ia, voz: "daniel" }, guardada)?.arquivo === undefined, "I6 · voz mudou: voz nova");
  conferir(L.narracaoComReuso({ origem: "gravada", arquivo: "uploads/x/y.webm" }, guardada)?.arquivo === "uploads/x/y.webm", "I6 · voz gravada não é tocada");
  conferir(L.narracaoComReuso(ia, null) === ia && L.narracaoComReuso(null, guardada) === null, "I6 · sem guardada, ou sem narração, nada muda");
}

// ---------- blocos ----------
const E = saneado(ESPECS_ANTIGAS.voz_gravada_volume_2); // música aconchego + voz gravada em 1,5s
const base = ctxDe(E);
const total = base.relogio.total;
{
  const f = L.blocosDoEstado(base);
  const m = f.trilhas.musica[0];
  const z = f.trilhas.voz[0];
  conferir(f.trilhas.cenas.length === E.cenas.length + (E.telaFinal ? 1 : 0), "blocos · uma cena por foto, mais a tela final", `${f.trilhas.cenas.length}`);
  conferir(f.trilhas.cenas.every((b, i, l) => i === 0 || perto(b.de, l[i - 1].ate, 1e-9)) && perto(f.trilhas.cenas.at(-1)!.ate, total, 1e-9), "blocos · as cenas cobrem o vídeo sem buraco");
  conferir(m.de === 0 && perto(m.ate, total, 1e-9) && m.onda?.laco === true && m.onda.musica === "aconchego", "blocos · música do formato antigo: do 0 ao fim, em laço, com onda", `${m.de}-${m.ate}`);
  conferir(z.de === 1.5 && perto(z.ate, Math.min(total, 1.5 + 9.4)) && !z.estimado && z.alcas.inicio, "blocos · voz gravada em 1,5s com a duração do arquivo", `${z.de}-${z.ate}`);
  const ia = L.blocosDoEstado(ctxDe(saneado(ESPECS_ANTIGAS.voce_circulo_entra_6_8_inicio_1), { ...VOZ_CONHECIDA, vozEstimada: true, segundosEstimadosDaVoz: 6.9 }));
  conferir(ia.trilhas.voz[0]?.estimado === true && !ia.trilhas.voz[0].alcas.inicio && perto(ia.trilhas.voz[0].ate - ia.trilhas.voz[0].de, 6.9), "blocos · voz de IA não gerada: tamanho estimado e sem alças");
  conferir(ia.trilhas.voce[0]?.de === 6.8 && perto(ia.trilhas.voce[0].ate, Math.min(ia.total, 6.8 + 11.3)), "blocos · Você entra em 6,8s e dura o arquivo menos o início aparado", `${ia.trilhas.voce[0]?.de}-${ia.trilhas.voce[0]?.ate}`);
  const leg = L.blocosDoEstado(ctxDe(saneado(ESPECS_ANTIGAS.legendas_40)));
  conferir(leg.trilhas.legendas.length === 40 && leg.trilhas.legendas.every((b) => b.movel && !b.alcas.inicio), "blocos · 40 legendas, móveis, sem alças");
  const efeito = L.blocosDoEstado(ctxDe(saneado(ESPECS_ANTIGAS.efeito_clique_sem_musica_sem_voz)));
  conferir(efeito.marcasDeEfeito.length === efeito.trilhas.cenas.length - 1 && efeito.trilhas.musica.length === 0, "blocos · som de virada vira marca em cada emenda, não bloco", `${efeito.marcasDeEfeito.length} marcas`);
  const comTexto = ctxDe(E);
  const cenas = comTexto.estado.cenas.map((c, i) => (i === 1 ? { ...c, legenda: "Sala", textos: [{ texto: "VENDIDO" }] } : c));
  const ft = L.blocosDoEstado(comEstado(comTexto, { ...comTexto.estado, cenas, titulo: "Apartamento 302" }));
  const grupo = ft.trilhas.textos.find((b) => b.preso && (b.ref as { chave: string }).chave === cenas[1].chave);
  conferir(!!grupo && grupo.contagem === 2 && (grupo.itens?.[0] as { indice: number }).indice === -1, "blocos · textos da foto viram UM bloco preso, legenda primeiro");
  conferir(ft.trilhas.textos.some((b) => b.fina && b.ref.faixa === "titulo" && b.de === 0), "blocos · título como faixa fina no alto");
}

// ---------- música: gestos ----------
const M: L.RefItem = { faixa: "musica", id: "musica00" };
{
  const r0 = L.aplicarGesto(base, M, { tipo: "mover", delta: 3 }, null);
  conferir(!r0.mudou && r0.de === 0, "música · até o fim do vídeo não anda pra direita (não há pra onde)");
  const r1 = olhar(L.aplicarGesto(base, M, { tipo: "aparaInicio", para: 2 }, null));
  conferir(r1.de === 2 && r1.corte === 2 && musicas(r1.estado)[0].duracao === undefined && perto(r1.ate, total, 1e-9), "música · aparar o início anda o corte junto e continua até o fim", `${r1.de} corte ${r1.corte}`);
  const r2 = olhar(L.aplicarGesto(base, M, { tipo: "aparaFim", para: total - 3 }, null));
  conferir(perto(r2.ate, total - 3) && musicas(r2.estado)[0].duracao !== undefined, "música · aparar o fim fixa a duração", `${r2.ate}`);
  const c2 = comEstado(base, r2.estado);
  const r3 = olhar(L.aplicarGesto(c2, M, { tipo: "aparaFim", para: total + 5 }, null));
  conferir(perto(r3.ate, total, 1e-9) && musicas(r3.estado)[0].duracao === undefined, "música em laço · puxar o fim até o fim do vídeo volta a ser \"até o fim\"");
  // Encaixe: com a música de 0 a total-3, mover 2,37s com um ponto em 2,4 gruda a borda.
  const r4 = L.aplicarGesto(c2, M, { tipo: "mover", delta: 2.37 }, { pontos: [2.4], limiarSeg: 0.1 });
  conferir(r4.de === 2.4 && r4.guia === 2.4, "música · o arraste gruda no ponto mais perto e mostra a guia", `${r4.de} guia ${r4.guia}`);
  const r5 = L.aplicarGesto(c2, M, { tipo: "mover", delta: 2.37 }, { pontos: [2.4], limiarSeg: 0.01 });
  conferir(r5.de === 2.37 && r5.guia === null, "música · longe do ponto não gruda");
  const r5b = L.aplicarGesto(c2, M, { tipo: "mover", delta: 1 }, { pontos: [total - 1.95], limiarSeg: 0.1 });
  conferir(r5b.guia === total - 1.95 || perto(r5b.ate, total - 1.95), "música · a borda do FIM também gruda", `${r5b.de}-${r5b.ate}`);
  // Deslizar o trecho (laço): o corte vai de 0 a seg − 0,01, o lugar e a duração ficam.
  const d1 = L.aplicarGesto(c2, M, { tipo: "deslizarTrecho", delta: -10 }, null);
  const d2 = L.aplicarGesto(c2, M, { tipo: "deslizarTrecho", delta: 5 }, null);
  const d3 = L.aplicarGesto(c2, M, { tipo: "deslizarTrecho", delta: -100 }, null);
  conferir(d1.corte === 10 && d1.de === 0 && perto(d1.ate, r2.ate), "música · deslizar a onda muda só o trecho do arquivo", `corte ${d1.corte}`);
  conferir(d2.corte === 0 && !d2.mudou, "música · o trecho não passa do começo do arquivo");
  conferir(d3.corte === 44.99, "música em laço · o trecho vai até o fim do arquivo menos 0,01", `${d3.corte}`);
}
// Música SEM laço, perto do fim do arquivo (45,003s): "até o fim" é até o fim do ARQUIVO.
{
  const item: ItemAudio = { id: "semlaco1", fonte: { tipo: "musica", id: "calma" }, noVideo: 0, corteArquivo: 40, volume: 0.8, fadeEntrada: 0, fadeSaida: 0, laco: false };
  const ctx = comEstado(base, { ...base.estado, audios: [item, ...vozes(base.estado)] });
  const ref: L.RefItem = { faixa: "musica", id: "semlaco1" };
  conferir(perto(bloco(ctx, ref)!.ate, 5.003, 0.001), "música sem laço · acaba onde o arquivo acaba", `${bloco(ctx, ref)!.ate}`);
  const a = L.aplicarGesto(ctx, ref, { tipo: "aparaFim", para: 10 }, null);
  conferir(a.parouNaBorda && musicas(a.estado).find((x) => x.id === "semlaco1")!.duracao === undefined, "música sem laço · puxar além do fim do arquivo para na borda e continua \"até o fim\"");
  const b = L.aplicarGesto(ctx, ref, { tipo: "aparaFim", para: 3 }, null);
  const b2 = L.aplicarGesto(comEstado(ctx, b.estado), ref, { tipo: "aparaFim", para: 6 }, null);
  conferir(musicas(b.estado).find((x) => x.id === "semlaco1")!.duracao === 3 && musicas(b2.estado).find((x) => x.id === "semlaco1")!.duracao === undefined, "música sem laço · cortar e devolver o fim restaura a forma sem duração");
  const d = L.aplicarGesto(ctx, ref, { tipo: "deslizarTrecho", delta: 10 }, null);
  const dm = musicas(d.estado).find((x) => x.id === "semlaco1")!;
  conferir(dm.corteArquivo === 30 && dm.duracao === 5 && perto(d.ate - d.de, 5), "música sem laço · deslizar mantém o tamanho do bloco (a duração vira fixa)", `corte ${dm.corteArquivo} dur ${dm.duracao}`);
  const d4 = L.aplicarGesto(ctx, ref, { tipo: "deslizarTrecho", delta: -3 }, null);
  conferir(!d4.mudou, "música sem laço · não desliza pra depois do fim do arquivo");
}
// Vizinhos na mesma faixa não se sobrepõem.
{
  const A: ItemAudio = { id: "aaaaaaaa", fonte: { tipo: "musica", id: "calma" }, noVideo: 0, corteArquivo: 0, duracao: 5, volume: 0.8, fadeEntrada: 1, fadeSaida: 0, laco: true };
  const B: ItemAudio = { id: "bbbbbbbb", fonte: { tipo: "musica", id: "calma" }, noVideo: 8, corteArquivo: 0, duracao: 4, volume: 0.8, fadeEntrada: 0, fadeSaida: 2, laco: true };
  const ctx = comEstado(base, { ...base.estado, audios: [A, B] , narracao: null });
  const ra: L.RefItem = { faixa: "musica", id: "aaaaaaaa" };
  const rb: L.RefItem = { faixa: "musica", id: "bbbbbbbb" };
  conferir(L.aplicarGesto(ctx, rb, { tipo: "mover", delta: -6 }, null).de === 5, "vizinhos · mover pra trás para no fim do vizinho");
  conferir(L.aplicarGesto(ctx, ra, { tipo: "mover", delta: 10 }, null).de === 3, "vizinhos · mover pra frente para no começo do vizinho");
  conferir(L.aplicarGesto(ctx, ra, { tipo: "aparaFim", para: 9 }, null).ate === 8, "vizinhos · esticar o fim para no vizinho");
  const inicio = L.aplicarGesto(ctx, rb, { tipo: "aparaInicio", para: 3 }, null);
  conferir(inicio.de === 8 && inicio.parouNaBorda, "vizinhos · o começo não passa do começo do ARQUIVO (e avisa a borda)");
  const m2 = L.aplicarGesto(ctx, ra, { tipo: "aparaFim", para: 4 }, null);
  conferir(musicas(m2.estado).find((x) => x.id === "aaaaaaaa")!.fadeEntrada === 1, "fades · cabem no trecho e ficam");
  const m3 = L.aplicarGesto(ctx, rb, { tipo: "aparaFim", para: 9 }, null);
  const fb = musicas(m3.estado).find((x) => x.id === "bbbbbbbb")!;
  conferir(fb.duracao === 1 && fb.fadeEntrada + fb.fadeSaida <= 1, "fades · encolhem na proporção quando o trecho fica menor que eles (regra do saneador)", `${fb.fadeEntrada}/${fb.fadeSaida}`);
}

// ---------- voz ----------
const Z: L.RefItem = { faixa: "voz", id: "voz00000" };
{
  const a = L.aplicarGesto(base, Z, { tipo: "aparaFim", para: 5 }, null);
  conferir(vozes(a.estado)[0].duracao === 3.5 && a.ate === 5, "voz · aparar o fim");
  const b = L.aplicarGesto(comEstado(base, a.estado), Z, { tipo: "aparaFim", para: 50 }, null);
  conferir(vozes(b.estado)[0].duracao === undefined && b.parouNaBorda, "voz · puxar até o fim do arquivo volta a ser \"até o fim\"");
  const est = ctxDe(E, { ...VOZ_CONHECIDA, vozEstimada: true });
  conferir(!L.aplicarGesto(est, Z, { tipo: "aparaInicio", para: 3 }, null).mudou && !L.aplicarGesto(est, Z, { tipo: "aparaFim", para: 3 }, null).mudou, "voz de IA estimada · não se apara (o tamanho é chute)");
  conferir(L.aplicarGesto(est, Z, { tipo: "mover", delta: 1 }, null).de === 2.5, "voz de IA estimada · mas se move");
  // Achado do sorteio (seq 984): pedaço cortado DEPOIS do fim do arquivo (voz trocada por uma
  // mais curta) tinha largura negativa; "aparar o início" limitava entre um piso 0 e um teto
  // `ate − 0,3` ABAIXO do piso, e o teto ganhava: com corte 600, −587,9s.
  const alem: ItemAudio = { id: "alemfim1", fonte: { tipo: "voz" }, noVideo: 3, corteArquivo: 600, volume: 1, fadeEntrada: 0, fadeSaida: 0 };
  const cAlem = comEstado(base, { ...base.estado, audios: [...musicas(base.estado), alem] });
  const refAlem: L.RefItem = { faixa: "voz", id: "alemfim1" };
  const bAlem = bloco(cAlem, refAlem)!;
  const iAlem = L.aplicarGesto(cAlem, refAlem, { tipo: "aparaInicio", para: 1 }, null);
  const fAlem = L.aplicarGesto(cAlem, refAlem, { tipo: "aparaFim", para: 8 }, null);
  const mAlem = L.aplicarGesto(cAlem, refAlem, { tipo: "mover", delta: -600 }, null);
  conferir(
    bAlem.ate === bAlem.de && !iAlem.mudou && iAlem.de === 3 && !fAlem.mudou && mAlem.de >= 0,
    "voz · corte além do fim do arquivo: bloco de largura zero, aparar não mexe, nada vai pra antes do 0",
    `aparaInicio ${iAlem.de} · mover ${mAlem.de}`
  );
  const desl = L.botaoDeslocar(base, Z, -0.5);
  conferir(desl.de === 1 && desl.mudou, "voz · botão −0,5s");
  // Narração ligada sem trecho: o trecho padrão aparece e, mexido, passa a existir de verdade.
  const semTrecho = comEstado(base, { ...base.estado, audios: musicas(base.estado) });
  conferir(bloco(semTrecho, Z)?.de === 0.7, "voz · narração sem trecho mostra o trecho padrão (0,7s)");
  const mexido = L.aplicarGesto(semTrecho, Z, { tipo: "mover", delta: 1 }, null);
  conferir(mexido.estado.audios.some((x) => x.fonte.tipo === "voz" && x.noVideo === 1.7), "voz · mexer no trecho padrão grava o trecho no estado");
}

// ---------- Você ----------
{
  const ctx = ctxDe(saneado(ESPECS_ANTIGAS.voce_duracao_5)); // entra 2, dura 5, início aparado 0,5; arquivo 12,3s
  const V: L.RefItem = { faixa: "voce" };
  const tv = ctx.relogio.total;
  const ap = (r: L.ResultadoGesto<CenaT>) => r.estado.apresentador!;
  conferir(ap(L.aplicarGesto(ctx, V, { tipo: "mover", delta: 0.34 }, null)).entra === 2.3, "Você · move em décimos (2,34 → 2,3)");
  conferir(ap(L.aplicarGesto(ctx, V, { tipo: "mover", delta: -10 }, null)).entra === 0, "Você · não entra antes do 0");
  conferir(ap(L.aplicarGesto(ctx, V, { tipo: "mover", delta: 1000 }, null)).entra === Math.round(Math.min(120, tv - 1) * 10) / 10, "Você · no máximo 1s antes do fim (e 120s)");
  const i1 = L.aplicarGesto(ctx, V, { tipo: "aparaInicio", para: 1 }, null);
  conferir(ap(i1).inicio === 0 && ap(i1).entra === 1.5 && ap(i1).duracao === 5.5 && i1.parouNaBorda, "Você · puxar o começo pra trás para no começo do ARQUIVO", `entra ${ap(i1).entra} início ${ap(i1).inicio} dura ${ap(i1).duracao}`);
  const i2 = L.aplicarGesto(ctx, V, { tipo: "aparaInicio", para: 3.07 }, null);
  conferir(ap(i2).inicio === 1.6 && ap(i2).entra === 3.1 && ap(i2).duracao === 3.9, "Você · aparar o começo move entra e início juntos, e o fim fica", `entra ${ap(i2).entra} início ${ap(i2).inicio} dura ${ap(i2).duracao}`);
  const i3 = L.aplicarGesto(ctx, V, { tipo: "aparaInicio", para: 20 }, null);
  conferir(ap(i3).duracao === 1, "Você · o começo não passa de 1s antes do fim");
  conferir(ap(L.aplicarGesto(ctx, V, { tipo: "aparaFim", para: 4 }, null)).duracao === 2, "Você · aparar o fim");
  conferir(ap(L.aplicarGesto(ctx, V, { tipo: "aparaFim", para: 2.5 }, null)).duracao === 1, "Você · no mínimo 1s");
  const f3 = L.aplicarGesto(ctx, V, { tipo: "aparaFim", para: 100 }, null);
  conferir(ap(f3).duracao === undefined, "Você · puxar até o fim do arquivo volta a ser \"até o fim do clipe\"");
}

// ---------- legendas ----------
{
  const ctx = ctxDe(saneado(ESPECS_ANTIGAS.legendas_40));
  const t0 = ctx.estado.legendas!.trechos[0];
  const r = L.aplicarGesto(ctx, { faixa: "legendas", indice: 0 }, { tipo: "mover", delta: 1.85 }, null);
  const sel = r.selecao as { indice: number };
  const movido = r.estado.legendas!.trechos[sel.indice];
  conferir(movido.texto === t0.texto && movido.inicio === 2.55 && sel.indice === 2, "legendas · mover reordena e a seleção segue o trecho (novo índice)", `índice ${sel.indice}`);
  const ordenadas = r.estado.legendas!.trechos.every((t, i, l) => i === 0 || l[i - 1].inicio <= t.inicio);
  conferir(ordenadas, "legendas · continuam em ordem");
  const a = L.aplicarGesto(ctx, { faixa: "legendas", indice: 5 }, { tipo: "aparaInicio", para: 99 }, null);
  const t5 = ctx.estado.legendas!.trechos[5];
  conferir(a.de === Math.round((t5.fim - 0.2) * 100) / 100, "legendas · o começo para 0,2s antes do fim");
  const b = L.aplicarGesto(ctx, { faixa: "legendas", indice: 39 }, { tipo: "aparaFim", para: 999 }, null);
  conferir(b.ate === ctx.relogio.total || b.ate <= ctx.relogio.total, "legendas · o fim não passa do fim do vídeo");
  const z = L.aplicarGesto(ctx, { faixa: "legendas", indice: 0 }, { tipo: "mover", delta: -5 }, null);
  conferir(z.de === 0, "legendas · não vão pra antes do 0");
}

// ---------- cenas ----------
{
  const ctx = ctxDe(saneado(ESPECS_ANTIGAS.doze_cenas_transicoes_mistas));
  const primeira = ctx.estado.cenas[0].chave;
  const r = olhar(L.aplicarGesto(ctx, { faixa: "cenas", chave: primeira }, { tipo: "reordenar", paraIndice: 2 }, null));
  conferir(r.estado.cenas[2].chave === primeira && r.estado.cenas.length === ctx.estado.cenas.length, "cenas · reordenar leva a foto pro lugar novo");
  conferir(!L.aplicarGesto(ctx, { faixa: "textos", chave: primeira, indice: 0 }, { tipo: "mover", delta: 1 }, null).mudou, "textos · sem gesto na Entrega 1 (presos à foto)");
}

// ---------- dividir ----------
{
  let n = 0;
  const novoId = () => `novo${String(n++).padStart(4, "0")}`;
  const r = olhar(L.dividirNoTempo(base, M, 4, novoId));
  const [esq, dir] = musicas(r.estado);
  conferir(r.mudou && esq.duracao === 4 && esq.fadeSaida === 0 && esq.fadeEntrada === 1, "dividir · pedaço da esquerda: duração até o corte, sem fade de saída");
  conferir(dir.id === "novo0000" && dir.noVideo === 4 && dir.corteArquivo === 4 && dir.duracao === undefined && dir.fadeEntrada === 0 && dir.fadeSaida === 2 && dir.laco === true, "dividir · pedaço da direita: id de fora, corte andado, continua até o fim, fade de saída mantido");
  conferir(L.mesmoRef(r.selecao, { faixa: "musica", id: "novo0000" }), "dividir · a seleção vai pro pedaço da direita");
  const fora = L.dividirNoTempo(base, M, 0.1, novoId);
  conferir(!fora.mudou && fora.motivo === "Leve o cursor para dentro do trecho", "dividir · no começo do trecho não divide", fora.motivo);
  const est = L.dividirNoTempo(ctxDe(E, { ...VOZ_CONHECIDA, vozEstimada: true }), Z, 4, novoId);
  conferir(est.motivo === "Gere o vídeo uma vez para cortar a voz de IA", "dividir · voz de IA estimada não divide");
  // Limite de 8 pedaços de música.
  let c: L.Ctx<CenaT> = comEstado(base, { ...base.estado, narracao: null, audios: musicas(base.estado) });
  let ultimo: L.RefItem = M;
  for (let i = 0; i < 7; i++) {
    const rr: L.ResultadoAcao<CenaT> = L.dividirNoTempo(c, ultimo, (c.relogio.total * (i + 1)) / 9, novoId);
    c = comEstado(c, rr.estado);
    ultimo = rr.selecao!;
  }
  const nono = L.dividirNoTempo(c, ultimo, c.relogio.total * 0.95, novoId);
  conferir(musicas(c.estado).length === 8 && nono.motivo === "No máximo 8 trechos de música.", "dividir · no máximo 8 pedaços de música", nono.motivo);
  const salvo = limparEspec(L.especDoEstado(E, c.estado));
  conferir(!!salvo.espec && salvo.espec.audios?.length === 8 && salvo.avisos?.length === 0, "dividir · os 8 pedaços passam no saneador sem aviso");
  const voz = L.dividirNoTempo(base, Z, 5, novoId);
  const vz = vozes(voz.estado);
  conferir(vz.length === 2 && vz[0].duracao === 3.5 && vz[1].corteArquivo === 3.5 && vz[1].duracao === undefined, "dividir · voz em dois pedaços, o segundo parte de 3,5s do arquivo");
}

// ---------- apagar ----------
{
  const ctx = ctxDe(saneado(ESPECS_ANTIGAS.legendas_40)); // voz de 0,7 a 10,1 (arquivo 9,4s)
  const r = olhar(L.apagar(ctx, Z));
  const dentro = ctx.estado.legendas!.trechos.filter((t) => t.inicio >= 0.7 && t.fim <= 10.1).length;
  conferir(r.narracaoDesligada && r.estado.narracao === null && r.legendasApagadas === dentro && dentro > 0, "apagar · a última voz leva a narração e as legendas de dentro", `${r.legendasApagadas} legendas`);
  conferir((r.estado.legendas?.trechos ?? []).every((t) => !(t.inicio >= 0.7 && t.fim <= 10.1)), "apagar · as de fora ficam");
  let n = 0;
  const dividido = L.dividirNoTempo(ctx, Z, 5, () => `zz${n++}zzzzz`);
  const r2 = L.apagar(comEstado(ctx, dividido.estado), dividido.selecao!);
  conferir(!r2.narracaoDesligada && r2.estado.narracao !== null && vozes(r2.estado).length === 1, "apagar · um pedaço de dois: a narração fica");
  conferir(L.apagar(base, M).estado.audios.every((a) => a.fonte.tipo !== "musica"), "apagar · música");
  const k0 = base.estado.cenas[0].chave;
  const comLeg = comEstado(base, { ...base.estado, cenas: base.estado.cenas.map((c, i) => (i === 0 ? { ...c, legenda: "Sala", textos: [{ texto: "A" }, { texto: "B" }] } : c)) });
  conferir(L.apagar(comLeg, { faixa: "textos", chave: k0, indice: -1 }).estado.cenas[0].legenda === "", "apagar · legenda da foto vira vazia");
  conferir(igual(L.apagar(comLeg, { faixa: "textos", chave: k0, indice: 0 }).estado.cenas[0].textos, [{ texto: "B" }]), "apagar · texto sai da lista");
  conferir(L.apagar(base, { faixa: "telaFinal" }).estado.telaFinal === false && L.apagar(base, { faixa: "titulo" }).estado.titulo === "", "apagar · tela final e título");
  const leg = L.apagar(ctx, { faixa: "legendas", indice: 0 });
  conferir(leg.estado.legendas!.trechos.length === 39, "apagar · um trecho de legenda");
  const umaSo = comEstado(ctx, { ...ctx.estado, legendas: { trechos: [{ inicio: 1, fim: 2, texto: "oi" }] } });
  conferir(L.apagar(umaSo, { faixa: "legendas", indice: 0 }).estado.legendas === null, "apagar · o último trecho zera as legendas");
  conferir(extrasVivos(L.apagar(base, { faixa: "cenas", chave: k0 }).estado), "apagar · cena some e as outras mantêm os campos do editor");
}

// ---------- transcrição em dois pedaços ----------
{
  const pecas: ItemAudio[] = [
    { id: "p1p1p1p1", fonte: { tipo: "voz" }, noVideo: 1, corteArquivo: 0, duracao: 3, volume: 1, fadeEntrada: 0, fadeSaida: 0 },
    { id: "p2p2p2p2", fonte: { tipo: "voz" }, noVideo: 6, corteArquivo: 5, volume: 1, fadeEntrada: 0, fadeSaida: 0 },
  ];
  const saida = L.legendasDaTranscricao(
    [
      { inicio: 0.2, fim: 1.0, texto: "um" },
      { inicio: 2.5, fim: 3.4, texto: "dois" },
      { inicio: 4.5, fim: 5.4, texto: "cortado" },
      { inicio: 5.5, fim: 6.5, texto: "três" },
    ],
    pecas,
    9
  );
  conferir(
    igual(saida, [
      { inicio: 1.2, fim: 2, texto: "um" },
      { inicio: 3.5, fim: 4, texto: "dois" },
      { inicio: 6.5, fim: 7.5, texto: "três" },
    ]),
    "transcrição · cada trecho vai pro pedaço de voz que contém o meio dele, aparado na borda; o que caiu no corte some",
    JSON.stringify(saida)
  );
  const moveu = L.moverLegendasComVoz({ trechos: [{ inicio: 1, fim: 2, texto: "a" }, { inicio: 8, fim: 9, texto: "b" }] }, { de: 0.5, ate: 4 }, 0.5, 20);
  conferir(moveu.movidas === 1 && moveu.legendas!.trechos[0].inicio === 1.5 && moveu.legendas!.trechos[1].inicio === 8, "legendas acompanham a voz · só as de dentro da janela");
}

// ---------- textos entre fotos ----------
{
  const k = base.estado.cenas.map((c) => c.chave);
  const cenas = base.estado.cenas.map((c, i) =>
    i === 0 ? { ...c, legenda: "Sala", textos: [{ texto: "A", posicao: "base" as const }] } : i === 1 ? { ...c, legenda: "Cozinha", textos: [{ texto: "X", posicao: "base" as const }, { texto: "Y", posicao: "centro" as const }, { texto: "Z", posicao: "topo" as const }] } : c
  );
  const ctx = comEstado(base, { ...base.estado, cenas });
  conferir(L.moverParaFoto(ctx, { faixa: "textos", chave: k[0], indice: 0 }, 1).motivo === "A foto seguinte já tem 3 textos", "entre fotos · foto cheia recusa");
  conferir(L.moverParaFoto(ctx, { faixa: "textos", chave: k[0], indice: 0 }, -1).motivo === "Esta já é a primeira cena", "entre fotos · não há foto antes da primeira");
  conferir(L.moverParaFoto(ctx, { faixa: "textos", chave: k[0], indice: -1 }, 1).motivo === "A foto seguinte já tem legenda", "entre fotos · legenda só vai pra foto sem legenda");
  const vai = olhar(L.moverParaFoto(ctx, { faixa: "textos", chave: k[1], indice: 0 }, 1));
  const alvo = vai.estado.cenas[2];
  conferir(vai.mudou && alvo.textos?.[0].texto === "X" && vai.estado.cenas[1].textos?.length === 2 && L.mesmoRef(vai.selecao, { faixa: "textos", chave: k[2], indice: 0 }), "entre fotos · o texto muda de foto e a seleção vai junto");
  const leg = L.moverParaFoto(ctx, { faixa: "textos", chave: k[0], indice: -1 }, 1);
  void leg;
  const dup = olhar(L.duplicarNaFoto(ctx, { faixa: "textos", chave: k[0], indice: 0 }));
  conferir(dup.estado.cenas[0].textos?.length === 2 && dup.estado.cenas[0].textos?.[1].posicao === "centro", "duplicar · a cópia vai pro primeiro lugar livre (base ocupada → meio)");
  conferir(L.duplicarNaFoto(ctx, { faixa: "textos", chave: k[1], indice: 0 }).motivo === "Esta foto já tem 3 textos", "duplicar · foto cheia recusa");
}

// ---------- a barra ----------
{
  // Música de 2 a 12 (em laço, com duração).
  const item: ItemAudio = { id: "musica00", fonte: { tipo: "musica", id: "calma" }, noVideo: 2, corteArquivo: 0, duracao: 10, volume: 0.8, fadeEntrada: 1, fadeSaida: 2, laco: true };
  const ctx = comEstado(base, { ...base.estado, audios: [item, ...vozes(base.estado)] });
  const ativo = (t: number, id: string, gerando = false) => L.acoesDaSelecao(ctx, M, t, gerando).find((a) => a.id === id)!;
  const tabela: [number, boolean, boolean, boolean][] = [
    // t, início aqui, fim aqui, dividir
    [0, false, false, false],
    [2, false, false, false],
    [2.1, true, false, false],
    [7, true, true, true],
    [12, false, false, false],
    [total - 0.05, false, false, false],
  ];
  const erros = tabela.filter(([t, i, f, d]) => ativo(t, "inicio_aqui").ativo !== i || ativo(t, "fim_aqui").ativo !== f || ativo(t, "dividir").ativo !== d);
  conferir(erros.length === 0, "barra da música · início/fim/dividir nas 6 posições do cursor", erros.map((e) => e[0]).join(","));
  conferir(ativo(2, "inicio_aqui").motivo === "A música começa aqui" && ativo(0, "inicio_aqui").motivo === "Leve o cursor para dentro da música", "barra da música · o motivo diz o que fazer");
  const gerando = L.acoesDaSelecao(ctx, M, 7, true);
  conferir(gerando.filter((a) => a.id !== "trocar").every((a) => !a.ativo && a.motivo === "Espere o vídeo terminar de gerar") && gerando.find((a) => a.id === "trocar")!.ativo, "barra · gerando: só o que não muda nada fica aceso");
  const est = L.acoesDaSelecao(ctxDe(E, { ...VOZ_CONHECIDA, vozEstimada: true }), Z, 4, false);
  conferir(["inicio_aqui", "fim_aqui", "dividir"].every((id) => est.find((a) => a.id === id)!.motivo === "Gere o vídeo uma vez para cortar a voz de IA"), "barra da voz estimada · cortar espera a voz existir");
  const k = base.estado.cenas.map((c) => c.chave);
  const cena = (t: number) => L.acoesDaSelecao(base, { faixa: "cenas", chave: k[0] }, t, false);
  conferir(cena(0.05).find((a) => a.id === "dividir")!.motivo === "Leve o cursor para dentro da cena" && cena(0).find((a) => a.id === "mover_esq")!.motivo === "Esta já é a primeira cena", "barra da cena · fora da cena não divide; primeira foto não vai pra esquerda");
  const legCtx = ctxDe(saneado(ESPECS_ANTIGAS.legendas_40));
  const tr = legCtx.estado.legendas!.trechos[3];
  const leg = (t: number) => L.acoesDaSelecao(legCtx, { faixa: "legendas", indice: 3 }, t, false);
  conferir(leg(tr.inicio + 0.1).find((a) => a.id === "inicio_aqui")!.ativo && !leg(tr.inicio + 0.1).find((a) => a.id === "mais_trecho")!.ativo, "barra da legenda · dentro: início aqui aceso, \"+ trecho\" apagado");
  conferir(leg(legCtx.relogio.total - 0.5).find((a) => a.id === "mais_trecho")!.ativo === !legCtx.estado.legendas!.trechos.some((x) => legCtx.relogio.total - 0.5 >= x.inicio && legCtx.relogio.total - 0.5 < x.fim), "barra da legenda · \"+ trecho aqui\" onde não há legenda");
  const leg1 = L.acoesDaSelecao(base, { faixa: "textos", chave: k[0], indice: -1 }, 1, false);
  conferir(leg1.find((a) => a.id === "animacao")!.motivo === "Legenda da foto não tem animação" && !leg1.some((a) => a.id === "duplicar"), "barra da legenda da foto · sem animação e sem duplicar");
  const vc = L.acoesDaSelecao(ctxDe(saneado(ESPECS_ANTIGAS.voce_duracao_5)), { faixa: "voce" }, 4, false);
  conferir(vc.find((a) => a.id === "inicio_aqui")!.ativo && vc.find((a) => a.id === "fim_aqui")!.ativo, "barra do Você · dentro dele, início e fim acesos");
}

// ---------- faixa aberta, zoom, ordem das legendas, seleção ----------
{
  const f = L.blocosDoEstado(base);
  conferir(L.faixaAberta({ selecao: Z, aba: null, ultima: null, faixas: f }) === "voz", "faixa aberta · a da seleção");
  conferir(L.faixaAberta({ selecao: null, aba: "audio", ultima: null, faixas: f }) === "musica", "faixa aberta · a da aba (Áudio → música)");
  conferir(L.faixaAberta({ selecao: null, aba: "legendas", ultima: null, faixas: f }) === "voz", "faixa aberta · aba Legendas com voz abre a voz");
  conferir(L.faixaAberta({ selecao: null, aba: "cor", ultima: "musica", faixas: f }) === "musica", "faixa aberta · senão, a última aberta");
  conferir(L.faixaAberta({ selecao: null, aba: null, ultima: null, faixas: f }) === "voz", "faixa aberta · senão, a primeira com conteúdo");
  const vazio = L.blocosDoEstado(comEstado(base, { ...base.estado, audios: [], narracao: null, titulo: "", legendas: null, apresentador: null, cenas: base.estado.cenas.map((c) => ({ ...c, legenda: "", textos: [], elementos: [] })) }));
  conferir(L.faixaAberta({ selecao: null, aba: "audio", ultima: "musica", faixas: vazio }) === null, "faixa aberta · nada com conteúdo, nada aberto");
  conferir(L.zoomParaAjustar(20, 375) === 17.15 && L.zoomParaAjustar(1, 5000) === 120 && L.zoomParaAjustar(600, 100) === 4, "zoom · ajustar cabe o vídeo e respeita 4..120 px/s");
  const l: Legendas = { trechos: [{ inicio: 2, fim: 3, texto: "b" }, { inicio: 1, fim: 4, texto: "a" }, { inicio: 1, fim: 2, texto: "c" }, { inicio: 1, fim: 2, texto: "d" }] };
  conferir(L.normalizarLegendas(l)!.trechos.map((t) => t.texto).join("") === "cdab", "legendas · em ordem de início, depois fim, sem trocar os iguais");
  const k = base.estado.cenas.map((c) => c.chave);
  const semCena = comEstado(base, { ...base.estado, cenas: base.estado.cenas.slice(1) });
  conferir(L.realinharSelecao(semCena, { faixa: "cenas", chave: k[0] }) === null && L.mesmoRef(L.realinharSelecao(semCena, M), M), "seleção · cena apagada solta a seleção; música continua");
}

conferir(extrasOk, "campos do editor na cena (miniatura, rótulo...) atravessam toda operação");

// ---------- I7: 2000 sequências sorteadas ----------
{
  const sorteio = (semente: number) => () => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = sorteio(20260918);
  const entre = (a: number, b: number) => a + (b - a) * r();
  const bases = ["voz_gravada_volume_2", "legendas_40", "voce_duracao_5", "musica_so", "voz_enviada_musica_volume_0_8333"].map((n) => saneado(ESPECS_ANTIGAS[n]));
  // Só pontos de partida que o EDITOR produz: as fixtures tortas do saneador (seis músicas
  // "até o fim" empilhadas, trecho depois do fim, dois trechos no mesmo instante) existem
  // pra testar o saneador, e começar delas mediria a fixture, não o gesto.
  const valido = (e: EspecVideo) => {
    const f = L.blocosDoEstado(ctxDe(e));
    return (["voz", "musica"] as const).every((t) => {
      const l = [...f.trilhas[t]].sort((a, b) => a.de - b.de);
      return l.every((b, i) => !b.foraDoVideo && (i === 0 || b.de >= l[i - 1].ate - 0.011));
    });
  };
  const descartadas: string[] = [];
  for (const [nome, bruto] of Object.entries(ESPECS_V2)) {
    const x = limparEspec(bruto);
    if (!x.espec || x.espec.narracao?.origem === "ia" || !x.espec.audios) continue;
    if (valido(x.espec)) bases.push(x.espec);
    else descartadas.push(nome);
  }
  console.log(`      pontos de partida: ${bases.length} (fora, por serem tortos de propósito: ${descartadas.join(", ")})`);
  let n = 0;
  let ops = 0;
  const problemas: string[] = [];
  for (let seq = 0; seq < 2000; seq++) {
    const S0 = bases[seq % bases.length];
    let ctx = ctxDe(S0);
    const passos = 1 + Math.floor(r() * 6);
    for (let p = 0; p < passos; p++) {
      const f = L.blocosDoEstado(ctx);
      const candidatos = [...f.trilhas.musica, ...f.trilhas.voz, ...f.trilhas.voce, ...f.trilhas.legendas, ...f.trilhas.cenas.filter((b) => b.ref.faixa === "cenas")];
      if (!candidatos.length) break;
      const b = candidatos[Math.floor(r() * candidatos.length)];
      const snap = r() < 0.5 ? { pontos: L.pontosDeEncaixe(ctx, b.ref, entre(0, f.total)), limiarSeg: entre(0, 0.3) } : null;
      const x = r();
      let estado = ctx.estado;
      if (b.ref.faixa === "cenas") {
        estado = L.aplicarGesto(ctx, b.ref, { tipo: "reordenar", paraIndice: Math.floor(r() * ctx.estado.cenas.length) }, null).estado;
      } else if (x < 0.4) estado = L.aplicarGesto(ctx, b.ref, { tipo: "mover", delta: entre(-8, 8) }, snap).estado;
      else if (x < 0.6) estado = L.aplicarGesto(ctx, b.ref, { tipo: "aparaInicio", para: entre(b.de - 5, b.ate) }, snap).estado;
      else if (x < 0.8) estado = L.aplicarGesto(ctx, b.ref, { tipo: "aparaFim", para: entre(b.de, b.ate + 5) }, snap).estado;
      else if (x < 0.87) estado = L.aplicarGesto(ctx, b.ref, { tipo: "deslizarTrecho", delta: entre(-20, 20) }, null).estado;
      else if (x < 0.95) estado = L.dividirNoTempo(ctx, b.ref, entre(b.de, b.ate), () => `r${String(n++).padStart(7, "0")}`).estado;
      else if (b.ref.faixa !== "voce" || r() < 0.3) estado = L.apagar(ctx, b.ref).estado;
      ctx = comEstado(ctx, estado);
      ops++;
    }
    const f = L.blocosDoEstado(ctx);
    for (const t of ["voz", "musica"] as const) {
      const l = [...f.trilhas[t]].sort((a, b) => a.de - b.de);
      for (let i = 1; i < l.length; i++) if (l[i].de < l[i - 1].ate - 0.011) problemas.push(`seq ${seq}: ${t} sobreposta ${l[i - 1].de}-${l[i - 1].ate} x ${l[i].de}`);
    }
    for (const t of L.ORDEM_DAS_FAIXAS) for (const b of f.trilhas[t]) if (!b.foraDoVideo && (b.de < 0 || b.ate > f.total + 1e-9 || b.ate < b.de)) problemas.push(`seq ${seq}: ${t} fora de [0,total] ${b.de}-${b.ate}`);
    const salvo = limparEspec(L.especDoEstado(S0, ctx.estado));
    if (!salvo.espec) {
      problemas.push(`seq ${seq}: saneador recusou (${salvo.erro})`);
      continue;
    }
    if (salvo.avisos.length) problemas.push(`seq ${seq}: saneador descartou: ${salvo.avisos.join(" | ")}`);
    const de2 = limparEspec(salvo.espec);
    if (!de2.espec || !igual(de2.espec, salvo.espec)) problemas.push(`seq ${seq}: saneador não é idempotente`);
    const f2 = L.blocosDoEstado(ctxDe(salvo.espec));
    for (const t of ["cenas", ...L.ORDEM_DAS_FAIXAS] as const) {
      const tol = t === "voce" ? 0.1 : 0.011;
      const a = f.trilhas[t].map((b) => [b.de, b.ate]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const c = f2.trilhas[t].map((b) => [b.de, b.ate]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      if (a.length !== c.length || a.some((v, i) => !perto(v[0], c[i][0], tol) || !perto(v[1], c[i][1], tol))) problemas.push(`seq ${seq}: ${t} mudou ao reabrir ${JSON.stringify(a)} -> ${JSON.stringify(c)}`);
    }
  }
  const tipos = new Map<string, number>();
  for (const x of problemas) { const k = x.replace(/^seq d+: /, "").replace(/[d.,[]- ]+/g, " ").slice(0, 70); tipos.set(k, (tipos.get(k) ?? 0) + 1); }
  for (const [k, v] of [...tipos].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${v}× ${k}`);
  for (const x of problemas.slice(0, 4)) console.log(`      ${x.slice(0, 300)}`);
  conferir(problemas.length === 0, "I7 · 2000 sequências: sem sobreposição, dentro do vídeo, saneador calado e idempotente, e cada bloco no mesmo lugar ao reabrir", `${ops} gestos${problemas.length ? " · " + problemas.length + " problemas; 1º: " + problemas[0] : ""}`);
}

// ---------- pontos de encaixe ----------
{
  const p = L.pontosDeEncaixe(base, M, 3.333);
  const rel = relogioDoEspec(E);
  conferir(p.includes(0) && p.includes(Math.round(total * 100) / 100) && p.includes(3.33) && rel.clipes.every((c) => p.includes(Math.round(c.inicio * 100) / 100)) && p.includes(1.5), "encaixe · 0, fim, cursor, começo de cada cena e bordas dos outros blocos");
  conferir(L.encaixar(5.04, [5, 6], 0.05).t === 5 && L.encaixar(5.04, [5, 6], 0.03).guia === null, "encaixe · dentro do limiar gruda; fora, não");
  void LIMITES;
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
