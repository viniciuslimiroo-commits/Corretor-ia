// Catálogo e contrato do vídeo (Fase C). Importado pelo navegador e pelo servidor: aqui
// mora o que a tela oferece (formatos, efeitos, músicas, vozes), o que o pedido pode
// conter (EspecVideo) e quanto custa. Nada de segredo nem de ffmpeg -- isso é
// video-ffmpeg.ts, só servidor.
//
// Decisão de arquitetura (12/09/2026, medido): o vídeo é montado com ffmpeg dentro da
// própria Vercel, em etapas curtas -- uma cena por chamada (4s de vídeo = 4-5s de
// render local), e a montagem final numa chamada só (≈1x o tempo do vídeo). Cabe nos
// 300s do plano Hobby e não exige servidor novo. Cena animada é o único pedaço que sai
// pra IA (image-to-video no fal), e por isso é o único que custa crédito extra.


import { MODELOS_ARTE } from "./texto-arte";
import { IDS_EFEITOS_TEXTO } from "./efeitos-texto/lista";
import { AJUSTES_NEUTROS, ehFiltro as filtroValido, limparAjustes, type Ajustes as AjustesCor, type FiltroId as IdFiltro, type Grade as GradeCor } from "./filtros";
import { ANCORAS, ELEMENTO_POR_ID, type AncoraElemento, type IconeFicha } from "./elementos";
import { ADESIVO_POR_ID, idDoAdesivo } from "./adesivos";
import { ehMovimento, type MovimentoId } from "./movimentos";
import { TAMANHO_CLIPE_MAX, TAMANHO_CLIPE_MIN, ehUrlDoPexels, idDoPexels, type ClipeNaCena } from "./pexels";
import { SEGUNDOS_EFEITO, SEGUNDOS_MUSICA } from "./segundos-do-catalogo";

/** Bucket privado onde os uploads do vídeo entram por URL assinada (mesmo dos resultados). */
export const BUCKET_UPLOADS = "resultados";

export type FormatoId = "9:16" | "16:9" | "1:1" | "4:5";

export const FORMATOS: { id: FormatoId; rotulo: string; largura: number; altura: number; dica: string }[] = [
  { id: "9:16", rotulo: "Vertical", largura: 1080, altura: 1920, dica: "Reels, Stories, TikTok e WhatsApp" },
  { id: "16:9", rotulo: "Horizontal", largura: 1920, altura: 1080, dica: "YouTube, site e TV da imobiliária" },
  { id: "1:1", rotulo: "Quadrado", largura: 1080, altura: 1080, dica: "Feed do Instagram e do Facebook" },
  { id: "4:5", rotulo: "Retrato", largura: 1080, altura: 1350, dica: "Feed do Instagram, ocupa mais tela" },
];

export const FORMATOS_POR_ID = Object.fromEntries(FORMATOS.map((f) => [f.id, f])) as Record<FormatoId, (typeof FORMATOS)[number]>;

export type EfeitoId = "aproximar" | "afastar" | "esquerda" | "direita" | "cima" | "baixo" | "parado";

/**
 * O movimento de câmera na foto parada.
 *
 * Cima e baixo existem porque imóvel tem altura: pé-direito duplo, escada, fachada,
 * prédio inteiro. Numa foto vertical desses, passear na horizontal não mostra nada -- e
 * era só o que havia. "Subir" vai do chão pro teto, que é como se olha um ambiente alto.
 */
export const EFEITOS: { id: EfeitoId; rotulo: string; dica: string }[] = [
  { id: "aproximar", rotulo: "Aproximar", dica: "A câmera avança devagar no centro da foto." },
  { id: "afastar", rotulo: "Afastar", dica: "Começa perto e abre, revelando o ambiente." },
  { id: "esquerda", rotulo: "Passear ←", dica: "Desliza pro lado. Bom em ambiente largo." },
  { id: "direita", rotulo: "Passear →", dica: "Desliza pro outro lado." },
  { id: "cima", rotulo: "Subir ↑", dica: "Do chão pro teto. Pé-direito alto, escada, fachada." },
  { id: "baixo", rotulo: "Descer ↓", dica: "Do teto pro chão. Bom pra abrir um ambiente." },
  { id: "parado", rotulo: "Parado", dica: "Sem movimento nenhum." },
];

// Cena animada: a foto vira um clipe de câmera em movimento por um modelo de
// image-to-video.
//
// TUDO AQUI É MOVIMENTO DE CÂMERA. Nenhum preset pede ação, personagem ou mudança de
// cena -- e isso precisa estar dito no prompt com todas as letras, porque o modelo lê
// "walking" e é capaz de desenhar alguém andando. Foi o que aconteceu: "Caminhar" gerou
// uma pessoa dentro do ambiente. O nome do preset fala com o corretor; o prompt fala com
// o modelo, e o modelo só entende "the CAMERA moves".
//
// O que segura de verdade é o NEGATIVO. Proibição dentro do prompt positivo é sugestão;
// `negative_prompt` é instrução -- e o campo existe na API do wan desde sempre, só não
// estava sendo usado.

/**
 * O que NENHUM vídeo de imóvel pode inventar. Vale para todos os presets.
 *
 * Duas famílias: gente e bicho (que não existiam na foto e viram problema jurídico num
 * anúncio), e mudança estrutural -- parede, porta, janela, móvel que aparece ou some.
 * O corretor está vendendo aquele imóvel, não uma variação dele.
 */
export const NEGATIVO_VIDEO = [
  "people, person, human, man, woman, child, family, realtor, agent, crowd, silhouette, reflection of a person",
  "animals, pets, dog, cat",
  "new furniture, furniture appearing or disappearing, moving furniture, new doors, new windows, new walls",
  "changing architecture, morphing walls, warping geometry, distorted perspective, floating objects",
  // O IMOVEL NAO PODE GANHAR COMODO. Pedido dele em 24/09/2026, depois de ver videos prontos:
  // "quando a camera se movimenta para uma area que nao aparece claramente na foto, a IA acaba
  // criando janelas, portas, comodos, entradas, corredores ou outros espacos que nao existem
  // no imovel".
  //
  // Isto nao e questao de gosto. Um anuncio que mostra um corredor que a casa nao tem e
  // propaganda enganosa, e quem responde por ela e o corretor que postou -- nao o software.
  "new room, extra room, hidden room, new corridor, new hallway, new doorway, new entrance, new staircase",
  "revealing unseen space, camera passing through a doorway, space extending beyond the photograph, invented architecture, extrapolated room",
  // IMOVEL NAO E CENA ANIMADA. "Nao quero efeitos ou animacoes artificiais, como janelas
  // abrindo, portas abrindo, ambientes surgindo, paredes aparecendo ou qualquer outro elemento
  // do imovel sendo criado ou modificado durante o video."
  "door opening, door closing, window opening, window closing, curtain moving, blinds opening, gate opening, drawer opening, cabinet opening",
  "objects animating, appliances turning on, lights turning on or off, water moving, fire, smoke",
  // A CAMERA E DE TRIPE, NAO DE MAO. "Gerei um video de aproximacao e o resultado parecia uma
  // pessoa segurando uma camera na mao, com tremores e movimentos instaveis."
  "handheld camera, camera shake, shaky footage, unstable camera, wobble, bounce, vibration, micro-jitter",
  "sudden camera movement, abrupt motion, erratic motion, random drift, whip pan, camera rotation, tilted horizon, dutch angle, rolling camera",
  "text, captions, subtitles, watermark, logo, price tag, phone number, call to action, end card, title card",
  "cartoon, illustration, painting, oversaturated, flicker, jitter",
].join(", ");

/** O que TODO preset repete: é câmera, e o imóvel fica como está. */
const REGRA_CAMERA =
  "Only the camera moves, mounted on a motorised dolly with a stabilised gimbal. " +
  // Velocidade constante e uma direcao so: e o que separa "camera profissional" de "pessoa
  // segurando o celular", que foi o que ele viu no video de aproximacao.
  "The motion is a single continuous glide in one direction at a constant slow speed, perfectly smooth and stable, with no shake, no wobble, no bounce, no sudden change of direction, no rotation and a level horizon. " +
  // A PARALAXE E O PRODUTO. Ele, em 24/09/2026: "a ideia e que o resultado passe a sensacao
  // de uma camera profissional se movimentando pelo ambiente, e nao de uma imagem
  // simplesmente sendo ampliada ou deslocada para os lados". A diferenca entre as duas coisas
  // e uma so: o ponto de vista muda, e o que esta perto anda mais que o que esta longe.
  "Real three-dimensional camera translation with natural parallax: near objects shift more than far ones as the viewpoint changes, the way a real camera moving through a room behaves, not a flat image being panned or zoomed. " +
  // O TAMANHO DO MOVIMENTO E O BOTAO QUE LIGA A INVENCAO. Medido em 24/09/2026, com duas
  // geracoes reais da MESMA foto (comodo com porta aberta e segunda porta pro fundo):
  //
  //   "small and subtle"              8,0 de movimento/s  ·  nada inventado, comodo intacto
  //   "clear and confident travel"    4,9 de movimento/s  ·  quase parado 3,7s e DERRETEU no
  //                                                          fim: parede nova no meio do
  //                                                          comodo, geometria torta, cor lavada
  //
  // Pedir mais distancia nao deu mais tour: deu alucinacao. O wan 2.2-5b e o modelo barato, e
  // ele so mantem a geometria enquanto a camera anda pouco. Entao o prompt fica no lado seguro
  // -- a distancia que falta vem do zoom do ffmpeg por cima do clipe, que nao sabe inventar.
  "The movement is small and controlled. " +
  // E A TRAVA, que e outra coisa do tamanho do movimento: a paralaxe pode redesenhar de outro
  // angulo o que a foto JA MOSTRA; o que ela nao pode e continuar a casa pra fora do
  // enquadramento. Foi dai que sairam os corredores que o imovel nao tem.
  "The camera stays inside the space the photograph already shows and never travels far enough to expose anything beyond its edges; whatever is not visible in the original photograph must never appear. " +
  "The room, the architecture, the furniture, the walls, doors, windows, floor and ceiling stay exactly as in the original photo, unchanged and undistorted: nothing opens, nothing closes, nothing is added, removed or animated. " +
  "Consistent natural lighting. Photorealistic real-estate footage. The shot ends by decelerating smoothly to a still frame.";

export type AnimacaoId = "drone" | "caminhar" | "lateral" | "girar" | "aproximar";

/**
 * MOVIMENTOS APOSENTADOS: saem da escolha, continuam resolvendo.
 *
 * "lateral" durou um dia. Criei em 24/09/2026 apostando que a paralaxe do passeio de lado
 * daria a sensacao de tour com o menor risco de invencao -- e a aposta so estava meia certa.
 * Nao inventa mesmo, mas ele assistiu e disse: "queria tirar a opcao de passar pelo ambiente,
 * tem o mesmo resultado que fotos, achei ruim tambem".
 *
 * Faz sentido com o que ja estava medido: o clipe da IA sozinho anda 8,0 e o zoom do ffmpeg
 * por cima leva pra 25. No passeio lateral, a maior parte do que se ve E o zoom do ffmpeg --
 * entao ele parece mesmo uma foto deslizando, porque em boa parte e isso.
 *
 * "girar" saiu no mesmo dia, e pelo argumento DELE, que e melhor que o sintoma. Ele gerou,
 * viu que nao girou, e escreveu: "mesmo que girasse, a IA por nao conhecer o lugar nao iria
 * criar coisas? nao e melhor tirar a opcao".
 *
 * E melhor, sim. Orbitar mostra os LADOS e o FUNDO do que esta na cena -- justamente o que a
 * foto nunca teve. E uma maquina de inventar por construcao, e nao tem prompt que resolva:
 * ou ela gira e precisa desenhar o que nao existe, ou nao gira e nao e orbita. O clipe dele
 * confirmou o segundo caso.
 *
 * Sobram tres: sobrevoo (fora, onde o que aparece a mais e ceu e mais fachada), entrar no
 * ambiente (um passo, sem chegar no fundo) e aproximar com profundidade (que so amplia).
 *
 * Os dois ficam na lista pra os videos que ja apontam pra eles nao trocarem de movimento
 * sozinhos: a busca cai no padrao quando nao acha, e um video refeito sairia com outra camera
 * e cobrando de novo, sem nada na tela explicando.
 */
const ANIMACOES_APOSENTADAS = new Set<AnimacaoId>(["lateral", "girar"]);

/** Os movimentos que a pessoa pode ESCOLHER hoje. E esta lista que vai pra tela. */
export function animacoesOferecidas() {
  return ANIMACOES.filter((a) => !ANIMACOES_APOSENTADAS.has(a.id));
}

export const ANIMACOES: { id: AnimacaoId; rotulo: string; descricao: string; prompt: string }[] = [
  {
    id: "drone",
    rotulo: "Sobrevoo",
    descricao: "A câmera sobe e avança devagar sobre a fachada ou o terreno.",
    prompt: `Slow cinematic aerial shot on a stabilised drone: the camera glides gently forward and slightly upward over the property at a constant speed, locked and smooth. ${REGRA_CAMERA}`,
  },
  {
    id: "caminhar",
    rotulo: "Entrar no ambiente",
    // "Não entra ninguém na cena" saiu daqui em 12/10/2026. Ele leu e disse: "isso parece
    // explicação que fiz pra IA criar o recurso... não precisa disso pro usuário ler".
    // Tinha razão: é uma garantia contra um erro do MODELO, escrita pra quem programa. Pro
    // corretor ela só planta uma dúvida que ele não tinha -- e quem garante que ninguém
    // entra é o `prompt` logo abaixo, não a frase na tela.
    descricao: "A câmera dá um passo pra dentro do cômodo, como quem entra.",
    // "as if the camera operator were walking" e não "a person walking": a diferença entre
    // descrever o MOVIMENTO e pedir um PERSONAGEM.
    //
    // E "slightly forward" e não "through the room", desde 24/09/2026: atravessar o cômodo
    // inteiro OBRIGA o modelo a desenhar o que está além do enquadramento, e foi assim que
    // apareceram corredores e portas que a casa não tem. Um passo pra dentro dá a mesma
    // sensação de entrar sem pedir que o modelo invente o resto.
    prompt: `Slow steady dolly-in on rails: the camera glides slightly forward into the room at a constant speed, staying within the space already visible in the photograph. ${REGRA_CAMERA}`,
  },
  {
    id: "lateral",
    rotulo: "Passar pelo ambiente",
    descricao: "A câmera desliza de lado, como quem atravessa o cômodo olhando em volta.",
    // O MOVIMENTO QUE MAIS PARECE TOUR, e ele apontou por que: "se a IA conseguir criar uma
    // movimentação de câmera lateral bem executada, suave e natural, o resultado pode
    // transmitir a sensação de que a câmera está realmente percorrendo o ambiente".
    //
    // E é também o mais seguro contra invencionice, o que não é coincidência: andando de
    // lado, a paralaxe redesenha de outro ângulo o que a foto JÁ mostra -- o sofá sai da
    // frente da parede, a quina do móvel gira. Avançar em linha reta, não: a certa altura
    // o fundo acaba e o modelo precisa inventar o que vem depois.
    prompt: `Slow lateral tracking shot: the camera trucks sideways on a motorised slider at a constant speed, keeping the same part of the room framed, with strong natural parallax between foreground and background. ${REGRA_CAMERA}`,
  },
  {
    id: "girar",
    rotulo: "Girar em volta",
    descricao: "A câmera gira devagar no próprio eixo, mostrando o ambiente.",
    prompt: `Very slow smooth camera orbit on a motorised head, a small arc around the space at a constant speed, revealing nothing beyond what the photograph already shows. ${REGRA_CAMERA}`,
  },
  {
    id: "aproximar",
    rotulo: "Aproximar com profundidade",
    // "parallax" é palavra de quem faz vídeo, não de quem vende imóvel.
    descricao: "Zoom lento, com profundidade, como se a câmera avançasse.",
    prompt: `Slow cinematic push-in towards the centre of the scene on a motorised slider, constant speed, with subtle natural parallax and real depth, no shake. ${REGRA_CAMERA}`,
  },
];

