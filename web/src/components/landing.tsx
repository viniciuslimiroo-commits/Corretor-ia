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
  { id: "sala", rotulo: "Mobiliar cômodo · sala de estar, estilo praiano", antes: "/exemplos/sala-antes.jpg", depois: "/exemplos/sala-depois.jpg" },
  { id: "quarto", rotulo: "Mobiliar cômodo · quarto vazio, estilo escandinavo", antes: "/exemplos/quarto-antes.jpg", depois: "/exemplos/quarto-depois.jpg" },
  { id: "cozinha", rotulo: "Remover objeto · tirar a bagunça da bancada", antes: "/exemplos/cozinha-antes.jpg", depois: "/exemplos/cozinha-depois.jpg" },
  { id: "parede", rotulo: "Mudar parede · terracota", antes: "/exemplos/parede-antes.jpg", depois: "/exemplos/parede-depois.jpg" },
];

const PERGUNTAS = [
  { p: "Isso é permitido em anúncio?", r: "Sim, desde que fique claro que a imagem é ilustrativa. Toda foto alterada sai com esse aviso gravado, e os links compartilhados avisam também. É o que protege o corretor no Código de Defesa do Consumidor." },
  { p: "Só serve para editar foto?", r: "Não. A edição de foto é uma parte. No mesmo lugar você monta o vídeo do imóvel com movimento de câmera e narração, transforma uma foto 360° ou a panorâmica do celular em tour, desenha a planta baixa com as áreas calculadas, demarca o terreno com as medidas, processa até 40 fotos de uma vez e manda tudo por um link com a sua marca." },
  { p: "Preciso saber usar programa de edição?", r: "Não. Você envia a foto, escolhe o que quer (mobiliar o cômodo, trocar piso, tirar objeto) e ajusta com dois toques. Em menos de um minuto o resultado aparece lado a lado com o original." },
  { p: "Funciona no celular?", r: "Sim. Foto do celular serve, e o resultado baixa no tamanho certo dos portais ou vai direto pro WhatsApp por link." },
  { p: "E se o resultado ficar ruim?", r: "Você pede o crédito de volta na hora. Uma IA compara a foto original com o resultado e o crédito volta." },
  { p: "Trabalho sozinho. Serve pra mim?", r: "Serve, e é o caso mais comum: o plano Pro é de uma pessoa só. Você não precisa de equipe nem de CNPJ pra usar — entra com seu e-mail e começa. Se um dia virar uma dupla ou uma imobiliária, a conta de equipe está lá." },
  { p: "E se formos mais de um?", r: "Dá pra criar uma equipe: cada pessoa entra com o próprio e-mail, todo mundo usa os mesmos créditos, quem gerencia vê o uso de cada um, e a marca da casa vai nas fotos, vídeos e links. Vale pra corretor com assistente, dupla de corretores ou imobiliária inteira." },
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
            <span className="whitespace-nowrap text-xl font-bold tracking-tight text-marca-indigo">
              Encena
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-neutral-600 sm:flex">
            <a href="#como" className="hover:text-marca-indigo">Como funciona</a>
            <a href="#recursos" className="hover:text-marca-indigo">Recursos</a>
            <a href="#imobiliarias" className="hover:text-marca-indigo">Pra quem é</a>
            <Link href="/planos" className="hover:text-marca-indigo">Planos</Link>
          </nav>
          <Link href="/login" className="ml-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50">Entrar</Link>
          <Link href="/login" className="hidden rounded-lg bg-marca-coral px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-marca-coral-escuro sm:inline-flex">Testar grátis</Link>
        </div>
      </header>

      {/* ---------- herói ---------- */}
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-14 pb-10 lg:grid-cols-12 lg:items-center lg:pt-20">
        <div className="lg:col-span-5">
          {/* Não "inteligência artificial para imóveis": é a categoria, e a categoria não
              diferencia ninguém. O que diferencia é o percurso inteiro e a marca do corretor. */}
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-coral">Da foto ao anúncio, com a sua marca</p>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.1] text-neutral-900 sm:text-5xl">O imóvel inteiro, pronto para anunciar.</h1>
          <p className="mt-5 max-w-lg text-lg text-neutral-600">
            Fotos, vídeo, tour 360°, planta baixa e medidas do terreno — tudo no mesmo lugar. Mobília o ambiente vazio, tira o que atrapalha, troca piso e parede, e monta o anúncio com a sua marca. Em minutos, pelo celular.
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
            <li className="flex items-center gap-2"><Icone nome="check" className="h-4 w-4 text-marca-teal" /> Vídeo, tour 360° e planta sem crédito</li>
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
              ["1", "Envie o que tiver", "Foto do celular, panorâmica, vídeo 360°, foto do terreno. Ambiente escuro, cômodo vazio, tudo entra."],
              ["2", "Escolha o que fazer", "Mobiliar o cômodo com 10 estilos, renovar, esvaziar, trocar piso ou parede, tirar objeto, corrigir luz e perspectiva — ou montar o vídeo, o tour 360°, a planta baixa e as medidas do lote."],
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
        <p className="mt-2 max-w-2xl text-neutral-600">
          Cada edição de foto com IA custa 1 crédito. Vídeo, tour 360°, planta baixa e medidas do terreno não gastam crédito nenhum — use à vontade. Só a cena animada com IA custa 2.
        </p>
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
              <p className="font-semibold">Vídeo do imóvel <span className="text-xs font-normal text-marca-coral">sem crédito</span></p>
              <p className="text-sm text-neutral-600">Fotos viram vídeo com movimento de câmera, música, antes e depois, narração e sua marca. Reels, Stories, YouTube.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-marca-coral/40 bg-marca-pessego/30 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-marca-indigo">
              <Icone nome="tour360" />
            </span>
            <div>
              <p className="font-semibold">Tour 360° <span className="text-xs font-normal text-marca-coral">sem crédito</span></p>
              <p className="text-sm text-neutral-600">Foto 360°, ou a panorâmica do próprio celular, vira um passeio pelo ambiente: olhar em volta, giro completo, entrada.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-marca-coral/40 bg-marca-pessego/30 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-marca-indigo">
              <Icone nome="planta" />
            </span>
            <div>
              <p className="font-semibold">Planta baixa <span className="text-xs font-normal text-marca-coral">sem crédito</span></p>
              <p className="text-sm text-neutral-600">Desenhe os cômodos tocando nos cantos. A área de cada um e a total saem calculadas, com portas, janelas e medidas nas paredes.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-marca-coral/40 bg-marca-pessego/30 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-marca-indigo">
              <Icone nome="terreno" />
            </span>
            <div>
              <p className="font-semibold">Terreno e lote <span className="text-xs font-normal text-marca-coral">sem crédito</span></p>
              <p className="text-sm text-neutral-600">Marque os limites na foto do terreno, informe as medidas e a frente. Sai a foto com o lote demarcado e a área.</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca-pessego text-marca-indigo">
              <Icone nome="lote" />
            </span>
            <div>
              <p className="font-semibold">Vários de uma vez</p>
              <p className="text-sm text-neutral-500">Até 40 fotos do mesmo imóvel na mesma ação, processadas em fila, e o pacote pronto num ZIP.</p>
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
      {/* Três públicos, nomeados. Antes havia uma seção só, "Para imobiliárias", e o
          autônomo -- que é a maioria -- não se via em lugar nenhum. Corrigir isso apagando
          a imobiliária seria o erro oposto: ela é o maior ticket e tem necessidade
          própria (marca central, controle de uso, muita gente), não é "equipe maior". */}
      <section id="imobiliarias" className="scroll-mt-20 bg-marca-indigo py-14 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-marca-pessego">Pra quem é</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Do corretor sozinho à imobiliária inteira</h2>
          <p className="mt-3 max-w-2xl text-white/80">
            O mesmo produto, cobrado pelo tamanho da conta. Você começa sozinho e cresce sem trocar de ferramenta —
            o material que já fez continua lá.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-pessego">Corretor</p>
              <p className="mt-1 text-3xl font-semibold">
                {formatarReais(pro.preco)}<span className="text-base font-normal text-white/70">/mês</span>
              </p>
              <p className="text-sm text-white/80">{pro.creditos} fotos por mês · 1 pessoa</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/90">
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-pessego" /> Sem CNPJ e sem equipe: só o seu e-mail</li>
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-pessego" /> Seu nome, CRECI e WhatsApp nas fotos</li>
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-pessego" /> Vídeo, tour, planta e terreno sem crédito</li>
              </ul>
              <Link href="/login" className="mt-5 inline-flex items-center justify-center rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/25">Testar grátis</Link>
            </div>

            <div className="flex flex-col rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-pessego">Equipe</p>
              <p className="mt-1 text-3xl font-semibold">
                {formatarReais(equipe.preco)}<span className="text-base font-normal text-white/70">/mês</span>
              </p>
              <p className="text-sm text-white/80">{equipe.creditos} créditos por mês · até {equipe.pessoas} pessoas</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-white/90">
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-pessego" /> Pra dupla de corretores ou corretor com assistente</li>
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-pessego" /> Créditos no bolo, sem dividir por cadeira</li>
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-pessego" /> Convite por e-mail, sem instalar nada</li>
              </ul>
              <Link href="/planos#imobiliaria" className="mt-5 inline-flex items-center justify-center rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/25">Ver o plano Equipe</Link>
            </div>

            <div className="flex flex-col rounded-2xl bg-white p-5 text-neutral-900 shadow-lg">
              <p className="text-sm font-semibold uppercase tracking-wider text-marca-coral">Imobiliária</p>
              <p className="mt-1 text-3xl font-semibold">
                {formatarReais(imobiliaria.preco)}<span className="text-base font-normal text-neutral-500">/mês</span>
              </p>
              <p className="text-sm text-neutral-600">{imobiliaria.creditos} créditos por mês · até {imobiliaria.pessoas} pessoas</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-700">
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-teal" /> A marca da casa entra sozinha no material de todo corretor</li>
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-teal" /> O gestor vê quanto cada um gerou e gastou</li>
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-teal" /> Corretor novo entra e já produz no padrão da casa</li>
                <li className="flex gap-2"><Icone nome="check" className="mt-0.5 h-4 w-4 shrink-0 text-marca-teal" /> Anual com dois meses grátis</li>
              </ul>
              <Link href="/planos#imobiliaria" className="mt-5 inline-flex items-center justify-center rounded-lg bg-marca-coral px-4 py-2.5 text-sm font-medium text-white hover:bg-marca-coral-escuro">Ver o plano Imobiliária</Link>
            </div>
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
          <span className="text-neutral-400">encena.app.br</span>
          <Link href="/termos" className="hover:text-marca-indigo">Termos de uso</Link>
          <Link href="/privacidade" className="hover:text-marca-indigo">Privacidade</Link>
          <Link href="/planos" className="hover:text-marca-indigo">Planos</Link>
          <span className="ml-auto">Imagens editadas são ilustrativas e saem identificadas.</span>
        </div>
      </footer>
    </main>
  );
}
