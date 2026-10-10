// ONDE O LOGO CAI, NA FOTO EXPORTADA DE VERDADE.
//
// O par do `testar-marca-na-foto.ts`: lá se prova a CONTA, aqui se prova que o pixel foi
// parar onde a conta disse. Exporta a mesma foto nas quatro posições e MEDE o centro de
// massa do logo em cada arquivo que volta.
//
// Usa um logo de teste VERDE PURO, que não existe em foto de imóvel: é o que torna a
// medição possível sem adivinhar qual mancha é o logo.
//
// Sobe o logo e apaga no fim, devolvendo a conta como estava.
//
//   BASE=http://localhost:3000 node scripts/conferir-posicao-do-logo.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = process.env.BASE ?? "http://localhost:3002";
const CONTA = process.env.CONTA ?? "limiro.cardoso@outlook.com";
const JOB = process.env.JOB ?? "d1b8d84a-c0af-4124-b967-f232f2ac3abf";
const SAIDA = process.env.SAIDA ?? fs.mkdtempSync(path.join(os.tmpdir(), "encena-posicao-"));
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const g = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: CONTA }) }).then((r) => r.json());
const v = await fetch(`${SUPA}/auth/v1/verify?token=${g.hashed_token ?? g.properties?.hashed_token}&type=magiclink`, { redirect: "manual" });
const p = new URLSearchParams((v.headers.get("location") ?? "").split("#")[1] ?? "");
const token = p.get("access_token");

const antes = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
if (antes.logoUrl) {
  console.log(`A conta ${CONTA} já tem logo. Este teste o SOBRESCREVE -- não roda numa conta com logo de verdade.`);
  process.exitCode = 1;
} else {
  // Verde puro e CHAPADO: não existe em foto de imóvel, então todo pixel verde no arquivo
  // que voltar é logo. É o que permite medir a posição em vez de confiar.
  const logo = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png().toBuffer();
  const form = new FormData();
  form.append("logo", new Blob([logo], { type: "image/png" }), "logo.png");
  const subiu = await fetch(`${BASE}/api/marca`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  conferir(subiu.ok, "logo de teste subido");

  /** O centro de massa do verde no arquivo exportado, em fração de 0 a 1. */
  async function ondeCaiu(posicaoLogo, nome) {
    const r = await fetch(`${BASE}/api/exportar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId: JOB, portal: "zap_vivareal_olx", comLogo: true, posicaoLogo }),
    });
    if (!r.ok) return { erro: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(path.join(SAIDA, `${nome}.jpg`), buf);
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let sx = 0, sy = 0, n = 0;
    for (let q = 0; q < info.width * info.height; q++) {
      const i = q * info.channels;
      if (data[i] < 110 && data[i + 1] > 150 && data[i + 2] < 110) {
        sx += q % info.width;
        sy += Math.floor(q / info.width);
        n++;
      }
    }
    if (n < 200) return { erro: `só ${n} px de logo` };
    return { x: sx / n / info.width, y: sy / n / info.height, px: n };
  }

  const casos = [
    ["inferior_esquerdo", (r) => r.x < 0.35 && r.y > 0.65, "esquerda e embaixo"],
    ["superior_esquerdo", (r) => r.x < 0.35 && r.y < 0.35, "esquerda e em cima"],
    ["superior_direito", (r) => r.x > 0.65 && r.y < 0.35, "direita e em cima"],
    ["centro", (r) => Math.abs(r.x - 0.5) < 0.08 && Math.abs(r.y - 0.5) < 0.08, "centrado"],
  ];
  for (const [pos, ok, descricao] of casos) {
    const r = await ondeCaiu(pos, pos);
    if (r.erro) conferir(false, `exportar em “${pos}”`, r.erro);
    else conferir(ok(r), `“${pos}” põe o logo ${descricao}`, `x=${r.x.toFixed(2)} y=${r.y.toFixed(2)}`);
  }

  // O canto do SELO não pode ser aceito nem mandando direto pra API -- a tela não o mostra,
  // e o servidor tem que concordar com a tela.
  const burlando = await ondeCaiu("inferior_direito", "burlando");
  conferir(!burlando.erro && burlando.x < 0.35, "pedir o canto do SELO cai no padrão, não no canto do selo", burlando.erro ?? `x=${burlando.x.toFixed(2)}`);

  const r = await fetch(`${BASE}/api/marca`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  const conf = await fetch(`${BASE}/api/marca`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
  conferir(r.ok && !conf.logoUrl, "o logo de teste foi APAGADO e a conta voltou como estava");

  console.log(`\nimagens em ${SAIDA}`);
  console.log(falhas === 0 ? "TUDO CERTO" : `${falhas} FALHA(S)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}
