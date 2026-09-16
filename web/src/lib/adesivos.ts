// ADESIVOS 3D: biblioteca pronta, com licença, em vez de desenho à mão.
//
// São os Fluent Emoji 3D da Microsoft (licença MIT, cópia em public/adesivos/). A primeira
// versão dos Elementos tinha selos e setas desenhados em SVG aqui no código, e o resultado
// foi o que ele disse: ruim perto do CapCut. Arte de adesivo é trabalho de ilustrador; o
// certo é usar uma biblioteca feita por um, com licença que permite uso comercial.
//
// Dos 1.595 da biblioteca ficaram 117 -- os que um anúncio de imóvel usa: casa, chave,
// cômodo, dinheiro, contrato, localização, sinais, mãos, lazer do bairro, comemoração.
// Nome e palavras de busca em português; o arquivo usa o id curto.
//
// Pra acrescentar um: baixar o "3D" png de microsoft/fluentui-emoji pra
// public/adesivos/<id>.png e pôr a linha aqui. scripts/testar-adesivos.ts confere que todo
// id listado tem arquivo e que nenhum arquivo sobra.

export type CategoriaAdesivo = "casa" | "negocio" | "sinais" | "maos" | "lazer" | "festa";

export const CATEGORIAS_ADESIVO: { id: CategoriaAdesivo; rotulo: string }[] = [
  { id: "casa", rotulo: "Casa e cômodos" },
  { id: "negocio", rotulo: "Negócio" },
  { id: "sinais", rotulo: "Sinais e setas" },
  { id: "maos", rotulo: "Mãos" },
  { id: "lazer", rotulo: "Lazer e bairro" },
  { id: "festa", rotulo: "Comemorar" },
];

export type Adesivo = { id: string; rotulo: string; categoria: CategoriaAdesivo; tags: string };

