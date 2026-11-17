# Tela fixa de testes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a Central de testes numa tela fixa (lista lateral + teste/checklist + barra de ação) em que o técnico vê onde está, o que foi decidido e o que falta sem rolar a página.

**Architecture:** Só reorganização de interface em `CoreCAIJ/mac-ui`. Duas funções puras novas em `app.js` (`testBlockers`, `testRailState`) calculam o que falta e o estado visual de cada teste; a lista lateral, o checklist e a barra de ação renderizam a partir delas. Regras, validação e relatório (`test-checklist.js`) não mudam.

**Tech Stack:** HTML/CSS/JS puro (sem build, sem dependências). Testes: Node (`*.Tests.cjs`, `node:assert` + `node:vm`) e PowerShell (`*.Tests.ps1`, afirmações por regex sobre os arquivos).

**Spec:** `docs/superpowers/specs/2026-11-16-tela-fixa-de-testes-design.md`

## Global Constraints

- Arquivos de produto alterados: apenas `CoreCAIJ/mac-ui/index.html`, `app.js`, `style.css`. `test-checklist.js` não muda.
- Sem dependências novas.
- Nunca aprovar com menos rigor que hoje: item pendente, justificativa de Reprovado/Não testado e evidência (`audio.speakers`, `trackpad.movement`, `trackpad.buttons`, `charger.connectors`) continuam obrigatórios.
- Trocar de teste não pode apagar resultado, observação nem evidência.
- Modo `?tests=1` e prévia Windows continuam funcionando.
- Manter os ids: `testsView`, `testWorkspace`, `activeTestTitle`, `activeTestHelp`, `activeTestBody`, `activeTestStep`, `hardwareChecklist`, `hardwareChecklistItems`, `hardwareChecklistStatus`, `usbPortTools`, `skipActiveTest`, `failAndNextTest`, `passAndNextTest`, `testsCompletion`, `testsProgress`, `testsReport`, `testsReportDetails`, `testsActionStatus`, `testTechnician`, `testEquipmentSerial`, `testGeneralNotes`, `testAttestation`, `testConfirmationWord`, `testConfirmationInstruction`, `testConfirmationStatus`, `testConfirmationHistory`, `confirmHardwareTests`, `resetTests`, `copyTestsReport`, `finishTests`, `closeTests`.
- Cor nunca é o único sinal de estado: sempre ícone e texto.
- Textos em português, no tom dos existentes.
- Comandos de teste, rodados em `CoreCAIJ/`:
  `node TestChecklist.Tests.cjs` · `node TestsLayout.Tests.cjs` · `node KeyboardLayout.Tests.cjs` ·
  `powershell -NoProfile -File MacUi.Tests.ps1` · `powershell -NoProfile -File WindowsWebPreview.Tests.ps1`
- Conferência visual: abrir `CoreCAIJ/mac-ui/index.html?tests=1` no navegador (modo independente funciona em `file:`).

## Review Focus

1. Item que exige evidência sem detecção, ao clicar "Aprovar tudo": não pode ser aprovado; a barra diz qual item e por quê (Task 1 e 4).
2. Reprovado/Não testado com justificativa só de espaços: conta como faltando (Task 1).
3. Teste USB com portas adicionadas/removidas: "falta N" na lista reflete a contagem atual (Task 1).
4. Checklist restaurado de relatório confirmado (`caij:hardware-test-last-confirmed`): a central abre na Revisão, não num teste (Task 2).
5. Janela estreita (<1000px) e teste de teclado largo: nada essencial some nem exige rolar a página na horizontal (Task 6).

---

### Task 1: Funções de estado (`testBlockers`, `testRailState`)

**Files:**
- Modify: `CoreCAIJ/mac-ui/app.js` (logo acima de `function renderHardwareChecklist(`)
- Create: `CoreCAIJ/TestsLayout.Tests.cjs`
- Modify: `CoreCAIJ/TestChecklist.Tests.cjs:31` (início do recorte)

