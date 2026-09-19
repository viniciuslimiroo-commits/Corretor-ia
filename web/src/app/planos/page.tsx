"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConta } from "@/lib/use-conta";
import { OFERTAS, OFERTAS_POR_ID, formatarReais, rotuloDoPlano, type Oferta, type OfertaId } from "@/lib/planos";
import AppShell from "@/components/app-shell";
import { Aviso, Botao, Icone } from "@/components/ui";
import { Marca } from "@/components/marca";

// Planos: dois tamanhos de conta -- UMA pessoa e MAIS DE UMA -- cada um com mensal e
// anual, e os
// pacotes avulsos pros dois. Preço em real, crédito explicado em foto. Quem já assina
// vê o plano atual e vai pro portal da Stripe pra trocar ou cancelar. Quem é membro de
// imobiliária sem ser gestor só olha: quem compra é o gestor.

function CartaoOferta({ o, atual, aoEscolher, ocupado, logado, bloqueado }: { o: Oferta; atual: boolean; aoEscolher: (id: OfertaId) => void; ocupado: boolean; logado: boolean; bloqueado?: string | null }) {
  const mensal = o.periodo === "ano" ? o.preco / 12 : o.preco;
  return (
    <div className={"relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm " + (o.destaque ? "border-marca-coral ring-2 ring-marca-coral/30" : "border-neutral-200")}>
      {o.destaque && <span className="absolute -top-3 left-5 rounded-full bg-marca-coral px-3 py-0.5 text-xs font-semibold text-white">2 meses grátis</span>}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{o.rotulo}</p>
        {o.lancamento && <span className="rounded-full bg-marca-teal/10 px-2.5 py-0.5 text-xs font-medium text-marca-teal">Preço de lançamento</span>}
      </div>
      <p className="mt-2 text-3xl font-semibold text-neutral-900">
        {formatarReais(o.preco)}
        {o.periodo && <span className="text-base font-normal text-neutral-500">/{o.periodo}</span>}
      </p>
      {o.periodo === "ano" && <p className="text-xs text-neutral-500">equivale a {formatarReais(Math.round(mensal))} por mês</p>}
      <p className="mt-1 text-sm text-neutral-600">{o.descricao}</p>
      <ul className="mt-4 flex flex-col gap-1.5 text-sm text-neutral-700">
        {o.detalhes.map((d) => (
          <li key={d} className="flex items-start gap-2">
            <Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-teal" />
            {d}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        {bloqueado ? (
          <p className="text-xs text-neutral-500">{bloqueado}</p>
        ) : atual ? (
          <Botao variante="secundaria" onClick={() => aoEscolher(o.id)} disabled={ocupado} className="w-full">Seu plano · gerenciar</Botao>
        ) : logado ? (
          <Botao variante={o.destaque || o.tipo === "assinatura" ? "primaria" : "secundaria"} onClick={() => aoEscolher(o.id)} disabled={ocupado} className="w-full">
            {o.tipo === "assinatura" ? "Assinar" : "Comprar"}
          </Botao>
        ) : (
          <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-coral-escuro">
            Entrar para {o.tipo === "assinatura" ? "assinar" : "comprar"}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Preço de uma foto na oferta, com o anual dividido pelos 12 meses que ele cobre. */
const porFoto = (o: Oferta) => formatarReais(Math.round(o.preco / (o.periodo === "ano" ? 12 : 1) / o.creditos));
const PACOTES_POR_PRECO = OFERTAS.filter((o) => o.tipo === "pacote").sort((a, b) => a.preco / a.creditos - b.preco / b.creditos);

const PERGUNTAS = [
  { p: "O que é um crédito?", r: "Uma foto editada com uma ação (mobiliar, trocar piso, remover objeto…). Montar vídeo não gasta crédito: só a cena animada por IA (2) e a narração de IA (1). Se o resultado ficar ruim, você pede o crédito de volta." },
  { p: "Pacote ou assinatura?", r: `Se você anuncia todo mês, assinar sai mais barato: no Pro cada foto custa ${porFoto(OFERTAS_POR_ID.pro_mensal)} (${porFoto(OFERTAS_POR_ID.pro_anual)} no anual); nos pacotes, de ${porFoto(PACOTES_POR_PRECO[0])} a ${porFoto(PACOTES_POR_PRECO[PACOTES_POR_PRECO.length - 1])}. O pacote é pra quem usa de vez em quando, ou pra completar o mês quando os créditos do plano acabam.` },
  { p: "O preço pode mudar?", r: "O Pro está com preço de lançamento: quem assina agora mantém esse valor enquanto a assinatura estiver ativa. Nos outros planos, mudança de preço vale pra compras novas; se um dia mudar numa assinatura ativa, avisamos por e-mail com 30 dias de antecedência e você pode cancelar antes." },
  { p: "Como funciona o anual?", r: "Você paga 10 meses e usa 12. Os créditos entram mês a mês, na mesma data, durante o ano. Cancelar não devolve os meses já pagos, mas os créditos continuam entrando até o fim do período." },
  { p: "Preciso ter imobiliária ou CNPJ?", r: "Não. O plano Pro é de uma pessoa só e a maioria de quem usa trabalha sozinho — basta seu e-mail. A conta de equipe existe pra quando forem mais de um: corretor com assistente, dupla de corretores ou imobiliária. Cada um entra com o próprio e-mail, todos gastam dos mesmos créditos, e quem gerencia vê o uso de cada um." },
  { p: "Os créditos expiram?", r: "Os da assinatura valem enquanto ela estiver ativa; os do pacote não expiram. Ao cancelar, o que você já tem continua valendo até acabar." },
  { p: "Posso cancelar quando quiser?", r: "Sim, com um clique em \"Gerenciar assinatura\". Sem multa e sem ligar pra ninguém." },
];

export default function Planos() {
  const c = useConta();
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const assinante = c.conta?.status === "active" || c.conta?.status === "past_due";
  const org = c.conta?.org ?? null;
  const gestor = !org || org.papel !== "corretor";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("compra") === "cancelada" || params.get("assinatura") === "cancelada") {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setAviso("Pagamento não concluído. Nada foi cobrado."), 0);
    }
  }, []);

  const corretor = OFERTAS.filter((o) => o.segmento === "corretor");
  const imobiliaria = OFERTAS.filter((o) => o.segmento === "imobiliaria");
  const pacotes = OFERTAS.filter((o) => o.segmento === "pacote");

  async function escolher(id: OfertaId) {
    const o = OFERTAS.find((x) => x.id === id);
    if (o?.segmento === "imobiliaria" && c.user && !org) {
      router.push("/equipe");
      return;
    }
    c.assinar(id);
  }

  const bloqueioCorretor = org ? "Você faz parte de uma imobiliária: os planos são os de imobiliária." : null;
  const bloqueioImobiliaria = org && !gestor ? "Só o dono ou gestor da imobiliária assina." : !org && c.user ? null : null;
  const bloqueioPacote = org && !gestor ? "Só o dono ou gestor da imobiliária compra." : null;

  const conteudo = (
    <>
      {aviso && <div className="mb-4"><Aviso tipo="atencao">{aviso}</Aviso></div>}
      {c.erro && <div className="mb-4"><Aviso tipo="erro">{c.erro}</Aviso></div>}

      <h1 className="text-2xl font-semibold">Planos e créditos</h1>
      <p className="mt-1 text-sm text-neutral-500">1 crédito = 1 foto editada. Montar vídeo não gasta crédito: só a cena animada (2) e a narração de IA (1). Toda conta começa com 5 créditos grátis, sem cartão.</p>
      {c.conta && (
        <p className="mt-2 text-sm text-neutral-700">
          {org ? `${org.nome}: ` : "Você tem "}
          <strong>{c.conta.creditos ?? 0}</strong> {c.conta.creditos === 1 ? "crédito" : "créditos"}
          {assinante && <> · plano {rotuloDoPlano(c.conta.plano)}</>}
          {assinante && c.conta.renovaEm && <> · renova em {new Date(c.conta.renovaEm).toLocaleDateString("pt-BR")}</>}
          {c.conta.status === "past_due" && <span className="text-amber-700"> · pagamento pendente, atualize o cartão em &quot;Gerenciar assinatura&quot;</span>}
        </p>
      )}

      <section id="corretor" className="mt-8 scroll-mt-24">
        <h2 className="text-lg font-semibold">Você sozinho</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Uma pessoa, seu login, sua marca.
          {corretor.some((o) => o.lancamento) && " Preço de lançamento: quem assina agora mantém o valor enquanto a assinatura estiver ativa."}
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {corretor.map((o) => (
            <CartaoOferta key={o.id} o={o} atual={!org && assinante} aoEscolher={escolher} ocupado={c.ocupado} logado={!!c.user} bloqueado={bloqueioCorretor} />
          ))}
        </div>
      </section>

      <section id="imobiliaria" className="mt-10 scroll-mt-24">
        <h2 className="text-lg font-semibold">Mais de uma pessoa</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Corretor com assistente, dupla de corretores ou imobiliária inteira: créditos compartilhados, cada um com
          seu login, a mesma marca em tudo. {!org && c.user && <Link href="/equipe" className="text-marca-indigo underline">Crie sua equipe</Link>}
          {!org && c.user && " antes de assinar."}
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {imobiliaria.map((o) => (
            <CartaoOferta key={o.id} o={o} atual={!!org && assinante && c.conta?.plano === o.plano} aoEscolher={escolher} ocupado={c.ocupado} logado={!!c.user} bloqueado={bloqueioImobiliaria} />
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">Mais de 15 pessoas ou mais créditos por mês? Fale com a gente pelo WhatsApp e montamos um plano sob medida.</p>
      </section>

      <section id="pacotes" className="mt-10 scroll-mt-24">
        <h2 className="text-lg font-semibold">Pacotes avulsos</h2>
        <p className="mt-1 text-sm text-neutral-500">Sem assinatura, pagamento único. Somam com o que você (ou a imobiliária) já tem. Se você usa todo mês, a assinatura sai mais barata por foto.</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {pacotes.map((o) => (
            <CartaoOferta key={o.id} o={o} atual={false} aoEscolher={escolher} ocupado={c.ocupado} logado={!!c.user} bloqueado={bloqueioPacote} />
          ))}
        </div>
      </section>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-semibold">Perguntas comuns</h2>
        <dl className="mt-3 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {PERGUNTAS.map((q) => (
            <div key={q.p} className="px-5 py-4">
              <dt className="font-medium">{q.p}</dt>
              <dd className="mt-1 text-sm text-neutral-600">{q.r}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );

  if (c.checando) return <main className="p-12 text-sm text-neutral-500">Carregando…</main>;

  if (!c.user || !c.conta) {
    return (
      <main className="min-h-screen bg-neutral-50 font-sans">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca-encena.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
              <Marca className="text-lg" />
            </Link>
            <Link href="/login" className="ml-auto text-sm text-marca-indigo underline">Entrar</Link>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{conteudo}</div>
      </main>
    );
  }

  return (
    <AppShell conta={c.conta} aoAssinar={c.assinar} aoSair={c.sair} ocupado={c.ocupado}>
      {conteudo}
    </AppShell>
  );
}
