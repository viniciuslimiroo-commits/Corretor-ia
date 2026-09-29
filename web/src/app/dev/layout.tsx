import { notFound } from "next/navigation";

// TRAVA DE AMBIENTE DAS BANCADAS. Tudo que mora em /dev é bancada de desenvolvimento: tela
// montada com estado de teste pra provar no navegador o que o Node não prova (gesto, som
// saindo do grafo de áudio, altura de alvo no celular). Nada disso é produto, e nada disso
// abre pra quem descobrir a URL no site publicado.
//
// A trava mora AQUI, no layout, e não copiada dentro de cada página: layout envolve toda
// rota abaixo dele, então a bancada que alguém criar amanhã em `/dev/<nome>` já nasce
// fechada, sem depender de ninguém lembrar de repetir a linha. As três de hoje
// (barra-da-selecao, linha-do-tempo, previa-audio) ficaram SEM trava própria de propósito:
// são a prova viva de que esta aqui funciona -- guarda que nada exercita é guarda que
// ninguém sabe se quebrou.
//
// `notFound()` tem que estar no caminho do render, e está: é o corpo do layout de servidor
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md).
// As rotas continuam existindo no build e respondem 404 fora do desenvolvimento -- os testes
// de navegador (`conferir-faixas-no-navegador`, `conferir-barra-no-navegador`,
// `conferir-previa-no-navegador`) rodam contra `npm run dev`, onde NODE_ENV é "development",
// e montam o endereço com `http://localhost:<porta>` fixo: nenhum deles aponta pra produção.
//
// Prova no ar: `node scripts/conferir-bancadas-fechadas.mjs`.
export default function LayoutDasBancadas({ children }: LayoutProps<"/dev">) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
