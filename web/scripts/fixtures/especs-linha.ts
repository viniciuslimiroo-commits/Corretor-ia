// Especs da LINHA DO TEMPO: os antigos (importados, não copiados) e os novos, com áudio em
// trechos (versao 2) e com janela de texto e peça (Release 2) -- docs/planos/linha-do-tempo-spec.md,
// seção F1.
//
//   ESPECS_ANTIGAS   (fixtures/especs-antigas.ts) o que o navegador manda hoje;
//   ESPECS_V2        o que o editor com trechos de áudio manda: cortado, dividido,
//                    deslizado, sem laço, movido; os que voltam ao formato antigo; e os
//                    tortos (ids ruins, voz sem narração, narração sem voz, acima do limite,
//                    trecho depois do fim);
//   ESPECS_R2        `de`/`ate` em textos e peças. SÓ DADOS por enquanto: o saneador ainda
//                    não lê esses campos (entra no pacote R2-B);
//   especsV2Sorteadas()  especs versao 2 sorteados com semente fixa, com valor torto.
//
// Usado por scripts/testar-saneador-linha.ts (P1) e pelos testes da biblioteca da linha do
// tempo e do pedido (P2, P3). Caso novo entra no FIM de cada lista, e as listas do sorteio
// estão escritas aqui (não lidas dos catálogos) pelo mesmo motivo de especs-antigas.ts: o
// sorteio tem que ser a mesma entrada em qualquer commit.

import { ESPECS_ANTIGAS } from "./especs-antigas.ts";

type Espec = Record<string, unknown>;

const USUARIO = "7c2e9f4a-3b6d-4d1e-8a5f-1e0b9c7d2a64";
/** A voz de IA como o pipeline grava (VP:517): o formato que o saneador aceita pra reaproveitar. */
const VOZ_IA_GRAVADA = `uploads/${USUARIO}/voz-2b9e7c41-0d3a-4f68-9a15-c7e2d8b4f309.mp3`;

/** A narração do espec antigo sem `inicio` e `volume`: na versao 2 o tempo mora no trecho. */
function semTempo(n: unknown): Espec {
  return Object.fromEntries(Object.entries(n as Espec).filter(([k]) => k !== "inicio" && k !== "volume"));
}

function musica(id: string, extra: Espec = {}): Espec {
  return { id: "musica00", fonte: { tipo: "musica", id }, noVideo: 0, corteArquivo: 0, volume: 0.8, fadeEntrada: 1, fadeSaida: 2, laco: true, ...extra };
}

function voz(extra: Espec = {}): Espec {
  return { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 0.7, corteArquivo: 0, volume: 1, fadeEntrada: 0, fadeSaida: 0, ...extra };
}

/** Como o editor manda um vídeo com trechos: `musica` "nenhuma", volume padrão, narração sem tempo. */
function v2(base: Espec, audios: unknown[], extra: Espec = {}): Espec {
  return { ...base, musica: "nenhuma", musicaVolume: 0.8, ...(base.narracao ? { narracao: semTempo(base.narracao) } : {}), ...extra, audios, versao: 2 };
}

// O vídeo base (doEditor em especs-antigas.ts): cenas de 4, 5 e 6s + tela final, dissolver.
// Total 17,2s; o último início permitido de um trecho é 17,2 − 0,3 = 16,9s.

