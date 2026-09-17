// O SANEADOR com áudio em trechos (docs/planos/linha-do-tempo-spec.md, A1-A5, B8; pacote P1).
//
//   I4  todo espec sem `audios` sai byte a byte igual ao retrato de ANTES
//       (fixtures/especs-saneadas-antes.json: 20 à mão + 300 sorteados, recusas incluídas);
//   I1  limpar o que já foi limpo não muda nada, nem gera aviso -- em todos os casos com
//       nome, nos 300 sorteados antigos e em 50 sorteados versao 2;
//   I3  versao 2 que cabe no formato antigo volta pra ele (e iguala o antigo byte a byte);
//       o que sai com `audios` nunca caberia;
//   I5  cada chave de trecho sobrevive, na ordem; o `arquivo` da voz de IA sobrevive;
//       `de`/`ate` do Release 2 ainda NÃO são lidos (R2-B), e declarar o tipo não mudou nada;
//   e mais: `arquivo` de IA só pelo formato do pipeline; tabela de custo; erros de limite;
//   avisos exatos; ids; ordem; fades; `precisaDoEditor`; ida e volta do formato antigo.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-saneador-linha.ts
//
// Não toca banco, rede, nem API paga: é só o saneador.

import fs from "node:fs";
import path from "node:path";
import { deepStrictEqual } from "node:assert";
import {
  EFEITOS_SONOROS,
  LIMITES,
  MUSICAS,
  VOZ_PADRAO,
  canonizarAudio,
  custoDoVideo,
  ehAudioLegado,
  itensDeAudioDoEspec,
  limparAudios,
  limparEspec,
  precisaDoEditor,
  relogioDoEspec,
  type EspecVideo,
  type ItemAudio,
} from "../src/lib/video.ts";
import { ESPECS_ANTIGAS, especsSorteadas } from "./fixtures/especs-antigas.ts";
import { COLAPSAM, ESPECS_LINHA, ESPECS_R2, ESPECS_V2, RECUSADOS, especsV2Sorteadas } from "./fixtures/especs-linha.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
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
const lista = (nomes: string[]) => (nomes.length ? nomes.slice(0, 4).join(", ") + (nomes.length > 4 ? ` (+${nomes.length - 4})` : "") : "");

const ANTES: Record<string, string> = JSON.parse(fs.readFileSync(path.join(RAIZ, "scripts", "fixtures", "especs-saneadas-antes.json"), "utf8"));
const SORTEADAS = especsSorteadas();
const V2_SORTEADAS = especsV2Sorteadas(50);
const CHAVES_MUSICA = ["id", "fonte", "noVideo", "corteArquivo", "duracao", "volume", "fadeEntrada", "fadeSaida", "laco"];
const CHAVES_VOZ = ["id", "fonte", "noVideo", "corteArquivo", "duracao", "volume", "fadeEntrada", "fadeSaida"];
/** A ordem de chaves que o saneador promete (A2): as ausentes somem, as presentes seguem esta ordem. */
const ordemCerta = (a: ItemAudio) => {
  const esperada = (a.fonte.tipo === "musica" ? CHAVES_MUSICA : CHAVES_VOZ).filter((k) => k in a);
  return JSON.stringify(Object.keys(a)) === JSON.stringify(esperada) && JSON.stringify(Object.keys(a.fonte)) === JSON.stringify(a.fonte.tipo === "musica" ? ["tipo", "id"] : ["tipo"]);
};
const s = (bruto: unknown) => limparEspec(bruto);

// ---------- I4: o retrato de antes ----------
{
  const entradas: Record<string, unknown> = { ...ESPECS_ANTIGAS, ...SORTEADAS };
  const nomes = Object.keys(ANTES);
  const semEntrada = nomes.filter((n) => !(n in entradas));
  const diferentes: string[] = [];
  let recusas = 0;
  for (const nome of nomes) {
    const r = s(entradas[nome]);
    if (!r.espec) recusas++;
    if (JSON.stringify(r.espec) !== ANTES[nome]) diferentes.push(nome);
  }
  conferir(nomes.length === 320 && semEntrada.length === 0, "I4 · o retrato tem 320 casos e cada um tem a sua entrada", `${nomes.length} casos · sem entrada: ${lista(semEntrada) || "nenhum"}`);
  conferir(diferentes.length === 0, "I4 · todo espec sem `audios` sai byte a byte igual ao de antes", diferentes.length ? lista(diferentes) : `${nomes.length}/${nomes.length}`);
  conferir(recusas === 17 && nomes.filter((n) => ANTES[n] === "null").length === 17, "I4 · as 17 recusas continuam recusas", `${recusas}`);
}

