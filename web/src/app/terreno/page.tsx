"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import Dropzone from "@/components/dropzone";
import SeletorImovel from "@/components/seletor-imovel";
import Compartilhar from "@/components/compartilhar";
import { Aviso, Botao, Cartao, Chip, Icone, Rotulo } from "@/components/ui";
import { ACAO_TERRENO_POR_ID, ACOES_TERRENO, EXTRAS_CASA, LIMITE_TEXTO_LIVRE, TIPOS_REFERENCIA } from "@/lib/terreno-ia";
import { CUSTO_OBRA, ETAPAS_OBRA } from "@/lib/obra-etapas";

// Terreno com medidas. A pessoa toca nos cantos do lote na foto, digita os metros de
// cada lado e a área, e o desenho sai por cima da foto -- na hora, na tela, e depois
// gravado pelo servidor no tamanho cheio. Sem IA: linha reta é linha reta.
//
// Os pontos ficam em fração (0..1) da imagem, então o que se vê no celular é o que sai
// em 2560px no arquivo.

type Ponto = { x: number; y: number };

const CORES = ["#f06b4f", "#2cb1a3", "#0f2d5b", "#e8b800", "#ffffff"];

// Espessura da linha. O fator multiplica a régua do servidor (0,3125% do lado maior da
// foto), então o que a pessoa vê na tela é a mesma proporção que sai no arquivo -- por
// isso o traço da tela é calculado a partir do tamanho medido da caixa, e não um valor
// fixo em pixel. "Média" é o padrão: o antigo traço fino ficava invisível em foto de
// terreno com mato e terra.
const ESPESSURAS = [
  { id: "fina", rotulo: "Fina", fator: 1.2 },
  { id: "media", rotulo: "Média", fator: 2 },
  { id: "grossa", rotulo: "Grossa", fator: 3.2 },
  { id: "extra", rotulo: "Extra", fator: 5 },
];
const PROPORCAO_TRACO = 0.003125; // = 5/1600, a régua do servidor
/** Quantos passos de voltar/seguir a marcação guarda. O mesmo número da planta. */
const LIMITE_HISTORICO = 80;

