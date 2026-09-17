// Especs de vídeo como o navegador manda HOJE, antes da linha do tempo com áudio em blocos
// (docs/planos/linha-do-tempo-spec.md, pacote P0 e seção F1, "Old specs").
//
// Duas coisas moram aqui:
//
//   1. ESPECS_ANTIGAS: casos escritos à mão, com nome, no formato que o editor
//      (editor-video.tsx) e a página rápida (videos/page.tsx) montam -- ids reais de
//      catálogo, caminhos de upload no formato do /api/video/upload, jobIds de uuid;
//   2. especsSorteadas(): 300 especs sorteados com semente fixa, no estilo de
//      scripts/testar-relogio.ts, cobrindo também valor torto e fora de faixa.
//
// scripts/gravar-especs-fixtures.ts passa os dois pelo saneador de hoje e grava o
// resultado em especs-saneadas-antes.json: é a prova do ANTES de que um espec sem `audios`
// sai do saneador byte a byte igual depois da mudança (invariante I4).
//
// NÃO MEXER nos casos nem na ORDEM dos sorteios depois de gravado: o JSON é o saneador
// aplicado a exatamente estas entradas. Caso novo entra em outro arquivo.
//
// As listas de ids estão escritas aqui, e não lidas dos catálogos, de propósito: um id
// novo no catálogo mudaria os sorteios, e a prova deixaria de ser a mesma entrada.

const USUARIO = "7c2e9f4a-3b6d-4d1e-8a5f-1e0b9c7d2a64";
const JOBS = [
  "b3f1c9e2-6a4d-4f8b-9e1c-2d7a5b8c0f13",
  "4e8a2d6c-1f3b-4c9e-8a7d-5b0f2e9c6a31",
  "9d1c7e3a-5b2f-4a8d-b6e0-3c9f1a7d4e52",
  "c6a0e4b8-2d9f-4e1a-9c3b-7f5d8a2e1b94",
  "1a5f3d9c-7e2b-4b6a-8d4f-9e0c3b7a5d26",
  "e2b8c4f6-9a1d-4c7e-a3b5-6d0f8e2c9a47",
];
const upload = (uuid: string, ext: string) => `uploads/${USUARIO}/${uuid}.${ext}`;

const ROTEIRO = "Apartamento de três quartos no Setor Bueno, com varanda gourmet e vista para o parque. Agende sua visita.";

type Espec = Record<string, unknown>;

/** O espec como o editor completo monta (EV:423-456), com o que costuma vir por padrão. */
function doEditor(extra: Espec = {}): Espec {
  return {
    formato: "9:16",
    cenas: [
      { tipo: "foto", jobId: JOBS[0], efeito: "aproximar", legenda: "Sala de estar", duracao: 4 },
      { tipo: "foto", jobId: JOBS[1], efeito: "direita", duracao: 5 },
      { tipo: "antes_depois", jobId: JOBS[2], efeito: "aproximar", duracao: 6 },
    ],
    musica: "calma",
    musicaVolume: 0.8,
    narracao: null,
    titulo: "Apto 302 no Setor Bueno",
    preco: "R$ 690.000",
    local: "Setor Bueno, Goiânia",
    telaFinal: true,
    chamada: "Agende sua visita",
    transicao: "dissolver",
    capa: 0,
    legendas: null,
    apresentador: null,
    filtro: "natural",
    capaMontada: true,
    efeitoSonoro: "nenhum",
    ...extra,
  };
}

const FRASES = ["Sala ampla e iluminada", "Cozinha planejada", "Suíte com closet", "Varanda gourmet", "Vista para o parque", "Duas vagas cobertas", "Condomínio com piscina", "Perto do metrô"];

