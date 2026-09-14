import { redirect } from "next/navigation";

// A tela mudou de endereço: /configuracoes virou /marca.
//
// O caminho antigo mentia duas vezes -- não havia configuração nenhuma ali (logo, cor,
// nome, CRECI e WhatsApp é identidade, não ajuste), e o ícone de engrenagem dizia a mesma
// mentira no menu. O redirecionamento fica porque o endereço já circulou: está no link de
// recuperação de senha que a pessoa recebeu por e-mail e em avisos dentro do app.

export default function Configuracoes() {
  redirect("/marca");
}
