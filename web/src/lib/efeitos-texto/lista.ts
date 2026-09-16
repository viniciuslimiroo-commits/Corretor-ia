// GERADO por scripts/gerar-cartoes-efeitos.ts a partir de efeitos-texto/catalogo.ts.
// Não edite à mão: rode o script. scripts/testar-efeitos-texto.ts confere que bate.
//
// É a parte do catálogo que o NAVEGADOR e o saneador podem importar: sem fonte, sem
// desenho, só o que precisa pra listar e validar.

import type { CategoriaEfeito } from "./nucleo";

export type ItemEfeitoTexto = { id: string; rotulo: string; categoria: CategoriaEfeito; amostra: string };

export const LISTA_EFEITOS_TEXTO: ItemEfeitoTexto[] = [
  { id: "pop_vermelho", rotulo: "Pop vermelho", categoria: "populares", amostra: "Oferta" },
  { id: "adesivo_recortado", rotulo: "Adesivo recortado", categoria: "populares", amostra: "Novidade" },
  { id: "faixa_oferta", rotulo: "Faixa de oferta", categoria: "populares", amostra: "À venda" },
  { id: "tinta_escorrendo", rotulo: "Tinta escorrendo", categoria: "classico", amostra: "Vendido" },
  { id: "estrelinhas", rotulo: "Estrelinhas", categoria: "classico", amostra: "Vista mar" },
  { id: "extrudado_3d", rotulo: "3D retrô", categoria: "classico", amostra: "Casa" },
  { id: "remendo_bordado", rotulo: "Remendo bordado", categoria: "classico", amostra: "Exclusivo" },
  { id: "gibi_pop", rotulo: "Gibi pop", categoria: "divertido", amostra: "Uau!" },
  { id: "doce_bolinhas", rotulo: "Doce de bolinhas", categoria: "divertido", amostra: "Doce lar" },
  { id: "placa_cinema", rotulo: "Placa de cinema", categoria: "divertido", amostra: "Estreia" },
  { id: "neon_rosa", rotulo: "Neon rosa", categoria: "brilho", amostra: "Vendido" },
  { id: "neon_letreiro", rotulo: "Letreiro neon", categoria: "brilho", amostra: "Plantão" },
  { id: "eletrico", rotulo: "Elétrico", categoria: "brilho", amostra: "Imperdível" },
  { id: "cromado", rotulo: "Cromado", categoria: "brilho", amostra: "Exclusivo" },
  { id: "holografico", rotulo: "Holográfico", categoria: "brilho", amostra: "Novidade" },
  { id: "brilho_branco", rotulo: "Brilho branco", categoria: "brilho", amostra: "Seu novo lar" },
  { id: "brilho_escuro", rotulo: "Brilho escuro", categoria: "brilho", amostra: "À venda" },
  { id: "por_do_sol", rotulo: "Pôr do sol", categoria: "brilho", amostra: "Vista mar" },
  { id: "ouro_folheado", rotulo: "Ouro folheado", categoria: "luxo", amostra: "Exclusivo" },
  { id: "assinatura_champanhe", rotulo: "Assinatura champanhe", categoria: "luxo", amostra: "Vista mar" },
  { id: "capa_revista", rotulo: "Capa de revista", categoria: "luxo", amostra: "Cobertura" },
  { id: "minimal_espacado", rotulo: "Minimalista espaçado", categoria: "luxo", amostra: "Alto padrão" },
  { id: "marmore_negro", rotulo: "Mármore negro", categoria: "luxo", amostra: "Mansão" },
  { id: "carimbo_vendido", rotulo: "Carimbo", categoria: "imovel", amostra: "Vendido" },
  { id: "placa_imovel", rotulo: "Placa de imóvel", categoria: "imovel", amostra: "À venda" },
  { id: "faixa_lancamento", rotulo: "Faixa de lançamento", categoria: "imovel", amostra: "Lançamento" },
  { id: "etiqueta_preco", rotulo: "Etiqueta de preço", categoria: "imovel", amostra: "R$ 890.000" },
  { id: "fachada_iluminada", rotulo: "Fachada iluminada", categoria: "luxo", amostra: "Residencial" },
];

export const IDS_EFEITOS_TEXTO: ReadonlySet<string> = new Set(LISTA_EFEITOS_TEXTO.map((e) => e.id));

export function urlDoCartaoDeEfeito(id: string): string {
  return `/efeitos-texto/${id}.png`;
}
