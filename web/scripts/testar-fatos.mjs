// O guarda de fatos, caso a caso.
//
// Este e o teste que sustenta a promessa do produto: a IA trabalha a lingua, nao cria
// fato. Se um caso daqui quebrar, um book pode sair afirmando metragem que o imovel nao
// tem -- e isso e problema do corretor com o CRECI, nao bug de layout.
import path from "node:path";
import { pathToFileURL } from "node:url";

// Roda o .ts direto: node 22+ tira os tipos sozinho, e o guarda de fatos nao importa
// nada em tempo de execucao. `node scripts/testar-fatos.mjs`
const { conferirFatos } = await import(pathToFileURL(path.join(import.meta.dirname, "..", "src", "lib", "book-fatos.ts")).href);

const imovel = {
  id: "x",
  titulo: "Apto 302 · Setor Bueno",
  endereco: "Rua T-55, 302 — Goiânia",
  preco: "R$ 545.000",
  descricao: "Apartamento reformado, sol da manhã, duas vagas na garagem e lazer completo no condomínio.",
  area_util: 96.5,
  area_total: 112,
  dormitorios: 3,
  suites: 1,
  banheiros: 2,
  vagas: 2,
  ano_construcao: 2014,
  condominio: "R$ 780",
  iptu: "R$ 1.240/ano",
};

let falhas = 0;
function caso(rotulo, texto, deveriaPassar) {
  const v = conferirFatos(texto, imovel);
  const passou = v.length === 0;
  const ok = passou === deveriaPassar;
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok   " : "FALHA"} ${rotulo}`);
  if (!ok || !passou) console.log(`      ${JSON.stringify(texto)}\n      ${v.map((x) => `"${x.trecho}" → ${x.motivo}`).join(" | ") || "(sem violação)"}`);
}

console.log("--- deve PASSAR (fato do cadastro) ---");
caso("metragem exata", "Apartamento de 96,5 m² reformado.", true);
caso("metragem arredondada", "Apartamento de 97 m² reformado.", true);
caso("area total", "São 112 m² de área total.", true);
caso("contagem certa", "Tem 3 dormitórios, sendo 1 suíte.", true);
caso("contagem por extenso", "São três dormitórios e duas vagas.", true);
caso("contagem com palavra no meio", "Conta com 2 vagas de garagem cobertas.", true);
caso("preco do cadastro", "Sai por R$ 545.000.", true);
caso("condominio do cadastro", "Condomínio de R$ 780.", true);
caso("ano do cadastro", "Entregue em 2014.", true);
caso("sem numero nenhum", "Sala ampla e clara, com piso amadeirado.", true);
caso("frase do proprio corretor", "Duas vagas na garagem e lazer completo no condomínio.", true);
caso("artigo nao e contagem", "Um condomínio com lazer completo e uma varanda ensolarada.", true);
caso("artigo antes de unidade conta", "Um dormitório com suíte.", false);
caso("uma suite confere", "Uma suíte com closet.", true);

console.log("\n--- deve REPROVAR (invenção) ---");
caso("metragem inventada", "Amplo apartamento de 140 m².", false);
caso("quartos a mais", "São 4 dormitórios espaçosos.", false);
caso("suite confundida com vaga", "O imóvel tem 2 suítes.", false);
caso("preco inventado", "Sai por R$ 480.000.", false);
caso("ano inventado", "Construído em 2021.", false);
caso("distancia inventada", "Fica a 5 minutos do shopping.", false);
caso("andar inventado", "Unidade no 12º andar.", false);
caso("garantia inventada", "Estrutura com 20 anos de garantia.", false);
caso("extenso inventado", "São cinco dormitórios.", false);
caso("mistura certo e errado", "96,5 m² com 3 quartos a 300 metros do parque.", false);

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
