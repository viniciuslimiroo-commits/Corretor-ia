import BancadaBarra from "./bancada-barra";

// Bancada das PEÇAS DE EDIÇÃO da linha do tempo (docs/planos/linha-do-tempo-spec.md, P6):
// barra da seleção, aviso com Desfazer, lista da foto, legenda no palco -- e os quatro
// componentes que já existem (Você no palco, galeria de texto, galeria de elementos, peças
// no palco) desenhados com as propriedades que o editor passa HOJE, pro teste provar que
// as propriedades novas não mudaram nada pra quem não as usa.
//
//   /dev/barra-da-selecao?parte=antigos|novos&flutuante=aviso|lista
//
// Fechada em produção pelo `notFound()` de `../layout.tsx`, que vale pra toda bancada de
// /dev. SEM trava própria de propósito: é isso que faz o 404 desta rota ser prova de que o
// layout funciona, e não uma coincidência.
export default async function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const parte = q.parte === "novos" ? "novos" : "antigos";
  return <BancadaBarra parte={parte} flutuante={q.flutuante === "lista" ? "lista" : "aviso"} />;
}