// Tour 360: a foto (ou o vídeo) equirretangular tem a cena inteira, então dá pra mover
// uma câmera de verdade dentro dela -- giro e inclinação reais, com a perspectiva
// correta em cada quadro. É o único jeito honesto de fazer "câmera passeando pelo
// ambiente" sem IA: numa foto comum não existe o que está atrás do sofá.
//
// Velocidade importa: 45°/s embrulha o estômago. Estes presets ficam entre 8 e 20°/s,
// que é o ritmo de tour imobiliário.
// Duas entradas diferentes, e confundir as duas entorta a imagem:
//   equirect     câmera 360 de verdade: 2:1, cobre 360°×180°.
//   panoramica   modo panorâmico do celular: projeção CILÍNDRICA, 3:1 ou mais, cobre
//                uns 180-220° na horizontal e pouco na vertical.
// Quase nenhum corretor tem câmera 360; todo celular tem modo panorâmico. Suportar os
// dois é o que faz esta função existir de verdade.
export type Projecao360 = "equirect" | "panoramica";

/** Pela proporção: 2:1 é equirretangular; acima de 2,6:1 é panorâmica de celular. */
export function projecaoPelaProporcao(largura: number, altura: number): Projecao360 | null {
  const r = largura / altura;
  if (r > 1.85 && r < 2.15 && largura >= 1800) return "equirect";
  if (r >= 2.6 && largura >= 1200) return "panoramica";
  return null;
}

/**
 * Campo de visão da panorâmica e o que cabe na saída.
 *
 * Uma panorâmica cilíndrica de largura W cobrindo `ihFov` graus tem raio
 * R = W / rad(ihFov); a altura H cobre então 2·atan(H/2R) graus. Pedir mais do que
 * isso devolve faixa cinza em cima e embaixo -- foi o que apareceu no primeiro teste
 * com a panorâmica real do Vinicius (12/09/2026).
 */
export function fovDaPanoramica(largura: number, altura: number, larguraSaida: number, alturaSaida: number, ihFov = 200) {
  const raio = largura / ((ihFov * Math.PI) / 180);
  const ivFov = (2 * Math.atan(altura / 2 / raio) * 180) / Math.PI;
  // Deixa 6% de margem pra não raspar a borda, e deriva o horizontal pelo formato.
  const vFov = Math.max(20, ivFov * 0.94);
  const hFov = (2 * Math.atan(Math.tan((vFov * Math.PI) / 360) * (larguraSaida / alturaSaida)) * 180) / Math.PI;
  return { ihFov, ivFov, hFov: Math.min(hFov, ihFov * 0.9), vFov };
}

export type Movimento360Id = "olhar_volta" | "giro_completo" | "entrar" | "panoramica" | "revelar";

export const MOVIMENTOS_360: { id: Movimento360Id; rotulo: string; descricao: string; yaw: [number, number]; pitch: [number, number]; fov: [number, number] }[] = [
  { id: "olhar_volta", rotulo: "Olhar em volta", descricao: "Vira devagar da esquerda pra direita.", yaw: [-70, 70], pitch: [0, 0], fov: [95, 95] },
  { id: "giro_completo", rotulo: "Giro completo", descricao: "Mostra o ambiente inteiro, 360°.", yaw: [-180, 180], pitch: [0, 0], fov: [100, 100] },
  { id: "entrar", rotulo: "Entrar no ambiente", descricao: "Abre o campo de visão como quem entra.", yaw: [-15, 15], pitch: [4, 0], fov: [110, 72] },
  { id: "panoramica", rotulo: "Panorâmica lenta", descricao: "Movimento suave e curto, bom pra fundo.", yaw: [-35, 35], pitch: [0, 0], fov: [90, 90] },
  { id: "revelar", rotulo: "Do piso ao ambiente", descricao: "Começa olhando pra baixo e levanta.", yaw: [-20, 20], pitch: [-35, 5], fov: [100, 92] },
];

/**
 * As emendas entre uma cena e a seguinte.
 *
 * Cinco, e nenhuma delas chama atenção pra si. Vídeo de imóvel com transição de
 * apresentação de colégio queima o imóvel -- o que vende é o ambiente, não o efeito.
 * Cada uma vira um `xfade` do ffmpeg, com a duração que faz sentido pra ela: o corte é
 * um xfade tão curto (0,08s) que o olho lê como corte seco, e isso deixa a montagem com
 * um caminho só em vez de dois.
 */
export type TransicaoId = "corte" | "dissolver" | "deslizar" | "aproximar" | "desfoque";

export const TRANSICOES: { id: TransicaoId; rotulo: string; xfade: string; segundos: number }[] = [
  { id: "corte", rotulo: "Corte", xfade: "fade", segundos: 0.08 },
  // 0,3 s e não 0,6: medido no vídeo que ele tomou como referência (23/09/2026). Lá a troca
  // de foto dura 7 quadros a 24 fps -- 0,29 s. Com 0,6 s a foto nova demora a assumir e a
  // passagem lê como "o vídeo travou", que é metade do "tudo quase estático" que ele viu.
  { id: "dissolver", rotulo: "Dissolver", xfade: "dissolve", segundos: 0.3 },
  { id: "deslizar", rotulo: "Deslizar", xfade: "slideleft", segundos: 0.6 },
  { id: "aproximar", rotulo: "Aproximar", xfade: "zoomin", segundos: 0.7 },
  { id: "desfoque", rotulo: "Desfoque", xfade: "hblur", segundos: 0.5 },
];

export const TRANSICAO_POR_ID = Object.fromEntries(TRANSICOES.map((t) => [t.id, t])) as Record<TransicaoId, (typeof TRANSICOES)[number]>;

/** "suave" era o nome antigo do dissolver, e ainda está gravado em vídeos do banco. */
export function ehTransicao(v: unknown): TransicaoId {
  if (v === "suave") return "dissolver";
  return TRANSICOES.some((t) => t.id === v) ? (v as TransicaoId) : "dissolver";
}

// ---- texto sobre a cena ----
//
// Não é um editor de texto livre, e isso é escolha. Posição livre (arrastar o texto pra
// qualquer ponto) exige uma tela de canvas, e o resultado quase sempre fica torto: o
// corretor põe o preço em cima da janela, o Instagram corta a borda, e o vídeo sai pior
// do que sairia sem. Três posições, três estilos e três animações cobrem o que um Reel de
// imóvel usa, e todas as combinações ficam boas.

export type PosicaoTexto = "topo" | "centro" | "base";
export type EstiloTexto = "faixa" | "destaque" | "etiqueta" | "contorno" | "sombra" | "gigante" | "fino" | "selo";
export type AnimacaoTexto = "nenhuma" | "surgir" | "subir" | "descer" | "entrar_esquerda" | "entrar_direita" | "piscar" | "no_fim";

/**
 * O VISUAL de um texto, quando ele foge do estilo base.
 *
 * Existe porque uma galeria em que todo cartão é uma caixa azul com palavras diferentes
 * não é uma galeria -- é uma lista com fundo. O que faz alguém escolher vendo é cada
 * modelo ter COR, CAIXA e CONTORNO próprios.
 *
 * Cores em hexa sem "#": o drawtext quer "0xRRGGBB" e a tela quer "#RRGGBB", e cada lado
 * converte. `caixa: null` é sem caixa atrás; `contorno: null`, sem borda.
 */
export type VisualTexto = {
  cor?: string;
  caixa?: string | null;
  contorno?: string | null;
  sombra?: boolean;
  /** Fração da altura do vídeo. Ausente = a do estilo base. */
  tamanho?: number;
};

export type TextoCena = {
  texto: string;
  /**
   * Id de um MODELO DE ARTE (texto-arte.ts). Quando existe, o texto não é desenhado pelo
   * drawtext: vira SVG, é rasterizado e entra como IMAGEM por cima da cena. É o que
   * permite contorno duplo, brilho, relevo e adesivo -- coisas que o drawtext não faz.
   */
  arte?: string;
  /** Acabamento próprio deste texto, por cima do estilo. Ignorado quando há `arte`. */
  visual?: VisualTexto;
  posicao?: PosicaoTexto;
  estilo?: EstiloTexto;
  animacao?: AnimacaoTexto;
  /**
   * Movimento em LAÇO depois de entrar (pulsar, balançar, tremer...): é o que faz o texto
   * parecer GIF. Só vale pra texto com efeito (`arte`), que entra como imagem; o drawtext
   * não gira nem cresce.
   */
  movimento?: MovimentoId;
  /** Coordenada X no palco em porcentagem (0 a 100). */
  x?: number;
  /** Coordenada Y no palco em porcentagem (0 a 100). */
  y?: number;
  /**
   * Release 2 (docs/planos/linha-do-tempo-spec.md, A6): segundo do CLIPE DA CENA em que o
   * texto aparece. Ausente = 0. Declarado agora; o saneador ainda não lê nem guarda.
   */
  de?: number;
  /** Release 2: segundo do clipe da cena em que o texto some. Ausente = a duração da cena. */
  ate?: number;
};

export const POSICOES_TEXTO: { id: PosicaoTexto; rotulo: string }[] = [
  { id: "topo", rotulo: "Em cima" },
  { id: "centro", rotulo: "No meio" },
  { id: "base", rotulo: "Embaixo" },
];

/**
 * Os acabamentos de texto.
 *
 * Oito, não oitenta. Cada um resolve um trabalho que aparece de verdade num anúncio de
 * imóvel, e cada um já vem com tamanho, cor e peso resolvidos -- quem escolhe fonte e
 * cor livre acaba com material que parece feito em casa, e é justamente isso que o
 * corretor está pagando pra não acontecer.
 *
 * `fundo` diz COMO o texto se destaca da foto: caixa cheia atrás, contorno preto na
 * letra, ou sombra. É a escolha que faz texto branco ser legível sobre parede branca --
 * sem ela, metade dos textos some na foto.
 */
export const ESTILOS_TEXTO: { id: EstiloTexto; rotulo: string; tamanho: number; cor: string; fundo: "caixa" | "contorno" | "sombra"; dica: string }[] = [
  { id: "faixa", rotulo: "Faixa", tamanho: 0.03, cor: "0x0f2d5b", fundo: "caixa", dica: "Branco sobre a cor da marca. É a legenda de sempre." },
  { id: "destaque", rotulo: "Destaque", tamanho: 0.052, cor: "0x0f2d5b", fundo: "caixa", dica: "Grande, pro preço e pros números." },
  { id: "etiqueta", rotulo: "Etiqueta", tamanho: 0.026, cor: "0xf06b4f", fundo: "caixa", dica: "Pequena e coral, pra “Lançamento”, “Vendido”." },
  { id: "gigante", rotulo: "Gigante", tamanho: 0.075, cor: "0x0f2d5b", fundo: "caixa", dica: "Ocupa a tela. Pro preço na abertura do Reels." },
  { id: "contorno", rotulo: "Contorno", tamanho: 0.042, cor: "0x000000", fundo: "contorno", dica: "Letra branca com borda preta, sem caixa. Não tapa a foto." },
  { id: "sombra", rotulo: "Sombra", tamanho: 0.042, cor: "0x000000", fundo: "sombra", dica: "Letra branca com sombra. Mais leve que o contorno." },
  { id: "fino", rotulo: "Discreto", tamanho: 0.022, cor: "0x000000", fundo: "sombra", dica: "Miúdo, pro que precisa estar escrito e não gritar." },
  { id: "selo", rotulo: "Selo", tamanho: 0.034, cor: "0x2cb1a3", fundo: "caixa", dica: "Teal da marca. Pra “Exclusivo”, “Reservado”." },
];

export const ESTILO_TEXTO_POR_ID = Object.fromEntries(ESTILOS_TEXTO.map((e) => [e.id, e])) as Record<EstiloTexto, (typeof ESTILOS_TEXTO)[number]>;

/**
 * Como o texto ENTRA na cena.
 *
 * Nenhuma mexe em transparência de propósito: no `drawtext` o alpha afeta a letra e não
 * a caixa atrás dela, então "aparecer suave" deixaria a caixa piscando inteira antes do
 * texto. O que funciona igual em todos os estilos é mexer em POSIÇÃO e em QUANDO.
 */
export const ANIMACOES_TEXTO: { id: AnimacaoTexto; rotulo: string; dica: string }[] = [
  { id: "nenhuma", rotulo: "Parado", dica: "Aparece com a cena e fica." },
  { id: "surgir", rotulo: "Surgir", dica: "A cena começa sem ele; ele entra depois de meio segundo." },
  { id: "subir", rotulo: "Subir", dica: "Desliza de baixo pra cima até o lugar." },
  { id: "descer", rotulo: "Descer", dica: "Desliza de cima pra baixo até o lugar." },
  { id: "entrar_esquerda", rotulo: "Entrar ←", dica: "Vem da esquerda." },
  { id: "entrar_direita", rotulo: "Entrar →", dica: "Vem da direita." },
  { id: "piscar", rotulo: "Piscar", dica: "Aparece e some duas vezes. Pra “Vendido”." },
  { id: "no_fim", rotulo: "Só no fim", dica: "Entra no último terço da cena. Bom pro preço." },
];


