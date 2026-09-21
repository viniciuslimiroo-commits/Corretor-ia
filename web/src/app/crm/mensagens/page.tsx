"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, BotaoConfirma, Cartao, Chip, Icone, Rotulo } from "@/components/ui";
import {
  LIMITES_MODELO,
  MODELOS_SUGERIDOS,
  SITUACOES,
  SITUACAO_POR_ID,
  VARIAVEIS,
  aplicarVariaveis,
  conferirModelo,
  type Modelo,
  type SituacaoId,
} from "@/lib/crm-modelos";

// MINHAS MENSAGENS: os textos da casa, escritos por quem vende.
//
// Pedido do dono (21/09/2026): "quero opção de deixar mensagens personalizadas que a própria
// corretora ou imobiliária queira deixar" e "deixar automático pra cada situação".
//
// A tela é uma lista por MOMENTO da conversa, porque é assim que o corretor pensa ("o que eu
// mando quando marco visita?"), e não por ordem de criação. Em cada momento, um dos textos
// pode ser o automático: é ele que já aparece escrito quando o cliente está naquele ponto.
//
// A prévia usa um cliente de mentira (Maria Souza) pra pessoa ver o texto pronto antes de
// salvar -- sem isso as chaves entre chaves parecem código e ninguém usa.

const EXEMPLO = { nomeLead: "Maria Souza", corretor: "você", creci: "00000-F", imovel: "Apto 302 · Setor Bueno", origem: "portal" as const };

type Rascunho = { id: string | null; situacao: SituacaoId; titulo: string; texto: string; automatico: boolean };

const VAZIO: Rascunho = { id: null, situacao: "primeiro_contato", titulo: "", texto: "", automatico: false };