// ---------- I1: idempotência ----------
{
  const casos: Record<string, unknown> = { ...ESPECS_LINHA, ...SORTEADAS, ...V2_SORTEADAS };
  const quebrados: string[] = [];
  const comAviso: string[] = [];
  let saneados = 0;
  for (const [nome, bruto] of Object.entries(casos)) {
    const S = s(bruto).espec;
    if (!S) continue;
    saneados++;
    const de_novo = s(S);
    // igual() é o da spec (A5); a string é mais forte: pega chave que mudou de ordem.
    if (!igual(de_novo.espec, S) || JSON.stringify(de_novo.espec) !== JSON.stringify(S)) quebrados.push(nome);
    if ((de_novo.avisos ?? []).length) comAviso.push(nome);
  }
  const nV2 = Object.values(V2_SORTEADAS).filter((b) => s(b).espec).length;
  conferir(quebrados.length === 0, "I1 · limpar o saneado devolve o mesmo espec, byte a byte", quebrados.length ? lista(quebrados) : `${saneados} casos`);
  conferir(comAviso.length === 0, "I1 · o saneado não gera aviso nenhum na segunda passada", lista(comAviso));
  const comAudios = Object.values(V2_SORTEADAS).filter((b) => s(b).espec?.audios).length;
  conferir(nV2 >= 35 && comAudios >= 20, "I1 · os 50 sorteados versao 2 exercitam os dois caminhos", `${nV2} passam · ${comAudios} saem com audios · ${nV2 - comAudios} voltam ao antigo · ${50 - nV2} recusados`);

  // Os sorteados versao 2 saem sempre dentro do contrato.
  const fora: string[] = [];
  for (const [nome, bruto] of Object.entries(V2_SORTEADAS)) {
    const S = s(bruto).espec;
    if (!S) continue;
    if (!S.audios) {
      if ("versao" in S) fora.push(`${nome}: versao sem audios`);
      continue;
    }
    const total = relogioDoEspec(S).total;
    const ids = S.audios.map((a) => a.id);
    const ordenado = [...S.audios].sort((a, b) => a.noVideo - b.noVideo || (a.fonte.tipo === b.fonte.tipo ? (a.id < b.id ? -1 : 1) : a.fonte.tipo === "musica" ? -1 : 1));
    if (S.versao !== 2 || S.musica !== "nenhuma" || S.musicaVolume !== LIMITES.musicaVolumePadrao) fora.push(`${nome}: cabeça`);
    if (S.narracao && ("inicio" in S.narracao || "volume" in S.narracao)) fora.push(`${nome}: narração com tempo`);
    if (!S.narracao && S.audios.some((a) => a.fonte.tipo === "voz")) fora.push(`${nome}: voz sem narração`);
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9]{8}$/.test(id))) fora.push(`${nome}: ids`);
    if (JSON.stringify(ordenado) !== JSON.stringify(S.audios)) fora.push(`${nome}: ordem`);
    for (const a of S.audios) {
      if (!ordemCerta(a)) fora.push(`${nome}: chaves ${Object.keys(a)}`);
      if (a.noVideo < 0 || a.noVideo > Math.round((total - LIMITES.audioMin) * 100) / 100) fora.push(`${nome}: noVideo ${a.noVideo}`);
      if (a.duracao !== undefined && Math.round((a.fadeEntrada + a.fadeSaida) * 100) > Math.round(a.duracao * 100)) fora.push(`${nome}: fades ${a.fadeEntrada}+${a.fadeSaida} > ${a.duracao}`);
      if (a.volume < 0 || a.volume > (a.fonte.tipo === "musica" ? 1 : 2)) fora.push(`${nome}: volume`);
    }
    if (S.audios.filter((a) => a.fonte.tipo === "musica").length > 8 || S.audios.filter((a) => a.fonte.tipo === "voz").length > 8) fora.push(`${nome}: limite`);
  }
  conferir(fora.length === 0, "I1 · sorteados versao 2: ids, ordem, chaves, faixas e cabeçalho dentro do contrato", lista(fora));
}

