const assert = require('node:assert/strict');
const aesthetic = require('./mac-ui/aesthetic-triage.js');
const checklist = require('./mac-ui/test-checklist.js');

function filled() {
  const record = aesthetic.createRecord();
  record.parts.forEach(part => { part.status = 'perfect'; });
  return record;
}
const record = filled();
assert.equal(aesthetic.evaluate(record).grade, 'A');
record.parts[0].status = 'light'; record.parts[0].marks = [{ x: .25, y: .5 }];
assert.equal(aesthetic.evaluate(record).grade, 'A');
record.parts[1].status = 'light'; record.parts[1].marks = [{ x: .2, y: .3 }];
assert.equal(aesthetic.evaluate(record).grade, 'B');
for (const part of record.parts.slice(2, 4)) { part.status = 'light'; part.marks = [{ x: .4, y: .6 }]; }
assert.equal(aesthetic.evaluate(record).grade, 'C');
record.parts[5].status = 'damage'; record.parts[5].marks = [{ x: .5, y: .5 }];
assert.equal(aesthetic.evaluate(record).grade, 'D');
record.parts[5].marks = [];
assert.equal(aesthetic.validate(record).ok, false);
record.parts[5].marks = [{ x: .5, y: .5 }];
record.gradeOverride = 'C';
assert.equal(aesthetic.validate(record).ok, false);
record.overrideReason = 'Revisado pelo responsável';
assert.equal(aesthetic.validate(record).ok, true);
assert.match(aesthetic.buildReport(record), /Grade confirmada: C/);
const oldData = { technician: 'T', serial: 'S', items: [], mode: 'REGISTRADO', notes: '' };
assert.notEqual(checklist.fingerprint(oldData), checklist.fingerprint({ ...oldData, aesthetic: record }));
console.log('PASS: grades A/B/C/D, marcação, alteração justificada e assinatura estética.');
