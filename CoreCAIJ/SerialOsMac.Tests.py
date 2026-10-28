import importlib.util
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote

path = Path(__file__).parent / "mac-ui" / "server.py"
spec = importlib.util.spec_from_file_location("caij_mac_server", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

calls = []
state = SimpleNamespace(request_server=lambda url, timeout=0: calls.append((url, timeout)) or {
    "status": "ok", "ordens": [{"numero": 1164, "osCodigo": "C001164", "garantia": "7NKF1G3"}]
})
result = module.AppState.lookup_os_by_serial(state, "7NKF1G3")
assert result["ordens"][0]["osCodigo"] == "C001164"
assert calls == [("/os-por-serial?serial=" + quote("7NKF1G3", safe=""), 45)]
print("PASS: app Mac consulta o NAS pela serial sem alterar OS.")
