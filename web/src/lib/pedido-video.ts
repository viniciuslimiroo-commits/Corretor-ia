import { custoDoVideo, limparEspec, vozDeIA, type EspecVideo, type Narracao } from "./video";
import { limparResumoEdicao, type ResumoEdicao } from "./resumo-edicao";

// O PEDIDO DE VÍDEO, fora da rota.
//
// Tudo que decide se um POST /api/video pode virar vídeo -- sanear o espec, conferir que
// cada foto, a voz e o clipe do Você são da pessoa, e conferir a voz de IA reaproveitada --
// mora aqui, porque um arquivo de rota só exporta handlers (web/AGENTS.md) e nada disso
// pode ficar sem teste: é o caminho onde um pedido forjado encostaria na cobrança.
//
// O banco e o storage entram por `deps`: o teste passa funções de mentira e roda o caminho
// inteiro sem banco, sem storage e sem crédito.

export type JobDaCena = { id: string; status: string; input_path: string | null; output_path: string | null };

export type DependenciasDoPedido = {
  /** Os jobs DA PESSOA entre os ids pedidos. Quem não é dela simplesmente não volta. */
  jobsDoUsuario(ids: string[]): Promise<JobDaCena[]>;
  /** Existe um arquivo com esse nome exato nessa pasta do bucket privado? */
  existeNoBucket(pasta: string, nome: string): Promise<boolean>;
};

export type RecusaDoPedido = { status: 400 | 409; error: string; codigo?: string };

export type PedidoDeVideo = { ok: true; espec: EspecVideo; avisos: string[]; resumo: ResumoEdicao | null } | ({ ok: false } & RecusaDoPedido);

/** `uploads/<usuário>/voz-<uuid>.mp3` -- o formato exato que o pipeline grava (VP:528). */
function regexDaVozGuardada(userId: string): RegExp {
  return new RegExp(`^uploads/${userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/voz-[0-9a-f-]{36}\\.mp3$`);
}

/**
 * A voz de IA que volta REAPROVEITADA custa 0 crédito (`custoDoVideo`), então ela é o único
 * campo do espec em que uma string inventada vira dinheiro. Duas conferências, nesta ordem:
 *
 *   1. o NOME tem que ser o que o nosso pipeline grava, na pasta da pessoa -- qualquer outro
 *      arquivo do bucket dela (uma foto, um áudio enviado) seria "voz de graça";
 *   2. o arquivo tem que EXISTIR. Se não existe, o vídeo sairia mudo depois de cobrar 0.
 *      Melhor recusar com 409 e deixar a tela decidir do que gravar de novo cobrando sem
 *      avisar -- mudança de preço calada é o que ninguém perdoa.
 *
 * Roda ANTES da conta do custo.
 */
export async function validarNarracaoReaproveitada(
  espec: Pick<EspecVideo, "narracao">,
  userId: string,
  existeNoBucket: DependenciasDoPedido["existeNoBucket"]
): Promise<RecusaDoPedido | null> {
  const n = espec.narracao;
  if (!n?.arquivo || !vozDeIA(n)) return null;
  if (!regexDaVozGuardada(userId).test(n.arquivo)) return { status: 400, error: "Narração reaproveitada não reconhecida." };
  const barra = n.arquivo.lastIndexOf("/");
  const existe = await existeNoBucket(n.arquivo.slice(0, barra), n.arquivo.slice(barra + 1));
  if (!existe) {
    return { status: 409, error: "A narração de IA guardada não foi encontrada. Gerar de novo grava a voz outra vez (1 crédito).", codigo: "voz_reaproveitada_ausente" };
  }
  return null;
}

/**
 * Do corpo do POST até o espec pronto pra cobrar e gravar. Devolve os avisos do saneamento
 * (o que ficou de fora e por quê) e o resumo da edição já limpo.
 *
 * A ordem importa: sanear, conferir dono de tudo, conferir a voz reaproveitada -- e só
 * depois disso a rota calcula o custo e debita.
 */
