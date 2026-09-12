import { randomBytes } from "crypto";

// Links públicos de foto e de imóvel. O token é o único segredo: quem tem o link vê,
// quem não tem não acha (22 caracteres aleatórios ≈ 128 bits). A página lê o banco com
// service role e assina as imagens na hora, então o bucket continua privado e revogar o
// link (apagar o token) corta o acesso no ato -- nada fica cacheado em URL permanente.
//
// Só servidor: usa crypto do Node.

export function gerarToken(): string {
  return randomBytes(16).toString("base64url");
}

export function ehToken(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{20,32}$/.test(v);
}

export function urlPublica(origem: string, token: string): string {
  return `${origem.replace(/\/$/, "")}/c/${token}`;
}