export const ESPECS_ANTIGAS: Record<string, Espec> = {
  musica_so: doEditor({ musica: "elegante" }),
  musica_nenhuma_volume_0_3: doEditor({ musica: "nenhuma", musicaVolume: 0.3 }),

  voz_ia_inicio_0: doEditor({ narracao: { origem: "ia", roteiro: ROTEIRO, voz: "laura", volume: 1, inicio: 0 } }),
  voz_ia_inicio_3_3: doEditor({ narracao: { origem: "ia", roteiro: ROTEIRO, voz: "daniel", volume: 1.2, inicio: 3.3 } }),
  voz_ia_inicio_10: doEditor({ musica: "sereno", musicaVolume: 0.55, narracao: { origem: "ia", roteiro: ROTEIRO, voz: "sarah", volume: 0.8, inicio: 10 } }),
  // Linha gravada antes da voz própria: sem `origem`, sem volume e sem início (V:1236).
  voz_ia_sem_origem: doEditor({ narracao: { roteiro: ROTEIRO, voz: "george" } }),

  voz_gravada_volume_0_2: doEditor({ narracao: { origem: "gravada", arquivo: upload("5f2a8c1e-9d3b-4e7a-b2c6-0e8d4f1a7c35", "webm"), volume: 0.2, inicio: 0.7 } }),
  voz_gravada_volume_2: doEditor({ musica: "aconchego", narracao: { origem: "gravada", arquivo: upload("a8d3f1b6-4c2e-4a9d-8f7b-3e1c6a0d9b28", "mp4"), volume: 2, inicio: 1.5 } }),
  // Volume do controle deslizante, sem arredondar (V:1230).
  voz_enviada_musica_volume_0_8333: doEditor({ musicaVolume: 0.8333, narracao: { origem: "enviada", arquivo: upload("3c7e0a9d-2b5f-4d8c-a1e6-9f4b2d7c0e81", "mp3"), volume: 1, inicio: 0.7 } }),

  voce_rodape_inicio_0: doEditor({
    apresentador: { arquivo: upload("d4b9e2a7-6c1f-4e3b-9a8d-2f5c7e0b1a63", "mp4"), formato: "rodape", canto: "inferior_direito", tamanho: "medio", entra: 0, inicio: 0, volume: 1, fundo: "manter" },
  }),
  voce_circulo_entra_6_8_inicio_1: doEditor({
    narracao: { origem: "ia", roteiro: ROTEIRO, voz: "laura", volume: 1, inicio: 0.7 },
    apresentador: { arquivo: upload("6e1a4c8f-3d7b-4b2e-8c9a-5f0d3b6e2a14", "mp4"), formato: "circulo", canto: "inferior_direito", tamanho: "grande", entra: 6.8, inicio: 1, volume: 1.3, fundo: "manter" },
  }),
  voce_duracao_5: doEditor({
    apresentador: { arquivo: upload("0b7d3e9a-8f2c-4a6d-b5e1-4c9a7f2d0e36", "webm"), formato: "canto", canto: "superior_esquerdo", tamanho: "pequeno", entra: 2, duracao: 5, inicio: 0.5, volume: 0, fundo: "manter" },
  }),

  legendas_40: doEditor({
    narracao: { origem: "gravada", arquivo: upload("8a2f6d0c-1e9b-4c3a-9d7e-6b4f0a8c2e59", "webm"), volume: 1, inicio: 0.7 },
    legendas: {
      trechos: Array.from({ length: 40 }, (_, i) => ({ inicio: Math.round((0.7 + i * 0.9) * 100) / 100, fim: Math.round((0.7 + i * 0.9 + 0.85) * 100) / 100, texto: `${FRASES[i % FRASES.length]} (${i + 1})` })),
      estilo: "contorno",
      posicao: "base",
    },
  }),
  efeito_clique_sem_musica_sem_voz: doEditor({ musica: "nenhuma", efeitoSonoro: "clique" }),
  tela_final_desligada: doEditor({ telaFinal: false, chamada: "" }),

  doze_cenas_transicoes_mistas: doEditor({
    transicao: "deslizar",
    musica: "cinematografica",
    filtro: "quente",
    intensidadeFiltro: 0.7,
    ajustes: { exposicao: 0.2, contraste: 0.1 },
    capa: 4,
    cenas: [
      { tipo: "foto", jobId: JOBS[0], efeito: "aproximar", legenda: "Fachada", duracao: 4, transicao: "corte" },
      { tipo: "foto", jobId: JOBS[1], efeito: "esquerda", duracao: 3 },
      { tipo: "animada", jobId: JOBS[2], efeito: "aproximar", animacao: "drone", duracao: 5, transicao: "aproximar" },
      { tipo: "foto", jobId: JOBS[3], efeito: "afastar", duracao: 6, transicao: "desfoque", filtro: "natural" },
      { tipo: "antes_depois", jobId: JOBS[4], efeito: "aproximar", duracao: 6, transicao: "dissolver" },
      { tipo: "tour360", arquivo: upload("f3c8a1d6-7b4e-4f2a-9c5d-1e8b3a6f0d72", "jpg"), efeito: "aproximar", movimento: "revelar", duracao: 10 },
      { tipo: "clipe", arquivo: upload("2d6b9f3e-0a7c-4e1d-8b4a-7c3e9d1f5a08", "mp4"), efeito: "aproximar", duracao: 5, melhorar: false, transicao: "corte" },
      { tipo: "foto", jobId: JOBS[5], efeito: "cima", duracao: 4, luz: 0.12, filtro: "vibrante", intensidade: 0.5 },
      { tipo: "foto", jobId: JOBS[0], efeito: "baixo", duracao: 4, giro: 180, transicao: "deslizar" },
      { tipo: "foto", jobId: JOBS[1], efeito: "parado", duracao: 8, espelho: true, ajustes: { temperatura: -0.3 } },
      { tipo: "animada", jobId: JOBS[3], efeito: "aproximar", animacao: "caminhar", duracao: 4, transicao: "desfoque" },
      { tipo: "foto", jobId: JOBS[2], efeito: "direita", legenda: "Agende sua visita", duracao: 5 },
    ],
  }),

  textos_arte_movimento_visual: doEditor({
    cenas: [
      {
        tipo: "foto",
        jobId: JOBS[0],
        efeito: "aproximar",
        duracao: 5,
        textos: [
          { texto: "Vendido", arte: "adesivo", posicao: "topo", estilo: "etiqueta", animacao: "surgir", movimento: "pulsar" },
          { texto: "R$ 690.000", arte: "neon_rosa", posicao: "base", estilo: "destaque", animacao: "no_fim", movimento: "nenhum" },
          { texto: "Lançamento", posicao: "centro", estilo: "gigante", animacao: "piscar", visual: { cor: "ffffff", caixa: "e07a1f", tamanho: 0.034 } },
        ],
      },
      {
        tipo: "foto",
        jobId: JOBS[1],
        efeito: "direita",
        duracao: 4,
        legenda: "Cozinha planejada",
        textos: [
          // Movimento sem arte não passa (o drawtext não gira nem cresce).
          { texto: "Pronto pra morar", posicao: "topo", estilo: "contorno", animacao: "entrar_esquerda", movimento: "balancar", visual: { cor: "F06B4F", caixa: null, contorno: "000000", sombra: true } },
        ],
      },
    ],
  }),

  elementos_adesivo_gif_pexels_ficha: doEditor({
    cenas: [
      {
        tipo: "foto",
        jobId: JOBS[0],
        efeito: "aproximar",
        duracao: 6,
        elementos: [
          { id: "adesivo:chave", ancora: "topo_dir", tamanho: 0.18, animacao: "surgir", movimento: "balancar" },
          // GIF já se mexe: o movimento pedido cai.
          { id: "adesivo:gif_chorando_de_rir", ancora: "base_esq", animacao: "nenhuma", movimento: "pulsar" },
          {
            id: "pexels:3196344",
            ancora: "base_dir",
            tamanho: 0.3,
            animacao: "subir",
            clipe: { previa: "https://videos.pexels.com/video-files/3196344/3196344-sd_360_640_25fps.mp4", largura: 360, altura: 640, autor: "Autor no Pexels", autorUrl: "https://www.pexels.com/" },
          },
        ],
      },
      {
        tipo: "foto",
        jobId: JOBS[1],
        efeito: "esquerda",
        duracao: 5,
        elementos: [
          { id: "ficha_barra", itens: [{ icone: "quarto", texto: "3 quartos" }, { icone: "banheiro", texto: "2" }, { icone: "vaga", texto: "2 vagas" }, { icone: "area", texto: "120 m²" }], ancora: "base", cor: "#0F2D5B", animacao: "entrar_esquerda" },
          { id: "selo_redondo", texto: "Exclusivo", ancora: "topo_esq", tamanho: 0.2, animacao: "piscar", movimento: "tremer" },
          { id: "moldura_fina", ancora: "centro", animacao: "nenhuma", movimento: "flutuar" },
        ],
      },
    ],
  }),

  cena_clipe_inicio_velocidade: doEditor({
    cenas: [
      { tipo: "foto", jobId: JOBS[0], efeito: "aproximar", duracao: 4 },
      {
        tipo: "clipe",
        arquivo: upload("9f4e2b7a-5c0d-4a8e-b3f6-1d7a9c4e2b80", "mp4"),
        efeito: "aproximar",
        duracao: 6,
        melhorar: true,
        inicio: 2.35,
        velocidade: 1.5,
        giro: 90,
        transicao: "corte",
        textos: [{ texto: "Tour pela casa", posicao: "base", estilo: "faixa", animacao: "subir" }],
      },
      { tipo: "clipe", arquivo: upload("4b1d8e5c-2a9f-4c7b-8e3d-6a0f5b2c9d17", "mov"), efeito: "aproximar", duracao: 3, inicio: 4, velocidade: 0.5, congelar: true },
    ],
  }),

  // O formato da página rápida (VPG:253-279): sem textos, sem Você, sem filtro.
  pagina_rapida: {
    formato: "9:16",
    cenas: [
      { tipo: "foto", jobId: JOBS[3], efeito: "aproximar", legenda: "Cozinha", duracao: 4 },
      { tipo: "animada", jobId: JOBS[4], efeito: "aproximar", animacao: "drone", duracao: 5 },
      { tipo: "foto", jobId: JOBS[5], efeito: "esquerda", duracao: 4 },
    ],
    musica: "moderna",
    musicaVolume: 0.8,
    narracao: { origem: "ia", roteiro: ROTEIRO, voz: "laura", volume: 1, inicio: 0.7 },
    titulo: "Casa no Jardim Goiás",
    preco: "R$ 1.250.000",
    local: "Jardim Goiás",
    telaFinal: true,
    chamada: "Chame no WhatsApp",
    transicao: "dissolver",
    capa: 1,
  },
};

