# Encena CRM: enviar pelo WhatsApp está dentro das regras?

> **Não é parecer jurídico.** Este texto resume uma pesquisa em fontes oficiais, com uma segunda checagem. Serve para você decidir e para levar a um advogado.

## 1. Resposta direta

O jeito de enviar está certo. O link wa.me com texto pronto é um recurso oficial do WhatsApp, e o corretor apertando enviar, um por um, não quebra nenhuma regra. O que conta é **para quem** a mensagem vai. O WhatsApp só permite mensagem comercial a quem deu o número e aceitou receber. A LGPD exige que o corretor tenha um motivo legítimo para usar o dado: quem pediu informação tem esse motivo, e quem veio de lista comprada ou raspada quase nunca tem.

Se o corretor cadastrar desconhecidos, quem perde primeiro é ele. O número pode ser restringido ou banido, ele pode receber reclamações e, em SP e no PR, corre risco com o cadastro estadual de bloqueio.

A Encena fica **resguardada só em parte**. No CRM ela é a "operadora" dos dados e, em regra, quem responde é o corretor. Mas não existe resguardo total. O risco cai com cinco coisas:
- nunca usar os dados dos leads para fins da Encena;
- ter termos e um contrato de dados;
- ter travas no produto que provem cuidado;
- responder sempre à ANPD;
- operar por empresa, não por pessoa física.

## 2. Quem responde pelo que

- **O corretor ou a imobiliária é o "controlador" dos dados.** É quem decide quem cadastrar e para quê, e responde pela base legal de cada lead (LGPD art. 5º VI e art. 7º; guia de agentes da ANPD, Exemplo 12).
- **A Encena é a "operadora".** Ela trata os dados só em nome do corretor e segue as instruções dele (LGPD art. 5º VII e art. 39).
- **A Encena só responde junto em dois casos:** se descumprir a LGPD ou se não seguir as instruções lícitas do corretor (art. 42 §1º I).
  - Ela fica livre se provar que não violou a lei ou que a culpa foi só de outra pessoa (art. 43).
  - Se pagar algo por culpa do corretor, pode cobrar dele depois (art. 42 §4º; Código Civil art. 934).
- **Se a Encena usar dados de lead para ela mesma, vira controladora e responde direto.** Exemplos: marketing próprio, treinar IA, cruzar leads entre contas, vender (art. 5º VI; guia da ANPD, itens 8 e 53).
- **A conta de WhatsApp é do corretor.** Ele é o único responsável pela autorização do lead e por atender quem pede para parar (Política de Mensagens do WhatsApp Business). Punição da Meta cai no número dele.
- **Se a Encena ligar a API oficial como "Tech Provider"**, ela responde perante a Meta pelo uso dos clientes "como se fosse seu", junto com eles (Termos de Tech Provider da Meta, seção 2.1, atualizados em 31/07/2026).

## 3. O que pode dar errado com desconhecidos

**Para o corretor**

| O que acontece | Risco |
|---|---|
| O WhatsApp **restringe a conta**: ele não inicia conversa com número novo e não usa o WhatsApp Web (o wa.me no computador para de funcionar). O **banimento** pode vir depois ou direto, e com ele se perde o acesso ao histórico e aos backups. | **Alto** |
| **Ação judicial.** Uma mensagem educada costuma ser vista como "mero aborrecimento" (STJ, REsp 844.736). Insistir depois de um pedido para parar já gerou indenizações de R$ 1,5 mil a R$ 10 mil, mas em casos de empresas grandes e ligações em volume. | **Médio** |
| **Cadastro de bloqueio.** Em SP (Lei 17.832/2023, arts. 127 a 129) e no PR (Lei 22.130/2024, arts. 177 a 181), o cadastro cobre mensagem de aplicativo. A multa segue o CDC. Em SP, dizer que isso alcança o corretor é interpretação forte, não texto literal. | **Médio** |
| **ANPD.** Tratar dado sem base legal é infração. A única multa por lista de WhatsApp foi a da Telekall, em 2023: R$ 14.400 no total, contra uma empresa que *oferecia* a lista. | **Médio** |
| **CRECI.** Divulgar imóvel sem autorização escrita do dono ou sem o número do CRECI (Lei 6.530/78, art. 20 III e IV). | **Médio** |
| O "Não Me Perturbe" **não se aplica**: vale só para empresas de telecom e bancos, e só para ligações. O site certo é naomeperturbe.com.br. | Nenhum |