/**
 * As etiquetas que o mercado imobiliário usa, prontas.
 *
 * Existem porque ninguém abre um editor pra digitar "Lançamento" — abre pra terminar o
 * vídeo. Cada uma já vem com o estilo e o lugar em que costuma ficar boa.
 */
export const SELOS_IMOVEL: { id: string; texto: string; estilo: EstiloTexto; posicao: PosicaoTexto }[] = [
  { id: "lancamento", texto: "Lançamento", estilo: "etiqueta", posicao: "topo" },
  { id: "novo", texto: "Novo no mercado", estilo: "etiqueta", posicao: "topo" },
  { id: "oportunidade", texto: "Oportunidade", estilo: "etiqueta", posicao: "topo" },
  { id: "alto_padrao", texto: "Alto padrão", estilo: "etiqueta", posicao: "topo" },
  { id: "venda", texto: "À venda", estilo: "etiqueta", posicao: "topo" },
  { id: "aluguel", texto: "Para alugar", estilo: "etiqueta", posicao: "topo" },
  { id: "vendido", texto: "Vendido", estilo: "etiqueta", posicao: "centro" },
  { id: "reservado", texto: "Reservado", estilo: "etiqueta", posicao: "centro" },
  { id: "visita", texto: "Agende sua visita", estilo: "faixa", posicao: "base" },
  { id: "whats", texto: "Chame no WhatsApp", estilo: "faixa", posicao: "base" },
];

// Os filtros moraram pra filtros.ts: lá cada filtro é uma função de cor que a tela e o
// servidor usam IGUAL. Os nomes continuam exportados daqui porque o resto do produto já
// importava de "./video", e trocar vinte imports por uma mudança de endereço não
// compra nada.
export type { FiltroId, Ajustes, Grade } from "./filtros";
export { MODELOS_FILTRO as FILTROS, FILTRO_POR_ID, ehFiltro } from "./filtros";

/**
 * MODELOS DE TEXTO: a frase pronta, já com o acabamento certo.
 *
 * Não são os do CapCut (retrô, vlog, neon). São os que aparecem num anúncio de imóvel e
 * que o corretor escreveria à mão todo dia -- status, condição de pagamento, chamada.
 * Escolher aqui é um clique; escrever é uma frase, um estilo, uma posição e uma entrada.
 *
 * O que NÃO está aqui é tudo que vem do cadastro: preço, quartos, área e vagas entram
 * pelas PEÇAS do imóvel, já preenchidas. Modelo com preço fixo seria pedir pra digitar
 * de novo o que já está cadastrado -- e pra alguém esquecer de trocar.
 */
export type CategoriaTexto = "status" | "condicao" | "chamada" | "urgencia";

export const CATEGORIAS_TEXTO: { id: CategoriaTexto; rotulo: string; para: string }[] = [
  { id: "status", rotulo: "Situação", para: "Onde o imóvel está: à venda, vendido, reservado" },
  { id: "condicao", rotulo: "Condição", para: "Como se compra: financiamento, permuta, entrega" },
  { id: "chamada", rotulo: "Chamada", para: "O que você quer que a pessoa faça" },
  { id: "urgencia", rotulo: "Urgência", para: "O que faz alguém parar de rolar. Use com verdade." },
];

export type ModeloTexto = {
  id: string;
  texto: string;
  categoria: CategoriaTexto;
  estilo: EstiloTexto;
  posicao: PosicaoTexto;
  animacao: AnimacaoTexto;
  /** O acabamento próprio deste modelo. É o que faz um cartão não parecer o outro. */
  visual: VisualTexto;
};

export const MODELOS_TEXTO: ModeloTexto[] = [
  // ---- situação ----
  { id: "a_venda", texto: "À VENDA", categoria: "status", estilo: "etiqueta", posicao: "topo", animacao: "surgir",
    visual: { cor: "ffffff", caixa: "f06b4f", contorno: null, tamanho: 0.03 } },
  { id: "para_alugar", texto: "PARA ALUGAR", categoria: "status", estilo: "etiqueta", posicao: "topo", animacao: "surgir",
    visual: { cor: "0f2d5b", caixa: "ffffff", tamanho: 0.028 } },
  { id: "lancamento", texto: "Lançamento", categoria: "status", estilo: "selo", posicao: "topo", animacao: "descer",
    visual: { cor: "0b1a2e", caixa: "f5c451", tamanho: 0.034 } },
  { id: "vendido", texto: "VENDIDO", categoria: "status", estilo: "gigante", posicao: "centro", animacao: "piscar",
    visual: { cor: "ffffff", caixa: null, contorno: "8c1c1c", tamanho: 0.085 } },
  { id: "reservado", texto: "RESERVADO", categoria: "status", estilo: "etiqueta", posicao: "centro", animacao: "piscar",
    visual: { cor: "ffffff", caixa: "1a1a1a", tamanho: 0.04 } },
  { id: "exclusivo", texto: "Exclusivo", categoria: "status", estilo: "selo", posicao: "topo", animacao: "entrar_esquerda",
    visual: { cor: "ffffff", caixa: "2cb1a3", tamanho: 0.03 } },

  // ---- condição ----
  { id: "financiamento", texto: "Aceita financiamento", categoria: "condicao", estilo: "faixa", posicao: "base", animacao: "subir",
    visual: { cor: "ffffff", caixa: "0f2d5b", tamanho: 0.028 } },
  { id: "fgts", texto: "Aceita FGTS", categoria: "condicao", estilo: "faixa", posicao: "base", animacao: "subir",
    visual: { cor: "0b1a2e", caixa: "2cb1a3", tamanho: 0.03 } },
  { id: "permuta", texto: "Aceita permuta", categoria: "condicao", estilo: "faixa", posicao: "base", animacao: "subir",
    visual: { cor: "ffffff", caixa: "5b4a8f", tamanho: 0.028 } },
  { id: "pronto", texto: "PRONTO PRA MORAR", categoria: "condicao", estilo: "selo", posicao: "base", animacao: "surgir",
    visual: { cor: "ffffff", caixa: null, contorno: "0b1a2e", tamanho: 0.04 } },
  { id: "na_planta", texto: "Na planta", categoria: "condicao", estilo: "etiqueta", posicao: "topo", animacao: "surgir",
    visual: { cor: "0b1a2e", caixa: "d9e4f5", tamanho: 0.028 } },
  { id: "mobiliado", texto: "Mobiliado", categoria: "condicao", estilo: "etiqueta", posicao: "topo", animacao: "surgir",
    visual: { cor: "ffffff", caixa: "8a6a3f", tamanho: 0.028 } },

  // ---- chamada ----
  { id: "agende", texto: "Agende sua visita", categoria: "chamada", estilo: "faixa", posicao: "base", animacao: "subir",
    visual: { cor: "ffffff", caixa: "f06b4f", tamanho: 0.032 } },
  { id: "whatsapp", texto: "Chame no WhatsApp", categoria: "chamada", estilo: "faixa", posicao: "base", animacao: "subir",
    visual: { cor: "ffffff", caixa: "1f8f4e", tamanho: 0.032 } },
  { id: "link_bio", texto: "Link na bio", categoria: "chamada", estilo: "contorno", posicao: "base", animacao: "no_fim",
    visual: { cor: "ffffff", caixa: null, contorno: "000000", tamanho: 0.042 } },
  { id: "arraste", texto: "Arraste pra ver mais →", categoria: "chamada", estilo: "contorno", posicao: "base", animacao: "entrar_direita",
    visual: { cor: "f5c451", caixa: null, contorno: "0b1a2e", tamanho: 0.036 } },
  { id: "salve", texto: "Salve pra não perder", categoria: "chamada", estilo: "sombra", posicao: "base", animacao: "no_fim",
    visual: { cor: "ffffff", caixa: null, sombra: true, tamanho: 0.036 } },
  { id: "manda_zap", texto: "Manda um oi no zap", categoria: "chamada", estilo: "faixa", posicao: "base", animacao: "subir",
    visual: { cor: "0b1a2e", caixa: "f5c451", tamanho: 0.03 } },

  // ---- urgência ----
  { id: "ultimas", texto: "ÚLTIMAS UNIDADES", categoria: "urgencia", estilo: "etiqueta", posicao: "topo", animacao: "piscar",
    visual: { cor: "ffffff", caixa: "c0392b", tamanho: 0.032 } },
  { id: "novo_mercado", texto: "Novo no mercado", categoria: "urgencia", estilo: "etiqueta", posicao: "topo", animacao: "descer",
    visual: { cor: "0b1a2e", caixa: "a8e6cf", tamanho: 0.03 } },
  { id: "visita_hoje", texto: "Visita ainda hoje", categoria: "urgencia", estilo: "contorno", posicao: "centro", animacao: "no_fim",
    visual: { cor: "f5c451", caixa: null, contorno: "000000", tamanho: 0.046 } },
  { id: "abaixou", texto: "PREÇO ABAIXOU", categoria: "urgencia", estilo: "selo", posicao: "topo", animacao: "entrar_esquerda",
    visual: { cor: "ffffff", caixa: "e07a1f", tamanho: 0.034 } },
];


export type TipoCena = "foto" | "antes_depois" | "clipe" | "animada" | "tour360";

export type Cena = {
  tipo: TipoCena;
  /** Geração do Encena: usa o resultado (foto, animada) ou original + resultado (antes_depois). */
  jobId?: string;
  /** Arquivo enviado pela pessoa (foto ou clipe): caminho no bucket privado. */
  arquivo?: string;
  efeito?: EfeitoId;
  animacao?: AnimacaoId;
  /** Só tour360: como a câmera se move dentro da esfera. */
  movimento?: Movimento360Id;
  legenda?: string;
  /** Textos por cima da cena, além da legenda. Até `LIMITES.textosPorCena`. */
  textos?: TextoCena[];
  /** Segundos em tela. */
  duracao?: number;
  /** Só clipe: corrige cor e nitidez antes de entrar. */
  melhorar?: boolean;
  /** Só clipe e vídeo 360: de que segundo do arquivo a cena começa (aparar o começo). */
  inicio?: number;
  /** A emenda DESTA cena pra próxima. Ausente = a do vídeo. */
  transicao?: TransicaoId;
  /** Acabamento de cor DESTA cena. Ausente = o do vídeo. */
  filtro?: IdFiltro;
  /** Quanto do filtro da cena entra, 0 a 1. Só vale quando a cena tem filtro próprio. */
  intensidade?: number;
  /** Ajustes finos DESTA cena. Ausente = os do vídeo. */
  ajustes?: Partial<AjustesCor>;
  /** Correção de luz, de -0.25 (escurece) a 0.25 (clareia). Ausente = 0. */
  luz?: number;
  /** Giro da imagem, no sentido do relógio: 0, 90, 180 ou 270. */
  giro?: number;
  /** Vira na horizontal. Serve pra foto que veio espelhada da câmera frontal. */
  espelho?: boolean;
  /** Só onde há vídeo: 0,5x a 2x. Ausente = 1. */
  velocidade?: number;
  /** Só onde há vídeo: para no quadro de `inicio` e a cena vira foto parada. */
  congelar?: boolean;
  /** Peças gráficas por cima da cena. Até `LIMITES.elementosPorCena`. */
  elementos?: ElementoCena[];
};

/**
 * Uma peça gráfica na cena.
 *
 * Os `itens` da ficha vêm PRONTOS do navegador, e não são buscados no banco na hora de
 * montar: o servidor de vídeo não precisa saber ler um imóvel pra desenhar uma barra, e
 * o que entra no vídeo fica sendo exatamente o que a pessoa viu no cartão. O preço de
 * fazer diferente seria uma consulta a mais em cada cena e um vídeo que muda sozinho
 * quando alguém edita o cadastro no meio.
 */
export type ElementoCena = {
  /** Id do modelo (elementos.ts). */
  id: string;
  /** Texto livre, pros modelos que pedem. */
  texto?: string;
  /** Os dados da ficha, já em palavra. Só pros modelos que usam ficha. */
  itens?: { icone: IconeFicha; texto: string }[];
  ancora?: AncoraElemento;
  /** Fração da altura do vídeo. Ausente = o tamanho próprio do modelo. */
  tamanho?: number;
  animacao?: AnimacaoTexto;
  /** Movimento em laço (movimentos.ts). Não vale pra GIF, que já se mexe sozinho. */
  movimento?: MovimentoId;
  /**
   * Clipe de reação do Pexels (`id` = "pexels:<n>"): só o que o PALCO precisa pra tocar a
   * prévia e dar o crédito. A montagem ignora a `previa` e busca o arquivo pelo id.
   */
  clipe?: ClipeNaCena;
  /**
   * A cor da peça, em "#rrggbb". Vem do kit de marca, escolhida no navegador.
   *
   * Vem de lá e não é buscada aqui pelo mesmo motivo dos `itens`: desenhar uma peça não
   * pode custar uma consulta ao banco por cena, e o vídeo não pode mudar de cor sozinho
   * porque alguém mexeu na marca no meio da montagem.
   */
  cor?: string;
  /** Coordenada X no palco em porcentagem (0 a 100). */
  x?: number;
  /** Coordenada Y no palco em porcentagem (0 a 100). */
  y?: number;
  /**
   * Release 2 (docs/planos/linha-do-tempo-spec.md, A6): segundo do CLIPE DA CENA em que a
   * peça aparece. Ausente = 0. Declarado agora; o saneador ainda não lê nem guarda.
   */
  de?: number;
  /** Release 2: segundo do clipe da cena em que a peça some. Ausente = a duração da cena. */
  ate?: number;
};

/** Os giros que existem. Um quarto de volta por clique, como em qualquer editor. */
export const GIROS = [0, 90, 180, 270] as const;

/** Arredonda qualquer número pro giro mais próximo que o ffmpeg sabe fazer. */
export function ehGiro(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isFinite(n)) return 0;
  return ((((Math.round(n / 90) * 90) % 360) + 360) % 360) as number;
}

/** As velocidades do botão. Fora disso vira slider, e slider de velocidade ninguém usa. */
export const VELOCIDADES = [
  { v: 0.5, rotulo: "0,5x", dica: "Metade da velocidade: detalhe que passou rápido demais" },
  { v: 1, rotulo: "1x", dica: "Como foi filmado" },
  { v: 1.5, rotulo: "1,5x", dica: "Um pouco mais ágil" },
  { v: 2, rotulo: "2x", dica: "Dobro: caminhada pela casa sem enrolar" },
] as const;

