"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConta } from "@/lib/use-conta";
import { PESSOAS_POR_PLANO, rotuloDoPlano } from "@/lib/planos";
import AppShell from "@/components/app-shell";
import Dropzone from "@/components/dropzone";
import { Aviso, Botao, Cartao, Icone, Rotulo } from "@/components/ui";

// Equipe: a conta compartilhada. Serve pro corretor com assistente, pra dupla de
// corretores e pra imobiliária -- por isso ela se chama EQUIPE e não "imobiliária". Quem
// não tem cria aqui (e leva os créditos pessoais);
// quem tem vê plano, créditos, pessoas e uso do mês; dono e gestor convidam, removem,
// ajustam papéis e a marca da casa. Corretor vê a equipe e pode sair.

type Papel = "dono" | "gestor" | "corretor";
type Membro = { userId: string; email: string; nome: string | null; papel: Papel; entrouEm: string; fotosMes: number; videosMes: number };
type Convite = { id: string; email: string; papel: string; criadoEm: string };
type Org = {
  id: string;
  nome: string;
  plano: string;
  planoRotulo: string;
  creditos: number;
  status: string | null;
  renovaEm: string | null;
  limite: number;
  pessoas: number;
  marca: { logoUrl: string | null; cor: string | null; whatsapp: string; creci: string };
};
type Painel = { org: Org | null; papel?: Papel; membros?: Membro[]; convites?: Convite[] };

const PAPEL: Record<Papel, string> = { dono: "Dono", gestor: "Gestor", corretor: "Corretor" };