export default function MinhasMensagens() {
  const c = useConta();
  const { user, token } = c;
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [semTabela, setSemTabela] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    token()
      .then((t) => fetch("/api/crm/modelos", { headers: { Authorization: `Bearer ${t}` } }))
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok) throw new Error(d.error);
        setModelos(d.modelos ?? []);
        setSemTabela(!!d.semTabela);
      })
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [user, token, versao]);

  async function chamar(metodo: "POST" | "PATCH" | "DELETE", caminho: string, corpo?: unknown) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(caminho, {
        method: metodo,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    if (!rascunho) return;
    const problemas = conferirModelo(rascunho);
    if (problemas.length) return setErro(problemas[0].mensagem);
    const corpo = { situacao: rascunho.situacao, titulo: rascunho.titulo.trim(), texto: rascunho.texto.trim(), automatico: rascunho.automatico };
    const d = rascunho.id ? await chamar("PATCH", `/api/crm/modelos/${rascunho.id}`, corpo) : await chamar("POST", "/api/crm/modelos", corpo);
    if (!d) return;
    setRascunho(null);
    setAviso(rascunho.id ? "Mensagem salva." : "Mensagem criada.");
    setVersao((v) => v + 1);
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">
          Entre para ver suas mensagens.
        </Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-base focus:border-marca-indigo focus:outline-none sm:text-sm";
  const previa = rascunho?.texto.trim() ? aplicarVariaveis(rascunho.texto, EXEMPLO) : "";

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      <Link href="/crm" className="inline-flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
        <Icone nome="seta_esq" className="h-4 w-4" />
        Meus clientes
      </Link>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Minhas mensagens</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Escreva do seu jeito, uma vez. A marcada como <strong className="font-semibold text-neutral-700">automática</strong> já aparece pronta quando o cliente chega naquele momento — sem IA e sem gastar crédito.
          </p>
        </div>
        {!rascunho && (
          <Botao onClick={() => setRascunho({ ...VAZIO })} className="min-h-11">
            <Icone nome="editar_prompt" className="h-4 w-4" />
            Nova mensagem
          </Botao>
        )}
      </div>

      {erro && (
        <div className="mt-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}
      {aviso && (
        <div className="mt-3">
          <Aviso tipo="ok">{aviso}</Aviso>
        </div>
      )}
      {semTabela && (
        <div className="mt-3">
          <Aviso tipo="atencao">Falta rodar a migração 18 no Supabase (web/supabase/migration-18-modelos-mensagem.sql). Até lá dá pra ver a tela, mas não dá pra salvar.</Aviso>
        </div>
      )}

      {rascunho && (
        <Cartao className="surgir mt-4">
          <p className="font-semibold">{rascunho.id ? "Editar mensagem" : "Nova mensagem"}</p>

          <div className="mt-3 grid gap-3">
            <div>
              <Rotulo>Quando usar</Rotulo>
              <div className="mt-1 flex flex-wrap gap-2">
                {SITUACOES.map((s) => (
                  <Chip
                    key={s.id}
                    ativo={rascunho.situacao === s.id}
                    onClick={() => setRascunho({ ...rascunho, situacao: s.id, automatico: s.id === "qualquer" ? false : rascunho.automatico })}
                  >
                    {s.rotulo}
                  </Chip>
                ))}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{SITUACAO_POR_ID[rascunho.situacao]?.dica}</p>
            </div>

            <label className="text-sm">
              <Rotulo>Nome (só você vê)</Rotulo>
              <input
                value={rascunho.titulo}
                onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
                maxLength={LIMITES_MODELO.tituloMax}
                placeholder="ex.: Confirmar visita"
                className={campo}
              />
            </label>

            <label className="text-sm">
              <Rotulo>A mensagem</Rotulo>
              <textarea
                value={rascunho.texto}
                onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })}
                rows={5}
                maxLength={LIMITES_MODELO.textoMax}
                placeholder="Oi, {nome}! Confirmando nossa visita ao {imovel}."
                className={campo}
              />
              <span className="mt-1 flex justify-between text-xs text-neutral-400">
                <span>Toque numa etiqueta abaixo pra inserir.</span>
                <span className="tabular-nums">
                  {rascunho.texto.length}/{LIMITES_MODELO.textoMax}
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-1.5">
              {VARIAVEIS.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  onClick={() => setRascunho({ ...rascunho, texto: `${rascunho.texto}{${v.chave}}` })}
                  title={`${v.rotulo} · ex.: ${v.exemplo}`}
                  className="rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-200"
                >
                  {"{"}
                  {v.chave}
                  {"}"}
                </button>
              ))}
            </div>

            {previa && (
              <div className="rounded-xl bg-neutral-50 p-3">
                <p className="text-xs font-semibold text-neutral-500">Como vai chegar</p>
                <p className="mt-1 text-sm whitespace-pre-line text-neutral-800">{previa}</p>
                {rascunho.situacao === "primeiro_contato" && (
                  <p className="mt-1.5 text-xs text-neutral-500">Na primeira mensagem o Encena põe o seu nome e o CRECI na frente, e não deixa link passar.</p>
                )}
              </div>
            )}

            {rascunho.situacao !== "qualquer" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={rascunho.automatico} onChange={(e) => setRascunho({ ...rascunho, automatico: e.target.checked })} className="mt-1" />
                <span>
                  Usar esta automaticamente
                  <span className="block text-xs text-neutral-500">
                    Quando o cliente estiver em “{SITUACAO_POR_ID[rascunho.situacao]?.rotulo}”, ela já vem escrita. Só uma por momento — marcar esta tira a marca da outra.
                  </span>
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Botao onClick={salvar} disabled={ocupado} className="min-h-11">
                Salvar
              </Botao>
              <Botao variante="discreta" onClick={() => setRascunho(null)} className="min-h-11">
                Cancelar
              </Botao>
            </div>
          </div>
        </Cartao>
      )}

      {/* ---------- a lista, por momento da conversa ---------- */}
      <div className="mt-5 grid gap-4">
        {modelos === null ? (
          <div className="carregando-ia h-32 rounded-2xl" />
        ) : (
          SITUACOES.map((s) => {
            const dela = modelos.filter((m) => m.situacao === s.id);
            if (!dela.length) return null;
            return (
              <Cartao key={s.id} className="surgir">
                <p className="font-semibold">{s.rotulo}</p>
                <div className="mt-2 grid gap-2">
                  {dela.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-neutral-200 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {m.titulo}
                          {m.automatico && <span className="rounded-full bg-marca-coral/15 px-2 py-0.5 text-[11px] font-semibold text-marca-coral">automática</span>}
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-line text-neutral-600">{m.texto}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Botao variante="discreta" onClick={() => setRascunho({ id: m.id, situacao: m.situacao, titulo: m.titulo, texto: m.texto, automatico: m.automatico })} className="min-h-10">
                          Editar
                        </Botao>
                        <BotaoConfirma
                          pergunta="Apagar esta mensagem?"
                          confirmar="Apagar"
                          variante="discreta"
                          aoConfirmar={async () => {
                            if (await chamar("DELETE", `/api/crm/modelos/${m.id}`)) setVersao((v) => v + 1);
                          }}
                          className="min-h-10"
                        >
                          Apagar
                        </BotaoConfirma>
                      </div>
                    </div>
                  ))}
                </div>
              </Cartao>
            );
          })
        )}

        {modelos?.length === 0 && !rascunho && (
          <Cartao className="surgir">
            <p className="font-semibold">Comece por uma destas</p>
            <p className="mt-1 text-sm text-neutral-500">São só sugestões: toque numa e mude tudo o que quiser antes de salvar.</p>
            <div className="mt-3 grid gap-2">
              {MODELOS_SUGERIDOS.map((s) => (
                <button
                  key={s.titulo}
                  type="button"
                  onClick={() => setRascunho({ id: null, situacao: s.situacao, titulo: s.titulo, texto: s.texto, automatico: false })}
                  className="rounded-xl border border-neutral-200 p-3 text-left hover:border-marca-indigo"
                >
                  <p className="text-xs font-semibold text-neutral-500">{SITUACAO_POR_ID[s.situacao]?.rotulo}</p>
                  <p className="font-medium">{s.titulo}</p>
                  <p className="mt-0.5 text-sm text-neutral-600">{s.texto}</p>
                </button>
              ))}
            </div>
          </Cartao>
        )}
      </div>
    </AppShell>
  );
}