/** Onde velocidade, congelar e aparar fazem sentido: só onde existe vídeo correndo. */
export function temVideoCorrendo(tipo: TipoCena): boolean {
  return tipo === "clipe" || tipo === "animada";
}

/**
 * A cor que vale pra cena: filtro e intensidade DELA ou do vídeo, e ajustes dela ou do
 * vídeo. Mesma regra da transição -- a cena só sai da linha quando a pessoa quer.
 *
 * A `luz` antiga (−0,25 a +0,25, somava brilho) continua valendo como exposição, pra um
 * vídeo feito antes dos Ajustes reabrir com a mesma luz.
 */
export function gradeDaCena(
  c: Pick<Cena, "filtro" | "intensidade" | "ajustes" | "luz">,
  e: Pick<EspecVideo, "filtro" | "intensidadeFiltro" | "ajustes">
): GradeCor {
  const daCena = !!c.filtro;
  const filtro = filtroValido(daCena ? c.filtro : e.filtro);
  const intensidade = Math.min(1, Math.max(0, (daCena ? c.intensidade : e.intensidadeFiltro) ?? 1));
  const ajustes = { ...AJUSTES_NEUTROS, ...(c.ajustes ?? e.ajustes ?? {}) };
  if (c.luz) ajustes.exposicao = Math.max(-1, Math.min(1, ajustes.exposicao + c.luz * 2));
  return { filtro, intensidade, ajustes };
}

export type MusicaId =
  | "nenhuma"
  | "calma" | "sereno" | "aconchego"
  | "elegante" | "sofisticado" | "lounge"
  | "moderna" | "urbano" | "minimal"
  | "alegre" | "familia" | "verao"
  | "cinematografica" | "epico" | "inspirador";

export type CategoriaMusica = "calma" | "elegante" | "moderna" | "alegre" | "cinematografica";

export const CATEGORIAS_MUSICA: { id: CategoriaMusica; rotulo: string; para: string }[] = [
  { id: "calma", rotulo: "Calma", para: "Apartamento, alto padrão, tour sem pressa" },
  { id: "elegante", rotulo: "Elegante", para: "Luxo, cobertura, lançamento fino" },
  { id: "moderna", rotulo: "Moderna", para: "Reels, comercial, imóvel novo" },
  { id: "alegre", rotulo: "Alegre", para: "Casa, família, aluguel" },
  { id: "cinematografica", rotulo: "Cinematográfica", para: "Lançamento, abertura, alto impacto" },
];

/**
 * A biblioteca de trilhas.
 *
 * Todas GERADAS uma vez (stable-audio-25 no fal), instrumentais, 45s, guardadas em
 * public/musica. Nenhuma faixa de terceiros: música protegida num anúncio é o corretor
 * levando strike no Instagram, e o problema é dele, não da ferramenta.
 *
 * Moram em `public/` e não em `assets/` porque o NAVEGADOR precisa delas pra tocar a
 * prévia. Escolher trilha pelo nome é escolher no escuro -- ninguém sabe o que é
 * "Elegante" até ouvir.
 *
 * `segundos` é a duração exata do arquivo (segundos-do-catalogo.ts, gerado por
 * scripts/gerar-picos-audio.ts da contagem de amostras): a linha do tempo precisa dela pra
 * saber onde a música sem laço acaba, sem baixar o arquivo. Sem arquivo = null.
 */
/**
 * FAIXAS APOSENTADAS: saem da escolha, continuam existindo.
 *
 * Ele ouviu e pediu em 24/09/2026: "essas músicas acho muito ruins, queria tirar calmo,
 * sereno e minimal".
 *
 * Apagar da lista seria o caminho curto e errado. Quinze dos vinte vídeos dele usam "calma" --
 * não por escolha, por ser o padrão --, e um espec guardado que aponta pra faixa inexistente
 * não dá erro: sai MUDO. O corretor reabriria um vídeo antigo, mandaria gerar de novo e
 * receberia um vídeo sem trilha, sem nada na tela explicando.
 *
 * Escondidas, elas somem de onde se escolhe e continuam resolvendo em quem já as tem.
 */
const APOSENTADAS = new Set<MusicaId>(["calma", "sereno", "minimal"]);

/**
 * A trilha que vem marcada quando ninguém escolheu.
 *
 * Era "calma", e é por isso que 15 dos 20 vídeos dele estavam com ela -- padrão não é
 * preferência, é ausência de escolha. A nova é "elegante" porque é a única que ele escolheu
 * de propósito alguma vez (3 vídeos), que é a evidência mais forte que existe aqui.
 *
 * Existe como constante pra aposentar uma faixa não deixar um padrão apontando pro vazio: um
 * espec com música inexistente sai MUDO, sem erro nenhum na tela.
 */
// O tipo exclui "nenhuma" de proposito: quem usa o padrao e quem precisa de uma FAIXA --
// a linha de audio do editor, por exemplo, nao sabe o que fazer com silencio.
export const MUSICA_PADRAO: Exclude<MusicaId, "nenhuma"> = "elegante";

/** As faixas que a pessoa pode ESCOLHER hoje. É esta lista que vai pra tela. */
export function musicasOferecidas() {
  return MUSICAS.filter((m) => !APOSENTADAS.has(m.id));
}

export const MUSICAS = comSegundos<{ id: MusicaId; rotulo: string; descricao: string; arquivo: string | null; categoria?: CategoriaMusica }>(SEGUNDOS_MUSICA, [
  { id: "nenhuma", rotulo: "Sem música", descricao: "Só a sua voz, ou silêncio", arquivo: null },

  { id: "calma", rotulo: "Calma", descricao: "Piano e cordas suaves", arquivo: "calma.m4a", categoria: "calma" },
  { id: "sereno", rotulo: "Sereno", descricao: "Piano solo, bem devagar", arquivo: "sereno.m4a", categoria: "calma" },
  { id: "aconchego", rotulo: "Aconchego", descricao: "Violão dedilhado, morno", arquivo: "aconchego.m4a", categoria: "calma" },

  { id: "elegante", rotulo: "Elegante", descricao: "Lounge leve, alto padrão", arquivo: "elegante.m4a", categoria: "elegante" },
  { id: "sofisticado", rotulo: "Sofisticado", descricao: "Piano elétrico e contrabaixo", arquivo: "sofisticado.m4a", categoria: "elegante" },
  { id: "lounge", rotulo: "Lounge", descricao: "Batida macia de hotel", arquivo: "lounge.m4a", categoria: "elegante" },

  { id: "moderna", rotulo: "Moderna", descricao: "Eletrônica discreta", arquivo: "moderna.m4a", categoria: "moderna" },
  { id: "urbano", rotulo: "Urbano", descricao: "Batida seca, ritmo de Reels", arquivo: "urbano.m4a", categoria: "moderna" },
  { id: "minimal", rotulo: "Minimal", descricao: "Poucas notas, muito ar", arquivo: "minimal.m4a", categoria: "moderna" },

  { id: "alegre", rotulo: "Alegre", descricao: "Violão e palmas, clima de família", arquivo: "alegre.m4a", categoria: "alegre" },
  { id: "familia", rotulo: "Família", descricao: "Ukulele e assobio", arquivo: "familia.m4a", categoria: "alegre" },
  { id: "verao", rotulo: "Verão", descricao: "Praia, leve e ensolarado", arquivo: "verao.m4a", categoria: "alegre" },

  { id: "cinematografica", rotulo: "Cinematográfica", descricao: "Orquestra crescente, lançamento", arquivo: "cinematografica.m4a", categoria: "cinematografica" },
  { id: "epico", rotulo: "Épico", descricao: "Tambores e cordas, impacto", arquivo: "epico.m4a", categoria: "cinematografica" },
  { id: "inspirador", rotulo: "Inspirador", descricao: "Piano que abre em orquestra", arquivo: "inspirador.m4a", categoria: "cinematografica" },
]);

/** A entrada do catálogo com a duração medida do arquivo. Sem arquivo, ou não medido: null. */
function comSegundos<T extends { id: string; arquivo: string | null }>(segundos: Readonly<Record<string, number | undefined>>, lista: T[]): (T & { segundos: number | null })[] {
  return lista.map((x) => ({ ...x, segundos: x.arquivo ? (segundos[x.id] ?? null) : null }));
}

/**
 * Efeitos sonoros nas VIRADAS de cena.
 *
 * Um só pro vídeo inteiro, tocado em cada emenda -- não um bloco por posição na linha do
 * tempo. É a diferença entre "dá pra pôr um whoosh" e "agora você administra doze blocos
 * de áudio": o primeiro melhora o vídeo de qualquer corretor, o segundo só serve pra quem
 * já edita, e esse já tem CapCut.
 *
 * Gerados por nós (scripts/gerar-efeitos-sonoros.mjs), pelo mesmo motivo das músicas.
 */
export type EfeitoSonoroId = "nenhum" | "passagem" | "clique" | "brilho" | "impacto" | "sino" | "toque";

export const EFEITOS_SONOROS = comSegundos<{ id: EfeitoSonoroId; rotulo: string; descricao: string; arquivo: string | null }>(SEGUNDOS_EFEITO, [
  { id: "nenhum", rotulo: "Sem efeito", descricao: "Nenhum som nas viradas", arquivo: null },
  { id: "passagem", rotulo: "Passagem", descricao: "Um sopro curto na troca de cena", arquivo: "passagem.m4a" },
  { id: "clique", rotulo: "Clique", descricao: "Obturador de câmera", arquivo: "clique.m4a" },
  { id: "brilho", rotulo: "Brilho", descricao: "Um tilintar, pra revelar ambiente", arquivo: "brilho.m4a" },
  { id: "impacto", rotulo: "Impacto", descricao: "Uma batida seca, pra lançamento", arquivo: "impacto.m4a" },
  { id: "sino", rotulo: "Sino", descricao: "Um toque claro, pra marcar o preço", arquivo: "sino.m4a" },
  { id: "toque", rotulo: "Toque", descricao: "Um pop macio, discreto", arquivo: "toque.m4a" },
]);

export const EFEITO_SONORO_POR_ID = Object.fromEntries(EFEITOS_SONOROS.map((e) => [e.id, e])) as Record<EfeitoSonoroId, (typeof EFEITOS_SONOROS)[number]>;

export const MUSICA_POR_ID = Object.fromEntries(MUSICAS.map((m) => [m.id, m])) as Record<MusicaId, (typeof MUSICAS)[number]>;

export type VozId = "laura" | "sarah" | "daniel" | "george";

export const VOZES: { id: VozId; rotulo: string; genero: "feminina" | "masculina"; elevenlabs: string }[] = [
  { id: "laura", rotulo: "Laura", genero: "feminina", elevenlabs: "Laura" },
  { id: "sarah", rotulo: "Sarah", genero: "feminina", elevenlabs: "Sarah" },
  { id: "daniel", rotulo: "Daniel", genero: "masculina", elevenlabs: "Daniel" },
  { id: "george", rotulo: "George", genero: "masculina", elevenlabs: "George" },
];

/**
 * Frases prontas pra tela final. Três, porque a pessoa escolhe entre poucas e escreve a
 * sua se nenhuma serve -- um campo em branco sem sugestão fica em branco.
 */
export const CHAMADAS = ["Agende sua visita", "Chame no WhatsApp", "Quero saber mais"];

/**
 * De onde vem a voz do vídeo.
 *
 * "ia" é a narração do ElevenLabs e custa crédito. "gravada" (microfone do navegador) e
 * "enviada" (MP3/M4A/WAV que a pessoa já tem) não custam nada: é o arquivo dela, e o
 * servidor só mistura. A voz própria é o motivo nº 1 de alguém gerar aqui e terminar no
 * CapCut, e era o buraco mais caro do produto.
 */
export type OrigemVoz = "ia" | "gravada" | "enviada";

export type Narracao = {
  origem: OrigemVoz;
  /** Só "ia". */
  roteiro?: string;
  voz?: VozId;
  /**
   * "gravada" e "enviada": caminho no bucket privado.
   *
   * "ia": a voz que o TTS JÁ gravou (`uploads/<usuário>/voz-<uuid>.mp3`, VP:517), pra
   * reaproveitar sem gravar de novo e sem cobrar. Só esse formato passa pelo saneador, e
   * o pedido confere dono e existência no bucket antes de cobrar (lib/pedido-video.ts).
   */
  arquivo?: string;
  /** 0,2 a 2. 1 = como veio. Ausente na versao 2: o volume mora no trecho de voz. */
  volume?: number;
  /** Segundos de silêncio antes de a voz começar. Ausente na versao 2: é o `noVideo` do trecho. */
  inicio?: number;
};

/** Narração que a IA grava -- a única que custa crédito. Espec antigo não tem `origem`. */
export function vozDeIA(n: Narracao | null | undefined): boolean {
  return !!n && (n.origem ?? "ia") === "ia";
}

// ---- áudio em trechos (linha do tempo) ----
//
// Música e voz viram TRECHOS numa lista (`audios`), cada um com onde entra no vídeo, de
// que segundo do arquivo parte, quanto dura, volume e fades. É o que deixa cortar, dividir
// e deslizar a música na linha do tempo. O vídeo que não mexeu em nada disso continua
// no formato antigo (`musica`, `narracao.inicio`), byte a byte: ver `canonizarAudio`.

/** De onde vem o som de um trecho. A voz é o arquivo de `espec.narracao`, seja qual for a origem. */
export type FonteAudio =
  | { tipo: "musica"; id: Exclude<MusicaId, "nenhuma"> }
  | { tipo: "voz" };

export type ItemAudio = {
  /** 8 letras minúsculas ou dígitos, estável. Trechos vindos de espec antigo: "musica00", "voz00000". */
  id: string;
  fonte: FonteAudio;
  /** Segundo do VÍDEO em que o trecho entra: 0 a total − audioMin, em centésimos. */
  noVideo: number;
  /** Segundo do ARQUIVO de onde o trecho parte: 0 a corteAudioMax. */
  corteArquivo: number;
  /**
   * Quanto o trecho dura. AUSENTE = até o fim: música em laço, até o fim do vídeo; música
   * sem laço e voz, até o fim do arquivo. Presente: audioMin a corteAudioMax.
   */
  duracao?: number;
  /** Música 0 a 1; voz 0 a 2. */
  volume: number;
  fadeEntrada: number;
  fadeSaida: number;
  /** Só música, e sempre presente nela depois do saneador. */
  laco?: boolean;
};

// ---- legendas ----
//
// Reel de imóvel circula no Instagram com o som desligado: sem legenda, a narração que
// custou crédito não é ouvida por metade de quem vê. Os trechos saem da transcrição do
// ÁUDIO DE VOZ (não da música) e ficam guardados no espec, editáveis -- transcrição
// erra nome de bairro e de rua, e corrigir tem que ser possível.