export async function prepararPedidoDeVideo(corpo: unknown, userId: string, deps: DependenciasDoPedido): Promise<PedidoDeVideo> {
  const c = (corpo ?? {}) as { espec?: unknown; resumo?: unknown };
  const limpo = limparEspec(c.espec);
  if (!limpo.espec) return { ok: false, status: 400, error: limpo.erro ?? "Pedido inválido." };
  const espec = limpo.espec;

  // Cada foto tem que ser da pessoa e estar pronta. Conferido AQUI, antes de debitar:
  // ninguém paga por um vídeo que não tinha como ser montado.
  const jobIds = [...new Set(espec.cenas.map((cena) => cena.jobId).filter((x): x is string => !!x))];
  if (jobIds.length) {
    const jobs = await deps.jobsDoUsuario(jobIds);
    const porId = new Map(jobs.map((j) => [j.id, j]));
    for (const cena of espec.cenas) {
      if (!cena.jobId) continue;
      const j = porId.get(cena.jobId);
      if (!j || j.status !== "concluido" || !j.output_path) return { ok: false, status: 400, error: "Uma das fotos escolhidas não está pronta ou não é sua." };
      if (cena.tipo === "antes_depois" && !j.input_path) return { ok: false, status: 400, error: "Uma das fotos não tem a original guardada pra fazer antes e depois." };
    }
  }
  for (const cena of espec.cenas) {
    if (cena.arquivo && !cena.arquivo.startsWith(`uploads/${userId}/`)) return { ok: false, status: 400, error: "Arquivo enviado não reconhecido." };
  }
  // A voz própria é um arquivo do bucket como qualquer outro: tem que ser DELA.
  if (espec.narracao?.arquivo && !espec.narracao.arquivo.startsWith(`uploads/${userId}/`)) {
    return { ok: false, status: 400, error: "Áudio de narração não reconhecido." };
  }
  if (espec.apresentador?.arquivo && !espec.apresentador.arquivo.startsWith(`uploads/${userId}/`)) {
    return { ok: false, status: 400, error: "Vídeo do apresentador não reconhecido." };
  }

  const recusa = await validarNarracaoReaproveitada(espec, userId, deps.existeNoBucket);
  if (recusa) return { ok: false, ...recusa };

  // O resumo da edição (só o editor completo manda) vai pro pipeline, nunca pro espec.
  // Torto, velho ou ausente vira null e não entra: o vídeo não depende dele.
  return { ok: true, espec, avisos: limpo.avisos, resumo: limparResumoEdicao(c.resumo, new Date()) };
}

// ---- o que foi cobrado, e o que pode voltar ----
//
// Regra de cobrança tem TRÊS lados: quanto se cobra, o que se executa e o que se devolve
// quando a execução falha. Os três moram no mesmo lugar de propósito. O defeito clássico é
// o estorno devolver um valor de TABELA enquanto a cobrança passou a ser outra: no instante
// em que a voz de IA reaproveitada passou a custar 0, um estorno fixo de 1 crédito viraria
// emissão de saldo -- e uma queda do provedor de TTS bastaria pra disparar sozinha, sem
// ninguém forjar nada.

/**
 * Quantos créditos a NARRAÇÃO deste vídeo custou. Perguntado à PRÓPRIA função de preço (o
 * mesmo espec com e sem narração), pra não existir uma segunda cópia da regra: no dia em
 * que o preço da voz mudar, o estorno muda junto, sem ninguém lembrar deste arquivo.
 */
export function creditosDaNarracao(narracao: Narracao | null | undefined): number {
  const cenas: EspecVideo["cenas"] = [];
  return custoDoVideo({ cenas, narracao: narracao ?? null }) - custoDoVideo({ cenas, narracao: null });
}

/** Quanto devolver AGORA pela narração deste vídeo. 0 = nada (não custou, ou já voltou). */
export function estornoDaNarracao(narracao: Narracao | null | undefined, jaEstornada: boolean | undefined): number {
  return jaEstornada ? 0 : creditosDaNarracao(narracao);
}
