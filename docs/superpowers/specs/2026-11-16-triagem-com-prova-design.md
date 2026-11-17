# Triagem com prova, avaliação estética e relatório AlterTag

Data: 16/11/2026 · Branch: `VitorTosti/feat-orquestrar-equipe-qa` (PR #2)

## Objetivo da entrega

A triagem deve produzir resultados de hardware confiáveis e confirmados pelo técnico, uma avaliação estética guiada e um relatório único apresentado no envio já existente ao AlterTag. A identificação existente de máquinas, serial e rastreador será reaproveitada.

O técnico executa, observa e confirma cada teste. Detecção automática é evidência de execução, nunca prova suficiente de que o componente funciona. Quando a detecção falhar, há confirmação manual com justificativa obrigatória, identificada no relatório.

## Limites e restrições

- Não publicar no NAS nem fazer push em `master` antes da validação em bancada e autorização do responsável.
- Preservar os arquivos atuais de teclado e triagem até sincronização da máquina de trabalho; novos recursos devem ser isolados em módulos novos sempre que possível.
- A frente Windows é prioritária. O Mac continua compatível: onde não houver detecção automática, a confirmação manual justificada é o caminho válido.
- A aparência e o funcionamento são resultados independentes. Falhas, pendências e casos duvidosos precisam aparecer antes da liberação.
- A ponte local Windows é de uma thread; rotas novas devem responder rapidamente e qualquer inventário lento deve usar coleta em segundo plano.
- A lista obrigatória de checklist hoje é validada em JS, PowerShell e Python; mudanças nela exigem a atualização coordenada dos três validadores.

## Modelo de evidência comum

Cada item recebe `evidence`, quando aplicável:

```js
{ source: "auto" | "manual", detail: string, at: "ISO-8601" }
```

- Itens que exigem evidência não podem ser aprovados sem evidência automática ou confirmação manual justificada.
- Reprovado, Não testado e Não se aplica seguem exigindo justificativa quando já exigido pelo checklist.
- A evidência é invalidada se o equipamento mudar ou se a triagem for limpa.
- O relatório usa `[Aprovado]`, `[Reprovado]` e `[Aprovado – manual]` em texto; não usa emoji.
- Um critério descreve a condição a verificar (por exemplo, `Alto-falantes sem ruído ou distorção`) e o resultado é registrado separadamente.

## Hardware: escopo e evidências

| Categoria | Critério e evidência | Confirmação do técnico |
|---|---|---|
| Teclado | Teclas reconhecidas, por exemplo `84/84`; manter o fluxo atual de foco, captura, progresso e confirmação para Fn/Prt Sc do E14. | Confirma que as teclas físicas responderam; faltas ou confirmação manual ficam justificadas. |
| Som | Reprodução concluída em cada canal e, quando aplicável, captura de microfone. | Confirma que ouviu sem ruído ou distorção; execução do tom não aprova sozinha. |
| Touchpad | Movimento e cliques esquerdo/direito detectados; ignorar clique sintetizado por teclado. | Confirma movimento e ambos os cliques. |
| USB | Dispositivo reconhecido em cada localização física; cada porta é um item distinto. | Confirma que a porta testada funcionou; detecção manual exige motivo. |
| Carregamento | Registrar conexão/estado de carga disponível na plataforma. | Confirma alimentação, carregamento e firmeza do conector. |
| Rede | Registrar conexão/interface e teste de acesso quando disponível. | Confirma Ethernet e/ou Wi-Fi testados conforme o item. |

### USB por porta (Windows)

- A ponte expõe `GET /usb-devices` com `InstanceId`, nome e localização física da porta.
- Ao abrir a etapa, o app cria uma foto inicial e consulta a rota aproximadamente a cada 1,5 s; para ao sair.
- Dispositivo novo em localização ainda não usada cria/preenche `usb.port-N`, com a detecção registrada. Reconectar na mesma localização não cria porta nova.
- Dispositivos já conectados podem ser escolhidos como evidência. Há remoção de detecção incorreta e adição manual com justificativa.
- Sem ponte local ou no Mac, a interface informa a indisponibilidade e exige confirmação manual justificada para aprovar portas.

## Avaliação estética por etapas

### Roteiro obrigatório

Nesta ordem, o app mostra o desenho da peça com a área destacada, quatro referências visuais e a pergunta de estado:

1. Tampa superior
2. Moldura da tela
3. Tela (superfície)
4. Teclado e apoio de mãos
5. Base inferior
6. Dobradiças
7. Portas e conectores
8. Peças ausentes

As únicas respostas de condição são: **Perfeito**, **Marcas leves**, **Marcas visíveis** e **Dano**. Peça não existente pode ser **Não se aplica**; peça sem resposta é pendente, nunca perfeita.

Se a resposta não for Perfeito, o técnico deve tocar no desenho para marcar o local do defeito. A marca armazena coordenadas normalizadas; a observação em texto é opcional e várias marcas podem existir na mesma peça. Não haverá foto enviada pelo técnico nesta entrega.

Os desenhos e as referências são guias de inspeção, não evidência fotográfica da máquina. Aparência de tela, dobradiças e conectores não substitui seus testes funcionais.

### Grade configurável

As regras ficam em arquivo de configuração versionado, separado da tela, com versão salva no registro. Regras iniciais:

- **A:** tudo perfeito, no máximo uma peça com marcas leves.
- **B:** apenas marcas leves.
- **C:** ao menos uma peça com marcas visíveis, ou quatro ou mais peças com marcas leves.
- **D:** qualquer dano; dano em tela ou dobradiças é sempre D.

Não usar média: um dano relevante não pode ser escondido por outras peças em bom estado. A sugestão explica a causa, por exemplo: `Grade C: tampa superior com marcas visíveis`. Pendência ou caso sem regra deixa a avaliação como pendente de revisão. O técnico pode alterar a grade sugerida somente com justificativa, registrada no relatório.

## Registro e relatório AlterTag

Uma única estrutura de dados alimenta tela, persistência local, histórico e o gerador de relatório. Ela inclui itens de hardware, evidências, dados de configuração, avaliação de cada peça e marcações, versão da regra, grades sugerida e confirmada, justificativa de alteração, técnico e datas.

O relatório já é enviado ao AlterTag pelo fluxo atual. Esta frente muda a organização e a apresentação do texto enviado, inclusive no uso de rastreador já cadastrado, mantendo o mecanismo de envio e a identificação atuais. O histórico local dos registros permite acompanhar os defeitos que continuam escapando; a apresentação de histórico na observação segue o comportamento existente.

Formato obrigatório:

```text
RELATÓRIO DE TRIAGEM
OS / Serial / Data e hora / Técnico
SITUAÇÃO: ENCAMINHAR PARA REPARO / LIBERAR / REVISAR + motivo
RESUMO: testes aprovados e reprovados, pendentes/não testados, aprovações manuais, grade estética
PROBLEMAS ENCONTRADOS: cada item marcado [Funcional] ou [Estético]
SERVIÇOS REALIZADOS
RESULTADOS DOS TESTES por categoria (Câmera, Teclado, Som, Tela, Touchpad, Portas USB, Carregamento, Rede, HDMI), com Critério, Resultado, Detalhe e Evidência quando houver
AVALIAÇÃO ESTÉTICA: GRADE X + motivo + estado de cada peça com local marcado
CONFIGURAÇÃO: processador, memória, armazenamento, vídeo
CONFIRMAÇÃO DO TÉCNICO: nome, data/hora, com ou sem ressalvas
```

### Aproveitamento da integração atual

O envio ao AlterTag já funciona na operação. A implementação deve localizar o ponto em que o texto do relatório é montado e aplicar ali o novo formato, sem criar uma nova rota de atualização da OS. A conferência consiste em comparar o texto exibido no app com o texto enviado pelo fluxo atual, incluindo o caso de rastreador já cadastrado.

## Ordem de implementação por etapas

1. **Modelo do relatório:** mapear a estrutura de dados e a formatação atuais, criar o gerador do texto único e conferir seu uso na tela e no envio existente ao AlterTag.
2. **Avaliação estética:** implementar em módulo isolado as oito peças, desenhos e referências, quatro estados, marcações e regras de grade em configuração versionada.
3. **Provas de hardware:** adicionar evidências e confirmação observacional para som, touchpad, carregamento e rede, preservando o teste de teclado estabilizado.
4. **USB porta por porta:** registrar a detecção por localização e a confirmação do técnico, com justificativa para aprovação manual.
5. **Integração e validação:** reunir os resultados no relatório, verificar o rastreador já cadastrado, executar a suíte e validar o fluxo em máquinas da bancada antes da publicação.

## Critérios de aceite

- Cada aprovação de hardware registra evidência automática ou manual justificada e confirmação observacional do técnico.
- USB evidencia cada porta individualmente; touchpad mostra esquerdo/direito; teclado registra contagem de teclas; áudio registra reprodução.
- As oito etapas estéticas seguem a ordem, têm os quatro estados e exigem marca no desenho fora de Perfeito.
- A mesma entrada e versão de regra produz a mesma grade e motivo; dano nunca é diluído por média.
- Alteração de grade sempre tem justificativa; funcionamento e estética seguem separados.
- Relatório usa o formato único no app e no envio existente ao AlterTag, inclusive com rastreador já cadastrado; os registros locais permanecem consultáveis no histórico.
- Registros legados continuam legíveis, sem reinterpretação automática.

## Testes e validação

Para cada mudança, atualizar testes `.cjs`, `.py` e `.ps1` correspondentes. Acrescentar cenários de evidência automática/manual, falha de detecção, USB por porta, regras A/B/C/D, múltiplas marcações, pendência, não aplicável, troca justificada de grade e formatação do relatório enviado pelo fluxo existente.

Antes de declarar uma alteração pronta, executar a partir da raiz:

```powershell
Get-ChildItem CoreCAIJ -Filter *.Tests.cjs | ForEach-Object { node $_.FullName }
Get-ChildItem CoreCAIJ -Filter *.Tests.py  | ForEach-Object { python $_.FullName }
Get-ChildItem CoreCAIJ -Filter *.Tests.ps1 | ForEach-Object { powershell -ExecutionPolicy Bypass -File $_.FullName }
Get-ChildItem CoreCAIJ/mac-ui -Filter *.js | ForEach-Object { node --check $_.FullName }
python -m py_compile CoreCAIJ/mac-ui/server.py
```

A validação física em bancada é obrigatória antes da publicação: canais de áudio, tap-to-click, teclado E14 e outros modelos, pendrive em cada USB inclusive USB-C, carregamento e rede.