// ---------- I3: forma canônica ----------
{
  const legadoComAudios: string[] = [];
  for (const [nome, bruto] of Object.entries({ ...ESPECS_V2, ...V2_SORTEADAS })) {
    const S = s(bruto).espec;
    if (S?.audios && (ehAudioLegado(S.audios) || S.versao !== 2)) legadoComAudios.push(nome);
  }
  conferir(legadoComAudios.length === 0, "I3 · o que sai com `audios` nunca caberia no formato antigo", lista(legadoComAudios));

  for (const [nome, antigo] of Object.entries(COLAPSAM)) {
    const S = s(ESPECS_V2[nome]).espec;
    const volta = !!S && !("audios" in S) && !("versao" in S);
    conferir(volta && (antigo === null || JSON.stringify(S) === ANTES[antigo]), `I3 · ${nome} volta ao formato antigo${antigo ? ` e iguala ${antigo} byte a byte` : ""}`, S ? `musica ${S.musica} · narração ${JSON.stringify(S.narracao)?.slice(0, 60)}` : "recusado");
  }
  const naoColapsam = Object.keys(ESPECS_V2).filter((n) => !(n in COLAPSAM) && !(n in RECUSADOS));
  const semAudios = naoColapsam.filter((n) => !s(ESPECS_V2[n]).espec?.audios);
  conferir(semAudios.length === 0, "I3 · os outros casos versao 2 continuam versao 2", lista(semAudios) || `${naoColapsam.length} casos`);

  // Cada regra do formato antigo, uma de cada vez: quebrar qualquer uma já não cabe.
  const m = (x: Partial<ItemAudio> = {}): ItemAudio => ({ id: "musica00", fonte: { tipo: "musica", id: "calma" }, noVideo: 0, corteArquivo: 0, volume: 0.8, fadeEntrada: 1, fadeSaida: 2, laco: true, ...x });
  const z = (x: Partial<ItemAudio> = {}): ItemAudio => ({ ...VOZ_PADRAO, ...x });
  const regras: [string, ItemAudio[], boolean][] = [
    ["nada", [], true],
    ["música e voz de sempre", [m(), z()], true],
    ["voz em 0 e em 10, volume 0,2 e 2", [z({ noVideo: 0, volume: 0.2 }), m({ volume: 0 })], true],
    ["voz em 10 com volume 2", [z({ noVideo: 10, volume: 2 }), m({ volume: 1 })], true],
    ["música sem `laco` (ausente = laço)", [m({ laco: undefined })], true],
    ["duas músicas", [m(), m({ id: "musica01" })], false],
    ["duas vozes", [z(), z({ id: "voz00001" })], false],
    ["música em 0,01", [m({ noVideo: 0.01 })], false],
    ["música com corte", [m({ corteArquivo: 0.01 })], false],
    ["música com duração", [m({ duracao: 30 })], false],
    ["música sem laço", [m({ laco: false })], false],
    ["música com fade 1/2,01", [m({ fadeSaida: 2.01 })], false],
    ["música com fade 0/2", [m({ fadeEntrada: 0 })], false],
    ["voz com corte", [z({ corteArquivo: 0.5 })], false],
    ["voz com duração", [z({ duracao: 3 })], false],
    ["voz com fade", [z({ fadeEntrada: 0.1 })], false],
    ["voz em 10,1", [z({ noVideo: 10.1 })], false],
    ["voz em 3,25 (centésimo)", [z({ noVideo: 3.25 })], false],
    ["voz com volume 0,19", [z({ volume: 0.19 })], false],
  ];
  const erradas = regras.filter(([, itens, esperado]) => ehAudioLegado(itens) !== esperado).map(([nome]) => nome);
  conferir(erradas.length === 0, "I3 · ehAudioLegado: cada regra do formato antigo, isolada", lista(erradas) || `${regras.length} regras`);

  // Ida e volta: todo espec antigo saneado vira trechos e volta exatamente ao que era.
  const naoVoltam: string[] = [];
  for (const [nome, bruto] of Object.entries({ ...ESPECS_ANTIGAS, ...SORTEADAS })) {
    const S = s(bruto).espec;
    if (!S) continue;
    const c = canonizarAudio({ itens: itensDeAudioDoEspec(S), narracao: S.narracao, musicaVolume: S.musicaVolume ?? LIMITES.musicaVolumePadrao });
    const ok = !c.audios && !c.versao && c.musica === S.musica && c.musicaVolume === S.musicaVolume && JSON.stringify(c.narracao) === JSON.stringify(S.narracao);
    if (!ok) naoVoltam.push(nome);
  }
  conferir(naoVoltam.length === 0, "I3 · espec antigo → itensDeAudioDoEspec → canonizarAudio devolve musica, volume e narração iguais", lista(naoVoltam));
  const v2Voltam: string[] = [];
  for (const [nome, bruto] of Object.entries({ ...ESPECS_V2, ...V2_SORTEADAS })) {
    const S = s(bruto).espec;
    if (!S?.audios) continue;
    const c = canonizarAudio({ itens: itensDeAudioDoEspec(S), narracao: S.narracao, musicaVolume: S.musicaVolume ?? LIMITES.musicaVolumePadrao });
    if (JSON.stringify(c) !== JSON.stringify({ musica: S.musica, musicaVolume: S.musicaVolume, narracao: S.narracao, audios: S.audios, versao: 2 })) v2Voltam.push(nome);
  }
  conferir(v2Voltam.length === 0, "I3 · espec versao 2 → trechos → canonizarAudio devolve o mesmo áudio", lista(v2Voltam));
  const semVoz = canonizarAudio({ itens: [m()], narracao: { origem: "gravada", arquivo: "uploads/u/v.webm" }, musicaVolume: 0.8 });
  conferir(semVoz.narracao === null && !semVoz.audios, "I3 · canonizarAudio: narração sem trecho de voz some (caminho de defesa)");
  const vozSemNarracao = canonizarAudio({ itens: [m({ corteArquivo: 3 }), z({ noVideo: 2 })], narracao: null, musicaVolume: 0.8 });
  conferir(vozSemNarracao.audios?.length === 1 && vozSemNarracao.audios[0].fonte.tipo === "musica", "I3 · canonizarAudio: sem narração, trecho de voz é ignorado");
}

