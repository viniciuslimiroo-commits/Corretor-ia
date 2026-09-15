// Os modelos de vídeo imobiliário: os nove passam pelo validador do servidor, e UM sai
// renderizado e medido.
//
// Por que dividido assim: o que cada modelo produz é um espec, e o risco de um catálogo
// escrito à mão é id errado, duração fora do limite ou texto inventado a partir de campo
// vazio -- isso o validador do próprio servidor pega, nos nove, em milissegundos. O que
// validador nenhum prova é que o vídeo sai com o tempo certo e com o texto na tela; pra
// isso um render de verdade, com foto de verdade, medido no arquivo.
//
//   node --experimental-strip-types --import ./scripts/resolver-ts.mjs scripts/testar-templates-video.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { TEMPLATES_VIDEO, aplicarTemplateVideo, mudancasDoTemplate, templateVaiApagarTexto } from "../src/lib/video-templates.ts";
import { DURACOES_CENA, LIMITES, duracaoEstimada, limparEspec, textosDaCena } from "../src/lib/video.ts";
import { pecasDoImovel } from "../src/lib/ficha-imovel.ts";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3000";
const SAIDA = path.join(RAIZ, "..", "docs", "testes-reais", "editor");
fs.mkdirSync(SAIDA, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "encena-tpl-"));