**Para a Encena**

| O que acontece | Risco |
|---|---|
| **A ANPD pede informações e ninguém responde.** Isso é infração grave e virou uma segunda multa no caso Telekall (Res. CD/ANPD 1/2021, art. 5º; Res. 4/2023, art. 8º §3º II). | **Médio**, e fácil de evitar |
| **Ser incluída em ação ou denúncia** porque o produto "facilita lista fria". Não achei nenhum caso de CRM condenado pelo mau uso do cliente. | **Incerto.** Baixo no envio manual. Sobe com disparo automático, importação sem origem ou marketing de "disparo". |
| **Ação do WhatsApp.** Os Termos proíbem "ajudar outros" a mandar mensagens em massa, e o WhatsApp avisa que toma medidas judiciais contra isso. Em 2020, uma liminar proibiu a Yacows de oferecer disparo em massa pelo WhatsApp e de usar a marca. | **Baixo** no manual. **Alto** se automatizar o WhatsApp Web ou anunciar "disparo". |
| **Usar dados de lead para fins próprios.** A Encena vira controladora sem base legal nenhuma. | **Alto**, mas só depende de vocês |
| **Patrimônio pessoal.** Os Termos atuais dizem que o serviço "é operado por Vinicius Cardoso Lima". Uma condenação cai no seu nome. | **Alto** |
| **Limite de responsabilidade dos Termos.** Não vale contra o lead, que não assinou nada. Pode ser anulado contra o corretor pessoa física, se ele for tratado como consumidor. | **Médio** |
| **API ligada como Tech Provider.** A Encena responde junto com o cliente perante a Meta. | **Alto**, só se ligar |

## 4. O que colocar nos termos e no contrato

1. **Papéis.** Nos leads, o corretor é o controlador e a Encena é a operadora. Em conta de equipe, a imobiliária é a controladora e decide o que acontece com os leads quando um corretor sai.
2. **Uso proibido do CRM:**
   - lista comprada, alugada, raspada ou de terceiros;
   - disparo em massa ou automação do WhatsApp;
   - cadastrar quem não passou o contato;
   - ignorar quem pediu para parar;
   - anotar saúde, religião ou dados de crianças.
3. **Declaração do corretor.** Ele declara que tem base legal para cada lead e que, no caso do WhatsApp, a pessoa passou o número e aceitou receber mensagens dele.
4. **Anexo de tratamento de dados (DPA).** Deve trazer:
   - finalidade limitada às instruções do corretor;
   - lista de fornecedores (Supabase, Vercel, fal.ai e Meta, se usar a API);
   - medidas de segurança;
   - aviso de incidente ao corretor em prazo curto (sugestão: 24 a 48 horas; não é prazo da lei);
   - repasse ao corretor dos pedidos de titulares que chegarem à Encena;
   - exclusão dos dados ao encerrar a conta;
   - cooperação com a ANPD.
5. **Compromisso da Encena.** Nunca usar dados de leads para marketing próprio, IA, cruzamento entre contas ou venda. E se reservar o direito de não executar uma instrução que pareça ilegal (a Kenlo tem uma cláusula assim).
6. **Direito de cobrar do corretor** o que a Encena pagar por culpa dele. Cuidado: cláusula ampla demais pode cair em contrato de adesão (Código Civil art. 424). Não confirmei se multa da ANPD pode ser repassada.
7. **Suspensão com gatilhos claros:** denúncias de leads, muitos "pediu para parar", importação sem origem, pedido da Meta ou de autoridade. Primeiro suspende só o envio, avisa e dá prazo para o corretor explicar. Gatilho vago, como "qualquer suspeita", pode ser considerado abusivo (CDC art. 51 IV).
8. **WhatsApp.** A conta é do corretor, a Encena não controla restrição nem banimento, e o recomendado é usar o app WhatsApp Business, não o comum.
9. **Limite de responsabilidade reescrito:** com destaque visual, sem "em qualquer caso", ressalvando dolo. Uma versão mais firme para imobiliária com CNPJ.
10. **Política de Privacidade com seção nova** sobre leads e sobre quem abre o link do vídeo ou book. Nesses registros de acesso, e no log guardado para defesa da Encena, ela é controladora e precisa informar a base legal.