// ---------------------------------------------------------------------------------------
// Sorteados. Mesmo gerador de scripts/testar-relogio.ts (TR:31-35): congruencial, semente
// fixa, o mesmo conjunto a cada execução.

// Um formato que não existe em dez: a recusa também é prova, mas não a maioria delas.
const FORMATOS = ["9:16", "9:16", "9:16", "9:16", "16:9", "16:9", "1:1", "1:1", "4:5", "3:4"];
const TIPOS = ["foto", "foto", "foto", "animada", "tour360", "clipe", "antes_depois"];
const EFEITOS = ["aproximar", "afastar", "esquerda", "direita", "cima", "baixo", "parado", "zoom"];
const ANIMACOES_CENA = ["drone", "caminhar", "girar", "aproximar", "voar"];
const MOVIMENTOS_360 = ["olhar_volta", "giro_completo", "entrar", "panoramica", "revelar", "rodar"];
const TRANSICOES = ["corte", "dissolver", "deslizar", "aproximar", "desfoque", "piscar"];
const MUSICAS = ["nenhuma", "calma", "sereno", "aconchego", "elegante", "sofisticado", "lounge", "moderna", "urbano", "minimal", "alegre", "familia", "verao", "cinematografica", "epico", "inspirador", "rock"];
const EFEITOS_SONOROS = ["nenhum", "passagem", "clique", "brilho", "impacto", "sino", "toque", "buzina"];
const VOZES = ["laura", "sarah", "daniel", "george", "maria"];
const POSICOES = ["topo", "centro", "base", "lado"];
const ESTILOS = ["faixa", "destaque", "etiqueta", "contorno", "sombra", "gigante", "fino", "selo", "neon"];
const ANIMACOES_TEXTO = ["nenhuma", "surgir", "subir", "descer", "entrar_esquerda", "entrar_direita", "piscar", "no_fim", "girar"];
const ARTES = ["adesivo", "contorno_duplo", "relevo", "brilho", "neon_rosa", "cromado", "etiqueta_preco", "nao_existe"];
const MOVIMENTOS = ["nenhum", "pulsar", "balancar", "tremer", "quicar", "flutuar", "girar"];
const ELEMENTOS = ["adesivo:chave", "adesivo:casa", "adesivo:gif_rolando_de_rir", "pexels:3196344", "ficha_barra", "selo_redondo", "metragem", "moldura_fina", "adesivo:nao_existe"];
const ANCORAS = ["topo_esq", "topo", "topo_dir", "meio_esq", "centro", "meio_dir", "base_esq", "base", "base_dir", "canto"];
const FILTROS = ["natural", "claro", "branco", "fachada", "quente", "madeira", "vibrante", "sepia"];
const FORMATOS_APRESENTADOR = ["canto", "circulo", "rodape", "tela"];
const CANTOS = ["superior_esquerdo", "superior_direito", "inferior_esquerdo", "inferior_direito"];
const TAMANHOS = ["pequeno", "medio", "grande", "enorme"];

