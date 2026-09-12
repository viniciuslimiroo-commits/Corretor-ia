"use client";

import Link from "next/link";
import { ACOES } from "@/lib/acoes";
import { OFERTAS, formatarReais } from "@/lib/planos";
import Comparador from "./comparador";
import { Icone } from "./ui";

// Página inicial de quem ainda não entrou. É a peça de venda: antes e depois reais
// (resultados dos testes, com o selo de imagem ilustrativa que o produto sempre coloca),
// como funciona, o que faz, planos e perguntas. Sem depoimento inventado, sem número
// que não medimos.

const EXEMPLOS = [
  { id: "sala", rotulo: "Mobiliar · sala de estar, estilo praiano", antes: "/exemplos/sala-antes.jpg", depois: "/exemplos/sala-depois.jpg" },
  { id: "cozinha", rotulo: "Remover objeto · tirar a bagunça da bancada", antes: "/exemplos/cozinha-antes.jpg", depois: "/exemplos/cozinha-depois.jpg" },
  { id: "parede", rotulo: "Mudar parede · terracota", antes: "/exemplos/parede-antes.jpg", depois: "/exemplos/parede-depois.jpg" },
  { id: "fachada", rotulo: "Trocar céu · dia ensolarado", antes: "/exemplos/fachada-antes.jpg", depois: "/exemplos/fachada-depois.jpg" },
];

const PERGUNTAS = [
  { p: "Isso é permitido em anúncio?", r: "Sim, desde que fique claro que a imagem é ilustrativa. Toda foto alterada sai com esse aviso gravado, e os links compartilhados avisam também. É o que protege o corretor no Código de Defesa do Consumidor." },
  { p: "Preciso saber usar programa de edição?", r: "Não. Você envia a foto, escolhe o que quer (mobiliar, trocar piso, tirar objeto, trocar céu) e ajusta com dois toques. Em menos de um minuto o resultado aparece lado a lado com o original." },
  { p: "Funciona no celular?", r: "Sim. Foto do celular serve, e o resultado baixa no tamanho certo dos portais ou vai direto pro WhatsApp por link." },
  { p: "E se o resultado ficar ruim?", r: "Você pede o crédito de volta na hora. Uma IA compara a foto original com o resultado e o crédito volta." },
  { p: "Como funciona para imobiliária?", r: "Uma conta de equipe: cada corretor entra com o próprio e-mail, todo mundo usa os créditos da imobiliária, o gestor vê o uso de cada um, e a marca da casa vai nas fotos, vídeos e links." },
];