// ---------- I5: o que tem que sobreviver ----------
{
  const faltando: string[] = [];
  const vistas = new Set<string>();
  for (const [nome, bruto] of Object.entries({ ...ESPECS_V2, ...V2_SORTEADAS })) {
    const S = s(bruto).espec;
    if (!S?.audios) continue;
    for (const a of S.audios) {
      Object.keys(a).forEach((k) => vistas.add(`${a.fonte.tipo}.${k}`));
      if (!ordemCerta(a)) faltando.push(`${nome}/${a.id}`);
    }
    const de_novo = s(S).espec;
    if (JSON.stringify(de_novo?.audios) !== JSON.stringify(S.audios)) faltando.push(`${nome}: audios`);
  }
  const todas = [...CHAVES_MUSICA.map((k) => `musica.${k}`), ...CHAVES_VOZ.map((k) => `voz.${k}`)];
  const nuncaVistas = todas.filter((k) => !vistas.has(k));
  conferir(faltando.length === 0 && nuncaVistas.length === 0, "I5 · toda chave de ItemAudio aparece, na ordem da spec, e sobrevive à segunda passada", lista(faltando) || lista(nuncaVistas) || `${todas.length} chaves vistas`);

  const reaproveitado = s(ESPECS_V2.v2_voz_ia_com_arquivo_reaproveitado).espec;
  const reaproveitadoAntigo = s(ESPECS_V2.v2_equivalente_voz_ia_com_arquivo).espec;
  const esperado = (ESPECS_V2.v2_voz_ia_com_arquivo_reaproveitado.narracao as { arquivo: string }).arquivo;
  conferir(
    reaproveitado?.narracao?.arquivo === esperado && s(reaproveitado).espec?.narracao?.arquivo === esperado && JSON.stringify(Object.keys(reaproveitado.narracao)) === '["origem","roteiro","voz","arquivo"]',
    "I5 · o `arquivo` da voz de IA sobrevive na versao 2 (e na segunda passada), sem inicio/volume",
    JSON.stringify(reaproveitado?.narracao && Object.keys(reaproveitado.narracao))
  );
  conferir(
    reaproveitadoAntigo?.narracao?.arquivo === esperado && JSON.stringify(Object.keys(reaproveitadoAntigo.narracao)) === '["origem","roteiro","voz","arquivo","volume","inicio"]' && !reaproveitadoAntigo.audios,
    "I5 · e no formato antigo, na ordem origem, roteiro, voz, arquivo, volume, inicio",
    JSON.stringify(reaproveitadoAntigo?.narracao && Object.keys(reaproveitadoAntigo.narracao))
  );

  // Release 2: o tipo foi declarado, o saneador ainda não lê. Hoje `de`/`ate` somem e o
  // resto sai igual ao mesmo espec sem eles -- quando o R2-B entrar, este bloco muda.
  const semJanela = (e: unknown) => JSON.parse(JSON.stringify(e, (k, v) => (k === "de" || k === "ate" ? undefined : v)));
  for (const [nome, bruto] of Object.entries(ESPECS_R2)) {
    const S = s(bruto).espec;
    const texto = JSON.stringify(S);
    conferir(!!S && JSON.stringify(s(semJanela(bruto)).espec) === texto && !/"(de|ate)":/.test(texto), `I5 · ${nome}: \`de\`/\`ate\` ainda não são lidos (R2-B), o resto sai igual`);
  }
}

