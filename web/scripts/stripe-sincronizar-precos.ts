// Deixa a Stripe igual a src/lib/planos.ts: pra cada oferta, UM preço ativo com a
// lookup_key dela, no valor, no intervalo e com os créditos (metadata) da lista. É o que
// a compra usa -- api/assinar acha o preço pela lookup_key e o webhook credita pelo
// metadata. Idempotente: rodar de novo sem mudar a lista não faz nada.
//
// Preço na Stripe não muda de valor. Quando o valor ou os créditos mudam, cria um preço
// novo, passa a lookup_key pra ele (transfer_lookup_key) e arquiva o antigo. Assinatura
// que já existe continua no preço antigo: é assim que o "preço de lançamento" se mantém
// pra quem assinou. Preço com chave encena_* que saiu da lista é arquivado, e o produto
// também, se ficar sem preço ativo. Arquivar é reversível no painel.
//
// Sem argumento, só MOSTRA o que faria. --aplicar faz tudo. --so-criar faz só o que não
// mexe no que está no ar (chaves novas e metadata que faltava), pra testar antes de
// publicar. Chave: STRIPE_SECRET_KEY do ambiente ou do .env.local. Chave live exige --live.
//
//   node --import ./scripts/ts-direto.mjs scripts/stripe-sincronizar-precos.ts
//   node --import ./scripts/ts-direto.mjs scripts/stripe-sincronizar-precos.ts --aplicar

import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { OFERTAS, rotuloDoPlano, type Oferta } from "../src/lib/planos.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const APLICAR = args.has("--aplicar");
const SO_CRIAR = args.has("--so-criar");

function chaveDaStripe(): string {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
  const arquivo = path.join(RAIZ, ".env.local");
  if (!fs.existsSync(arquivo)) return "";
  const linha = fs.readFileSync(arquivo, "utf8").split(/\r?\n/).find((l) => l.startsWith("STRIPE_SECRET_KEY="));
  return linha ? linha.slice(linha.indexOf("=") + 1).trim() : "";
}

const chave = chaveDaStripe();
if (!chave) {
  console.log("STRIPE_SECRET_KEY não encontrada (nem no ambiente, nem no .env.local).");
  process.exit(1);
}
const live = /^[rs]k_live_/.test(chave);
console.log(`Stripe em modo ${live ? "LIVE (dinheiro de verdade)" : "TESTE"}\n`);
if (live && (APLICAR || SO_CRIAR) && !args.has("--live")) {
  console.log("Chave live: pra mudar alguma coisa, rode de novo com --live também.");
  process.exit(1);
}
const s = new Stripe(chave);

// O que o webhook lê pra creditar. Mudou um desses, o preço é outro (novo preço, não edição).
const CHAVES_DE_CREDITO = ["creditos", "creditos_por_ciclo", "creditos_por_mes", "meses"];

function metadataDe(o: Oferta): Record<string, string> {
  if (o.tipo === "pacote") return { creditos: String(o.creditos), segmento: "todos" };
  const base: Record<string, string> = { plano: o.plano ?? "", segmento: o.segmento };
  if (o.segmento === "imobiliaria" && o.pessoas) base.pessoas = String(o.pessoas);
  return o.periodo === "ano" ? { creditos_por_mes: String(o.creditos), meses: "12", ...base } : { creditos_por_ciclo: String(o.creditos), ...base };
}

const intervaloDe = (o: Oferta): "month" | "year" | null => (o.tipo === "pacote" ? null : o.periodo === "ano" ? "year" : "month");
const nomeDoProduto = (o: Oferta) => (o.tipo === "pacote" ? `Encena · Pacote de ${o.creditos} créditos` : `Encena ${rotuloDoPlano(o.plano)}`);
const idDoProduto = (p: Stripe.Price) => (typeof p.product === "string" ? p.product : p.product.id);
const reais = (c: number | null) => (c == null ? "?" : `R$ ${(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: c % 100 ? 2 : 0 })}`);
const creditosDe = (m: Record<string, string>) => CHAVES_DE_CREDITO.filter((k) => m[k]).map((k) => `${k}=${m[k]}`).join(" ");
const descrever = (valor: number | null, intervalo: string | null, meta: Record<string, string>) => `${reais(valor)} ${intervalo === "year" ? "/ano" : intervalo === "month" ? "/mês" : "único"} · ${creditosDe(meta)}`;

