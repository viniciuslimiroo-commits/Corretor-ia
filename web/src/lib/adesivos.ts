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
// public/adesivos/<id>.png e pôr a linha aqui. scripts/testar-elementos.ts confere que todo
// id listado tem arquivo e que nenhum arquivo sobra.
//
// HUMOR e GIFs (pedido dele, com print do CapCut): os adesivos de "humor" são do mesmo
// Fluent Emoji; os GIFs ANIMADOS são do Noto Emoji Animation (Google, licença CC BY 4.0,
// que pede crédito -- ele aparece na aba de GIFs). Os GIFs do CapCut vêm da Giphy: cena
// de filme e rosto de gente famosa, que em anúncio de venda é uso comercial de obra e de
// imagem alheia. Ficaram de fora por isso, decidido com ele. Baixados e reduzidos por
// scripts/baixar-humor.mjs (224px, 12 quadros; miniatura WebP de 96px em mini/).

export type CategoriaAdesivo = "casa" | "negocio" | "sinais" | "maos" | "lazer" | "festa" | "humor";

export type CategoriaGif = "rindo" | "reacao" | "amor" | "gestos" | "comemorar" | "bichos";

export const CATEGORIAS_ADESIVO: { id: CategoriaAdesivo; rotulo: string }[] = [
  { id: "casa", rotulo: "Casa e cômodos" },
  { id: "negocio", rotulo: "Negócio" },
  { id: "sinais", rotulo: "Sinais e setas" },
  { id: "maos", rotulo: "Mãos" },
  { id: "lazer", rotulo: "Lazer e bairro" },
  { id: "festa", rotulo: "Comemorar" },
  { id: "humor", rotulo: "Humor" },
];

export const CATEGORIAS_GIF: { id: CategoriaGif; rotulo: string }[] = [
  { id: "rindo", rotulo: "Rindo" },
  { id: "reacao", rotulo: "Reações" },
  { id: "amor", rotulo: "Amor" },
  { id: "gestos", rotulo: "Gestos" },
  { id: "comemorar", rotulo: "Comemorar" },
  { id: "bichos", rotulo: "Bichos" },
];

/** A licença do Noto Emoji Animation (CC BY 4.0) pede crédito visível. */
export const CREDITO_GIFS = "GIFs: Noto Emoji Animation (Google) · CC BY 4.0";