// ---------- voz de IA: `arquivo` só no formato do pipeline ----------
{
  const IA = { origem: "ia", roteiro: "Apartamento de três quartos no Setor Bueno.", voz: "daniel" };
  const uuid = "7c2e9f4a-3b6d-4d1e-8a5f-1e0b9c7d2a64";
  const base = { ...ESPECS_ANTIGAS.musica_so };
  const arquivoDe = (narracao: unknown) => s({ ...base, narracao }).espec?.narracao?.arquivo;
  const bons = [`uploads/${uuid}/voz-${uuid}.mp3`, "uploads/00000000-0000-0000-0000-000000000000/voz-ffffffff-ffff-ffff-ffff-ffffffffffff.mp3"];
  const ruins = [
    `uploads/${uuid}/voz-${uuid}.wav`,
    `uploads/${uuid}/${uuid}.mp3`,
    `uploads/${uuid.toUpperCase()}/voz-${uuid}.mp3`,
    `uploads/u1/voz-${uuid}.mp3`,
    `resultados/${uuid}/voz-${uuid}.mp3`,
    `uploads/${uuid}/voz-${uuid}.mp3/../../x.mp3`,
    `/uploads/${uuid}/voz-${uuid}.mp3`,
    `uploads/${uuid}/voz-${uuid}.mp3 `,
    "uploads/u1/voz.webm",
    "../../etc/senha",
    42,
  ];
  conferir(bons.every((a) => arquivoDe({ ...IA, arquivo: a }) === a), "IA · `arquivo` no formato do pipeline é guardado");
  const passaram = ruins.filter((a) => arquivoDe({ ...IA, arquivo: a }) !== undefined);
  conferir(passaram.length === 0 && ruins.every((a) => s({ ...base, narracao: { ...IA, arquivo: a } }).espec?.narracao?.roteiro === IA.roteiro), "IA · qualquer outro `arquivo` some, e a narração continua (vai pro TTS)", lista(passaram.map(String)));
  conferir(arquivoDe({ roteiro: IA.roteiro, voz: "laura", arquivo: bons[0] }) === bons[0], "IA · espec sem `origem` (sempre IA) também reaproveita");
  conferir(s({ ...base, narracao: { ...IA, roteiro: "Curto", arquivo: bons[0] } }).espec?.narracao === null, "IA · `arquivo` não salva narração sem roteiro: continua sem voz");
  conferir(arquivoDe({ origem: "gravada", arquivo: `uploads/${uuid}/voz-${uuid}.mp3` }) === `uploads/${uuid}/voz-${uuid}.mp3` && arquivoDe({ origem: "gravada", arquivo: "uploads/u1/voz.webm" }) === "uploads/u1/voz.webm", "gravada · a regra de arquivo de sempre, sem mudança");
  const semArquivo = JSON.stringify(s({ ...base, narracao: IA }).espec?.narracao);
  conferir(semArquivo === `{"origem":"ia","roteiro":"${IA.roteiro}","voz":"daniel","volume":1,"inicio":0.7}`, "IA · sem `arquivo`, a mesma narração de antes", semArquivo);
}

// ---------- custo (B8) ----------
{
  const uuid = "7c2e9f4a-3b6d-4d1e-8a5f-1e0b9c7d2a64";
  const IA = { origem: "ia", roteiro: "Apartamento de três quartos no Setor Bueno.", voz: "daniel" };
  const duasAnimadas = (ESPECS_ANTIGAS.doze_cenas_transicoes_mistas.cenas as { tipo: string }[]).filter((c) => c.tipo === "animada").length;
  const custo = (extra: Record<string, unknown>, base = ESPECS_ANTIGAS.musica_so) => {
    const S = s({ ...base, ...extra }).espec;
    return S ? custoDoVideo(S) : NaN;
  };
  const tabela: [string, number, number][] = [
    ["sem voz, sem cena animada", custo({ narracao: null }), 0],
    ["voz de IA sem arquivo", custo({ narracao: IA }), 1],
    ["voz de IA com arquivo reaproveitado", custo({ narracao: { ...IA, arquivo: `uploads/${uuid}/voz-${uuid}.mp3` } }), 0],
    ["voz de IA com arquivo fora do formato (vira TTS)", custo({ narracao: { ...IA, arquivo: `uploads/${uuid}/voz-${uuid}.wav` } }), 1],
    ["voz de IA sem origem (espec antigo)", custo({ narracao: { roteiro: IA.roteiro, voz: "laura" } }), 1],
    ["voz gravada", custo({ narracao: { origem: "gravada", arquivo: `uploads/${uuid}/a.webm` } }), 0],
    ["voz enviada", custo({ narracao: { origem: "enviada", arquivo: `uploads/${uuid}/a.mp3` } }), 0],
    [`${duasAnimadas} cenas animadas, sem voz`, custo({ narracao: null }, ESPECS_ANTIGAS.doze_cenas_transicoes_mistas), 2 * duasAnimadas],
    [`${duasAnimadas} animadas + IA sem arquivo`, custo({ narracao: IA }, ESPECS_ANTIGAS.doze_cenas_transicoes_mistas), 2 * duasAnimadas + 1],
    [`${duasAnimadas} animadas + IA com arquivo`, custo({ narracao: { ...IA, arquivo: `uploads/${uuid}/voz-${uuid}.mp3` } }, ESPECS_ANTIGAS.doze_cenas_transicoes_mistas), 2 * duasAnimadas],
    ["versao 2 com IA reaproveitada", ((S) => (S ? custoDoVideo(S) : NaN))(s(ESPECS_V2.v2_voz_ia_com_arquivo_reaproveitado).espec), 0],
    ["versao 2 com IA estimada", ((S) => (S ? custoDoVideo(S) : NaN))(s(ESPECS_V2.v2_voz_ia_estimada_movida_12_3).espec), 1],
    ["página rápida (1 animada + IA)", ((S) => (S ? custoDoVideo(S) : NaN))(s(ESPECS_ANTIGAS.pagina_rapida).espec), 3],
  ];
  for (const [oque, obtido, esperado] of tabela) conferir(obtido === esperado, `custo · ${oque} = ${esperado}`, String(obtido));
}

