import type { ImovelMontagem } from "./book-montagem";

// O GUARDA DE FATOS.
//
// A regra do produto é dura: a IA trabalha linguagem, não cria fato. Metragem, quartos,
// suítes, banheiros, vagas, ano, endereço, condomínio, IPTU e preço saem do cadastro e de
// nenhum outro lugar. Pedir isso no prompt ajuda; conferir aqui garante -- e num anúncio
// de imóvel a diferença entre ajudar e garantir é o CRECI do corretor.
//
// Como funciona: todo NÚMERO que sai da IA tem que ter origem. Ou casa com um campo do
// cadastro (e com o rótulo certo: "2 suítes" não passa porque o imóvel tem 2 vagas), ou
// aparece literalmente no que o próprio corretor escreveu -- se ele digitou "a 5 minutos
// do parque", repetir isso não é invenção da máquina, é a frase dele. Número sem nenhuma
// dessas origens reprova o texto inteiro.
//
// Puro e sem rede: dá pra testar linha a linha, e é testado.

export type Violacao = { trecho: string; motivo: string };

/**
 * Números por extenso viram dígito antes da conferência: "três quartos" é uma afirmação.
 *
 * Nos três idiomas, e SÓ com palavras que não existem nos outros dois. "dos" fica de
 * fora de propósito: é dois em espanhol e é "de os" em português, e converter "a vista
 * dos quartos" em "2 quartos" reprovaria uma frase honesta no idioma principal. Palavra
 * ambígua sobe pra AMBIGUOS, onde só conta se o substantivo vier logo atrás.
 */
const EXTENSO: Record<string, number> = {
  dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  // espanhol
  cuatro: 4, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, veinte: 20,
  // inglês
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, twenty: 20,
};

/**
 * Palavras que só viram número quando um substantivo de contagem vem logo depois.
 *
 * "um quarto" é contagem; "um condomínio completo" é artigo. Vale igual pro "un/una" do
 * espanhol e pro "one" do inglês. O "a" do inglês NÃO entra: em português "a suíte" é
 * artigo definido e viraria "1 suíte", reprovando frase honesta num imóvel de 2 suítes.
 */
const AMBIGUOS: Record<string, number> = { um: 1, uma: 1, un: 1, una: 1, one: 1 };

/** Qual campo do cadastro responde por cada palavra. Fora desta lista, número não passa. */
/**
 * A unidade contada, em português, espanhol e inglês.
 *
 * Trilíngue porque o guarda roda DEPOIS da IA, e a IA escreve no idioma da pessoa. Com
 * vocabulário só em português, um texto correto em espanhol caía na peneira da sobra
 * ("número sem origem no cadastro") e era recusado -- o guarda barrando justamente o
 * texto que ele deveria aprovar. Medido em `scripts/testar-idioma-servidor.mjs`.
 *
 * As chaves vêm sem acento e em minúsculas porque `semAcento` já passou: "baños" chega
 * aqui como "banos".
 */
const CAMPO_DA_UNIDADE: Record<string, keyof ImovelMontagem> = {
  quarto: "dormitorios",
  quartos: "dormitorios",
  dormitorio: "dormitorios",
  dormitorios: "dormitorios",
  habitacion: "dormitorios",
  habitaciones: "dormitorios",
  recamara: "dormitorios",
  recamaras: "dormitorios",
  bedroom: "dormitorios",
  bedrooms: "dormitorios",
  suite: "suites",
  suites: "suites",
  banheiro: "banheiros",
  banheiros: "banheiros",
  lavabo: "banheiros",
  lavabos: "banheiros",
  bano: "banheiros",
  banos: "banheiros",
  aseo: "banheiros",
  aseos: "banheiros",
  bathroom: "banheiros",
  bathrooms: "banheiros",
  vaga: "vagas",
  vagas: "vagas",
  garagem: "vagas",
  garagens: "vagas",
  cochera: "vagas",
  cocheras: "vagas",
  plaza: "vagas",
  plazas: "vagas",
  estacionamiento: "vagas",
  estacionamientos: "vagas",
  garage: "vagas",
  garages: "vagas",
};

// As duas expressões abaixo repetem a lista de unidades em vez de montá-la a partir das
// chaves do mapa. É duplicação de propósito: regex montada por template vira string, e
// string atravessa shell, editor e build -- foi exatamente onde as barras invertidas se
// perderam na primeira versão deste arquivo. Literal não se perde, e o teste cobre as duas
// listas juntas: se divergirem, um caso cai.

/** Número colado num substantivo de contagem: "3 quartos", "2 vagas na garagem". */
const CONTAGEM = new RegExp(String.raw`(\d+)\s*(?:[a-z]+\s+){0,2}?(quartos?|dormitorios?|habitaciones?|habitacion|recamaras?|bedrooms?|suites?|banheiros?|lavabos?|banos?|aseos?|bathrooms?|vagas?|garagens?|cocheras?|plazas?|estacionamientos?|garages?)\b`, "g");

