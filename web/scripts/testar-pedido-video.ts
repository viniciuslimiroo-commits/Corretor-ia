// O PEDIDO DE VÍDEO (POST /api/video) sem banco, sem storage e sem crédito.
//
//   1. I8 -- pelo caminho do pedido, o espec sai IGUAL ao que o saneador devolve, pra cada
//      fixture da linha do tempo e pros sorteados. É a garantia de que a rota não é um
//      segundo saneador com regras próprias;
//   2. dono de tudo: foto que não é da pessoa, foto não pronta, antes/depois sem original,
//      arquivo de cena, de voz e do Você de outra pasta;
//   3. a voz de IA REAPROVEITADA, que é o único campo que vira dinheiro: nome fora do
//      formato = 400, arquivo que não existe = 409 com código, e o custo nunca muda calado;
//   4. o resumo da edição: limpo pelo mesmo limparResumoEdicao, e fora do espec.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-pedido-video.ts

import { deepStrictEqual } from "node:assert";

const { custoDoVideo, limparEspec } = await import("../src/lib/video.ts");
const { prepararPedidoDeVideo, validarNarracaoReaproveitada } = await import("../src/lib/pedido-video.ts");
const { ESPECS_LINHA, RECUSADOS, especsV2Sorteadas } = await import("./fixtures/especs-linha.ts");

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

