// O ÁUDIO DO EDITOR (lib/audio-do-editor.ts): escolher música, voz nova, volumes, e os blocos
// virando o que a prévia toca. Sem rede, sem navegador.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-audio-do-editor.ts

import { escolherMusica, inicioDaVoz, itensDaPrevia, marcasDaPrevia, musicaNova, novoIdDeAudio, volumeDaMusica, volumeDaVoz, vozNova } from "../src/lib/audio-do-editor.ts";
import { blocosDoEstado, ctxDoEstado, estadoDoEspec, type Medidas } from "../src/lib/linha-do-tempo.ts";
import { canonizarAudio, type EspecVideo, type ItemAudio } from "../src/lib/video.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

// ---------- ids ----------
{
  const ids = new Set(Array.from({ length: 500 }, () => novoIdDeAudio()));
  conferir([...ids].every((i) => /^[a-z0-9]{8}$/.test(i)) && ids.size === 500, "id de trecho: 8 letras/dígitos (o que o saneador aceita), sem repetir");
  conferir(novoIdDeAudio(["aaaaaaaa"]) !== "aaaaaaaa", "id de trecho: não repete um que já existe");
}

// ---------- escolher música (D6) ----------
{
  const voz: ItemAudio = { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 0.7, corteArquivo: 0, volume: 1, fadeEntrada: 0, fadeSaida: 0 };
  const a = escolherMusica([voz], null, "calma", 0.8);
  const m = a.audios.find((x) => x.fonte.tipo === "musica");
  conferir(!!m && a.selecao?.faixa === "musica" && a.abrir === "musica" && /adicionada/.test(a.aviso ?? ""), "sem música: escolher cria o trecho, seleciona e abre a faixa Música", a.aviso ?? "");
  conferir(m?.noVideo === 0 && m.corteArquivo === 0 && m.laco === true && m.fadeEntrada === 1 && m.fadeSaida === 2 && m.duracao === undefined, "trecho novo: do começo ao fim, em laço, fades 1s/2s (os de sempre)");
  const canon = canonizarAudio({ itens: a.audios, narracao: { origem: "gravada", arquivo: "uploads/x/v.webm" }, musicaVolume: 0.8 });
  conferir(canon.musica === "calma" && !canon.audios && canon.narracao?.inicio === 0.7, "sem mexer em nada, vai no formato ANTIGO (vídeo igual ao de antes, byte a byte)", JSON.stringify(canon).slice(0, 90));

  const dois = [musicaNova("calma", 0.8, "m0000001"), musicaNova("calma", 0.8, "m0000002")];
  const sel = escolherMusica(dois, { faixa: "musica", id: "m0000002" }, "alegre", 0.8);
  conferir(sel.audios[0].fonte.tipo === "musica" && sel.audios[0].fonte.id === "calma" && sel.audios[1].fonte.tipo === "musica" && sel.audios[1].fonte.id === "alegre", "trecho selecionado: troca só a música dele");
  const todos = escolherMusica(dois, null, "alegre", 0.8);
  conferir(todos.audios.every((x) => x.fonte.tipo === "musica" && x.fonte.id === "alegre") && /trocada/.test(todos.aviso ?? ""), "sem seleção: troca a música de todos os trechos");
  const tira = escolherMusica([...dois, voz], { faixa: "musica", id: "m0000001" }, "nenhuma", 0.8);
  conferir(tira.audios.length === 1 && tira.audios[0].fonte.tipo === "voz" && tira.selecao === null && /tirada/.test(tira.aviso ?? ""), "\"Sem música\": tira todos os trechos de música (a voz fica)");
}

// ---------- voz nova (D6) ----------
{
  const v1 = vozNova([musicaNova("calma", 0.8, "m0000001")]);
  const z = v1.audios.find((x) => x.fonte.tipo === "voz");
  conferir(!!z && z.noVideo === 0.7 && v1.selecao?.faixa === "voz" && v1.abrir === "voz", "primeira voz: entra no lugar de sempre (0,7s), selecionada");
  const partida: ItemAudio[] = [
    { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 2, corteArquivo: 0, duracao: 3, volume: 1.4, fadeEntrada: 0, fadeSaida: 0 },
    { id: "vozb0000", fonte: { tipo: "voz" }, noVideo: 6, corteArquivo: 4, volume: 1.4, fadeEntrada: 0, fadeSaida: 0 },
  ];
  const v2 = vozNova(partida);
  const vozes = v2.audios.filter((x) => x.fonte.tipo === "voz");
  conferir(vozes.length === 1 && vozes[0].noVideo === 2 && vozes[0].volume === 1.4 && vozes[0].corteArquivo === 0 && vozes[0].duracao === undefined, "gravação nova sobre voz cortada: volta a UM trecho (mesmo início e volume, sem cortes)");
}

