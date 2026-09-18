"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Aviso, Botao, Cartao, Chip, Icone } from "@/components/ui";
import { DECLARACAO, TONS, pedeDadoSensivel, temLink, type TomId } from "@/lib/crm";
import type { EnvioPainel, LeadPainel } from "./comum";

// PREPARAR ENVIO: imóvel -> materiais -> mensagem -> enviar/copiar/compartilhar.
//
// O Encena PREPARA; quem envia é o corretor, no aparelho dele. Copiar e compartilhar passam
// pela mesma ação "enviar" do servidor que abrir a conversa: contam no limite do dia e nas
// tentativas, e a mensagem é conferida (CPF/banco, link no 1º contato) antes de sair daqui.

type Material = { chave: string; tipo: "imovel" | "video" | "book"; rotulo: string; detalhe: string; miniatura: string | null; publico: boolean; aberturas?: number };
type Imovel = { id: string; titulo: string };

function Passo({ n, titulo, dica, desligado, children, atraso }: { n: number; titulo: string; dica?: string; desligado?: boolean; children: React.ReactNode; atraso: number }) {
  return (
    <section className={`surgir relative pl-11 ${desligado ? "opacity-50" : ""}`} style={{ animationDelay: `${atraso}ms` }}>
      <span className="absolute top-0 left-0 flex h-8 w-8 items-center justify-center rounded-full bg-marca-indigo text-sm font-semibold text-white">{n}</span>
      <p className="font-semibold leading-8">{titulo}</p>
      {dica && <p className="-mt-1 mb-2 text-xs text-neutral-500">{dica}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Copia pro celular. O jeito novo (clipboard) falha sem foco ou em navegador antigo; aí vai
 * o jeito velho (um campo escondido + "copiar"). Se os dois falham, a pessoa ouve o que
 * fazer em português -- e não "Failed to execute 'writeText'".
 */
async function copiarTexto(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
    return;
  } catch {
    /* tenta o jeito velho */
  }
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  const ok = document.execCommand("copy");
  campo.remove();
  if (!ok) throw new Error("Não consegui copiar sozinho. Toque e segure no texto da mensagem pra copiar.");
}

export default function PrepararEnvio({
  lead,
  envio,
  imoveis,
  token,
  aoMudar,
}: {
  lead: LeadPainel;
  envio: EnvioPainel;
  imoveis: Imovel[];
  token: () => Promise<string>;
  /** Algo mudou no servidor (declarou, enviou): a página relê o cliente e o histórico. */
  aoMudar: () => void;
}) {
  const [imovelId, setImovelId] = useState(lead.property_id ?? "");
  const [dados, setDados] = useState<{ imovelId: string; lista: Material[] } | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [tom, setTom] = useState<TomId>("cordial");
  const [texto, setTexto] = useState(envio.texto);
  const [preparando, setPreparando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aceito, setAceito] = useState(false);
  const [podeCompartilhar] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  const bloqueado = !!lead.bloqueio;
  const motivo = envio.pode.ok ? null : envio.pode.motivo;
  const primeiroContato = envio.pode.ok ? envio.pode.primeiroContato : !lead.ultimo_envio_em;
  const podeMandar = envio.pode.ok;
  const carregando = !!imovelId && dados?.imovelId !== imovelId;
  const materiais = dados?.imovelId === imovelId ? dados.lista : [];

  useEffect(() => {
    if (!imovelId) return;
    let vivo = true;
    token()
      .then((t) => fetch(`/api/crm/leads/${lead.id}/preparar?imovel=${imovelId}`, { headers: { Authorization: `Bearer ${t}` } }))
      .then((r) => r.json())
      .then((d) => vivo && setDados({ imovelId, lista: d.materiais ?? [] }))
      .catch(() => vivo && setDados({ imovelId, lista: [] }));
    return () => {
      vivo = false;
    };
  }, [imovelId, lead.id, token]);

  async function post(caminho: string, corpo: unknown) {
    const r = await fetch(caminho, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "Não deu certo.");
    return d;
  }

  async function preparar() {
    setPreparando(true);
    setErro(null);
    setAviso(null);
    try {
      const d = await post(`/api/crm/leads/${lead.id}/preparar`, { imovelId: imovelId || null, materiais: escolhidos, tom });
      setTexto(d.texto);
      if (d.aviso) setAviso(d.aviso);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui preparar agora.");
    } finally {
      setPreparando(false);
    }
  }

  /** O que o servidor recusaria, recusado aqui antes de copiar (copiar não tem volta). */
  function conferir(): string | null {
    if (!texto.trim()) return "A mensagem está vazia.";
    if (pedeDadoSensivel(texto)) return "A mensagem pede documento ou dado bancário. Isso não vai por mensagem.";
    if (primeiroContato && temLink(texto)) return "A primeira mensagem vai sem link. Mande os materiais depois que a pessoa responder.";
    return null;
  }

  async function enviar(canal: "abrir" | "copiar" | "compartilhar") {
    const problema = conferir();
    setErro(problema);
    setAviso(null);
    if (problema) return;
    setOcupado(true);
    // A janela abre no toque: aberta depois do `await`, o navegador do celular bloqueia.
    const janela = canal === "abrir" ? window.open("", "_blank") : null;
    try {
      if (canal === "copiar") await copiarTexto(texto);
      if (canal === "compartilhar") await navigator.share({ text: texto });
      const d = await post(`/api/crm/leads/${lead.id}/acao`, { acao: "enviar", texto, canal });
      if (canal === "abrir") {
        if (janela) janela.location.href = d.link;
        else window.location.href = d.link;
      }
      const nome = lead.nome.trim().split(/\s+/)[0];
      setAviso(
        [
          canal === "copiar" ? `Mensagem copiada. Cole na conversa com ${nome}.` : canal === "compartilhar" ? "Mensagem entregue pro app que você escolheu." : "Conversa aberta com o texto pronto.",
          d.reaberta ? "(Não contou como nova tentativa: foi a mesma mensagem de hoje.)" : "",
          "Quando a pessoa responder, marque em “Ela respondeu”.",
          ...(d.avisos ?? []),
        ]
          .filter(Boolean)
          .join(" ")
      );
      aoMudar();
    } catch (e) {
      janela?.close();
      // Compartilhar cancelado pela pessoa não é erro.
      if (!(e instanceof DOMException && e.name === "AbortError")) setErro(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  async function declarar() {
    setOcupado(true);
    setErro(null);
    try {
      await post(`/api/crm/leads/${lead.id}/acao`, { acao: "declarar", aceito: true });
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  const alternar = (chave: string) => setEscolhidos((l) => (l.includes(chave) ? l.filter((c) => c !== chave) : l.length >= 6 ? l : [...l, chave]));
  const vaoFicarPublicos = materiais.filter((m) => escolhidos.includes(m.chave) && !m.publico).length;

  return (
    <Cartao className="surgir overflow-hidden !p-0" style={{ animationDelay: "180ms" }}>
      <div className="border-b border-neutral-100 bg-gradient-to-r from-marca-pessego/40 to-transparent px-5 py-4">
        <p className="flex items-center gap-2 font-semibold">
          <Icone nome="magica" className="h-5 w-5 text-marca-coral" />
          Preparar envio
        </p>
        <p className="mt-0.5 text-sm text-neutral-600">Escolha o imóvel e o material, deixe a IA escrever e mande do seu celular.</p>
      </div>

      <div className="grid gap-6 p-5">
        {bloqueado ? (
          <Aviso tipo="erro">{envio.pode.ok ? "" : envio.pode.texto}</Aviso>
        ) : motivo === "declaracao" ? (
          <div className="rounded-xl border border-marca-coral/30 bg-marca-pessego/20 p-4">
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-marca-coral" />
              <span>{DECLARACAO.texto}</span>
            </label>
            <p className="mt-1 text-xs text-neutral-500">Fica registrado com a data e o seu nome. É o que libera a primeira mensagem.</p>
            <Botao disabled={!aceito || ocupado} onClick={declarar} className="mt-3 min-h-11 w-full sm:w-auto">
              Confirmar
            </Botao>
          </div>
        ) : !podeMandar ? (
          <div>
            <Aviso tipo="atencao">{envio.pode.ok ? "" : envio.pode.texto}</Aviso>
            {motivo === "sem_creci" && (
              <Link href="/marca" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-marca-indigo underline">
                Cadastrar o CRECI em Minha marca
              </Link>
            )}
          </div>
        ) : null}

        <Passo n={1} titulo="Imóvel" dica="O de interesse já vem escolhido." atraso={220} desligado={bloqueado}>
          <select
            value={imovelId}
            onChange={(e) => {
              setImovelId(e.target.value);
              setEscolhidos([]);
            }}
            disabled={bloqueado}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-base focus:border-marca-indigo focus:outline-none sm:text-sm"
            aria-label="Imóvel"
          >
            <option value="">Nenhum imóvel</option>
            {imoveis.map((i) => (
              <option key={i.id} value={i.id}>
                {i.titulo}
              </option>
            ))}
          </select>
        </Passo>

        <Passo
          n={2}
          titulo="Materiais"
          dica={primeiroContato ? "A primeira mensagem vai sem link: os materiais liberam quando a pessoa responder." : "Vão como link, um por linha, depois da mensagem."}
          atraso={260}
          desligado={bloqueado || primeiroContato}
        >
          {!imovelId ? (
            <p className="text-sm text-neutral-500">Escolha um imóvel pra ver as fotos, vídeos e books dele.</p>
          ) : primeiroContato && !bloqueado ? (
            // No 1º contato não adianta mostrar cartão que não se pode tocar: um aviso só, com
            // quanto material já está esperando a resposta.
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-3.5 py-3 text-sm text-neutral-600">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-500 shadow-sm">
                <Icone nome="materiais" className="h-4 w-4" />
              </span>
              <span>
                {carregando
                  ? "Separando o material deste imóvel…"
                  : materiais.length
                    ? `${materiais.length} ${materiais.length === 1 ? "material pronto" : "materiais prontos"} pra mandar assim que a pessoa responder.`
                    : "Este imóvel ainda não tem material pronto."}
              </span>
            </div>
          ) : carregando ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((k) => (
                <div key={k} className="carregando-ia aspect-[4/3] rounded-xl" />
              ))}
            </div>
          ) : materiais.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Este imóvel ainda não tem material pronto.{" "}
              <Link href={`/imoveis/${imovelId}`} className="font-medium text-marca-indigo underline">
                Abrir o imóvel
              </Link>
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {materiais.map((m) => {
                const marcado = escolhidos.includes(m.chave);
                return (
                  <li key={m.chave}>
                    <button
                      type="button"
                      aria-pressed={marcado}
                      disabled={bloqueado || primeiroContato}
                      onClick={() => alternar(m.chave)}
                      className={
                        "group relative block w-full overflow-hidden rounded-xl border text-left transition-all duration-200 disabled:cursor-not-allowed " +
                        (marcado ? "border-marca-coral ring-2 ring-marca-coral/60" : "border-neutral-200 hover:-translate-y-0.5 hover:shadow-md")
                      }
                    >
                      <span className="relative block aspect-[4/3] bg-neutral-100">
                        {m.miniatura ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.miniatura} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center">
                            <Icone nome={m.tipo === "video" ? "video" : m.tipo === "book" ? "materiais" : "foto"} className="h-7 w-7 text-neutral-400" />
                          </span>
                        )}
                        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                        <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[11px] font-semibold text-white">
                          <Icone nome={m.tipo === "video" ? "play" : m.tipo === "book" ? "materiais" : "foto"} className="h-3.5 w-3.5" />
                          {m.tipo === "video" ? "Vídeo" : m.tipo === "book" ? "Material" : "Fotos"}
                        </span>
                        {marcado && (
                          <span className="estalar absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-marca-coral text-white shadow">
                            <Icone nome="check" className="h-4 w-4" />
                          </span>
                        )}
                      </span>
                      <span className="block px-2.5 py-2">
                        <span className="line-clamp-2 block text-sm leading-snug font-medium">{m.rotulo}</span>
                        <span className="block truncate text-xs text-neutral-500">{m.detalhe || " "}</span>
                        {!!m.aberturas && <span className="mt-0.5 block text-[11px] text-teal-700">aberto {m.aberturas}×</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {vaoFicarPublicos > 0 && (
            <p className="mt-2 text-xs text-neutral-500">
              {vaoFicarPublicos === 1 ? "1 material ganha" : `${vaoFicarPublicos} materiais ganham`} link público: quem tiver o link vê. Dá pra desligar no próprio material.
            </p>
          )}
        </Passo>

        <Passo n={3} titulo="Mensagem" dica={primeiroContato ? "Seu nome, o CRECI e o “responda SAIR” são fixos na primeira mensagem." : undefined} atraso={300} desligado={!podeMandar}>
          <div className="flex flex-wrap items-center gap-2">
            {TONS.map((t) => (
              <Chip key={t.id} ativo={tom === t.id} onClick={() => setTom(t.id)} disabled={!podeMandar || preparando}>
                {t.rotulo}
              </Chip>
            ))}
            <Botao onClick={preparar} disabled={!podeMandar || preparando} className="min-h-11 sm:ml-auto">
              <Icone nome="magica" className="h-4 w-4" />
              {preparando ? "Escrevendo…" : "Preparar com IA"}
            </Botao>
          </div>
          {preparando ? (
            <div className="carregando-ia mt-3 flex h-40 items-center justify-center rounded-xl px-4 text-center text-sm text-neutral-600">
              Escrevendo com o nome do cliente e os dados do imóvel…
            </div>
          ) : (
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              maxLength={1000}
              disabled={!podeMandar}
              aria-label="Texto da mensagem"
              className="mt-3 w-full rounded-xl border border-neutral-200 px-3.5 py-3 text-base leading-relaxed focus:border-marca-indigo focus:outline-none sm:text-sm"
            />
          )}
          <p className="mt-1 flex justify-between text-xs text-neutral-400">
            <span>
              {envio.pode.ok && envio.pode.primeiroContato ? `Primeiros contatos hoje: ${envio.primeirosHoje} de ${envio.limiteDia}` : "Nunca peça documento, CPF ou dado de banco por mensagem."}
            </span>
            <span className="tabular-nums">{texto.length}/1000</span>
          </p>
        </Passo>

        <Passo n={4} titulo="Enviar" dica="Quem aperta enviar é você, no seu aparelho." atraso={340} desligado={!podeMandar}>
          <div className="grid gap-2 sm:grid-cols-3">
            <Botao onClick={() => enviar("abrir")} disabled={!podeMandar || ocupado || preparando} className="min-h-12">
              <Icone nome="compartilhar" className="h-4 w-4" />
              Abrir conversa
            </Botao>
            <Botao variante="secundaria" onClick={() => enviar("copiar")} disabled={!podeMandar || ocupado || preparando} className="min-h-12">
              <Icone nome="copiar" className="h-4 w-4" />
              Copiar
            </Botao>
            {podeCompartilhar && (
              <Botao variante="secundaria" onClick={() => enviar("compartilhar")} disabled={!podeMandar || ocupado || preparando} className="min-h-12">
                <Icone nome="link" className="h-4 w-4" />
                Compartilhar
              </Botao>
            )}
          </div>
        </Passo>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      </div>
    </Cartao>
  );
}
