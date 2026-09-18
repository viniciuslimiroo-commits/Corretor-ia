"use client";

import { useEffect, useMemo, useState } from "react";
import ApresentadorNoPalco from "@/components/editor/apresentador-no-palco";
import ElementosNoPalco from "@/components/editor/elementos-no-palco";
import GaleriaElementos from "@/components/editor/galeria-elementos";
import GaleriaTexto from "@/components/editor/galeria-texto";
import { useMenuContexto } from "@/components/editor/menu-contexto";
import BarraDaSelecao, { DeslizanteDaSubBarra } from "@/components/editor/barra-da-selecao";
import { useAvisos } from "@/components/editor/aviso-desfazer";
import ListaDaFoto from "@/components/editor/lista-da-foto";
import LegendaNoPalco from "@/components/editor/legenda-no-palco";
import { acoesDaSelecao, ctxDoEstado, estadoDoEspec, type RefItem } from "@/lib/linha-do-tempo";
import type { Apresentador, ElementoCena, EspecVideo } from "@/lib/video";
import type { IconeFicha } from "@/lib/elementos";

// As peças com as propriedades de HOJE (EV:1959, 2063, 2637, 2649). Nada aqui pode mudar
// entre o antes e o depois do P6: é o retrato que o teste compara.

const nada = () => {};
const ELEMENTOS: ElementoCena[] = [{ id: "ficha_barra" }, { id: "adesivo:casa" }];
const FICHA: { icone: IconeFicha; texto: string }[] = [
  { icone: "quarto", texto: "3 quartos" },
  { icone: "area", texto: "98 m²" },
];
const VOCE: Apresentador = { arquivo: "uploads/bancada/voce.webm", formato: "circulo", canto: "inferior_direito", tamanho: "medio", entra: 0, inicio: 0, volume: 1 };

function Antigos() {
  const menu = useMenuContexto();
  return (
    <div className="flex flex-col gap-6 p-3">
      <div data-antigo="palco" className="relative mx-auto aspect-[9/16] w-[270px] overflow-hidden bg-neutral-900">
        <div data-antigo="elementos-no-palco" className="absolute inset-0">
          <ElementosNoPalco elementos={ELEMENTOS} proporcao={9 / 16} topoOcupado={false} cor="#F06B4F" itensDaFicha={FICHA} gatilho={menu.gatilho} aoMudar={nada} aoTirar={nada} />
        </div>
        <div data-antigo="apresentador-no-palco" className="absolute inset-0">
          <ApresentadorNoPalco apresentador={VOCE} url="/exemplos/voce-inexistente.webm" proporcao={9 / 16} aoMudar={nada} />
        </div>
      </div>
      <div data-antigo="galeria-texto">
        <GaleriaTexto
          pecas={[{ id: "preco", rotulo: "Preço", texto: "R$ 450 mil" }]}
          aoAdicionar={nada}
          aoTrocarAnimacao={nada}
          animacaoAtual="surgir"
          aoTrocarMovimento={nada}
          movimentoAtual="nenhum"
          ultimoTemEfeito={false}
          temTextoSelecionado={true}
          cheio={false}
        />
      </div>
      <div data-antigo="galeria-elementos">
        <GaleriaElementos
          elementos={ELEMENTOS}
          itensDaFicha={FICHA}
          cor="#F06B4F"
          podeMais={true}
          aoAdicionar={nada}
          buscarClipes={async () => ({ clipes: [], temMais: false })}
          aoMudar={nada}
          aoTirar={nada}
        />
      </div>
    </div>
  );
}

// ---------- as peças novas (P6) ----------

