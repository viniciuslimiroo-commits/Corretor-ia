// Bateria de testes com fotos REAIS (Pexels, imóveis de verdade) e variantes "de
// celular" (baixa resolução, escuras, comprimidas). Roda contra o servidor local, guarda
// original + resultado em docs/testes-reais e um log com tempo, modelo e custo.
// Uso, de dentro de web/: node scripts/bateria-testes-reais.mjs <scratchpad> [base-url]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const S = process.argv[2];
const B = process.argv[3] || "http://localhost:3000";
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const token = JSON.parse(execFileSync("node", [path.join(S, "sessao.mjs"), "limiro.cardoso@outlook.com"], { cwd: ".." }).toString()).access_token;
const h = { Authorization: "Bearer " + token };
const FOTOS = "../docs/pedra-teardown/fotos-teste";
const SAIDA = "../docs/testes-reais";
fs.mkdirSync(SAIDA, { recursive: true });

// Variantes de celular: menor, mais comprimida, mais escura.
async function degradar(nome, origem, largura, q, brilho) {
  const out = path.join(S, nome);
  await sharp(path.join(FOTOS, origem)).rotate().resize(largura).modulate({ brightness: brilho }).jpeg({ quality: q }).toFile(out);
  return out;
}
const foneEscura = await degradar("fone-escura.jpg", "F_foto_escura.jpg", 1000, 55, 0.85);
const foneCozinha = await degradar("fone-cozinha.jpg", "D3_cozinha_real_2635038.jpg", 900, 50, 0.7);
const foneSala = await degradar("fone-sala.jpg", "B_sala_mobiliada_6969824.jpg", 1100, 55, 1);

const f = (n) => path.join(FOTOS, n);
const CASOS = [
  ["01", "mobiliar", { tipo_espaco: "sala", estilo: "moderno", criatividade: "alta" }, f("A_sala_vazia_18041820.jpg"), "sala vazia, profissional"],
  ["02", "mobiliar", { tipo_espaco: "quarto", estilo: "escandinavo", criatividade: "alta" }, f("C_comodo_vazio_6835102.jpg"), "comodo vazio pequeno"],
  ["03", "mobiliar", { tipo_espaco: "sala", estilo: "praiano", criatividade: "media" }, foneEscura, "foto escura de celular, 1000px"],
  ["04", "mobiliar", { tipo_espaco: "auto", estilo: "tropical", criatividade: "alta" }, f("A2_sala_vazia_angulo_5353880.jpg"), "sala vazia, angulo torto"],
  ["05", "renovar", { tipo_espaco: "cozinha", estilo: "moderno", criatividade: "alta", moveis: "com" }, f("D2_cozinha_vazia_27084987.jpg"), "cozinha vazia"],
  ["06", "renovar", { tipo_espaco: "sala", estilo: "contemporaneo", criatividade: "media", moveis: "auto" }, f("B_sala_mobiliada_6969824.jpg"), "sala mobiliada"],
  ["07", "esvaziar", {}, f("B2_sala_mobiliada_6782353.jpg"), "sala mobiliada"],
  ["08", "esvaziar", {}, f("D3_cozinha_real_2635038.jpg"), "cozinha real com objetos"],
  ["09", "esvaziar", {}, f("G_varanda_15210485.jpg"), "varanda externa"],
  ["10", "remover_objeto", { o_que: "" }, f("B_sala_mobiliada_6969824.jpg"), "tirar bagunca, sala"],
  ["11", "remover_objeto", { o_que: "the rug on the floor" }, f("B3_sala_clara_6480707.jpg"), "tirar o tapete"],
  ["12", "mudar_piso", { material: "madeira_clara" }, f("A_sala_vazia_18041820.jpg"), "sala vazia"],
  ["13", "mudar_piso", { material: "porcelanato" }, f("D2_cozinha_vazia_27084987.jpg"), "cozinha"],
  ["14", "mudar_parede", { material: "verde" }, f("B3_sala_clara_6480707.jpg"), "sala clara"],
  ["15", "mudar_parede", { material: "tijolo" }, f("C_comodo_vazio_6835102.jpg"), "comodo vazio"],
  ["16", "melhorar", {}, f("F_foto_escura.jpg"), "foto escura original"],
  ["17", "melhorar", {}, foneCozinha, "celular escuro 900px"],
  ["18", "converter_hd", {}, foneSala, "celular 1100px"],
  ["19", "corrigir_perspectiva", {}, f("A2_sala_vazia_angulo_5353880.jpg"), "angulo torto"],
  ["20", "corrigir_perspectiva", {}, f("E2_fachada_nublada_3182562.jpg"), "fachada"],
  ["21", "trocar_ceu", { ceu: "entardecer" }, f("E2_fachada_nublada_3182562.jpg"), "fachada nublada"],
  ["22", "trocar_ceu", { ceu: "noite" }, f("E_fachada_nublada_7031595.jpg"), "fachada nublada 2"],
  ["23", "editar_prompt", { instrucao: "remover o ventilador de teto" }, f("A2_sala_vazia_angulo_5353880.jpg"), "sala com ventilador"],
  ["24", "editar_prompt", { instrucao: "colocar cortinas brancas leves nas janelas" }, f("B3_sala_clara_6480707.jpg"), "sala clara"],
];