export type TrechoLegenda = { inicio: number; fim: number; texto: string };
export type EstiloLegenda = "faixa" | "contorno";

export type Legendas = {
  trechos: TrechoLegenda[];
  estilo?: EstiloLegenda;
  posicao?: "base" | "centro";
};

export const ESTILOS_LEGENDA: { id: EstiloLegenda; rotulo: string; dica: string }[] = [
  { id: "faixa", rotulo: "Com fundo", dica: "Caixa escura atrás da frase. Lê em qualquer imagem." },
  { id: "contorno", rotulo: "Sem fundo", dica: "Letra branca com contorno preto, estilo Reels." },
];

// ---- apresentador ----
//
// O corretor aparecendo no próprio vídeo. É a peça que mais muda o resultado num Reel de
// imóvel -- anúncio com rosto é anúncio com gente por trás --, e a que menos existe nas
// ferramentas genéricas, porque exige gravar, cortar e sobrepor sem sair da tela.
//
// Três formatos e nada mais: canto (retângulo), círculo e rodapé (faixa embaixo, largura
// toda). Arrastar livremente pela tela foi deixado de fora de propósito: no vertical, o
// apresentador solto acaba por cima da janela do imóvel ou sob o texto do Instagram.

export type FormatoApresentador = "canto" | "circulo" | "rodape";
export type CantoApresentador = "superior_esquerdo" | "superior_direito" | "inferior_esquerdo" | "inferior_direito";
export type TamanhoApresentador = "pequeno" | "medio" | "grande";

export type Apresentador = {
  /** Caminho do vídeo no bucket privado. */
  arquivo: string;
  formato: FormatoApresentador;
  canto?: CantoApresentador;
  tamanho?: TamanhoApresentador;
  /** Segundo do VÍDEO em que ele entra. */
  entra?: number;
  /** Quanto tempo fica na tela. Ausente = até o fim do clipe dele. */
  duracao?: number;
  /** Segundo do ARQUIVO dele em que a fala começa (aparar o começo). */
  inicio?: number;
  /** 0 a 2. 0 = sem o áudio dele. */
  volume?: number;
  /**
   * Remoção de fundo: preparada, desligada. Hoje custa caro por quadro (um vídeo de 20s
   * são 480 quadros num modelo de segmentação), e um recurso que gasta crédito por
   * segundo não cabe num Reel de imóvel. O campo existe pra ligar quando ficar barato.
   */
  fundo?: "manter" | "remover";
};

export const FORMATOS_APRESENTADOR: { id: FormatoApresentador; rotulo: string; dica: string }[] = [
  { id: "canto", rotulo: "No canto", dica: "Retângulo pequeno sobre o vídeo." },
  { id: "circulo", rotulo: "Círculo", dica: "Recorte redondo, estilo Reels." },
  { id: "rodape", rotulo: "Faixa embaixo", dica: "Largura toda, no pé do vídeo." },
];

export const CANTOS_APRESENTADOR: { id: CantoApresentador; rotulo: string }[] = [
  { id: "superior_esquerdo", rotulo: "Cima · esquerda" },
  { id: "superior_direito", rotulo: "Cima · direita" },
  { id: "inferior_esquerdo", rotulo: "Baixo · esquerda" },
  { id: "inferior_direito", rotulo: "Baixo · direita" },
];

export const TAMANHOS_APRESENTADOR: { id: TamanhoApresentador; rotulo: string; fracao: number }[] = [
  { id: "pequeno", rotulo: "Pequeno", fracao: 0.26 },
  { id: "medio", rotulo: "Médio", fracao: 0.34 },
  { id: "grande", rotulo: "Grande", fracao: 0.44 },
];

/**
 * A MARCA D'ÁGUA: o logo por cima do vídeo INTEIRO, do primeiro quadro ao último.
 *
 * Não se confunde com o logo que já existia na capa montada e na tela final: aqueles dois
 * ficam nas PONTAS. Quem baixa o vídeo e corta os primeiros e os últimos segundos leva o
 * imóvel inteiro sem nada do corretor -- e é exatamente isso que se faz com um vídeo que
 * se quer reusar. Esta fica na imagem o tempo todo.
 *
 * O ARQUIVO NÃO MORA AQUI. O espec guarda só a decisão (onde, que tamanho, quão
 * transparente); o logo é lido de `users.logo_path` na hora de montar, pela mesma
 * `marcaEfetiva` que decide entre o da pessoa e o da imobiliária. Assim trocar de logo não
 * invalida o espec de nenhum vídeo antigo, e reabrir um vídeo pra editar não precisa
 * carregar imagem nenhuma.
 *
 * Ausente ou nulo = sem marca d'água. É o que todo vídeo feito até 29/09/2026 tem.
 */
export type MarcaDagua = {
  canto: PosicaoMarcaDagua;
  tamanho: TamanhoMarcaDagua;
  /** 0,15 a 1. Quanto menor, mais discreta. */
  opacidade: number;
};

/**
 * Onde a marca d'água fica. Os quatro cantos MAIS o centro.
 *
 * O centro entrou a pedido dele em 10/10/2026 ("poderia ser centro da imagem, ou a pessoa
 * poder escolher o lugar"), e não é só mais uma posição: canto é ASSINATURA -- discreta, no
 * canto, fácil de cortar fora. Centro é PROTEÇÃO -- fica em cima do cômodo e quem quiser
 * reusar a foto tem que lidar com ela. São usos diferentes, e por isso o centro vem com um
 * aviso na tela: ele atrapalha a vista do imóvel de propósito.
 */
export type PosicaoMarcaDagua = CantoApresentador | "centro";

export const POSICOES_MARCA_DAGUA: { id: PosicaoMarcaDagua; rotulo: string; dica: string }[] = [
  { id: "inferior_direito", rotulo: "Baixo · direita", dica: "O canto de sempre. Discreto." },
  { id: "inferior_esquerdo", rotulo: "Baixo · esquerda", dica: "Discreto, do outro lado." },
  { id: "superior_direito", rotulo: "Cima · direita", dica: "Longe da barra do Instagram." },
  { id: "superior_esquerdo", rotulo: "Cima · esquerda", dica: "Longe da barra do Instagram." },
  { id: "centro", rotulo: "No meio", dica: "Em cima do cômodo. Atrapalha a vista de propósito: é pra proteger a foto, não pra assinar." },
];

export type TamanhoMarcaDagua = "discreta" | "media" | "grande";

/**
 * As frações são bem menores que as do apresentador de propósito: ali o rosto é conteúdo,
 * aqui a marca não pode competir com o imóvel -- o cômodo é o que vende. A maior daqui
 * (24%) é menor que a menor de lá (26%).
 */
export const TAMANHOS_MARCA_DAGUA: { id: TamanhoMarcaDagua; rotulo: string; fracao: number }[] = [
  { id: "discreta", rotulo: "Discreta", fracao: 0.1 },
  { id: "media", rotulo: "Média", fracao: 0.16 },
  { id: "grande", rotulo: "Grande", fracao: 0.24 },
];

export const OPACIDADE_MARCA_DAGUA_PADRAO = 0.7;

export type EspecVideo = {
  formato: FormatoId;
  cenas: Cena[];
  musica: MusicaId;
  /** 0 a 1. Quando há voz, é o volume ANTES da redução automática. */
  musicaVolume?: number;
  narracao: Narracao | null;
  titulo: string;
  preco: string;
  local: string;
  /** Tela final com nome, CRECI, WhatsApp e logo do corretor. */
  telaFinal: boolean;
  /** Frase da tela final ("Agende sua visita"). Vazia = sem frase. Ausente em vídeos antigos. */
  chamada?: string;
  transicao: TransicaoId;
  /** Índice da cena que vira a miniatura (capa). Ausente ou inválido = a primeira. */
  capa?: number;
  /** Legendas queimadas no vídeo, com o tempo de cada trecho. */
  legendas?: Legendas | null;
  /** Som curto em cada virada de cena. Ausente = nenhum. */
  efeitoSonoro?: EfeitoSonoroId;
  /** Você aparecendo por cima do vídeo. */
  apresentador?: Apresentador | null;
  /** O logo do corretor por cima do vídeo inteiro. Ausente ou nulo = sem marca d'água. */
  marcaDagua?: MarcaDagua | null;
  /** Filtro do vídeo inteiro. Uma cena pode ter o dela. */
  filtro?: IdFiltro;
  /** Quanto do filtro do vídeo entra, 0 a 1. Ausente = inteiro. */
  intensidadeFiltro?: number;
  /** Ajustes finos do vídeo inteiro (exposição, contraste, temperatura...). */
  ajustes?: Partial<AjustesCor>;
  /** Capa com o nome e o preço escritos por cima. Ausente = sim, quando há o que escrever. */
  capaMontada?: boolean;
  /** Presente exatamente quando `audios` está presente. */
  versao?: 2;
  /**
   * Os trechos de música e voz da linha do tempo. Quando existe, TODO o tempo de música e
   * voz mora aqui: `musica` é "nenhuma", `musicaVolume` é o padrão e `narracao` vem sem
   * `inicio` nem `volume`. O `efeitoSonoro` não muda.
   */
  audios?: ItemAudio[];
};

/**
 * A duração de cada EMENDA, na ordem. Uma por par de clipes -- e a tela final é o
 * último clipe, então a emenda que leva até ela sai da última cena.
 *
 * Existe porque a transição deixou de ser uma só pro vídeo inteiro: cada cena escolhe a
 * sua, e a conta do tempo total e das posições depende disso.
 */
export function emendasDoVideo(e: Pick<EspecVideo, "cenas" | "transicao" | "telaFinal">): { xfade: string; segundos: number }[] {
  const clipes = e.cenas.length + (e.telaFinal ? 1 : 0);
  const lista: { xfade: string; segundos: number }[] = [];
  for (let i = 0; i < clipes - 1; i++) {
    lista.push(TRANSICAO_POR_ID[ehTransicao(e.cenas[i]?.transicao ?? e.transicao)]);
  }
  return lista;
}

export const LIMITES = {
  cenasMax: 12,
  duracaoMin: 3,
  /** Tour 360 pode ser mais longo (tem cena de verdade pra mostrar), mas cada segundo
   *  custa ~7s de render local e mais no servidor; 10s é o teto que cabe na função. */
  duracaoMax360: 10,
  duracaoMax: 8,
  duracaoPadrao: 4,
  legendaMax: 40,
  tituloMax: 50,
  chamadaMax: 40,
  roteiroMax: 700,
  /** Quanto a voz pode atrasar. Mais que isso e a pessoa quer cortar o áudio, não atrasar. */
  vozInicioMax: 10,
  /** Voz gravada no navegador: acima disso o arquivo fica grande e a espera, longa. */
  vozSegundosMax: 180,
  musicaVolumePadrao: 0.8,
  /** Teto de quanto dá pra aparar do começo de um clipe. */
  aparaMax: 60,
  /** Três já é muito numa tela de celular; a quarta linha vira poluição. */
  textosPorCena: 3,
  /** Mesma conta dos textos: peça demais em cima do imóvel esconde o imóvel. */
  elementosPorCena: 3,
  /** Texto dentro de uma peça gráfica. Mais que isso não cabe no desenho. */
  elementoTextoMax: 26,
  /** Quantos dados da ficha cabem numa barra sem virar régua. */
  itensDaFichaMax: 5,
  textoMax: 44,
  /** Um vídeo de 60s narrado dá ~25 trechos; 120 é teto de segurança, não de uso. */
  trechosMax: 120,
  trechoMax: 90,
  telaFinalSegundos: 4,
  transicaoSegundos: 0.6,
  /** Correção de luz por cena. Acima disso a foto lava; abaixo, some. */
  luzMax: 0.25,
  velocidadeMin: 0.5,
  velocidadeMax: 2,
  /** Trechos de áudio na linha do tempo, somando música e voz. */
  audiosMax: 16,
  musicaPedacosMax: 8,
  vozPedacosMax: 8,
  /** Trecho de áudio mais curto que isso não se ouve nem se pega com o dedo. */
  audioMin: 0.3,
  fadeMax: 5,
  /** Até que segundo do arquivo dá pra cortar (voz gravada vai a 180s; folga pra arquivo enviado). */
  corteAudioMax: 600,
  /** Release 2: janela mínima de um texto ou peça dentro da cena. */
  janelaMin: 0.5,
};

// Créditos: SÓ onde há IA de verdade.
//
// O vídeo montado, o tour 360 e o terreno rodam no nosso servidor: custam CPU, não
// modelo pago. Cobrar por eles era desvantagem de percepção sem justificativa de custo
// -- a Pedra anuncia "vídeos, tours e plantas ilimitados" e cobra crédito só na imagem
// (varredura de 12/09/2026, docs/pedra-varredura-12-09.md). Aqui é igual, e a cena
// animada custa 2 contra os 5 deles.
export const CREDITOS = { base: 0, animada: 2, narracao: 1 };

export function custoDoVideo(e: Pick<EspecVideo, "cenas" | "narracao">): number {
  const animadas = e.cenas.filter((c) => c.tipo === "animada").length;
  // A voz da pessoa (gravada ou enviada) não passa por modelo nenhum: não cobra. A de IA que
  // já foi gravada e volta com o `arquivo` também não: o TTS não roda de novo. O saneador só
  // aceita esse `arquivo` no formato que o pipeline grava, e o pedido confere que ele é do
  // usuário e existe no bucket ANTES desta conta (lib/pedido-video.ts).
  return CREDITOS.base + animadas * CREDITOS.animada + (vozDeIA(e.narracao) && !e.narracao?.arquivo ? CREDITOS.narracao : 0);
}

/**
 * As durações que o editor oferece, por tipo de cena.
 *
 * Existe como lista exportada, e não solta dentro do JSX, porque um MODELO também
 * escolhe duração -- e modelo que põe o vídeo num estado que a tela não sabe mostrar
 * deixa o seletor da cena em branco e a pessoa sem caminho de volta. O servidor
 * arredonda pro inteiro mais próximo, então 5,5s virava 6s e o controle não tinha essa
 * opção: o vídeo saía certo e a tela mentia. Com a lista aqui, o teste dos modelos
 * confere contra o mesmo lugar de onde o seletor se desenha.
 */
export const DURACOES_CENA: Record<"foto" | "animada" | "tour360", number[]> = {
  foto: [3, 4, 5, 6, 8],
  // Cena animada para em 5s: 8s pedem 161 quadros ao modelo, o máximo que ele aceita,
  // e a espera passou de 8 minutos num teste real.
  animada: [3, 4, 5],
  tour360: [4, 6, 8, 10],
};