// ---------- limites e avisos ----------
{
  for (const [nome, erro] of Object.entries(RECUSADOS)) {
    const r = s(ESPECS_V2[nome]);
    conferir(r.espec === null && r.erro === erro && r.avisos === undefined, `limite · ${nome} recusa com "${erro}"`, String(r.erro));
  }
  const oito = (tipo: "musica" | "voz") =>
    Array.from({ length: 8 }, (_, i) => ({ id: `${tipo.slice(0, 3)}${i}yyyy`, fonte: tipo === "musica" ? { tipo, id: "calma" } : { tipo }, noVideo: i, duracao: 1, volume: 1, fadeEntrada: 0, fadeSaida: 0 }));
  const cheio = limparAudios([...oito("musica"), ...oito("voz")], 17.2, true);
  conferir(cheio.erro === null && cheio.audios.length === LIMITES.audiosMax, "limite · 8 músicas + 8 vozes = 16 trechos passam", String(cheio.erro));
  const nonoForaDoVideo = limparAudios([...oito("musica"), { fonte: { tipo: "musica", id: "calma" }, noVideo: 17 }], 17.2, true);
  conferir(nonoForaDoVideo.erro === null && nonoForaDoVideo.audios.length === 8, "limite · o limite conta DEPOIS de descartar (9ª música depois do fim não derruba)", String(nonoForaDoVideo.erro));

  // 3 fotos de 3s + tela final com corte: total 12,76, e 12,76 − 0,3 dá 12,459999… no ponto
  // flutuante (38 de 300 combinações reais de cena e emenda fazem isso). Um trecho no último
  // início permitido não pode sair por causa do ruído.
  const corte3 = { ...ESPECS_ANTIGAS.musica_so, transicao: "corte", cenas: (ESPECS_ANTIGAS.musica_so.cenas as Record<string, unknown>[]).map((c) => ({ ...c, duracao: 3 })) };
  const totalCorte3 = s(corte3).espec ? relogioDoEspec(s(corte3).espec as EspecVideo).total : NaN;
  const ultimo = s({ ...corte3, musica: "nenhuma", audios: [{ id: "ult00001", fonte: { tipo: "musica", id: "calma" }, noVideo: 12.46, fadeEntrada: 0, fadeSaida: 0 }], versao: 2 });
  conferir(totalCorte3 === 12.76 && totalCorte3 - LIMITES.audioMin < 12.46 && ultimo.espec?.audios?.[0]?.noVideo === 12.46 && ultimo.avisos?.length === 0, "limite · trecho no último início (12,46 num vídeo de 12,76) fica, apesar do ponto flutuante", `total ${totalCorte3} · ${JSON.stringify(ultimo.avisos)}`);

  const avisosDe = (nome: string) => s(ESPECS_V2[nome]).avisos ?? [];
  const vsn = s(ESPECS_V2.v2_voz_sem_narracao);
  conferir(
    JSON.stringify(vsn.avisos) === JSON.stringify(["Um trecho de voz foi ignorado: o vídeo não tem narração."]) && vsn.espec?.audios?.length === 1 && vsn.espec.audios[0].fonte.tipo === "musica" && vsn.espec.narracao === null,
    "aviso · voz sem narração: o trecho de voz sai, com aviso",
    JSON.stringify(vsn.avisos)
  );
  const nsv = s(ESPECS_V2.v2_narracao_sem_voz);
  conferir(
    nsv.espec?.narracao === null && JSON.stringify(nsv.avisos) === JSON.stringify(["A narração estava ligada, mas sem trecho de voz na linha do tempo: o vídeo sai sem voz."]) && custoDoVideo(nsv.espec) === 0,
    "aviso · narração sem trecho de voz: narração null, com aviso, e não cobra a voz",
    JSON.stringify(nsv.avisos)
  );
  const fim = s(ESPECS_V2.v2_trecho_depois_do_fim);
  conferir(
    JSON.stringify(fim.espec?.audios?.map((a) => `${a.id}@${a.noVideo}`)) === JSON.stringify(["fim00001@0", "fim00002@16.9"]) && JSON.stringify(fim.avisos) === JSON.stringify(["Um trecho de áudio começava depois do fim do vídeo e ficou de fora."]),
    "aviso · trecho depois do fim sai (17,0 num vídeo de 17,2); em 16,9 fica",
    JSON.stringify(fim.espec?.audios?.map((a) => `${a.id}@${a.noVideo}`))
  );
  const tipo = s(ESPECS_V2.v2_tipo_desconhecido);
  conferir(
    tipo.espec?.audios?.length === 1 && JSON.stringify(tipo.avisos) === JSON.stringify(["Um trecho de áudio de tipo desconhecido foi ignorado."]),
    "aviso · tipo desconhecido (efeito, música inexistente, \"nenhuma\", null, texto) sai com UM aviso",
    JSON.stringify(tipo.avisos)
  );
  const tortos = avisosDe("v2_valores_tortos");
  conferir(JSON.stringify(tortos) === JSON.stringify(["Um trecho de áudio começava depois do fim do vídeo e ficou de fora."]), "aviso · valor fora de faixa não avisa, só o trecho descartado", JSON.stringify(tortos));
  const limpo = s(ESPECS_V2.v2_musica_aparada);
  conferir(Array.isArray(limpo.avisos) && limpo.avisos.length === 0 && Array.isArray(s(ESPECS_ANTIGAS.musica_so).avisos) && s(ESPECS_ANTIGAS.musica_so).avisos?.length === 0, "aviso · sem nada descartado, `avisos` vem vazio (com e sem audios)");
  const recusaAntiga = s({ formato: "3:4" });
  conferir(recusaAntiga.espec === null && recusaAntiga.avisos === undefined, "aviso · recusa antiga continua sem `avisos`");
}

