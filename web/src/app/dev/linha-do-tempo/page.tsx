import BancadaLinha from "./bancada-linha";

// Bancada da LINHA DO TEMPO EM FAIXAS (docs/planos/linha-do-tempo-spec.md, P5).
//
// O componente das faixas nasce fora do editor (o editor só troca pra ele no P7a), e o que
// ele precisa provar -- alturas no celular, alvos de 44px, rolar vs arrastar vs tocar vs
// segurar, pinça, encaixe -- só se prova num navegador de verdade. Aqui ele roda sobre um
// vídeo montado à mão com as fotos reais de /exemplos, a biblioteca pura (P3) fazendo a
// conta de cada gesto, e um registro de eventos em `window.__linha` pro teste ler.
//
//   /dev/linha-do-tempo?caso=seis|nenhuma|curto&celular=1|0&aberta=voz&todas=1
//
// Fechada em produção pelo `notFound()` de `../layout.tsx`, que vale pra toda bancada de
// /dev. SEM trava própria de propósito: é isso que faz o 404 desta rota ser prova de que o
// layout funciona, e não uma coincidência.
export default async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const um = (k: string) => (Array.isArray(q[k]) ? q[k]?.[0] : q[k]) as string | undefined;
  const caso = um("caso") === "nenhuma" || um("caso") === "curto" ? (um("caso") as "nenhuma" | "curto") : "seis";
  return <BancadaLinha caso={caso} celular={um("celular") === "0" ? false : um("celular") === "1" ? true : null} aberta={um("aberta") ?? null} todas={um("todas") === "1"} />;
}
