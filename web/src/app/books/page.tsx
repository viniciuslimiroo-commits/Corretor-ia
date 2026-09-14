import { redirect } from "next/navigation";

// /books virou /materiais. O endereço antigo fica de pé porque já circulou: está em
// favoritos, em abas abertas e no histórico de quem usou o produto esta semana.
export default function Books() {
  redirect("/materiais");
}