// ---------- volumes e "Começa em" ----------
{
  const lista: ItemAudio[] = [musicaNova("calma", 0.8, "m0000001"), { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 1, corteArquivo: 0, volume: 1, fadeEntrada: 0, fadeSaida: 0 }];
  conferir(volumeDaMusica(lista, 1.7)[0].volume === 1 && volumeDaMusica(lista, 0.333)[1].volume === 1, "volume da música: 0 a 1, e não mexe na voz");
  conferir(volumeDaVoz(lista, 0.05)[1].volume === 0.2 && volumeDaVoz(lista, 3)[1].volume === 2, "volume da voz: 0,2 a 2");
  const r = inicioDaVoz(lista, 3.5, 20);
  conferir(r.delta === 2.5 && r.audios[1].noVideo === 3.5 && r.audios[0].noVideo === 0, "\"Começa em\": a voz inteira anda (e diz quanto, pras legendas irem junto)");
}

// ---------- blocos -> prévia ----------
{
  const espec = {
    formato: "9:16",
    cenas: [0, 1, 2].map(() => ({ tipo: "foto", jobId: "00000000-0000-0000-0000-000000000000", duracao: 4, efeito: "parado" })),
    musica: "nenhuma",
    musicaVolume: 0.8,
    narracao: { origem: "gravada", arquivo: "uploads/u/voz.webm" },
    titulo: "",
    preco: "",
    local: "",
    telaFinal: false,
    chamada: "",
    transicao: "corte",
    efeitoSonoro: "clique",
  } as unknown as EspecVideo;
  const estado = estadoDoEspec(espec);
  estado.audios = [
    { ...musicaNova("calma", 0.6, "m0000001"), duracao: 5, corteArquivo: 12 },
    { id: "voz00000", fonte: { tipo: "voz" }, noVideo: 1.5, corteArquivo: 0, duracao: 4, volume: 1.2, fadeEntrada: 0, fadeSaida: 0 },
  ];
  const medidas: Medidas = { segundosDaVoz: 9, vozEstimada: false, segundosEstimadosDaVoz: 0, segundosDoVoce: null };
  const faixas = blocosDoEstado(ctxDoEstado(estado, medidas));
  const itens = itensDaPrevia(faixas, estado.audios, null, { voz: { chave: "uploads/u/voz.webm", url: "blob:voz" }, voce: null });
  const m = itens.find((i) => i.id === "m0000001");
  const z = itens.find((i) => i.id === "voz00000");
  const bm = faixas.trilhas.musica[0];
  conferir(!!m && m.noVideo === bm.de && Math.abs(m.dur - (bm.ate - bm.de)) < 1e-9 && m.corte === 12 && m.fonte.url === "/musica/previa/calma.m4a" && m.barramento === "musica", "prévia: a música toca exatamente o trecho do bloco (entrada, duração, corte)", `${m?.noVideo}s +${m?.dur}s corte ${m?.corte}`);
  conferir(!!z && z.barramento === "voz" && z.fonte.url === "blob:voz" && z.volume === 1.2, "prévia: a voz toca do arquivo gravado, no barramento da voz");
  const semArquivo = itensDaPrevia(faixas, estado.audios, null, { voz: null, voce: null });
  conferir(!semArquivo.some((i) => i.barramento === "voz"), "prévia: voz sem arquivo (IA ainda não gerada) não toca -- o bloco é só estimativa");
  const marcas = marcasDaPrevia(faixas, "clique");
  conferir(marcas.length === faixas.marcasDeEfeito.length && marcas.length > 0 && marcas[0].fonte.url === "/efeitos/previa/clique.m4a", "prévia: um som em cada virada de cena", `${marcas.length} viradas`);
  conferir(marcasDaPrevia(faixas, "nenhum").length === 0, "prévia: sem efeito escolhido, sem som nas viradas");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