export function duracaoDaCena(c: Cena): number {
  const teto = c.tipo === "tour360" ? LIMITES.duracaoMax360 : LIMITES.duracaoMax;
  const d = c.duracao ?? (c.tipo === "tour360" ? 10 : LIMITES.duracaoPadrao);
  return Math.min(Math.max(d, LIMITES.duracaoMin), teto);
}

/**
 * A cena `i` é um clipe que CONTINUA na seguinte: o mesmo arquivo, a próxima começa no
 * segundo do arquivo em que esta termina, e a emenda entre as duas é corte seco. É o que
 * sai quando um vídeo longo entra na linha do tempo em partes (lib/clipes-do-editor.ts)
 * ou quando se divide um clipe e se escolhe "Corte": as partes emendam sem soluço, então
 * a montagem não segura o último quadro (o "pouso") nessas cenas.
 */
export function clipeContinua(e: Pick<EspecVideo, "cenas" | "transicao">, i: number): boolean {
  const a = e.cenas[i];
  const b = e.cenas[i + 1];
  if (!a || !b || a.tipo !== "clipe" || b.tipo !== "clipe" || !a.arquivo || a.arquivo !== b.arquivo) return false;
  if (a.congelar || b.congelar) return false;
  if (ehTransicao(a.transicao ?? e.transicao) !== "corte") return false;
  const fim = (a.inicio ?? 0) + duracaoDaCena(a) * (a.velocidade ?? 1);
  return Math.abs((b.inicio ?? 0) - fim) < 0.15;
}

export function duracaoEstimada(e: Pick<EspecVideo, "cenas" | "telaFinal" | "transicao">): number {
  return relogioDoEspec(e).total;
}

// ---------- O RELÓGIO DO VÍDEO ----------
//
// Fase 1 da linha do tempo com faixas (docs/planos/linha-do-tempo-faixas.md). Antes a
// linha do tempo somava as durações das cenas e a montagem descontava as emendas: numa
// sequência de 5 cenas com dissolver, a régua passava 2,4s do vídeo pronto e cada bloco
// aparecia fora do lugar. Agora régua, cabeçote, palco e montagem leem o MESMO relógio.

/** Quadros por segundo da montagem: o mesmo `-framerate` do ffmpeg. */
export const FPS = 24;

export type RelogioDoVideo = {
  /**
   * Cenas e, se entrar, a tela final. `inicio[k]` é onde o xfade põe o quadro 0 do clipe
   * k: o offset que o ffmpeg recebe (Σ(d−e), com 2 casas) arredondado PRA CIMA ao
   * quadro -- medido no 6.1.1, com offsets fracionários e exatos. `fim` = inicio + duração,
   * limitado ao total.
   */
  clipes: { inicio: number; fim: number }[];
  /** Sobreposição de cada emenda: de = início do clipe seguinte, ate = fim do anterior. */
  emendas: { transicao: TransicaoId; xfade: string; segundos: number; de: number; ate: number; linear: boolean }[];
  /** Fim da última CENA (a tela final não recebe texto nem peça). */
  fimDasCenas: number;
  /** Σd − Σe: o `-t` da montagem. */
  total: number;
};

/** Um relógio a partir das durações e das emendas, na ordem. */
export function relogioDoVideo(duracoes: number[], emendas: { xfade: string; segundos: number; id?: TransicaoId }[], cenas = duracoes.length): RelogioDoVideo {
  const n = duracoes.length;
  const somaDuracoes = duracoes.reduce((s, d) => s + d, 0);
  const somaEmendas = emendas.slice(0, Math.max(0, n - 1)).reduce((s, t) => s + t.segundos, 0);
  // Mesma conta, na mesma ordem, que a `duracaoEstimada` antiga e o `-t` da montagem:
  // mudar a ordem da soma muda o último centésimo, e o total é conferido contra o antigo.
  const total = Math.max(0, somaDuracoes - somaEmendas);
  const clipes: RelogioDoVideo["clipes"] = [];
  let acumulado = 0;
  for (let k = 0; k < n; k++) {
    if (k > 0) acumulado += duracoes[k - 1] - (emendas[k - 1]?.segundos ?? 0);
    const offset = Number(acumulado.toFixed(2));
    const inicio = k === 0 ? 0 : Math.ceil(offset * FPS - 1e-6) / FPS;
    clipes.push({ inicio, fim: Math.min(total, inicio + duracoes[k]) });
  }
  const lista: RelogioDoVideo["emendas"] = [];
  for (let k = 0; k < n - 1; k++) {
    const t = emendas[k];
    const transicao = t?.id ?? "dissolver";
    lista.push({
      transicao,
      xfade: t?.xfade ?? "dissolve",
      segundos: t?.segundos ?? LIMITES.transicaoSegundos,
      de: clipes[k + 1].inicio,
      ate: clipes[k].fim,
      linear: transicao === "corte" || transicao === "dissolver",
    });
  }
  const ultimaCena = Math.min(cenas, n) - 1;
  return { clipes, emendas: lista, fimDasCenas: ultimaCena >= 0 ? clipes[ultimaCena].fim : 0, total };
}

/** O relógio de um vídeo: cenas (com a duração que o servidor usa) e a tela final. */
export function relogioDoEspec(e: Pick<EspecVideo, "cenas" | "telaFinal" | "transicao">, telaFinalEntra = !!e.telaFinal): RelogioDoVideo {
  const duracoes = [...e.cenas.map(duracaoDaCena), ...(telaFinalEntra ? [LIMITES.telaFinalSegundos] : [])];
  return relogioDoVideo(duracoes, emendasDoVideo({ cenas: e.cenas, transicao: e.transicao, telaFinal: telaFinalEntra }), e.cenas.length);
}

/**
 * O vídeo tem coisa que só o EDITOR sabe mostrar e salvar.
 *
 * A página rápida (/videos) monta o espec de novo a partir do que ELA conhece; ao
 * "Editar" um vídeo feito no editor, ela salvava por cima sem textos, peças, legendas,
 * Você, filtros e ferramentas de corte -- apagava trabalho sem avisar. Com isto, a
 * página rápida manda esse vídeo pro editor.
 */
export function precisaDoEditor(e: Partial<EspecVideo> & { versao?: number; visuais?: unknown; audios?: unknown }): boolean {
  if (e.versao === 2 || e.visuais || e.audios || e.legendas || e.apresentador) return true;
  // A marca d'água só se configura no editor. Sem esta linha, reabrir na página rápida um
  // vídeo com marca e gerar de novo devolveria o vídeo SEM ela, calado -- que é o mesmo
  // buraco que textos, peças e legendas já tinham.
  if (e.marcaDagua) return true;
  if (e.efeitoSonoro && e.efeitoSonoro !== "nenhum") return true;
  // A página rápida não manda o campo, e o saneador o liga de novo.
  if (e.capaMontada === false) return true;
  if ((e.filtro && e.filtro !== "natural") || (e.ajustes && Object.keys(e.ajustes).length > 0)) return true;
  return (e.cenas ?? []).some(
    (c) =>
      (c.textos && c.textos.length > 0) ||
      (c.elementos && c.elementos.length > 0) ||
      !!c.transicao ||
      !!c.giro ||
      !!c.espelho ||
      (c.velocidade !== undefined && c.velocidade !== 1) ||
      !!c.congelar ||
      !!c.inicio ||
      !!c.filtro ||
      (c.ajustes && Object.keys(c.ajustes).length > 0) ||
      !!c.luz
  );
}

const ehId = <T extends string>(lista: { id: T }[], v: unknown): v is T => typeof v === "string" && lista.some((x) => x.id === v);

/** Número dentro da faixa, arredondado a centésimo. Fora, torto ou ausente: nada. */
function numeroEntre(v: unknown, min: number, max: number): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n)) * 100) / 100 : undefined;
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max) : "";
}

/**
 * Os ids de arte que existem, tirados do PRÓPRIO catálogo.
 *
 * Era uma lista copiada à mão. Lista copiada envelhece: um modelo novo em texto-arte.ts
 * passaria a ser recusado aqui, sem erro, e o texto sairia do vídeo sem ninguém saber
 * por quê. A volta do import é só de tipo, então não há ciclo em tempo de execução.
 */
const ARTES_VALIDAS = new Set([...MODELOS_ARTE.map((m) => m.id), ...IDS_EFEITOS_TEXTO]);

