// MODELOS DE MENSAGEM: as regras, sem banco e sem rede.
//
// Pedido do dono em 21/09/2026: guardar os textos DELE (ou da imobiliária), um por situação,
// e deixar um automático pra cada momento da conversa.
//
// O que este teste protege: as travas do estudo jurídico continuam valendo sobre um texto
// que o Encena não escreveu. O corretor manda no conteúdo; a identificação no primeiro
// contato, a ausência de link e a proibição de pedir documento não são negociáveis.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-modelos-mensagem.ts

import {
  SITUACOES,
  VARIAVEIS,
  aplicarVariaveis,
  conferirModelo,
  mensagemDoModelo,
  modeloAutomatico,
  modelosDaSituacao,
  situacaoDoLead,
  variaveisDesconhecidas,
  type Modelo,
} from "../src/lib/crm-modelos.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const DADOS = { nomeLead: "Maria Souza", corretor: "João Lima", creci: "12345-F", imovel: "Apto 302 · Setor Bueno", origem: "portal" as const };

// ---------- variáveis ----------
{
  const t = aplicarVariaveis("Oi, {nome}! Aqui é {corretor} (CRECI {creci}), sobre o {imovel}.", DADOS);
  conferir(t === "Oi, Maria! Aqui é João Lima (CRECI 12345-F), sobre o Apto 302 · Setor Bueno.", "troca as chaves pelo valor", t);
  conferir(aplicarVariaveis("{nome_completo}", DADOS) === "Maria Souza", "nome completo quando pedido");
  conferir(aplicarVariaveis("veio {origem}", DADOS) === "veio pelo anúncio no portal", "a origem sai por extenso");

  // Sem imóvel, a frase não pode virar "sobre o ." -- some a chave e some a sujeira.
  const semImovel = aplicarVariaveis("Oi, {nome}! Falo do {imovel} .", { ...DADOS, imovel: null });
  conferir(!semImovel.includes("{imovel}") && !/ {2,}/.test(semImovel), "chave sem valor não deixa buraco nem espaço duplo", semImovel);

  conferir(variaveisDesconhecidas("Oi {nome}, {telefone} e {bairro}").join(",") === "telefone,bairro", "acusa chave que não existe");
  conferir(variaveisDesconhecidas("Oi {nome} {NOME}").length === 0, "maiúscula não vira chave desconhecida");
}

// ---------- a situação de cada cliente ----------
{
  conferir(situacaoDoLead({ etapa: "novo" }) === "primeiro_contato", "quem nunca recebeu mensagem está no primeiro contato");
  conferir(situacaoDoLead({ etapa: "novo", ultimo_envio_em: "2026-09-20T12:00:00Z" }) === "retorno", "depois da primeira mensagem, é retorno");
  conferir(situacaoDoLead({ etapa: "visita", ultimo_envio_em: "2026-09-20T12:00:00Z" }) === "visita", "a etapa manda: visita é visita");
  // Quem está em proposta e não respondeu hoje continua sendo proposta, não lead frio.
  conferir(
    situacaoDoLead({ etapa: "proposta", ultimo_envio_em: "2026-09-20T12:00:00Z", tentativas_sem_resposta: 2 }) === "proposta",
    "e a negociação ganha do \"sem resposta\""
  );
  conferir(situacaoDoLead({ etapa: "fechado", ultimo_envio_em: "2026-09-20T12:00:00Z" }) === "fechado", "fechado é fechado");
}

// ---------- escolher o modelo ----------
{
  const lista: Modelo[] = [
    { id: "a", situacao: "primeiro_contato", titulo: "Apresentação", texto: "Oi!", automatico: true },
    { id: "b", situacao: "primeiro_contato", titulo: "Outra", texto: "Olá!", automatico: false },
    { id: "c", situacao: "qualquer", titulo: "Solta", texto: "Tudo bem?", automatico: false },
    { id: "d", situacao: "visita", titulo: "Visita", texto: "Confirmando", automatico: true },
  ];
  conferir(modeloAutomatico(lista, "primeiro_contato")?.id === "a", "o automático da situação é o que vem preenchido");
  conferir(modeloAutomatico(lista, "proposta") === null, "situação sem automático não preenche nada");
  const oferecidos = modelosDaSituacao(lista, "primeiro_contato").map((m) => m.id).join(",");
  conferir(oferecidos === "a,b,c", "a lista oferece os da situação e os de qualquer momento", oferecidos);
  conferir(!modelosDaSituacao(lista, "primeiro_contato").some((m) => m.id === "d"), "e não oferece o de outra situação");
}