// ---------- limparAudios: ids, ordem, faixas, fades ----------
{
  const ids = s(ESPECS_V2.v2_ids_invalidos).espec?.audios?.map((a) => `${a.id}@${a.noVideo}`);
  conferir(
    JSON.stringify(ids) === JSON.stringify(["a0000001@0", "a0000002@2", "dup00001@4", "a0000003@6", "a0000000@8", "a0000005@10"]),
    "ids · válido fica; inválido, número, repetido e ausente viram \"a\"+posição, sem tomar um válido de mais adiante",
    JSON.stringify(ids)
  );
  const ordem = s(ESPECS_V2.v2_ordem_no_mesmo_instante).espec?.audios?.map((a) => `${a.fonte.tipo}:${a.id}@${a.noVideo}`);
  conferir(JSON.stringify(ordem) === JSON.stringify(["voz:aaaa0002@1", "musica:aaaa0001@2", "musica:bbbb0001@2", "voz:zzzz0001@2"]), "ordem · pelo segundo, música antes de voz, id desempata", JSON.stringify(ordem));

  const tortos = s(ESPECS_V2.v2_valores_tortos).espec?.audios ?? [];
  const esperado = [
    { id: "tor00001", fonte: { tipo: "musica", id: "minimal" }, noVideo: 0, corteArquivo: 0, duracao: 2, volume: 1, fadeEntrada: 0.85, fadeSaida: 1.14, laco: true },
    { id: "tor00002", fonte: { tipo: "voz" }, noVideo: 2.5, corteArquivo: 600, duracao: 0.3, volume: 0, fadeEntrada: 0, fadeSaida: 0.3 },
  ];
  conferir(JSON.stringify(tortos) === JSON.stringify(esperado), "faixas · noVideo torto = 0, corte até 600, duração mín 0,3, volume 0-1/0-2, fade até 5 e encolhido na proporção (pra baixo), laço só na música", JSON.stringify(tortos));

  const cru = (x: Record<string, unknown>) => limparAudios([{ id: "abcd1234", fonte: { tipo: "musica", id: "calma" }, ...x }], 20, false).audios[0];
  conferir(!("duracao" in cru({ duracao: null })) && !("duracao" in cru({ duracao: "" })) && !("duracao" in cru({})), "faixas · duração null, vazia ou ausente = até o fim (chave ausente, nunca undefined)");
  conferir(cru({}).volume === LIMITES.musicaVolumePadrao && cru({}).laco === true && cru({ laco: false }).laco === false && cru({}).fadeEntrada === 0, "faixas · música sem volume = padrão; laço ausente = true; fade ausente = 0");
  conferir(limparAudios([{ fonte: { tipo: "voz" } }], 20, true).audios[0].volume === 1, "faixas · voz sem volume = 1");
  const fadeCabe = cru({ duracao: 0.3, fadeEntrada: 0.1, fadeSaida: 0.2 });
  conferir(fadeCabe.fadeEntrada === 0.1 && fadeCabe.fadeSaida === 0.2, "fades · 0,1 + 0,2 cabem em 0,3 (sem cair no ruído do ponto flutuante)", `${fadeCabe.fadeEntrada}/${fadeCabe.fadeSaida}`);
  const fadeTerco = cru({ duracao: 1, fadeEntrada: 1, fadeSaida: 2 });
  conferir(fadeTerco.fadeEntrada === 0.33 && fadeTerco.fadeSaida === 0.66, "fades · 1 + 2 em 1s viram 0,33 + 0,66", `${fadeTerco.fadeEntrada}/${fadeTerco.fadeSaida}`);
  for (const naoLista of [undefined, null, {}, "[]", 3]) {
    const r = limparAudios(naoLista, 20, true);
    conferir(r.audios.length === 0 && r.avisos.length === 0 && r.erro === null, `entrada · ${JSON.stringify(naoLista) ?? "undefined"} não é lista: nada, sem aviso`);
  }
  const naoLista = s({ ...ESPECS_ANTIGAS.voz_ia_inicio_3_3, audios: { 0: "x" }, versao: 2 });
  conferir(JSON.stringify(naoLista.espec) === ANTES.voz_ia_inicio_3_3, "entrada · `audios` que não é lista não liga o caminho novo (nem `versao: 2` sozinho)");
  const efeito = s(ESPECS_V2.v2_efeito_sonoro_nao_muda).espec;
  conferir(efeito?.efeitoSonoro === "clique" && !!efeito.audios, "efeito sonoro · não muda com a versao 2");
  conferir(
    JSON.stringify(itensDeAudioDoEspec({ musica: "nenhuma", narracao: { origem: "gravada", arquivo: "x" } } as EspecVideo)) === JSON.stringify([VOZ_PADRAO]),
    "VOZ_PADRAO · é o trecho de uma narração antiga sem inicio nem volume (0,7s, volume 1)"
  );
  conferir(Object.isFrozen(VOZ_PADRAO), "VOZ_PADRAO · congelado (copie antes de mudar)");
  const antigoComMusica = itensDeAudioDoEspec(s(ESPECS_ANTIGAS.voz_ia_inicio_10).espec as EspecVideo);
  conferir(
    JSON.stringify(antigoComMusica) ===
      JSON.stringify([
        { id: "musica00", fonte: { tipo: "musica", id: "sereno" }, noVideo: 0, corteArquivo: 0, volume: 0.55, fadeEntrada: 1, fadeSaida: 2, laco: true },
        { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 10, corteArquivo: 0, volume: 0.8, fadeEntrada: 0, fadeSaida: 0 },
      ]),
    "itensDeAudioDoEspec · espec antigo vira música do 0 (fade 1/2, laço) e voz em `inicio`",
    JSON.stringify(antigoComMusica)
  );
}