**Interfaces:**
- Produces:
  - `const evidenceRequiredItems = ["audio.speakers", "trackpad.movement", "trackpad.buttons", "charger.connectors"];` — substitui as três cópias literais dessa lista em `app.js`.
  - `testBlockers(test: string): Array<{ id: string, label: string, reason: "evidence" | "pending" | "justification" }>` — itens de `state.testChecklist` do teste que impedem concluir, na ordem do checklist. `evidence`: resultado `pending`, id em `evidenceRequiredItems`, sem `item.evidence`. `pending`: demais pendentes. `justification`: `failed`/`untested` com `notes.trim()` vazio.
  - `testRailState(test: string): "pending" | "incomplete" | "passed" | "failed" | "untested" | "not_applicable"` — `pending` se todos os itens estão pendentes (ou não há itens); `incomplete` se `testBlockers(test).length > 0`; senão `failed` se algum reprovado, `untested` se algum não testado, `not_applicable` se todos N/A, `passed` caso contrário.
- As três declarações ficam contíguas, nessa ordem, imediatamente antes de `renderHardwareChecklist`, para os testes recortarem `app.js` de `const evidenceRequiredItems` até `function renderTestConfirmation(`.

- [ ] **Step 1: Escrever o teste que falha** — `TestsLayout.Tests.cjs`, mesmo padrão de recorte com `vm` de `TestChecklist.Tests.cjs:26-31` (contexto com `state`, `qs` stub, `escapeHtml`, `window.CAIJ_TEST_CHECKLIST`):

```js
const items = () => checklist.createChecklist({ usbPorts: ['USB 1', 'USB 2'] });
const set = (id, patch) => Object.assign(uiState.testChecklist.find(i => i.id === id), patch);
uiState.testChecklist = items();
assert.equal(ui.testRailState('usb'), 'pending');
assert.deepEqual(ui.testBlockers('usb').map(b => b.reason), ['pending', 'pending', 'pending']);
set('usb.inventory', { result: 'passed' });
assert.equal(ui.testRailState('usb'), 'incomplete');
assert.equal(ui.testBlockers('usb').length, 2);
uiState.testChecklist.push({ id: 'usb.port-3', testId: 'usb', label: 'USB-C 1', result: 'pending', notes: '' });
assert.equal(ui.testBlockers('usb').length, 3, 'porta adicionada entra na contagem');
uiState.testChecklist.filter(i => i.testId === 'usb').forEach(i => i.result = 'passed');
assert.equal(ui.testRailState('usb'), 'passed');
set('usb.port-1', { result: 'failed', notes: ' \t ' });
assert.deepEqual(ui.testBlockers('usb').map(b => [b.id, b.reason]), [['usb.port-1', 'justification']]);
assert.equal(ui.testRailState('usb'), 'incomplete');
set('usb.port-1', { notes: 'Porta sem contato' });
assert.equal(ui.testRailState('usb'), 'failed');
set('usb.port-1', { result: 'untested' });
assert.equal(ui.testRailState('usb'), 'untested');
uiState.testChecklist.filter(i => i.testId === 'usb').forEach(i => { i.result = 'not_applicable'; i.notes = ''; });
assert.equal(ui.testRailState('usb'), 'not_applicable');
assert.deepEqual(ui.testBlockers('audio').map(b => b.reason), ['evidence']);
set('audio.speakers', { evidence: { source: 'auto', detail: 'Tom reproduzido nos lados esquerdo e direito', at: '2026-11-16T12:00:00Z' } });
assert.deepEqual(ui.testBlockers('audio').map(b => b.reason), ['pending']);
console.log('PASS: estado da lista lateral e pendencias por teste.');
```

- [ ] **Step 2:** `node TestsLayout.Tests.cjs` → FALHA (`const evidenceRequiredItems` não encontrado / `ui.testRailState is not a function`).
- [ ] **Step 3:** Implementar as três declarações em `app.js`; trocar as cópias literais da lista (em `renderHardwareChecklist` e no handler de clique de `hardwareChecklistItems`) por `evidenceRequiredItems`. Em `TestChecklist.Tests.cjs:31`, trocar o início do recorte para `appSource.indexOf('const evidenceRequiredItems')`.
- [ ] **Step 4:** `node TestsLayout.Tests.cjs` e `node TestChecklist.Tests.cjs` → PASS.
- [ ] **Step 5: Commit** — `feat: calcula pendências e estado de cada teste`

---

### Task 2: Estrutura fixa — cabeçalho, lista lateral, painel, barra