const log = [];
async function caso([n, acao, params, foto, rotulo]) {
  const t0 = Date.now();
  const form = new FormData();
  form.append("foto", new Blob([fs.readFileSync(foto)], { type: "image/jpeg" }), "foto.jpg");
  form.append("acao", acao);
  form.append("parametros", JSON.stringify(params));
  let r = await fetch(`${B}/api/gerar`, { method: "POST", headers: h, body: form });
  let d = await r.json();
  if (!r.ok) {
    log.push({ n, acao, rotulo, erro: d.error });
    console.log(n, acao, "ERRO:", d.error);
    return;
  }
  let fim = null;
  for (let i = 0; i < 160; i++) {
    await new Promise((res) => setTimeout(res, 2500));
    r = await fetch(`${B}/api/job/${d.jobId}`, { headers: h });
    const dd = await r.json();
    if (dd.status === "concluido") {
      fim = dd;
      break;
    }
    if (!r.ok && r.status < 500) {
      log.push({ n, acao, rotulo, erro: dd.error });
      console.log(n, acao, "FALHOU:", dd.error);
      return;
    }
  }
  if (!fim) {
    log.push({ n, acao, rotulo, erro: "tempo" });
    return;
  }
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  const bytes = Buffer.from(await (await fetch(fim.url)).arrayBuffer());
  const base = `${n}-${acao}`;
  await sharp(bytes).resize(1600, null, { withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(SAIDA, `${base}-depois.jpg`));
  await sharp(foto).rotate().resize(1600, null, { withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(SAIDA, `${base}-antes.jpg`));
  log.push({ n, acao, params, rotulo, jobId: d.jobId, segundos: Number(seg), modelo: fim.modelo, aviso: fim.aviso, largura: fim.width });
  console.log(n, acao, rotulo, "->", seg + "s", fim.modelo, fim.aviso ? "(fallback)" : "");
}

const fila = [...CASOS];
await Promise.all(
  [1, 2, 3].map(async () => {
    for (;;) {
      const c = fila.shift();
      if (!c) return;
      await caso(c);
    }
  })
);

// custo real, do banco
const hs = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY };
for (const l of log) {
  if (!l.jobId) continue;
  const j = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/jobs?select=custo_real&id=eq.${l.jobId}`, { headers: hs })).json();
  l.custo = j[0]?.custo_real;
}
fs.writeFileSync(path.join(SAIDA, "log.json"), JSON.stringify(log, null, 1));
const ok = log.filter((l) => !l.erro);
console.log(
  `\nFIM: ${ok.length} ok, ${log.length - ok.length} com erro; custo total US$ ${ok.reduce((s, l) => s + Number(l.custo ?? 0), 0).toFixed(3)}; tempo medio ${(ok.reduce((s, l) => s + l.segundos, 0) / Math.max(1, ok.length)).toFixed(1)}s`
);
