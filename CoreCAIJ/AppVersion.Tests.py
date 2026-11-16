import importlib.util
from pathlib import Path
import tempfile
spec = importlib.util.spec_from_file_location('app_version_server', Path(__file__).parent / 'mac-ui' / 'server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    core = Path(directory)
    assert module.read_version_metadata(core) == {'version': '', 'versionRecordedAt': ''}
    marker = core / 'caij_versao_app.txt'
    marker.write_text('2026.11.11.100000', encoding='utf-8-sig')
    metadata = module.read_version_metadata(core)
    assert metadata['version'] == '2026.11.11.100000'
    assert metadata['versionRecordedAt'].endswith('Z')
    marker.write_bytes(b'\xff\xfe\x80')
    assert module.read_version_metadata(core)['version'] == '', 'marcador ilegivel nao pode impedir abertura'
print('PASS: metadados reais de versao e fallback seguro para marcador ausente/ilegivel.')
