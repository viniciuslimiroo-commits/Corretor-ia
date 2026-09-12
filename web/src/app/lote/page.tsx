"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import { ACOES, ACOES_POR_ID, GRUPOS, type DefAcao } from "@/lib/acoes";
import { rodarLote, SIMULTANEAS, type ItemLote } from "@/lib/lote";
import AppShell from "@/components/app-shell";
import PainelParametros from "@/components/painel-parametros";
import SeletorImovel from "@/components/seletor-imovel";
import { Aviso, Botao, Cartao, Icone, Rotulo } from "@/components/ui";

// Lote: a tela que faz o produto servir pra imobiliária. Um imóvel tem 15 a 30 fotos;
// editar uma por uma não é trabalho, é castigo. Aqui a pessoa joga a pasta inteira,
// escolhe UMA ação e um ajuste, e vai tomar café.
//
// As ações que exigem pincel (nenhuma hoje é obrigatória, mas "remover objeto" e
// "mobiliar" aceitam) entram no lote SEM máscara: pintar 20 fotos uma a uma seria o
// mesmo castigo. Quem quer pincel usa o editor normal.

function padroesDe(acao: DefAcao): Record<string, string> {
  const p: Record<string, string> = {};
  for (const def of acao.parametros) if (def.padrao) p[def.chave] = def.padrao;
  return p;
}

let contador = 0;
const chave = () => `f${Date.now()}-${contador++}`;

const ACOES_LOTE = ACOES.filter((a) => a.mascara !== "obrigatoria");