export type Adesivo = { id: string; rotulo: string; categoria: CategoriaAdesivo | CategoriaGif; tags: string; animado?: true };

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
  // humor (Fluent Emoji 3D, parado)
  { id: "cara_rindo", rotulo: "Rindo", categoria: "humor", tags: "rir risada kkk engracado zoeira humor" },
  { id: "cara_rolando", rotulo: "Rolando de rir", categoria: "humor", tags: "rir risada kkk gargalhada humor" },
  { id: "cara_oculos", rotulo: "Óculos escuros", categoria: "humor", tags: "estiloso legal top descolado humor" },
  { id: "cara_explodindo", rotulo: "Cabeça explodindo", categoria: "humor", tags: "chocado uau incrivel surpresa humor" },
  { id: "cara_deslumbrado", rotulo: "Deslumbrado", categoria: "humor", tags: "uau incrivel estrela maravilhoso humor" },
  { id: "cara_dinheiro", rotulo: "Boca de dinheiro", categoria: "humor", tags: "dinheiro rico preco oferta humor" },
  { id: "cara_festa", rotulo: "Festejando", categoria: "humor", tags: "festa comemorar aniversario humor" },
  { id: "cara_doidinho", rotulo: "Doidinho", categoria: "humor", tags: "maluco louco zoeira humor" },
  { id: "cara_grito", rotulo: "Gritando", categoria: "humor", tags: "susto medo omg surpresa humor" },
  { id: "cara_pensando", rotulo: "Pensando", categoria: "humor", tags: "duvida hmm pergunta humor" },
  { id: "cara_monoculo", rotulo: "Monóculo", categoria: "humor", tags: "analisando chique detalhe humor" },
  { id: "cara_nerd", rotulo: "Nerd", categoria: "humor", tags: "inteligente oculos humor" },
  { id: "cara_cowboy", rotulo: "Caubói", categoria: "humor", tags: "cowboy chapeu humor" },
  { id: "cara_palhaco", rotulo: "Palhaço", categoria: "humor", tags: "palhaco zoeira humor" },
  { id: "fantasma", rotulo: "Fantasma", categoria: "humor", tags: "fantasma susto boo humor" },
  { id: "caveira", rotulo: "Caveira", categoria: "humor", tags: "morri de rir caveira humor" },
  { id: "macaco_nao_vejo", rotulo: "Não vi nada", categoria: "humor", tags: "macaco vergonha humor" },
  { id: "cara_apaixonado", rotulo: "Apaixonado", categoria: "humor", tags: "amor amei coracao humor" },
  { id: "cara_pidao", rotulo: "Olhinhos pidões", categoria: "humor", tags: "por favor fofo humor" },
  { id: "cara_chorando", rotulo: "Chorando", categoria: "humor", tags: "choro triste humor" },
  { id: "cara_calor", rotulo: "Calor", categoria: "humor", tags: "quente calor verao humor" },
  { id: "cara_frio", rotulo: "Frio", categoria: "humor", tags: "frio gelado inverno humor" },
  { id: "cara_derretendo", rotulo: "Derretendo", categoria: "humor", tags: "calor vergonha humor" },
  { id: "cara_ops", rotulo: "Ops", categoria: "humor", tags: "ops surpresa segredo humor" },
  { id: "cara_continencia", rotulo: "Continência", categoria: "humor", tags: "sim senhor respeito humor" },
  { id: "cara_ponta_cabeca", rotulo: "De ponta-cabeça", categoria: "humor", tags: "ironia zoeira humor" },
  { id: "cara_lingua", rotulo: "Língua de fora", categoria: "humor", tags: "brincadeira zoeira humor" },
  { id: "cara_piscando", rotulo: "Piscadinha", categoria: "humor", tags: "piscar piscadinha humor" },
  { id: "robo", rotulo: "Robô", categoria: "humor", tags: "robo tecnologia humor" },
  { id: "et", rotulo: "ET", categoria: "humor", tags: "alien et humor" },
  { id: "gato_rindo", rotulo: "Gato rindo", categoria: "humor", tags: "gato rir kkk pet humor" },
  { id: "balao_fala", rotulo: "Balão de fala", categoria: "humor", tags: "conversa fala comentario humor" },
  { id: "balao_pensamento", rotulo: "Balão de pensamento", categoria: "humor", tags: "pensamento ideia sonho humor" },
  { id: "balao_bravo", rotulo: "Balão bravo", categoria: "humor", tags: "raiva bravo humor" },
  { id: "tontura", rotulo: "Tontura", categoria: "humor", tags: "tonto estrela humor" },
  { id: "moai", rotulo: "Moai", categoria: "humor", tags: "serio meme estatua humor" },
  { id: "cartola", rotulo: "Cartola", categoria: "humor", tags: "chique magica humor" },
  { id: "olhos", rotulo: "Olhos", categoria: "humor", tags: "olha olhando espiar humor" },
  // GIFs animados (Noto Emoji Animation)
  { id: "gif_chorando_de_rir", rotulo: "Chorando de rir", categoria: "rindo", tags: "rir risada kkk engracado meme gif", animado: true },
  { id: "gif_rolando_de_rir", rotulo: "Rolando de rir", categoria: "rindo", tags: "rir risada kkk gargalhada gif", animado: true },
  { id: "gif_gargalhada", rotulo: "Gargalhada", categoria: "rindo", tags: "rir risada feliz gif", animado: true },
  { id: "gif_riso_nervoso", rotulo: "Riso nervoso", categoria: "rindo", tags: "ufa suor nervoso gif", animado: true },
  { id: "gif_doidinho", rotulo: "Doidinho", categoria: "rindo", tags: "maluco louco zoeira gif", animado: true },
  { id: "gif_lingua", rotulo: "Língua de fora", categoria: "rindo", tags: "zoeira brincadeira gif", animado: true },
  { id: "gif_risadinha", rotulo: "Risadinha", categoria: "rindo", tags: "rir fofoca segredo gif", animado: true },
  { id: "gif_estiloso", rotulo: "Estiloso", categoria: "rindo", tags: "oculos legal top gif", animado: true },
  { id: "gif_palhaco", rotulo: "Palhaço", categoria: "rindo", tags: "palhaco zoeira gif", animado: true },
  { id: "gif_morri", rotulo: "Morri", categoria: "rindo", tags: "caveira morri de rir gif", animado: true },
  { id: "gif_fantasma", rotulo: "Fantasma", categoria: "rindo", tags: "fantasma susto boo gif", animado: true },
  { id: "gif_nao_vi", rotulo: "Não vi nada", categoria: "rindo", tags: "macaco vergonha gif", animado: true },
  { id: "gif_ponta_cabeca", rotulo: "De ponta-cabeça", categoria: "rindo", tags: "ironia zoeira gif", animado: true },
  { id: "gif_derretendo", rotulo: "Derretendo", categoria: "rindo", tags: "calor vergonha gif", animado: true },
  { id: "gif_gato_rindo", rotulo: "Gato rindo", categoria: "rindo", tags: "gato rir kkk pet gif", animado: true },
  { id: "gif_grito", rotulo: "Gritando", categoria: "reacao", tags: "susto medo omg gif", animado: true },
  { id: "gif_cabeca_explodindo", rotulo: "Cabeça explodindo", categoria: "reacao", tags: "chocado uau incrivel gif", animado: true },
  { id: "gif_espantado", rotulo: "Espantado", categoria: "reacao", tags: "uau surpresa gif", animado: true },
  { id: "gif_corado", rotulo: "Corado", categoria: "reacao", tags: "vergonha surpresa gif", animado: true },
  { id: "gif_chorando", rotulo: "Chorando", categoria: "reacao", tags: "choro triste gif", animado: true },
  { id: "gif_pidao", rotulo: "Olhinhos pidões", categoria: "reacao", tags: "por favor fofo gif", animado: true },
  { id: "gif_pensando", rotulo: "Pensando", categoria: "reacao", tags: "duvida hmm gif", animado: true },
  { id: "gif_desconfiado", rotulo: "Desconfiado", categoria: "reacao", tags: "suspeito hmm gif", animado: true },
  { id: "gif_revirando_olhos", rotulo: "Revirando os olhos", categoria: "reacao", tags: "tedio aff gif", animado: true },
  { id: "gif_espiando", rotulo: "Espiando", categoria: "reacao", tags: "olhando curioso gif", animado: true },
  { id: "gif_mao_na_boca", rotulo: "Mão na boca", categoria: "reacao", tags: "ops surpresa gif", animado: true },
  { id: "gif_olhos", rotulo: "Olhos", categoria: "reacao", tags: "olha isso olhando gif", animado: true },
  { id: "gif_deslumbrado", rotulo: "Deslumbrado", categoria: "reacao", tags: "uau estrela incrivel gif", animado: true },
  { id: "gif_cifrao", rotulo: "Cifrão", categoria: "reacao", tags: "dinheiro rico preco gif", animado: true },
  { id: "gif_festejando", rotulo: "Festejando", categoria: "reacao", tags: "festa aniversario gif", animado: true },
  { id: "gif_apaixonado", rotulo: "Apaixonado", categoria: "amor", tags: "amor coracao amei gif", animado: true },
  { id: "gif_amei", rotulo: "Amei", categoria: "amor", tags: "amor carinho gif", animado: true },
  { id: "gif_beijinho", rotulo: "Beijinho", categoria: "amor", tags: "beijo amor gif", animado: true },
  { id: "gif_coracao_chamas", rotulo: "Coração em chamas", categoria: "amor", tags: "amor paixao fogo gif", animado: true },
  { id: "gif_coracao_brilhando", rotulo: "Coração brilhando", categoria: "amor", tags: "amor brilho gif", animado: true },
  { id: "gif_coracao_maos", rotulo: "Coração com as mãos", categoria: "amor", tags: "amor gratidao gif", animado: true },
  { id: "gif_palmas", rotulo: "Palmas", categoria: "gestos", tags: "aplausos parabens gif", animado: true },
  { id: "gif_joinha", rotulo: "Joinha", categoria: "gestos", tags: "ok legal like gif", animado: true },
  { id: "gif_aleluia", rotulo: "Aleluia", categoria: "gestos", tags: "comemorar maos gif", animado: true },
  { id: "gif_tchau", rotulo: "Tchau", categoria: "gestos", tags: "oi ola aceno gif", animado: true },
  { id: "gif_forca", rotulo: "Força", categoria: "gestos", tags: "forte musculo gif", animado: true },
  { id: "gif_negocio_fechado", rotulo: "Negócio fechado", categoria: "gestos", tags: "aperto de mao acordo vendido gif", animado: true },
  { id: "gif_por_favor", rotulo: "Por favor", categoria: "gestos", tags: "obrigado gratidao gif", animado: true },
  { id: "gif_olha_aqui", rotulo: "Olha aqui", categoria: "gestos", tags: "apontar direita gif", animado: true },
  { id: "gif_aqui_embaixo", rotulo: "Aqui embaixo", categoria: "gestos", tags: "apontar baixo link gif", animado: true },
  { id: "gif_me_liga", rotulo: "Me liga", categoria: "gestos", tags: "telefone contato gif", animado: true },
  { id: "gif_dancando", rotulo: "Dançando", categoria: "gestos", tags: "danca festa gif", animado: true },
  { id: "gif_festa", rotulo: "Festa", categoria: "comemorar", tags: "festa comemorar parabens gif", animado: true },
  { id: "gif_confete", rotulo: "Confete", categoria: "comemorar", tags: "festa confete gif", animado: true },
  { id: "gif_fogo", rotulo: "Fogo", categoria: "comemorar", tags: "quente hot top gif", animado: true },
  { id: "gif_nota_100", rotulo: "Nota 100", categoria: "comemorar", tags: "perfeito cem gif", animado: true },
  { id: "gif_brilhinhos", rotulo: "Brilhinhos", categoria: "comemorar", tags: "brilho novo gif", animado: true },
  { id: "gif_pow", rotulo: "Pow", categoria: "comemorar", tags: "explosao impacto gif", animado: true },
  { id: "gif_trofeu", rotulo: "Troféu", categoria: "comemorar", tags: "vencedor campeao gif", animado: true },
  { id: "gif_dinheiro_voando", rotulo: "Dinheiro voando", categoria: "comemorar", tags: "dinheiro gasto preco gif", animado: true },
  { id: "gif_foguete", rotulo: "Foguete", categoria: "comemorar", tags: "rapido lancamento gif", animado: true },
  { id: "gif_casinha", rotulo: "Casinha", categoria: "comemorar", tags: "casa lar imovel gif", animado: true },
  { id: "gif_megafone", rotulo: "Megafone", categoria: "comemorar", tags: "anuncio atencao gif", animado: true },
  { id: "gif_despertador", rotulo: "Despertador", categoria: "comemorar", tags: "hora urgente prazo gif", animado: true },
  { id: "gif_sirene", rotulo: "Sirene", categoria: "comemorar", tags: "urgente alerta oportunidade gif", animado: true },
  { id: "gif_atencao", rotulo: "Atenção", categoria: "comemorar", tags: "aviso cuidado gif", animado: true },
  { id: "gif_cachorro", rotulo: "Cachorro", categoria: "bichos", tags: "pet cachorro cao gif", animado: true },
  { id: "gif_gato_assustado", rotulo: "Gato assustado", categoria: "bichos", tags: "gato susto pet gif", animado: true },
  { id: "gif_patinhas", rotulo: "Patinhas", categoria: "bichos", tags: "pet pata gif", animado: true },
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