export const ADESIVOS: Adesivo[] = [
  { id: "casa", rotulo: "Casa", categoria: "casa", tags: "casa lar residencia imovel" },
  { id: "casa_jardim", rotulo: "Casa com jardim", categoria: "casa", tags: "casa jardim quintal" },
  { id: "casas", rotulo: "Casas", categoria: "casa", tags: "casas condominio bairro loteamento" },
  { id: "predio", rotulo: "Prédio", categoria: "casa", tags: "predio apartamento edificio comercial" },
  { id: "edificio", rotulo: "Edifício", categoria: "casa", tags: "edificio apartamento hotel" },
  { id: "obra", rotulo: "Obra", categoria: "casa", tags: "obra construcao lancamento planta" },
  { id: "classico", rotulo: "Prédio clássico", categoria: "casa", tags: "classico patrimonio fachada" },
  { id: "cidade", rotulo: "Cidade", categoria: "casa", tags: "cidade centro skyline" },
  { id: "chave", rotulo: "Chave", categoria: "casa", tags: "chave entrega vendido alugado" },
  { id: "chave_antiga", rotulo: "Chave antiga", categoria: "casa", tags: "chave antiga" },
  { id: "cadeado", rotulo: "Cadeado", categoria: "casa", tags: "seguranca cadeado portaria" },
  { id: "porta", rotulo: "Porta", categoria: "casa", tags: "porta entrada" },
  { id: "janela", rotulo: "Janela", categoria: "casa", tags: "janela vista luz" },
  { id: "cama", rotulo: "Cama", categoria: "casa", tags: "quarto cama suite dormitorio" },
  { id: "sofa", rotulo: "Sofá", categoria: "casa", tags: "sala sofa estar mobiliado" },
  { id: "banheira", rotulo: "Banheira", categoria: "casa", tags: "banheiro banheira suite" },
  { id: "chuveiro", rotulo: "Chuveiro", categoria: "casa", tags: "banheiro chuveiro" },
  { id: "cadeira", rotulo: "Cadeira", categoria: "casa", tags: "cadeira escritorio" },
  { id: "planta", rotulo: "Planta", categoria: "casa", tags: "planta decoracao verde" },
  { id: "tijolo", rotulo: "Tijolo", categoria: "casa", tags: "tijolo obra reforma" },
  { id: "reforma", rotulo: "Reforma", categoria: "casa", tags: "reforma ferramenta manutencao" },
  { id: "regua", rotulo: "Régua", categoria: "casa", tags: "metragem area medida" },
  { id: "esquadro", rotulo: "Esquadro", categoria: "casa", tags: "planta projeto arquitetura" },
  { id: "dinheiro", rotulo: "Saco de dinheiro", categoria: "negocio", tags: "dinheiro preco valor investimento" },
  { id: "nota", rotulo: "Nota", categoria: "negocio", tags: "dinheiro preco pagamento" },
  { id: "dinheiro_asas", rotulo: "Dinheiro voando", categoria: "negocio", tags: "dinheiro oportunidade desconto" },
  { id: "moeda", rotulo: "Moeda", categoria: "negocio", tags: "moeda economia" },
  { id: "cartao", rotulo: "Cartão", categoria: "negocio", tags: "cartao financiamento pagamento" },
  { id: "etiqueta", rotulo: "Etiqueta", categoria: "negocio", tags: "etiqueta preco oferta" },
  { id: "valorizacao", rotulo: "Valorização", categoria: "negocio", tags: "valorizacao investimento grafico" },
  { id: "aperto_mao", rotulo: "Aperto de mão", categoria: "negocio", tags: "negocio fechado acordo parceria" },
  { id: "trofeu", rotulo: "Troféu", categoria: "negocio", tags: "melhor premio destaque" },
  { id: "diamante", rotulo: "Diamante", categoria: "negocio", tags: "luxo alto padrao exclusivo" },
  { id: "coroa", rotulo: "Coroa", categoria: "negocio", tags: "luxo premium exclusivo" },
  { id: "contrato", rotulo: "Contrato", categoria: "negocio", tags: "contrato documento assinatura" },
  { id: "documento", rotulo: "Documento", categoria: "negocio", tags: "documento escritura" },
  { id: "prancheta", rotulo: "Prancheta", categoria: "negocio", tags: "lista checklist" },
  { id: "calendario", rotulo: "Calendário", categoria: "negocio", tags: "data visita agenda" },
  { id: "agenda", rotulo: "Agenda", categoria: "negocio", tags: "agenda visita" },
  { id: "pino", rotulo: "Localização", categoria: "negocio", tags: "localizacao mapa endereco bairro" },
  { id: "mapa", rotulo: "Mapa", categoria: "negocio", tags: "mapa regiao" },
  { id: "celular", rotulo: "Celular", categoria: "negocio", tags: "whatsapp contato celular" },
  { id: "telefone", rotulo: "Telefone", categoria: "negocio", tags: "ligar contato telefone" },
  { id: "conversa", rotulo: "Conversa", categoria: "negocio", tags: "mensagem conversa chat" },
  { id: "megafone", rotulo: "Megafone", categoria: "negocio", tags: "anuncio novidade oferta" },
  { id: "sino", rotulo: "Sino", categoria: "negocio", tags: "aviso novidade" },
  { id: "envelope", rotulo: "Envelope", categoria: "negocio", tags: "email contato" },
  { id: "lupa", rotulo: "Lupa", categoria: "negocio", tags: "busca detalhe procurar" },
  { id: "ideia", rotulo: "Ideia", categoria: "negocio", tags: "ideia dica" },
  { id: "cem", rotulo: "100", categoria: "negocio", tags: "perfeito cem nota" },
  { id: "check", rotulo: "Check", categoria: "sinais", tags: "sim ok aprovado disponivel" },
  { id: "certo", rotulo: "Certo", categoria: "sinais", tags: "certo ok" },
  { id: "x", rotulo: "X", categoria: "sinais", tags: "nao errado vendido" },
  { id: "atencao", rotulo: "Atenção", categoria: "sinais", tags: "atencao aviso" },
  { id: "exclamacao", rotulo: "Exclamação", categoria: "sinais", tags: "importante atencao" },
  { id: "pergunta", rotulo: "Pergunta", categoria: "sinais", tags: "duvida pergunta" },
  { id: "estrela", rotulo: "Estrela", categoria: "sinais", tags: "estrela destaque" },
  { id: "estrela_brilho", rotulo: "Estrela brilhando", categoria: "sinais", tags: "destaque especial" },
  { id: "brilho", rotulo: "Brilho", categoria: "sinais", tags: "novo brilho reformado" },
  { id: "fogo", rotulo: "Fogo", categoria: "sinais", tags: "quente oportunidade urgente" },
  { id: "raio", rotulo: "Raio", categoria: "sinais", tags: "rapido energia" },
  { id: "explosao", rotulo: "Explosão", categoria: "sinais", tags: "impacto oferta" },
  { id: "coracao", rotulo: "Coração", categoria: "sinais", tags: "amor gostei favorito" },
  { id: "coracao_brilho", rotulo: "Coração brilhando", categoria: "sinais", tags: "amor encantado" },
  { id: "novo", rotulo: "NEW", categoria: "sinais", tags: "novo lancamento" },
  { id: "free", rotulo: "FREE", categoria: "sinais", tags: "gratis livre" },
  { id: "top", rotulo: "TOP", categoria: "sinais", tags: "top destaque" },
  { id: "foguete", rotulo: "Foguete", categoria: "sinais", tags: "lancamento rapido" },
  { id: "despertador", rotulo: "Despertador", categoria: "sinais", tags: "tempo urgente prazo" },
  { id: "ampulheta", rotulo: "Ampulheta", categoria: "sinais", tags: "ultimos dias tempo" },
  { id: "seta_direita", rotulo: "Seta direita", categoria: "sinais", tags: "seta direita" },
  { id: "seta_esquerda", rotulo: "Seta esquerda", categoria: "sinais", tags: "seta esquerda" },
  { id: "seta_cima", rotulo: "Seta pra cima", categoria: "sinais", tags: "seta cima" },
  { id: "seta_baixo", rotulo: "Seta pra baixo", categoria: "sinais", tags: "seta baixo link" },
  { id: "joia", rotulo: "Joinha", categoria: "maos", tags: "joia like ok aprovado" },
  { id: "palmas", rotulo: "Palmas", categoria: "maos", tags: "parabens palmas" },
  { id: "tchau", rotulo: "Oi", categoria: "maos", tags: "oi ola tchau" },
  { id: "aponta_direita", rotulo: "Apontando à direita", categoria: "maos", tags: "apontar direita" },
  { id: "aponta_baixo", rotulo: "Apontando pra baixo", categoria: "maos", tags: "apontar baixo link" },
  { id: "aponta_cima", rotulo: "Apontando pra cima", categoria: "maos", tags: "apontar cima" },
  { id: "comemora", rotulo: "Comemorando", categoria: "maos", tags: "comemorar vitoria" },
  { id: "obrigado", rotulo: "Obrigado", categoria: "maos", tags: "obrigado gratidao" },
  { id: "paz", rotulo: "Vitória", categoria: "maos", tags: "vitoria paz" },
  { id: "me_liga", rotulo: "Me liga", categoria: "maos", tags: "ligar contato" },
  { id: "sol", rotulo: "Sol", categoria: "lazer", tags: "sol claro verao" },
  { id: "praia", rotulo: "Praia", categoria: "lazer", tags: "praia litoral ferias" },
  { id: "onda", rotulo: "Onda", categoria: "lazer", tags: "mar agua praia" },
  { id: "coqueiro", rotulo: "Coqueiro", categoria: "lazer", tags: "praia tropical" },
  { id: "arvore", rotulo: "Árvore", categoria: "lazer", tags: "arvore area verde natureza" },
  { id: "pinheiro", rotulo: "Pinheiro", categoria: "lazer", tags: "serra natureza campo" },
  { id: "floco", rotulo: "Frio", categoria: "lazer", tags: "ar condicionado frio" },
  { id: "guarda_chuva", rotulo: "Guarda-chuva", categoria: "lazer", tags: "chuva" },
  { id: "arco_iris", rotulo: "Arco-íris", categoria: "lazer", tags: "alegria cor" },
  { id: "nascer_sol", rotulo: "Nascer do sol", categoria: "lazer", tags: "manha vista sol" },
  { id: "por_sol", rotulo: "Pôr do sol", categoria: "lazer", tags: "vista entardecer" },
  { id: "cachorro", rotulo: "Cachorro", categoria: "lazer", tags: "pet friendly cachorro animal" },
  { id: "gato", rotulo: "Gato", categoria: "lazer", tags: "pet gato animal" },
  { id: "patas", rotulo: "Pet friendly", categoria: "lazer", tags: "pet friendly animal" },
  { id: "carro", rotulo: "Carro", categoria: "lazer", tags: "vaga garagem carro" },
  { id: "bicicleta", rotulo: "Bicicleta", categoria: "lazer", tags: "ciclovia bicicleta" },
  { id: "bola", rotulo: "Bola", categoria: "lazer", tags: "quadra esporte lazer" },
  { id: "fonte", rotulo: "Fonte", categoria: "lazer", tags: "praca jardim" },
  { id: "escola", rotulo: "Escola", categoria: "lazer", tags: "escola perto" },
  { id: "hospital", rotulo: "Hospital", categoria: "lazer", tags: "hospital perto" },
  { id: "mercado", rotulo: "Mercado", categoria: "lazer", tags: "mercado compras perto" },
  { id: "onibus", rotulo: "Ônibus", categoria: "lazer", tags: "transporte onibus" },
  { id: "metro", rotulo: "Metrô", categoria: "lazer", tags: "metro transporte" },
  { id: "aviao", rotulo: "Avião", categoria: "lazer", tags: "aeroporto viagem" },
  { id: "festa", rotulo: "Festa", categoria: "festa", tags: "comemorar vendido parabens" },
  { id: "confete", rotulo: "Confete", categoria: "festa", tags: "festa comemorar" },
  { id: "balao", rotulo: "Balão", categoria: "festa", tags: "festa aniversario" },
  { id: "presente", rotulo: "Presente", categoria: "festa", tags: "presente bonus brinde" },
  { id: "champanhe", rotulo: "Champanhe", categoria: "festa", tags: "comemorar vendido" },
  { id: "brinde", rotulo: "Brinde", categoria: "festa", tags: "brinde comemorar" },
  { id: "camera", rotulo: "Câmera", categoria: "festa", tags: "foto camera" },
  { id: "filmadora", rotulo: "Filmadora", categoria: "festa", tags: "video tour" },
  { id: "claquete", rotulo: "Claquete", categoria: "festa", tags: "video filme" },
];

