// O DINHEIRO DA NARRAÇÃO (spec F4): o que se cobra, o que se executa e o que volta.
//
// Os três lados juntos, porque é a combinação deles que quebra: no instante em que a voz de
// IA reaproveitada passou a custar 0 crédito, um servidor que ainda chamasse o TTS daria voz
// de graça, e um estorno de valor fixo daria SALDO de graça -- e esse segundo dispara sozinho,
// sem ninguém forjar nada: basta o provedor de TTS cair.
//
//   1. a tabela de custo (`custoDoVideo`) e o que ela diz sobre o estorno;
//   2. a etapa `narracao` do pipeline com a voz reaproveitada: NENHUMA chamada ao fal
//      (o `fetch` global é trocado por um espião que estoura) e NENHUM crédito de volta;
//   3. TTS que falha de verdade: o crédito volta UMA vez, e a repetição da etapa não
//      estorna de novo;
//   4. o DELETE do vídeo nunca apaga a voz guardada.
//
// Sem banco, sem storage, sem API paga: o db é de mentira e o fetch é interceptado.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-narracao-reaproveitada.ts

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const { CREDITOS, custoDoVideo, limparEspec } = await import("../src/lib/video.ts");
const { creditosDaNarracao, estornoDaNarracao } = await import("../src/lib/pedido-video.ts");
const { avancarVideo, pipelineInicial, limparTemporarios } = await import("../src/lib/video-pipeline.ts");
const { ESPECS_LINHA } = await import("./fixtures/especs-linha.ts");

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const VOZ_GUARDADA = (JSON.stringify(ESPECS_LINHA).match(/uploads\/[0-9a-f-]{36}\/voz-[0-9a-f-]{36}\.mp3/) ?? [])[0] as string;
const USUARIO = VOZ_GUARDADA.split("/")[1];

// ---------- 1. a tabela de custo ----------
{
  const cenas = [{ tipo: "foto" as const, jobId: "x", duracao: 4 }];
  const ia = { origem: "ia" as const, roteiro: "oi", voz: "laura" as const };
  conferir(custoDoVideo({ cenas, narracao: ia }) === CREDITOS.narracao, "voz de IA sem arquivo custa o preço da narração", String(custoDoVideo({ cenas, narracao: ia })));
  conferir(custoDoVideo({ cenas, narracao: { ...ia, arquivo: VOZ_GUARDADA } }) === 0, "voz de IA reaproveitada custa 0");
  conferir(custoDoVideo({ cenas, narracao: { origem: "gravada", arquivo: `uploads/${USUARIO}/x.webm` } }) === 0, "voz gravada pela pessoa custa 0");
  conferir(custoDoVideo({ cenas, narracao: null }) === 0, "sem narração, 0");
  // Espec antigo não tem `origem`: continua sendo voz de IA e continua cobrando.
  conferir(custoDoVideo({ cenas, narracao: { roteiro: "oi", voz: "laura" } as never }) === CREDITOS.narracao, "espec antigo sem origem continua cobrando a narração");

  // O ESTORNO lê a mesma tabela -- é isto que impede o estorno de valor fixo.
  conferir(creditosDaNarracao(ia) === CREDITOS.narracao, "o estorno da voz cobrada é o que foi cobrado");
  conferir(creditosDaNarracao({ ...ia, arquivo: VOZ_GUARDADA }) === 0, "voz reaproveitada não tem o que estornar");
  conferir(creditosDaNarracao({ origem: "gravada", arquivo: "x" }) === 0 && creditosDaNarracao(null) === 0, "voz gravada e ausência de voz não têm o que estornar");
  conferir(estornoDaNarracao(ia, true) === 0, "o que já voltou não volta de novo");
  conferir(estornoDaNarracao(ia, undefined) === CREDITOS.narracao, "o que ainda não voltou, volta inteiro");
}

// ---------- o mundo de mentira ----------
type Chamada = { tipo: string; detalhe: string };

function mundo() {
  const chamadas: Chamada[] = [];
  const db = {
    from(tabela: string) {
      return {
        update(valores: Record<string, unknown>) {
          return {
            async eq() {
              chamadas.push({ tipo: "update", detalhe: `${tabela}:${Object.keys(valores).join(",")}` });
              return { data: null, error: null };
            },
          };
        },
      };
    },
    async rpc(nome: string, args: Record<string, unknown>) {
      chamadas.push({ tipo: "rpc", detalhe: `${nome}:${JSON.stringify(args)}` });
      return { data: 1, error: null };
    },
    storage: {
      from() {
        return {
          async upload(caminho: string) {
            chamadas.push({ tipo: "upload", detalhe: caminho });
            return { data: null, error: null };
          },
        };
      },
    },
  };
  return { chamadas, db: db as never };
}