export function especsSorteadas(quantos = 300, sementeInicial = 20260917): Record<string, Espec> {
  let semente = sementeInicial;
  const acaso = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const escolher = <T,>(l: T[]) => l[Math.floor(acaso() * l.length)];
  const talvez = (p: number) => acaso() < p;
  const numero = (min: number, max: number) => Math.round((min + acaso() * (max - min)) * 1000) / 1000;

  const saida: Record<string, Espec> = {};
  for (let i = 0; i < quantos; i++) {
    const n = 1 + Math.floor(acaso() * 12);
    const cenas = Array.from({ length: n }, () => {
      const tipo = escolher(TIPOS);
      const comArquivo = tipo === "tour360" || tipo === "clipe" || (tipo === "foto" && talvez(0.2));
      const cena: Espec = {
        tipo,
        ...(tipo !== "tour360" && tipo !== "clipe" ? { jobId: escolher(JOBS) } : {}),
        ...(comArquivo ? { arquivo: upload(escolher(JOBS), tipo === "clipe" ? "mp4" : "jpg") } : {}),
        efeito: escolher(EFEITOS),
        duracao: escolher([2, 3, 4, 5, 6, 8, 9, 10, 12, 4.6]),
      };
      if (tipo === "animada") cena.animacao = escolher(ANIMACOES_CENA);
      if (tipo === "tour360") cena.movimento = escolher(MOVIMENTOS_360);
      if (talvez(0.4)) cena.transicao = escolher(TRANSICOES);
      if (talvez(0.3)) cena.legenda = escolher(FRASES);
      if (tipo === "clipe" || tipo === "animada") {
        if (talvez(0.5)) cena.inicio = numero(-1, 70);
        if (talvez(0.5)) cena.velocidade = escolher([0.25, 0.5, 1, 1.5, 2, 3]);
        if (talvez(0.2)) cena.congelar = true;
        if (tipo === "clipe") cena.melhorar = talvez(0.5);
      }
      if (talvez(0.2)) cena.giro = escolher([0, 90, 180, 270, 45, -90]);
      if (talvez(0.15)) cena.espelho = true;
      if (talvez(0.2)) cena.filtro = escolher(FILTROS);
      if (talvez(0.2)) cena.intensidade = numero(-0.2, 1.2);
      if (talvez(0.15)) cena.luz = numero(-0.4, 0.4);
      if (talvez(0.15)) cena.ajustes = { exposicao: numero(-1.5, 1.5), vinheta: numero(0, 1) };
      if (talvez(0.35)) {
        cena.textos = Array.from({ length: 1 + Math.floor(acaso() * 4) }, () => ({
          texto: talvez(0.1) ? "" : escolher(FRASES),
          posicao: escolher(POSICOES),
          estilo: escolher(ESTILOS),
          animacao: escolher(ANIMACOES_TEXTO),
          ...(talvez(0.3) ? { arte: escolher(ARTES) } : {}),
          ...(talvez(0.3) ? { movimento: escolher(MOVIMENTOS) } : {}),
          ...(talvez(0.3) ? { visual: { cor: escolher(["ffffff", "F06B4F", "#ffffff", "0f2d5b"]), caixa: escolher([null, "e07a1f", "xyz"]), sombra: talvez(0.5), tamanho: numero(0, 0.3) } } : {}),
        }));
      }
      if (talvez(0.3)) {
        cena.elementos = Array.from({ length: 1 + Math.floor(acaso() * 4) }, () => {
          const id = escolher(ELEMENTOS);
          return {
            id,
            ancora: escolher(ANCORAS),
            animacao: escolher(ANIMACOES_TEXTO),
            ...(talvez(0.5) ? { tamanho: numero(0, 0.6) } : {}),
            ...(talvez(0.4) ? { movimento: escolher(MOVIMENTOS) } : {}),
            ...(id === "selo_redondo" || id === "metragem" ? { texto: talvez(0.8) ? escolher(FRASES) : "" } : {}),
            ...(id === "ficha_barra" ? { itens: [{ icone: "quarto", texto: "3 quartos" }, { icone: escolher(["vaga", "piscina"]), texto: "2" }] } : {}),
            ...(talvez(0.3) ? { cor: escolher(["#0F2D5B", "#f06b4f", "azul"]) } : {}),
            ...(id.startsWith("pexels:") && talvez(0.6)
              ? { clipe: { previa: escolher(["https://videos.pexels.com/video-files/3196344/3196344-sd_360_640_25fps.mp4", "https://exemplo.com/v.mp4"]), largura: 360, altura: 640, autor: "Autor no Pexels", autorUrl: "https://www.pexels.com/" } }
              : {}),
          };
        });
      }
      return cena;
    });

    const espec: Espec = {
      formato: escolher(FORMATOS),
      cenas,
      musica: escolher(MUSICAS),
      transicao: escolher(TRANSICOES),
      telaFinal: talvez(0.5),
      titulo: talvez(0.7) ? `Apto ${100 + Math.floor(acaso() * 900)} no Setor Bueno` : "",
      preco: talvez(0.6) ? `R$ ${Math.floor(acaso() * 2000) * 1000}` : "",
      local: talvez(0.6) ? "Setor Bueno, Goiânia" : "",
    };
    if (talvez(0.6)) espec.musicaVolume = escolher([0, 0.3, 0.55, 0.8, 0.8333, 1, 1.4, "0.5"]);
    if (talvez(0.5)) espec.chamada = escolher(["Agende sua visita", "Chame no WhatsApp", ""]);
    if (talvez(0.6)) espec.capa = escolher([0, 1, 2, 5, 11, -1, 1.5]);
    if (talvez(0.5)) {
      const origem = escolher(["ia", "gravada", "enviada", undefined, "clonada"]);
      espec.narracao = {
        ...(origem !== undefined ? { origem } : {}),
        ...(origem === "ia" || origem === undefined || origem === "clonada" ? { roteiro: talvez(0.85) ? ROTEIRO : "Curto", voz: escolher(VOZES) } : {}),
        ...(origem === "gravada" || origem === "enviada" ? { arquivo: talvez(0.9) ? upload(escolher(JOBS), escolher(["webm", "mp4", "mp3", "m4a"])) : "../../etc/senha" } : {}),
        ...(talvez(0.7) ? { volume: escolher([0, 0.2, 1, 1.25, 2, 3]) } : {}),
        ...(talvez(0.7) ? { inicio: numero(-1, 12) } : {}),
      };
    } else if (talvez(0.5)) {
      espec.narracao = null;
    }
    if (talvez(0.25)) {
      espec.legendas = {
        trechos: Array.from({ length: 1 + Math.floor(acaso() * 30) }, (_, k) => {
          const ini = numero(0, 40);
          return { inicio: talvez(0.05) ? -1 : ini, fim: talvez(0.05) ? ini : Math.round((ini + numero(0.3, 4)) * 1000) / 1000, texto: talvez(0.05) ? "" : `${escolher(FRASES)} ${k}` };
        }),
        estilo: escolher(["faixa", "contorno", "caixa"]),
        posicao: escolher(["base", "centro", "topo"]),
      };
    }
    if (talvez(0.25)) {
      espec.apresentador = {
        arquivo: talvez(0.9) ? upload(escolher(JOBS), escolher(["mp4", "webm", "mov"])) : "",
        formato: escolher(FORMATOS_APRESENTADOR),
        canto: escolher(CANTOS),
        tamanho: escolher(TAMANHOS),
        entra: numero(-2, 130),
        ...(talvez(0.5) ? { duracao: numero(0, 70) } : {}),
        inicio: numero(0, 65),
        volume: numero(0, 2.5),
      };
    }
    if (talvez(0.3)) espec.efeitoSonoro = escolher(EFEITOS_SONOROS);
    if (talvez(0.3)) espec.filtro = escolher(FILTROS);
    if (talvez(0.2)) espec.intensidadeFiltro = numero(-0.2, 1.3);
    if (talvez(0.2)) espec.ajustes = { contraste: numero(-1.2, 1.2), saturacao: numero(-1, 1), desbotar: numero(-0.5, 1.5) };
    if (talvez(0.2)) espec.capaMontada = escolher([false, true, "nao"]);
    saida[`sorteado_${String(i).padStart(3, "0")}`] = espec;
  }
  return saida;
}