const ESPEC: EspecVideo = {
  formato: "9:16" as EspecVideo["formato"],
  cenas: [0, 1, 2].map((i) => ({ tipo: "foto" as const, jobId: `b${i}`, duracao: 4, textos: i === 0 ? [{ texto: "À VENDA" }, { texto: "3 quartos" }] : undefined })),
  musica: "nenhuma",
  musicaVolume: 0.8,
  narracao: { origem: "gravada", arquivo: "uploads/bancada/voz.webm" },
  titulo: "",
  preco: "",
  local: "",
  telaFinal: true,
  transicao: "dissolver",
  versao: 2,
  audios: [
    { id: "mus00001", fonte: { tipo: "musica", id: "calma" }, noVideo: 0, corteArquivo: 0, duracao: 8, volume: 0.8, fadeEntrada: 1, fadeSaida: 0, laco: true },
    { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 1, corteArquivo: 0, volume: 1, fadeEntrada: 0, fadeSaida: 0 },
  ],
  legendas: { estilo: "faixa", trechos: [{ inicio: 0, fim: 60, texto: "Sala ampla e iluminada, com varanda" }] },
};
const VOCE_RELOGIO: Apresentador = { arquivo: "uploads/bancada/voce.webm", formato: "canto", canto: "superior_direito", tamanho: "medio", entra: 2, duracao: 3, inicio: 0.5, volume: 1 };
const ALTURA_LINHA = 198;

/** O registro que o teste lê (bancada de desenvolvimento: um só por página). */
const EVENTOS: { tipo: string; dado?: unknown }[] = [];
const registrar = (tipo: string, dado?: unknown) => EVENTOS.push({ tipo, dado });