export const ESPECS_V2: Record<string, Espec> = {
  v2_musica_aparada: v2(ESPECS_ANTIGAS.musica_so, [musica("elegante", { duracao: 9.5 })]),
  // Dividida em 5s e 10s, com o pedaço do meio apagado.
  v2_musica_dividida_em_3_sem_o_meio: v2(ESPECS_ANTIGAS.musica_so, [
    musica("elegante", { id: "k3m9p2x7", duracao: 5, fadeSaida: 0 }),
    musica("elegante", { id: "q8w1e5r4", noVideo: 10, corteArquivo: 10, fadeEntrada: 0 }),
  ]),
  v2_musica_deslizada_corte_12: v2(ESPECS_ANTIGAS.musica_so, [musica("elegante", { corteArquivo: 12 })]),
  v2_musica_sem_laco: v2(ESPECS_ANTIGAS.musica_so, [musica("epico", { laco: false })]),
  v2_musica_em_laco_movida_para_3: v2(ESPECS_ANTIGAS.musica_so, [musica("elegante", { noVideo: 3 })]),

  v2_voz_dividida_em_2: v2(ESPECS_ANTIGAS.voz_gravada_volume_0_2, [
    musica("calma"),
    voz({ id: "v1a2b3c4", volume: 0.2, duracao: 4 }),
    voz({ id: "v5d6e7f8", noVideo: 6, corteArquivo: 5.3, volume: 0.2 }),
  ]),
  v2_voz_musica_voce_inicio_2_5: v2(
    ESPECS_ANTIGAS.voz_enviada_musica_volume_0_8333,
    [musica("lounge", { fadeEntrada: 0.5, fadeSaida: 1.5, volume: 0.65 }), voz({ noVideo: 1.25 })],
    { apresentador: { ...(ESPECS_ANTIGAS.voce_rodape_inicio_0.apresentador as Espec), inicio: 2.5 } }
  ),
  // Voz de IA já gerada: dá pra cortar, e volta com o arquivo pra não gravar (nem cobrar) de novo.
  v2_voz_ia_com_arquivo_reaproveitado: v2(
    ESPECS_ANTIGAS.voz_ia_inicio_3_3,
    [musica("calma"), voz({ noVideo: 3.3, volume: 1.2, duracao: 6 })],
    { narracao: { ...semTempo(ESPECS_ANTIGAS.voz_ia_inicio_3_3.narracao), arquivo: VOZ_IA_GRAVADA } }
  ),
  // Voz de IA ainda não gerada (bloco estimado): só se move. 12,3s não cabe no formato antigo (teto 10).
  v2_voz_ia_estimada_movida_12_3: v2(ESPECS_ANTIGAS.voz_ia_inicio_0, [musica("calma"), voz({ noVideo: 12.3 })]),

  // ---- equivalentes ao antigo: saem do saneador no formato antigo (ver COLAPSAM) ----
  v2_equivalente_musica_so: v2(ESPECS_ANTIGAS.musica_so, [musica("elegante")]),
  v2_equivalente_voz_ia_3_3: v2(ESPECS_ANTIGAS.voz_ia_inicio_3_3, [musica("calma"), voz({ noVideo: 3.3, volume: 1.2 })]),
  v2_equivalente_voz_gravada_2: v2(ESPECS_ANTIGAS.voz_gravada_volume_2, [musica("aconchego"), voz({ noVideo: 1.5, volume: 2 })]),
  v2_equivalente_sem_audio: v2(ESPECS_ANTIGAS.musica_nenhuma_volume_0_3, [], { musicaVolume: 0.3 }),
  v2_equivalente_voz_ia_com_arquivo: v2(ESPECS_ANTIGAS.voz_ia_inicio_0, [musica("calma"), voz({ noVideo: 0 })], {
    narracao: { ...semTempo(ESPECS_ANTIGAS.voz_ia_inicio_0.narracao), arquivo: VOZ_IA_GRAVADA },
  }),

  // ---- tortos ----
  v2_ids_invalidos: v2(ESPECS_ANTIGAS.musica_so, [
    musica("elegante", { id: "MUSICA00", fadeEntrada: 0, fadeSaida: 0 }),
    musica("elegante", { id: 12345678, noVideo: 2, fadeEntrada: 0, fadeSaida: 0 }),
    musica("elegante", { id: "dup00001", noVideo: 4, fadeEntrada: 0, fadeSaida: 0 }),
    musica("elegante", { id: "dup00001", noVideo: 6, fadeEntrada: 0, fadeSaida: 0 }),
    musica("elegante", { id: "a0000000", noVideo: 8, fadeEntrada: 0, fadeSaida: 0 }),
    musica("elegante", { id: undefined, noVideo: 10, fadeEntrada: 0, fadeSaida: 0 }),
  ]),
  v2_voz_sem_narracao: v2(ESPECS_ANTIGAS.musica_so, [musica("elegante", { corteArquivo: 4 }), voz({ id: "z9y8x7w6", noVideo: 2 })], { narracao: null }),
  v2_narracao_sem_voz: v2(ESPECS_ANTIGAS.voz_ia_inicio_3_3, [musica("calma", { corteArquivo: 5 })]),
  v2_acima_do_limite_musica: v2(
    ESPECS_ANTIGAS.musica_so,
    Array.from({ length: 9 }, (_, i) => musica("elegante", { id: `mus${i}xxxx`, noVideo: i * 1.5, duracao: 1.5, fadeEntrada: 0, fadeSaida: 0 }))
  ),
  v2_acima_do_limite_voz: v2(
    ESPECS_ANTIGAS.voz_gravada_volume_2,
    Array.from({ length: 9 }, (_, i) => voz({ id: `voz${i}xxxx`, noVideo: i * 1.5, corteArquivo: i * 1.5, duracao: 1.5 }))
  ),
  // 17,0 passa do último início (16,9) e sai com aviso; 16,9 fica.
  v2_trecho_depois_do_fim: v2(ESPECS_ANTIGAS.musica_so, [
    musica("elegante", { id: "fim00001", duracao: 8 }),
    musica("sereno", { id: "fim00002", noVideo: 16.9, corteArquivo: 3, fadeEntrada: 0, fadeSaida: 0 }),
    musica("sereno", { id: "fim00003", noVideo: 17, fadeEntrada: 0, fadeSaida: 0 }),
  ]),
  v2_tipo_desconhecido: v2(ESPECS_ANTIGAS.musica_so, [
    musica("elegante", { corteArquivo: 2 }),
    { id: "efe00001", fonte: { tipo: "efeito", id: "clique" }, noVideo: 1 },
    musica("rock", { id: "roc00001", noVideo: 3 }),
    musica("nenhuma", { id: "nen00001", noVideo: 4 }),
    null,
    "voz",
  ]),
  v2_valores_tortos: v2(ESPECS_ANTIGAS.voz_gravada_volume_2, [
    musica("minimal", { id: "tor00001", noVideo: "abc", corteArquivo: -3, duracao: 2, volume: 5, fadeEntrada: 3, fadeSaida: 4, laco: "nao" }),
    voz({ id: "tor00002", noVideo: "2.5", corteArquivo: 9999, duracao: 0.1, volume: -1, fadeEntrada: null, fadeSaida: 99, laco: true }),
    musica("minimal", { id: "tor00003", noVideo: 1e9, fadeEntrada: 1, fadeSaida: 2, duracao: null }),
  ]),
  // Mesmo instante: música antes de voz, e o id desempata.
  v2_ordem_no_mesmo_instante: v2(ESPECS_ANTIGAS.voz_gravada_volume_2, [
    voz({ id: "zzzz0001", noVideo: 2 }),
    musica("calma", { id: "bbbb0001", noVideo: 2, duracao: 3 }),
    musica("calma", { id: "aaaa0001", noVideo: 2, duracao: 3 }),
    voz({ id: "aaaa0002", noVideo: 1 }),
  ]),
  v2_efeito_sonoro_nao_muda: v2(ESPECS_ANTIGAS.efeito_clique_sem_musica_sem_voz, [musica("verao", { noVideo: 5, duracao: 6 })]),
};

