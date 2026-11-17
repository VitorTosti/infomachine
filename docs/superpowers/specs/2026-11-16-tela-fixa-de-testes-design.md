# Tela fixa de testes — design

Data: 2026-11-16 · Área: `CoreCAIJ/mac-ui` (Central de testes, Mac e prévia Windows)

## Por quê

Na triagem o técnico se perde: precisa rolar a tela para achar o checklist, voltar para
conferir o que já fez e só descobre no fim que faltou preencher algo. Aprovado e reprovado
se distinguem por uma borda fina e um texto pequeno.

Hoje a central é uma coluna única: resumo → lista dos 9 testes → teste aberto → checklist →
sequência → confirmação → relatório. Há três lugares que marcam resultado (lista, checklist,
"Aprovado e próximo") e o último recusa e rola a tela quando falta item.

## Objetivos

- Com um teste aberto, **nada essencial exige rolar a página**: onde estou, o que já foi
  decidido, o que falta e o botão de avançar estão sempre na tela.
- Estado de cada teste legível de relance: aprovado, reprovado, com ressalva, incompleto, pendente.
- O que falta preencher aparece **no próprio teste e na lista**, na hora, não só na confirmação.
- Um único caminho para marcar resultado.

## Fora do escopo

- Regras do checklist, validação, evidências, formato do relatório e assinatura
  (`test-checklist.js` não muda).
- Lógica interna de cada teste (câmera, teclado, som, tela, trackpad, carregador).
- Telas fora da central de testes.

## O que não pode acontecer

- Aprovar com menos rigor do que hoje (pendente, justificativa e evidência continuam obrigatórias).
- Perder dados já preenchidos ao trocar de teste.
- Quebrar o modo `?tests=1` ou a prévia Windows.

## Abordagens consideradas

- **A. Tela fixa em painéis (escolhida pelo Vitor).** Lista lateral sempre visível, teste e
  checklist juntos, barra de ação fixa embaixo. Resolve a causa (rolagem e estado escondido).
- **B. Polir a coluna atual.** Barra grudada no topo e cores mais fortes. Mais barato, mas a
  rolagem e o "voltar para conferir" continuam.
- **C. Assistente de uma etapa por tela, sem lista.** Sem rolagem, mas esconde o panorama e
  dificulta voltar a um teste específico — o oposto do que a triagem pede.

## Desenho

```
┌ Central de testes ── SERIAL ── 4 de 9 ▓▓▓▓░░░░░ ── [Voltar ao menu] ┐
├───────────────┬─────────────────────────────────────────────────────┤
│ ✓ Câmera      │ Som                                         3 de 9  │
│ ✕ Teclado     │ Ouça o tom e confira se não há distorção.           │
│ ● Som         │ ┌ área do teste ──────────────────────────────────┐ │
│ ○ Tela        │ └─────────────────────────────────────────────────┘ │
│ ○ Trackpad    │ Checklist                                           │
│ ! USB · falta 1│  Alto-falantes       [✓ Aprovado][✕ Reprovado][N/A][Não testado]
│ ○ Carregador  │                                                     │
│ ○ Rede        │                                                     │
│ ○ HDMI        │                                                     │
│ ─────────     │                                                     │
│ ▸ Revisão     │                                                     │
├───────────────┴─────────────────────────────────────────────────────┤
│ Falta 1 item: Alto-falantes        [Pular] [Reprovar] [Aprovar tudo e próximo →] │
└─────────────────────────────────────────────────────────────────────┘
```

### Estrutura

- A `tests-card` ocupa a altura da janela (grid: cabeçalho, corpo, barra de ação). A página
  não rola; só o painel central rola por dentro, se o conteúdo não couber.
- **Cabeçalho compacto**: título, serial, progresso "N de 9" com barra, "Voltar ao menu".
  Substitui o bloco de resumo com os três contadores.
- **Lista lateral** (substitui a lista de linhas e a "Sequência dos testes"): os 9 testes
  mais a entrada "Revisão e confirmação". Clicar abre o teste. Ao entrar na central, abre
  direto o primeiro teste pendente (não existe mais estado "nenhum teste aberto").
- **Painel central**: título, ajuda em uma linha, área do teste, checklist logo abaixo.
- **Barra de ação fixa**: à esquerda o que falta neste teste; à direita Pular, Reprovar,
  Aprovar tudo e próximo.