// ---------- as travas sobre o texto de quem escreve ----------
{
  const ok = conferirModelo({ situacao: "retorno", titulo: "Lembrete", texto: "Oi, {nome}! Ainda tem interesse?" });
  conferir(ok.length === 0, "texto normal passa");

  const comLink = conferirModelo({ situacao: "primeiro_contato", titulo: "Com link", texto: "Olha aqui https://encena.app/c/abc" });
  conferir(comLink.some((p) => p.campo === "texto" && /link/i.test(p.mensagem)), "link no PRIMEIRO contato é barrado");
  const linkDepois = conferirModelo({ situacao: "retorno", titulo: "Com link", texto: "Olha aqui https://encena.app/c/abc" });
  conferir(linkDepois.length === 0, "e depois da resposta o link é permitido");

  const pedeDoc = conferirModelo({ situacao: "retorno", titulo: "Doc", texto: "Me manda seu CPF e o PIX" });
  conferir(pedeDoc.some((p) => /documento|PIX|banc/i.test(p.mensagem)), "pedir documento ou PIX é barrado");

  conferir(conferirModelo({ situacao: "retorno", titulo: "", texto: "Oi" }).some((p) => p.campo === "titulo"), "sem nome não salva");
  conferir(conferirModelo({ situacao: "retorno", titulo: "X", texto: "   " }).some((p) => p.campo === "texto"), "sem texto não salva");
  conferir(conferirModelo({ situacao: "inventada", titulo: "X", texto: "Oi" }).some((p) => p.campo === "situacao"), "situação inventada não salva");
  conferir(
    conferirModelo({ situacao: "retorno", titulo: "X", texto: "Oi {bairro}" }).some((p) => /bairro/.test(p.mensagem)),
    "chave que não existe é avisada antes de salvar"
  );
}

// ---------- a mensagem que sai ----------
{
  const m: Modelo = { id: "a", situacao: "primeiro_contato", titulo: "Apresentação", texto: "Vi que você se interessou {origem}.\nPosso mandar as fotos do {imovel}?", automatico: true };
  const primeira = mensagemDoModelo({ modelo: m, primeiroContato: true, dados: DADOS });
  conferir(primeira.startsWith("Olá, Maria! Aqui é João Lima, corretor(a) de imóveis, CRECI 12345-F."), "no 1º contato a identificação é do Encena, não do modelo", primeira);
  conferir(!primeira.includes("\n"), "e vai numa linha só, como a mensagem pronta");

  const comLink: Modelo = { ...m, texto: "Olha: https://encena.app/c/abc e me diga" };
  const semLink = mensagemDoModelo({ modelo: comLink, primeiroContato: true, dados: DADOS });
  conferir(!/https?:/.test(semLink), "e link nenhum escapa no 1º contato, mesmo escrito no modelo", semLink);

  const depois = mensagemDoModelo({ modelo: { ...m, situacao: "retorno" }, primeiroContato: false, dados: DADOS });
  conferir(!depois.startsWith("Olá, Maria! Aqui é"), "depois da resposta, o texto é só o dele (sem apresentação de novo)", depois);
  conferir(depois.includes("\n"), "e as quebras de linha dele são respeitadas");
}

// ---------- o catálogo ----------
{
  conferir(SITUACOES.length >= 5 && SITUACOES.some((s) => s.id === "qualquer"), "as situações cobrem a conversa inteira, e tem a solta");
  conferir(VARIAVEIS.every((v) => /^[a-z_]+$/.test(v.chave)), "toda chave é minúscula e sem acento (é o que o texto casa)");
  conferir(VARIAVEIS.every((v) => v.rotulo && v.exemplo), "e toda chave tem rótulo e exemplo pra tela mostrar");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