/** "um quarto" conta; "um condomínio" é artigo. Vale pro "un/una" e pro "one". */
const ARTIGO_QUE_CONTA = new RegExp(String.raw`\b(um|uma|un|una|one)\b((?:\s+\w+){0,2}\s+(?:quartos?|dormitorios?|habitaciones?|habitacion|recamaras?|bedrooms?|suites?|banheiros?|lavabos?|banos?|aseos?|bathrooms?|vagas?|garagens?|cocheras?|plazas?|estacionamientos?|garages?)\b)`, "g");

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Só os dígitos: compara "R$ 545.000" com "545000" sem brigar por ponto e vírgula. */
function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function numero(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

/**
 * O texto que o CORRETOR escreveu. Serve de segunda origem válida: o que ele afirmou, a
 * IA pode repetir. Não entra aqui nada gerado por máquina.
 */
function textoDoCorretor(i: ImovelMontagem): string {
  return semAcento([i.titulo, i.endereco, i.descricao, i.preco, i.condominio, i.iptu].filter(Boolean).join(" \n "));
}

/**
 * Números por extenso viram dígito, com UMA exceção: "um" e "uma" quase sempre são artigo,
 * não contagem. "Um condomínio completo" virava "1 condominio" e reprovava uma frase
 * perfeitamente honesta -- aconteceu no primeiro book montado de verdade. Então "um/uma"
 * só vira 1 quando um substantivo de contagem vem logo depois: "um quarto" sim, "um
 * lazer" não.
 */
function comExtensoEmDigito(texto: string): string {
  const t = texto.replace(ARTIGO_QUE_CONTA, (_todo, palavra: string, resto: string) => `${AMBIGUOS[palavra] ?? 1}${resto}`);
  return t.replace(/\b([a-z]+)\b/g, (palavra) => {
    // A palavra ambígua que sobreviveu ao passo acima é artigo: fica como está.
    if (AMBIGUOS[palavra] !== undefined) return palavra;
    const n = EXTENSO[palavra];
    return n === undefined ? palavra : String(n);
  });
}

/**
 * Confere um texto gerado contra o cadastro. Devolve a lista de violações -- vazia quer
 * dizer que todo número do texto tem origem.
 */
export function conferirFatos(texto: string, imovel: ImovelMontagem): Violacao[] {
  const bruto = semAcento(texto ?? "");
  if (!bruto.trim()) return [];
  const t = comExtensoEmDigito(bruto);
  const doCorretor = comExtensoEmDigito(textoDoCorretor(imovel));
  const violacoes: Violacao[] = [];

  // Marca o que já foi explicado, pra sobra virar a última peneira.
  const explicado = new Array(t.length).fill(false);
  const marcar = (i: number, f: number) => {
    for (let k = i; k < f; k += 1) explicado[k] = true;
  };

  /** O corretor escreveu isso com estas palavras? Então não é invenção da máquina. */
  const ehDoCorretor = (trecho: string) => doCorretor.includes(trecho.trim());

  // ---- metragem ----
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(m2|m²|metros? quadrados?|metros? cuadrados?|sq\.?\s?m|square meters?)/g)) {
    marcar(m.index, m.index + m[0].length);
    const v = numero(m[1]);
    const cabe = [imovel.area_util, imovel.area_total].some((a) => a != null && Math.abs(Number(a) - v) <= 0.5);
    if (!cabe && !ehDoCorretor(m[0])) {
      violacoes.push({ trecho: m[0], motivo: `metragem fora do cadastro (útil: ${imovel.area_util ?? "—"}, total: ${imovel.area_total ?? "—"})` });
    }
  }

  // ---- contagens com rótulo ----
  for (const m of t.matchAll(CONTAGEM)) {
    marcar(m.index, m.index + m[0].length);
    const campo = CAMPO_DA_UNIDADE[m[2]];
    const esperado = imovel[campo];
    if (Number(m[1]) !== Number(esperado ?? NaN) && !ehDoCorretor(m[0])) {
      violacoes.push({ trecho: m[0], motivo: `o cadastro diz ${esperado ?? "nada"} em ${String(campo)}` });
    }
  }

  // ---- dinheiro ----
  // Qualquer moeda, não só R$: o texto em espanhol ou inglês escreve US$ ou $, e um
  // valor que não está no cadastro é invenção em qualquer símbolo.
  for (const m of t.matchAll(/(?:r\$|us\$|\$|€)\s*([\d.,]+)/g)) {
    marcar(m.index, m.index + m[0].length);
    const d = soDigitos(m[1]);
    const vale = [imovel.preco, imovel.condominio, imovel.iptu].some((v) => v && soDigitos(String(v)) === d);
    if (!vale) violacoes.push({ trecho: m[0], motivo: "valor que não está no cadastro" });
  }

  // ---- ano ----
  for (const m of t.matchAll(/\b(19\d{2}|20\d{2})\b/g)) {
    if (explicado[m.index]) continue;
    marcar(m.index, m.index + m[0].length);
    if (Number(m[1]) !== Number(imovel.ano_construcao ?? NaN) && !ehDoCorretor(m[0])) {
      violacoes.push({ trecho: m[0], motivo: `o cadastro diz ano ${imovel.ano_construcao ?? "nenhum"}` });
    }
  }

  // ---- a sobra ----
  // Qualquer número que chegou até aqui é afirmação sem origem: "a 5 minutos do shopping",
  // "3º andar", "20 anos de garantia". É exatamente o que não pode sair.
  for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) {
    if (explicado[m.index]) continue;
    // Leva a palavra seguinte junto pra mensagem fazer sentido pra quem lê o relatório.
    const contexto = t.slice(m.index, m.index + m[0].length + 14).trim();
    if (ehDoCorretor(contexto.split(/\s+/).slice(0, 2).join(" "))) continue;
    violacoes.push({ trecho: contexto, motivo: "número sem origem no cadastro" });
  }

  return violacoes;
}

/** Atalho pra quem só quer saber se pode publicar. */
export function fatosConferem(texto: string, imovel: ImovelMontagem): boolean {
  return conferirFatos(texto, imovel).length === 0;
}