## 5. Travas no produto (em ordem de prioridade)

1. **Zero automação do WhatsApp.** Nada de extensão, robô ou clique automático: só wa.me manual e, se quiser, a API oficial. *Motivo: evita "ajudar outros" a violar os Termos do WhatsApp.*
2. **Origem obrigatória do lead**, em lista fechada: portal, site, anúncio, indicação, placa, atendimento, cliente antigo, WhatsApp recebido. Sem opção "lista comprada". *Motivo: é a prova da base legal e o registro que o art. 37 pede.*
3. **Declaração antes do 1º envio:** "essa pessoa me passou o contato e aceitou receber mensagens minhas", com data, usuário e versão do texto. *Motivo: é a autorização que a Meta exige. Lead de portal não conta como autorização automática.*
4. **Botões "pediu para parar" e "número errado"**, que travam o wa.me e a API para aquele número. *Motivo: insistir depois do pedido é o que dá banimento e condenação.* O número bloqueado guardado, mesmo cifrado, continua sendo dado pessoal e precisa constar na política.
5. **Log por conta:** quem cadastrou, a origem, o link gerado, o envio pela API, o opt-out, a exclusão. *Motivo: prova que a Encena só seguiu instruções (arts. 42 e 43).*
6. **Leads isolados por conta.** Nada de cruzar entre contas, treinar IA ou "descobrir contatos". *Motivo: mantém a Encena como operadora.*
7. **Mensagem pronta que se identifica:** nome, "corretor de imóveis", CRECI, de onde veio o contato e "se não quiser receber, responda SAIR". O link vai depois da resposta. *Motivo: diminui denúncias e cumpre a transparência (LGPD art. 9º; Res. COFECI 1.065/2007).*
8. **CRECI obrigatório no perfil.** *Motivo: é proibido facilitar a atuação de quem não é inscrito (Lei 6.530/78, art. 20 II).*
9. **Limite diário de primeiros contatos e no máximo 1 ou 2 tentativas sem resposta.** Depois disso o lead vai para "sem resposta". *Motivo: muitas conversas novas disparam a restrição. Segundo a imprensa, o WhatsApp testa um limite mensal de mensagens sem resposta.*
10. **Importação de planilha com origem em cada linha** (linha sem origem não entra), limite de linhas, e os importados entram como "frios". *Motivo: é o caminho mais provável para lista comprada.*
11. **Aviso para lead frio com DDD de SP (11 a 19) ou do PR (41 a 46).** No PR, avisar também fora do horário permitido: 8h às 18h em dias úteis, 10h às 16h aos sábados, nunca domingo e feriado. *Motivo: os cadastros de bloqueio desses estados incluem mensagens.*
12. **Exclusão real e exportação por lead**, com um aviso fixo no campo de observações: "não anote saúde, religião ou dados de crianças". *Motivo: direitos do titular (art. 18) e regra de dado sensível (art. 11).*
13. **Canal público para quem não é cliente** pedir "não me contate". A Encena responde que não é a controladora e indica quem é. *Motivo: a LGPD permite essa resposta (art. 18 §3º e §4º I).*
14. **No modo API:** envio só para quem tem autorização registrada e com modelo aprovado pela Meta, e pausa automática se a qualidade cair. *Motivo: a Política da Meta exige, e o número é o mesmo do app.*
15. **Selo "decoração virtual" ligado por padrão** no material enviado. *Motivo: imagem encenada sem aviso pode ser publicidade enganosa (CDC art. 37).*
16. **Mensagem pronta nunca pede RG, CPF ou dados bancários.** Para isso, usar um formulário seguro. *Motivo: a Política do WhatsApp proíbe pedir identificadores sensíveis. Não confirmei se o CPF entra nessa lista.*