function Novos({ flutuante }: { flutuante: "aviso" | "lista" }) {
  const ctx = useMemo(() => ctxDoEstado(estadoDoEspec(ESPEC, ["c0", "c1", "c2"]), { segundosDaVoz: 9.4, vozEstimada: false, segundosEstimadosDaVoz: 7, segundosDoVoce: 12 }), []);
  const refMusica: RefItem = { faixa: "musica", id: "mus00001" };
  // Cursor aos 9s, FORA da música (0 a 8s): Início aqui, Fim aqui e Dividir ficam apagados
  // com o motivo -- é o que o teste toca.
  const acoes = acoesDaSelecao(ctx, refMusica, 9, false);
  const [url, setUrl] = useState<string | null>(null);
  const [tempo, setTempo] = useState(1);
  const [tocando, setTocando] = useState(false);
  const [voceSel, setVoceSel] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const { avisar, elemento } = useAvisos();

  // O relógio da bancada: anda de 100 em 100ms enquanto toca, como o `tempo` do editor.
  useEffect(() => {
    if (!tocando) return;
    const inicio = performance.now();
    const t0 = tempo;
    const id = setInterval(() => setTempo(Math.round((t0 + (performance.now() - inicio) / 1000) * 1000) / 1000), 100);
    return () => clearInterval(id);
    // o t0 é o tempo no instante do Play; o intervalo não deve reiniciar a cada passo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando]);

  useEffect(() => {
    (window as unknown as { __bancadaBarra: unknown }).__bancadaBarra = {
      eventos: EVENTOS,
      usarVideo: (u: string) => setUrl(u),
      irPara: (t: number) => setTempo(t),
      tocar: (b: boolean) => setTocando(b),
      selecionarVoce: (b: boolean) => setVoceSel(b),
    };
  }, []);
  useEffect(() => {
    (window as unknown as { __tempo: number }).__tempo = tempo;
  }, [tempo]);
  useEffect(() => {
    if (flutuante === "aviso") avisar("Música dividida", { desfazer: () => registrar("desfazer"), ms: 60000 });
  }, [flutuante, avisar]);

  return (
    <div className="editor-escuro relative flex h-[100svh] flex-col overflow-hidden" style={{ ["--altura-linha" as string]: `${ALTURA_LINHA}px` }}>
      <div data-palco="1" className="palco relative mx-auto aspect-[9/16] h-[300px] shrink-0 overflow-hidden bg-neutral-800">
        {url && (
          <ApresentadorNoPalco
            apresentador={VOCE_RELOGIO}
            url={url}
            proporcao={9 / 16}
            aoMudar={nada}
            tempo={tempo}
            tocando={tocando}
            selecionado={voceSel}
            aoSelecionar={() => registrar("selecionarVoce")}
            aoMedirDuracao={(s) => registrar("duracao", s)}
          />
        )}
        <LegendaNoPalco legendas={ESPEC.legendas ?? null} tempo={tempo} alturaPalco={300} apresentadorNoPe={false} selecionado={0} aoSelecionar={(i) => registrar("legenda", i)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div data-bancada="barra-normal" className="rounded-lg bg-[var(--painel-editor)]">
          <BarraDaSelecao titulo="Música · Calma" acoes={acoes} aoAcao={(id) => registrar("acao", id)} aoFechar={() => registrar("fechar")} aoMotivo={(m) => registrar("motivo", m)} />
        </div>
        <div data-bancada="barra-sub" className="mt-3 rounded-lg bg-[var(--painel-editor)]">
          <BarraDaSelecao
            titulo="Legenda"
            acoes={[]}
            aoAcao={nada}
            aoFechar={nada}
            subBarra={
              <>
                <input type="text" defaultValue="Sala ampla" className="min-w-0 flex-1 rounded bg-[#0d1e3a] px-2 py-1 text-xs" aria-label="Texto da legenda" />
                <button type="button" className="h-11 shrink-0 px-2 text-[13px] font-semibold text-marca-coral">Pronto</button>
              </>
            }
          />
        </div>
        <div data-bancada="barra-volume" className="mt-3 rounded-lg bg-[var(--painel-editor)]">
          <BarraDaSelecao titulo="Volume" acoes={[]} aoAcao={nada} aoFechar={nada} subBarra={<DeslizanteDaSubBarra rotulo="Volume" valor={volume} min={0} max={1} passo={0.01} formatar={(v) => `${Math.round(v * 100)}%`} aoMudar={setVolume} />} />
        </div>
        <div data-bancada="galeria-texto" className="mt-3">
          <GaleriaTexto
            pecas={[]}
            aoAdicionar={nada}
            aoTrocarAnimacao={(id, indice) => registrar("animacao", { id, indice })}
            animacaoAtual={null}
            aoTrocarMovimento={(id, indice) => registrar("movimento", { id, indice })}
            movimentoAtual="nenhum"
            ultimoTemEfeito={false}
            temTextoSelecionado={true}
            cheio={false}
            aba="animacao"
            indiceAlvo={0}
          />
        </div>
      </div>
      <div data-mock-linha="1" className="shrink-0 bg-[#1a3159]" style={{ height: ALTURA_LINHA }} />
      {flutuante === "aviso" && elemento}
      {flutuante === "lista" && (
        <ListaDaFoto
          titulo="Textos da foto 1"
          itens={[
            { ref: { faixa: "textos", chave: "c0", indice: -1 }, rotulo: "Legenda: Sala ampla", icone: "legenda" },
            { ref: { faixa: "textos", chave: "c0", indice: 0 }, rotulo: "À VENDA", icone: "editar_prompt" },
            { ref: { faixa: "textos", chave: "c0", indice: 1 }, rotulo: "3 quartos", icone: "editar_prompt" },
            { ref: { faixa: "adesivos", chave: "c0", indice: 0 }, rotulo: "Selo vendido", icone: "elementos" },
          ]}
          selecao={{ faixa: "textos", chave: "c0", indice: 0 }}
          aoEscolher={(r) => registrar("escolher", r)}
          aoFechar={nada}
        />
      )}
    </div>
  );
}

export default function BancadaBarra({ parte, flutuante }: { parte: "antigos" | "novos"; flutuante?: "aviso" | "lista" }) {
  return <div className="min-h-[100svh] bg-white">{parte === "antigos" ? <Antigos /> : <Novos flutuante={flutuante ?? "aviso"} />}</div>;
}