// O dono das fixtures sai das próprias fixtures: um id escrito aqui apodreceria calado no
// dia em que o módulo trocasse de usuário (obs 0083).
const USUARIO = (() => {
  const m = JSON.stringify(ESPECS_LINHA).match(/uploads\/([0-9a-f-]{36})\//);
  if (!m) throw new Error("nenhum caminho uploads/<usuário>/ nas fixtures");
  return m[1];
})();
const OUTRO = "00000000-1111-2222-3333-444444444444";

/** Dependências de mentira: todo job pedido é dela e está pronto; todo arquivo existe. */
function deps(o: { jobs?: "ok" | "alheio" | "rodando" | "sem_original"; existe?: boolean } = {}) {
  const chamadas: { pasta: string; nome: string }[] = [];
  return {
    chamadas,
    jobsDoUsuario: async (ids: string[]) => {
      if (o.jobs === "alheio") return [];
      return ids.map((id) => ({
        id,
        status: o.jobs === "rodando" ? "rodando" : "concluido",
        input_path: o.jobs === "sem_original" ? null : `entradas/${USUARIO}/${id}-foto.jpg`,
        output_path: `${USUARIO}/${id}.jpg`,
      }));
    },
    existeNoBucket: async (pasta: string, nome: string) => {
      chamadas.push({ pasta, nome });
      return o.existe !== false;
    },
  };
}

// ---------- 1. I8: o mesmo espec do saneador ----------
{
  const todas = { ...ESPECS_LINHA, ...especsV2Sorteadas(50) };
  let iguais = 0;
  let recusados = 0;
  const erros: string[] = [];
  for (const [nome, bruto] of Object.entries(todas)) {
    const doSaneador = limparEspec(bruto);
    const pedido = await prepararPedidoDeVideo({ espec: bruto }, USUARIO, deps());
    if (!doSaneador.espec) {
      // O saneador recusa: o pedido recusa com a MESMA mensagem e status 400.
      if (!pedido.ok && pedido.status === 400 && pedido.error === doSaneador.erro) recusados++;
      else erros.push(`${nome}: recusa diferente`);
      continue;
    }
    if (!pedido.ok) {
      erros.push(`${nome}: pedido recusou o que o saneador aceitou (${pedido.error})`);
      continue;
    }
    if (igual(pedido.espec, doSaneador.espec) && igual(pedido.avisos, doSaneador.avisos)) iguais++;
    else erros.push(`${nome}: espec ou avisos diferentes`);
  }
  conferir(erros.length === 0, "I8: cada fixture sai do pedido igual ao que o saneador devolve", `${iguais} iguais, ${recusados} recusas · ${erros.slice(0, 3).join(" | ")}`);
  conferir(recusados === Object.keys(RECUSADOS).length, "as recusas do saneador chegam iguais na rota", `${recusados}/${Object.keys(RECUSADOS).length}`);
  conferir(iguais + recusados === Object.keys(todas).length, "nenhum caso ficou de fora", `${iguais + recusados}/${Object.keys(todas).length}`);
}

// ---------- 2. dono de tudo ----------
{
  const comFoto = ESPECS_LINHA.musica_so;
  conferir((await prepararPedidoDeVideo({ espec: comFoto }, USUARIO, deps())).ok, "vídeo com fotos dela passa");

  const alheio = await prepararPedidoDeVideo({ espec: comFoto }, USUARIO, deps({ jobs: "alheio" }));
  conferir(!alheio.ok && alheio.status === 400 && alheio.error.includes("não está pronta ou não é sua"), "foto de outra pessoa é recusada", !alheio.ok ? alheio.error : "");

  const rodando = await prepararPedidoDeVideo({ espec: comFoto }, USUARIO, deps({ jobs: "rodando" }));
  conferir(!rodando.ok && rodando.status === 400, "foto que ainda está rodando é recusada");

  const semOriginal = await prepararPedidoDeVideo({ espec: comFoto }, USUARIO, deps({ jobs: "sem_original" }));
  conferir(!semOriginal.ok && semOriginal.error.includes("antes e depois"), "antes/depois sem a original é recusado", !semOriginal.ok ? semOriginal.error : "");

  const trocarDono = (bruto: unknown) => JSON.parse(JSON.stringify(bruto).split(USUARIO).join(OUTRO));
  for (const [nome, espec, mensagem] of [
    ["cena", ESPECS_LINHA.cena_clipe_inicio_velocidade, "Arquivo enviado não reconhecido."],
    ["voz", ESPECS_LINHA.voz_gravada_volume_0_2, "Áudio de narração não reconhecido."],
    ["Você", ESPECS_LINHA.voce_duracao_5, "Vídeo do apresentador não reconhecido."],
  ] as const) {
    const r = await prepararPedidoDeVideo({ espec: trocarDono(espec) }, USUARIO, deps());
    conferir(!r.ok && r.status === 400 && r.error === mensagem, `arquivo de ${nome} de outra pasta é recusado`, !r.ok ? r.error : "");
  }
}

// ---------- 3. a voz de IA reaproveitada ----------
{
  const comReuso = ESPECS_LINHA.v2_equivalente_voz_ia_com_arquivo ?? ESPECS_LINHA.v2_voz_ia_com_reuso;
  conferir(!!comReuso, "existe fixture com voz de IA reaproveitada");
  const arquivo = (JSON.stringify(comReuso).match(/uploads\/[0-9a-f-]{36}\/voz-[0-9a-f-]{36}\.mp3/) ?? [])[0];
  conferir(!!arquivo, "a fixture traz o caminho da voz guardada", String(arquivo));

  const d = deps();
  const ok = await prepararPedidoDeVideo({ espec: comReuso }, USUARIO, d);
  conferir(ok.ok && !!ok.espec.narracao?.arquivo, "voz guardada que existe passa e o arquivo fica no espec");
  conferir(ok.ok && custoDoVideo(ok.espec) === 0, "e o vídeo custa 0 crédito", ok.ok ? String(custoDoVideo(ok.espec)) : "");
  conferir(d.chamadas.length === 1 && d.chamadas[0].pasta === `uploads/${USUARIO}` && /^voz-[0-9a-f-]{36}\.mp3$/.test(d.chamadas[0].nome), "o bucket é consultado uma vez, com pasta e nome exatos", JSON.stringify(d.chamadas));

  const semArquivoNoBucket = await prepararPedidoDeVideo({ espec: comReuso }, USUARIO, deps({ existe: false }));
  conferir(!semArquivoNoBucket.ok && semArquivoNoBucket.status === 409 && semArquivoNoBucket.codigo === "voz_reaproveitada_ausente", "voz guardada que sumiu do bucket vira 409 com código", !semArquivoNoBucket.ok ? `${semArquivoNoBucket.status} ${semArquivoNoBucket.codigo}` : "");
  conferir(!semArquivoNoBucket.ok && semArquivoNoBucket.error.includes("1 crédito"), "e a mensagem diz o preço de gravar de novo -- nunca muda calado", !semArquivoNoBucket.ok ? semArquivoNoBucket.error : "");

  // Outro arquivo da MESMA pasta (uma foto, um áudio enviado) não é voz de IA guardada. Aqui
  // quem barra primeiro é o SANEADOR (P1), que só deixa passar o formato que o pipeline
  // grava: o `arquivo` some e o vídeo volta a custar 1 crédito. O caminho que interessa é
  // este -- forjar um nome nunca dá voz de graça.
  const forjado = JSON.parse(JSON.stringify(comReuso)) as { narracao: { arquivo: string } };
  forjado.narracao.arquivo = `uploads/${USUARIO}/audio-enviado.mp3`;
  const r = await prepararPedidoDeVideo({ espec: forjado }, USUARIO, deps({ existe: false }));
  conferir(r.ok && !r.espec.narracao?.arquivo && custoDoVideo(r.espec) === 1, "nome forjado na pasta dela não vira voz de graça: o arquivo cai e o vídeo custa 1", r.ok ? String(custoDoVideo(r.espec)) : `recusa ${r.error}`);
  // E a conferência do pedido, sozinha, recusa esse nome -- é a guarda que sobrevive se o
  // saneador um dia afrouxar (os dois lados do mesmo trinco, spec E0/U1).
  const solta = await validarNarracaoReaproveitada({ narracao: { origem: "ia", roteiro: "oi", voz: "laura", arquivo: `uploads/${USUARIO}/audio-enviado.mp3` } as never }, USUARIO, async () => true);
  conferir(solta?.status === 400 && solta.error === "Narração reaproveitada não reconhecida.", "validarNarracaoReaproveitada recusa nome fora do formato", JSON.stringify(solta));

  // E a conferência não encosta no bucket quando não há o que reaproveitar.
  const semReuso = deps();
  await prepararPedidoDeVideo({ espec: ESPECS_LINHA.voz_ia_inicio_3_3 }, USUARIO, semReuso);
  conferir(semReuso.chamadas.length === 0, "voz de IA sem arquivo não consulta o bucket");
  const gravada = deps();
  await prepararPedidoDeVideo({ espec: ESPECS_LINHA.voz_gravada_volume_0_2 }, USUARIO, gravada);
  conferir(gravada.chamadas.length === 0, "voz gravada pela pessoa não passa pela conferência de reaproveitamento");

  // A função sozinha, com o `existe` de mentira.
  const so = (n: unknown) => validarNarracaoReaproveitada({ narracao: n as never }, USUARIO, async () => true);
  conferir((await so(null)) === null, "sem narração, nada a validar");
  conferir((await so({ origem: "gravada", arquivo: `uploads/${USUARIO}/x.webm` })) === null, "voz gravada não é voz de IA reaproveitada");
  conferir((await validarNarracaoReaproveitada({ narracao: { origem: "ia", roteiro: "oi", voz: "laura", arquivo } as never }, OUTRO, async () => true))?.status === 400, "o mesmo arquivo pedido por outro usuário é recusado");
}

// ---------- 4. o resumo da edição ----------
{
  const bom = { v: 1, abertoEm: new Date(Date.now() - 60_000).toISOString(), geracao: 2, desfazer: 3, refazer: 1, edicoes: { musica: { arraste: 4, botao: 1 } }, faixasAbertas: 1, aparosNaBorda: 0, previaSemSom: 0, dispositivo: "celular" };
  const comResumo = await prepararPedidoDeVideo({ espec: ESPECS_LINHA.musica_so, resumo: bom }, USUARIO, deps());
  conferir(comResumo.ok && comResumo.resumo?.geracao === 2 && comResumo.resumo.dispositivo === "celular", "resumo bom chega limpo", comResumo.ok ? JSON.stringify(comResumo.resumo) : "");
  conferir(comResumo.ok && !("resumo" in (comResumo.espec as object)) && !("resumoEdicao" in (comResumo.espec as object)), "e nunca entra no espec");

  const velho = { ...bom, abertoEm: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString() };
  const comVelho = await prepararPedidoDeVideo({ espec: ESPECS_LINHA.musica_so, resumo: velho }, USUARIO, deps());
  conferir(comVelho.ok && comVelho.resumo === null, "resumo velho demais vira null e o vídeo segue");
  const semResumo = await prepararPedidoDeVideo({ espec: ESPECS_LINHA.musica_so }, USUARIO, deps());
  conferir(semResumo.ok && semResumo.resumo === null, "pedido sem resumo (página rápida) segue igual");

  const vazio = await prepararPedidoDeVideo(undefined, USUARIO, deps());
  conferir(!vazio.ok && vazio.status === 400, "corpo vazio é recusado sem explodir");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