**Fora do código:** nunca anunciar "disparo", "envio em massa" ou "automático no seu WhatsApp". Não usar "WhatsApp" no nome de recurso nem como verbo (regras de marca da Meta).

## 6. Recomendação

**Sim, procure um advogado de proteção de dados e direito digital antes de lançar o CRM.** Antes disso, duas providências:

- **Abrir empresa.** Pelo que achei, MEI e empresário individual não separam o patrimônio pessoal, e uma sociedade limitada (pode ter um sócio só) separa melhor. Não verifiquei isso: confirme com contador.
- **Ler os novos termos do WhatsApp para empresas.** Eles valem a partir de **23/09/2026, daqui a 6 dias**, e a prévia já está publicada. Isso é obrigatório antes de ligar a API.

**O que levar ao advogado:**
1. Os Termos e a Política atuais, com os pontos marcados:
   - serviço operado por pessoa física (termos, linha 25);
   - limite de responsabilidade "em qualquer caso" (termos, linha 103);
   - "melhoria do serviço" como legítimo interesse (privacidade, linha 46);
   - nada sobre leads.
2. O desenho do CRM: cadastro, importação, wa.me, opt-out, API.
3. A lista de fornecedores e onde os dados ficam: Supabase, Vercel e fal.ai nos EUA, mais a Meta.
4. Estas perguntas:
   - O corretor autônomo é consumidor da Encena? O limite de responsabilidade vale contra ele?
   - Dá para repassar ao corretor multa ou custo de processo da ANPD?
   - Ser Tech Provider direto ou operar por um parceiro (BSP)? Muda a responsabilidade perante a Meta?
   - Como ficam as cláusulas-padrão da ANPD (Res. 19/2024) com esses fornecedores? O prazo venceu em 2025 e o texto precisa ser adotado sem alteração. Ou é melhor hospedar os leads no Brasil ou na União Europeia?
   - A lei de SP vale para mensagem de corretor? O Decreto SP 53.921/2008 ainda está em vigor? O que dizem as leis do RS e do RJ?
   - O CDC art. 43 §2º (aviso de abertura de cadastro) se aplica a CRM?
   - A Encena se enquadra como agente de pequeno porte (Res. CD/ANPD 2/2022)? E se o CRM ganhar pontuação de lead por IA?
   - Vale contratar seguro de responsabilidade profissional e seguro cyber? Em geral esses seguros cobrem a defesa e as falhas do próprio sistema, mas é comum multa ficar de fora.
5. Termos de mercado para comparar: Kenlo, Tecimob e Zenvia (para a API).

## 7. Fontes

**Leis**
- LGPD (compilada): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- CDC: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Marco Civil da Internet: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm
- Código Civil: https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm
- Lei 6.530/78 (corretores): https://www.planalto.gov.br/ccivil_03/leis/l6530.htm
- SP, Lei 17.832/2023: https://www.al.sp.gov.br/repositorio/legislacao/lei/2023/lei-17832-01.11.2023.html
- PR, cadastro de bloqueio: https://www.procon.pr.gov.br/servicos/Consumidor/Consultas/Consultar-Cadastro-de-Bloqueio-de-Telemarketing-qzoOn6r1

**ANPD**
- Guia de agentes de tratamento: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_agentes_de_tratamento_e_encarregado___defeso_eleitoral.pdf/@@display-file/file
- Guia de legítimo interesse: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/copy_of_guia_legitimo_interesse.pdf/@@display-file/file
- Multa Telekall: https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aplica-a-primeira-multa-por-descumprimento-a-lgpd/comunicado-a-imprensa-jul-2023.pdf/@@display-file/file
- Decisões em processos sancionadores: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/decisoes-em-processos-sancionadores-1
- Res. 2/2022 (pequeno porte): https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022
- Res. 4/2023 (dosimetria): https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-regulamento-de-dosimetria/Resolucaon4CDANPD24.02.2023.pdf/@@display-file/file
- Res. 15/2024 (incidentes): https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-15-de-24-de-abril-de-2024-556243024
- Res. 18/2024 (encarregado): https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-18-de-16-de-julho-de-2024-572632074
- Lista de regulamentações (Res. 19/2024 e 32/2026): https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd
- Res. 30 e 31/2025 (DOU): https://dspace.mj.gov.br/bitstream/1/16471/2/RES_ANPD_2025_31.pdf