export default function Lote() {
  const c = useConta();
  const [itens, setItens] = useState<ItemLote[]>([]);
  const [acaoId, setAcaoId] = useState("melhorar");
  const acao = ACOES_POR_ID[acaoId];
  const [parametros, setParametros] = useState<Record<string, string>>(() => padroesDe(ACOES_POR_ID["melhorar"]));
  // `?imovel=` vem da página do imóvel; lido no estado inicial, não num efeito (o efeito
  // roda duas vezes no modo estrito e o parâmetro se perde).
  const [imovelId, setImovelId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("imovel")
  );
  const [rodando, setRodando] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = useRef(false);
  const entrada = useRef<HTMLInputElement>(null);

  // Fotos escolhidas viram URLs locais; solta tudo ao sair pra não vazar memória.
  useEffect(() => () => itens.forEach((i) => URL.revokeObjectURL(i.preview)), [itens]);

  const passo = useCallback((id: string, mudanca: Partial<ItemLote>) => {
    setItens((lista) => lista.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }, []);

  function receber(arquivos: FileList | null) {
    if (!arquivos) return;
    const novos = Array.from(arquivos)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ id: chave(), arquivo: f, preview: URL.createObjectURL(f), estado: "esperando" as const }));
    setItens((lista) => [...lista, ...novos].slice(0, 40));
    setResumo(null);
    if (entrada.current) entrada.current.value = "";
  }

  function escolherAcao(id: string) {
    setAcaoId(id);
    setParametros(padroesDe(ACOES_POR_ID[id]));
  }

  function limparProntas() {
    setItens((lista) => lista.filter((i) => i.estado !== "pronto"));
  }

  async function comecar() {
    const pendentes = itens.filter((i) => i.estado === "esperando" || i.estado === "erro");
    if (pendentes.length === 0 || rodando) return;
    setRodando(true);
    setErro(null);
    setResumo(null);
    cancelar.current = false;
    pendentes.forEach((p) => passo(p.id, { estado: "esperando", erro: undefined }));
    try {
      const r = await rodarLote(pendentes, { acao: acao.id, parametros, imovelId }, c.token, passo, () => cancelar.current);
      setResumo(
        r.falhas === 0
          ? `${r.prontas} ${r.prontas === 1 ? "foto pronta" : "fotos prontas"}. Os créditos das que falharam voltam sozinhos.`
          : `${r.prontas} ${r.prontas === 1 ? "pronta" : "prontas"} e ${r.falhas} com problema. O crédito das que falharam voltou.`
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro no lote.");
    } finally {
      setRodando(false);
      c.recarregar();
    }
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para editar em lote.</Link>
      </main>
    );
  }

  const pendentes = itens.filter((i) => i.estado === "esperando" || i.estado === "erro").length;
  const prontas = itens.filter((i) => i.estado === "pronto").length;
  const creditos = c.conta.creditos ?? 0;
  const faltaCredito = pendentes > creditos;
  const grupos = GRUPOS.map((g) => ({ ...g, acoes: ACOES_LOTE.filter((a) => a.grupo === g.id) })).filter((g) => g.acoes.length);

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <div className="mb-4 inline-flex rounded-xl border border-neutral-200 bg-white p-1 text-sm">
        <Link href="/" className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">Uma foto</Link>
        <span className="flex items-center gap-1.5 rounded-lg bg-marca-indigo/10 px-3 py-1.5 font-medium text-marca-indigo">
          <Icone nome="lote" className="h-4 w-4" />
          Em lote
        </span>
        <Link href="/terreno" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">
          <Icone nome="terreno" className="h-4 w-4" />
          Terreno
        </Link>
        <Link href="/planta" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100">
          <Icone nome="planta" className="h-4 w-4" />
          Planta
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Editar em lote</h1>
        <p className="mt-1 text-sm text-neutral-500">Todas as fotos do imóvel de uma vez, com a mesma ação. {SIMULTANEAS} por vez, pra não travar a fila.</p>
      </div>

      {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
      {resumo && <div className="mt-4"><Aviso tipo="ok">{resumo}</Aviso></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <Cartao>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Rotulo>1 · Fotos ({itens.length})</Rotulo>
              <div className="flex items-center gap-2">
                {prontas > 0 && !rodando && (
                  <button onClick={limparProntas} className="text-xs text-neutral-500 underline">tirar as prontas da lista</button>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-neutral-400">
                  <Icone nome="mais" className="h-4 w-4" />
                  Escolher fotos
                  <input ref={entrada} type="file" accept="image/*" multiple className="hidden" onChange={(e) => receber(e.target.files)} disabled={rodando} />
                </label>
              </div>
            </div>

            {itens.length === 0 ? (
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  receber(e.dataTransfer.files);
                }}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-14 text-center hover:border-marca-indigo hover:bg-white"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-marca-indigo shadow-sm">
                  <Icone nome="foto" className="h-6 w-6" />
                </span>
                <span className="font-semibold">Arraste as fotos do imóvel aqui</span>
                <span className="text-sm text-neutral-500">Ou clique pra escolher. Até 40 de uma vez.</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => receber(e.target.files)} />
              </label>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {itens.map((i) => (
                  <li key={i.id} className="relative overflow-hidden rounded-lg border border-neutral-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.resultado ?? i.preview} alt="" className="aspect-square w-full object-cover" />
                    {i.estado === "gerando" && (
                      <span className="absolute inset-x-0 bottom-0 bg-marca-indigo/85 px-1 py-0.5 text-center text-[10px] text-white">{i.etapa ?? "Gerando…"}</span>
                    )}
                    {i.estado === "pronto" && (
                      <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-marca-teal text-white">
                        <Icone nome="check" className="h-3 w-3" />
                      </span>
                    )}
                    {i.estado === "erro" && (
                      <span className="absolute inset-x-0 bottom-0 bg-red-600/90 px-1 py-0.5 text-center text-[10px] text-white" title={i.erro}>falhou</span>
                    )}
                    {!rodando && i.estado !== "pronto" && (
                      <button
                        onClick={() => setItens((lista) => lista.filter((x) => x.id !== i.id))}
                        className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                        title="Tirar"
                      >
                        <Icone nome="fechar" className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {rodando && <p className="mt-3 text-xs text-amber-700">Deixe esta aba aberta até terminar. Cada foto pronta já fica salva no histórico e no imóvel.</p>}
          </Cartao>
        </section>

        <aside className="flex flex-col gap-4 lg:col-span-5">
          <Cartao>
            <Rotulo>2 · O que fazer em todas</Rotulo>
            <div className="flex flex-col gap-3">
              {grupos.map((g) => (
                <div key={g.id}>
                  <p className="mb-1.5 text-xs text-neutral-400">{g.rotulo}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {g.acoes.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => escolherAcao(a.id)}
                        disabled={rodando}
                        title={a.descricao}
                        className={
                          "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm leading-tight transition disabled:opacity-50 " +
                          (a.id === acao.id ? "border-marca-indigo bg-marca-indigo/5 text-marca-indigo" : "border-neutral-200 text-neutral-700 hover:border-neutral-400")
                        }
                      >
                        <Icone nome={a.id} className="h-4 w-4 shrink-0" />
                        <span>{a.rotulo}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-neutral-600">{acao.descricao}</p>
            {acao.mascara === "opcional" && <p className="mt-1 text-xs text-neutral-500">No lote a IA decide a posição sozinha. Pra pintar a área, use o editor de uma foto.</p>}
          </Cartao>

          {acao.parametros.length > 0 && (
            <Cartao>
              <PainelParametros acao={acao} valores={parametros} onChange={(k, v) => setParametros((p) => ({ ...p, [k]: v }))} />
            </Cartao>
          )}

          <Cartao>
            <div className="mb-3">
              <Rotulo>3 · Guardar em</Rotulo>
              <SeletorImovel token={c.token} valor={imovelId} onChange={setImovelId} disabled={rodando} />
              <p className="mt-1.5 text-xs text-neutral-500">Com um imóvel escolhido, tudo cai na galeria dele e vira um link só.</p>
            </div>
            <Botao onClick={comecar} disabled={rodando || pendentes === 0 || faltaCredito} className="w-full py-3 text-base">
              {rodando ? "Gerando…" : pendentes === 0 ? "Escolha as fotos" : `Gerar ${pendentes} ${pendentes === 1 ? "foto" : "fotos"} · ${pendentes} ${pendentes === 1 ? "crédito" : "créditos"}`}
            </Botao>
            {rodando && (
              <Botao variante="discreta" onClick={() => (cancelar.current = true)} className="mt-2 w-full">
                Parar depois das que já começaram
              </Botao>
            )}
            {faltaCredito && !rodando && (
              <div className="mt-3">
                <Aviso tipo="atencao">
                  São {pendentes} fotos e você tem {creditos} {creditos === 1 ? "crédito" : "créditos"}. <Link href="/planos" className="underline">Ver planos e pacotes.</Link>
                </Aviso>
              </div>
            )}
            {prontas > 0 && imovelId && !rodando && (
              <Link href={`/imoveis/${imovelId}`} className="mt-3 block text-center text-sm text-marca-indigo underline">
                Ver as {prontas} no imóvel e baixar tudo
              </Link>
            )}
          </Cartao>
        </aside>
      </div>
    </AppShell>
  );
}
