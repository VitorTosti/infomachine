const assert = require('node:assert/strict');
const checklist = require('./mac-ui/test-checklist.js');
const clone = data => JSON.parse(JSON.stringify(data));
const fs = require('node:fs');
const vm = require('node:vm');
const evidenceDetails = { 'audio.speakers': 'Tom reproduzido nos lados esquerdo e direito', 'trackpad.movement': '20 movimentos detectados na área de teste', 'trackpad.buttons': 'Cliques detectados: esquerdo 1, direito 1', 'charger.connectors': 'Alimentação mudou de bateria para tomada após reconectar o carregador', 'network.ethernet': 'Interface ethernet conectada: Rede cabeada; IP 192.168.1.2', 'network.wifi': 'Interface wifi conectada: Wi-Fi; IP 192.168.1.3' };
const complete = () => ({ technician: 'Vitor', serial: 'QA-CHECK-001', mode: 'APROVADO', notes: '',
  items: checklist.createChecklist({ usbPorts: ['USB esquerda', 'USB direita'] }).map(item => ({ ...item, result: 'passed', ...(evidenceDetails[item.id] ? { evidence: { source: 'auto', detail: evidenceDetails[item.id], at: '2026-11-16T12:00:00Z' } } : {}) })) });
const valid = data => checklist.validateConfirmation(data).ok;

assert.equal(checklist.catalog.length, 9);
assert.deepEqual(checklist.catalog.map(group => group.id), ['camera', 'keyboard', 'audio', 'screen', 'trackpad', 'usb', 'charger', 'network', 'hdmi']);
assert.ok(checklist.createChecklist().every(item => item.result === 'pending'));
assert.equal(valid(complete()), true);
const noAudioEvidence = complete(); delete noAudioEvidence.items.find(item => item.id === 'audio.speakers').evidence;
assert.equal(valid(noAudioEvidence), false, 'Som aprovado exige reprodução registrada');
for (const id of ['trackpad.movement', 'trackpad.buttons']) {
  const missing = complete(); delete missing.items.find(item => item.id === id).evidence;
  assert.equal(valid(missing), false, `${id} aprovado exige evidência`);
  const manual = complete(); manual.items.find(item => item.id === id).evidence = { source: 'manual', detail: 'Testado fisicamente; navegador não detectou', at: '2026-11-16T12:00:00Z' };
  assert.equal(valid(manual), true, `${id} aceita justificativa manual`);
}
const noChargerEvidence = complete(); delete noChargerEvidence.items.find(item => item.id === 'charger.connectors').evidence;
assert.equal(valid(noChargerEvidence), false, 'Carregador aprovado exige evidência');
for (const id of ['network.ethernet', 'network.wifi']) {
  const missing = complete(); delete missing.items.find(item => item.id === id).evidence;
  assert.equal(valid(missing), false, `${id} aprovado exige detecção`);
  const manual = complete(); manual.items.find(item => item.id === id).evidence = { source: 'manual', detail: 'Conexão testada apesar da falha de leitura', at: '2026-11-16T12:00:00Z' };
  assert.equal(valid(manual), true, `${id} aceita justificativa manual`);
}
const manualAudio = complete(); manualAudio.items.find(item => item.id === 'audio.speakers').evidence = { source: 'manual', detail: 'Saída testada pelo sistema operacional', at: '2026-11-16T12:00:00Z' };
assert.equal(valid(manualAudio), true, 'Detecção falha permite justificativa manual');
const appSource = fs.readFileSync(`${__dirname}/mac-ui/app.js`, 'utf8');
const rendered = { innerHTML: '', textContent: '' };
const uiState = { activeTest: 'audio', testChecklist: complete().items, checklistNotesOpen: new Set() };
const ui = vm.createContext({ state: uiState, qs: id => id === 'hardwareChecklistItems' ? rendered : id === 'usbPortTools' ? { classList: { toggle() {} } } : rendered,
  escapeHtml: value => String(value), window: { CAIJ_TEST_CHECKLIST: checklist } });
