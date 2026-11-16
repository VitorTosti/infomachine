# Triagem com prova e avaliação estética por peça

Data: 16/11/2026 · Branch: `VitorTosti/feat-orquestrar-equipe-qa` (PR #2)

## Por que

O dono da empresa relatou que muitas máquinas saem com triagem errada. Os problemas mais frequentes estão em quatro testes: **teclado, som, clique do mouse/touchpad e portas USB**. Acontecem duas coisas:

1. **O app falha:** não reconhece algo que funciona, o técnico fica travado e acaba aprovando "no olho".
2. **O defeito escapa:** a máquina sai aprovada e depois se descobre que o som, o clique ou a USB não funcionavam.

Hoje, quase todos os itens do checklist são autodeclarados: o técnico clica em **Aprovado** e o app aceita. Só o teclado e o touchpad medem alguma coisa, e o teclado é justamente o teste instável.

## Objetivo

Nesses quatro testes, o app deve **funcionar de forma confiável** e **não aceitar "Aprovado" sem uma evidência de que o teste foi feito**. Quando o app não conseguir detectar algo que funciona, o técnico ainda consegue concluir a etapa por **confirmação manual com justificativa**. Isso fica visível no relatório.

A frente estética acrescenta uma **inspeção guiada por peça**, com imagens de referência, registro dos detalhes encontrados e sugestão explicada de grade A/B/C/D. As definições e as regras de cada grade dependem de aprovação do responsável pela empresa antes da implementação do veredito.

Este documento descreve o plano. A nova etapa estética e as novas exigências de evidência ainda não estão implementadas. O vínculo atual com a serial e o rastreador será reaproveitado, sem refazer a identificação dos equipamentos.

### Limites e etapas posteriores

- Os testes de funcionamento de câmera, tela, carregador, rede e HDMI continuam como estão nesta frente.
- Detecção automática de USB no **macOS**: lá a USB continua manual, como hoje.
- A avaliação estética está incluída como uma frente própria, detalhada na seção 7. Ela não muda os critérios nem o resultado dos testes de funcionamento.
- O novo padrão de apresentação dos relatórios fica para uma etapa posterior. A inclusão dos resultados estéticos deve preservar o formato atual e os registros antigos.
- Publicação no NAS: só depois da validação em bancada, fora desta implementação.

### O que tornaria a entrega um fracasso, mesmo funcionando

- O técnico ficar **bloqueado** sem saída quando a detecção falhar. Sempre deve existir o caminho manual com justificativa.
- Ações de teclado contarem como clique, ou o tom nunca ter tocado e mesmo assim o item ser aprovado.
- Registros antigos de testes deixarem de abrir, ou a versão Mac quebrar.
- O app ficar mais lento ou travar na tela de testes.

## Restrições

- **Windows:** a interface roda no Edge em modo app. O PowerShell (`InfoNotebookWindowsPreview.ps1`) serve os arquivos e uma ponte local (`localBridge`) **de uma só thread**, que atende uma requisição por vez num laço com espera de 100 ms. Qualquer rota nova precisa responder rápido para não travar o resto da interface.
- **macOS:** usa `mac-ui/server.py`. O modo portátil (`portable.js`) pode rodar sem ponte local (`runtime.localBridgeUrl` vazio).
- A lista de itens obrigatórios do checklist está repetida em três lugares, e os três precisam ser alterados juntos:
  - `mac-ui/test-checklist.js` (catálogo);
  - `Save-LocalTestRecord` em `InfoNotebookWindowsPreview.ps1` (`$requiredIds`);
  - `mac-ui/server.py` (`required_ids`).
- Os testes do projeto são scripts `node`, `python` e `powershell` em `CoreCAIJ/*.Tests.*`, executados a partir da raiz. Toda mudança precisa vir com testes nesse formato.
- O prazo é curto, de um ou dois fins de semana. Por isso a ordem de entrega abaixo importa, para que cada parte possa ser entregue sozinha.

## Abordagens consideradas

| | Abordagem | Contrapartida |
|---|---|---|
| **A (escolhida)** | **Teste confiável e com prova:** cada teste coleta uma evidência automática e só libera "Aprovado" com ela. Se a detecção falhar, há confirmação manual com justificativa. | É a mais trabalhosa. A detecção de USB é a maior parte do esforço. |
| B | Só corrigir os bugs e melhorar as instruções. | Barata, mas o técnico continua podendo aprovar sem testar. Resolve metade do problema. |
| C | Exigir sequência e tempo mínimo por teste, sem detecção. | Fácil de burlar: basta esperar o tempo passar. |

O dono do projeto escolheu a **A**, para atacar os dois lados do problema. As decisões que foram dele: Windows primeiro, Mac depois; ordem som, clique, teclado, USB.

## Design

### 1. Modelo de evidência (base comum)

- Cada item do checklist ganha um campo opcional `evidence`: `{ source: "auto" | "manual", detail: string, at: ISO-8601 }`.
- Alguns itens são marcados no catálogo como **exigem evidência** (`requiresEvidence: true`). Nesses itens:
  - **Aprovado** fica desabilitado até existir `evidence.source === "auto"`. O motivo aparece no próprio item, por exemplo "Toque o lado esquerdo para liberar".
  - Um botão **Confirmar manualmente** pede uma justificativa obrigatória e grava `evidence.source = "manual"` com o texto. Só então Aprovado é liberado.
  - Reprovado, Não testado e Não se aplica continuam como hoje: não exigem evidência, mas Reprovado e Não testado exigem justificativa.
- O relatório e o histórico mostram **"confirmado manualmente: <motivo>"** nos itens aprovados sem detecção automática.
- A evidência é invalidada (item volta a pendente) quando o equipamento muda ou a triagem é limpa. Hoje isso já acontece em `syncTestEquipment` e `invalidateTestConfirmation`.
- Nos três validadores (JS, PS e Python), um item com `requiresEvidence` e resultado `passed` sem `evidence` é rejeitado. Registros antigos já salvos não são revalidados, porque a validação ocorre só ao salvar.
- Quando a detecção não está disponível na plataforma (Mac ou modo portátil sem ponte, no caso da USB), o item **não exige evidência**: o comportamento é o de hoje. Isso fica explícito na interface: "Detecção automática indisponível neste modo".

### 2. Som (primeiro)

- O item `audio.speakers` é substituído por três:
  - `audio.left`: "Alto-falante esquerdo sem distorção";
  - `audio.right`: "Alto-falante direito sem distorção";
  - `audio.microphone`: "Microfone capta a voz com clareza".
- O tom de teste ganha botões **Tocar esquerda** e **Tocar direita**, usando `StereoPannerNode` com pan −1 e +1. Isso pega o alto-falante queimado de um lado só.
- Evidência:
  - `audio.left` e `audio.right`: o tom do respectivo lado terminou de tocar com volume acima de 0.
  - `audio.microphone`: o medidor ficou acima de um limiar por um tempo mínimo acumulado. Como o ruído de fundo não deve passar, o limiar exato e o tempo ficam a cargo do construtor (ponto de partida: nível > 25 por 500 ms acumulados), calibrados com um teste real.
- O texto de ajuda passa a citar os dois lados e o microfone.

### 3. Clique do touchpad/mouse (segundo)

- `listenForMouseButtons` deixa de contar **eventos gerados pelo teclado**:
  - `click` com `detail === 0` (Enter ou espaço);
  - `contextmenu` sem `pointerdown`/`mousedown` real próximo (tecla Menu ou Shift+F10).
- Toques no touchpad (*tap-to-click*), que geram eventos de ponteiro reais, continuam valendo. O construtor deve conferir a heurística em um notebook com tap habilitado.
- O item `trackpad.buttons` exige evidência de **clique esquerdo e direito** detectados. O clique do meio continua sendo mostrado, mas **não é obrigatório**, porque muitos touchpads não têm botão do meio.
- O item `trackpad.movement` exige evidência de movimento: no mínimo 20 eventos `pointermove` na área de teste.

### 4. Teclado (terceiro)

- A correção de foco e captura já está na PR #2.
- O item `keyboard.keys` exige evidência: **todas as teclas visíveis do mapa** registradas, seja pela tecla física, seja pela confirmação manual por clique já existente (Fn, Prt Sc, F11 no Mac).
- Se faltarem teclas, a confirmação manual vem **pré-preenchida com a lista das teclas não reconhecidas**. O técnico completa o motivo, por exemplo "tecla inexistente neste modelo".

### 5. USB (por último; só Windows)

- **Nova rota na ponte local:** `GET /usb-devices`. Ela retorna os dispositivos USB presentes, cada um com:
  - um identificador estável (`InstanceId`);
  - o nome amigável;
  - a **localização física da porta** (por exemplo `Port_#0002.Hub_#0003`, da propriedade de localização do dispositivo).

  A rota precisa responder em poucas centenas de milissegundos, por causa da ponte de uma só thread. O construtor escolhe a consulta (CIM ou PnP) medindo o tempo. Se nenhuma for rápida, a coleta vai para um processo em segundo plano que grava um arquivo, como já é feito com `-DeviceOutput`.
- **No front-end**, com a etapa USB aberta:
  - o app tira uma foto inicial da lista e passa a consultar a rota a cada ~1,5 s;
  - a consulta para quando o técnico sai da etapa;
  - todo dispositivo novo vira uma **detecção**: "Detectado: <nome> na porta <localização>".
- **Fluxo:** "Conecte o pendrive em uma porta". A cada detecção em uma **localização ainda não usada**, o app cria (ou preenche a próxima porta pendente) um item `usb.port-N` com evidência automática e um nome sugerido ("Porta N"), que o técnico pode renomear.
- Reconectar na mesma localização **não** conta uma porta nova.
- Uma porta só pode ser aprovada com detecção, ou com confirmação manual justificada.
- `usb.inventory` ("Conferi e listei todas as portas USB presentes") continua manual.
- `portable.js` repassa `/api/usb-devices` à ponte local quando `runtime.localBridgeUrl` existe. Sem ponte, e no Mac, a detecção fica indisponível e a USB funciona como hoje.

### 6. Decisões tomadas na revisão (escolhas do autor do design, a conferir)

- **Mac nesta entrega:** o catálogo é compartilhado, então os IDs novos (`audio.left`, `audio.right`, `audio.microphone`) valem nas duas plataformas, e `server.py` passa a aceitá-los. A **exigência de evidência** fica ativa **só no Windows** (`runtime.platform === "windows"`). No Mac, os itens continuam sendo aprovados como hoje, e `server.py` não exige evidência.
- **Validador quando a detecção falha:** no Windows, o PowerShell **sempre** exige evidência (automática ou manual) nos itens marcados. "Detecção indisponível" na tela significa apenas que o técnico precisa usar **Confirmar manualmente**, com justificativa. Não existe sinalizador de "indisponível" aceito pelo validador, para que ninguém consiga contornar a regra.
- **Microfone negado ou ausente:** segue a mesma regra. Sem evidência automática, a saída é a confirmação manual, ou Reprovado/Não testado com justificativa.
- **Identidade da porta USB:** a localização física é uma aproximação. O técnico pode **remover uma detecção errada**, por exemplo a mesma tomada detectada duas vezes. Dispositivos já conectados no momento da foto inicial aparecem como "já conectado em <localização>". O técnico pode usá-los como evidência da porta com um clique, porque um receptor de mouse funcionando prova a porta. Não há mapeamento de portas por modelo.
- **Portas pré-criadas "USB 1" e "USB 2":** no Windows com detecção disponível, a lista começa **vazia** e as portas surgem pelas detecções ou por "Adicionar porta" manual, que exige confirmação manual. Sem detecção (Mac ou modo portátil), as duas portas pré-criadas continuam como hoje.

### 7. Triagem estética guiada por peça

#### Fluxo proposto

1. Mostrar uma imagem que identifique a peça a ser inspecionada, rotulada como **Imagem de referência**.
2. Fazer a pergunta **Em que estado está esta peça?**, com opções claras e exemplos visuais.
3. Registrar os detalhes encontrados e, quando disponível, uma foto da própria máquina avaliada.
4. Repetir a inspeção nas demais regiões.
5. Apresentar um resumo por peça, os motivos da classificação e a grade sugerida.
6. Pedir a conferência final do técnico e registrar a grade confirmada. Se ele escolher outra grade, registrar também o motivo da alteração.

A imagem de referência orienta a inspeção; ela não é uma foto nem uma evidência da condição da máquina atual. As fotos anexadas pelo técnico devem ficar identificadas separadamente.

#### Peças e regiões

| Região | Pontos de inspeção |
|---|---|
| Tampa superior | Riscos, marcas, amassados e outros danos visíveis |
| Tela | Marcas, riscos e danos na superfície |
| Moldura da tela | Trincas, quebras e encaixes |
| Base do teclado e apoio das mãos | Desgaste, riscos, trincas e peças ausentes |
| Teclado e touchpad | Conservação, desgaste visível e integridade das peças |
| Laterais e conectores | Danos visíveis, acabamento e peças ausentes |
| Dobradiças | Danos visíveis na região e no acabamento |
| Tampa inferior | Marcas, trincas, parafusos e apoios ausentes |

O roteiro deve respeitar o tipo de equipamento. A inspeção visual da tela, do teclado, do touchpad e dos conectores não substitui os testes de funcionamento. Por exemplo, a aparência da dobradiça e sua capacidade de sustentar a tela são verificações distintas.

#### Exemplo: tampa superior

**Pergunta:** Em que estado a tampa superior está?

- Sem marcas estéticas relevantes.
- Riscos leves ou pequenas marcas de uso.
- Riscos ou marcas mais evidentes.
- Amassados.
- Trinca, quebra ou outro dano visível.
- Não foi possível avaliar.

Essas são opções iniciais para validar com o responsável, sem correspondência automática com A/B/C/D enquanto as regras não forem aprovadas. As opções devem ser adaptadas a cada peça.

Deve ser possível registrar mais de um detalhe na mesma peça, para que um risco não apague o registro de uma trinca, por exemplo. Para cada problema, registrar **tipo, localização, extensão e observação**, com possibilidade de anexar uma foto da própria máquina.

**Não foi possível avaliar** representa uma pendência e não pode ser interpretado como peça sem marcas. Quando uma peça não existir naquele tipo de equipamento, permitir **Não se aplica**, mantendo a observação opcional, conforme a regra já acordada.

#### Veredito e grades A/B/C/D

- As quatro opções da nova etapa estética são **A, B, C e D**, cada uma com definição, exemplos e limites aprovados pelo responsável.
- A diferença entre C e D precisa ficar especialmente clara para evitar classificações sobrepostas.
- A sugestão de grade deve resultar de regras explícitas sobre os achados, com uma explicação legível: quais peças e detalhes levaram à sugestão.
- Não usar média das notas das peças: um dano importante não deve desaparecer porque as outras partes estão bem conservadas.
- A classificação será guiada pelos registros do técnico e pelas referências; não está prevista classificação automática por análise de imagem.
- Se houver peça obrigatória não avaliada ou caso sem regra definida, mostrar **Avaliação estética pendente de revisão**, sem apresentar uma grade final como confirmada.
- O técnico revisa o resumo e confirma a grade. Uma alteração em relação à sugestão exige motivo registrado e fica visível para conferência posterior.
- Manter separados **resultado dos testes de funcionamento** e **grade estética**. Grade A na aparência não representa aprovação de hardware.
- Preservar a leitura de classificações antigas, inclusive RMA quando existir no histórico; não reinterpretar os registros anteriores como avaliações feitas pelo novo roteiro.

#### Registro e relatório

O registro planejado deve guardar a avaliação de cada peça, seus detalhes e fotos disponíveis, a versão das regras de classificação, a grade sugerida e seu motivo, a grade confirmada, eventual justificativa de alteração, técnico e data. Usar o vínculo já existente com a serial e o rastreador.

O resumo estético deve compor o relatório da triagem destinado à Ordem de Serviço no AlterTag. A atualização de uma Ordem de Serviço já existente precisa respeitar o contrato da integração e não pode alterar seu status ou criar outro rastreador apenas para registrar a avaliação. Não indicar envio concluído antes da confirmação da integração.

O novo layout de relatório discutido com o usuário permanece para uma fase posterior. Registros antigos devem continuar acessíveis e identificados como históricos, sem ganhar uma grade ou uma confirmação novas automaticamente.

#### Dependências e aceite da frente estética

Antes de implementar o veredito, aprovar com o responsável as definições A/B/C/D, as imagens de referência, a lista de peças por tipo de equipamento e as regras para achados e casos duvidosos.

Critérios de aceite:

- Cada peça aplicável aparece com imagem de referência, pergunta e opções adequadas.
- Mais de um detalhe na mesma peça é preservado, com localização e extensão.
- Foto de referência e foto da máquina avaliada são distinguíveis.
- Nenhuma peça começa implicitamente como sem defeitos; itens não avaliados permanecem pendentes.
- A mesma combinação de achados e a mesma versão das regras produzem a mesma sugestão e explicação de grade.
- Um dano relevante não é diluído pela média das demais peças.
- A alteração da grade sugerida registra motivo; a aparência não aprova os testes de funcionamento.
- Registros legados continuam legíveis, e o relatório mantém o vínculo com o rastreador existente.
- O responsável e os técnicos validam o roteiro em máquinas reais e revisam as divergências antes da publicação no NAS.

## Ordem de entrega e testes

Cada etapa é entregável sozinha, com testes passando.

1. Base de evidência, já com o som. Inclui os validadores JS, PS e Python com os novos IDs.
2. Clique e movimento.
3. Evidência do teclado.
4. Detecção de USB.
5. Frente estética: aprovar critérios e referências, implementar checklist por peça, resumo e veredito explicado, integrar o registro e validar em bancada. A definição das regras e das imagens pode ocorrer enquanto a frente de hardware é desenvolvida.

Os testes novos ou atualizados seguem o padrão existente: VM com DOM simulado em `.cjs`, como `KeyboardLayout.Tests.cjs`; validadores em `TestRecords.Tests.ps1` e `.py`; e um teste da rota USB com um coletor substituível. Ao final, a suíte inteira (`CoreCAIJ/*.Tests.*`) deve passar a partir da raiz.

Para a frente estética, acrescentar casos de regras A/B/C/D aprovadas, múltiplos detalhes na mesma peça, peça pendente, peça não aplicável, sugestão explicada sem média, alteração justificada e leitura de histórico anterior. Até as definições serem aprovadas, os testes não devem inventar critérios de classificação da empresa.

A validação física em bancada fica com o dono do projeto e é a condição para publicar no NAS. Ela inclui: um alto-falante de cada lado; tap-to-click; teclado E14 e outros modelos; um pendrive em cada porta, incluindo USB-C.

## Decisões deixadas ao construtor

- Valores exatos dos limiares (microfone, movimento) e do intervalo de consulta da USB, dentro do que está descrito acima.
- A consulta do Windows usada para listar a USB, escolhida pelo tempo de resposta.
- O texto exato das mensagens na interface, mantendo o tom atual do app.
- A estrutura interna do código, desde que o catálogo continue sendo a fonte dos itens.
- A apresentação e a navegação entre peças da inspeção estética, preservando as referências aprovadas. As definições A/B/C/D e as regras do veredito são decisões do responsável pela empresa, não do construtor.