/** Cor hexa de 6 dígitos, sem "#". Qualquer outra coisa é descartada. */
function corHex(v: unknown): string | undefined {
  return typeof v === "string" && /^[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : undefined;
}

function limparVisual(b: Record<string, unknown>): VisualTexto {
  const n = Number(b.tamanho);
  return {
    ...(corHex(b.cor) ? { cor: corHex(b.cor) } : {}),
    ...(b.caixa === null ? { caixa: null } : corHex(b.caixa) ? { caixa: corHex(b.caixa) } : {}),
    ...(b.contorno === null ? { contorno: null } : corHex(b.contorno) ? { contorno: corHex(b.contorno) } : {}),
    ...(b.sombra === true ? { sombra: true } : {}),
    ...(Number.isFinite(n) && n > 0.005 && n < 0.2 ? { tamanho: n } : {}),
  };
}

/**
 * As peças gráficas de uma cena, limpas.
 *
 * O modelo tem que EXISTIR no catálogo, o texto tem teto, os itens da ficha só passam
 * com um ícone conhecido, e o tamanho fica entre 2% e 100% da altura. O que vier torto
 * some -- e o que vier de mais é cortado no limite, não recusa o vídeo inteiro.
 */
function limparElementos(bruto: unknown): ElementoCena[] | undefined {
  if (!Array.isArray(bruto)) return undefined;
  const lista: ElementoCena[] = [];
  for (const b of bruto.slice(0, LIMITES.elementosPorCena)) {
    const e = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const tam = Number(e.tamanho);
    const animacao = ANIMACOES_TEXTO.some((a) => a.id === e.animacao) ? (e.animacao as AnimacaoTexto) : "nenhuma";

    const xNum = Number(e.x);
    const yNum = Number(e.y);
    const posLivre = Number.isFinite(xNum) && Number.isFinite(yNum) ? { x: Math.min(100, Math.max(0, Math.round(xNum * 10) / 10)), y: Math.min(100, Math.max(0, Math.round(yNum * 10) / 10)) } : {};

    // Adesivo 3D: só existe se o id estiver no catálogo (que é o que tem arquivo no disco).
    // Não carrega texto nem cor -- é uma imagem pronta -- e nasce num canto de cima, que é
    // onde um selo de "novo" ou uma chave costuma ir.
    const adesivo = typeof e.id === "string" ? idDoAdesivo(e.id) : null;
    if (adesivo) {
      lista.push({
        id: `adesivo:${adesivo}`,
        ancora: ANCORAS.some((a) => a.id === e.ancora) ? (e.ancora as AncoraElemento) : "topo_dir",
        ...posLivre,
        ...(Number.isFinite(tam) && tam >= 0.04 && tam <= 0.5 ? { tamanho: Math.round(tam * 1000) / 1000 } : {}),
        animacao,
        ...(ehMovimento(e.movimento) && e.movimento !== "nenhum" && !ADESIVO_POR_ID[adesivo].animado ? { movimento: e.movimento } : {}),
      });
      continue;
    }

    // Clipe do Pexels: o id é o que vale (a montagem busca o arquivo pela API). A prévia só
    // passa se for endereço do Pexels -- o palco não toca URL qualquer vinda do navegador.
    const pexels = typeof e.id === "string" ? idDoPexels(e.id) : null;
    if (pexels) {
      const c = (e.clipe && typeof e.clipe === "object" ? e.clipe : {}) as Record<string, unknown>;
      const cl = Number(c.largura);
      const ca = Number(c.altura);
      lista.push({
        id: `pexels:${pexels}`,
        ancora: ANCORAS.some((a) => a.id === e.ancora) ? (e.ancora as AncoraElemento) : "base_dir",
        ...posLivre,
        ...(Number.isFinite(tam) && tam >= TAMANHO_CLIPE_MIN && tam <= TAMANHO_CLIPE_MAX ? { tamanho: Math.round(tam * 1000) / 1000 } : {}),
        animacao,
        ...(ehUrlDoPexels(c.previa) && cl > 0 && cl < 10000 && ca > 0 && ca < 10000
          ? { clipe: { previa: c.previa, largura: Math.round(cl), altura: Math.round(ca), autor: texto(c.autor, 80) ?? "", autorUrl: ehUrlDoPexels(c.autorUrl) ? c.autorUrl : "" } }
          : {}),
      });
      continue;
    }

    const modelo = typeof e.id === "string" ? ELEMENTO_POR_ID[e.id] : undefined;
    if (!modelo) continue;
    const conteudo = texto(e.texto, LIMITES.elementoTextoMax);
    // Modelo que vive de texto e chegou sem texto não desenha nada: some aqui em vez de
    // virar um retângulo vazio no meio do vídeo.
    if (modelo.usa === "texto" && !conteudo) continue;
    const itens: { icone: IconeFicha; texto: string }[] = [];
    if (modelo.usa === "ficha" && Array.isArray(e.itens)) {
      for (const bi of e.itens.slice(0, LIMITES.itensDaFichaMax)) {
        const i = (bi && typeof bi === "object" ? bi : {}) as Record<string, unknown>;
        const rotulo = texto(i.texto, LIMITES.elementoTextoMax);
        if (!rotulo) continue;
        if (i.icone === "quarto" || i.icone === "suite" || i.icone === "banheiro" || i.icone === "vaga" || i.icone === "area" || i.icone === "preco" || i.icone === "local") {
          itens.push({ icone: i.icone, texto: rotulo });
        }
      }
      if (!itens.length) continue;
    }
    lista.push({
      id: modelo.id,
      ...(conteudo ? { texto: conteudo } : {}),
      ...(itens.length ? { itens } : {}),
      ancora: ANCORAS.some((a) => a.id === e.ancora) ? (e.ancora as AncoraElemento) : modelo.ancora,
      ...posLivre,
      ...(Number.isFinite(tam) && tam >= 0.02 && tam <= 1 ? { tamanho: Math.round(tam * 1000) / 1000 } : {}),
      ...(typeof e.cor === "string" && /^#[0-9a-fA-F]{6}$/.test(e.cor) ? { cor: e.cor.toLowerCase() } : {}),
      animacao,
      // Moldura ocupa o quadro inteiro: balançar a moldura é balançar o vídeo.
      ...(ehMovimento(e.movimento) && e.movimento !== "nenhum" && !modelo.quadroInteiro ? { movimento: e.movimento } : {}),
    });
  }
  return lista.length ? lista : undefined;
}

function limparTextos(bruto: unknown): TextoCena[] | undefined {
  if (!Array.isArray(bruto)) return undefined;
  const lista: TextoCena[] = [];
  for (const b of bruto.slice(0, LIMITES.textosPorCena)) {
    const t = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
    const conteudo = texto(t.texto, LIMITES.textoMax);
    if (!conteudo) continue;
    const txNum = Number(t.x);
    const tyNum = Number(t.y);
    const tPosLivre = Number.isFinite(txNum) && Number.isFinite(tyNum) ? { x: Math.min(100, Math.max(0, Math.round(txNum * 10) / 10)), y: Math.min(100, Math.max(0, Math.round(tyNum * 10) / 10)) } : {};

    lista.push({
      texto: conteudo,
      posicao: POSICOES_TEXTO.some((p) => p.id === t.posicao) ? (t.posicao as PosicaoTexto) : "base",
      estilo: ESTILOS_TEXTO.some((e) => e.id === t.estilo) ? (t.estilo as EstiloTexto) : "faixa",
      animacao: ANIMACOES_TEXTO.some((a) => a.id === t.animacao) ? (t.animacao as AnimacaoTexto) : "nenhuma",
      ...tPosLivre,
      // A ARTE e o ACABAMENTO vinham sendo jogados fora aqui. O texto chegava ao
      // servidor só com posição, estilo e animação, então TODO modelo de texto virava
      // texto simples no vídeo -- sem erro, sem aviso, e sem aparecer em teste nenhum
      // que não passasse por esta função.
      ...(typeof t.arte === "string" && ARTES_VALIDAS.has(t.arte) ? { arte: t.arte } : {}),
      // O MOVIMENTO passa pelo mesmo lugar em que a arte já foi perdida uma vez: sem esta
      // linha o texto balança no palco e sai parado no vídeo.
      ...(typeof t.arte === "string" && ARTES_VALIDAS.has(t.arte) && ehMovimento(t.movimento) && t.movimento !== "nenhum" ? { movimento: t.movimento } : {}),
      ...(t.visual && typeof t.visual === "object" ? { visual: limparVisual(t.visual as Record<string, unknown>) } : {}),
    });
  }
  return lista.length ? lista : undefined;
}

/** O apresentador, limpo. Sem arquivo não existe -- o resto tem padrão. */
export function limparApresentador(bruto: unknown): Apresentador | null {
  const b = (bruto && typeof bruto === "object" ? bruto : null) as Record<string, unknown> | null;
  if (!b) return null;
  const arquivo = typeof b.arquivo === "string" && /^[\w./-]{1,200}$/.test(b.arquivo) && !b.arquivo.includes("..") ? b.arquivo : null;
  if (!arquivo) return null;
  const num = (v: unknown, padrao: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : padrao;
  };
  return {
    arquivo,
    formato: FORMATOS_APRESENTADOR.some((f) => f.id === b.formato) ? (b.formato as FormatoApresentador) : "canto",
    canto: CANTOS_APRESENTADOR.some((c) => c.id === b.canto) ? (b.canto as CantoApresentador) : "inferior_direito",
    tamanho: TAMANHOS_APRESENTADOR.some((t) => t.id === b.tamanho) ? (b.tamanho as TamanhoApresentador) : "medio",
    entra: num(b.entra, 0, 0, 120),
    duracao: b.duracao === undefined || b.duracao === null ? undefined : num(b.duracao, 8, 1, 60),
    inicio: num(b.inicio, 0, 0, LIMITES.aparaMax),
    volume: num(b.volume, 1, 0, 2),
    fundo: "manter",
  };
}

/**
 * A marca d'água, limpa. Nula quando não foi pedida.
 *
 * Não confere logo nenhum: quem monta é que vai ler `users.logo_path`, e quem não tem logo
 * recebe um aviso na montagem em vez de um espec recusado -- do contrário, apagar o logo
 * depois de gerar um vídeo tornaria aquele vídeo impossível de reabrir.
 */
export function limparMarcaDagua(bruto: unknown): MarcaDagua | null {
  const b = (bruto && typeof bruto === "object" ? bruto : null) as Record<string, unknown> | null;
  if (!b) return null;
  const o = Number(b.opacidade);
  return {
    // POSICOES_MARCA_DAGUA, não CANTOS_APRESENTADOR: o centro só existe aqui, e saneador
    // que valida contra a lista errada apaga em silêncio a opção que a tela oferece.
    canto: POSICOES_MARCA_DAGUA.some((c) => c.id === b.canto) ? (b.canto as PosicaoMarcaDagua) : "inferior_direito",
    tamanho: TAMANHOS_MARCA_DAGUA.some((t) => t.id === b.tamanho) ? (b.tamanho as TamanhoMarcaDagua) : "media",
    // Piso em 0,15: abaixo disso não se enxerga nada e o vídeo sai "sem marca" com a
    // pessoa achando que pôs uma.
    opacidade: Number.isFinite(o) ? Math.min(1, Math.max(0.15, Math.round(o * 100) / 100)) : OPACIDADE_MARCA_DAGUA_PADRAO,
  };
}

/**
 * Os trechos de legenda, limpos e em ordem.
 *
 * Trecho sem texto, com tempo invertido ou de duração zero é descartado: um deles
 * sozinho já derruba o filtro do ffmpeg, e a transcrição às vezes devolve exatamente
 * isso no fim do áudio.
 */
export function limparLegendas(bruto: unknown): Legendas | null {
  const b = (bruto && typeof bruto === "object" ? bruto : null) as Record<string, unknown> | null;
  if (!b) return null;
  const crus = Array.isArray(b.trechos) ? b.trechos : [];
  const trechos: TrechoLegenda[] = [];
  for (const c of crus.slice(0, LIMITES.trechosMax)) {
    const t = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const inicio = Number(t.inicio);
    const fim = Number(t.fim);
    const conteudo = texto(t.texto, LIMITES.trechoMax);
    if (!conteudo || !Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio || inicio < 0) continue;
    trechos.push({ inicio: Math.round(inicio * 100) / 100, fim: Math.round(fim * 100) / 100, texto: conteudo });
  }
  if (!trechos.length) return null;
  trechos.sort((x, y) => x.inicio - y.inicio);
  return {
    trechos,
    estilo: ESTILOS_LEGENDA.some((e) => e.id === b.estilo) ? (b.estilo as EstiloLegenda) : "faixa",
    posicao: b.posicao === "centro" ? "centro" : "base",
  };
}

/**
 * Os textos que a cena desenha, na ordem: a legenda primeiro, depois os outros.
 *
 * A legenda continua sendo um campo só dela porque é o texto que quase toda cena tem, e
 * pedir "adicione um texto" pra escrever "Sala de estar" seria burocracia. Mas ela é
 * DESENHADA pelo mesmo caminho dos outros -- um motor de texto só, não dois.
 */
export function textosDaCena(c: Pick<Cena, "legenda" | "textos">): TextoCena[] {
  const daLegenda: TextoCena[] = c.legenda ? [{ texto: c.legenda, posicao: "base", estilo: "faixa", animacao: "nenhuma" }] : [];
  return [...daLegenda, ...(c.textos ?? [])].slice(0, LIMITES.textosPorCena + 1);
}

/** Id de trecho de áudio: 8 letras minúsculas ou dígitos. */
const ID_AUDIO = /^[a-z0-9]{8}$/;

/**
 * A voz de IA que o pipeline já gravou (VP:517). É o único `arquivo` aceito numa narração
 * de IA: qualquer outro caminho seria o navegador escolhendo um arquivo pra não pagar a voz.
 */
const ARQUIVO_VOZ_IA = /^uploads\/[0-9a-f-]{36}\/voz-[0-9a-f-]{36}\.mp3$/;

/** Pelo segundo no vídeo, música antes de voz, e o id desempata. */
function ordemDosAudios(a: ItemAudio, b: ItemAudio): number {
  if (a.noVideo !== b.noVideo) return a.noVideo - b.noVideo;
  if (a.fonte.tipo !== b.fonte.tipo) return a.fonte.tipo === "musica" ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Centésimos inteiros: compara somas de valores com 2 casas sem o ruído do ponto flutuante. */
const centesimos = (v: number) => Math.round(v * 100);

/**
 * Os trechos de áudio da linha do tempo, limpos e em ordem.
 *
 * Trecho torto some com aviso, e não derruba o vídeo: tipo desconhecido, voz num vídeo sem
 * narração, trecho que começa depois do fim. Trecho DEMAIS derruba, com erro -- cortar
 * calado o nono pedaço de música seria entregar outro vídeo.
 *
 * Os ids são dados depois da limpeza: um id válido nunca é trocado, e um gerado nunca
 * toma o lugar de um válido que vem mais adiante na lista.
 */
export function limparAudios(bruto: unknown, total: number, temNarracao: boolean): { audios: ItemAudio[]; avisos: string[]; erro: string | null } {
  if (!Array.isArray(bruto)) return { audios: [], avisos: [], erro: null };
  const avisos: string[] = [];
  // Um aviso por motivo, não por trecho: mil trechos tortos não viram mil linhas guardadas.
  const avisar = (m: string) => {
    if (!avisos.includes(m)) avisos.push(m);
  };
  // O fim do vídeo em centésimos: `total − audioMin` direto dá 14,899999… e derrubaria o
  // trecho posto exatamente no último lugar permitido.
  const ultimoInicio = Math.round((total - LIMITES.audioMin) * 100) / 100;
  const limpos: { indice: number; idBruto: unknown; item: Omit<ItemAudio, "id"> }[] = [];
  for (let i = 0; i < bruto.length; i++) {
    const b = (bruto[i] && typeof bruto[i] === "object" ? bruto[i] : {}) as Record<string, unknown>;
    const f = (b.fonte && typeof b.fonte === "object" ? b.fonte : {}) as Record<string, unknown>;
    let fonte: FonteAudio;
    if (f.tipo === "musica" && ehId(MUSICAS, f.id) && MUSICA_POR_ID[f.id].arquivo) fonte = { tipo: "musica", id: f.id as Exclude<MusicaId, "nenhuma"> };
    else if (f.tipo === "voz") fonte = { tipo: "voz" };
    else {
      avisar("Um trecho de áudio de tipo desconhecido foi ignorado.");
      continue;
    }
    if (fonte.tipo === "voz" && !temNarracao) {
      avisar("Um trecho de voz foi ignorado: o vídeo não tem narração.");
      continue;
    }
    const noVideo = numeroEntre(b.noVideo, 0, total) ?? 0;
    if (noVideo > ultimoInicio) {
      avisar("Um trecho de áudio começava depois do fim do vídeo e ficou de fora.");
      continue;
    }
    const corteArquivo = numeroEntre(b.corteArquivo, 0, LIMITES.corteAudioMax) ?? 0;
    const duracao = b.duracao === null || b.duracao === undefined ? undefined : numeroEntre(b.duracao, LIMITES.audioMin, LIMITES.corteAudioMax);
    const volume = fonte.tipo === "musica" ? (numeroEntre(b.volume, 0, 1) ?? LIMITES.musicaVolumePadrao) : (numeroEntre(b.volume, 0, 2) ?? 1);
    let fadeEntrada = numeroEntre(b.fadeEntrada, 0, LIMITES.fadeMax) ?? 0;
    let fadeSaida = numeroEntre(b.fadeSaida, 0, LIMITES.fadeMax) ?? 0;
    // Fades que não cabem no trecho encolhem na mesma proporção, arredondados PRA BAIXO (o
    // épsilon só impede 0,29·100 = 28,999… de virar 0,28).
    if (duracao !== undefined && centesimos(fadeEntrada + fadeSaida) > centesimos(duracao)) {
      const k = duracao / (fadeEntrada + fadeSaida);
      fadeEntrada = Math.floor(fadeEntrada * k * 100 + 1e-6) / 100;
      fadeSaida = Math.floor(fadeSaida * k * 100 + 1e-6) / 100;
    }
    limpos.push({
      indice: i,
      idBruto: b.id,
      item: {
        fonte,
        noVideo,
        corteArquivo,
        ...(duracao !== undefined ? { duracao } : {}),
        volume,
        fadeEntrada,
        fadeSaida,
        ...(fonte.tipo === "musica" ? { laco: b.laco !== false } : {}),
      },
    });
  }

  const musicas = limpos.filter((l) => l.item.fonte.tipo === "musica").length;
  const vozes = limpos.length - musicas;
  if (musicas > LIMITES.musicaPedacosMax) return { audios: [], avisos, erro: `No máximo ${LIMITES.musicaPedacosMax} trechos de música.` };
  if (vozes > LIMITES.vozPedacosMax) return { audios: [], avisos, erro: `No máximo ${LIMITES.vozPedacosMax} trechos de voz.` };
  if (limpos.length > LIMITES.audiosMax) return { audios: [], avisos, erro: `No máximo ${LIMITES.audiosMax} trechos de áudio.` };

  const usados = new Set<string>();
  const validos = limpos.map((l) => {
    if (typeof l.idBruto !== "string" || !ID_AUDIO.test(l.idBruto) || usados.has(l.idBruto)) return null;
    usados.add(l.idBruto);
    return l.idBruto;
  });
  const audios: ItemAudio[] = limpos.map((l, k) => {
    let id = validos[k];
    if (id === null) {
      // "a" + a posição na lista que chegou, subindo até achar um livre.
      let n = l.indice;
      do id = "a" + String(n++).padStart(7, "0");
      while (usados.has(id));
      usados.add(id);
    }
    return { id, ...l.item };
  });
  audios.sort(ordemDosAudios);
  return { audios, avisos, erro: null };
}

/**
 * Os trechos de áudio de QUALQUER espec: a lista, quando existe; senão, o que o formato
 * antigo quer dizer, com os números da montagem antiga (FF:794, FF:907-921) -- música do
 * 0 com fade 1s/2s em laço, voz em `inicio` (0,7 quando ausente).
 */
export function itensDeAudioDoEspec(e: Pick<EspecVideo, "audios" | "musica" | "musicaVolume" | "narracao">): ItemAudio[] {
  if (e.audios) return e.audios.map((a) => ({ ...a, fonte: { ...a.fonte } }));
  const itens: ItemAudio[] = [];
  if (e.musica !== "nenhuma" && MUSICA_POR_ID[e.musica]?.arquivo) {
    itens.push({ id: "musica00", fonte: { tipo: "musica", id: e.musica }, noVideo: 0, corteArquivo: 0, volume: e.musicaVolume ?? LIMITES.musicaVolumePadrao, fadeEntrada: 1, fadeSaida: 2, laco: true });
  }
  if (e.narracao) {
    itens.push({ id: "voz00000", fonte: { tipo: "voz" }, noVideo: e.narracao.inicio ?? 0.7, corteArquivo: 0, volume: e.narracao.volume ?? 1, fadeEntrada: 0, fadeSaida: 0 });
  }
  return itens;
}

/** O trecho de voz que uma narração nova ganha: o mesmo lugar da voz no formato antigo. Copie antes de mudar. */
export const VOZ_PADRAO: ItemAudio = Object.freeze({ id: "voz00000", fonte: Object.freeze({ tipo: "voz" as const }), noVideo: 0.7, corteArquivo: 0, volume: 1, fadeEntrada: 0, fadeSaida: 0 });

/**
 * Os trechos cabem no formato antigo sem perder nada?
 *
 * No máximo uma música, do 0, sem corte, até o fim, em laço, fade 1s/2s e volume 0 a 1; no
 * máximo uma voz, sem corte, até o fim, sem fade, começando entre 0 e 10s em décimos e com
 * volume 0,2 a 2. São exatamente os valores que o saneador antigo guarda sem mexer -- por
 * isso o vídeo que volta ao formato antigo sai do saneador igual de novo.
 */
export function ehAudioLegado(itens: ItemAudio[]): boolean {
  const musicas = itens.filter((x) => x.fonte.tipo === "musica");
  const vozes = itens.filter((x) => x.fonte.tipo === "voz");
  if (musicas.length > 1 || vozes.length > 1) return false;
  const m = musicas[0];
  if (m && !(m.noVideo === 0 && m.corteArquivo === 0 && m.duracao === undefined && m.laco !== false && m.fadeEntrada === 1 && m.fadeSaida === 2 && m.volume >= 0 && m.volume <= 1)) return false;
  const z = vozes[0];
  if (
    z &&
    !(z.corteArquivo === 0 && z.duracao === undefined && z.fadeEntrada === 0 && z.fadeSaida === 0 && z.noVideo >= 0 && z.noVideo <= LIMITES.vozInicioMax && Math.round(z.noVideo * 10) / 10 === z.noVideo && z.volume >= 0.2 && z.volume <= 2)
  ) {
    return false;
  }
  return true;
}

/** A narração sem o tempo: IA `{origem, roteiro, voz, arquivo?}`; gravada ou enviada `{origem, arquivo}` (a ordem de V:1245/1249). */
function narracaoSemTempo(n: Narracao): Narracao {
  return vozDeIA(n) ? { origem: "ia", roteiro: n.roteiro, voz: n.voz, ...(n.arquivo ? { arquivo: n.arquivo } : {}) } : { origem: n.origem, arquivo: n.arquivo };
}

/**
 * A forma CANÔNICA do áudio, a mesma no saneador e no editor.
 *
 * O que cabe no formato antigo volta pra ele (`musica`, `narracao.inicio`/`volume`, sem
 * `audios`): abrir um vídeo antigo e salvar sem mexer no áudio devolve o espec de antes,
 * byte a byte, e a montagem antiga continua valendo pra ele. O resto vira versao 2.
 */
export function canonizarAudio(o: { itens: ItemAudio[]; narracao: Narracao | null; musicaVolume: number }): {
  musica: MusicaId;
  musicaVolume: number;
  narracao: Narracao | null;
  audios?: ItemAudio[];
  versao?: 2;
} {
  const musicas = o.itens.filter((x) => x.fonte.tipo === "musica");
  // Sem narração, trecho de voz não tem de onde tocar. Narração sem trecho de voz é caminho
  // só de defesa: o editor apaga a narração junto com a última voz.
  let n = o.narracao;
  const vozes = n ? o.itens.filter((x) => x.fonte.tipo === "voz") : [];
  if (n && vozes.length === 0) n = null;
  if (ehAudioLegado([...musicas, ...vozes])) {
    const m = musicas[0];
    return {
      musica: m && m.fonte.tipo === "musica" ? m.fonte.id : "nenhuma",
      musicaVolume: m?.volume ?? o.musicaVolume,
      narracao: n && { ...narracaoSemTempo(n), volume: vozes[0].volume, inicio: vozes[0].noVideo },
    };
  }
  return {
    musica: "nenhuma",
    musicaVolume: LIMITES.musicaVolumePadrao,
    narracao: n && narracaoSemTempo(n),
    audios: [...musicas, ...vozes].sort(ordemDosAudios),
    versao: 2,
  };
}

/**
 * Valida e limpa o pedido vindo do navegador. Devolve o espec pronto ou uma mensagem
 * de erro em português. Nunca confia no que veio: os textos vão pro drawtext e o
 * roteiro vai pro TTS.
 *
 * `avisos` diz o que foi descartado sem derrubar o vídeo (hoje, só nos trechos de áudio).
 */
export function limparEspec(bruto: unknown): { espec: EspecVideo; erro: null; avisos: string[] } | { espec: null; erro: string; avisos?: undefined } {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const avisos: string[] = [];
  if (!ehId(FORMATOS, b.formato)) return { espec: null, erro: "Escolha o formato do vídeo." };
  const cenasBrutas = Array.isArray(b.cenas) ? b.cenas : [];
  if (cenasBrutas.length === 0) return { espec: null, erro: "Adicione pelo menos uma foto." };
  if (cenasBrutas.length > LIMITES.cenasMax) return { espec: null, erro: `No máximo ${LIMITES.cenasMax} cenas por vídeo.` };

  const cenas: Cena[] = [];
  for (const cb of cenasBrutas) {
    const c = (cb && typeof cb === "object" ? cb : {}) as Record<string, unknown>;
    const tipo = c.tipo;
    if (tipo !== "foto" && tipo !== "antes_depois" && tipo !== "clipe" && tipo !== "animada" && tipo !== "tour360") return { espec: null, erro: "Cena com tipo desconhecido." };
    const jobId = typeof c.jobId === "string" && /^[0-9a-f-]{36}$/.test(c.jobId) ? c.jobId : undefined;
    const arquivo = typeof c.arquivo === "string" && /^[\w./-]{1,200}$/.test(c.arquivo) && !c.arquivo.includes("..") ? c.arquivo : undefined;
    if (tipo === "antes_depois" && !jobId) return { espec: null, erro: "Antes e depois precisa de uma geração do Encena." };
    if (tipo === "clipe" && !arquivo) return { espec: null, erro: "Cena de clipe sem arquivo." };
    if (tipo === "tour360" && !arquivo) return { espec: null, erro: "Cena 360 sem arquivo. Envie a foto ou o vídeo 360." };
    if ((tipo === "foto" || tipo === "animada") && !jobId && !arquivo) return { espec: null, erro: "Cena sem foto." };
    const duracaoNum = Number(c.duracao);
    const teto = tipo === "tour360" ? LIMITES.duracaoMax360 : LIMITES.duracaoMax;
    const padrao = tipo === "tour360" ? 10 : LIMITES.duracaoPadrao;
    const inicioNum = Number(c.inicio);
    const luzNum = Number(c.luz);
    const velNum = Number(c.velocidade);
    // Velocidade, congelar e aparar só existem onde há vídeo correndo. Numa foto a
    // "velocidade" seria a duração, que já tem campo -- dois jeitos de dizer a mesma
    // coisa acabam em desacordo.
    const comVideo = temVideoCorrendo(tipo);
    cenas.push({
      tipo,
      jobId,
      arquivo,
      inicio: Number.isFinite(inicioNum) && inicioNum > 0 ? Math.min(LIMITES.aparaMax, Math.round(inicioNum * 10) / 10) : undefined,
      transicao: c.transicao === undefined || c.transicao === null ? undefined : ehTransicao(c.transicao),
      efeito: ehId(EFEITOS, c.efeito) ? c.efeito : "aproximar",
      animacao: tipo === "animada" ? (ehId(ANIMACOES, c.animacao) ? c.animacao : "caminhar") : undefined,
      movimento: tipo === "tour360" ? (ehId(MOVIMENTOS_360, c.movimento) ? c.movimento : "olhar_volta") : undefined,
      legenda: texto(c.legenda, LIMITES.legendaMax) || undefined,
      textos: limparTextos(c.textos),
      elementos: limparElementos(c.elementos),
      duracao: Number.isFinite(duracaoNum) ? Math.min(Math.max(Math.round(duracaoNum), LIMITES.duracaoMin), teto) : padrao,
      melhorar: tipo === "clipe" ? c.melhorar === true : undefined,
      // Ausente = herda o do vídeo. `natural` explícito na cena é uma escolha: "esta
      // cena NÃO leva o acabamento das outras".
      filtro: c.filtro === undefined || c.filtro === null || c.filtro === "" ? undefined : filtroValido(c.filtro),
      intensidade: numeroEntre(c.intensidade, 0, 1),
      ajustes: limparAjustes(c.ajustes),
      luz: Number.isFinite(luzNum) && Math.abs(luzNum) > 0.005 ? Math.min(LIMITES.luzMax, Math.max(-LIMITES.luzMax, Math.round(luzNum * 100) / 100)) : undefined,
      // 360 fica de fora do giro: a imagem é uma esfera aberta em retângulo, girar o
      // retângulo não gira a câmera -- deita o mundo. O movimento da câmera é o campo
      // `movimento`, que é onde isso se resolve de verdade.
      giro: tipo !== "tour360" && ehGiro(c.giro) ? ehGiro(c.giro) : undefined,
      espelho: tipo !== "tour360" && c.espelho === true ? true : undefined,
      velocidade: comVideo && Number.isFinite(velNum) && velNum !== 1 ? Math.min(LIMITES.velocidadeMax, Math.max(LIMITES.velocidadeMin, Math.round(velNum * 10) / 10)) : undefined,
      congelar: comVideo && c.congelar === true ? true : undefined,
    });
  }

  let musica: MusicaId = ehId(MUSICAS, b.musica) ? b.musica : "nenhuma";
  const volumeMusica = Number(b.musicaVolume);
  let musicaVolume = Number.isFinite(volumeMusica) ? Math.min(1, Math.max(0, volumeMusica)) : LIMITES.musicaVolumePadrao;

  let narracao: EspecVideo["narracao"] = null;
  if (b.narracao && typeof b.narracao === "object") {
    const n = b.narracao as Record<string, unknown>;
    // Espec gravado antes da voz própria não tem `origem`, e era sempre IA.
    const origem: OrigemVoz = n.origem === "gravada" || n.origem === "enviada" ? n.origem : "ia";
    const vol = Number(n.volume);
    const ini = Number(n.inicio);
    const comum = {
      volume: Number.isFinite(vol) ? Math.min(2, Math.max(0.2, vol)) : 1,
      inicio: Number.isFinite(ini) ? Math.min(LIMITES.vozInicioMax, Math.max(0, Math.round(ini * 10) / 10)) : 0.7,
    };
    if (origem === "ia") {
      const roteiro = texto(n.roteiro, LIMITES.roteiroMax);
      // Voz de IA já gravada, pra reaproveitar: só no formato que o pipeline grava. Linha
      // antiga nunca traz `arquivo` numa narração de IA, então ela sai daqui igual.
      const arquivo = typeof n.arquivo === "string" && ARQUIVO_VOZ_IA.test(n.arquivo) ? n.arquivo : undefined;
      if (roteiro.length >= 10) narracao = { origem, roteiro, voz: ehId(VOZES, n.voz) ? n.voz : "laura", ...(arquivo ? { arquivo } : {}), ...comum };
    } else {
      // Mesma regra dos arquivos de cena: só caminho do bucket, sem subir de pasta.
      const arquivo = typeof n.arquivo === "string" && /^[\w./-]{1,200}$/.test(n.arquivo) && !n.arquivo.includes("..") ? n.arquivo : undefined;
      if (arquivo) narracao = { origem, arquivo, ...comum };
    }
  }

  // Áudio em trechos, SÓ quando o pedido traz a lista. Sem ela nada daqui roda e o espec
  // sai byte a byte igual ao de antes (scripts/testar-saneador-linha.ts, I4). `b.versao`
  // nunca é lido: a versão sai do que os trechos são, não do que o navegador diz.
  let c: ReturnType<typeof canonizarAudio> | undefined;
  if (Array.isArray(b.audios)) {
    const relogio = relogioDoEspec({ cenas, transicao: ehTransicao(b.transicao), telaFinal: b.telaFinal !== false });
    const trechos = limparAudios(b.audios, relogio.total, !!narracao);
    if (trechos.erro) return { espec: null, erro: trechos.erro };
    avisos.push(...trechos.avisos);
    if (narracao && !trechos.audios.some((a) => a.fonte.tipo === "voz")) {
      narracao = null;
      avisos.push("A narração estava ligada, mas sem trecho de voz na linha do tempo: o vídeo sai sem voz.");
    }
    c = canonizarAudio({ itens: trechos.audios, narracao, musicaVolume });
    musica = c.musica;
    musicaVolume = c.musicaVolume;
    narracao = c.narracao;
  }

  // Capa fora da lista (cena removida depois de escolhida) volta pra primeira, sem erro:
  // é o que a pessoa esperaria, e não vale travar o vídeo por isso.
  const capaNum = Number(b.capa);
  const capa = Number.isInteger(capaNum) && capaNum >= 0 && capaNum < cenas.length ? capaNum : 0;

  return {
    espec: {
      formato: b.formato,
      cenas,
      musica,
      musicaVolume,
      narracao,
      titulo: texto(b.titulo, LIMITES.tituloMax),
      preco: texto(b.preco, 30),
      local: texto(b.local, 50),
      telaFinal: b.telaFinal !== false,
      chamada: texto(b.chamada, LIMITES.chamadaMax),
      transicao: ehTransicao(b.transicao),
      capa,
      legendas: limparLegendas(b.legendas),
      apresentador: limparApresentador(b.apresentador),
      marcaDagua: limparMarcaDagua(b.marcaDagua),
      filtro: filtroValido(b.filtro),
      intensidadeFiltro: numeroEntre(b.intensidadeFiltro, 0, 1),
      ajustes: limparAjustes(b.ajustes),
      capaMontada: b.capaMontada !== false,
      efeitoSonoro: EFEITOS_SONOROS.some((e) => e.id === b.efeitoSonoro) ? (b.efeitoSonoro as EfeitoSonoroId) : "nenhum",
      ...(c?.audios ? { audios: c.audios, versao: 2 as const } : {}),
    },
    erro: null,
    avisos,
  };
}
