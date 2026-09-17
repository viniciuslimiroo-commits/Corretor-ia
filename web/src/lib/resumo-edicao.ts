// O RESUMO DA EDIÇÃO: o que a pessoa fez no editor completo até pedir o vídeo.
//
// O produto não tem biblioteca de analytics, e não vai ganhar uma por isto. O editor manda
// um resumo curto junto com cada pedido de geração (POST /api/video, campo `resumo`), e ele
// fica em `pipeline.resumoEdicao` -- NUNCA no espec: o saneador do espec não o conhece, e o
// vídeo renderizado sai igual com ou sem ele (docs/planos/linha-do-tempo-decisao.md §4).
//
// Serve pra responder, com números da própria tabela `videos`: quanto tempo do editor
// aberto até gerar (`abertoEm` → `criado_em`), quantos desfazer por vídeo, se as edições
// vêm de arrasto ou de botão (arrasto seguido de desfazer = toque acidental no celular),
// quantas vezes a prévia caiu no silêncio e quantos aparos pararam na borda da cena (o
// portão da Release 3).
//
// Os contadores cobrem o período desde o último pedido bem-sucedido NA MESMA visita ao
// editor; `geracao` numera os pedidos dessa visita (1 = o primeiro).
//
// O navegador é quem conta, então nada daqui é confiável como dado: o servidor passa tudo
// por `limparResumoEdicao`, que devolve null (e o vídeo segue) quando o resumo vem torto.

export type TrilhaResumo = "cenas" | "telaFinal" | "voce" | "voz" | "musica" | "textos" | "titulo" | "adesivos" | "legendas";

export type ResumoEdicao = {
  v: 1;
  abertoEm: string;
  geracao: number;
  desfazer: number;
  refazer: number;
  edicoes: Partial<Record<TrilhaResumo, { arraste: number; botao: number }>>;
  faixasAbertas: number;
  aparosNaBorda: number;
  previaSemSom: number;
  dispositivo: "celular" | "desktop";
};

/** Na ordem em que saem no resumo limpo -- a ordem do pedido não importa. */
export const TRILHAS_RESUMO: readonly TrilhaResumo[] = ["cenas", "telaFinal", "voce", "voz", "musica", "textos", "titulo", "adesivos", "legendas"];

/** Teto de cada contador. Uma pessoa não desfaz cem mil vezes; um navegador com defeito, sim. */
export const CONTADOR_MAX = 100_000;
export const GERACAO_MAX = 1000;

/** O editor aberto há mais de dois dias não mede "tempo até gerar": mede uma aba esquecida. */
const ABERTO_HA_NO_MAXIMO_MS = 48 * 60 * 60 * 1000;
/** Folga pro relógio do celular adiantado. Mais que isso é relógio errado, não fuso. */
const ABERTO_NO_FUTURO_NO_MAXIMO_MS = 5 * 60 * 1000;