function diferencas(p: Stripe.Price, o: Oferta): string[] {
  const d: string[] = [];
  if (p.currency !== "brl") d.push(`moeda ${p.currency} -> brl`);
  if (p.unit_amount !== o.preco) d.push(`valor ${reais(p.unit_amount)} -> ${reais(o.preco)}`);
  const intervalo = p.recurring?.interval ?? null;
  if (intervalo !== intervaloDe(o) || (p.recurring?.interval_count ?? 1) !== 1) d.push(`intervalo ${intervalo ?? "único"} -> ${intervaloDe(o) ?? "único"}`);
  const m = metadataDe(o);
  for (const k of CHAVES_DE_CREDITO) if ((p.metadata[k] ?? "") !== (m[k] ?? "")) d.push(`${k} ${p.metadata[k] ?? "-"} -> ${m[k] ?? "-"}`);
  return d;
}

function metadataQueFalta(p: Stripe.Price, o: Oferta): Record<string, string> {
  return Object.fromEntries(Object.entries(metadataDe(o)).filter(([k, v]) => !CHAVES_DE_CREDITO.includes(k) && p.metadata[k] !== v));
}

// ---------- o que existe ----------
const precos: Stripe.Price[] = [];
for await (const p of s.prices.list({ limit: 100, expand: ["data.product"] })) precos.push(p);
const produtos: Stripe.Product[] = [];
for await (const p of s.products.list({ limit: 100, active: true })) produtos.push(p);
const ativoDaChave = (k: string) => precos.find((p) => p.active && p.lookup_key === k) ?? null;

// ---------- o plano ----------
type Acao =
  | { tipo: "ok"; o: Oferta; preco: Stripe.Price }
  | { tipo: "metadata"; o: Oferta; preco: Stripe.Price; meta: Record<string, string> }
  | { tipo: "trocar"; o: Oferta; preco: Stripe.Price; motivo: string[] }
  | { tipo: "criar"; o: Oferta; produto: string | null }
  | { tipo: "arquivar"; preco: Stripe.Price };

const acoes: Acao[] = [];
for (const o of OFERTAS) {
  const atual = ativoDaChave(o.lookupKey);
  if (!atual) {
    // Produto: o do mesmo plano (mensal e anual dividem), senão um ativo com o mesmo nome, senão novo.
    const irmao = OFERTAS.find((x) => x !== o && x.plano && x.plano === o.plano && ativoDaChave(x.lookupKey));
    const produto = irmao ? idDoProduto(ativoDaChave(irmao.lookupKey)!) : (produtos.find((p) => p.name === nomeDoProduto(o))?.id ?? null);
    acoes.push({ tipo: "criar", o, produto });
    continue;
  }
  const motivo = diferencas(atual, o);
  if (motivo.length) {
    acoes.push({ tipo: "trocar", o, preco: atual, motivo });
    continue;
  }
  const meta = metadataQueFalta(atual, o);
  acoes.push(Object.keys(meta).length ? { tipo: "metadata", o, preco: atual, meta } : { tipo: "ok", o, preco: atual });
}
const chavesDaLista = new Set(OFERTAS.map((o) => o.lookupKey));
for (const p of precos) if (p.active && p.lookup_key?.startsWith("encena_") && !chavesDaLista.has(p.lookup_key)) acoes.push({ tipo: "arquivar", preco: p });