// O contorno do lote, desenhado três vezes (halo escuro, cor, tracejado branco). Fica
// fora do componente pra não redeclarar a cada tecla digitada nas medidas.
function PolyTerreno({ pontos, fechado, stroke, strokeWidth, fill, dash, opacity }: {
  pontos: Ponto[]; fechado: boolean; stroke: string; strokeWidth: number;
  fill?: string; dash?: string; opacity?: number;
}) {
  const pts = pontos.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
  const comum = {
    points: pts,
    stroke,
    strokeWidth,
    strokeDasharray: dash,
    opacity,
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  return fechado
    ? <polygon {...comum} fill={fill ?? "none"} fillOpacity={fill ? 0.22 : 0} />
    : <polyline {...comum} fill="none" />;
}

export default function Terreno() {
  const c = useConta();
  // O endereço pelo hook do Next, e não por `window.location`: na navegação interna (o link
  // que vem da Planta) a primeira renderização acontece ANTES de a barra mudar, e ler o
  // window devolve vazio -- foi assim que a planta sumia no caminho.
  const parametros = useSearchParams();
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /**
   * Voltar e seguir na marcação do lote (pedido dele: "colocar opção de voltar e seguir
   * aparente"). Antes existia só um "desfazer" de texto pequeno, que tirava o último canto
   * e não tinha volta: errou o arrasto de um canto e não havia como desfazer.
   *
   * Guarda a fotografia dos cantos e das medidas -- é JSON minúsculo. Pilha e posição no
   * MESMO estado, senão saem de sincronia numa atualização em lote. A `chave` funde passos
   * seguidos da mesma origem: arrastar um canto é UM passo, não um por pixel, e digitar uma
   * medida é um passo, não um por letra.
   */
  type Marcacao = { pontos: Ponto[]; medidas: string[] };
  const [hist, setHist] = useState<{ pilha: Marcacao[]; i: number; chave: string | null }>({ pilha: [{ pontos: [], medidas: [] }], i: 0, chave: null });
  const { pontos, medidas } = hist.pilha[hist.i];
  const podeVoltar = hist.i > 0;
  const podeSeguir = hist.i < hist.pilha.length - 1;

  function registrar(muda: (m: Marcacao) => Marcacao, chave: string | null = null) {
    setHist((h) => {
      const base = h.pilha.slice(0, h.i + 1);
      const atual = base[base.length - 1];
      const proximo = muda(atual);
      if (proximo.pontos === atual.pontos && proximo.medidas === atual.medidas) return h;
      if (chave && chave === h.chave && base.length > 1) {
        const nova = [...base.slice(0, -1), proximo];
        return { pilha: nova, i: nova.length - 1, chave };
      }
      const nova = [...base, proximo];
      const cortada = nova.length > LIMITE_HISTORICO ? nova.slice(nova.length - LIMITE_HISTORICO) : nova;
      return { pilha: cortada, i: cortada.length - 1, chave };
    });
  }

  // Mesma assinatura dos setState que substituíram: o resto da tela não mudou.
  const setPontos = (v: Ponto[] | ((l: Ponto[]) => Ponto[]), chave?: string) =>
    registrar((m) => ({ ...m, pontos: typeof v === "function" ? v(m.pontos) : v }), chave ?? null);
  const setMedidas = (v: string[] | ((l: string[]) => string[]), chave?: string) =>
    registrar((m) => ({ ...m, medidas: typeof v === "function" ? v(m.medidas) : v }), chave ?? null);

  const voltar = () => setHist((h) => (h.i > 0 ? { ...h, i: h.i - 1, chave: null } : h));
  const seguir = () => setHist((h) => (h.i < h.pilha.length - 1 ? { ...h, i: h.i + 1, chave: null } : h));
  const [area, setArea] = useState("");
  const [titulo, setTitulo] = useState("");
  const [frente, setFrente] = useState<number>(-1);
  const [cor, setCor] = useState(CORES[0]);
  const [espessura, setEspessura] = useState(ESPESSURAS[1]);
  const [caixaPx, setCaixaPx] = useState(0); // maior lado da caixa, em px de tela
  const [imovelId, setImovelId] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("imovel")));
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ jobId: string; url: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  /**
   * A área do lote como NÚMERO. O campo é texto de propósito (ele digita "430 m²",
   * "sob consulta", "430,5"), mas a ficha do imóvel guarda número -- então só oferece
   * levar pra ficha o que dá pra ler como medida.
   */
  const areaEmNumero = (() => {
    const n = Number(area.replace(/[^0-9,.]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : null;
  })();
  // Chegou com uma planta na mão? Então a ação já começa em "Construir a casa" -- é a única
  // que usa planta, e pedir pra pessoa escolher de novo o que ela acabou de escolher é atrito.
  // Derivado, e não estado com efeito: o React Compiler proíbe setState dentro de efeito, e
  // ler o endereço no `useState` inicial não funciona (na navegação interna a primeira
  // renderização acontece antes de a barra mudar -- medido: a tela abria sem a planta).
  /** O id da planta que veio da outra tela, quando veio. */
  const jobDaUrl = parametros.get("planta");
  const [acaoEscolhida, setAcaoEscolhida] = useState<string | null>(null);
  const acaoIa = acaoEscolhida ?? (jobDaUrl ? "construir" : ACOES_TERRENO[0].id);
  const setAcaoIa = setAcaoEscolhida;
  // A obra é uma sequência, não uma ação: quatro imagens encadeadas, cada uma nascendo da
  // anterior. Por isso tem estado próprio -- o resultado não é UMA imagem.
  const [etapasFeitas, setEtapasFeitas] = useState<{ id: string; rotulo: string; url: string; jobId: string }[]>([]);
  const [etapaAgora, setEtapaAgora] = useState<string | null>(null);
  const [comEquipe, setComEquipe] = useState(false);
  const [camposIa, setCamposIa] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<string[]>(["jardim"]);
  const [textoIa, setTextoIa] = useState("");
  const [referencia, setReferencia] = useState<File | null>(null);
  const [tipoReferencia, setTipoReferencia] = useState(TIPOS_REFERENCIA[0].valor);
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  /**
   * A planta que veio da tela da Planta (/terreno?planta=<jobId>).
   *
   * Ela não vira arquivo: já está no armazenamento, e o servidor a assina pelo id. Por isso
   * é um estado separado da `referencia`, que é upload -- ter os dois no mesmo lugar
   * obrigaria a baixar o PNG só pra subir de volta, que é exatamente o passo que esta ponte
   * existe pra tirar.
   */
  const [urlDaPlanta, setUrlDaPlanta] = useState<string | null>(null);
  const [plantaDispensada, setPlantaDispensada] = useState(false);
  const plantaDoEncena = !jobDaUrl || plantaDispensada ? null : { jobId: jobDaUrl, url: urlDaPlanta };
  const [gerandoIa, setGerandoIa] = useState(false);
  const [areaNaFicha, setAreaNaFicha] = useState<"parado" | "indo" | "erro">("parado");
  /** A metragem que JÁ está na ficha; se ele mudar a área aqui, o "✓" some. */
  const [areaGravada, setAreaGravada] = useState<number | null>(null);
  const [resultadoIa, setResultadoIa] = useState<{ jobId: string; url: string } | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // A miniatura da planta que veio pela URL: o id chega, o endereço da imagem não.
  const jobDaPlanta = plantaDoEncena?.jobId;
  const temUrlDaPlanta = !!plantaDoEncena?.url;
  const temConta = !!c.user;
  const pegarToken = c.token;
  useEffect(() => {
    if (!jobDaPlanta || temUrlDaPlanta || !temConta) return;
    let vivo = true;
    pegarToken()
      .then((t) => fetch(`/api/job/${jobDaPlanta}`, { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => vivo && d?.url && setUrlDaPlanta(d.url))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [jobDaPlanta, temUrlDaPlanta, temConta, pegarToken]);

  // Miniatura da referência. Criada no manipulador do clique, não num efeito: efeito que
  // chama setState em cascata é justamente o que o lint proíbe, e aqui não precisa.
  const urlRef = useRef<string | null>(null);
  function escolherReferencia(f: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = f ? URL.createObjectURL(f) : null;
    setReferencia(f);
    setPreviewRef(urlRef.current);
  }
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  // Mede a caixa pra desenhar na tela a mesma espessura relativa que o servidor grava.
  // O ResizeObserver já dispara uma vez ao observar, então não precisa medir aqui dentro.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCaixaPx(Math.max(e.contentRect.width, e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview, resultado]);

  function receber(f: File) {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(f);
    setPreview(URL.createObjectURL(f));
    limparMarcacao();
    setResultado(null);
    setErro(null);
  }

  function posicao(e: ReactPointerEvent): Ponto | null {
    const r = caixa.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }

  function clicar(e: ReactPointerEvent) {
    if (arrastando !== null || resultado) return;
    const p = posicao(e);
    if (!p || pontos.length >= 12) return;
    // canto e medida NUMA registrada só: senão voltar precisaria de dois cliques
    registrar((m) => ({ pontos: [...m.pontos, p], medidas: [...m.medidas, ""] }));
  }

  function mover(e: ReactPointerEvent) {
    if (arrastando === null) return;
    const p = posicao(e);
    if (!p) return;
    // um arrasto inteiro = UM passo no histórico (a chave funde os pontermove)
    setPontos((lista) => lista.map((q, i) => (i === arrastando ? p : q)), `arrastar:${arrastando}`);
  }

  /** Zera a marcação inteira num passo só (trocar de foto, recomeçar). */
  function limparMarcacao() {
    registrar(() => ({ pontos: [], medidas: [] }));
  }

  /** Botão direito na foto desfaz, sem tirar a mão de cima do desenho. */
  function aoBotaoDireito(e: ReactMouseEvent) {
    e.preventDefault();
    voltar();
  }

  // Ctrl+Z / Ctrl+Shift+Z, os mesmos da planta. Fora de campo de texto: quem está digitando
  // a medida espera que o Ctrl+Z desfaça a DIGITAÇÃO, não o canto.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      const cmd = e.ctrlKey || e.metaKey;
      if (!cmd) return;
      const k = e.key.toLowerCase();
      if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        return seguir();
      }
      if (k === "z") {
        e.preventDefault();
        voltar();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  /** Manda a foto pra IA. Vira job normal: mesma fila, mesmo estorno automático se falhar. */
  async function gerarIa() {
    if (!foto || gerandoIa) return;
    setGerandoIa(true);
    setErro(null);
    setResultadoIa(null);
    try {
      const token = await c.token();
      const f = new FormData();
      f.append("foto", foto);
      f.append("acao", acaoIa);
      f.append("texto", textoIa);
      f.append("extras", extras.join(","));
      for (const campo of acaoTerreno.campos ?? []) f.append(campo.chave, camposIa[campo.chave] ?? campo.padrao);
      if (referencia) {
        f.append("referencia", referencia);
        f.append("tipoReferencia", tipoReferencia);
      } else if (plantaDoEncena) {
        // A planta desenhada aqui vai pelo id: já está no armazenamento.
        f.append("referenciaJobId", plantaDoEncena.jobId);
        f.append("tipoReferencia", "planta");
      }
      if (imovelId) f.append("imovelId", imovelId);
      const r = await fetch("/api/terreno/ia", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      for (let i = 0; i < 40; i++) {
        await new Promise((z) => setTimeout(z, 3000));
        const j = await (await fetch(`/api/job/${d.jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
        if (j.status === "concluido" && j.url) {
          setResultadoIa({ jobId: d.jobId, url: j.url });
          c.recarregar?.();
          return;
        }
        if (j.status === "falhou" || j.error) throw new Error(j.error ?? "A IA não conseguiu. O crédito volta sozinho.");
      }
      throw new Error("Demorou demais. Se o crédito foi cobrado, ele volta sozinho.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setGerandoIa(false);
    }
  }

  /**
   * A obra inteira, etapa por etapa.
   *
   * O encadeamento é o ponto: a etapa 2 recebe a IMAGEM da etapa 1, não a foto do
   * terreno. É o que faz a casa da cobertura ser a mesma casa da alvenaria. Gerar as
   * quatro a partir do lote vazio daria quatro casas diferentes.
   *
   * Cada etapa é um job normal: se o navegador fechar no meio, o que já ficou pronto está
   * salvo na galeria e no imóvel, e o que falhou estorna sozinho.
   */
  async function gerarObra() {
    if (!foto || gerandoIa) return;
    setGerandoIa(true);
    setErro(null);
    setEtapasFeitas([]);
    setResultadoIa(null);
    try {
      const token = await c.token();
      let entrada: File = foto;

      for (const etapa of ETAPAS_OBRA) {
        setEtapaAgora(etapa.id);
        const f = new FormData();
        f.append("foto", entrada);
        f.append("acao", etapa.id);
        f.append("equipe", comEquipe ? "1" : "");
        for (const campo of etapa.campos ?? []) f.append(campo.chave, camposIa[campo.chave] ?? campo.padrao);
        // A mesma referência vai em TODAS as etapas: é a casa final, e a obra inteira tem
        // que estar subindo em direção a ela desde a fundação.
        if (referencia) {
          f.append("referencia", referencia);
          f.append("tipoReferencia", tipoReferencia);
        } else if (plantaDoEncena) {
          f.append("referenciaJobId", plantaDoEncena.jobId);
          f.append("tipoReferencia", "planta");
        }
        if (imovelId) f.append("imovelId", imovelId);

        const r = await fetch("/api/terreno/ia", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);

        let url: string | null = null;
        for (let i = 0; i < 40 && !url; i++) {
          await new Promise((z) => setTimeout(z, 3000));
          const j = await (await fetch(`/api/job/${d.jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
          if (j.status === "concluido" && j.url) url = j.url as string;
          else if (j.status === "falhou" || j.error) throw new Error(j.error ?? `A etapa "${etapa.rotulo}" não saiu. O crédito volta sozinho.`);
        }
        if (!url) throw new Error(`A etapa "${etapa.rotulo}" demorou demais. O crédito volta sozinho.`);

        setEtapasFeitas((lista) => [...lista, { id: etapa.id, rotulo: etapa.rotulo, url: url!, jobId: d.jobId }]);
        // A imagem pronta vira a entrada da próxima. É aqui que a obra fica sendo UMA obra.
        const blob = await (await fetch(url)).blob();
        entrada = new File([blob], `${etapa.id}.jpg`, { type: blob.type || "image/jpeg" });
        c.recarregar?.();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar a obra.");
    } finally {
      setEtapaAgora(null);
      setGerandoIa(false);
    }
  }

  async function gerar() {
    if (!foto || pontos.length < 3) return;
    setGerando(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("foto", foto);
      form.append("pontos", JSON.stringify(pontos));
      form.append("medidas", JSON.stringify(medidas));
      form.append("area", area);
      form.append("titulo", titulo);
      form.append("frente", String(frente));
      form.append("cor", cor);
      form.append("espessura", String(espessura.fator));
      if (imovelId) form.append("imovelId", imovelId);
      const r = await fetch("/api/terreno", { method: "POST", headers: { Authorization: `Bearer ${await c.token()}` }, body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResultado({ jobId: d.jobId, url: d.url });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setGerando(false);
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para marcar terrenos.</Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none";
  const fechado = pontos.length >= 3;
  // "obra" não está em ACOES_TERRENO porque não é uma imagem: é uma sequência de quatro.
  // Entra na mesma fileira de chips porque, pra quem usa, é só mais uma coisa que dá pra
  // fazer com a foto do lote -- a diferença é o preço e o tempo, e os dois estão no botão.
  const ehObra = acaoIa === "obra";
  const acaoTerreno = ehObra
    ? {
        id: "obra",
        rotulo: "Obra do início ao fim",
        descricao: "Quatro imagens encadeadas: fundação, estrutura, cobertura e a casa pronta. Cada uma nasce da anterior, então é a mesma casa subindo.",
        selo: ETAPAS_OBRA[0].selo,
        campos: ETAPAS_OBRA[0].campos,
        // A referência vale nas quatro etapas: a fundação já sai com a pegada daquela
        // casa. É a personalização que nenhuma lista de opções alcança -- a construtora
        // tem UM modelo, e é ele que o corretor precisa mostrar subindo.
        aceitaReferencia: true,
        prompt: () => "",
      }
    : (ACAO_TERRENO_POR_ID[acaoIa] ?? ACOES_TERRENO[0]);
  const traco = Math.max(2, (caixaPx || 640) * PROPORCAO_TRACO * espessura.fator);

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="mb-4 inline-flex rounded-xl border border-neutral-200 bg-white p-1 text-sm">
        <Link href="/editar" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Fotos</Link>
        <span className="flex items-center gap-1.5 rounded-lg bg-marca-indigo/10 px-3 py-1.5 font-medium text-marca-indigo">
          <Icone nome="terreno" className="h-4 w-4" />
          Terreno
        </span>
        <Link href="/planta" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">
          <Icone nome="planta" className="h-4 w-4" />
          Planta
        </Link>
      </div>

      <h1 className="text-2xl font-semibold">Terreno com medidas</h1>
      {/* antes da foto o texto não pode mandar tocar nos cantos: não existe foto pra tocar */}
      <p className="mt-1 text-sm text-neutral-500">
        {foto
          ? "Toque nos cantos do lote, digite os metros de cada lado e a área. Não gasta crédito."
          : "Envie a foto do terreno. Depois dá pra marcar os cantos, as medidas de cada lado e a área total. Não gasta crédito."}
      </p>

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <Cartao className="p-3 sm:p-4">
            {!preview ? (
              <>
                {/* Veio da Planta e ainda não escolheu o lote: sem este aviso a planta parece
                    ter se perdido no caminho, porque as opções de IA só aparecem com a foto. */}
                {plantaDoEncena && (
                  <div className="mb-3 flex items-start gap-3 rounded-xl border-l-4 border-marca-coral bg-marca-pessego/30 px-4 py-3">
                    <Icone nome="planta" className="mt-0.5 h-5 w-5 shrink-0 text-marca-coral" />
                    <p className="text-sm">
                      <span className="font-semibold">Sua planta veio junto.</span> Escolha agora a foto do terreno: a casa vai ser construída nela, inspirada na planta que você desenhou.
                    </p>
                  </div>
                )}
                <Dropzone rotulo="Foto do terreno ou lote" onArquivo={receber} />
              </>
            ) : resultado ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resultado.url} alt="Terreno com medidas" className="w-full rounded-xl" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a href={resultado.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                    <Icone nome="download" className="h-4 w-4" />
                    Baixar
                  </a>
                  <Botao variante="discreta" onClick={() => setResultado(null)}>Ajustar</Botao>
                  <Botao variante="secundaria" onClick={() => { setFoto(null); setPreview(null); limparMarcacao(); setResultado(null); }}>Outra foto</Botao>
                </div>
                <div className="mt-3">
                  <Compartilhar token={c.token} jobId={resultado.jobId} texto="Olha o terreno:" />
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <Rotulo>{pontos.length < 3 ? `Toque nos cantos (${pontos.length}/3 no mínimo)` : `${pontos.length} cantos · arraste pra ajustar`}</Rotulo>
                  <div className="flex items-center gap-3 text-xs">
                    {/* Voltar e seguir à vista, como na planta: errar um canto não pode
                        custar recomeçar, e arrasto errado também se desfaz. */}
                    <span className="flex items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
                      <button
                        onClick={voltar}
                        disabled={!podeVoltar}
                        title="Voltar (Ctrl+Z)"
                        className={"flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium transition " + (podeVoltar ? "bg-white text-marca-indigo shadow-sm hover:bg-marca-indigo hover:text-white" : "text-neutral-300")}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 14L4 9l5-5" />
                          <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
                        </svg>
                        Voltar
                      </button>
                      <button
                        onClick={seguir}
                        disabled={!podeSeguir}
                        title="Seguir (Ctrl+Shift+Z)"
                        className={"flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium transition " + (podeSeguir ? "bg-white text-marca-indigo shadow-sm hover:bg-marca-indigo hover:text-white" : "text-neutral-300")}
                      >
                        Seguir
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 14l5-5-5-5" />
                          <path d="M20 9H9a5 5 0 0 0 0 10h3" />
                        </svg>
                      </button>
                    </span>
                    <button onClick={() => { setFoto(null); setPreview(null); limparMarcacao(); }} className="text-neutral-500 underline">trocar foto</button>
                  </div>
                </div>
                <div
                  ref={caixa}
                  data-marcacao=""
                  className="relative select-none overflow-hidden rounded-xl bg-neutral-100"
                  style={{ touchAction: "none", cursor: "crosshair" }}
                  onPointerDown={clicar}
                  onPointerMove={mover}
                  onPointerUp={() => setArrastando(null)}
                  onContextMenu={aoBotaoDireito}
                  onPointerLeave={() => setArrastando(null)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Terreno" className="block w-full" draggable={false} />
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {pontos.length >= 2 && (
                      <>
                        {/* halo escuro por baixo: é o que faz a linha aparecer sobre mato e terra */}
                        <PolyTerreno pontos={pontos} fechado={fechado} stroke="#000000" strokeWidth={traco * 1.7} opacity={0.4} />
                        <PolyTerreno pontos={pontos} fechado={fechado} stroke={cor} strokeWidth={traco} fill={fechado ? cor : undefined} />
                        <PolyTerreno pontos={pontos} fechado={fechado} stroke="#ffffff" strokeWidth={Math.max(1, traco / 3)} dash={`${traco * 2} ${traco * 1.5}`} opacity={0.9} />
                      </>
                    )}
                  </svg>
                  {pontos.map((p, i) => {
                    const prox = pontos[(i + 1) % pontos.length];
                    const mx = ((p.x + (fechado || i < pontos.length - 1 ? prox.x : p.x)) / 2) * 100;
                    const my = ((p.y + (fechado || i < pontos.length - 1 ? prox.y : p.y)) / 2) * 100;
                    return (
                      <div key={i}>
                        <button
                          type="button"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setArrastando(i);
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                          style={{
                            left: `${p.x * 100}%`,
                            top: `${p.y * 100}%`,
                            width: Math.max(20, traco * 3),
                            height: Math.max(20, traco * 3),
                            border: `${Math.max(2, traco * 0.7)}px solid ${cor}`,
                            cursor: "grab",
                          }}
                          title={`Canto ${i + 1}`}
                        />
                        {(fechado || i < pontos.length - 1) && medidas[i] && (
                          <span className={"pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white " + (i === frente ? "" : "bg-marca-indigo")} style={{ left: `${mx}%`, top: `${my}%`, background: i === frente ? cor : undefined }}>
                            {/m/i.test(medidas[i]) ? medidas[i] : `${medidas[i]} m`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {fechado && area && (
                    <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-marca-indigo shadow" style={{ left: `${(pontos.reduce((s, p) => s + p.x, 0) / pontos.length) * 100}%`, top: `${(pontos.reduce((s, p) => s + p.y, 0) / pontos.length) * 100}%` }}>
                      {/m/i.test(area) ? area : `${area} m²`}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-neutral-500">Marque na ordem, seguindo a borda do lote. No celular, use dois dedos pra dar zoom antes de tocar.</p>
              </>
            )}
          </Cartao>
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-5">
          <Cartao>
            <Rotulo>Medidas de cada lado</Rotulo>
            {pontos.length < 2 ? (
              <p className="text-sm text-neutral-500">Marque os cantos primeiro. Os lados aparecem aqui na ordem.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pontos.map((_, i) => {
                  if (!fechado && i === pontos.length - 1) return null;
                  return (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-20 shrink-0 text-neutral-500">Lado {i + 1}→{((i + 1) % pontos.length) + 1}</span>
                      <input value={medidas[i] ?? ""} onChange={(e) => setMedidas((lista) => lista.map((m, k) => (k === i ? e.target.value : m)), `medida:${i}`)} inputMode="decimal" placeholder="metros" maxLength={16} className={campo} />
                      <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-500" title="Marcar como frente do lote">
                        <input type="radio" name="frente" checked={frente === i} onChange={() => setFrente(i)} className="accent-marca-coral" /> frente
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Área total</span>
                <input value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" placeholder="ex.: 360 m²" maxLength={24} className={campo} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Título (opcional)</span>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Lote 12 · Quadra B" maxLength={40} className={campo} />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-neutral-500">Cor</span>
              {CORES.map((k) => (
                <button key={k} type="button" onClick={() => setCor(k)} className={"h-6 w-6 rounded-full border-2 " + (cor === k ? "border-neutral-800" : "border-neutral-200")} style={{ background: k }} title={k} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-neutral-500">Espessura</span>
              <div className="flex flex-1 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
                {ESPESSURAS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEspessura(e)}
                    title={`Linha ${e.rotulo.toLowerCase()}`}
                    className={"flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs " + (espessura.id === e.id ? "bg-white font-medium text-marca-indigo shadow-sm" : "text-neutral-500 hover:text-neutral-800")}
                  >
                    <span className="inline-block w-4 rounded-full" style={{ height: Math.max(1, Math.round(e.fator)), background: espessura.id === e.id ? cor : "#a3a3a3" }} />
                    {e.rotulo}
                  </button>
                ))}
              </div>
            </div>
          </Cartao>

          {foto && (
            <Cartao>
              {/* Sem preço no título: com a obra, o preço deixou de ser um só. Cada botão
                  diz quanto custa, que é onde a pessoa olha antes de clicar. */}
              <Rotulo>Transformar com IA</Rotulo>
              <p className="text-sm text-neutral-500">
                Quem olha foto de mato não enxerga a casa. Isto é ilustração e sai avisando; as medidas acima continuam exatas e de graça.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ACOES_TERRENO.map((a) => (
                  <Chip key={a.id} ativo={acaoIa === a.id} onClick={() => setAcaoIa(a.id)}>
                    {a.rotulo}
                  </Chip>
                ))}
                <Chip ativo={ehObra} onClick={() => setAcaoIa("obra")}>
                  Obra do início ao fim
                </Chip>
              </div>
              <p className="mt-2 text-xs text-neutral-500">{acaoTerreno.descricao}</p>

              {acaoTerreno.campos?.map((campo) => {
                const escolhido = camposIa[campo.chave] ?? campo.padrao;
                // A explicação da opção ESCOLHIDA, e só dela: mostrar as três de uma vez
                // seria trocar "não sei o que é alto padrão" por três parágrafos a mais
                // numa tela que já tem seis fileiras de botão.
                const ajuda = campo.opcoes.find((o) => o.valor === escolhido)?.ajuda;
                return (
                  <div key={campo.chave} className="mt-3">
                    <span className="mb-1 block text-xs text-neutral-500">{campo.rotulo}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {campo.opcoes.map((o) => (
                        <Chip key={o.valor} ativo={escolhido === o.valor} onClick={() => setCamposIa((c2) => ({ ...c2, [campo.chave]: o.valor }))}>
                          {o.rotulo}
                        </Chip>
                      ))}
                    </div>
                    {ajuda && <p className="mt-1.5 text-xs leading-snug text-neutral-500">{ajuda}</p>}
                  </div>
                );
              })}

              {acaoIa === "construir" && (
                <div className="mt-3">
                  <span className="mb-1 block text-xs text-neutral-500">Incluir</span>
                  <div className="flex flex-wrap gap-1.5">
                    {EXTRAS_CASA.map((e) => (
                      <Chip
                        key={e.valor}
                        ativo={extras.includes(e.valor)}
                        onClick={() => setExtras((l) => (l.includes(e.valor) ? l.filter((v) => v !== e.valor) : [...l, e.valor]))}
                      >
                        {e.rotulo}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {acaoIa === "livre" && (
                <textarea
                  value={textoIa}
                  onChange={(e) => setTextoIa(e.target.value.slice(0, LIMITE_TEXTO_LIVRE))}
                  rows={3}
                  placeholder="Ex.: põe um galpão de 200 m² e cascalho na entrada"
                  className={campo + " mt-3 resize-none"}
                />
              )}

              {acaoTerreno.aceitaReferencia && (
                <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Espelhar em algo · opcional</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {TIPOS_REFERENCIA.map((t) => (
                      <Chip key={t.valor} ativo={tipoReferencia === t.valor} onClick={() => setTipoReferencia(t.valor)}>
                        {t.rotulo}
                      </Chip>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    {tipoReferencia === "planta"
                      ? "Mande a planta e a IA constrói aquela casa: mesmo formato, mesmos cômodos."
                      : "Mande a foto de uma casa parecida e a IA copia o jeitão dela — telhado, materiais e cor."}
                  </p>

                  {/* A planta que veio da outra tela: já está no armazenamento, então nada
                      sobe de novo. Fica à vista pra pessoa saber o que a IA vai seguir. */}
                  {plantaDoEncena && !referencia && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-marca-indigo/40 bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {plantaDoEncena.url ? <img src={plantaDoEncena.url} alt="" className="h-16 w-16 shrink-0 rounded-md bg-white object-contain" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-marca-pessego text-marca-indigo"><Icone nome="planta" className="h-6 w-6" /></span>}
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium text-neutral-800">A planta que você desenhou</span>
                        <span className="block text-xs text-neutral-500">A casa sai inspirada nela: mesma implantação e mesmos cômodos.</span>
                      </span>
                      <button type="button" onClick={() => setPlantaDispensada(true)} className="shrink-0 px-2 text-neutral-400 hover:text-red-600" title="Não usar">
                        ✕
                      </button>
                    </div>
                  )}

                  <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2 hover:border-marca-indigo">
                    {previewRef ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={previewRef} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-marca-pessego text-marca-indigo">
                        <Icone nome={tipoReferencia === "planta" ? "planta" : "foto"} className="h-6 w-6" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium text-neutral-800">
                        {referencia ? "Trocar imagem" : tipoReferencia === "planta" ? "Escolher a planta" : "Escolher a foto"}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">
                        {referencia ? referencia.name : "JPG ou PNG. Foto do celular ou print serve."}
                      </span>
                    </span>
                    {referencia && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          escolherReferencia(null);
                        }}
                        className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-400 hover:text-red-600"
                      >
                        tirar
                      </button>
                    )}
                    <input type="file" accept="image/*" onChange={(e) => escolherReferencia(e.target.files?.[0] ?? null)} className="hidden" />
                  </label>
                </div>
              )}

              {ehObra && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-neutral-200 p-2.5 text-sm">
                  <input type="checkbox" checked={comEquipe} onChange={(e) => setComEquipe(e.target.checked)} className="mt-0.5 h-4 w-4 accent-marca-coral" />
                  <span>
                    Equipe trabalhando no canteiro
                    <span className="block text-xs text-neutral-500">
                      Só nas etapas de obra, de longe e sem rosto. A casa pronta nunca sai com gente — morador inventado num anúncio é personagem, não imóvel.
                    </span>
                  </span>
                </label>
              )}

              <Botao
                onClick={ehObra ? gerarObra : gerarIa}
                disabled={!!gerandoIa || (acaoIa === "livre" && textoIa.trim().length < 3)}
                className="mt-3 w-full py-2.5"
              >
                {gerandoIa ? "Gerando…" : ehObra ? `Ver a obra · ${CUSTO_OBRA} créditos` : `${acaoTerreno.rotulo} · 1 crédito`}
              </Botao>
              {gerandoIa && !ehObra && <p className="mt-2 text-center text-xs text-neutral-500">Leva cerca de meio minuto.</p>}

              {/* O andamento da obra. Quatro linhas que mudam de estado: o que já saiu, o
                  que está saindo agora e o que ainda vem. Sem isto, dois minutos de tela
                  parada parecem travamento -- foi exatamente a reclamação do vídeo. */}
              {ehObra && (gerandoIa || etapasFeitas.length > 0) && (
                <ol className="mt-3 space-y-1.5">
                  {ETAPAS_OBRA.map((etapa) => {
                    const pronta = etapasFeitas.find((f) => f.id === etapa.id);
                    const agora = etapaAgora === etapa.id;
                    return (
                      <li key={etapa.id} className="flex items-center gap-2.5 text-sm">
                        <span
                          className={
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold " +
                            (pronta ? "bg-marca-teal text-white" : agora ? "bg-marca-coral text-white" : "bg-neutral-100 text-neutral-400")
                          }
                        >
                          {pronta ? "✓" : etapa.ordem}
                        </span>
                        <span className={pronta ? "text-neutral-700" : agora ? "font-medium text-marca-indigo" : "text-neutral-400"}>
                          {agora ? etapa.espera : etapa.rotulo}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {etapasFeitas.length > 0 && (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {etapasFeitas.map((f) => (
                      <a key={f.jobId} href={f.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-neutral-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={f.rotulo} className="aspect-[4/3] w-full object-cover" />
                        <span className="block px-2 py-1 text-[11px] text-neutral-600">{f.rotulo}</span>
                      </a>
                    ))}
                  </div>
                  {etapasFeitas.length === ETAPAS_OBRA.length && (
                    <p className="mt-2 text-xs text-neutral-500">
                      As quatro estão no imóvel e na galeria. Pra virar vídeo, monte em{" "}
                      <Link href="/videos" className="text-marca-indigo underline">Vídeo do imóvel</Link> — elas entram na ordem e o próprio vídeo faz a transição.
                    </p>
                  )}
                </div>
              )}

              {resultadoIa && (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultadoIa.url} alt="Terreno transformado" className="w-full rounded-lg border border-neutral-200" />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a href={resultadoIa.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                      <Icone nome="download" className="h-4 w-4" />
                      Baixar
                    </a>
                  </div>
                  <div className="mt-2">
                    <Compartilhar token={c.token} jobId={resultadoIa.jobId} texto="Olha o terreno:" />
                  </div>
                </div>
              )}
            </Cartao>
          )}

          <Cartao>
            <div className="mb-3">
              <Rotulo>Guardar em</Rotulo>
              <SeletorImovel token={c.token} valor={imovelId} onChange={setImovelId} disabled={gerando} />
            </div>
            {/* A metragem do lote indo pra ficha: o mesmo número que ele digitaria de novo em
                Imóveis, e que depois sai no book, no post e na mensagem do cliente. */}
            {imovelId && areaEmNumero !== null && (
              <button
                type="button"
                onClick={async () => {
                  setAreaNaFicha("indo");
                  try {
                    const r = await fetch(`/api/imoveis/${imovelId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await c.token()}` },
                      body: JSON.stringify({ area_total: areaEmNumero }),
                    });
                    if (!r.ok) throw new Error((await r.json()).error);
                    setAreaNaFicha("parado");
                    setAreaGravada(areaEmNumero);
                  } catch {
                    setAreaNaFicha("erro");
                  }
                }}
                disabled={areaNaFicha === "indo"}
                className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-700 hover:border-marca-indigo hover:text-marca-indigo disabled:opacity-60"
              >
                {areaGravada !== null && areaGravada === areaEmNumero
                  ? `✓ ${areaEmNumero} m² na ficha, como área total`
                  : areaNaFicha === "erro"
                    ? "Não consegui gravar. Tente de novo."
                    : `Pôr ${areaEmNumero} m² na ficha do imóvel`}
              </button>
            )}
            <Botao onClick={gerar} disabled={gerando || !foto || pontos.length < 3 || !!resultado} className="w-full py-3 text-base">
              {gerando ? "Gerando…" : "Gerar imagem · grátis"}
            </Botao>
            <p className="mt-2 text-center text-xs text-neutral-500">Sai com o aviso &quot;medidas aproximadas, informadas pelo anunciante&quot;.</p>
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