// Data e hora com fuso, como `Date.toISOString()` escreve. "2026-09-17" ou uma hora sem fuso
// o `Date.parse` aceitaria -- e leria no fuso do SERVIDOR, que não é o da pessoa.
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** O que se conta fora das edições por trilha. */
export type EventoResumo = "desfazer" | "refazer" | "faixasAbertas" | "aparosNaBorda" | "previaSemSom";
export type ViaEdicao = "arraste" | "botao";

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Inteiro entre min e max. Fração é truncada; texto, NaN e infinito viram o padrão. */
function inteiroEntre(v: unknown, min: number, max: number, padrao: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return padrao;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

/**
 * Valida o resumo vindo do navegador. `agora` é a hora do servidor no pedido.
 *
 * Devolve null quando não dá pra confiar no conjunto: não é objeto, `v` não é 1, ou
 * `abertoEm` não é data com fuso dentro de [agora − 48h, agora + 5min]. Contador torto não
 * derruba o resumo: vira 0 (ou o teto); `geracao` fica entre 1 e 1000; trilha desconhecida e
 * chave a mais são descartadas; `dispositivo` que não é "celular" vira "desktop".
 */
export function limparResumoEdicao(bruto: unknown, agora: Date): ResumoEdicao | null {
  if (!ehObjeto(bruto) || bruto.v !== 1) return null;
  const agoraMs = agora.getTime();
  if (!Number.isFinite(agoraMs)) return null;
  const a = bruto.abertoEm;
  if (typeof a !== "string" || a.length > 40 || !ISO_COM_FUSO.test(a)) return null;
  const abertoMs = Date.parse(a);
  if (!Number.isFinite(abertoMs)) return null;
  if (abertoMs < agoraMs - ABERTO_HA_NO_MAXIMO_MS || abertoMs > agoraMs + ABERTO_NO_FUTURO_NO_MAXIMO_MS) return null;

  const contador = (v: unknown) => inteiroEntre(v, 0, CONTADOR_MAX, 0);
  const edicoes: ResumoEdicao["edicoes"] = {};
  if (ehObjeto(bruto.edicoes)) {
    for (const t of TRILHAS_RESUMO) {
      const e = bruto.edicoes[t];
      if (ehObjeto(e)) edicoes[t] = { arraste: contador(e.arraste), botao: contador(e.botao) };
    }
  }
  return {
    v: 1,
    abertoEm: new Date(abertoMs).toISOString(),
    geracao: inteiroEntre(bruto.geracao, 1, GERACAO_MAX, 1),
    desfazer: contador(bruto.desfazer),
    refazer: contador(bruto.refazer),
    edicoes,
    faixasAbertas: contador(bruto.faixasAbertas),
    aparosNaBorda: contador(bruto.aparosNaBorda),
    previaSemSom: contador(bruto.previaSemSom),
    dispositivo: bruto.dispositivo === "celular" ? "celular" : "desktop",
  };
}

/**
 * A contagem de UMA visita ao editor, sem React: um objeto com a conta dentro das próprias
 * funções. O gancho (components/editor/usar-resumo-edicao.ts) guarda um destes num
 * `useState` e só chama as funções em efeito e em evento -- nunca durante o render.
 */
export function criarContagemDaEdicao() {
  let abertoEm: string | null = null;
  let geracao = 1;
  let eventos: Record<EventoResumo, number> = { desfazer: 0, refazer: 0, faixasAbertas: 0, aparosNaBorda: 0, previaSemSom: 0 };
  let edicoes: ResumoEdicao["edicoes"] = {};
  const somar = (n: number) => Math.min(CONTADOR_MAX, n + 1);
  return {
    /** A hora em que o editor abriu. Só a primeira vale: o efeito roda duas vezes em dev. */
    abrir(agora: Date) {
      abertoEm ??= agora.toISOString();
    },
    registrar(evento: EventoResumo) {
      eventos = { ...eventos, [evento]: somar(eventos[evento]) };
    },
    registrarEdicao(trilha: TrilhaResumo, via: ViaEdicao) {
      const atual = edicoes[trilha] ?? { arraste: 0, botao: 0 };
      edicoes = { ...edicoes, [trilha]: { ...atual, [via]: somar(atual[via]) } };
    },
    resumo(dispositivo: ResumoEdicao["dispositivo"], agora: Date): ResumoEdicao {
      // Cópia na ordem de TRILHAS_RESUMO: quem recebe o resumo não segura a conta viva.
      const copia: ResumoEdicao["edicoes"] = {};
      for (const t of TRILHAS_RESUMO) {
        const e = edicoes[t];
        if (e) copia[t] = { ...e };
      }
      return {
        v: 1,
        abertoEm: abertoEm ?? agora.toISOString(),
        geracao,
        desfazer: eventos.desfazer,
        refazer: eventos.refazer,
        edicoes: copia,
        faixasAbertas: eventos.faixasAbertas,
        aparosNaBorda: eventos.aparosNaBorda,
        previaSemSom: eventos.previaSemSom,
        dispositivo,
      };
    },
    /** Pedido aceito pelo servidor: os contadores recomeçam e o próximo pedido é o seguinte. */
    aposGerar() {
      eventos = { desfazer: 0, refazer: 0, faixasAbertas: 0, aparosNaBorda: 0, previaSemSom: 0 };
      edicoes = {};
      geracao = Math.min(GERACAO_MAX, geracao + 1);
    },
  };
}

export type ContagemDaEdicao = ReturnType<typeof criarContagemDaEdicao>;
