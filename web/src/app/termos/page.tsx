import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal, { Secao } from "@/components/pagina-legal";

// Termos de uso. Escritos em português claro, sem jargão que ninguém lê. Dois pontos
// existem por causa do negócio, não de modelo pronto: a imagem é ILUSTRATIVA (e sai
// marcada), e o cliente não pode usar o produto pra enganar comprador.
//
// Isto não substitui advogado: antes de escalar, revisar com um.

export const metadata: Metadata = { title: "Termos de uso", description: "Termos de uso do Encena." };

const ATUALIZADO = "12 de setembro de 2026";

export default function Termos() {
  return (
    <PaginaLegal titulo="Termos de uso" atualizado={ATUALIZADO}>
      <Secao n="1" titulo="Quem somos e o que oferecemos">
        <p>
          O Encena é um serviço na internet que edita fotos de imóveis com inteligência artificial e monta vídeos a partir dessas
          fotos. Você envia uma imagem, escolhe o que quer (mobiliar, trocar piso, remover objeto, trocar céu, entre outros) e
          recebe uma versão editada. Ao usar o serviço, você concorda com estes termos.
        </p>
        <p>
          O serviço é operado por Vinicius Cardoso Lima, em Goiânia (GO). Contato: <strong>contato@encena.app.br</strong>.
        </p>
      </Secao>

      <Secao n="2" titulo="As imagens são ilustrativas">
        <p>
          Toda imagem editada pelo Encena é uma <strong>simulação</strong>: mostra uma possibilidade de decoração, acabamento ou
          iluminação, e não o estado real do imóvel. Por isso, toda imagem sai com o aviso &quot;imagem ilustrativa&quot; gravado, e as
          páginas de compartilhamento repetem esse aviso.
        </p>
        <p>
          <strong>Você não pode remover esse aviso</strong> nem apresentar a imagem como foto real do imóvel. O Código de Defesa do
          Consumidor responsabiliza quem anuncia por publicidade enganosa: manter o aviso protege você.
        </p>
      </Secao>

      <Secao n="3" titulo="O que você pode e o que não pode enviar">
        <p>Você declara que tem direito de usar as fotos que envia e assume a responsabilidade por elas. É proibido enviar ou gerar:</p>
        <ul>
          <li>fotos de terceiros sem autorização, ou com marca d&apos;água de outra pessoa ou empresa;</li>
          <li>imagens de pessoas identificáveis sem consentimento;</li>
          <li>conteúdo ilegal, ofensivo, sexual, violento ou que viole direitos de terceiros;</li>
          <li>pedidos que criem características que o imóvel não pode ter (metragem, vista, andar), com intenção de enganar.</li>
        </ul>
        <p>O Encena não remove marcas d&apos;água de terceiros: é pedido recusado por decisão nossa, por risco jurídico.</p>
      </Secao>

      <Secao n="4" titulo="De quem são as imagens">
        <p>
          As fotos que você envia continuam suas. As imagens geradas também são suas: você pode usá-las em anúncios, redes sociais,
          materiais impressos e onde quiser, respeitando o item 2. Não cobramos nada a mais por isso e não reivindicamos direito
          sobre o seu material.
        </p>
        <p>
          Podemos usar imagens geradas como exemplo do serviço apenas se você autorizar por escrito. Sem autorização, nada do seu
          material aparece em divulgação nossa.
        </p>
      </Secao>

      <Secao n="5" titulo="Créditos, planos e pagamento">
        <ul>
          <li>Cada geração consome créditos: uma foto editada custa 1 crédito, um vídeo montado custa 1, uma cena animada por IA custa 2 e a narração custa 1.</li>
          <li>Contas novas recebem 5 créditos grátis, sem cartão.</li>
          <li>Planos mensais renovam sozinhos e podem ser cancelados a qualquer momento, com um clique, sem multa.</li>
          <li>Planos anuais são pagos de uma vez e os créditos entram mês a mês, ao longo de doze meses. Cancelar interrompe as parcelas futuras de crédito.</li>
          <li>Pacotes avulsos são pagamento único e os créditos não expiram enquanto a conta existir.</li>
          <li>Os pagamentos são processados pela Stripe. Não temos acesso ao número do seu cartão.</li>
        </ul>
        <p>
          <strong>Arrependimento:</strong> pelo artigo 49 do Código de Defesa do Consumidor, você pode desistir da compra em até 7
          dias corridos, contados do pagamento, e receber o valor de volta. Se já tiver usado créditos nesse período, devolvemos o
          proporcional ao que não foi usado. Basta escrever para contato@encena.app.br.
        </p>
      </Secao>

      <Secao n="6" titulo="Quando o resultado não presta">
        <p>
          Se a geração sair errada, você clica em reportar e o crédito volta. Uma inteligência artificial compara a foto original
          com o resultado e o que você descreveu. Quando ela confirma a falha, o crédito volta na hora, até dez vezes por dia.
          Quando não confirma, devolvemos assim mesmo por cortesia, até três vezes por dia; acima disso, uma pessoa analisa.
        </p>
      </Secao>

      <Secao n="7" titulo="Conta de imobiliária">
        <p>
          Uma imobiliária pode ter uma conta de equipe. Nela, os créditos pertencem à imobiliária e são usados por todos os
          membros; o dono e os gestores convidam e removem pessoas e veem quanto cada um gerou. Quem entra numa imobiliária deixa
          de usar os créditos pessoais, que ficam guardados e voltam a valer se sair. Quem cria a imobiliária transfere os créditos
          pessoais para ela, e essa transferência não tem volta.
        </p>
      </Secao>

      <Secao n="8" titulo="Disponibilidade e limites">
        <p>
          Fazemos o possível para o serviço ficar disponível, mas ele depende de fornecedores de nuvem e de modelos de IA e pode
          ficar fora do ar para manutenção ou por falha de terceiros. Não prometemos disponibilidade ininterrupta.
        </p>
        <p>
          Nossa responsabilidade, em qualquer caso, fica limitada ao valor que você pagou nos últimos 12 meses. Não respondemos
          pelo uso que você faz das imagens nos seus anúncios.
        </p>
      </Secao>

      <Secao n="9" titulo="Encerramento">
        <p>
          Você pode parar de usar e cancelar quando quiser. Podemos suspender uma conta que descumpra estes termos, principalmente
          o item 3, avisando por e-mail sempre que possível. Créditos de conta encerrada por descumprimento não são devolvidos.
        </p>
      </Secao>

      <Secao n="10" titulo="Mudanças e foro">
        <p>
          Se mudarmos estes termos, avisamos por e-mail e atualizamos a data no topo. Continuar usando depois disso significa
          concordar. Aplica-se a lei brasileira, e fica eleito o foro da comarca de Goiânia (GO), sem prejuízo do direito do
          consumidor de escolher o foro do seu domicílio.
        </p>
        <p>
          Veja também a <Link href="/privacidade" className="text-marca-indigo underline">Política de Privacidade</Link>.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