let falhas = 0;
const conferir = (ok, oque, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---- 1. os nove modelos pelo validador do servidor ----
console.log("--- 1. os nove modelos ---");

const fichaCheia = { negocio: "venda", preco: "890000", dormitorios: "3", suites: "1", banheiros: "2", vagas: "2", area_util: "112", condominio: "R$ 780", tipo: "Apartamento" };
const marca = { nome: "Grupo Limiro", creci: "12345-F", whatsapp: "11988887777" };
const pecasCheias = pecasDoImovel(fichaCheia, marca);
// A ficha vazia é o caso que importa: modelo nenhum pode escrever "0 m²" nem "R$ ".
const pecasVazias = pecasDoImovel({}, null);

const baseEspec = {
  formato: "9:16",
  cenas: [
    { tipo: "foto", jobId: "11111111-1111-4111-8111-111111111111", duracao: 4, efeito: "parado" },
    { tipo: "foto", jobId: "22222222-2222-4222-8222-222222222222", duracao: 4, efeito: "parado" },
    { tipo: "foto", jobId: "33333333-3333-4333-8333-333333333333", duracao: 4, efeito: "parado" },
    { tipo: "animada", jobId: "44444444-4444-4444-8444-444444444444", duracao: 6, animacao: "caminhar" },
  ],
  musica: "calma",
  narracao: null,
  titulo: "Apartamento no Campo Belo",
  preco: "",
  local: "",
  telaFinal: false,
  transicao: "corte",
};

for (const t of TEMPLATES_VIDEO) {
  // O modelo não pode escolher uma duração que o seletor da cena não oferece: o vídeo
  // sai certo e a tela fica em branco, sem caminho de volta. Foi o que aconteceu com
  // 5,5s -- o servidor arredondava pra 6 e o <select> não tinha 5,5.
  conferir(
    DURACOES_CENA.foto.includes(t.duracaoCena),
    `${t.nome}: a duração é uma que o editor oferece`,
    `${t.duracaoCena}s de [${DURACOES_CENA.foto.join(", ")}]`
  );

  const novo = aplicarTemplateVideo(t, baseEspec, pecasCheias, { temWhatsapp: true });
  const { espec, erro } = limparEspec(novo);
  conferir(!erro && !!espec, `${t.nome}: o servidor aceita o espec`, erro ?? "");
  if (!espec) continue;

  conferir(espec.cenas.length === baseEspec.cenas.length, `${t.nome}: não perde nem inventa cena`, `${espec.cenas.length}`);
  const fotos = espec.cenas.filter((c) => c.tipo === "foto");
  conferir(
    fotos.every((c) => (c.duracao ?? 0) === t.duracaoCena),
    `${t.nome}: as fotos pegaram o ritmo do modelo`,
    `${t.duracaoCena}s`
  );
  conferir(espec.cenas[3].duracao === 6, `${t.nome}: a cena animada manteve a duração do clipe`, `${espec.cenas[3].duracao}s`);
  const forade = espec.cenas.filter((c) => (c.duracao ?? 4) < LIMITES.duracaoMin || (c.duracao ?? 4) > LIMITES.duracaoMax);
  conferir(forade.length === 0, `${t.nome}: nenhuma cena fora de ${LIMITES.duracaoMin}-${LIMITES.duracaoMax}s`);
  conferir(
    espec.cenas.every((c) => textosDaCena(c).every((x) => x.texto.length <= LIMITES.textoMax && x.texto.trim().length > 0)),
    `${t.nome}: todo texto cabe e nenhum ficou vazio`
  );
  conferir(mudancasDoTemplate(t, pecasCheias).length >= 3, `${t.nome}: a tela sabe dizer o que vai mudar`);

  // O teste que importa: ficha vazia não vira texto inventado.
  const semDados = aplicarTemplateVideo(t, baseEspec, pecasVazias, { temWhatsapp: false });
  const textosSemDados = semDados.cenas.flatMap((c) => textosDaCena(c).map((x) => x.texto));
  const selo = t.selo ? [textosSemDados[0]] : [];
  conferir(
    textosSemDados.every((x) => selo.includes(x)),
    `${t.nome}: sem ficha preenchida, só a etiqueta — nada inventado`,
    textosSemDados.join(" | ") || "nenhum texto"
  );
  conferir(semDados.chamada !== "Chame no WhatsApp", `${t.nome}: sem WhatsApp cadastrado, não convida pro WhatsApp`, semDados.chamada);
}

const comTexto = { ...baseEspec, cenas: baseEspec.cenas.map((c, i) => (i === 0 ? { ...c, textos: [{ texto: "escrito à mão" }] } : c)) };
conferir(templateVaiApagarTexto(comTexto), "a tela avisa quando o modelo vai apagar texto escrito à mão");
conferir(!templateVaiApagarTexto(baseEspec), "e não avisa quando não há nada pra apagar");

// ---- 2. um modelo renderizado de verdade ----
console.log("\n--- 2. 'Alto padrão' renderizado ---");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const admin = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const r0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: process.env.CONTA ?? "viniciuslimiroo@gmail.com" }) });
const d0 = await r0.json();
const hash = d0.hashed_token ?? d0.properties?.hashed_token;
const v0 = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify?token=${hash}&type=magiclink`, { redirect: "manual" });
const token = new URLSearchParams((v0.headers.get("location") ?? "").split("#")[1] ?? "").get("access_token");
const cab = { Authorization: `Bearer ${token}` };
const json = { ...cab, "Content-Type": "application/json" };

const materiais = await (await fetch(`${BASE}/api/materiais`, { headers: cab })).json();
const fotos = (materiais.itens ?? []).filter((i) => i.categoria !== "video").slice(0, 3);
conferir(fotos.length === 3, "três fotos reais da conta", fotos.map((f) => f.acao ?? "").join(", "));

const template = TEMPLATES_VIDEO.find((t) => t.id === "alto_padrao");
const real = aplicarTemplateVideo(
  template,
  { ...baseEspec, cenas: fotos.map((f) => ({ tipo: "foto", jobId: f.id, duracao: 4, efeito: "parado" })) },
  pecasCheias,
  { temWhatsapp: true }
);
const previsto = duracaoEstimada(real);
console.log(`     previsto: ${previsto.toFixed(2)}s (3 × ${template.duracaoCena}s + tela final − dissolver)`);

const antes = (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;
const rV = await fetch(`${BASE}/api/video`, { method: "POST", headers: json, body: JSON.stringify({ espec: real }) });
const dV = await rV.json();
conferir(rV.ok, "o servidor aceitou o vídeo do modelo", dV.error ?? dV.videoId);
conferir(dV.custo === 0, "aplicar modelo não custa crédito", `custo ${dV.custo}`);

let pronto = null;
for (let i = 0; i < 90 && !pronto; i++) {
  await new Promise((z) => setTimeout(z, 3000));
  const j = await (await fetch(`${BASE}/api/video/${dV.videoId}`, { headers: cab })).json();
  if (j.status === "concluido" && j.url) pronto = j;
  else if (j.status === "falhou") {
    conferir(false, "o vídeo do modelo falhou", j.error);
    break;
  }
}
conferir(!!pronto, "o modelo virou vídeo");

if (pronto) {
  const arquivo = path.join(tmp, "modelo.mp4");
  fs.writeFileSync(arquivo, Buffer.from(await (await fetch(pronto.url)).arrayBuffer()));
  // A duração sai do próprio ffmpeg: `ffmpeg-static` não traz ffprobe, e trocar
  // "ffmpeg" por "ffprobe" no caminho acerta o nome da PASTA, não o executável -- a
  // sonda nunca rodava e o teste caía calado no valor que a API tinha dito, que é a
  // previsão e não a medida. Aqui o ffmpeg lê o arquivo e imprime a duração no stderr.
  const sonda = spawnSync(ffmpeg, ["-hide_banner", "-i", arquivo], { encoding: "utf8" });
  const achou = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(`${sonda.stderr ?? ""}`);
  conferir(!!achou, "consegui medir a duração no arquivo", achou ? achou[0] : "a sonda não respondeu");
  const medido = achou ? Number(achou[1]) * 3600 + Number(achou[2]) * 60 + Number(achou[3]) : 0;
  console.log(`     medido:   ${medido.toFixed(2)}s`);
  conferir(Math.abs(medido - previsto) < 0.6, "o tempo do arquivo bate com o previsto pelo modelo", `${medido.toFixed(2)}s vs ${previsto.toFixed(2)}s`);

  // O texto está NA TELA? A faixa de baixo com "Alto padrão"/"112 m²" tem pixels escuros
  // que a foto sozinha não teria. Mede-se o pé do quadro, não a string do filtro.
  const pe = async (segundo, nome) => {
    const jpg = path.join(tmp, `${nome}.jpg`);
    spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(segundo), "-i", arquivo, "-frames:v", "1", "-vf", "crop=iw:ih*0.16:0:ih*0.74", jpg], { timeout: 60_000 });
    const { data } = await sharp(jpg).greyscale().raw().toBuffer({ resolveWithObject: true });
    let escuros = 0;
    for (const p of data) if (p < 70) escuros++;
    return (escuros / data.length) * 100;
  };
  // Cena 1 tem etiqueta + área; a última cena do modelo alto padrão fica sem peça sobrando.
  const comTextoPct = await pe(4.5, "pe-com");
  console.log(`     pixels escuros no pé: ${comTextoPct.toFixed(1)}%`);
  conferir(comTextoPct > 1.5, "o texto do modelo aparece na faixa de baixo", `${comTextoPct.toFixed(1)}%`);

  spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "4.5", "-i", arquivo, "-frames:v", "1", "-vf", "scale=360:-2", path.join(SAIDA, "modelo-alto-padrao.jpg")], { timeout: 60_000 });
  console.log(`     quadro em docs/testes-reais/editor/modelo-alto-padrao.jpg`);
  await fetch(`${BASE}/api/video/${dV.videoId}`, { method: "DELETE", headers: cab });
}

const depois = (await (await fetch(`${BASE}/api/conta`, { headers: cab })).json()).creditos;
conferir(antes === depois, "nada disso gastou crédito", `${antes}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas === 0 ? "\nTUDO PASSOU" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
