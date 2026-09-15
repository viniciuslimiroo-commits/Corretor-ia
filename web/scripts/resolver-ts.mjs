// Deixa o Node importar `./coisa` quando o arquivo é `./coisa.ts`.
//
// O TypeScript e o Next resolvem a extensão sozinhos; o Node cru não, e escrever
// `./terreno-ia.ts` no código-fonte só pra agradar o teste seria o teste mandando na
// aplicação. Então o ajuste fica aqui.
//
// Uso:  node --experimental-strip-types --import ./scripts/resolver-ts.mjs scripts/testar-x.mjs

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./resolver-ts-hooks.mjs", pathToFileURL(import.meta.filename));
