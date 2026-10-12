// DE QUEM É A MARCA DA PEÇA: a do corretor ou a da imobiliária?
//
// Ele em 12/10/2026: "e se o corretor tiver a logo pessoal dele, profissional, e a
// imobiliária outra, e a pessoa querer usar uma ou outra nos materiais?".
//
// A regra antiga era `pessoa ?? imobiliária` campo a campo. Como rede de proteção é ótima
// (quem não tem logo herda o da equipe) e foi por isso que existiu. Só que era impossível
// de contrariar: com logo pessoal, o da imobiliária NUNCA saía -- nem quando o anúncio era
// dela, que é justamente quando muitas exigem a marca da casa.
//
// O que se prova aqui é a RESOLUÇÃO, que é onde um erro sai caro: marca errada vai pro
// anúncio e quem responde por ele é o corretor. O banco é de mentira; o que importa é a
// decisão.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-qual-marca.ts

import { ehQualMarca, marcaEfetiva } from "../src/lib/cobranca.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

type Linha = Record<string, unknown> | null;
/** Um banco de mentira com as duas tabelas que `marcaEfetiva` lê. */
function bancoFalso(pessoa: Linha, org: Linha, ehMembro: boolean) {
  return {
    from(tabela: string) {
      const alvo = tabela === "users" ? pessoa : tabela === "organizations" ? org : ehMembro ? { org_id: "org1", papel: "corretor" } : null;
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        in: () => cadeia,
        order: () => cadeia,
        limit: () => cadeia,
        maybeSingle: async () => ({ data: alvo }),
        single: async () => ({ data: alvo }),
        then: (f: (v: { data: unknown }) => unknown) => Promise.resolve({ data: ehMembro ? [{ org_id: "org1", papel: "corretor" }] : [] }).then(f),
      };
      return cadeia;
    },
  } as never;
}

const PESSOA = { nome: "Vinicius Cardoso", creci: "GO 11111-F", whatsapp: "62900000001", logo_path: "uploads/eu/galvao.png", cor_marca: "#1C1C1E" };
const ORG = { nome: "Imobiliária J7", creci: "GO 22222-J", whatsapp: "62900000002", logo_path: "uploads/org/j7.png", cor_marca: "#0F2D5B" };

async function main() {
  // ---- o guarda do valor ----
  conferir(ehQualMarca("pessoa") && ehQualMarca("imobiliaria"), "aceita os dois valores que existem");
  conferir(!ehQualMarca("outra") && !ehQualMarca("") && !ehQualMarca(null) && !ehQualMarca(1), "e recusa qualquer outra coisa");

  // ---- SEM escolha: a regra de sempre, pra nada mudar pra quem já usava ----
  {
    const m = await marcaEfetiva(bancoFalso(PESSOA, ORG, true), "u1");
    conferir(m.logo_path === PESSOA.logo_path, "sem escolha, sai o logo DELE (como sempre saiu)", String(m.logo_path));
    conferir(m.cor_marca === PESSOA.cor_marca, "e a cor dele");
    conferir(m.nome === "Vinicius Cardoso · Imobiliária J7", "e o nome junta os dois", String(m.nome));
    conferir(m.deImobiliaria === false, "e a tela sabe que o logo é dele");
  }

  // ---- escolhendo a IMOBILIÁRIA ----
  {
    const m = await marcaEfetiva(bancoFalso(PESSOA, ORG, true), "u1", "imobiliaria");
    conferir(m.logo_path === ORG.logo_path, "escolhendo a imobiliária, sai o logo DELA", String(m.logo_path));
    conferir(m.cor_marca === ORG.cor_marca, "e a cor dela", String(m.cor_marca));
    conferir(m.creci === ORG.creci, "e o CRECI dela", String(m.creci));
    conferir(m.whatsapp === ORG.whatsapp, "e o WhatsApp dela", String(m.whatsapp));
    conferir(m.deImobiliaria === true, "e a tela sabe que o logo é da casa");
    // O corretor NÃO some da peça da imobiliária: quem vê o anúncio precisa saber com quem falar.
    conferir(m.nome === "Vinicius Cardoso · Imobiliária J7", "mas o nome dele continua na peça", String(m.nome));
  }

  // ---- escolhendo a DELE: sai só ele ----
  {
    const m = await marcaEfetiva(bancoFalso(PESSOA, ORG, true), "u1", "pessoa");
    conferir(m.logo_path === PESSOA.logo_path, "escolhendo a dele, sai o logo dele");
    conferir(m.nome === "Vinicius Cardoso", "e o nome sai SEM a imobiliária", String(m.nome));
    conferir(m.creci === PESSOA.creci, "com o CRECI dele");
  }

  // ---- A REDE DE PROTEÇÃO não pode ter sumido ----
  {
    const semLogo = { ...PESSOA, logo_path: null, cor_marca: null, creci: null, whatsapp: null };
    const m = await marcaEfetiva(bancoFalso(semLogo, ORG, true), "u1");
    conferir(m.logo_path === ORG.logo_path, "quem não tem logo CONTINUA herdando o da equipe", String(m.logo_path));
    conferir(m.creci === ORG.creci && m.whatsapp === ORG.whatsapp, "e o CRECI e o WhatsApp da casa também");
    conferir(m.deImobiliaria === true, "e a tela diz que veio da imobiliária");
  }

  // ---- pedir a marca da imobiliária SEM ter uma: a peça tem que sair mesmo assim ----
  {
    const m = await marcaEfetiva(bancoFalso(PESSOA, null, false), "u1", "imobiliaria");
    conferir(m.logo_path === PESSOA.logo_path, "sem equipe, pedir a da imobiliária volta pra dele", String(m.logo_path));
    conferir(m.nome === "Vinicius Cardoso", "e a peça sai com o nome dele, não vazia", String(m.nome));
  }

  // ---- equipe SEM logo próprio: escolher a dela não pode apagar a marca ----
  {
    const orgSemLogo = { ...ORG, logo_path: null, cor_marca: null };
    const m = await marcaEfetiva(bancoFalso(PESSOA, orgSemLogo, true), "u1", "imobiliaria");
    conferir(m.logo_path === PESSOA.logo_path, "equipe sem logo: a peça não sai sem logo nenhum", String(m.logo_path));
    conferir(m.cor_marca === PESSOA.cor_marca, "nem sem cor");
    conferir(m.creci === ORG.creci, "mas o CRECI da casa, que ela tem, vale", String(m.creci));
  }

  // ---- ninguém tem nada: não estoura ----
  {
    const m = await marcaEfetiva(bancoFalso(null, null, false), "u1", "imobiliaria");
    conferir(m.logo_path === null && m.nome === null, "conta vazia devolve vazio, sem estourar");
  }
}

main().then(
  () => {
    console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
    process.exitCode = falhas === 0 ? 0 : 1;
  },
  (e) => {
    console.error("\nESTOUROU:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
);
