const assert = require('node:assert/strict');
const observation = require('./mac-ui/observation.js');

assert.deepEqual(observation.services.map((service) => service.id), ['system', 'cleaning', 'tests']);
assert.equal(observation.build(), '');
assert.equal(
  observation.build({ ids: ['cleaning', 'system'], note: 'Carregador substituído' }),
  'Serviços realizados: Sistema instalado; Limpeza interna\nObservações: Carregador substituído',
);
assert.equal(
  observation.build({ ids: ['system', 'cleaning', 'tests'], note: 'Risco na tampa', label: true }),
  'Serviços: Sistema instalado; Limpeza interna; Testes aprovados. Obs.: Risco na tampa',
);
assert.equal(observation.build({ ids: ['tests'], testsStatus: 'OK' }), 'Serviços realizados: Testes aprovados');
assert.equal(observation.build({ testsStatus: 'FALHOU' }), 'Serviços realizados: Testes: falhou');
assert.equal(observation.build({ ids: ['tests'], testsStatus: 'FALHOU' }), 'Serviços realizados: Testes: falhou');
assert.equal(observation.build({ note: 'Detalhe livre', label: true }), 'Obs.: Detalhe livre');
assert.equal(observation.fitsLabel('Texto curto'), true);
assert.equal(observation.fitsLabel(observation.build({ ids: ['system', 'cleaning', 'tests'], note: 'Risco na tampa', label: true })), true);
assert.equal(observation.fitsLabel('palavra '.repeat(26)), false);
assert.equal(observation.fitsLabel('x'.repeat(181)), false);
console.log('ObservationChecklist.Tests: OK');