vm.runInContext(appSource.slice(appSource.indexOf('const evidenceRequiredItems'), appSource.indexOf('function renderTestConfirmation(')), ui);
ui.renderHardwareChecklist();
assert.match(rendered.innerHTML, /Detecção registrada: Tom reproduzido/);
assert.doesNotMatch(rendered.innerHTML, /data-evidence-manual=/, 'Com detecção automática, não mostrar alternativa manual');
delete uiState.testChecklist.find(item => item.id === 'audio.speakers').evidence;
ui.renderHardwareChecklist();
assert.match(rendered.innerHTML, /Detecção falhou\? Registrar verificação manual/);
assert.doesNotMatch(rendered.innerHTML, /data-check-value="pending"/, 'Limpar por item deixa de existir');
assert.match(rendered.innerHTML, /hardware-check-compact/);
assert.match(rendered.innerHTML, /data-note-open="audio\.speakers"/, 'observação opcional fica recolhida');
uiState.testChecklist.find(item => item.id === 'audio.speakers').result = 'failed';
ui.renderHardwareChecklist();
assert.match(rendered.innerHTML, /Justificativa obrigatória/);
assert.match(rendered.innerHTML, /data-blocked="justification"/);
uiState.testChecklist.find(item => item.id === 'audio.speakers').result = 'passed';
manualAudio.confirmedAt = '2026-11-16T12:00:00Z'; manualAudio.fingerprint = checklist.fingerprint(manualAudio);
assert.match(checklist.buildReport(manualAudio), /Alto-falantes.*\[Aprovado – manual\][\s\S]*Evidência manual: Saída testada/);
for (const field of ['technician', 'serial']) {
  const data = complete(); data[field] = ' \t ';
  assert.equal(valid(data), false, `${field} obrigatorio`);
}
for (const group of checklist.catalog) {
  const data = complete(); data.items = data.items.filter(item => item.testId !== group.id);
  assert.equal(valid(data), false, `Grupo obrigatorio: ${group.id}`);
}
for (const result of ['failed', 'untested']) {
  const data = complete(); data.items[0].result = result;
  for (const notes of ['', ' \n\t ']) {
    data.items[0].notes = notes;
    assert.equal(valid(data), false, `${result} exige justificativa`);
    assert.equal(valid({ ...data, mode: 'REGISTRADO' }), false);
  }
  data.items[0].notes = 'Imagem apresenta interrupcoes';
  assert.equal(valid(data), false);
  assert.equal(valid({ ...data, mode: 'REGISTRADO' }), true);
}
const optionalNA = complete(); optionalNA.items[0].result = 'not_applicable'; optionalNA.items[0].notes = '';
assert.equal(valid(optionalNA), true, 'Nao se aplica permite observacao em branco');
assert.equal(valid({ ...optionalNA, mode: 'REGISTRADO' }), true);
for (const mode of ['APROVADO', 'REGISTRADO']) {
  const data = complete(); data.mode = mode; data.items[0].result = 'pending';
  assert.equal(valid(data), false, 'Pendentes nunca podem ser confirmados');
}
const allNA = complete();
allNA.items.forEach(item => { item.result = 'not_applicable'; item.notes = 'Ausente neste equipamento'; });
assert.equal(valid(allNA), false, 'Nenhum ensaio aprovado nao autoriza APROVADO');
assert.equal(valid({ ...allNA, mode: 'REGISTRADO' }), true);
const duplicate = complete(); duplicate.items.push({ ...duplicate.items[0] });
assert.equal(valid(duplicate), false);
const invalid = complete(); invalid.items[0].result = 'unknown';
assert.equal(valid(invalid), false);
for (const mutate of [data => data.items[0].testId = 'unknown',
  data => data.items[0].testId = 'keyboard', data => data.items[0].label = ' ',
  data => data.items.find(item => item.id === 'usb.port-1').testId = 'camera',
  data => data.items.push({ id: 'camera.extra', testId: 'camera', label: 'Inventado', result: 'passed', notes: '' })]) {
  const data = complete(); mutate(data);
  assert.equal(valid(data), false, 'Relatorio deve incluir todos os itens no grupo correto');
}
for (const [group, ids] of Object.entries({ keyboard: ['keyboard.keys'], audio: ['audio.speakers'],
  screen: ['screen.pixels', 'screen.artifacts'], trackpad: ['trackpad.movement', 'trackpad.buttons'],
  charger: ['charger.connectors', 'charger.firmness'], hdmi: ['hdmi.detection', 'hdmi.image'] })) {
  assert.deepEqual(complete().items.filter(item => item.testId === group).map(item => item.id), ids);
}
assert.equal(complete().items.length, 17, 'Checklist simplificado: 15 criterios fixos e 2 portas USB');
assert.equal(checklist.catalog.find(group => group.id === 'hdmi').label, 'HDMI');
assert.equal(checklist.catalog.find(group => group.id === 'screen').items[0].label, 'Sem pontos luminosos');
assert.equal(checklist.catalog.find(group => group.id === 'screen').items[1].label, 'Sem linhas ou manchas');
assert.throws(() => checklist.createChecklist({ usbPorts: -1 }), RangeError);
assert.throws(() => checklist.createChecklist({ usbPorts: 33 }), RangeError);
assert.throws(() => checklist.createChecklist({ usbPorts: [{ id: 'usb.inventory' }] }));
assert.equal(checklist.createChecklist({ usbPorts: 0 }).filter(item => item.testId === 'usb').length, 1, 'Inventario USB continua obrigatorio sem portas');

