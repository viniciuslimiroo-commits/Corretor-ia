// COMPRA DE PACOTE, sem pagar: pra cada pacote de lib/planos.ts, pede o checkout pela API
// do Encena (a mesma do botão Comprar) e confere NA STRIPE o que a sessão vai cobrar --
// valor, moeda, lookup_key do preço e os créditos que o webhook vai dar. Depois expira a
// sessão: nada fica aberto e nada é cobrado. É a prova de que a tela, a Stripe e o webhook
// falam do mesmo preço (rodar depois de scripts/stripe-sincronizar-precos.ts --aplicar).
//
//   BASE=http://localhost:3002 node scripts/conferir-checkout-pacotes.mjs
//   BASE=https://corretor-ia-gilt.vercel.app node scripts/conferir-checkout-pacotes.mjs

import fs from "node:fs";
import path from "node:path";
import { OFERTAS } from "../src/lib/planos.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trimStart().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const stripe = (caminho, init = {}) => fetch(`https://api.stripe.com/v1/${caminho}`, { ...init, headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }).then((r) => r.json());

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const r0 = await fetch(`${BASE}/login`).catch(() => null);
if (!r0 || !r0.ok) {
  console.log(`o servidor ${BASE} não respondeu; nada foi feito`);
  process.exit(1);
}
console.log(`Stripe em modo ${env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "TESTE" : "LIVE"} · ${BASE}\n`);

const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const saldo = async () => (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;
const antes = await saldo();

for (const o of OFERTAS.filter((x) => x.tipo === "pacote")) {
  const resp = await fetch(`${BASE}/api/assinar`, { method: "POST", headers: cab, body: JSON.stringify({ oferta: o.id }) });
  const corpo = await resp.json().catch(() => ({}));
  const id = (corpo.url ?? "").match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0];
  if (!resp.ok || corpo.tipo !== "checkout" || !id) {
    conferir(false, `${o.rotulo}: a API abriu o checkout`, `HTTP ${resp.status} ${corpo.error ?? ""}`);
    continue;
  }
  const s = await stripe(`checkout/sessions/${id}?expand[]=line_items`);
  const preco = s.line_items?.data?.[0]?.price;
  conferir(s.amount_total === o.preco && s.currency === "brl", `${o.rotulo}: a Stripe cobra ${(o.preco / 100).toFixed(2)} BRL`, `${s.amount_total} ${s.currency}`);
  conferir(preco?.lookup_key === o.lookupKey, `${o.rotulo}: preço da chave ${o.lookupKey}`, preco?.lookup_key ?? "sem chave");
  conferir(s.metadata?.creditos === String(o.creditos) && s.metadata?.tipo === "pacote", `${o.rotulo}: o webhook vai dar ${o.creditos} créditos`, JSON.stringify({ creditos: s.metadata?.creditos, tipo: s.metadata?.tipo }));
  const x = await stripe(`checkout/sessions/${id}/expire`, { method: "POST" });
  conferir(x.status === "expired", `${o.rotulo}: sessão expirada, nada cobrado`, x.status ?? x.error?.message);
}

conferir(antes === (await saldo()), "o saldo da conta não mudou", String(antes));
console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
