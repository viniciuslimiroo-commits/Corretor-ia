// QUANTO CADA FUNÇÃO LEVA no pacote (o que a Vercel guarda a cada deploy), lido dos
// `.nft.json` do build: as maiores rotas e, pra cada uma, o peso por pasta.
//
// Existe porque o armazenamento de funções já estourou uma vez (50,85 GB de 10 GB em
// 17/09/2026) e duas "correções" seguintes foram afirmadas pela linha escrita no
// next.config.ts, sem medir -- a de criar vídeo continuou com 138 MB e a de montar levava
// as cópias de prévia que a exclusão dizia tirar (medido em 18/09).
//
//   rm -rf .next && npx next build && node scripts/medir-funcoes.cjs [quantas=8]
//
// Build de medição com o servidor de desenvolvimento PARADO: ele escreve na mesma `.next`
// e o build sai quebrado (e os números, errados).

const fs = require("fs");
const path = require("path");

const web = path.resolve(__dirname, "..");
const raiz = path.join(web, ".next", "server", "app");
if (!fs.existsSync(raiz)) {
  console.error("Sem .next/server/app: rode `npx next build` antes.");
  process.exit(1);
}
const quantas = Number(process.argv[2] ?? 8);
const achar = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? achar(path.join(d, e.name)) : e.name.endsWith(".nft.json") ? [path.join(d, e.name)] : []));

const rotas = achar(raiz).map((arq) => {
  const j = JSON.parse(fs.readFileSync(arq, "utf8"));
  const base = path.dirname(arq);
  const pastas = {};
  let bytes = 0;
  let n = 0;
  for (const x of j.files) {
    const p = path.resolve(base, x);
    let s;
    try {
      s = fs.statSync(p);
    } catch {
      continue;
    }
    if (!s.isFile()) continue;
    bytes += s.size;
    n++;
    const partes = path.relative(web, p).split(path.sep);
    const g = partes[0] === "node_modules" ? partes.slice(0, partes[1]?.startsWith("@") ? 3 : 2).join("/") : partes.slice(0, 2).join("/");
    pastas[g] = (pastas[g] ?? 0) + s.size;
  }
  return { rota: path.relative(raiz, arq).split(path.sep).join("/").replace(/\/route\.js\.nft\.json$|\.js\.nft\.json$/, ""), bytes, n, pastas };
});

rotas.sort((a, b) => b.bytes - a.bytes);
const mb = (b) => (b / 1e6).toFixed(1).padStart(7) + " MB";
for (const r of rotas.slice(0, quantas)) {
  console.log(`${mb(r.bytes)}  ${String(r.n).padStart(5)} arq  ${r.rota}`);
  for (const [g, b] of Object.entries(r.pastas).sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`           ${mb(b)}  ${g}`);
}
console.log(`\n${rotas.length} funções · ${(rotas.reduce((s, r) => s + r.bytes, 0) / 1e9).toFixed(2)} GB no total (fora o bin/ffmpeg, baixado só no build da Vercel)`);