/** Equivalente ao antigo → o espec antigo cujo saneado ele tem que igualar byte a byte (null = sem par no retrato). */
export const COLAPSAM: Record<string, string | null> = {
  v2_equivalente_musica_so: "musica_so",
  v2_equivalente_voz_ia_3_3: "voz_ia_inicio_3_3",
  v2_equivalente_voz_gravada_2: "voz_gravada_volume_2",
  v2_equivalente_sem_audio: "musica_nenhuma_volume_0_3",
  v2_equivalente_voz_ia_com_arquivo: null,
};

/** Os que o saneador recusa, com a mensagem. */
export const RECUSADOS: Record<string, string> = {
  v2_acima_do_limite_musica: "No máximo 8 trechos de música.",
  v2_acima_do_limite_voz: "No máximo 8 trechos de voz.",
};

// ---- Release 2: janela de texto e peça dentro da cena. Só dados até o R2-B. ----

function comJanelas(textos: Espec[], elementos: Espec[]): Espec {
  const base = ESPECS_ANTIGAS.musica_so;
  const cenas = base.cenas as Espec[];
  return { ...base, cenas: [{ ...cenas[0], duracao: 5, textos, elementos }, ...cenas.slice(1)] };
}

export const ESPECS_R2: Record<string, Espec> = {
  r2_janela_dentro_da_cena: comJanelas(
    [{ texto: "Sala ampla", posicao: "base", estilo: "faixa", animacao: "surgir", de: 1, ate: 3 }],
    [{ id: "adesivo:chave", ancora: "topo_dir", animacao: "surgir", de: 0.5, ate: 4 }]
  ),
  // Fora da cena de 5s: volta pra dentro (de 0, ate = fim da cena, ou seja, ausentes).
  r2_janela_fora_da_cena: comJanelas(
    [{ texto: "R$ 690.000", posicao: "centro", estilo: "destaque", animacao: "nenhuma", de: -2, ate: 99 }],
    [{ id: "selo_redondo", texto: "Exclusivo", ancora: "topo_esq", animacao: "piscar", de: 6, ate: 7 }]
  ),
  // Menor que janelaMin (0,5s): cresce pra frente; colada no fim, cresce pra trás.
  r2_janela_menor_que_min: comJanelas(
    [
      { texto: "Suíte", posicao: "topo", estilo: "etiqueta", animacao: "nenhuma", de: 2, ate: 2.2 },
      { texto: "Vista", posicao: "base", estilo: "faixa", animacao: "nenhuma", de: 4.8, ate: 5 },
    ],
    []
  ),
};

