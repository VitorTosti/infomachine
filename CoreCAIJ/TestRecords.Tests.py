import importlib.util,tempfile,pathlib,threading,json,subprocess
spec=importlib.util.spec_from_file_location('caijserver','CoreCAIJ/mac-ui/server.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
items=json.loads(subprocess.check_output(['node','-e',"const c=require('./CoreCAIJ/mac-ui/test-checklist.js');console.log(JSON.stringify(c.createChecklist().map(i=>({...i,result:'passed'}))))"],text=True,encoding='utf-8'))
next(item for item in items if item['id']=='audio.speakers')['evidence']=dict(source='auto',detail='Tom reproduzido nos lados esquerdo e direito',at='2026-11-16T12:00:00Z')
next(item for item in items if item['id']=='trackpad.movement')['evidence']=dict(source='auto',detail='20 movimentos detectados na area de teste',at='2026-11-16T12:00:00Z')
next(item for item in items if item['id']=='trackpad.buttons')['evidence']=dict(source='auto',detail='Cliques detectados: esquerdo 1, direito 1',at='2026-11-16T12:00:00Z')
next(item for item in items if item['id']=='charger.connectors')['evidence']=dict(source='auto',detail='Alimentacao mudou de bateria para tomada apos reconectar o carregador',at='2026-11-16T12:00:00Z')
record=dict(technician='TÃ©cnico Ã',serial='ABC',items=items,mode='APROVADO',confirmedAt='2026-11-12T12:00:00.000Z',fingerprint='snapshot',notes='ObservaÃ§Ã£o')
with tempfile.TemporaryDirectory() as d:
 app=m.AppState.__new__(m.AppState);app.lock=threading.RLock();app.test_records_path=lambda:pathlib.Path(d)/'registros.json'
 assert app.test_records()['records']==[]
 no_audio=json.loads(json.dumps(record));next(item for item in no_audio['items'] if item['id']=='audio.speakers').pop('evidence')
 try:app.test_records(no_audio)
 except ValueError:pass
 else:raise AssertionError('Som sem evidencia aceito')
 assert app.test_records(record)['record']['technician']=='TÃ©cnico Ã'
 fresh=m.AppState.__new__(m.AppState);fresh.lock=threading.RLock();fresh.test_records_path=app.test_records_path
 assert len(fresh.test_records()['records'])==1
 fresh.test_records(record);assert pathlib.Path(d,'registros.json.bak').exists()
 before=pathlib.Path(d,'registros.json').read_bytes()
 for change in [dict(items=items[:1]),dict(items=[{**i,'result':'pending'} for i in items]),dict(mode='APROVADO',items=[{**i,'result':'failed','notes':'falha'} for i in items])]:
  try:fresh.test_records({**record,**change})
  except ValueError:pass
  else:raise AssertionError('Invalid accepted')
  assert pathlib.Path(d,'registros.json').read_bytes()==before
 assert len(fresh.test_records()['records'])==2
 na=json.loads(json.dumps(record));na['items'][0].update(result='not_applicable',notes='')
 assert fresh.test_records(na)['record']['items'][0]['notes']==''
 for result in ('failed','untested'):
  invalid=json.loads(json.dumps(na));invalid['mode']='REGISTRADO';invalid['items'][0].update(result=result,notes='')
  try:fresh.test_records(invalid)
  except ValueError:pass
  else:raise AssertionError('Missing failure/untested justification accepted')
 print('Python durable reopen/backup/unicode + 3 rejection cases OK')