/** Roda a etapa com o `fetch` global trocado por um espião: nenhuma chamada sai da máquina. */
async function comFetchEspiao<T>(chamadas: Chamada[], fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown) => {
    chamadas.push({ tipo: "fetch", detalhe: String(entrada).slice(0, 80) });
    throw new Error("rede desligada no teste");
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function videoDe(narracao: unknown) {
  const { espec } = limparEspec({ ...ESPECS_LINHA.musica_so, narracao });
  if (!espec) throw new Error("fixture não passou no saneador");
  const p = pipelineInicial(10);
  p.etapa = "narracao";
  return { linha: { id: "11111111-2222-3333-4444-555555555555", user_id: USUARIO, org_id: null, espec, pipeline: p, formato: espec.formato }, p, espec };
}

// ---------- 2. voz reaproveitada: nem TTS, nem estorno ----------
{
  const { chamadas, db } = mundo();
  const { linha, p, espec } = videoDe({ origem: "ia", roteiro: "Apartamento com vista.", voz: "laura", arquivo: VOZ_GUARDADA });
  conferir(espec.narracao?.arquivo === VOZ_GUARDADA, "o saneador manteve o arquivo da voz guardada", String(espec.narracao?.arquivo));
  await comFetchEspiao(chamadas, () => avancarVideo(db, "chave-de-mentira", linha as never));
  conferir(chamadas.filter((c) => c.tipo === "fetch").length === 0, "nenhuma chamada ao fal: o TTS não roda", JSON.stringify(chamadas.filter((c) => c.tipo === "fetch")));
  conferir(chamadas.filter((c) => c.tipo === "rpc").length === 0, "nenhum crédito de volta: não houve o que estornar", JSON.stringify(chamadas.filter((c) => c.tipo === "rpc")));
  conferir(p.narracaoPath === VOZ_GUARDADA, "a voz guardada vira o caminho da narração", String(p.narracaoPath));
  conferir(p.etapa === "montar", "e a etapa segue direto pra montagem", p.etapa);
  conferir(!p.temporarios.includes(VOZ_GUARDADA), "a voz guardada NÃO entra nos temporários (a faxina apagaria um arquivo dela)");
  conferir(p.narracaoEstornada !== true, "e nada foi marcado como estornado");
}

// ---------- voz gravada pela pessoa: o mesmo caminho ----------
{
  const { chamadas, db } = mundo();
  const { linha, p } = videoDe({ origem: "gravada", arquivo: `uploads/${USUARIO}/5f2a8c1e-9d3b-4e7a-b2c6-0e8d4f1a7c35.webm`, volume: 1, inicio: 0.7 });
  await comFetchEspiao(chamadas, () => avancarVideo(db, "chave-de-mentira", linha as never));
  conferir(chamadas.filter((c) => c.tipo === "fetch").length === 0 && chamadas.filter((c) => c.tipo === "rpc").length === 0, "voz gravada: sem TTS e sem estorno");
  conferir(p.etapa === "montar" && !!p.narracaoPath, "voz gravada segue pra montagem com o arquivo dela");
}

// ---------- 3. TTS que falha: o crédito volta UMA vez ----------
{
  const { chamadas, db } = mundo();
  const { linha, p } = videoDe({ origem: "ia", roteiro: "Apartamento com vista.", voz: "laura" });
  await comFetchEspiao(chamadas, () => avancarVideo(db, "chave-de-mentira", linha as never));
  const rpcs = chamadas.filter((c) => c.tipo === "rpc");
  conferir(chamadas.some((c) => c.tipo === "fetch"), "a voz de IA sem arquivo CHAMA o TTS (é o que custa crédito)");
  conferir(rpcs.length === 1 && rpcs[0].detalhe.includes(`"p_quantidade":${CREDITOS.narracao}`), "o crédito cobrado volta, uma vez, no valor cobrado", JSON.stringify(rpcs));
  conferir(p.narracaoEstornada === true && p.narracaoPath === null, "fica marcado como estornado e sem voz");
  conferir(p.avisos.some((a) => a.includes("o crédito dela voltou")), "e a pessoa é avisada", p.avisos.join(" | "));

  // A etapa pode ser repetida (a chamada anterior caiu depois de estornar).
  p.etapa = "narracao";
  const segunda = mundo();
  await comFetchEspiao(segunda.chamadas, () => avancarVideo(segunda.db, "chave-de-mentira", { ...(linha as object), pipeline: p } as never));
  conferir(segunda.chamadas.filter((c) => c.tipo === "rpc").length === 0, "repetir a etapa não estorna de novo", JSON.stringify(segunda.chamadas.filter((c) => c.tipo === "rpc")));
}

// ---------- 4. o DELETE nunca apaga a voz guardada ----------
{
  // Estático: a rota apaga output_path, thumb_path e os `temporarios` do pipeline. A voz
  // guardada mora em `narracaoPath`, que nunca entra em `temporarios` (conferido acima).
  const rota = fs.readFileSync(path.join(RAIZ, "src", "app", "api", "video", "[id]", "route.ts"), "utf8");
  const delet = rota.slice(rota.indexOf("export async function DELETE"));
  conferir(!delet.includes("narracaoPath"), "o DELETE não conhece o caminho da narração");
  conferir(/apagarEntradas\(db, arquivos\)/.test(delet) && /limparTemporarios\(db, video\.pipeline/.test(delet), "o DELETE apaga só o vídeo, a miniatura e os temporários", delet.slice(delet.indexOf("const arquivos"), delet.indexOf("await db.from(\"videos\").delete")).replace(/\s+/g, " "));

  const apagados: string[] = [];
  const db = {
    storage: {
      from() {
        return {
          async remove(lista: string[]) {
            apagados.push(...lista);
            return { data: null, error: null };
          },
        };
      },
    },
  };
  const p = pipelineInicial(10);
  p.narracaoPath = VOZ_GUARDADA;
  p.temporarios = [`tmp/videos/${USUARIO}/abc/m0.mp4`];
  p.saida = `${USUARIO}/videos/abc.mp4`;
  await limparTemporarios(db as never, p);
  conferir(!apagados.includes(VOZ_GUARDADA), "limparTemporarios não encosta na voz guardada", JSON.stringify(apagados));
  conferir(apagados.length === 2, "apaga o clipe temporário e o mp4 que não virou vídeo pronto", JSON.stringify(apagados));
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