/** Todos os casos com nome: antigos, versao 2 e Release 2. */
export const ESPECS_LINHA: Record<string, Espec> = { ...ESPECS_ANTIGAS, ...ESPECS_V2, ...ESPECS_R2 };

// ---------------------------------------------------------------------------------------
// Sorteados versao 2. Mesmo gerador de especs-antigas.ts (TR:31-35), outra semente.

const TIPOS_FONTE = ["musica", "musica", "musica", "voz", "voz", "efeito", undefined];
const MUSICAS_FONTE = ["calma", "elegante", "epico", "verao", "lounge", "nenhuma", "rock", 7];
const LETRAS_ID = "abcdefghijklmnopqrstuvwxyz0123456789";
const NOMES_BASE = ["musica_so", "voz_ia_inicio_3_3", "voz_gravada_volume_0_2", "voz_enviada_musica_volume_0_8333", "tela_final_desligada", "doze_cenas_transicoes_mistas", "pagina_rapida", "legendas_40", "voce_duracao_5", "musica_nenhuma_volume_0_3"];

export function especsV2Sorteadas(quantos = 50, sementeInicial = 20260918): Record<string, Espec> {
  let semente = sementeInicial;
  const acaso = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const escolher = <T,>(l: T[]) => l[Math.floor(acaso() * l.length)];
  const talvez = (p: number) => acaso() < p;
  const numero = (min: number, max: number) => Math.round((min + acaso() * (max - min)) * 1000) / 1000;

  const saida: Record<string, Espec> = {};
  for (let i = 0; i < quantos; i++) {
    const base = ESPECS_ANTIGAS[escolher(NOMES_BASE)];
    const ids: string[] = [];
    const itens = Array.from({ length: Math.floor(acaso() * 13) }, () => {
      const tipo = escolher(TIPOS_FONTE);
      const idBom = Array.from({ length: 8 }, () => escolher(LETRAS_ID.split(""))).join("");
      const id = talvez(0.6) ? idBom : talvez(0.5) && ids.length ? escolher(ids) : escolher(["MUSICA00", "", 12345678, "abc", undefined]);
      if (typeof id === "string") ids.push(id);
      return {
        ...(id !== undefined ? { id } : {}),
        fonte: tipo === "musica" ? { tipo, id: escolher(MUSICAS_FONTE) } : tipo === undefined ? {} : { tipo },
        noVideo: talvez(0.85) ? numero(-2, 20) : escolher(["3.5", null, "x"]),
        ...(talvez(0.7) ? { corteArquivo: talvez(0.9) ? numero(-5, 60) : 999 } : {}),
        ...(talvez(0.5) ? { duracao: talvez(0.8) ? numero(0, 30) : escolher([null, "x", 0.1, 700]) } : {}),
        volume: numero(-0.5, 2.5),
        fadeEntrada: talvez(0.3) ? 1 : numero(-1, 7),
        fadeSaida: talvez(0.3) ? 2 : numero(-1, 7),
        ...(talvez(0.6) ? { laco: escolher([true, false, "nao"]) } : {}),
      };
    });
    const narracao = talvez(0.3) ? null : base.narracao ? (talvez(0.7) ? semTempo(base.narracao) : base.narracao) : null;
    saida[`v2_sorteado_${String(i).padStart(2, "0")}`] = {
      ...base,
      musica: talvez(0.8) ? "nenhuma" : "calma",
      musicaVolume: escolher([0.8, 0.3, 1]),
      narracao,
      audios: itens,
      ...(talvez(0.8) ? { versao: 2 } : {}),
    };
  }
  return saida;
}