**Files:**
- Modify: `CoreCAIJ/mac-ui/index.html:467-566` (seção `#testsView`)
- Modify: `CoreCAIJ/mac-ui/app.js` (`renderTests`, `renderActiveTestNavigation`, `openTest`, `stopActiveTest`, `completeActiveTest`, `initializeTestChecklistUi`, `wireControls`, entrada na view de testes)
- Modify: `CoreCAIJ/mac-ui/style.css` (blocos `.tests-page …`)
- Modify: `CoreCAIJ/MacUi.Tests.ps1`, `CoreCAIJ/WindowsWebPreview.Tests.ps1`, `CoreCAIJ/TestsLayout.Tests.cjs`

**Interfaces:**
- Consumes: `testBlockers`, `testRailState` (Task 1).
- Produces (marcação):
  - `.tests-card` vira grid de três linhas: `header.tests-head` · `div.tests-body` · `footer#testActionBar.tests-action-bar`.
  - `header.tests-head`: título, `#testsHeadSerial`, `#testsCompletion` + `.tests-progress > #testsProgress`, `#closeTests`. A `section.tests-overview` e os ids `testsPassed`/`testsFailed`/`testsPending` são removidos.
  - `div.tests-body` = `nav.tests-rail > ol#testRail` + `section#testWorkspace.test-workspace` (nunca mais `hidden`).
  - Dentro de `#testWorkspace`: `div#testPanel` (cabeçalho com `#activeTestTitle` e `#activeTestStep`, `#activeTestHelp`, `#activeTestBody`, `#hardwareChecklist`) e `section#testReviewPanel.hidden` (conteúdo: Task 5; nesta task recebe, sem mudança, a `section.test-confirmation`, o `div.tests-report` e os botões `#resetTests`/`#copyTestsReport`).
  - `#testActionBar`: `p#activeTestBlockers[role=status]` à esquerda; à direita `#skipActiveTest`, `#failAndNextTest`, `#passAndNextTest`, `#confirmHardwareTests`, `#finishTests`.
  - Removidos: `section#testList`, `section.test-sequence` (`#testSequenceList`, `#testSequenceRemaining`), `#closeActiveTest`, `#activeTestNextLabel`, `footer.tests-footer`.
- Produces (JS):
  - `renderTestRail(): void` — preenche `#testRail` com um `<li data-state="…">` por teste de `testSequence` mais um final de Revisão. Cada item: `<button type="button" data-rail-test="<id>">` com ícone (`aria-hidden`), nome (`testLabels`) e texto de estado; `aria-current="step"` no atual. Entrada de Revisão: `data-rail-test="review"`, rótulo "Revisão e confirmação".
    Ícone/texto por estado: `passed` ✓ "Aprovado" · `failed` ✕ "Reprovado" · `untested` ! "Com ressalva" · `not_applicable` – "Não se aplica" · `incomplete` ! "Falta N" (N = `testBlockers(test).length`) · `pending` ○ "Pendente".
  - `openReview(): void` — `stopActiveTest()`, `state.activeTest = "review"`, mostra `#testReviewPanel`, esconde `#testPanel`, chama `renderTestRail()` e `renderActionBar()`.
  - `renderActionBar(): void` — nesta task só alterna visibilidade: em teste, mostra skip/fail/pass e esconde confirm/finish; em Revisão, o inverso (`#finishTests` continua obedecendo à regra atual de `app.js:1229-1234`). Texto de `#activeTestBlockers` e rótulos: Task 4.
  - `openFirstOpenStep(): Promise<void>` — abre o primeiro teste cujo `testRailState` seja `pending` ou `incomplete`; se não houver, `openReview()`. Chamado ao entrar na view de testes quando `state.activeTest` está vazio, e após `syncTestEquipment` trocar de serial.
- `renderTests()` passa a chamar `renderTestRail()` e `renderActionBar()` no lugar do laço sobre `.test-row` e dos três contadores. `#testsCompletion` mostra `N de 9`.
- `stopActiveTest()` não esconde mais `#testWorkspace`.
- `completeActiveTest`: no último teste chama `openReview()` em vez de rolar até `.tests-footer`.
- Clique em `#testRail`: `data-rail-test="review"` → `openReview()`; senão `openTest(id)` (que mostra `#testPanel` e esconde `#testReviewPanel`).
- `initializeTestChecklistUi` deixa de montar linhas em `#testList`; mantém `testEquipmentSerial.readOnly` e a limpeza do `localStorage`.