**WhatsApp e Meta**
- Política de Mensagens para Empresas: https://whatsappbusiness.com/policy/
- Termos de Serviço: https://www.whatsapp.com/legal/terms-of-service
- Termos do WhatsApp Business: https://www.whatsapp.com/legal/business-terms
- Novos termos (23/09/2026): https://faq.whatsapp.com/1017485114093363
- Diretrizes de Mensagens: https://www.whatsapp.com/legal/messaging-guidelines
- Uso responsável: https://faq.whatsapp.com/361005896189245
- Conta restrita: https://faq.whatsapp.com/717472490411581
- Banimento: https://faq.whatsapp.com/465883178708358
- Link wa.me: https://faq.whatsapp.com/5913398998672934
- Ação contra quem ajuda envio em massa: https://faq.whatsapp.com/5957850900902049/?locale=en_US
- Opt-in na API: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- Termos de Tech Provider: https://www.facebook.com/legal/BM-tech-provider-terms
- Coexistência: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- Regras de marca: https://www.meta.com/pt-br/brand/resources/whatsapp/whatsapp-brand/
- Limite de mensagens sem resposta (imprensa): https://techcrunch.com/2025/10/17/whatsapp-will-curb-the-number-of-messages-people-and-businesses-can-send-without-a-response

**COFECI, CONAR e Não Me Perturbe**
- Código de Ética COFECI: https://intranet.cofeci.gov.br/arquivos/legislacao/resolucao_326_1992.pdf
- Res. COFECI 1.065/2007: https://intranet.cofeci.gov.br/arquivos/legislacao/resolucao_1065_07_nova.pdf
- CONAR: https://www.conar.org.br/codigos
- Não Me Perturbe: https://www.naomeperturbe.com.br/

**Decisões de tribunais**
- STJ, REsp 844.736: https://www.lexml.gov.br/urn/urn:lex:br:superior.tribunal.justica;turma.4:acordao;resp:2009-10-27;844736-1043981
- TJDFT, telemarketing abusivo: https://www.tjdft.jus.br/consultas/jurisprudencia/jurisprudencia-em-temas/cdc-na-visao-do-tjdft-1/praticas-abusivas/telemarketing-abusivo
- TJDFT, conta desativada por uso comercial: https://www.tjdft.jus.br/institucional/imprensa/noticias/2020/outubro/turma-mantem-decisao-que-nega-danos-morais-por-uso-indevido-de-aplicativo-de-mensagens
- Yacows (Conjur): https://www.conjur.com.br/2020-abr-10/yacows-proibida-enviar-mensagens-massa-whatsasp/
- STF, Temas 987 e 533: https://www.stf.jus.br/arquivo/cms/noticiaNoticiaStf/anexo/Informac807a771oa768SociedadeArt19MCI_vRev.pdf

**Termos de outras empresas**
- Kenlo: https://blog.kenlo.com.br/docs/Kenlo-Imob-Termo-de-Servico.pdf
- Tecimob: https://tecimob.com.br/termos-de-uso/
- Zenvia (API do WhatsApp): https://zenvia.com/termos/termos-whatsapp-business-solution/

**Não confirmado:** o número do limite de mensagens sem resposta, e se o teste chegou ao Brasil. Se a coexistência já existe no Brasil. As leis do RS e do RJ. Se o art. 7º V da LGPD vale para corretagem (é leitura nossa). O texto completo dos novos termos da Meta.

> **Não é parecer jurídico.** Use como roteiro para a conversa com o advogado.