// ---------- precisaDoEditor ----------
{
  const naoVao: string[] = [];
  for (const [nome, bruto] of Object.entries({ ...ESPECS_V2, ...V2_SORTEADAS })) {
    const S = s(bruto).espec;
    if (S?.audios && !precisaDoEditor(S)) naoVao.push(`${nome} (saneado)`);
    if (!precisaDoEditor(bruto as Parameters<typeof precisaDoEditor>[0])) naoVao.push(nome);
  }
  conferir(naoVao.length === 0, "precisaDoEditor · todo espec versao 2 (bruto e saneado) vai pro editor", lista(naoVao));
  conferir(!precisaDoEditor(s(ESPECS_ANTIGAS.pagina_rapida).espec as EspecVideo), "precisaDoEditor · a página rápida continua fora do editor");
}

// ---------- catálogo: segundos ----------
{
  const semSegundos = [...MUSICAS, ...EFEITOS_SONOROS].filter((x) => (x.arquivo ? !(typeof x.segundos === "number" && x.segundos > 0) : x.segundos !== null)).map((x) => x.id);
  conferir(semSegundos.length === 0, "catálogo · toda faixa com arquivo tem `segundos`; \"nenhuma\"/\"nenhum\" têm null", lista(semSegundos));
  const musicas45 = MUSICAS.filter((m) => m.arquivo).every((m) => Math.abs((m.segundos ?? 0) - 45) <= 0.01);
  const relatorio: Record<string, number> = { brilho: 2.912, clique: 2.005, impacto: 2.912, passagem: 2.603, sino: 2.859, toque: 2.005 };
  const efeitosCertos = EFEITOS_SONOROS.filter((e) => e.arquivo).every((e) => Math.abs((e.segundos ?? 0) - relatorio[e.id]) <= 0.01);
  conferir(musicas45 && efeitosCertos, "catálogo · músicas 45s e efeitos com os valores do relatório (±0,01)", EFEITOS_SONOROS.map((e) => `${e.id} ${e.segundos}`).join(" · "));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