**CSS (valores fixados):**
- `.tests-page .tests-card { display: grid; grid-template-rows: auto minmax(0,1fr) auto; height: 100vh; }` (ajustar se a view tiver cabeçalho externo, de modo que a página não role).
- `.tests-body { display: grid; grid-template-columns: 240px minmax(0,1fr); min-height: 0; }`; `.tests-rail` e `#testWorkspace` com `overflow-y: auto`.
- Estados em `#testRail li[data-state=…]`: `passed` fundo `#7ce5c0` texto `#082c24`; `failed` fundo `#ffacb9` texto `#3b0d19`; `untested` e `incomplete` borda/texto âmbar `#c6ab68` (`incomplete` sem fundo, `untested` fundo `#353425`); `not_applicable` cinza; `pending` texto apagado. `[aria-current=step]` soma um contorno de seleção sem trocar a cor do estado.
- Remover regras órfãs de `.test-row`, `.test-list`, `.test-actions`, `.tests-overview`, `.test-counter`, `.test-sequence`, `.tests-footer`, `.active-test-actions`.

- [ ] **Step 1: Atualizar as afirmações de marcação (falham primeiro).**
  Em `MacUi.Tests.ps1`: linha 237 → `$indexText -match 'id="testRail"'` e `$appText -match 'function\s+renderTestRail'`; linha 238 (ordem dos `data-test`) → remover (a ordem já é afirmada por `const testSequence` na linha 265); linha 264 → `'id="activeTestBody"[\s\S]*id="testActionBar"[\s\S]*id="skipActiveTest"[\s\S]*id="failAndNextTest"[\s\S]*id="passAndNextTest"'`; linha 268 → `$styleText -match '\.tests-page \.tests-card\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto'`; linhas 279-280 → `'#testRail li\[data-state=passed\]'` e `'#testRail li\[data-state=failed\]'`.
  Em `WindowsWebPreview.Tests.ps1`: linhas 100-101 → `id="testRail"` e `id="testActionBar"`; linha 250 → mesmo regex novo da linha 264 acima; linha 311 → `'#testRail li\[data-state=passed\][\s\S]*#testRail li\[data-state=failed\]'`.
  Rodar os dois e corrigir, com a mesma intenção, qualquer outra afirmação que cite marcação removida.
- [ ] **Step 2:** Acrescentar a `TestsLayout.Tests.cjs` (recortando também `renderTestRail` — declará-la logo após `testRailState`):

```js
uiState.testChecklist = items(); uiState.activeTest = 'usb';
set('usb.inventory', { result: 'passed' });
ui.renderTestRail();
assert.match(rail.innerHTML, /data-state="incomplete"[^>]*aria-current="step"|aria-current="step"[^>]*data-state="incomplete"/);
assert.match(rail.innerHTML, /Falta 2/);
assert.equal((rail.innerHTML.match(/data-rail-test="/g) || []).length, 10, 'nove testes e a revisão');
assert.match(rail.innerHTML, /data-rail-test="review"/);
```
  (`rail` = objeto devolvido por `qs('testRail')` no stub; `testLabels` e `testSequence` entram no contexto do `vm`.)
- [ ] **Step 3:** Rodar as três suítes → FALHAM nas afirmações novas.
- [ ] **Step 4:** Implementar marcação, JS e CSS conforme as Interfaces.
- [ ] **Step 5:** Todas as suítes de Global Constraints → PASS.
- [ ] **Step 6:** Conferência visual em `index.html?tests=1`: a página não rola; clicar em cada entrada da lista troca o painel; marcar itens muda o estado na lista na hora; resultados persistem ao trocar de teste.
- [ ] **Step 7: Commit** — `feat: central de testes em tela fixa com lista lateral`

---

### Task 3: Checklist compacto em todos os testes

**Files:**
- Modify: `CoreCAIJ/mac-ui/app.js` (`renderHardwareChecklist`, handler de clique de `hardwareChecklistItems`)
- Modify: `CoreCAIJ/mac-ui/style.css` (`.hardware-check-*`, `.check-result-*`)
- Modify: `CoreCAIJ/mac-ui/index.html` (parágrafo de instrução do checklist)
- Test: `CoreCAIJ/TestChecklist.Tests.cjs`