const signed = complete();
const signature = { fingerprint: checklist.fingerprint(signed) };
assert.equal(checklist.signatureMatches(signature, clone(signed)), true);
assert.equal(checklist.signatureMatches(signature, { ...signed, confirmedAt: '2026-11-12T12:00:00Z' }), true);
for (const mutate of [data => data.serial += 'X', data => data.technician = 'Lucas', data => data.notes = 'Nota nova',
  data => data.items[0].notes = 'Observacao nova', data => data.items[0].result = 'failed',
  data => data.items.find(item => item.id === 'usb.port-1').label = 'USB traseira',
  data => data.items.pop(), data => data.mode = 'REGISTRADO']) {
  const altered = clone(signed); mutate(altered);
  assert.equal(checklist.signatureMatches(signature, altered), false, 'Qualquer alteracao relevante invalida confirmacao');
}
assert.equal(checklist.signatureMatches(null, signed), false);
const reportData = complete(); reportData.mode = 'REGISTRADO';
reportData.items.find(item => item.id === 'network.ethernet').result = 'not_applicable';
reportData.items.find(item => item.id === 'network.ethernet').notes = 'Modelo sem porta Ethernet';
reportData.items.find(item => item.id === 'hdmi.image').result = 'untested';
reportData.items.find(item => item.id === 'hdmi.image').notes = 'HDMI nao pode ser testado';
reportData.confirmedAt = '2026-11-13T12:00:00.000Z';
reportData.fingerprint = checklist.fingerprint(reportData);
const report = checklist.buildReport(reportData);
for (const text of ['REGISTRADO', 'Vitor', 'QA-CHECK-001', 'USB esquerda', 'USB direita', 'Não se aplica', 'Não testado', 'Modelo sem porta Ethernet', 'HDMI nao pode ser testado', 'Confirmação local do técnico']) assert.ok(report.includes(text), text);
for (const group of checklist.catalog) assert.ok(report.includes(group.label));
assert.match(checklist.buildReport({ ...reportData, serial: '' }), /Situação: NÃO CONFIRMADO/);
const nativeFooter = 'Confirmação local do técnico; o envio ao rastreador depende do cadastro ou da integração correspondente.';
assert.equal(report.split('\n').at(-1), nativeFooter, 'Exclusoes N/A nao podem deslocar o rodape exigido pelo consumidor nativo');
assert.ok(report.indexOf('Itens marcados Não se aplica') < report.lastIndexOf(nativeFooter));
assert.match(report, /Situação: REGISTRADO/);
for (const unconfirmed of [complete(), { ...reportData, confirmedAt: undefined },
  { ...reportData, confirmedAt: 'data invalida' }, { ...reportData, fingerprint: undefined },
  { ...reportData, notes: 'Alteracao depois da confirmacao' }]) {
  const draft = checklist.buildReport(unconfirmed);
  assert.match(draft, /Situação: NÃO CONFIRMADO/, 'Rascunho ou confirmacao desatualizada nunca se apresentam como aprovado');
  assert.doesNotMatch(draft, /^Confirmação: /m);
}
const approvedReport = complete(); approvedReport.confirmedAt = '2026-11-13T12:00:00.000Z'; approvedReport.fingerprint = checklist.fingerprint(approvedReport);
assert.match(checklist.buildReport(approvedReport), /Situação: APROVADO/);
const oldReport = clone(approvedReport);
oldReport.items.push({id:'keyboard.shortcuts',testId:'keyboard',label:'Teclas modificadoras verificadas',result:'passed',notes:''});
oldReport.fingerprint = checklist.fingerprint(oldReport);
assert.equal(valid(oldReport), false, 'Criterio removido nao pode ser confirmado como checklist atual');
const historyText = checklist.buildRecordReport(oldReport);
assert.match(historyText, /^HISTÓRICO DE TESTES DE HARDWARE/);
assert.match(historyText, /Situação registrada: APROVADO/);
assert.match(historyText, /Não confirma os testes atuais/);
assert.match(historyText, /Teclas modificadoras verificadas: Aprovado/);
assert.doesNotMatch(historyText, /^Situação: APROVADO/m);
// Snapshot matching proves local consistency; it supplies no login or cryptographic authentication.
assert.equal(checklist.signatureMatches({ fingerprint: checklist.fingerprint(signed) }, signed), true);
console.log('PASS: checklist de nove grupos, ressalvas, confirmacao local, invalidacao e relatorio detalhado.');
