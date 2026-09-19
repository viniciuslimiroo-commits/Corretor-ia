// PREÇOS (lib/planos.ts): as regras que a tabela tem que obedecer, pra uma mudança de
// preço não reabrir o furo de 19/09/2026 -- pacote avulso pelo preço do Pro, sem prazo e
// sem compromisso, e o maior mais barato por foto que a assinatura. Imprime também a
// margem de cada oferta com uso total, que é a tabela de docs/precos-e-margens.md: a conta
// sai daqui, não de calculadora. Sem rede.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-planos.ts

import { OFERTAS, formatarReais, type Oferta } from "../src/lib/planos.ts";

// Premissas de docs/precos-e-margens.md. Mudou lá, muda aqui.
const CUSTO_POR_CREDITO = 25; // centavos, com folga sobre a foto medida (R$ 0,22)
const STRIPE_PERCENTUAL = 0.0399;
const STRIPE_FIXO = 39; // centavos por cobrança
const IMPOSTO = 0.06; // Simples, anexo III com fator R (estimado)
const MARGEM_MINIMA = 0.25; // com uso total; abaixo disso a oferta não se paga com folga

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};
const texto = (s: string) => s.replace(/ /g, " ");
const reais = (centavos: number) => texto(formatarReais(Math.round(centavos)));
/** Centavos por crédito, com o anual dividido pelos 12 meses que ele cobre. */
const porCredito = (o: Oferta) => o.preco / (o.periodo === "ano" ? 12 : 1) / o.creditos;

const assinaturas = OFERTAS.filter((o) => o.tipo === "assinatura");
const pacotes = OFERTAS.filter((o) => o.tipo === "pacote");

// ---------- pacote x assinatura ----------
{
  const maisCara = assinaturas.reduce((a, b) => (porCredito(b) > porCredito(a) ? b : a));
  for (const p of pacotes) {
    conferir(porCredito(p) > porCredito(maisCara), `${p.rotulo}: ${reais(porCredito(p))} por foto, mais caro que a assinatura mais cara por foto (${maisCara.rotulo}, ${reais(porCredito(maisCara))})`);
  }
  const ordem = [...pacotes].sort((a, b) => a.creditos - b.creditos);
  conferir(ordem.every((p, i) => i === 0 || porCredito(p) < porCredito(ordem[i - 1])), "pacote maior sai mais barato por foto", ordem.map((p) => `${p.creditos}: ${reais(porCredito(p))}`).join(" · "));
  for (const p of pacotes) {
    const esperado = `${reais(p.preco / p.creditos)} por foto`;
    conferir(p.detalhes.some((d) => texto(d) === esperado), `${p.rotulo}: o cartão diz "${esperado}"`, p.detalhes[0]);
  }
}

// ---------- assinaturas ----------
{
  for (const a of assinaturas.filter((o) => o.periodo === "ano")) {
    const mensal = assinaturas.find((o) => o.plano === a.plano && o.periodo === "mês");
    conferir(!!mensal && a.preco === mensal.preco * 10, `${a.rotulo}: paga 10 meses do mensal`, mensal ? `${reais(a.preco)} = 10 × ${reais(mensal.preco)}` : "sem mensal");
    conferir(!!mensal && a.creditos === mensal.creditos, `${a.rotulo}: os mesmos créditos por mês do mensal`);
  }
  conferir(OFERTAS.every((o) => !o.lancamento || o.tipo === "assinatura"), "preço de lançamento só em assinatura (é promessa de manter o valor na renovação)");
  conferir(OFERTAS.every((o) => !o.detalhes.some((d) => /^Equivale a/i.test(d))), "o 'equivale a' do anual é calculado no cartão, não repetido na lista");
}

// ---------- chaves ----------
{
  conferir(OFERTAS.every((o) => o.lookupKey === `encena_${o.id}`), "lookup_key = encena_<id> em todas (o sincronizador da Stripe usa isso)");
  conferir(new Set(OFERTAS.map((o) => o.id)).size === OFERTAS.length, "ids únicos");
}

// ---------- margem ----------
{
  console.log("\nMargem por mês (uso total e metade), em reais:");
  console.log("| Oferta | Receita/mês | Taxas | IA 100% | Lucro 100% | Lucro 50% |");
  console.log("|---|---|---|---|---|---|");
  for (const o of OFERTAS) {
    const meses = o.periodo === "ano" ? 12 : 1;
    const receita = o.preco / meses;
    const taxas = (o.preco * STRIPE_PERCENTUAL + STRIPE_FIXO) / meses + receita * IMPOSTO;
    const ia = o.creditos * CUSTO_POR_CREDITO;
    const lucro = receita - taxas - ia;
    const lucroMetade = receita - taxas - ia / 2;
    const pct = (v: number) => `${Math.round((v / receita) * 100)}%`;
    console.log(`| ${o.rotulo} · ${reais(o.preco)} | ${reais(receita)} | ${reais(taxas)} | ${reais(ia)} | **${reais(lucro)} (${pct(lucro)})** | ${o.tipo === "pacote" ? "—" : `${reais(lucroMetade)} (${pct(lucroMetade)})`} |`);
    if (lucro / receita < MARGEM_MINIMA) conferir(false, `${o.rotulo}: margem com uso total abaixo de ${MARGEM_MINIMA * 100}%`, pct(lucro));
  }
  console.log("");
}

console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
