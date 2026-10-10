// ONDE O LOGO CAI NA FOTO EXPORTADA (lib/marca-na-foto.ts).
//
// Ele perguntou em 10/10/2026: "quando for pôr marca d'água em fotos e vídeos, onde escolho
// a posição da imagem?". No vídeo escolhia; na foto o logo era cravado no inferior esquerdo.
//
// O que mais importa travar aqui é a AUSÊNCIA do canto inferior direito. Ali mora o selo
// "imagem ilustrativa", que vem queimado no resultado antes da exportação; oferecer aquele
// canto deixaria o logo cobrir a marca que diz que a foto foi editada por IA. É a regra que
// um refactor bem-intencionado ("faltou um canto, vou completar a lista") quebraria.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-marca-na-foto.ts

import { POSICOES_LOGO_FOTO, POSICAO_LOGO_PADRAO, ehPosicaoLogo, ondePorOLogo } from "../src/lib/marca-na-foto.ts";

let falhas = 0;
const conferir = (ok: boolean, oque: string, extra = "") => {
  console.log(`${ok ? "ok   " : "FALHA"} ${oque}${extra ? " · " + extra : ""}`);
  if (!ok) falhas++;
};

const FOTO = { largura: 1200, altura: 900 };
const LOGO = { largura: 200, altura: 80 };
const margem = Math.max(10, Math.round(FOTO.largura * 0.015)); // 18

// ---- o canto do selo NÃO é oferecido ----
{
  const ids = POSICOES_LOGO_FOTO.map((p) => p.id);
  conferir(!ids.includes("inferior_direito" as never), "o canto INFERIOR DIREITO não é oferecido", "é onde mora o selo de imagem ilustrativa");
  conferir(!ehPosicaoLogo("inferior_direito"), "e o saneador o recusa também", "senão a API aceitaria o que a tela não mostra");
  conferir(ids.length === 4, "são quatro posições", ids.join(", "));
  conferir(POSICOES_LOGO_FOTO.every((p) => p.dica.length > 15), "cada uma explica o que acontece ali");
}

// ---- saneamento ----
{
  conferir(ehPosicaoLogo("centro"), "aceita uma posição válida");
  conferir(!ehPosicaoLogo("canto_do_meio"), "recusa posição inventada");
  conferir(!ehPosicaoLogo(null) && !ehPosicaoLogo(undefined) && !ehPosicaoLogo(7), "recusa nulo, indefinido e número");
  conferir(ehPosicaoLogo(POSICAO_LOGO_PADRAO), "o próprio padrão é válido", POSICAO_LOGO_PADRAO);
  conferir(POSICAO_LOGO_PADRAO === "inferior_esquerdo", "e o padrão é o canto de sempre", "quem não escolher recebe o que já recebia");
}

// ---- a conta de cada posição ----
{
  const baixoEsq = ondePorOLogo("inferior_esquerdo", FOTO, LOGO);
  conferir(baixoEsq.left === margem, "baixo-esquerda encosta na margem da esquerda", `left=${baixoEsq.left}`);
  conferir(baixoEsq.top === FOTO.altura - LOGO.altura - margem, "e no pé da foto", `top=${baixoEsq.top}`);

  const cimaEsq = ondePorOLogo("superior_esquerdo", FOTO, LOGO);
  conferir(cimaEsq.left === margem && cimaEsq.top === margem, "alto-esquerda vai pro topo", `${cimaEsq.left},${cimaEsq.top}`);

  const cimaDir = ondePorOLogo("superior_direito", FOTO, LOGO);
  conferir(cimaDir.left === FOTO.largura - LOGO.largura - margem, "alto-direita encosta na direita", `left=${cimaDir.left}`);
  conferir(cimaDir.top === margem, "e no topo", `top=${cimaDir.top}`);

  const centro = ondePorOLogo("centro", FOTO, LOGO);
  conferir(centro.left === Math.round((FOTO.largura - LOGO.largura) / 2), "o centro centra na horizontal", `left=${centro.left}`);
  conferir(centro.top === Math.round((FOTO.altura - LOGO.altura) / 2), "e na vertical", `top=${centro.top}`);
}

// ---- o logo nunca sai do quadro ----
{
  for (const p of POSICOES_LOGO_FOTO) {
    const r = ondePorOLogo(p.id, FOTO, LOGO);
    const dentro = r.left >= 0 && r.top >= 0 && r.left + LOGO.largura <= FOTO.largura && r.top + LOGO.altura <= FOTO.altura;
    conferir(dentro, `“${p.rotulo}” mantém o logo dentro da foto`, `${r.left},${r.top}`);
  }
  // Logo quase do tamanho da foto: a conta não pode devolver coordenada negativa.
  const gigante = { largura: 1190, altura: 890 };
  for (const p of POSICOES_LOGO_FOTO) {
    const r = ondePorOLogo(p.id, FOTO, gigante);
    conferir(r.left >= 0 && r.top >= 0, `“${p.rotulo}” não sai do quadro nem com logo gigante`, `${r.left},${r.top}`);
  }
}

// ---- foto deitada e em pé dão cantos diferentes ----
{
  const retrato = { largura: 900, altura: 1200 };
  const a = ondePorOLogo("inferior_esquerdo", FOTO, LOGO);
  const b = ondePorOLogo("inferior_esquerdo", retrato, LOGO);
  conferir(a.top !== b.top, "a conta acompanha a altura da foto", `${a.top} vs ${b.top}`);
}

console.log(falhas === 0 ? "\nTUDO CERTO" : `\n${falhas} FALHA(S)`);
// `process.exitCode` em vez de `process.exit()`: neste arquivo — que é todo síncrono, sem
// um `main()` assíncrono como os vizinhos — o exit forçado estoura no libuv ao encerrar
// ("UV_HANDLE_CLOSING") e devolve 127 DEPOIS de imprimir TUDO CERTO. Teste que diz "passou"
// e sai com código de falha mente pra quem automatiza, e mente do jeito pior: a tela diz
// uma coisa e o programa diz outra.
process.exitCode = falhas === 0 ? 0 : 1;