/** O nome do arquivo, sem pasta: GIF quando é animado. */
export function arquivoDeAdesivo(id: string): string {
  return `${id}.${ADESIVO_POR_ID[id]?.animado ? "gif" : "png"}`;
}

/** O endereço público da imagem. O servidor lê o MESMO arquivo, do disco. */
export function urlDoAdesivo(id: string): string {
  return `/adesivos/${arquivoDeAdesivo(id)}`;
}

/**
 * A imagem pro CARTÃO da galeria. No GIF é a miniatura WebP de 96px: a grade mostra
 * dezenas de uma vez, e o GIF de 224px (uns 300 KB cada) pesaria no celular.
 */
export function urlDaMiniatura(id: string): string {
  return ADESIVO_POR_ID[id]?.animado ? `/adesivos/mini/${id}.webp` : urlDoAdesivo(id);
}

/** Sem acento e em minúscula: "câmera" acha "camera", "Pet" acha "pet". */
function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Busca por nome e por palavra-chave. Cada palavra digitada tem que aparecer. */
export function buscarAdesivos(termo: string, animados?: boolean): Adesivo[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  // `animados` separa as duas abas (Adesivos e GIFs); sem ele a busca vale pras duas.
  const base = animados === undefined ? ADESIVOS : ADESIVOS.filter((a) => !!a.animado === animados);
  if (!palavras.length) return base;
  return base.filter((a) => {
    const alvo = normalizar(`${a.rotulo} ${a.tags}`);
    return palavras.every((p) => alvo.includes(p));
  });
}
