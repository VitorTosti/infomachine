"""Grade D integration tests with temporary state and no network/printing."""
import importlib.util
from pathlib import Path
import tempfile

spec = importlib.util.spec_from_file_location('grade_d_server', Path(__file__).parent / 'mac-ui' / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    core = root / 'fixture' / 'CoreCAIJ'
    core.mkdir(parents=True)
    runtime = root / 'runtime.json'
    runtime.write_text('{"osNumero":235,"info":{"serial":"QA-D-001"}}', encoding='utf-8')
    app = server.AppState(core, runtime)
    calls = []

    def fake_server(path, method='GET', payload=None, timeout=12):
        calls.append((path, payload))
        return {'status': 'ok', 'osNumero': 236, 'proximoDisponivel': 237,
                'rastreador': {'status': 'updated'}}

    app.request_server = fake_server
    create = {'tecnico': 'Vitor', 'serial': 'QA-D-001', 'referencia': 'GRADE D',
              'produto': {'idProduto': 1, 'codigo': 'QA1', 'descricao': 'Fixture'},
              'observacao': 'Servicos realizados: Testes aprovados'}
    print_request = {'grade': 'D', 'obs': 'Servicos: Testes aprovados', 'includeOs': False}
    for detail in [None, '', ' \t\n ']:
        for operation, body in [(app.create_os, create), (app.print_label, print_request)]:
            before = len(calls)
            result = operation(dict(body, detalheGrade=detail))
            assert result['ok'] is False, (operation.__name__, detail, result)
            assert len(calls) == before, 'D vazio nao pode chegar a rede, reservar OS ou imprimir'

    detail = 'Risco profundo na tampa'
    assert app.create_os(dict(create, detalheGrade=detail))['ok']
    created = next(payload for route, payload in calls if route == '/criar-os-altertag')
    assert created['referencia'] == 'GRADE D'
    assert created['detalheGrade'] == detail
    assert detail in created['observacao']
    assert app.print_label(dict(print_request, detalheGrade=detail))['ok']
    printed = next(payload for route, payload in calls if route == '/imprimir')
    assert printed['grade'] == 'D'
    assert printed['detalheGrade'] == detail
    assert detail in printed['obs']
    for grade in ['B', 'C']:
        assert server.validate_print_request(grade, ' ') != ''
    for grade in ['A', 'RMA']:
        assert server.validate_print_request(grade, '') == ''

print('PASS: Python bloqueia Grade D sem detalhe livre e preserva detalhe em cadastro/etiqueta.')