**Interfaces:**
- Consumes: `testBlockers` (Task 1).
- Produces:
  - Todo item sai com `class="hardware-check-item hardware-check-compact"` (o `compact` deixa de depender de `test === "usb"`).
  - Uma fileira só de botões: Aprovado, Reprovado, Não se aplica, Não testado. O botão `pending` ("Limpar") não é mais renderizado.
  - Clicar no botão já selecionado volta o item a `pending` (e limpa nada além do resultado). A trava de evidência para `passed` continua.
  - Campo de observação: renderizado quando `failed`/`untested`, quando `item.notes` não é vazio, ou quando o id está em `state.checklistNotesOpen` (um `Set`). Nos demais casos, `<button type="button" class="hardware-check-add-note" data-note-open="<id>">+ observação</button>`; o clique adiciona o id ao `Set`, re-renderiza e foca o campo.
  - Item presente em `testBlockers(test)` recebe `data-blocked="<reason>"` no `<article>`.
- CSS: `[data-result=passed]` fundo `rgba(124,229,192,.08)`; `[data-result=failed]` fundo `rgba(255,172,185,.08)`; `[data-blocked]` contorno `1px solid #c6ab68` — aplicado só depois de uma tentativa de avançar (classe `show-blockers` em `#hardwareChecklistItems`, ligada na Task 4), para não pintar tudo de âmbar ao abrir o teste.
- Instrução do checklist em `index.html` passa a: "Marque cada item. Reprovado e Não testado pedem justificativa."

- [ ] **Step 1: Teste que falha** — acrescentar a `TestChecklist.Tests.cjs` após a linha 37:

```js
assert.doesNotMatch(rendered.innerHTML, /data-check-value="pending"/, 'Limpar por item deixa de existir');
assert.match(rendered.innerHTML, /hardware-check-compact/);
assert.match(rendered.innerHTML, /data-note-open="audio\.speakers"/, 'observação opcional fica recolhida');
uiState.testChecklist.find(item => item.id === 'audio.speakers').result = 'failed';
ui.renderHardwareChecklist();
assert.match(rendered.innerHTML, /Justificativa obrigatória/);
assert.match(rendered.innerHTML, /data-blocked="justification"/);
```
  (adicionar `checklistNotesOpen: new Set()` ao `uiState` do teste.)
- [ ] **Step 2:** `node TestChecklist.Tests.cjs` → FALHA.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `node TestChecklist.Tests.cjs`, `node TestsLayout.Tests.cjs` → PASS.
- [ ] **Step 5:** Conferência visual: cada teste mostra nome e botões na mesma linha; segundo clique desmarca; "+ observação" abre e foca o campo; texto digitado sobrevive à troca de teste.
- [ ] **Step 6: Commit** — `feat: checklist compacto em todos os testes`

---

### Task 4: Barra de ação — o que falta, Aprovar tudo, Reprovar, Pular

**Files:**
- Modify: `CoreCAIJ/mac-ui/app.js` (`renderActionBar`, `completeActiveTest`, `renderActiveTestNavigation`)
- Modify: `CoreCAIJ/mac-ui/style.css` (`.tests-action-bar`)
- Modify: `CoreCAIJ/MacUi.Tests.ps1:266-267`, `CoreCAIJ/WindowsWebPreview.Tests.ps1:251`
- Test: `CoreCAIJ/TestsLayout.Tests.cjs`