### Estados na lista lateral

| Estado | Quando | Visual |
|---|---|---|
| Aprovado | todos os itens aprovados/N/A | fundo verde preenchido, ✓ |
| Reprovado | algum item reprovado | fundo vermelho preenchido, ✕ |
| Com ressalva | algum "Não testado", nenhum reprovado | âmbar, ! |
| Não se aplica | todos N/A | cinza, – |
| Incompleto | começou mas falta item ou justificativa | contorno âmbar + "falta N" |
| Pendente | nada marcado | círculo vazio, texto apagado |
| Atual | teste aberto | destaque de seleção, somado ao estado |

Cor nunca é o único sinal: sempre ícone e texto.

### Checklist

- Todos os testes usam a linha compacta já feita no USB: nome à esquerda, botões na mesma linha.
- O campo de observação só aparece quando é obrigatório (Reprovado, Não testado) ou já tem texto;
  nos demais casos, um link discreto "+ observação" o abre.
- Botão selecionado fica preenchido; a linha ganha fundo verde/vermelho suave. Itens que
  travam o avanço (pendente ou sem justificativa) ganham contorno âmbar.
- "Limpar" sai da fileira de botões: clicar de novo no botão selecionado desmarca.

### Barra de ação

- **Aprovar tudo e próximo**: marca como Aprovado os itens ainda pendentes que não exigem
  evidência e avança. Se sobrar algo que impede (item que exige evidência sem detecção,
  justificativa vazia, item reprovado), não avança: a barra diz exatamente o que falta e o
  item é destacado e focado. Com tudo já preenchido, o rótulo vira "Próximo →".
- **Reprovar**: se nenhum item está reprovado, foca o primeiro item pendente e pede para
  marcar qual falhou; se já há reprovado com justificativa, avança.
- **Pular**: avança deixando o teste como está (aparece como Incompleto/Pendente na lista).
- No último teste, avançar leva à Revisão.

### Revisão e confirmação

- Entrada própria na lista lateral; ocupa o painel central.
- Topo: grade dos 9 testes com o estado (mesmo visual da lista) e, para os que travam a
  confirmação, o motivo e um clique que leva ao teste.
- Abaixo: técnico, observações gerais, declaração, palavra de confirmação e botão — sem
  mudança de regra. Histórico de relatórios, Copiar relatório e Limpar resultados ficam aqui.
- Na barra de ação, nessa tela: "Confirmar relatório" e, depois de confirmado, "Concluir e voltar".

### Telas menores

Abaixo de ~1000px de largura a lista lateral vira uma faixa horizontal de pílulas no topo
(mesmos estados, rolagem lateral); a barra de ação continua fixa embaixo.

## Restrições técnicas

- Mesmos três arquivos: `index.html`, `app.js`, `style.css`. Sem dependências novas.
- Manter os ids usados pela lógica e pelos testes (`activeTestBody`, `hardwareChecklistItems`,
  `skipActiveTest`, `failAndNextTest`, `passAndNextTest`, `testWorkspace`, campos da confirmação…).
- `MacUi.Tests.ps1` e `WindowsWebPreview.Tests.ps1` afirmam marcação antiga (5 `test-row`
  no HTML, ordem dos botões antes de `activeTestBody`, `.active-test-actions` sticky,
  `.test-row.passed/.failed`, `tests-overview`). Essas afirmações serão atualizadas para a
  nova estrutura, mantendo a intenção de cada uma.
- O teste de tela continua abrindo o diálogo em tela cheia; o de teclado ocupa a largura
  toda do painel central.
- Mudanças do USB feitas hoje (linha compacta, +1 USB / +1 USB-C) entram como base.

## Decisões minhas (para o Vitor conferir)

1. Abrir a central já cai no primeiro teste pendente.
2. "Aprovar tudo" preenche os pendentes; nunca sobrescreve item já marcado nem pula evidência.
3. Estado novo "Incompleto" na lista (só visual; não muda o relatório).
4. "Limpar" por item vira desmarcar com segundo clique; "Limpar resultados" geral vai para a Revisão.
5. Os três contadores do topo dão lugar ao progresso único; o detalhe fica na lista e na Revisão.

## Fica para quem implementar

Medidas, espaçamentos, animações de troca de estado e os tons exatos dentro da paleta escura atual.
