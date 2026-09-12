import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal, { Secao } from "@/components/pagina-legal";

// Política de Privacidade (LGPD, Lei 13.709/2018). Escrita a partir do que o sistema
// REALMENTE faz -- cada item aqui corresponde a código: e-mail no Supabase Auth, fotos
// no bucket privado com URL assinada de 1h, foto enviada ao fal pra gerar, cartão só na
// Stripe, original apagada quando o job falha.
//
// Não substitui advogado; antes de escalar, revisar com um.

export const metadata: Metadata = { title: "Política de Privacidade", description: "Como o Encena trata seus dados e suas fotos." };

const ATUALIZADO = "12 de setembro de 2026";

export default function Privacidade() {
  return (
    <PaginaLegal titulo="Política de Privacidade" atualizado={ATUALIZADO}>
      <p className="mt-4 text-neutral-700">
        Esta política explica quais dados o Encena coleta, por que, com quem compartilha e o que você pode exigir. Ela segue a Lei
        Geral de Proteção de Dados (Lei 13.709/2018).
      </p>

      <Secao n="1" titulo="Quem é o responsável">
        <p>
          O controlador dos dados é Vinicius Cardoso Lima, em Goiânia (GO), que também responde como encarregado (DPO). Para
          qualquer pedido sobre seus dados, escreva para <strong>contato@encena.app.br</strong>. Respondemos em até 15 dias.
        </p>
      </Secao>

      <Secao n="2" titulo="O que coletamos">
        <ul>
          <li><strong>Seu e-mail.</strong> É como você entra: mandamos um link de acesso, sem senha.</li>
          <li><strong>O que você preenche:</strong> nome, CRECI, WhatsApp, logo e cor da marca, nome e endereço dos imóveis. Tudo opcional, e usado só para aparecer nas suas fotos, vídeos e links.</li>
          <li><strong>As fotos e vídeos que você envia</strong> e os resultados gerados.</li>
          <li><strong>O uso do serviço:</strong> quais ações você fez, quando, quantos créditos gastou e o custo real de cada geração.</li>
          <li><strong>Dados de pagamento:</strong> processados pela Stripe. Recebemos apenas o identificador do cliente, o status da assinatura e o valor. <strong>Não vemos nem guardamos o número do seu cartão.</strong></li>
        </ul>
        <p>Não usamos cookies de rastreamento nem ferramentas de publicidade. O único armazenamento no seu navegador é o que mantém você logado.</p>
      </Secao>

      <Secao n="3" titulo="Por que usamos (base legal)">
        <ul>
          <li><strong>Executar o contrato</strong> (art. 7º, V): entrar na conta, gerar as imagens, cobrar, dar suporte.</li>
          <li><strong>Cumprir a lei</strong> (art. 7º, II): guardar registros de acesso e documentos fiscais pelo prazo exigido.</li>
          <li><strong>Legítimo interesse</strong> (art. 7º, IX): segurança, prevenção a abuso e melhoria do serviço, sempre com o mínimo de dados.</li>
        </ul>
      </Secao>

      <Secao n="4" titulo="Onde suas fotos ficam e quem as vê">
        <p>
          As fotos ficam num armazenamento <strong>privado</strong>: não existe endereço público para elas. Quando você abre o
          aplicativo, geramos um link temporário que vale <strong>uma hora</strong> e depois deixa de funcionar.
        </p>
        <p>
          Se você criar um link de compartilhamento, quem tiver aquele endereço vê as fotos daquele imóvel, sem precisar de conta.
          O endereço é um código aleatório impossível de adivinhar, e você desativa o link quando quiser: no mesmo instante ele
          para de abrir.
        </p>
        <p>
          Numa conta de imobiliária, o dono e os gestores veem quantas fotos e vídeos cada pessoa gerou no mês; não veem as
          imagens dos imóveis dos colegas.
        </p>
      </Secao>

      <Secao n="5" titulo="Com quem compartilhamos">
        <p>Só com quem é necessário para o serviço funcionar:</p>
        <ul>
          <li><strong>fal.ai</strong> (Estados Unidos): recebe a foto para gerar a edição e devolve o resultado. É o processamento de IA.</li>
          <li><strong>Supabase</strong> (Estados Unidos): banco de dados, login e armazenamento das imagens.</li>
          <li><strong>Vercel</strong> (Estados Unidos): hospedagem do site.</li>
          <li><strong>Stripe</strong>: pagamentos.</li>
        </ul>
        <p>
          Esses fornecedores ficam fora do Brasil, o que a LGPD permite mediante garantias contratuais (art. 33). Não vendemos
          seus dados, não os cedemos para publicidade e não usamos suas fotos para treinar modelos de IA.
        </p>
      </Secao>

      <Secao n="6" titulo="Por quanto tempo guardamos">
        <ul>
          <li><strong>Foto original e resultado:</strong> enquanto sua conta existir, porque é o seu histórico e o antes e depois dos links.</li>
          <li><strong>Arquivos temporários</strong> (máscara, foto de referência, pedaços de vídeo): apagados assim que a geração termina.</li>
          <li><strong>Geração que falhou:</strong> a foto original é apagada junto.</li>
          <li><strong>Registros de crédito e cobrança:</strong> cinco anos, por obrigação fiscal e de defesa em processo.</li>
        </ul>
      </Secao>

      <Secao n="7" titulo="Seus direitos">
        <p>A qualquer momento você pode pedir, por e-mail:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção do que estiver errado;</li>
          <li>uma cópia dos seus dados e das suas imagens (portabilidade);</li>
          <li>exclusão da conta e de tudo que não somos obrigados a guardar;</li>
          <li>informação sobre com quem compartilhamos;</li>
          <li>revisão humana de qualquer decisão automatizada.</li>
        </ul>
        <p>
          <strong>Decisão automatizada que existe aqui:</strong> quando você reporta um resultado ruim, uma inteligência artificial
          compara a foto original com o resultado e opina se houve falha. Essa opinião pode negar a devolução automática do
          crédito acima do limite diário de cortesia. Você pode pedir revisão humana respondendo para contato@encena.app.br.
        </p>
      </Secao>

      <Secao n="8" titulo="Segurança">
        <p>
          Tudo trafega criptografado. O acesso ao banco é restrito por regras que amarram cada linha ao seu dono. As chaves de
          administração ficam apenas no servidor. Se acontecer um incidente que possa te afetar, avisamos você e a Autoridade
          Nacional de Proteção de Dados, como manda o art. 48.
        </p>
      </Secao>

      <Secao n="9" titulo="Fotos com pessoas e imóveis de terceiros">
        <p>
          Fotos de imóvel costumam não ter pessoas. Se você enviar uma imagem com alguém identificável, é você quem responde por
          ter a autorização dessa pessoa. Não use o Encena para tratar dados de crianças e adolescentes.
        </p>
      </Secao>

      <Secao n="10" titulo="Mudanças">
        <p>
          Se esta política mudar, avisamos por e-mail e atualizamos a data no topo. Veja também os{" "}
          <Link href="/termos" className="text-marca-indigo underline">Termos de uso</Link>.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