export default function Landing() {
  const pro = OFERTAS.find((o) => o.id === "pro_mensal")!;
  const equipe = OFERTAS.find((o) => o.id === "equipe_mensal")!;
  const imobiliaria = OFERTAS.find((o) => o.id === "imobiliaria_mensal")!;
  const acoes = ACOES.filter((a) => a.id !== "editar_prompt");

  return (
    <main className="min-h-screen bg-white font-sans text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="text-xl font-bold tracking-tight text-marca-indigo">Encena</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-neutral-600 sm:flex">
            <a href="#como" className="hover:text-marca-indigo">Como funciona</a>
            <a href="#recursos" className="hover:text-marca-indigo">Recursos</a>
            <a href="#imobiliarias" className="hover:text-marca-indigo">Imobiliárias</a>
            <Link href="/planos" className="hover:text-marca-indigo">Planos</Link>
          </nav>
          <Link href="/login" className="ml-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">Entrar</Link>
          <Link href="/login" className="hidden rounded-lg bg-marca-coral px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro sm:inline-flex">Testar grátis</Link>
        </div>
      </header>

      {/* ---------- herói ---------- */}
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-14 pb-10 lg:grid-cols-12 lg:items-center lg:pt-20">
        <div className="lg:col-span-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-coral">Inteligência artificial para imóveis</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] text-neutral-900 sm:text-5xl">Fotos que vendem melhor.</h1>
          <p className="mt-5 max-w-lg text-lg text-neutral-600">
            Mobília o ambiente vazio, tire o que atrapalha, troque piso, parede e céu, e monte o vídeo do imóvel com sua marca. Em minutos, pelo celular, com o aviso de imagem ilustrativa já no lugar.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/login" className="rounded-lg bg-marca-coral px-5 py-3 font-medium text-white shadow-sm hover:bg-marca-coral-escuro">
              Começar grátis
            </Link>
            <span className="text-sm text-neutral-500">5 fotos grátis, sem cartão.</span>
          </div>
          <ul className="mt-8 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
            <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-teal" /> Português, real e Pix na chegada</li>
            <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-teal" /> Tamanho certo do ZAP, VivaReal e OLX</li>
            <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-teal" /> Estilos praiano e tropical</li>
            <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-teal" /> Crédito de volta se ficar ruim</li>
          </ul>
        </div>
        <div className="lg:col-span-7">
          <Comparador antes={EXEMPLOS[0].antes} depois={EXEMPLOS[0].depois} />
          <p className="mt-2 text-center text-xs text-neutral-500">{EXEMPLOS[0].rotulo}. Arraste a divisória. Resultado real, sem retoque manual.</p>
        </div>
      </section>

      {/* ---------- exemplos ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-6 md:grid-cols-3">
          {EXEMPLOS.slice(1).map((e) => (
            <figure key={e.id}>
              <Comparador antes={e.antes} depois={e.depois} />
              <figcaption className="mt-2 text-sm text-neutral-600">{e.rotulo}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- como funciona ---------- */}
      <section id="como" className="scroll-mt-20 bg-neutral-50 py-14">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-semibold sm:text-3xl">Três passos, no celular ou no computador</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ["1", "Envie a foto", "Do celular mesmo. Foto escura, cômodo vazio, céu nublado: tudo entra."],
              ["2", "Escolha o que fazer", "Mobiliar com 10 estilos, renovar, trocar piso ou parede, tirar objeto, trocar céu, corrigir luz e perspectiva."],
              ["3", "Compare, baixe, compartilhe", "Antes e depois lado a lado. Baixa no tamanho do portal, com seu logo, ou manda o link pelo WhatsApp."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca-pessego font-bold text-marca-indigo">{n}</span>
                <p className="mt-3 font-semibold">{t}</p>
                <p className="mt-1 text-sm text-neutral-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- recursos ---------- */}
      <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">Tudo que o anúncio precisa</h2>
        <p className="mt-2 max-w-2xl text-neutral-600">Cada ação custa 1 crédito. Vídeo do imóvel, 1 crédito. Cena animada com IA, 2.</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {acoes.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-pessego text-marca-indigo">
                <Icone nome={a.id} />
              </span>
              <div>
                <p className="font-semibold">{a.rotulo}</p>
                <p className="text-sm text-neutral-500">{a.descricao}</p>
              </div>
            </li>
          ))}
          <li className="flex items-start gap-3 rounded-2xl border border-marca-coral/40 bg-marca-pessego/30 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-marca-indigo">
              <Icone nome="video" />
            </span>
            <div>
              <p className="font-semibold">Vídeo do imóvel</p>
              <p className="text-sm text-neutral-600">Fotos viram vídeo com movimento, música, antes e depois, narração e sua marca. Reels, Stories, YouTube.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-pessego text-marca-indigo">
              <Icone nome="compartilhar" />
            </span>
            <div>
              <p className="font-semibold">Imóveis e links</p>
              <p className="text-sm text-neutral-500">Fotos agrupadas por imóvel e um link com antes e depois pra mandar ao cliente.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-pessego text-marca-indigo">
              <Icone nome="download" />
            </span>
            <div>
              <p className="font-semibold">Export pros portais</p>
              <p className="text-sm text-neutral-500">ZAP, VivaReal, OLX e Full HD, com legenda e seu logo, no tamanho que cada um pede.</p>
            </div>
          </li>
        </ul>
      </section>

      {/* ---------- imobiliárias ---------- */}
      <section id="imobiliarias" className="scroll-mt-20 bg-marca-indigo py-14 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-pessego">Para imobiliárias</p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Uma conta para a equipe inteira</h2>
            <p className="mt-3 max-w-xl text-white/80">Cada corretor entra com o próprio e-mail. Os créditos são da imobiliária, o gestor vê o uso de cada um, e o logo e o WhatsApp da casa saem nas fotos, nos vídeos e nos links de todo mundo.</p>
            <ul className="mt-5 grid gap-2 text-sm text-white/90 sm:grid-cols-2">
              <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-pessego" /> Plano por equipe, não por cadeira</li>
              <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-pessego" /> Convite por e-mail, sem instalar nada</li>
              <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-pessego" /> Marca da imobiliária como padrão</li>
              <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-pessego" /> Anual com dois meses grátis</li>
            </ul>
          </div>
          <div className="grid gap-3 lg:col-span-5">
            {[equipe, imobiliaria].map((o) => (
              <div key={o.id} className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
                <p className="text-sm font-semibold uppercase tracking-wider text-marca-pessego">{o.rotulo.replace(" mensal", "")}</p>
                <p className="mt-1 text-3xl font-semibold">
                  {formatarReais(o.preco)}<span className="text-base font-normal text-white/70">/mês</span>
                </p>
                <p className="text-sm text-white/80">{o.creditos} créditos por mês · até {o.pessoas} pessoas</p>
              </div>
            ))}
            <Link href="/planos#imobiliaria" className="inline-flex items-center justify-center rounded-lg bg-marca-coral px-5 py-3 font-medium text-white hover:bg-marca-coral-escuro">Ver planos de imobiliária</Link>
          </div>
        </div>
      </section>

      {/* ---------- preço ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">Simples de entender</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Grátis</p>
            <p className="mt-1 text-3xl font-semibold">R$ 0</p>
            <p className="text-sm text-neutral-600">5 fotos para testar, sem cartão.</p>
          </div>
          <div className="rounded-2xl border-2 border-marca-coral p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{pro.rotulo.replace(" mensal", "")}</p>
            <p className="mt-1 text-3xl font-semibold">{formatarReais(pro.preco)}<span className="text-base font-normal text-neutral-500">/mês</span></p>
            <p className="text-sm text-neutral-600">{pro.creditos} fotos por mês. Anual com dois meses grátis.</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Pacotes</p>
            <p className="mt-1 text-3xl font-semibold">a partir de R$ 25</p>
            <p className="text-sm text-neutral-600">20, 80 ou 200 créditos, sem assinatura. Não expiram.</p>
          </div>
        </div>
        <Link href="/planos" className="mt-5 inline-block text-marca-indigo underline">Todos os planos e perguntas sobre cobrança</Link>
      </section>

      {/* ---------- perguntas ---------- */}
      <section className="bg-neutral-50 py-14">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-2xl font-semibold sm:text-3xl">Perguntas de quem está começando</h2>
          <dl className="mt-6 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
            {PERGUNTAS.map((q) => (
              <div key={q.p} className="px-5 py-4">
                <dt className="font-medium">{q.p}</dt>
                <dd className="mt-1 text-sm text-neutral-600">{q.r}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 text-center">
            <Link href="/login" className="inline-flex rounded-lg bg-marca-coral px-6 py-3 font-medium text-white shadow-sm hover:bg-marca-coral-escuro">Testar com 5 fotos grátis</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5 font-semibold text-marca-indigo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca-encena.svg" alt="" width={16} height={16} className="h-4 w-4" /> Encena
          </span>
          <Link href="/termos" className="hover:text-marca-indigo">Termos de uso</Link>
          <Link href="/privacidade" className="hover:text-marca-indigo">Privacidade</Link>
          <Link href="/planos" className="hover:text-marca-indigo">Planos</Link>
          <span className="ml-auto">Imagens editadas são ilustrativas e saem identificadas.</span>
        </div>
      </footer>
    </main>
  );
}