export const ADESIVO_POR_ID: Record<string, Adesivo> = Object.fromEntries(ADESIVOS.map((a) => [a.id, a]));

/** O prefixo que marca, num `ElementoCena.id`, que a peça é um adesivo e não um modelo desenhado. */
export const PREFIXO_ADESIVO = "adesivo:";

/** O id do adesivo dentro de um id de elemento, ou `null` se não for adesivo (ou não existir). */
export function idDoAdesivo(elementoId: string): string | null {
  if (!elementoId.startsWith(PREFIXO_ADESIVO)) return null;
  const id = elementoId.slice(PREFIXO_ADESIVO.length);
  return ADESIVO_POR_ID[id] ? id : null;
}

/** O endereço público da imagem. O servidor lê o MESMO arquivo, do disco. */
export function urlDoAdesivo(id: string): string {
  return `/adesivos/${id}.png`;
}

/** Sem acento e em minúscula: "câmera" acha "camera", "Pet" acha "pet". */
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Busca por nome e por palavra-chave. Cada palavra digitada tem que aparecer. */
export function buscarAdesivos(termo: string): Adesivo[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return ADESIVOS;
  return ADESIVOS.filter((a) => {
    const alvo = normalizar(`${a.rotulo} ${a.tags}`);
    return palavras.every((p) => alvo.includes(p));
  });
}