**Interfaces:**
- Consumes: `testBlockers`, `testRailState`, `renderTestRail`, `openReview`.
- Produces:
  - `blockersText(test: string): string` (declarada junto de `testBlockers`, dentro do recorte testado):
    sem pendências → `"Tudo preenchido neste teste."`; uma → `"Falta 1 item: <label>"`; várias → `"Faltam N itens: <label1>, <label2>…"` (até 3 nomes, depois `" e mais K"`). Quando o motivo é `justification` o nome vem como `"<label> (justificativa)"`; quando é `evidence`, `"<label> (detecção)"`.
  - `approvePendingItems(test: string): number` (no recorte testado) — marca `passed` todo item `pending` do teste cujo id **não** esteja bloqueado por `evidence`; não toca em item já marcado; devolve quantos mudou.
  - `renderActionBar()` em teste: `#activeTestBlockers` = `blockersText(state.activeTest)`; `#passAndNextTest` = `"Próximo →"` quando `testRailState` não é `pending`/`incomplete`, senão `"Aprovar tudo e próximo →"` (no último teste: `"Revisar →"` / `"Aprovar tudo e revisar →"`); `#failAndNextTest` = `"Reprovar"`; `#skipActiveTest` = `"Pular"`. `#activeTestStep` = `"N de 9"`.
  - `completeActiveTest(result)`:
    - `"passed"`: se `approvePendingItems` mudou algo, `invalidateTestConfirmation()`; depois, se `testBlockers` não está vazio → não avança: liga `show-blockers` em `#hardwareChecklistItems`, re-renderiza, foca o primeiro botão do primeiro item bloqueado (`scrollIntoView({ block: "nearest" })` dentro do painel) e atualiza a barra. Senão avança.
    - `"failed"`: se nenhum item está `failed` → não avança; liga `show-blockers`, foca o primeiro item pendente (ou o primeiro item) e `#activeTestBlockers` = `"Marque Reprovado no item que falhou e descreva o defeito."`. Se há `failed` e `testBlockers` vazio → avança. Se há bloqueio → mesmo tratamento de `"passed"` sem aprovar nada.
    - `"pending"` (Pular): avança sem alterar nada.
    - Avançar = `openTest(próximo)`; no último, `openReview()`. `show-blockers` é desligado ao abrir outro teste.
  - A mensagem longa atual em `hardwareChecklistStatus` ("Registre cada resultado e justifique…") é removida; a barra a substitui.

- [ ] **Step 1: Teste que falha** — acrescentar a `TestsLayout.Tests.cjs`:

```js
uiState.testChecklist = items();
assert.equal(ui.blockersText('audio'), 'Falta 1 item: Alto-falantes (detecção)');
assert.equal(ui.approvePendingItems('audio'), 0, 'evidência nunca é pulada');
assert.equal(uiState.testChecklist.find(i => i.id === 'audio.speakers').result, 'pending');
set('usb.port-1', { result: 'failed', notes: '' });
assert.equal(ui.approvePendingItems('usb'), 2);
assert.equal(uiState.testChecklist.find(i => i.id === 'usb.port-1').result, 'failed', 'não sobrescreve item marcado');
assert.equal(ui.blockersText('usb'), 'Falta 1 item: USB 1 (justificativa)');
set('usb.port-1', { notes: 'Sem contato' });
assert.equal(ui.blockersText('usb'), 'Tudo preenchido neste teste.');
uiState.testChecklist = items();
assert.match(ui.blockersText('screen'), /^Faltam 2 itens: /);
```
  (o rótulo exato de `audio.speakers` vem de `checklist.catalog`; usar o valor do catálogo na afirmação se diferir de "Alto-falantes".)
- [ ] **Step 2:** `node TestsLayout.Tests.cjs` → FALHA.
- [ ] **Step 3:** Implementar. Atualizar `MacUi.Tests.ps1:266` para `'function\s+completeActiveTest[\s\S]*testBlockers[\s\S]*await openTest\(nextTest\)'`, `:267` para `$appText -match 'Aprovar tudo e revisar'`, e `WindowsWebPreview.Tests.ps1:251` de acordo.
- [ ] **Step 4:** Todas as suítes → PASS.
- [ ] **Step 5:** Conferência visual: no Som sem tocar o tom, "Aprovar tudo" não avança e aponta o item; no USB, "Aprovar tudo" preenche e avança; "Reprovar" sem item reprovado pede para marcar; "Pular" deixa "Pendente"/"Falta N" na lista.
- [ ] **Step 6: Commit** — `feat: barra de ação mostra o que falta e aprova pendentes`

---

### Task 5: Revisão e confirmação

**Files:**
- Modify: `CoreCAIJ/mac-ui/index.html` (`#testReviewPanel`)
- Modify: `CoreCAIJ/mac-ui/app.js` (`renderTests` trecho de `testsReportDetails`, `renderTestConfirmation`, `renderActionBar`)
- Modify: `CoreCAIJ/mac-ui/style.css`
- Test: `CoreCAIJ/TestsLayout.Tests.cjs`