export default function Equipe() {
  const c = useConta();
  const { user, token } = c;
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [nomeNova, setNomeNova] = useState("");
  const [emailConvite, setEmailConvite] = useState("");
  const [papelConvite, setPapelConvite] = useState<"corretor" | "gestor">("corretor");

  const [nomeOrg, setNomeOrg] = useState("");
  const [cor, setCor] = useState("#0F2D5B");
  const [whatsapp, setWhatsapp] = useState("");
  const [creci, setCreci] = useState("");

  const buscar = useCallback(async (): Promise<Painel> => {
    const r = await fetch("/api/equipe", { headers: { Authorization: `Bearer ${await token()}` } });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }, [token]);

  const aplicar = useCallback((d: Painel) => {
    setPainel(d);
    if (d.org) {
      setNomeOrg(d.org.nome);
      setCor(d.org.marca.cor ?? "#0F2D5B");
      setWhatsapp(d.org.marca.whatsapp ?? "");
      setCreci(d.org.marca.creci ?? "");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    buscar()
      .then(aplicar)
      .catch((e: Error) => setErro(e.message));
  }, [user, buscar, aplicar]);

  async function chamar(url: string, init: RequestInit, ok?: string) {
    setOcupado(true);
    setErro(null);
    setMensagem(null);
    try {
      const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await token()}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      aplicar(await buscar());
      c.recarregar();
      if (ok) setMensagem(ok);
      return d;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  const json = (corpo: unknown, method = "POST") => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const d = await chamar("/api/equipe", json({ nome: nomeNova }));
    if (d) setMensagem(d.transferidos > 0 ? `Equipe criada. Seus ${d.transferidos} créditos passaram pra ela.` : "Equipe criada.");
  }

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    const d = await chamar("/api/equipe/membros", json({ email: emailConvite, papel: papelConvite }), "Convite registrado. Quando a pessoa entrar no Encena com esse e-mail, já cai na equipe. Avise pelo WhatsApp.");
    if (d) setEmailConvite("");
  }

  async function salvarMarca(e: React.FormEvent, logo?: File) {
    e?.preventDefault?.();
    const form = new FormData();
    form.append("nome", nomeOrg);
    form.append("cor", cor);
    form.append("whatsapp", whatsapp);
    form.append("creci", creci);
    if (logo) form.append("logo", logo);
    await chamar("/api/equipe/marca", { method: "POST", body: form }, "Marca da equipe salva.");
  }

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;
  if (!c.user || !c.conta) {
    return (
      <main className="p-12">
        <Link href="/login" className="underline">Entre para ver sua equipe.</Link>
      </main>
    );
  }

  const campo = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-marca-indigo focus:outline-none";
  const org = painel?.org ?? null;
  const papel = painel?.papel ?? "corretor";
  const gerencia = papel === "dono" || papel === "gestor";

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      {!org ? (
        <>
          <h1 className="text-2xl font-semibold">Equipe</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Uma conta para mais de uma pessoa: cada um entra com o próprio e-mail, os créditos são compartilhados e a
            mesma marca vai nas fotos, vídeos e links. Serve pra corretor com assistente, dupla de corretores ou
            imobiliária inteira.
          </p>
          {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
          {painel && (
            <div className="mt-6 grid gap-6 lg:grid-cols-12">
              <Cartao className="lg:col-span-7">
                <Rotulo>Criar minha equipe</Rotulo>
                <form onSubmit={criar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block text-xs text-neutral-500">Nome da equipe</span>
                    <input value={nomeNova} onChange={(e) => setNomeNova(e.target.value)} maxLength={80} placeholder="Ex.: Lima Imóveis" className={campo} />
                  </label>
                  <Botao type="submit" disabled={ocupado || nomeNova.trim().length < 2}>{ocupado ? "Criando…" : "Criar"}</Botao>
                </form>
                <ul className="mt-4 flex flex-col gap-1.5 text-sm text-neutral-600">
                  <li>· Você vira o dono. Seus {c.conta.creditos ?? 0} créditos passam pra equipe.</li>
                  <li>· Convide por e-mail: até {PESSOAS_POR_PLANO.gratis} pessoas pra testar, {PESSOAS_POR_PLANO.equipe} no plano Equipe, {PESSOAS_POR_PLANO.imobiliaria} no Imobiliária.</li>
                  <li>· Quem entra usa os créditos da equipe; os pessoais ficam guardados até sair.</li>
                </ul>
              </Cartao>
              <Cartao className="lg:col-span-5">
                <Rotulo>Fui convidado</Rotulo>
                <p className="text-sm text-neutral-600">Se alguém te convidou, é só ter entrado com o mesmo e-mail do convite: a equipe aparece aqui sozinha. Se não apareceu, confira com quem convidou qual e-mail foi usado.</p>
                <p className="mt-3 text-sm text-neutral-600">
                  Planos com mais de uma pessoa: <Link href="/planos#imobiliaria" className="text-marca-indigo underline">ver preços</Link>.
                </p>
              </Cartao>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{org.nome}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                Plano {org.planoRotulo} · {org.creditos} {org.creditos === 1 ? "crédito" : "créditos"} · {org.pessoas} de {org.limite} pessoas
                {org.renovaEm && org.status === "active" && <> · renova em {new Date(org.renovaEm).toLocaleDateString("pt-BR")}</>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {gerencia && (
                <Link href="/planos#imobiliaria" className="inline-flex items-center gap-2 rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
                  <Icone nome="planos" className="h-4 w-4" />
                  {org.status === "active" ? "Plano e créditos" : "Assinar plano"}
                </Link>
              )}
              {papel !== "dono" && (
                <Botao variante="perigo" onClick={() => window.confirm("Sair da equipe? Você volta a usar seus créditos pessoais.") && chamar("/api/equipe/membros", json({ sair: true }, "DELETE"))} disabled={ocupado} className="text-xs">
                  Sair da equipe
                </Botao>
              )}
            </div>
          </div>

          {(c.aviso || mensagem) && <div className="mt-4"><Aviso tipo="ok">{mensagem ?? c.aviso}</Aviso></div>}
          {erro && <div className="mt-4"><Aviso tipo="erro">{erro}</Aviso></div>}
          {org.plano === "gratis" && gerencia && (
            <div className="mt-4">
              <Aviso tipo="atencao">
                A equipe ainda não tem plano: dá pra montar o time (até {org.limite} pessoas) e usar os créditos que vieram com você. <Link href="/planos#imobiliaria" className="underline">Veja os planos Equipe e Imobiliária.</Link>
              </Aviso>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <section className="flex flex-col gap-4 lg:col-span-7">
              <Cartao>
                <Rotulo>Pessoas</Rotulo>
                <ul className="divide-y divide-neutral-100">
                  {(painel?.membros ?? []).map((m) => (
                    <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.nome || m.email}</p>
                        <p className="truncate text-xs text-neutral-500">{m.nome ? m.email + " · " : ""}{PAPEL[m.papel]} · desde {new Date(m.entrouEm).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <span className="text-xs text-neutral-500" title="Uso neste mês">
                        {m.fotosMes} {m.fotosMes === 1 ? "foto" : "fotos"} · {m.videosMes} {m.videosMes === 1 ? "vídeo" : "vídeos"}
                      </span>
                      {gerencia && m.papel !== "dono" && m.userId !== c.user?.id && (
                        <div className="flex items-center gap-2">
                          {papel === "dono" && (
                            <button onClick={() => chamar("/api/equipe/membros", json({ userId: m.userId, papel: m.papel === "gestor" ? "corretor" : "gestor" }, "PATCH"))} disabled={ocupado} className="text-xs text-neutral-500 underline">
                              {m.papel === "gestor" ? "tornar corretor" : "tornar gestor"}
                            </button>
                          )}
                          <button onClick={() => window.confirm(`Remover ${m.nome || m.email} da equipe?`) && chamar("/api/equipe/membros", json({ userId: m.userId }, "DELETE"))} disabled={ocupado} className="text-xs text-red-600 underline">
                            remover
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {gerencia && (
                  <form onSubmit={convidar} className="mt-4 flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 sm:flex-row sm:items-end">
                    <label className="flex-1 text-sm">
                      <span className="mb-1 block text-xs text-neutral-500">Convidar por e-mail</span>
                      <input type="email" value={emailConvite} onChange={(e) => setEmailConvite(e.target.value)} placeholder="corretor@imobiliaria.com.br" className={campo} />
                    </label>
                    <select value={papelConvite} onChange={(e) => setPapelConvite(e.target.value as "corretor" | "gestor")} className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm">
                      <option value="corretor">Corretor</option>
                      <option value="gestor">Gestor</option>
                    </select>
                    <Botao type="submit" variante="secundaria" disabled={ocupado || !emailConvite.includes("@") || org.pessoas + (painel?.convites?.length ?? 0) >= org.limite}>
                      Convidar
                    </Botao>
                  </form>
                )}
                {gerencia && org.pessoas + (painel?.convites?.length ?? 0) >= org.limite && (
                  <p className="mt-2 text-xs text-amber-700">Limite de {org.limite} pessoas do plano {org.planoRotulo} atingido (contando convites). <Link href="/planos#imobiliaria" className="underline">Subir de plano.</Link></p>
                )}

                {(painel?.convites?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <Rotulo>Convites pendentes</Rotulo>
                    <ul className="divide-y divide-neutral-100">
                      {painel!.convites!.map((cv) => (
                        <li key={cv.id} className="flex items-center gap-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{cv.email}</span>
                          <span className="text-xs text-neutral-500">{cv.papel === "gestor" ? "Gestor" : "Corretor"}</span>
                          {gerencia && (
                            <button onClick={() => chamar("/api/equipe/membros", json({ conviteId: cv.id }, "DELETE"))} disabled={ocupado} className="text-xs text-neutral-500 underline">
                              cancelar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-neutral-500">O convite vale quando a pessoa entra no Encena com esse e-mail. Mande o link encena.app.br pra ela.</p>
                  </div>
                )}
              </Cartao>
            </section>

            <aside className="flex flex-col gap-4 lg:col-span-5">
              <Cartao>
                <Rotulo>Marca da equipe</Rotulo>
                <p className="mb-3 text-xs text-neutral-500">Vale como padrão pra toda a equipe: quem não tiver logo ou WhatsApp próprio usa o da casa.</p>
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-28 items-center justify-center rounded-xl border border-neutral-200 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-2">
                    {org.marca.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={org.marca.logoUrl} alt="Logo" className="max-h-16 max-w-full" />
                    ) : (
                      <span className="text-xs text-neutral-400">sem logo</span>
                    )}
                  </div>
                  {gerencia && <Dropzone compacto rotulo={org.marca.logoUrl ? "Trocar logo" : "Enviar logo"} onArquivo={(f) => salvarMarca({ preventDefault() {} } as React.FormEvent, f)} />}
                </div>
                {gerencia ? (
                  <form onSubmit={(e) => salvarMarca(e)} className="mt-3 grid gap-2">
                    <input value={nomeOrg} onChange={(e) => setNomeOrg(e.target.value)} maxLength={80} placeholder="Nome da equipe (ex.: Limiro Imóveis)" className={campo} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={creci} onChange={(e) => setCreci(e.target.value)} maxLength={30} placeholder="CRECI J" className={campo} />
                      <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" maxLength={20} placeholder="WhatsApp (DDD)" className={campo} />
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-neutral-200 bg-white p-1" title="Cor da marca" />
                      <span className="text-xs text-neutral-500">Cor</span>
                      <Botao type="submit" variante="secundaria" disabled={ocupado} className="ml-auto">Salvar</Botao>
                    </div>
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-neutral-600">{org.marca.whatsapp ? `WhatsApp ${org.marca.whatsapp}` : "Sem WhatsApp da casa."}{org.marca.creci ? ` · CRECI ${org.marca.creci}` : ""}</p>
                )}
              </Cartao>

              <Cartao>
                <Rotulo>Como funciona</Rotulo>
                <ul className="flex flex-col gap-1.5 text-sm text-neutral-600">
                  <li>· Tudo que a equipe gera sai dos créditos compartilhados.</li>
                  <li>· Cada pessoa vê seus próprios imóveis, fotos e vídeos; o gestor vê o uso de todos aqui.</li>
                  <li>· Plano {rotuloDoPlano("equipe")}: 400 créditos/mês, 5 pessoas. {rotuloDoPlano("imobiliaria")}: 1.200/mês, 15 pessoas. Pacotes avulsos somam.</li>
                </ul>
              </Cartao>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