const coluna = (t: string, n: number) => t.padEnd(n);
for (const a of acoes) {
  if (a.tipo === "arquivar") {
    console.log(`${coluna("arquivar", 9)} ${coluna(a.preco.lookup_key ?? "", 28)} ${descrever(a.preco.unit_amount, a.preco.recurring?.interval ?? null, a.preco.metadata)} (saiu de planos.ts)`);
    continue;
  }
  const k = coluna(a.o.lookupKey, 28);
  const novo = descrever(a.o.preco, intervaloDe(a.o), metadataDe(a.o));
  if (a.tipo === "ok") console.log(`${coluna("ok", 9)} ${k} ${novo}`);
  if (a.tipo === "metadata") console.log(`${coluna("metadata", 9)} ${k} completa ${Object.entries(a.meta).map(([x, v]) => `${x}=${v}`).join(" ")}`);
  if (a.tipo === "trocar") console.log(`${coluna("trocar", 9)} ${k} ${a.motivo.join(", ")} (preço novo; o antigo é arquivado${a.o.tipo === "assinatura" ? " e continua valendo pra quem já assina" : ""})`);
  if (a.tipo === "criar") console.log(`${coluna("criar", 9)} ${k} ${novo} · ${a.produto ? `produto ${a.produto}` : `produto novo "${nomeDoProduto(a.o)}"`}`);
}

const pendentes = acoes.filter((a) => a.tipo !== "ok");
if (!APLICAR && !SO_CRIAR) {
  console.log(pendentes.length ? "\nNada foi mudado. Pra fazer: --aplicar (tudo) ou --so-criar (só o que não mexe no que está no ar)." : "\nA Stripe já está igual à lista.");
  process.exit(0);
}

// ---------- fazer ----------
async function criarPreco(o: Oferta, produto: string | null): Promise<Stripe.Price> {
  const produtoId = produto ?? (await s.products.create({ name: nomeDoProduto(o) })).id;
  const intervalo = intervaloDe(o);
  return s.prices.create({
    product: produtoId,
    currency: "brl",
    unit_amount: o.preco,
    ...(intervalo ? { recurring: { interval: intervalo } } : {}),
    lookup_key: o.lookupKey,
    transfer_lookup_key: true,
    nickname: o.rotulo,
    metadata: metadataDe(o),
  });
}

const produtosTocados = new Set<string>();
for (const a of pendentes) {
  const pular = SO_CRIAR && (a.tipo === "trocar" || a.tipo === "arquivar");
  const nome = a.tipo === "arquivar" ? a.preco.lookup_key : a.o.lookupKey;
  if (pular) {
    console.log(`pulado   ${nome} (--so-criar)`);
    continue;
  }
  if (a.tipo === "criar") await criarPreco(a.o, a.produto);
  if (a.tipo === "metadata") await s.prices.update(a.preco.id, { metadata: a.meta });
  if (a.tipo === "trocar") {
    await criarPreco(a.o, idDoProduto(a.preco));
    await s.prices.update(a.preco.id, { active: false });
  }
  if (a.tipo === "arquivar") {
    await s.prices.update(a.preco.id, { active: false });
    produtosTocados.add(idDoProduto(a.preco));
  }
  console.log(`feito    ${nome}`);
}
for (const produto of produtosTocados) {
  const { data } = await s.prices.list({ product: produto, active: true, limit: 1 });
  if (!data.length) {
    await s.products.update(produto, { active: false });
    console.log(`feito    produto ${produto} arquivado (ficou sem preço ativo)`);
  }
}

// ---------- conferir, lendo de novo ----------
let erradas = 0;
for (const o of OFERTAS) {
  const { data } = await s.prices.list({ lookup_keys: [o.lookupKey], active: true, limit: 2 });
  const d = data.length === 1 ? diferencas(data[0], o) : [`${data.length} preços ativos com a chave`];
  if (d.length && !(SO_CRIAR && data.length === 1)) {
    erradas++;
    console.log(`FALHA    ${o.lookupKey}: ${d.join(", ")}`);
  }
}
console.log(erradas ? `\n${erradas} oferta(s) não batem com a Stripe` : `\nConferido: ${OFERTAS.length} ofertas${SO_CRIAR ? " existem na Stripe (as trocas ficaram pra --aplicar)" : " batem com a Stripe"}.`);
process.exit(erradas ? 1 : 0);