**Interfaces:**
- Consumes: `testRailState`, `blockersText`, `openTest`.
- Produces:
  - `#testReviewPanel`, de cima para baixo: título "Revisão e confirmação"; `ul#testsReportDetails` como grade dos 9 testes; `section.test-confirmation` (campos atuais, sem o botão, que está na barra); `details` com `#testConfirmationHistory`; `#copyTestsReport` e `#resetTests`; `#testsActionStatus`.
  - `reviewSummaryHtml(): string` (no recorte testado) — um `<li data-state="<testRailState>">` por teste com `<button type="button" data-review-test="<id>">`, nome, texto de estado (mesmos da lista lateral) e, quando `pending`/`incomplete`, o `blockersText(test)`. `renderTests` usa essa função para `#testsReportDetails`.
  - Clique em `[data-review-test]` → `openTest(id)`.
  - `renderActionBar()` na Revisão: `#activeTestBlockers` recebe o texto de `#testConfirmationStatus` (primeiro erro de validação ou orientação); `#confirmHardwareTests` visível.
  - `#resetTests` pede confirmação (`window.confirm("Limpar todos os resultados deste equipamento?")`) e, depois de limpar, chama `openFirstOpenStep()`.

- [ ] **Step 1: Teste que falha** — acrescentar a `TestsLayout.Tests.cjs`:

```js
uiState.testChecklist = items();
uiState.testChecklist.filter(i => i.testId === 'usb').forEach(i => i.result = 'passed');
const summary = ui.reviewSummaryHtml();
assert.equal((summary.match(/data-review-test="/g) || []).length, 9);
assert.match(summary, /data-state="passed"[\s\S]*?data-review-test="usb"|data-review-test="usb"[\s\S]*?Aprovado/);
assert.match(summary, /Faltam 2 itens/, 'teste pendente mostra o que falta');
```
- [ ] **Step 2:** `node TestsLayout.Tests.cjs` → FALHA.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Todas as suítes → PASS (as afirmações de `MacUi.Tests.ps1` sobre `finishTests`, `testsActionStatus` e `caij:mac-tests-observation` continuam valendo sem alteração).
- [ ] **Step 5:** Conferência visual do fluxo inteiro: preencher os 9 testes → Revisão mostra tudo verde → preencher técnico, declaração e palavra → Confirmar → "Concluir e voltar" aparece. Repetir com um teste reprovado (palavra `REGISTRADO`) e com um teste pulado (Revisão aponta o teste e o clique leva até ele).
- [ ] **Step 6: Commit** — `feat: revisão mostra o estado de cada teste e o que falta`

---

### Task 6: Janela estreita e acabamento

**Files:**
- Modify: `CoreCAIJ/mac-ui/style.css`
- Modify: `CoreCAIJ/MacUi.Tests.ps1` (nova afirmação)

**Interfaces:**
- Consumes: marcação das Tasks 2–5.
- Produces:
  - `@media (max-width: 1000px)`: `.tests-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0,1fr); }`; `#testRail` vira faixa horizontal (`display: flex; overflow-x: auto;`) de pílulas com ícone + nome (texto de estado some, exceto "Falta N"); barra de ação continua fixa embaixo, com botões que quebram linha.
  - Teste de teclado: `#activeTestBody` com `overflow-x: auto` próprio, para o mapa (`min-width: 760px`) nunca alargar a página.
  - Transição de 150ms em fundo/borda ao mudar `data-state` e `data-result`; desligada em `@media (prefers-reduced-motion: reduce)`.
  - Foco visível (`outline: 3px solid #b7f8eb`) nos botões da lista lateral e da barra.

- [ ] **Step 1: Afirmação que falha** — em `MacUi.Tests.ps1`: `Assert-True ($styleText -match '@media\s*\(max-width:\s*1000px\)[\s\S]*#testRail[\s\S]*overflow-x:\s*auto') 'lista de testes vira faixa horizontal em janela estreita'`.
- [ ] **Step 2:** `powershell -NoProfile -File MacUi.Tests.ps1` → FALHA nessa afirmação.
- [ ] **Step 3:** Implementar o CSS.
- [ ] **Step 4:** Todas as suítes → PASS.
- [ ] **Step 5:** Conferência visual em 1366×768, 1920×1080 e largura de 800px: sem rolagem da página em nenhum teste; teclado e câmera cabem ou rolam só dentro do painel; barra de ação sempre visível.
- [ ] **Step 6: Commit** — `feat: central de testes se adapta a janela estreita`
