// Faz o `node` importar os arquivos .ts do projeto direto, sem build.
//
// O Node 24 já apaga os tipos sozinho; o que falta é a resolução de caminho: o projeto
// escreve `./video` e o ESM exige `./video.ts`. Este gancho tenta as extensões.
//
// Serve pra TESTAR a biblioteca do jeito que o servidor a usa -- mesma função, mesmos
// argumentos -- em vez de reescrever a lógica dentro do teste, que é o jeito clássico de
// um teste passar enquanto o produto quebra.
//
//   node --import ./scripts/ts-direto.mjs scripts/testar-arte-texto.ts
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXTENSOES = [".ts", ".tsx", ".mjs", ".js"];
// O mesmo atalho do tsconfig ("@/*" -> "./src/*"). Sem isto, um arquivo do produto que
// importa "@/i18n" quebra quando o teste o chama direto -- e aí o teste acaba testando uma
// cópia da lógica em vez da lógica.
const SRC = pathToFileURL(path.resolve(import.meta.dirname, "..", "src") + path.sep).href;

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador.startsWith("@/")) {
      const alvo = SRC + especificador.slice(2);
      for (const ext of ["", ...EXTENSOES, "/index.ts", "/index.tsx"]) {
        try {
          if (fs.existsSync(new URL(alvo + ext))) return proximo(alvo + ext, contexto);
        } catch {
          // caminho estranho: cai no resolvedor padrão
        }
      }
    }
    if (especificador.startsWith(".") && !/\.[a-z]+$/i.test(especificador)) {
      for (const ext of EXTENSOES) {
        try {
          if (fs.existsSync(new URL(especificador + ext, contexto.parentURL))) {
            return proximo(especificador + ext, contexto);
          }
        } catch {
          // parentURL estranho (data:, node:): deixa o resolvedor padrão decidir
        }
      }
    }
    return proximo(especificador, contexto);
  },
});
