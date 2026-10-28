const state = {
  info: {},
  deviceReading: nativeReadingStatus(),
  equipmentType: "Notebook",
  grade: "A",
  view: "home",
  watchingOs: false,
  createOs: {
    technician: "",
    product: null,
  },
  device3u: null,
  awaitingDeviceImport: false,
  osDetail: null,
  tests: {
    camera: "pending",
    keyboard: "pending",
    audio: "pending",
    screen: "pending",
    trackpad: "pending",
  },
  activeTest: "",
  mediaStream: null,
  audioContext: null,
  toneContext: null,
  audioFrame: 0,
  keyboardHandler: null,
  keyboardPressed: null,
  keyboardLayoutE14: null,
  mouseButtonCleanup: null,
  environment: {
    internetOnline: true,
    serverOnline: false,
  },
  lastPrint: readLastPrint(),
  printHistory: readPrintHistory(),
  operationalError: "",
  osCreatedInSession: false,
  manualOsSet: false,
  serialOsLookup: { status: "idle", serial: "", orders: [], message: "" },
};

function nativeReadingStatus() {
  return window.CAIJ_NATIVE_RUNTIME?.deviceReading || 'ready';
}

const fields = ["modelo", "serial", "cpu", "gpu", "ram", "disco", "bateria"];
const labelFields = [...fields, "imei", "ciclos", "monitorTamanho", "monitorEntradas"];
const labels = {
  modelo: "Modelo",
  serial: "Serial",
  cpu: "CPU",
  gpu: "GPU",
  ram: "RAM",
  disco: "Disco",
  bateria: "Bateria",
};

const testLabels = {
  camera: "Camera",
  keyboard: "Teclado",
  audio: "Som/Mic",
  screen: "Tela",
  trackpad: "Trackpad",
};
const testSequence = ["camera", "keyboard", "audio", "screen", "trackpad"];

const nativeRuntime = window.CAIJ_NATIVE_RUNTIME || {};
const isWindowsPreview = String(nativeRuntime.platform || "").toLowerCase() === "windows";
const testsOnlyMode = new URLSearchParams(window.location.search).get("tests") === "1" ||
  (window.location.protocol === "file:" && !window.CAIJ_NATIVE_RUNTIME);
const defaultModelName = isWindowsPreview ? "Notebook Windows" : "Apple MacBook";
let statusTimer = 0;
let osInputTimer = 0;
let osVerificationRequest = 0;
let serialOsLookupRequest = 0;
let serialOsLookupActiveRequest = 0;
let serialOsLookupTimer = 0;
let lastSerialOsLookup = "";

function applyPlatformUi() {
  if (!isWindowsPreview) return;
  document.body.classList.add("windows-preview");
  document.title = "CAIJ InfoNotebook Windows - Previa";
  qs("platformName").textContent = "Windows";
  qs("brandKicker").classList.add("hidden");
  qs("serverLine").classList.add("hidden");
  qs("versionBadge").classList.add("hidden");
  qs("devicePanelTitle").textContent = "Informacoes do Windows";
  qs("testsTitle").textContent = "Central de testes Windows";
  qs("pointingDeviceTitle").textContent = "Mouse / Touchpad";
  qs("pointingDeviceDescription").textContent = "Validar movimento, cliques e rolagem.";
  testLabels.trackpad = "Mouse / Touchpad";
  document.querySelectorAll(".windows-only").forEach((element) => element.classList.remove("hidden"));
}

function qs(id) {
  return document.getElementById(id);
}

async function api(path, body) {
  if (window.CAIJ_PORTABLE_API) {
    return window.CAIJ_PORTABLE_API(path, body);
  }
  const options = body ? {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  } : {};
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "Falha na operacao");
  }
  return data;
}

function setStatus(message, type = "") {
  const el = qs("statusLine");
  window.clearTimeout(statusTimer);
  el.className = `status-line ${type}`.trim();
  el.textContent = message;
  const isIdle = !String(message || "").trim() || String(message).trim().toLowerCase() === "pronto.";
  el.hidden = isIdle;
  if (!isIdle && type === "ok") {
    statusTimer = window.setTimeout(() => { el.hidden = true; }, 3200);
  }
  if (type === "warn") state.operationalError = String(message || "").trim();
  if (type === "ok") state.operationalError = "";
  renderOperationalDashboard();
}

function setButtonBusy(button, busy, busyLabel = "Processando...") {
  if (!button) return;
  if (busy) {
    button.dataset.idleLabel = button.textContent.trim();
    button.dataset.wasDisabled = String(button.disabled);
    button.textContent = busyLabel;
    button.disabled = true;
    button.classList.add("is-busy");
    button.setAttribute("aria-busy", "true");
    return;
  }
  button.textContent = button.dataset.idleLabel || button.textContent;
  button.disabled = button.dataset.wasDisabled === "true";
  button.classList.remove("is-busy");
  button.removeAttribute("aria-busy");
  delete button.dataset.idleLabel;
  delete button.dataset.wasDisabled;
}

function setPrintProgress(message, phase = "busy") {
  const element = qs("printProgress");
  if (!element) return;
  element.hidden = !message;
  element.className = `print-progress ${phase}`;
  element.textContent = message || "";
}

async function checkPrintConnections() {
  const button = qs("checkPrintConnections");
  const panel = qs("printDiagnostics");
  if (!button || !panel || button.disabled) return;
  setButtonBusy(button, true, "Verificando...");
  panel.replaceChildren();
  try {
    const data = await api("/api/print-diagnostics");
    for (const [label, key] of [["NAS", "servidor"], ["QR", "qr"], ["Impressora", "impressora"]]) {
      const item = document.createElement("span");
      const result = data[key] || {};
      const available = result.status === "disponivel";
      item.className = available ? "available" : "unavailable";
      item.textContent = `${label}: ${available ? "disponível" : "indisponível"}`;
      item.title = result.detalhe || "Sem detalhes";
      panel.appendChild(item);
    }
  } catch (error) {
    const item = document.createElement("span");
    item.className = "unavailable";
    item.textContent = `Diagnóstico indisponível: ${error.message || "sem conexão"}. NAS, QR e impressora não verificados.`;
    panel.appendChild(item);
  } finally {
    setButtonBusy(button, false);
  }
}

function readLastPrint() {
  try {
    return JSON.parse(localStorage.getItem("caij:last-print") || "null");
  } catch (_) {
    return null;
  }
}

function readPrintHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem("caij:print-history") || "null");
    if (Array.isArray(saved)) return saved.filter((entry) => entry && typeof entry === "object").slice(0, 8);
  } catch (_) {}
  const legacy = readLastPrint();
  return legacy ? [legacy] : [];
}

function saveLastPrint(data) {
  const entry = { ...data, printedAt: data.printedAt || new Date().toISOString() };
  state.lastPrint = entry;
  state.printHistory = [entry, ...(state.printHistory || [])].slice(0, 8);
  try {
    localStorage.setItem("caij:last-print", JSON.stringify(entry));
    localStorage.setItem("caij:print-history", JSON.stringify(state.printHistory));
  } catch (_) {}
  renderOperationalDashboard();
}

function renderPrintHistory() {
  const history = Array.isArray(state.printHistory) ? state.printHistory : [];
  const list = qs("printHistoryList");
  const empty = qs("printHistoryEmpty");
  if (!list || !empty) return;
  qs("printHistoryPanel").classList.toggle("is-empty", history.length === 0);
  qs("printHistoryCount").textContent = `${history.length} ${history.length === 1 ? "impressão" : "impressões"}`;
  empty.classList.toggle("hidden", history.length > 0);
  list.classList.toggle("hidden", history.length === 0);
  list.innerHTML = history.map((entry, index) => `
    <li class="print-history-item">
      <span class="print-history-order">${String(index + 1).padStart(2, "0")}</span>
      <div class="print-history-main">
        <strong>${escapeHtml(entry.modelo || "Equipamento não informado")}</strong>
        <span>${escapeHtml(entry.serial || "Serial não informado")}</span>
      </div>
      <div class="print-history-tags">
        <span class="history-os">${escapeHtml(entry.os === "Sem OS" ? "Sem rastreador" : (entry.os || "Sem rastreador"))}</span>
        <span>${escapeHtml(entry.grade ? `Grade ${entry.grade}` : "Grade não informada")}</span>
        <span>${escapeHtml(entry.tipo || "Equipamento")}</span>
      </div>
      <time>${escapeHtml(entry.horario || "Horário não informado")}</time>
    </li>
  `).join("");
}

function hasUsefulValue(value) {
  const text = String(value || "").trim();
  return Boolean(text && !/^(?:N\/?A|NA|NÃO IDENTIFICAD[AO]|NAO IDENTIFICAD[AO])$/i.test(text));
}

function hasSerialDivergence() {
  if (!state.osDetail) return false;
  return window.CAIJ_SERIAL_OS.shouldFlagSerialDivergence(
    state.info.serial, state.osDetail.serial, state.manualOsSet,
    state.osCreatedInSession, state.serialOsLookup.status,
  );
}

function setWorkflowStep(id, statusId, text, stateClass) {
  const step = qs(id);
  if (!step) return;
  const previousState = step.dataset.workflowState || "";
  const nextState = stateClass || "";
  step.classList.remove("complete", "warning", "failed");
  if (stateClass) step.classList.add(stateClass);
  step.dataset.workflowState = nextState;
  if (previousState && previousState !== nextState && nextState === "complete") {
    step.classList.remove("just-completed");
    void step.offsetWidth;
    step.classList.add("just-completed");
  } else if (nextState !== "complete") step.classList.remove("just-completed");
  qs(statusId).textContent = text;
}

function renderOperationalDashboard() {
  if (!qs("workflowOverall")) return;
  const infoCount = fields.filter((key) => hasUsefulValue(state.info[key])).length;
  const testValues = Object.values(state.tests);
  const testsDone = testValues.filter((value) => value !== "pending").length;
  const testsFailed = testValues.filter((value) => value === "failed").length;
  const osNumber = osNumberFromInput();
  const osLabel = osNumber ? `C${String(osNumber).padStart(6, "0")}` : "Não selecionada";
  const createCurrentOs = qs("createCurrentOs");
  if (createCurrentOs && document.activeElement !== createCurrentOs) createCurrentOs.value = osLabel;
  const osVerified = Boolean(state.osDetail && state.osDetail.online && !hasSerialDivergence());
  const osReady = isWindowsPreview ? osVerified : state.osCreatedInSession;
  const obsRequired = state.grade === "B" || state.grade === "C";
  const labelReady = hasUsefulValue(state.info.modelo) && hasUsefulValue(state.info.serial) &&
    (!obsRequired || qs("obs").value.trim()) &&
    window.CAIJ_OBSERVATION.fitsLabel(observationText("labelServiceChecklist", "obs", true));
  const readComplete = infoCount === fields.length;
  const testsComplete = testsDone === testValues.length && testsFailed === 0;

  qs("equipmentSummaryText").textContent = `${infoCount} de ${fields.length} informações identificadas`;
  qs("homeTestProgress").textContent = `${testsDone} de ${testValues.length} realizados`;
  document.querySelectorAll("[data-home-test]").forEach((row) => {
    const result = state.tests[row.dataset.homeTest] || "pending";
    row.dataset.result = result;
    row.querySelector("strong").textContent = result === "passed" ? "Aprovado" : result === "failed" ? "Reprovado" : "Pendente";
    if (row.dataset.homeTest === "trackpad") row.querySelector("span").textContent = isWindowsPreview ? "Mouse / Touchpad" : "Trackpad";
  });
  setWorkflowStep("workflowRead", "workflowReadStatus", `${infoCount} de ${fields.length} identificadas`, readComplete ? "complete" : "warning");
  setWorkflowStep("workflowTests", "workflowTestsStatus", testsFailed ? `${testsFailed} com falha` : `${testsDone} de ${testValues.length} realizados`, testsFailed ? "failed" : testsComplete ? "complete" : "warning");
  setWorkflowStep("workflowOs", "workflowOsStatus", osReady ? `${osLabel} conferida` : osLabel, osReady ? "complete" : "warning");
  setWorkflowStep("workflowLabel", "workflowLabelStatus", labelReady ? "Pronta para revisar" : "Informações pendentes", labelReady ? "complete" : "warning");

  const completed = [readComplete, testsComplete, osReady, labelReady].filter(Boolean).length;
  const pendingSteps = 4 - completed;
  qs("workflowOverall").textContent = `${completed} de 4 etapas`;
  qs("workflowOverall").title = pendingSteps ? `${pendingSteps} ${pendingSteps === 1 ? "etapa pendente" : "etapas pendentes"}` : "Fluxo pronto para finalizar";

  let next = { action: "labels", title: "Preparar etiqueta", description: "Confira a prévia antes de imprimir.", button: "Abrir etiquetas" };
  if (!readComplete) next = { action: "edit", title: "Completar informações", description: `${fields.length - infoCount} campos ainda precisam de revisão.`, button: "Revisar dados" };
  else if (!testsComplete) next = { action: "tests", title: testsFailed ? "Revisar testes" : "Executar testes", description: testsFailed ? "Há teste marcado com falha." : `${testValues.length - testsDone} testes ainda estão pendentes.`, button: "Abrir testes" };
  else if (!osReady) next = { action: "create-os", title: "Cadastrar rastreador", description: `${osLabel} ainda precisa ser conferido no AlterTag.`, button: "Cadastrar rastreador" };
  qs("nextActionTitle").textContent = next.title;
  qs("nextActionDescription").textContent = next.description;
  qs("nextActionButton").textContent = next.button;
  qs("nextActionButton").dataset.workflowAction = next.action;

  const alerts = [];
  const serialDivergent = hasSerialDivergence();
  if (!state.environment.internetOnline) alerts.push("Notebook sem conexão com a internet.");
  if (!state.environment.serverOnline) alerts.push("Servidor CAIJ indisponível.");
  if (serialDivergent) alerts.push(`Equipamento: ${state.info.serial || "não informado"} • Rastreador: ${state.osDetail.serial || "não informado"}`);
  if (testsFailed) alerts.push(`${testsFailed} teste${testsFailed > 1 ? "s" : ""} marcado${testsFailed > 1 ? "s" : ""} com falha.`);
  if (state.operationalError) alerts.push(state.operationalError);
  const uniqueAlerts = [...new Set(alerts)];
  qs("operationalAlerts").classList.toggle("hidden", uniqueAlerts.length === 0);
  qs("operationalAlertTitle").textContent = serialDivergent ? "Serial divergente" : "Revisão necessária";
  qs("reviewSerialDivergence").classList.toggle("hidden", !serialDivergent);
  qs("operationalAlertsList").innerHTML = uniqueAlerts.map((alert) => `<li>${escapeHtml(alert)}</li>`).join("");

  const last = state.lastPrint;
  qs("lastPrintValue").textContent = last ? (last.os === "Sem OS" ? "Sem rastreador" : (last.os || "Sem rastreador")) : "Nenhuma nesta sessão";
  qs("lastPrintMeta").textContent = last ? `${last.modelo || "Equipamento"} • ${last.horario || ""}` : "A impressão mais recente aparecerá aqui.";
  qs("reprintLast").classList.toggle("hidden", !last);
  renderPrintHistory();
}

function runWorkflowAction(action) {
  if (action === "edit") {
    showAppView("home");
    qs("deviceRead").classList.add("hidden");
    qs("deviceRead").parentElement.classList.add("hidden");
    qs("editForm").classList.remove("hidden");
    qs("editForm").querySelector("input")?.focus();
    return;
  }
  if (action === "tests") return qs("openTests").click();
  if (action === "create-os") return qs("openCreateOs").click();
  if (action === "labels") return qs("openLabels").click();
}

function gradeValue() {
  if (state.grade === "T") return "T - TRIAGEM";
  return state.grade;
}

function checkedServices(containerId) {
  return [...qs(containerId).querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function currentTestsStatus() {
  const values = Object.values(state.tests);
  if (values.includes("failed")) return "FALHOU";
  return values.includes("pending") ? "" : "OK";
}

function observationText(containerId, noteId, label = false) {
  return window.CAIJ_OBSERVATION.build({
    ids: checkedServices(containerId),
    note: qs(noteId).value,
    testsStatus: currentTestsStatus(),
    label,
  });
}

function renderObservationPreviews() {
  const labelText = observationText("labelServiceChecklist", "obs", true);
  const labelOutput = qs("labelObservationPreview");
  labelOutput.textContent = labelText || "Nenhum serviço ou observação informado.";
  qs("thermalObservation").classList.toggle("hidden", !labelText);
  qs("labelPreviewObservation").textContent = labelText;
  const fits = window.CAIJ_OBSERVATION.fitsLabel(labelText);
  labelOutput.parentElement.classList.toggle("is-over-limit", !fits);
  qs("labelObservationLimit").textContent = fits
    ? `${labelText.length}/180 caracteres; até 3 linhas na etiqueta.`
    : "Texto longo demais para a etiqueta. Resuma as observações antes de imprimir.";

  const fullText = observationText("createServiceChecklist", "createObservation");
  const technician = state.createOs.technician === "Outro"
    ? qs("otherTechnician").value.trim()
    : state.createOs.technician;
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  qs("createObservationPreview").textContent = fullText
    ? `${date} - ${time} - ${technician || "Técnico"}: ${fullText}`
    : "Selecione os serviços ou escreva uma observação.";
}

function normalizeStorage(value) {
  return window.CAIJ_STORAGE?.normalize(value) || String(value || "").trim() || "N/A";
}

function compactCpu(value) {
  const text = String(value || "").trim().toUpperCase();
  const model = window.CAIJ_SERIAL_OS.intelCpuModel(text);
  if (model) return model;
  const intel = text.match(/\bI([3579])[-\s]?(\d{4,5})[A-Z0-9]*\b/);
  if (intel) {
    const model = intel[2];
    const firstTwo = Number(model.slice(0, 2));
    const generation = model.length >= 5 || (firstTwo >= 10 && firstTwo <= 14) ? firstTwo : Number(model[0]);
    return `I${intel[1]} ${generation}TH`;
  }
  const ryzen = text.match(/\bRYZEN\s+([3579])\s+(\d{4})/);
  if (ryzen) return `RYZEN ${ryzen[1]} ${ryzen[2]}`;
  return text.replace(/\b(INTEL|AMD|CORE|PROCESSOR|CPU)\b/g, "").replace(/\s+/g, " ").trim();
}

function compactRam(value) {
  const text = String(value || "").trim();
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
  if (!match) return text.toUpperCase();
  const type = text.match(/\b(LPDDR[345]|DDR[345])\b/i);
  return `${match[1]}GB ${type ? type[1].toUpperCase() : "RAM"}`;
}

function compactGpu(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\bNVIDIA\b|\bGEFORCE\b|\bLAPTOP GPU\b|\bGRAPHICS\b|\s*\((?:DEDICADA|INTEGRADA)\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function currentConfigSummary() {
  const selectedType = state.createOs.product ? inferEquipmentType(state.createOs.product) : "";
  if (selectedType === "Monitor") return "Monitor selecionado. As configurações deste computador não serão incluídas no rastreador.";
  if (selectedType === "Celular" && !state.device3u && state.equipmentType !== "Celular") return "Celular ou tablet selecionado. Importe os dados do aparelho; as configurações deste computador não serão incluídas.";
  if (state.awaitingDeviceImport) return "Aguardando a leitura do novo aparelho conectado.";
  if (state.device3u) {
    const data = state.device3u;
    return [
      data.imei ? `IMEI: ${data.imei}` : "",
      data.armazenamento ? `ARMAZ: ${data.armazenamento}` : "",
      data.ram ? `RAM: ${data.ram}` : "",
      data.bateria ? `BATERIA: ${data.bateria}` : "",
      Number(data.ciclos) > 0 ? `CICLOS: ${data.ciclos}` : "",
    ].filter(Boolean).join(" | ");
  }
  const items = [
    compactCpu(state.info.cpu),
    normalizeStorage(state.info.disco),
    compactRam(state.info.ram),
    compactGpu(state.info.gpu),
  ].filter((item) => item && !/^(N\/?A|NA)$/.test(item));
  return items.length ? `CONFIG: ${items.join(" | ")}` : "CONFIG: dados ainda não identificados.";
}

function renderCurrentConfig() {
  if (!isWindowsPreview) return;
  qs("currentConfigValue").textContent = currentConfigSummary();
  qs("configCpu").value = state.info.cpu || "";
  qs("configDisk").value = normalizeStorage(state.info.disco);
  qs("configRam").value = state.info.ram || "";
  qs("configGpu").value = state.info.gpu || "";
}

function normalizeSerial(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function renderOsVerification(detail = state.osDetail) {
  if (!isWindowsPreview) return renderOperationalDashboard();
  const panel = qs("osVerification");
  panel.classList.remove("loading", "synced", "divergent");
  if (!detail) {
    qs("verifyOs").textContent = "—";
    qs("verifyProduct").textContent = "Aguardando rastreador";
    qs("verifyTechnician").textContent = "—";
    qs("verifySerial").textContent = "—";
    qs("osVerificationStatus").textContent = "Aguardando consulta";
    renderOperationalDashboard();
    return;
  }
  const divergent = hasSerialDivergence();
  qs("verifyOs").textContent = detail.osCodigo || "—";
  qs("verifyProduct").textContent = detail.produto || "Produto não informado";
  qs("verifyTechnician").textContent = detail.tecnico || "—";
  qs("verifySerial").textContent = detail.serial || "—";
  qs("osVerificationStatus").textContent = divergent ? "Serial divergente" : detail.online ? "Rastreador conferido" : (detail.message || "Não localizado");
  if (divergent) panel.classList.add("divergent");
  else if (detail.online) panel.classList.add("synced");
  renderOperationalDashboard();
}

async function refreshOsVerification(explicitOsNumber = 0) {
  if (!isWindowsPreview) return;
  const osNumero = Number(explicitOsNumber || osNumberFromInput());
  const requestId = ++osVerificationRequest;
  if (!osNumero) {
    state.osDetail = null;
    return renderOsVerification(null);
  }
  const panel = qs("osVerification");
  panel.classList.add("loading");
  qs("osVerificationStatus").textContent = "Consultando Altertag...";
  try {
    const data = await api("/api/os-detail", { osNumero });
    if (requestId !== osVerificationRequest || osNumero !== osNumberFromInput()) return;
    state.osDetail = data.detail || null;
    renderOsVerification();
  } catch (error) {
    if (requestId !== osVerificationRequest || osNumero !== osNumberFromInput()) return;
    state.osDetail = { osCodigo: `C${String(osNumero).padStart(6, "0")}`, message: error.message };
    renderOsVerification();
  }
}

function scheduleOsIdentification(event) {
  window.clearTimeout(osInputTimer);
  ++serialOsLookupRequest;
  state.manualOsSet = true;
  state.serialOsLookup.status = "idle";
  renderSerialOsLookup();
  const sourceInput = event?.currentTarget || qs("osInput");
  const sourceDigits = String(sourceInput.value || "").replace(/\D/g, "");
  const input = qs("osInput");
  if (sourceInput !== input) input.value = sourceDigits ? `C${sourceDigits}` : "";
  const createCurrentOs = qs("createCurrentOs");
  if (createCurrentOs && sourceInput !== createCurrentOs && document.activeElement !== createCurrentOs) {
    createCurrentOs.value = sourceDigits ? `C${sourceDigits}` : "";
  }
  const osNumero = osNumberFromInput();
  ++osVerificationRequest;
  state.osDetail = null;
  renderOperationalDashboard();
  if (!osNumero) {
    renderOsVerification(null);
    return setStatus("Digite um número de rastreador válido.", "warn");
  }
  if (isWindowsPreview) {
    qs("osVerification").classList.add("loading");
    qs("osVerificationStatus").textContent = "Identificando rastreador...";
  }
  setStatus("Identificando rastreador digitado...", "busy");
  osInputTimer = window.setTimeout(async () => {
    const expectedOs = osNumberFromInput();
    if (!expectedOs || expectedOs !== osNumero) return;
    try {
      await persistEditedOs(expectedOs);
      if (osNumberFromInput() !== expectedOs) return;
      const formattedOs = `C${String(expectedOs).padStart(6, "0")}`;
      input.value = formattedOs;
      if (createCurrentOs) createCurrentOs.value = formattedOs;
      await refreshOsVerification(expectedOs);
      renderPreview();
      setStatus(`Rastreador C${String(expectedOs).padStart(6, "0")} identificado.`, "ok");
    } catch (error) {
      if (osNumberFromInput() !== expectedOs) return;
      setStatus(error.message, "warn");
    }
  }, 550);
}

function renderDevice() {
  const read = qs("deviceRead");
  const ramDetailLines = String(state.info.ramDetalhes || "").split(/\s*·\s*/).filter(Boolean);
  const model = String(state.info.modelo || "").trim();
  const notebookModel = /\b(notebook|laptop|macbook|thinkpad|latitude|elitebook|probook|ideapad|yoga|aspire|vivobook|zenbook|pavilion|surface)\b/i.test(model);
  const differentDevice = /\b(desktop|monitor|iphone|ipad|tablet|all.in.one|optiplex|prodesk|elitedesk)\b/i.test(model);
  const showNotebookPhoto = state.equipmentType === "Notebook" && !differentDevice && (notebookModel || hasUsefulValue(state.info.bateria));
  qs("deviceModelHeading").textContent = model || (state.deviceReading === "pending" ? "Lendo equipamento..." : "Equipamento não identificado");
  qs("devicePhoto").classList.toggle("hidden", !showNotebookPhoto);
  if (showNotebookPhoto) {
    const photo = qs("devicePhotoImage");
    const vendor = /\b(macbook|apple|macintosh)\b/i.test(model) ? "Mac"
      : /\b(dell|latitude|inspiron|vostro|precision|xps)\b/i.test(model) ? "Dell"
      : /\b(hp|hewlett[\s-]*packard|elitebook|probook|zbook|pavilion)\b/i.test(model) ? "HP"
      : /\b(lenovo|thinkpad|ideapad|yoga|legion)\b/i.test(model) ? "Lenovo"
      : "Notebook";
    const images = {
      Mac: "notebook-mac.png",
      Dell: "notebook-dell.png",
      HP: "notebook-hp.png",
      Lenovo: "notebook-illustrative.png",
      Notebook: "notebook-dell.png",
    };
    const imageUrl = images[vendor];
    if (photo.getAttribute("src") !== imageUrl) photo.setAttribute("src", imageUrl);
    photo.alt = `${vendor} ilustrativo aberto`;
  }
  read.parentElement.classList.toggle("has-photo", showNotebookPhoto);
  if (isWindowsPreview) {
    const windowsFields = ["modelo", "serial", "cpu", "disco", "gpu", "ram", "bateria"];
    const spanTwo = new Set(["modelo", "cpu", "gpu"]);
    read.className = "device-specs-wrap";
    read.innerHTML = `
      <div class="device-specs">
        ${windowsFields.map((key, index) => `
          <article class="device-spec spec-${key} ${spanTwo.has(key) ? "wide" : ""} ${key === "bateria" ? "full" : ""}" style="animation-delay:${index * 28}ms">
            <span>${labels[key]}</span>
            <div class="device-spec-value"><strong>${escapeHtml(state.info[key] || "N/A")}</strong>${key === "ram" && ramDetailLines.length ? `<small class="ram-details">${ramDetailLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</small>` : ""}</div>
          </article>
        `).join("")}
      </div>
    `;
  } else {
    read.className = "device-table-wrap";
  read.innerHTML = `
    <table class="device-table">
      <thead>
        <tr><th>Informacao</th><th>Valor detectado</th></tr>
      </thead>
      <tbody>
        ${fields.map((key, index) => `
          <tr style="animation-delay:${index * 28}ms">
            <th scope="row">${labels[key]}</th>
            <td>${escapeHtml(state.info[key] || "N/A")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  }

  const form = qs("editForm");
  fields.forEach((key) => {
    const input = form.elements[key];
    if (input) input.value = state.info[key] || "";
  });
  if (form.elements.ramDetalhes) form.elements.ramDetalhes.value = state.info.ramDetalhes || "";
  renderPreview();
}

function renderPreview() {
  qs("labelPreviewModel").textContent = state.info.modelo || defaultModelName;
  qs("labelPreviewSerial").textContent = state.info.serial || "N/A";
  qs("labelPreviewCpu").textContent = compactCpu(state.info.cpu) || "N/A";
  qs("labelPreviewRam").textContent = compactRam(state.info.ram) || "N/A";
  qs("labelPreviewDisk").textContent = normalizeStorage(state.info.disco) || "N/A";
  qs("labelPreviewGpu").textContent = compactGpu(state.info.gpu) || "N/A";
  qs("labelPreviewBattery").textContent = state.info.bateria || "N/A";
  const previewRows = [...document.querySelectorAll(".thermal-config-list dl > div")];
  const previewTitle = document.querySelector(".thermal-section-title");
  const type = ["Notebook", "Desktop", "Celular", "Monitor"].includes(state.equipmentType) ? state.equipmentType : "Notebook";
  const valuesByType = {
    Notebook: [["CPU", compactCpu(state.info.cpu) || "N/A"], ["RAM", compactRam(state.info.ram) || "N/A"], ["DISCO", normalizeStorage(state.info.disco) || "N/A"], ["GPU", compactGpu(state.info.gpu) || "N/A"], ["BAT", state.info.bateria || "N/A"]],
    Desktop: [["CPU", compactCpu(state.info.cpu) || "N/A"], ["RAM", compactRam(state.info.ram) || "N/A"], ["DISCO", normalizeStorage(state.info.disco) || "N/A"], ["GPU", compactGpu(state.info.gpu) || "N/A"]],
    Celular: [["IMEI", state.info.imei || state.device3u?.imei || "N/A"], ["ARMAZ.", normalizeStorage(state.info.disco) || "N/A"], ["RAM", compactRam(state.info.ram) || "N/A"], ["BATERIA", batteryWithoutCycles(state.info.bateria) || "N/A"], ["CICLOS", state.info.ciclos || state.device3u?.ciclos || "N/A"]],
    Monitor: [["POLEGADAS", state.info.monitorTamanho || monitorSizeFromDescription(state.info.modelo) || "N/A"], ["ENTRADAS", state.info.monitorEntradas || "N/A"]],
  };
  const values = valuesByType[type];
  if (previewTitle) previewTitle.textContent = type === "Notebook" ? "CONFIGURACAO" : type.toUpperCase();
  previewRows.forEach((row, index) => {
    row.classList.toggle("hidden", index >= values.length);
    if (values[index]) {
      row.querySelector("dt").textContent = values[index][0];
      row.querySelector("dd").textContent = values[index][1];
    }
  });
  qs("labelEquipmentType").value = type;
  if (qs("labelPageType")) qs("labelPageType").textContent = type;
  document.querySelectorAll(".label-data-field, .label-type-action").forEach((field) => {
    const allowed = String(field.dataset.labelTypes || "").split(/\s+/);
    field.classList.toggle("hidden", !allowed.includes(type));
  });
  qs("labelPreviewGrade").textContent = `GRADE ${gradeValue()}`;
  const formattedOs = `C${String(osNumberFromInput() || 235).padStart(6, "0")}`;
  if (qs("previewMetaGrade")) qs("previewMetaGrade").textContent = `Grade ${gradeValue()}`;
  if (qs("previewMetaOs")) qs("previewMetaOs").textContent = qs("includeOs").checked ? `Rastreador ${formattedOs}` : "Rastreador não incluído";
  qs("labelPreviewOs").textContent = qs("includeOs").checked ? formattedOs : "NÃO INCLUÍDO";
  qs("labelPreviewDate").textContent = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function syncPrintOsInput() {
  const input = qs("printOsInput");
  if (document.activeElement !== input) input.value = qs("osInput").value;
}

function populateLabelEditor() {
  const form = qs("labelEditForm");
  labelFields.forEach((key) => {
    const input = form.elements.namedItem(key);
    if (input) input.value = state.info[key] || "";
  });
}

function setLabelEditorOpen(open) {
  qs("labelEditForm").classList.toggle("hidden", !open);
  qs("toggleLabelEditor").textContent = open ? "Editando dados" : "Editar dados da etiqueta";
  qs("toggleLabelEditor").classList.toggle("active", open);
  if (open) {
    populateLabelEditor();
    qs("labelEditForm").elements.namedItem("modelo")?.focus();
  }
}

function updatePrintOsAvailability() {
  const includeOs = qs("includeOs").checked;
  qs("printOsInput").disabled = !includeOs;
  qs("printOsInput").closest("label").classList.toggle("disabled", !includeOs);
  renderPreview();
}

function showAppView(view) {
  const views = {
    home: "homeView",
    labels: "labelsView",
    tests: "testsView",
    createOs: "createOsView",
  };
  state.view = views[view] ? view : "home";
  Object.entries(views).forEach(([name, id]) => {
    qs(id).classList.toggle("hidden", name !== state.view);
  });
  setNavigationAction(state.view);
  if (state.view === "labels") {
    syncPrintOsInput();
    populateLabelEditor();
    renderPreview();
  }
  if (state.view === "tests") renderTests();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setNavigationAction(action = state.view) {
  const targetId = { home: "openMenu", labels: "openLabels", tests: "openTests", createOs: "openCreateOs" }[action];
  ["openMenu", "openLabels", "openTests", "openCreateOs"].forEach((id) => {
    const active = id === targetId;
    qs(id).classList.toggle("active", active);
    setAttribute(qs(id), "aria-current", active ? "page" : "");
  });
}

function setAttribute(element, name, value) {
  if (value) element.setAttribute(name, value);
  else element.removeAttribute(name);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applyState(data) {
  state.deviceReading = data.deviceReading || 'ready';
  state.info = data.info || state.info || {};
  if (typeof state.info.bateria === "string") state.info.bateria = state.info.bateria.replaceAll("saÃºde", "saúde");
  state.equipmentType = data.equipmentType || state.equipmentType || "Notebook";
  state.manualOsSet = Boolean(data.manualOsSet);
  if (isWindowsPreview && state.info.disco) state.info.disco = normalizeStorage(state.info.disco);
  const osFormatted = data.osFormatada || `C${String(data.osNumero || 235).padStart(6, "0")}`;
  if (document.activeElement !== qs("osInput")) qs("osInput").value = osFormatted;
  syncPrintOsInput();
  if (Number(data.pendingCreatedOs || 0) === Number(data.osNumero || 0) && Number(data.osNumero || 0) > 0) {
    state.osCreatedInSession = true;
  }
  qs("serverLine").textContent = `Servidor: ${data.serverUrl || "nao configurado"} | ${data.lastServerStatus || "nao verificado"}`;
  setEnvironmentStatus(data);
  renderDevice();
  renderCurrentConfig();
  renderOperationalDashboard();
  if (qs("printBtn").getAttribute("aria-busy") !== "true") qs("printBtn").disabled = state.deviceReading !== 'ready';
  updateCreateOsState();
  renderSerialOsLookup();
  refreshKeyboardLayoutForDevice();
}

function currentLookupSerial() {
  return String(state.view === "createOs" ? qs("createSerial").value : state.info.serial || "").trim();
}

function renderSerialOsLookup() {
  const lookup = state.serialOsLookup;
  const visible = lookup.status !== "idle" && lookup.serial === currentLookupSerial();
  const title = lookup.status === "searching" ? "Procurando rastreador desta serial..."
    : lookup.status === "choose" ? "Rastreadores encontrados para esta serial"
    : lookup.status === "selected" ? "Rastreador identificado pela serial"
    : lookup.status === "none" ? "Nenhum rastreador anterior encontrado"
    : "Não foi possível consultar os rastreadores";
  const buttons = lookup.status === "choose" ? lookup.orders.map((order) =>
    `<button type="button" data-serial-os="${Number(order.numero)}"><strong>${escapeHtml(order.osCodigo || `C${String(order.numero).padStart(6, "0")}`)}</strong><span>${escapeHtml(order.statusOs || "Status não informado")} · ${escapeHtml(order.dataCadastro || "Data não informada")}</span></button>`
  ).join("") : "";
  const retry = lookup.status === "error" ? '<button type="button" data-serial-os-retry="1">Tentar novamente</button>' : "";
  ["serialOsLookupHome", "serialOsLookupCreate", "serialOsLookupLabels"].forEach((id) => {
    const panel = qs(id);
    panel.classList.toggle("hidden", !visible);
    if (visible) panel.innerHTML = `<div class="serial-os-lookup-head"><span>HISTÓRICO POR SERIAL · ${escapeHtml(lookup.serial)}</span><strong>${title}</strong><small>${escapeHtml(lookup.message || "")}</small></div><div class="serial-os-options">${buttons}${retry}</div>`;
  });
}

async function selectSerialOs(order, requestId = serialOsLookupRequest) {
  if (!order || requestId !== serialOsLookupRequest) return;
  const number = Number(order.numero);
  if (!Number.isInteger(number) || number < 1) return;
  const serial = state.serialOsLookup.serial;
  if (serial !== currentLookupSerial()) return;
  const data = await api("/api/set-os", { osNumero: number });
  if (requestId !== serialOsLookupRequest || serial !== currentLookupSerial()) return;
  if (data.state) applyState(data.state);
  state.serialOsLookup = { status: "selected", serial, orders: [order], message: `Rastreador ${order.osCodigo || `C${String(number).padStart(6, "0")}`} vinculado. Confira os dados antes de imprimir.` };
  renderSerialOsLookup();
  if (isWindowsPreview) void refreshOsVerification(number);
  renderPreview();
}

async function lookupExistingOs(force = false) {
  const serial = currentLookupSerial();
  const normalized = normalizeSerial(serial);
  if (normalized.length < 4 || ["N/A", "XXXXXX", "UNKNOWN"].includes(normalized)) return;
  if (!force && normalized === lastSerialOsLookup &&
      window.CAIJ_SERIAL_OS.canReuseSerialLookup(serial, state.serialOsLookup) &&
      (state.serialOsLookup.status !== "searching" || serialOsLookupActiveRequest === serialOsLookupRequest)) {
    return renderSerialOsLookup();
  }
  const requestId = ++serialOsLookupRequest;
  serialOsLookupActiveRequest = requestId;
  lastSerialOsLookup = normalized;
  state.serialOsLookup = { status: "searching", serial, orders: [], message: "O rastreador atual não será trocado até a consulta terminar." };
  renderSerialOsLookup();
  try {
    const result = await api("/api/os-by-serial", { serial });
    if (requestId !== serialOsLookupRequest || serial !== currentLookupSerial()) return;
    const decision = window.CAIJ_SERIAL_OS.decideSerialOs(serial, result.ordens, state.manualOsSet, state.osCreatedInSession ? osNumberFromInput() : 0, osNumberFromInput());
    if (decision.kind === "select") {
      state.serialOsLookup = { status: "searching", serial, orders: decision.orders, message: "Rastreador único encontrado. Vinculando..." };
      renderSerialOsLookup();
      await selectSerialOs(decision.orders[0], requestId);
    } else if (decision.kind === "already") {
      state.serialOsLookup = { status: "selected", serial, orders: decision.orders, message: `O rastreador ${decision.orders[0].osCodigo} já está selecionado para esta serial.` };
      renderSerialOsLookup();
    } else if (decision.kind === "choose") {
      state.serialOsLookup = { status: "choose", serial, orders: decision.orders, message: "Selecione o rastreador correto; a escolha atual não será alterada automaticamente." };
      renderSerialOsLookup();
    } else {
      state.serialOsLookup = { status: "none", serial, orders: [], message: "Nenhum rastreador anterior encontrado. Você pode cadastrar um novo rastreador para este equipamento." };
      renderSerialOsLookup();
    }
  } catch (error) {
    if (requestId !== serialOsLookupRequest || serial !== currentLookupSerial()) return;
    lastSerialOsLookup = "";
    state.serialOsLookup = { status: "error", serial, orders: [], message: error.message };
    renderSerialOsLookup();
  } finally {
    if (serialOsLookupActiveRequest === requestId) serialOsLookupActiveRequest = 0;
  }
}

function scheduleSerialOsLookup() {
  window.clearTimeout(serialOsLookupTimer);
  if (window.CAIJ_SERIAL_OS.canReuseSerialLookup(currentLookupSerial(), state.serialOsLookup) &&
      (state.serialOsLookup.status !== "searching" || serialOsLookupActiveRequest === serialOsLookupRequest)) {
    return renderSerialOsLookup();
  }
  ++serialOsLookupRequest;
  lastSerialOsLookup = "";
  state.serialOsLookup = { status: "idle", serial: "", orders: [], message: "" };
  renderSerialOsLookup();
  serialOsLookupTimer = window.setTimeout(() => { void lookupExistingOs(); }, 450);
}

function setEnvironmentStatus(data) {
  const runtime = window.CAIJ_NATIVE_RUNTIME || {};
  const internetOnline = runtime.internetStatus !== "offline" && navigator.onLine !== false;
  const serverOnline = String(data.lastServerStatus || "").toLowerCase() === "online";
  state.environment = { internetOnline, serverOnline };
  const internet = qs("internetBadge");
  const server = qs("serverBadge");
  internet.classList.toggle("online", internetOnline);
  internet.classList.toggle("offline", !internetOnline);
  internet.lastChild.textContent = internetOnline ? " Internet online" : " Sem internet";
  server.classList.toggle("online", serverOnline);
  server.classList.toggle("offline", !serverOnline);
  server.lastChild.textContent = serverOnline ? " Servidor online" : " Servidor aguardando";
  qs("versionBadge").textContent = runtime.version ? `v${runtime.version}` : "Versao local";
  renderOperationalDashboard();
}

function osNumberFromInput() {
  const digits = String(qs("osInput").value || "").replace(/\D/g, "");
  return Number(digits || 0);
}

async function persistEditedOs(explicitOsNumber = 0) {
  const osNumero = Number(explicitOsNumber || osNumberFromInput());
  if (!osNumero) throw new Error("Informe um número de rastreador válido.");
  const data = await api("/api/set-os", { osNumero });
  if (data.state) applyState(data.state);
  return osNumero;
}

function showOsAlert(data, localCreation = false) {
  qs("alertCreatedOs").textContent = data.osCriada || "Novo rastreador";
  qs("alertNextOs").textContent = data.proximaOs || qs("osInput").value;
  qs("osAlertTitle").textContent = localCreation ? "Rastreador criado com sucesso" : "Novo rastreador detectado";
  qs("alertCopySuffix").textContent = localCreation
    ? "Esta é a ordem vinculada ao atendimento e preparada para a etiqueta."
    : "Esta ordem foi criada em outra estação.";
  qs("printCreatedOs").classList.toggle("hidden", !localCreation);
  qs("dismissOsAlert").textContent = localCreation ? "Voltar ao menu" : "Entendido";
  qs("osAlert").classList.remove("hidden");
  (localCreation ? qs("printCreatedOs") : qs("dismissOsAlert")).focus();
}

function closeOsAlert() {
  qs("osAlert").classList.add("hidden");
}

function closeTestsPanel() {
  stopActiveTest();
  if (testsOnlyMode) {
    document.title = "CAIJ_TESTES_CONCLUIDOS";
    qs("closeTests").textContent = "Retornando...";
    qs("closeTests").disabled = true;
    return;
  }
  showAppView("home");
}

function testsOverall() {
  const values = Object.values(state.tests);
  return values.includes("failed") ? "FALHOU" : values.includes("pending") ? "PENDENTE" : "OK";
}

function testsReport() {
  const overall = testsOverall();
  const statusLabel = { passed: "OK", failed: "FALHOU", pending: "PENDENTE" };
  const details = Object.entries(state.tests)
    .map(([key, value]) => `${testLabels[key]}: ${statusLabel[value]}`)
    .join(" | ");
  return `TESTES: ${overall} | ${details}`;
}

function testsLabelSummary() {
  return `TESTES: ${testsOverall()}`;
}

function syncCompletedTestsToRecord(pending) {
  const failed = Object.values(state.tests).includes("failed");
  document.querySelectorAll('#labelServiceChecklist input[value="tests"], #createServiceChecklist input[value="tests"]').forEach((input) => {
    if (failed) input.checked = false;
    input.disabled = failed;
    input.title = failed ? "Há um teste reprovado; corrija o resultado antes de marcar aprovado." : "";
  });
  if (pending > 0) {
    qs("finishTests").classList.add("hidden");
    qs("testsActionStatus").textContent = "";
    renderObservationPreviews();
    return;
  }
  const report = testsLabelSummary();
  try { localStorage.setItem("caij:mac-tests-observation", report); } catch (_) {}
  qs("finishTests").classList.remove("hidden");
  qs("testsActionStatus").textContent = "Resultado incluído automaticamente no registro.";
  renderObservationPreviews();
}

function renderTests() {
  const values = Object.values(state.tests);
  const passed = values.filter((value) => value === "passed").length;
  const failed = values.filter((value) => value === "failed").length;
  const pending = values.length - passed - failed;
  const completion = Math.round(((passed + failed) / values.length) * 100);
  qs("testsPassed").textContent = passed;
  qs("testsFailed").textContent = failed;
  qs("testsPending").textContent = pending;
  qs("testsCompletion").textContent = `${passed + failed} de ${values.length} concluídos`;
  qs("testsProgress").style.width = `${completion}%`;
  qs("testsReport").textContent = testsReport();
  qs("testList").querySelectorAll(".test-row").forEach((row) => {
    const status = state.tests[row.dataset.test];
    const previousStatus = row.dataset.renderedStatus || "";
    row.classList.remove("passed", "failed");
    if (status !== "pending") row.classList.add(status);
    row.dataset.renderedStatus = status;
    if (previousStatus && previousStatus !== status) {
      row.classList.remove("status-changed");
      void row.offsetWidth;
      row.classList.add("status-changed");
    }
    row.querySelector(".test-state").textContent = status === "passed" ? "Passou" : status === "failed" ? "Falhou" : "Pendente";
    row.querySelectorAll("button[data-action]").forEach((button) => {
      const selected = (button.dataset.action === "pass" && status === "passed") || (button.dataset.action === "fail" && status === "failed");
      button.classList.toggle("selected", selected);
      if (button.dataset.action === "pass" || button.dataset.action === "fail") button.setAttribute("aria-pressed", String(selected));
    });
  });
  syncCompletedTestsToRecord(pending);
  renderOperationalDashboard();
}

function stopActiveTest() {
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }
  if (state.audioFrame) cancelAnimationFrame(state.audioFrame);
  state.audioFrame = 0;
  if (state.audioContext) state.audioContext.close().catch(() => {});
  state.audioContext = null;
  if (state.toneContext) state.toneContext.close().catch(() => {});
  state.toneContext = null;
  if (state.keyboardHandler) {
    document.removeEventListener("keydown", state.keyboardHandler, true);
    document.removeEventListener("keyup", state.keyboardHandler, true);
  }
  state.keyboardHandler = null;
  state.keyboardPressed = null;
  state.keyboardLayoutE14 = null;
  state.mouseButtonCleanup?.();
  state.mouseButtonCleanup = null;
  state.activeTest = "";
  qs("testWorkspace").classList.add("hidden");
  qs("activeTestBody").innerHTML = "";
}

function renderActiveTestNavigation() {
  const currentIndex = testSequence.indexOf(state.activeTest);
  if (currentIndex < 0) return;
  const nextTest = testSequence[currentIndex + 1];
  const isLastTest = !nextTest;
  qs("activeTestStep").textContent = `TESTE ${currentIndex + 1} DE ${testSequence.length}`;
  qs("activeTestNextLabel").textContent = isLastTest
    ? "Último teste da sequência"
    : `Próximo: ${testLabels[nextTest]}`;
  qs("passAndNextTest").textContent = isLastTest ? "Aprovado e finalizar" : "Aprovado e próximo";
  qs("failAndNextTest").textContent = isLastTest ? "Reprovado e finalizar" : "Reprovado e próximo";
}

async function completeActiveTest(result) {
  const currentTest = state.activeTest;
  const currentIndex = testSequence.indexOf(currentTest);
  if (currentIndex < 0) return;
  if (result === "passed" || result === "failed") state.tests[currentTest] = result;
  const nextTest = testSequence[currentIndex + 1];
  renderTests();
  closeScreenTest();
  if (nextTest) {
    await openTest(nextTest);
    return;
  }
  stopActiveTest();
  const footer = document.querySelector(".tests-footer");
  if (footer) footer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function requestUserMedia(constraints) {
  if (!window.isSecureContext) {
    return Promise.reject(new Error("A câmera e o microfone exigem que o InfoNotebook seja aberto pela interface local segura."));
  }
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia;
  if (legacy) {
    return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
  }
  return Promise.reject(new Error("Camera e microfone precisam ser abertos pelo teste local seguro do InfoNotebook."));
}

async function requestUserMediaWithStartupRetry(constraints) {
  const attempts = isWindowsPreview ? 3 : 1;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function openTestsPage() {
  if (window.isSecureContext || isWindowsPreview) {
    showAppView("tests");
    return;
  }

  // Safari blocks camera and microphone on the hosted HTTP address. When the
  // Mac launcher is present, ask it to open the same tests from 127.0.0.1,
  // which is a trusted local origin and can request the media permissions.
  if (nativeRuntime.sessionId) {
    try {
      setStatus("Abrindo os testes pela interface local segura...", "ok");
      await api("/api/native-command", { command: "open-tests" });
      return;
    } catch (err) {
      setStatus(err.message || "Não foi possível abrir os testes locais.", "error");
      return;
    }
  }

  setStatus("Abra o InfoNotebookMac.command para usar câmera e microfone no Safari.", "error");
}

function testError(message) {
  const permissionHelp = isWindowsPreview
    ? "Confira em Configurações do Windows > Privacidade e segurança > Câmera ou Microfone."
    : "Confira a permissão em Ajustes do Sistema > Privacidade e Segurança.";
  qs("activeTestBody").innerHTML = `<div class="test-permission-error"><strong>Não foi possível iniciar.</strong><span>${escapeHtml(message)}</span><small>${escapeHtml(permissionHelp)}</small></div>`;
}

function confirmCameraTestPermission() {
  const dialog = qs("cameraPermissionDialog");
  const confirmButton = qs("confirmCameraPermission");
  const cancelButton = qs("cancelCameraPermission");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (approved) => {
      if (settled) return;
      settled = true;
      confirmButton.removeEventListener("click", approve);
      cancelButton.removeEventListener("click", decline);
      dialog.removeEventListener("cancel", cancelDialog);
      if (dialog.open) dialog.close();
      resolve(approved);
    };
    const approve = () => finish(true);
    const decline = () => finish(false);
    const cancelDialog = (event) => {
      event.preventDefault();
      finish(false);
    };

    confirmButton.addEventListener("click", approve, { once: true });
    cancelButton.addEventListener("click", decline, { once: true });
    dialog.addEventListener("cancel", cancelDialog, { once: true });
    try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); }
  });
}

async function openCameraTest() {
  qs("activeTestBody").innerHTML = '<div class="camera-permission-idle"><span aria-hidden="true">●</span><div><strong>Aguardando sua autorização</strong><small>A câmera ainda não foi ativada.</small></div></div>';
  const approved = await confirmCameraTestPermission();
  if (!approved) {
    qs("activeTestBody").innerHTML = '<div class="camera-permission-idle"><span aria-hidden="true">○</span><div><strong>Câmera não iniciada</strong><small>Clique novamente em Abrir teste quando desejar continuar.</small></div></div>';
    return;
  }
  qs("activeTestBody").innerHTML = '<div class="camera-stage"><video id="cameraPreview" autoplay muted playsinline></video><span>Imagem ao vivo</span></div>';
  try {
    state.mediaStream = await requestUserMediaWithStartupRetry({ video: true, audio: false });
    qs("cameraPreview").srcObject = state.mediaStream;
  } catch (err) {
    testError(err.message || "Camera indisponivel.");
  }
}

function normalizeKeyboardEvent(event) {
  const physicalKeys = {
    Escape: "ESC",
    Quote: "'",
    Slash: "/",
    IntlRo: isWindowsPreview && /\bE14\b/i.test(state.info?.modelo || "") ? "INTLRO" : "/",
    NumpadDivide: "/",
    Semicolon: ";",
    Comma: ",",
    Period: ".",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backquote: "BACKQUOTE",
    Backslash: "BACKSLASH",
    IntlBackslash: "BACKSLASH",
    Backspace: "BACKSPACE",
    Tab: "TAB",
    Enter: "ENTER",
    CapsLock: "CAPSLOCK",
    ShiftLeft: "SHIFT",
    ShiftRight: "SHIFT",
    ControlLeft: "CONTROL",
    ControlRight: "CONTROL",
    AltLeft: "ALT",
    AltRight: "ALT",
    MetaLeft: isWindowsPreview ? "WINDOWS" : "META",
    MetaRight: isWindowsPreview ? "WINDOWS" : "META",
    ContextMenu: "MENU",
    PrintScreen: "PRINTSCREEN",
    ScrollLock: "SCROLLLOCK",
    Pause: "PAUSE",
    Insert: "INSERT",
    Delete: "DELETE",
    Home: "HOME",
    End: "END",
    PageUp: "PAGEUP",
    PageDown: "PAGEDOWN",
    Space: "SPACE",
    Numpad0: "NUM0",
    Numpad1: "NUM1",
    Numpad2: "NUM2",
    Numpad3: "NUM3",
    Numpad4: "NUM4",
    Numpad5: "NUM5",
    Numpad6: "NUM6",
    Numpad7: "NUM7",
    Numpad8: "NUM8",
    Numpad9: "NUM9",
    NumpadAdd: "NUMADD",
    NumpadSubtract: "NUMSUBTRACT",
    NumpadMultiply: "NUMMULTIPLY",
    NumpadDivide: "NUMDIVIDE",
    NumpadDecimal: "NUMDECIMAL",
    NumpadEnter: "NUMENTER",
    NumLock: "NUMLOCK",
  };
  if (isWindowsPreview) {
    const sidedKeys = {
      ShiftLeft: "SHIFTLEFT", ShiftRight: "SHIFTRIGHT",
      ControlLeft: "CONTROLLEFT", ControlRight: "CONTROLRIGHT",
      AltLeft: "ALTLEFT", AltRight: "ALTRIGHT",
      MetaLeft: "WINDOWSLEFT", MetaRight: "WINDOWSRIGHT",
    };
    if (sidedKeys[event.code]) return sidedKeys[event.code];
  }
  if (/^F(?:[1-9]|1[0-2])$/.test(event.code)) return event.code;
  if (physicalKeys[event.code]) return physicalKeys[event.code];
  const aliases = { " ": "SPACE", ESCAPE: "ESC", CMD: "META", OS: "META", DEAD: "'" };
  return aliases[String(event.key || "").toUpperCase()] || String(event.key || "").toUpperCase();
}

function listenForMouseButtons(target, onButton, allowedButtons = [0, 1, 2]) {
  let lastButton = -1;
  let lastTime = 0;
  const record = (event, button) => {
    if (!allowedButtons.includes(button)) return;
    event.preventDefault();
    const now = Date.now();
    if (lastButton === button && now - lastTime < 250) return;
    lastButton = button;
    lastTime = now;
    onButton(button, event);
  };
  const handlers = [
    ["pointerdown", (event) => record(event, event.button)],
    ["mousedown", (event) => record(event, event.button)],
    ["click", (event) => record(event, 0)],
    ["auxclick", (event) => record(event, event.button)],
    ["contextmenu", (event) => record(event, 2)],
  ];
  handlers.forEach(([name, handler]) => target.addEventListener(name, handler));
  return () => handlers.forEach(([name, handler]) => target.removeEventListener(name, handler));
}

function openKeyboardTest() {
  const isE14Keyboard = isWindowsPreview && /\bE14\b/i.test(state.info?.modelo || "");
  state.mouseButtonCleanup?.();
  state.mouseButtonCleanup = null;
  if (state.keyboardHandler) {
    document.removeEventListener("keydown", state.keyboardHandler, true);
    document.removeEventListener("keyup", state.keyboardHandler, true);
  }
  const pressed = state.keyboardPressed || new Set();
  state.keyboardPressed = pressed;
  state.keyboardLayoutE14 = isE14Keyboard;
  const macKeyboardRows = [
    ["ESC","F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12"],
    ["BACKQUOTE","1","2","3","4","5","6","7","8","9","0","-","=","BACKSPACE"],
    ["TAB","Q","W","E","R","T","Y","U","I","O","P","[","]","BACKSLASH"],
    ["CAPSLOCK","A","S","D","F","G","H","J","K","L",";","'","ENTER"],
    ["SHIFT","Z","X","C","V","B","N","M",",",".","/","CONTROL","ALT","META","SPACE","ARROWLEFT","ARROWUP","ARROWDOWN","ARROWRIGHT"],
  ];
  const keyNames = {
    SPACE: "ESPAÇO", WINDOWSLEFT: "WIN", WINDOWSRIGHT: "WIN", PRINTSCREEN: "Prt<br>Sc", SCROLLLOCK: "Scr<br>Lk", PAUSE: "Pause<br>break", HOME: "Home", END: "End",
    PAGEUP: "Page<br>up", PAGEDOWN: "Page<br>down", INSERT: "ins", DELETE: "del", META: "COMMAND", BACKQUOTE: isWindowsPreview ? "~<br>`" : "`", BACKSLASH: isWindowsPreview ? "|<br>\\" : "\\",
    BACKSPACE: isWindowsPreview ? "←" : "BACKSPACE", CAPSLOCK: isWindowsPreview ? "Caps Lock" : "CAPSLOCK", MENU: '<svg viewBox="0 0 40 40" width="36" height="36" aria-label="Menu"><path d="M3 3h34v34H3zM8 11h24M8 18h24M8 25h24" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    SHIFTLEFT: "SHIFT", SHIFTRIGHT: "SHIFT", CONTROLLEFT: "CTRL", CONTROLRIGHT: "CTRL", ALTLEFT: "ALT", ALTRIGHT: isE14Keyboard ? "ALT GR" : "ALT", INTLRO: "? / °", FN: "Fn",
    NUMLOCK: "Num Lock", NUMDIVIDE: "/", NUMMULTIPLY: "*", NUMSUBTRACT: "−", NUMADD: "+", NUMDECIMAL: ".", NUMENTER: "Enter",
    ARROWLEFT: "←", ARROWUP: "↑", ARROWDOWN: "↓", ARROWRIGHT: "→",
  };
  const renderKey = (key, className = "") => {
    const canConfirmWithClick = (!isWindowsPreview && key === "F11") || (isWindowsPreview && ["PRINTSCREEN", "FN"].includes(key));
    const manualAttributes = canConfirmWithClick
      ? ` role="button" tabindex="0" title="${key === "PRINTSCREEN" ? "Clique somente se a tecla Prt Sc abriu a ferramenta de captura do Windows" : key === "FN" ? "Depois de testar Fn com uma tecla de função, clique aqui para confirmar manualmente" : "Clique para confirmar o F11 sem acionar o controle de tela do macOS"}" data-manual-confirm="true"`
      : "";
    return `<kbd class="${className}${canConfirmWithClick ? " manual-confirm" : ""}" data-key="${key}"${manualAttributes}>${keyNames[key] || key.replace(/^NUM/, "")}</kbd>`;
  };
  let keyboardMarkup = "";
  let totalKeys = 0;
  if (isWindowsPreview) {
    const functionKeys = ["ESC","F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12","PRINTSCREEN","SCROLLLOCK","PAUSE"];
    const mainRows = [
      ["BACKQUOTE","1","2","3","4","5","6","7","8","9","0","-","=","BACKSPACE"],
      ["TAB","Q","W","E","R","T","Y","U","I","O","P","[","]","BACKSLASH"],
      ["CAPSLOCK","A","S","D","F","G","H","J","K","L",";","'","ENTER"],
      ["SHIFTLEFT","Z","X","C","V","B","N","M",",",".","/","SHIFTRIGHT"],
      isE14Keyboard
        ? ["FN","CONTROLLEFT","WINDOWSLEFT","ALTLEFT","SPACE","ALTRIGHT","PRINTSCREEN","INTLRO","CONTROLRIGHT"]
        : ["CONTROLLEFT","WINDOWSLEFT","ALTLEFT","SPACE","ALTRIGHT","MENU","CONTROLRIGHT"],
    ];
    const navigationKeys = ["INSERT","HOME","PAGEUP","DELETE","END","PAGEDOWN","ARROWUP","ARROWLEFT","ARROWDOWN","ARROWRIGHT"];
    const numpadKeys = ["NUMLOCK","NUMDIVIDE","NUMMULTIPLY","NUMSUBTRACT","NUM7","NUM8","NUM9","NUMADD","NUM4","NUM5","NUM6","NUM1","NUM2","NUM3","NUMENTER","NUM0","NUMDECIMAL"];
    totalKeys = new Set([...functionKeys, ...mainRows.flat(), ...navigationKeys, ...numpadKeys]).size;
    keyboardMarkup = `
      <div class="keyboard-map windows-keyboard" aria-label="Mapa completo do teclado Windows">
        <div class="windows-function-row">
          <div class="windows-function-main">${functionKeys.slice(0, 13).map((key) => renderKey(key, ["F1","F5","F9"].includes(key) ? `function-${key.toLowerCase()}` : "")).join("")}</div>
          <div class="windows-function-end">${(isE14Keyboard ? [null,"SCROLLLOCK","PAUSE","HOME","END"] : ["PRINTSCREEN","SCROLLLOCK","PAUSE","HOME","END"]).map((key) => key ? renderKey(key) : '<span class="keyboard-empty" aria-hidden="true"></span>').join("")}</div>
        </div>
        <div class="windows-keyboard-grid">
          <div class="windows-main-keys">${mainRows.map((row) => `<div class="keyboard-row">${row.map((key) => renderKey(key)).join("")}</div>`).join("")}</div>
          <div class="windows-navigation-keys">
            ${["PAGEUP","PAGEDOWN","INSERT","DELETE","ARROWUP"].map((key) => renderKey(key)).join("")}
          </div>
          <div class="windows-numpad">
            ${numpadKeys.map((key) => renderKey(key, key === "NUMADD" ? "numpad-add" : key === "NUMENTER" ? "numpad-enter" : key === "NUM0" ? "numpad-zero" : "")).join("")}
          </div>
        </div>
        <div class="windows-keyboard-footer">
          <div class="windows-touchpad" aria-label="Teste dos botões do mouse ou touchpad" title="Clique aqui com os botões esquerdo, meio e direito"><span data-mouse-button="0" title="Clique esquerdo"></span><span data-mouse-button="1" title="Clique do meio"></span><span data-mouse-button="2" title="Clique direito"></span></div>
          <div class="windows-arrow-keys">${["ARROWLEFT","ARROWDOWN","ARROWRIGHT"].map((key) => renderKey(key)).join("")}</div>
        </div>
      </div>`;
  } else {
    totalKeys = new Set(macKeyboardRows.flat()).size;
    keyboardMarkup = `<div class="keyboard-map mac-keyboard">${macKeyboardRows.map((row) => `<div class="keyboard-row">${row.map((key) => renderKey(key)).join("")}</div>`).join("")}</div>`;
  }
  const keyboardHelp = isWindowsPreview
    ? "Pressione cada tecla. No E14, confirme Fn após usá-la com uma tecla de função. Se Prt Sc abrir a captura, confirme-a manualmente. Nos três campos abaixo, clique com esquerdo, meio e direito."
    : "Pressione cada tecla. Se F11 controlar a tela do Mac, clique em F11 no mapa para confirmar.";
  qs("activeTestBody").innerHTML = `<div class="keyboard-progress"><div><span>Teclas reconhecidas</span><small>${keyboardHelp}</small>${isWindowsPreview ? '<small id="keyboardLastEvent" aria-live="polite">Última tecla: aguardando</small><small id="keyboardLastPointer" aria-live="polite">Último clique: aguardando</small>' : ""}</div><strong id="keyboardCount">0 / ${totalKeys}</strong></div>${keyboardMarkup}`;
  const visibleKeys = new Set([...qs("activeTestBody").querySelectorAll("kbd[data-key]")].map((item) => item.dataset.key));
  for (const key of pressed) if (!visibleKeys.has(key)) pressed.delete(key);
  qs("activeTestBody").querySelectorAll("kbd[data-key]").forEach((item) => {
    if (pressed.has(item.dataset.key)) item.classList.add("pressed");
  });
  qs("keyboardCount").textContent = `${pressed.size} / ${totalKeys}`;
  const confirmKey = (key) => {
    const elements = [...qs("activeTestBody").querySelectorAll("kbd[data-key]")]
      .filter((item) => item.dataset.key === key);
    if (!elements.length) return;
    elements.forEach((element) => {
      element.classList.remove("active-key");
      element.classList.add("pressed");
    });
    pressed.add(key);
    qs("keyboardCount").textContent = `${pressed.size} / ${totalKeys}`;
  };
  state.keyboardHandler = (event) => {
    if (event.target?.dataset?.manualConfirm === "true" && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      confirmKey(event.target.dataset.key);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const key = normalizeKeyboardEvent(event);
    if (isWindowsPreview && event.type === "keydown") {
      const lastEvent = qs("keyboardLastEvent");
      if (lastEvent) lastEvent.textContent = `Última tecla: código físico ${event.code || "indisponível"} · caractere ${event.key || "indisponível"} · mapa ${visibleKeys.has(key) ? key : "não identificado"}`;
    }
    const elements = [...qs("activeTestBody").querySelectorAll("kbd[data-key]")]
      .filter((item) => item.dataset.key === key);
    if (elements.length) {
      if (event.type === "keydown") {
        elements.forEach((element) => element.classList.add("active-key"));
        pressed.add(key);
        qs("keyboardCount").textContent = `${pressed.size} / ${totalKeys}`;
      } else {
        confirmKey(key);
      }
    }
  };
  qs("activeTestBody").querySelectorAll('kbd[data-manual-confirm="true"]').forEach((item) => {
    item.addEventListener("click", () => confirmKey(item.dataset.key));
  });
  const keyboardMap = qs("activeTestBody").querySelector(".windows-keyboard");
  const touchpadButtons = keyboardMap?.querySelector(".windows-touchpad");
  if (keyboardMap && touchpadButtons) {
    state.mouseButtonCleanup = listenForMouseButtons(keyboardMap, (button, event) => {
      if (event.target?.closest?.("kbd")) return;
      touchpadButtons.querySelector(`[data-mouse-button="${button}"]`)?.classList.add("pressed");
      qs("keyboardLastPointer").textContent = `Último clique: ${["esquerdo", "meio", "direito"][button]} detectado`;
    });
  }
  document.addEventListener("keydown", state.keyboardHandler, true);
  document.addEventListener("keyup", state.keyboardHandler, true);
}

function refreshKeyboardLayoutForDevice() {
  if (!isWindowsPreview || state.activeTest !== "keyboard" || !state.keyboardHandler) return;
  const isE14Keyboard = /\bE14\b/i.test(state.info?.modelo || "");
  if (isE14Keyboard !== state.keyboardLayoutE14) openKeyboardTest();
}

async function playTestTone(volume = 50) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Áudio não suportado neste navegador.");
  const context = new AudioContextClass();
  state.toneContext = context;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(440, context.currentTime);
  oscillator.frequency.linearRampToValueAtTime(660, context.currentTime + 0.8);
  const peak = Math.max(0, Math.min(100, volume)) / 100 * 0.22;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(peak, context.currentTime + 0.05);
  gain.gain.setValueAtTime(peak, context.currentTime + 0.95);
  gain.gain.linearRampToValueAtTime(0, context.currentTime + 1.25);
  oscillator.connect(gain).connect(context.destination);
  await context.resume();
  oscillator.start();
  oscillator.stop(context.currentTime + 1.3);
  await new Promise((resolve) => oscillator.addEventListener("ended", resolve, { once: true }));
  if (state.toneContext === context) state.toneContext = null;
  await context.close().catch(() => {});
}

async function startMicrophoneMeter() {
  try {
    if (state.mediaStream) state.mediaStream.getTracks().forEach((track) => track.stop());
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.mediaStream = await requestUserMediaWithStartupRetry({ audio: true, video: false });
    state.audioContext = new AudioContextClass();
    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    const analyser = state.audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const meter = qs("micMeterFill");
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const level = data.reduce((sum, value) => sum + value, 0) / data.length;
      meter.style.width = `${Math.min(100, level * 1.8)}%`;
      state.audioFrame = requestAnimationFrame(tick);
    };
    tick();
    qs("micStatus").textContent = "Microfone ativo — fale para movimentar o medidor.";
  } catch (err) {
    testError(err.message || "Microfone indisponivel.");
  }
}

function openAudioTest() {
  qs("activeTestBody").innerHTML = `<div class="audio-stage">
    <section class="audio-card" aria-label="Teste dos alto-falantes">
      <div class="audio-card-head"><div><span>01 · SAÍDA DE SOM</span><h4>Ouça o tom de teste</h4><p>Ajuste o volume deste teste e confirme os alto-falantes.</p></div><div class="audio-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="audio-volume-control"><button type="button" id="volumeDown" aria-label="Diminuir volume do teste">−</button><input id="testVolume" type="range" min="0" max="100" step="10" value="50" aria-label="Volume do tom de teste"><button type="button" id="volumeUp" aria-label="Aumentar volume do teste">+</button><output id="testVolumeValue" for="testVolume">50%</output></div>
      <button type="button" class="audio-play" id="playTone"><span aria-hidden="true">▶</span><span>Reproduzir tom</span></button>
    </section>
    <section class="audio-card audio-mic-card" aria-label="Teste do microfone"><div class="audio-card-head"><div><span>02 · ENTRADA DE VOZ</span><h4>Confira o microfone</h4><p>Fale normalmente e observe o nível abaixo.</p></div><button type="button" id="startMic">Ativar microfone</button></div><div class="mic-meter" role="meter" aria-label="Nível do microfone"><span id="micMeterFill"></span></div><p id="micStatus" aria-live="polite">O medidor será ativado com sua permissão.</p></section>
  </div>`;
  const volume = qs("testVolume");
  const updateVolume = () => {
    qs("testVolumeValue").value = `${volume.value}%`;
    volume.style.setProperty("--audio-level", `${volume.value}%`);
  };
  qs("volumeDown").addEventListener("click", () => { volume.value = Math.max(0, Number(volume.value) - 10); updateVolume(); });
  qs("volumeUp").addEventListener("click", () => { volume.value = Math.min(100, Number(volume.value) + 10); updateVolume(); });
  volume.addEventListener("input", updateVolume);
  updateVolume();
  qs("playTone").addEventListener("click", async () => {
    const button = qs("playTone");
    button.disabled = true;
    button.closest(".audio-card").classList.add("playing");
    try { await playTestTone(Number(volume.value)); }
    catch (err) { testError(err.message || "Não foi possível reproduzir o som."); }
    finally { button.disabled = false; button.closest(".audio-card")?.classList.remove("playing"); }
  });
  qs("startMic").addEventListener("click", startMicrophoneMeter);
}

function setScreenTestColor(color) {
  qs("screenTestDialog").style.background = color;
  qs("screenTestDialog").classList.toggle("light-screen", color === "#ffffff");
}

function openScreenTest() {
  const dialog = qs("screenTestDialog");
  setScreenTestColor("#ffffff");
  try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); }
  const requestFull = dialog.requestFullscreen || dialog.webkitRequestFullscreen;
  if (requestFull) Promise.resolve(requestFull.call(dialog)).catch(() => {});
}

function openTrackpadTest() {
  qs("activeTestBody").innerHTML = '<div class="trackpad-stats" aria-label="Leituras do mouse"><span><small>Movimento</small><strong id="trackMoves">0</strong></span><span><small>Esquerdo</small><strong id="trackLeft">0</strong></span><span><small>Direito</small><strong id="trackRight">0</strong></span><span><small>Rolagem</small><strong id="trackScrolls">0</strong></span></div><div class="trackpad-zone" id="trackpadZone"><i id="trackPointer"></i><div class="trackpad-guide" aria-hidden="true"><span>ÁREA DE TESTE</span><strong>Explore toda a superfície</strong><small>Mova o ponteiro, clique e role dentro desta área.</small><div class="trackpad-gesture-guide"><span>1 · Clique esquerdo</span><span>2 · Clique direito</span><span>3 · Rolagem</span></div></div></div><p id="trackLastPointer" aria-live="polite">Último clique: aguardando. Clique em qualquer ponto da área deste teste.</p>';
  const zone = qs("trackpadZone");
  const pointer = qs("trackPointer");
  let moves = 0;
  let scrolls = 0;
  const clicks = [0, 0, 0];
  const clickIds = ["trackLeft", null, "trackRight"];
  const updateMetric = (id, value) => {
    const metric = qs(id);
    metric.textContent = value;
    metric.parentElement.classList.add("observed");
  };
  zone.addEventListener("pointermove", (event) => {
    const bounds = zone.getBoundingClientRect();
    pointer.style.left = `${event.clientX - bounds.left}px`;
    pointer.style.top = `${event.clientY - bounds.top}px`;
    updateMetric("trackMoves", ++moves);
  });
  state.mouseButtonCleanup = listenForMouseButtons(qs("activeTestBody"), (button) => {
    updateMetric(clickIds[button], ++clicks[button]);
    qs("trackLastPointer").textContent = `Último clique: ${["esquerdo", "", "direito"][button]} detectado`;
  }, [0, 2]);
  zone.addEventListener("wheel", (event) => { event.preventDefault(); updateMetric("trackScrolls", ++scrolls); }, { passive: false });
}

async function openTest(test) {
  stopActiveTest();
  state.activeTest = test;
  qs("testWorkspace").classList.remove("hidden");
  qs("activeTestTitle").textContent = testLabels[test];
  const helps = {
    camera: "Autorize a camera e confira nitidez, enquadramento e estabilidade.",
    keyboard: isWindowsPreview
      ? "Pressione todas as teclas. Em alguns notebooks, use Fn + F1, Fn + F2 etc. para testar as teclas de função."
      : "Pressione as teclas. No Mac, use Fn + F1, Fn + F2 etc. para testar as teclas de função.",
    audio: "Confirme a saida dos alto-falantes e observe o nivel do microfone.",
    screen: "Alterne entre as cinco cores e procure pixels presos, manchas ou vazamento de luz.",
    trackpad: isWindowsPreview
      ? "Mova o mouse ou use toda a superfície do touchpad, clique e faça rolagem."
      : "Use toda a superfície do trackpad, clique e faça rolagem.",
  };
  qs("activeTestHelp").textContent = helps[test];
  renderActiveTestNavigation();
  if (test === "camera") await openCameraTest();
  if (test === "keyboard") openKeyboardTest();
  if (test === "audio") openAudioTest();
  if (test === "screen") openScreenTest();
  if (test === "trackpad") openTrackpadTest();
  qs("testWorkspace").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeScreenTest() {
  const dialog = qs("screenTestDialog");
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  if (dialog.open) dialog.close();
}

async function copyTestsReport() {
  const report = testsReport();
  await copyText(report);
  qs("testsActionStatus").textContent = "Resumo completo copiado.";
  setStatus("Resumo dos testes copiado.", "ok");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const field = document.createElement("textarea");
    field.value = text;
    document.body.appendChild(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  }
}

function productLabel(product) {
  const code = product.codigo || product.produtoCodigo || "SEM CODIGO";
  const description = product.descricao || product.nome || product.texto || "Produto";
  return `${code} | ${description}`;
}

function productDescription(product) {
  return String(product?.descricao || product?.nome || product?.texto || "").trim();
}

function inferEquipmentType(product, device3u = state.device3u) {
  const description = productDescription(product);
  if (/\b(MONITOR|DISPLAY|TELA)\b/i.test(description)) return "Monitor";
  if (/^\s*(?:CPU|DESKTOP|MINI\s*DESKTOP)\b|\b(MINI\s*PC|OPTIPLEX|PRODESK|ELITEDESK)\b/i.test(description)) return "Desktop";
  if (/\b(IPHONE|IPAD|SMARTPHONE|CELULAR|TABLET)\b/i.test(description)) return "Celular";
  if (device3u) return "Celular";
  return "Notebook";
}

function monitorSizeFromDescription(description) {
  const match = String(description || "").match(/\b(\d{2}(?:[.,]\d)?)\s*(?:POL(?:EGADAS?)?|\")/i);
  return match ? `${match[1].replace(",", ".")}"` : "";
}

function batteryWithoutCycles(value) {
  return String(value || "")
    .replace(/\s*\|?\s*\d+\s*ciclos?.*$/i, "")
    .trim();
}

async function import3uToolsDevice(button) {
  const idleText = button.textContent;
  state.device3u = null;
  state.awaitingDeviceImport = true;
  renderCurrentConfig();
  button.disabled = true;
  button.textContent = "Lendo aparelho...";
  try {
    const data = await api("/api/read-3utools", {});
    state.device3u = data.device;
    state.awaitingDeviceImport = false;
    const mobileInfo = {
      modelo: data.device.modelo || "iPhone",
      serial: data.device.serial || "N/A",
      cpu: "N/A",
      gpu: "N/A",
      ram: data.device.ram || "N/A",
      disco: data.device.armazenamento || "N/A",
      bateria: data.device.bateria || "N/A",
      imei: data.device.imei || "N/A",
      ciclos: Number(data.device.ciclos) > 0 ? String(data.device.ciclos) : "N/A",
    };
    applyState(await api("/api/info", { info: mobileInfo, equipmentType: "Celular" }));
    return data.device;
  } finally {
    button.disabled = false;
    button.textContent = idleText;
  }
}

function labelContextFromCreate(body) {
  const equipmentType = inferEquipmentType(body.produto, body.device3u);
  const description = productDescription(body.produto);
  const info = { ...state.info, serial: body.serial };
  if (equipmentType === "Monitor") {
    Object.assign(info, {
      modelo: description || "Monitor",
      cpu: "",
      gpu: "",
      ram: "",
      disco: "",
      bateria: "",
      monitorTamanho: state.info.monitorTamanho || monitorSizeFromDescription(description),
      monitorEntradas: state.info.monitorEntradas || "",
    });
  } else if (equipmentType === "Desktop") {
    info.modelo = description || info.modelo || "Desktop";
    info.bateria = "";
  } else if (equipmentType === "Celular" && body.device3u) {
    info.modelo = body.device3u.modelo || description || info.modelo;
  } else if (equipmentType === "Celular" && state.equipmentType !== "Celular") {
    Object.assign(info, { modelo: description, cpu: "", gpu: "", ram: "", disco: "", bateria: "", imei: "", ciclos: "" });
  }
  return { info, equipmentType };
}

function applyGradeFromReference(reference) {
  const normalized = String(reference || "").toUpperCase();
  state.grade = normalized.includes("TRIAGEM") ? "T"
    : normalized === "RMA" ? "RMA"
      : (normalized.match(/GRADE\s+([ABC])/)?.[1] || "A");
  document.querySelectorAll(".grade").forEach((button) => {
    button.classList.toggle("active", button.dataset.grade === state.grade);
  });
}

function productCode(product) {
  return String(product.codigo || product.produtoCodigo || "").trim().toUpperCase();
}

function sortProductsWithTFirst(products) {
  return [...products].sort((left, right) => {
    const leftCode = productCode(left);
    const rightCode = productCode(right);
    const leftIsT = /^T\d/.test(leftCode);
    const rightIsT = /^T\d/.test(rightCode);
    if (leftIsT !== rightIsT) return leftIsT ? -1 : 1;
    return leftCode.localeCompare(rightCode, "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

function updateCreateOsState() {
  const other = qs("otherTechnician").value.trim();
  const technician = state.createOs.technician === "Outro" ? other : state.createOs.technician;
  const ready = state.deviceReading === 'ready' && Boolean(technician && state.createOs.product && qs("createSerial").value.trim());
  qs("submitCreateOs").disabled = !ready;
  qs("createOsStatus").textContent = state.createOs.product
    ? `Selecionado: ${productLabel(state.createOs.product)}`
    : "Selecione o técnico e o produto.";
}

function openCreateOs() {
  const hadImportedDevice = Boolean(state.device3u);
  state.createOs.technician = "";
  state.createOs.product = null;
  state.device3u = null;
  state.awaitingDeviceImport = hadImportedDevice;
  qs("technicianGrid").querySelectorAll("button").forEach((button) => button.classList.remove("active"));
  qs("otherTechnician").value = "";
  qs("otherTechnician").classList.add("hidden");
  qs("productSearch").value = hadImportedDevice ? "" : (state.info.modelo || "");
  qs("createSerial").value = hadImportedDevice ? "" : (state.info.serial || "");
  qs("createObservation").value = "";
  qs("createServiceChecklist").querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
  qs("productResults").innerHTML = "<p>Pesquise e selecione um produto.</p>";
  const currentOs = osNumberFromInput();
  qs("createCurrentOs").value = currentOs ? `C${String(currentOs).padStart(6, "0")}` : "";
  renderCurrentConfig();
  updateCreateOsState();
  renderObservationPreviews();
  showAppView("createOs");
  scheduleSerialOsLookup();
}

function closeCreateOs() {
  showAppView("home");
}

function renderProductResults(products) {
  const container = qs("productResults");
  if (!products.length) {
    container.innerHTML = "<p>Nenhum produto encontrado.</p>";
    return;
  }
  const orderedProducts = sortProductsWithTFirst(products);
  container.innerHTML = orderedProducts.map((product, index) => `
    <button type="button" data-product-index="${index}">
      <strong>${escapeHtml(product.codigo || product.produtoCodigo || "--")}</strong>
      <span>${escapeHtml(product.descricao || product.nome || product.texto || "Produto")}</span>
    </button>
  `).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.createOs.product = orderedProducts[Number(button.dataset.productIndex)];
      renderCurrentConfig();
      container.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      updateCreateOsState();
    });
  });
}

async function watchOs() {
  if (state.watchingOs || qs("printBtn")?.getAttribute("aria-busy") === "true" || qs("submitCreateOs")?.getAttribute("aria-busy") === "true") return;
  state.watchingOs = true;
  try {
    const data = await api("/api/os-watch");
    if (data.state && data.event && qs("printBtn")?.getAttribute("aria-busy") !== "true" && qs("submitCreateOs")?.getAttribute("aria-busy") !== "true") {
      applyState(data.state);
      showOsAlert(data);
      setStatus(`Rastreador ${data.osCriada} criado. Próximo disponível: ${data.proximaOs}.`, "ok");
    }
  } catch (_) {
    // A perda momentanea do servidor nao deve interromper o trabalho na etiqueta.
  } finally {
    state.watchingOs = false;
  }
}

async function loadState() {
  try {
    const data = await api("/api/state");
    applyState(data);
    if (data.deviceReading === 'pending') {
      setStatus("Lendo as informações do equipamento. Você já pode abrir os testes.", "busy");
      window.setTimeout(loadState, 750);
    } else if (data.deviceReading === 'error') {
      setStatus(data.deviceReadingError || "Não foi possível ler o equipamento. Feche e abra o aplicativo para tentar novamente.", "warn");
    } else {
      setStatus("Pronto.");
      void lookupExistingOs();
    }
  } catch (err) {
    setStatus(err.message, "warn");
  }
}

function deviceInfoText() {
  return fields
    .map((key) => `${labels[key]}: ${state.info[key] || "N/A"}`)
    .join("\n");
}

function updateSessionClock() {
  const now = new Date();
  qs("sessionClock").dateTime = now.toISOString();
  qs("sessionClock").querySelector("b").textContent = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  qs("sessionClock").title = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

async function refreshDeviceReading() {
  const button = qs("refreshReading");
  button.disabled = true;
  setStatus("Atualizando a leitura da máquina...", "busy");
  await loadState();
  if (isWindowsPreview) await refreshOsVerification();
  button.disabled = false;
}

async function copyDeviceInfo() {
  await copyText(deviceInfoText());
  setStatus("Ficha técnica copiada.", "ok");
}

function wireControls() {
  document.addEventListener("click", async (event) => {
    const retry = event.target.closest("[data-serial-os-retry]");
    if (retry) return void lookupExistingOs(true);
    const choice = event.target.closest("[data-serial-os]");
    if (!choice) return;
    const order = state.serialOsLookup.orders.find((item) => Number(item.numero) === Number(choice.dataset.serialOs));
    try {
      await selectSerialOs(order);
      setStatus(`Rastreador ${order.osCodigo} selecionado para esta serial.`, "ok");
    } catch (error) {
      setStatus(error.message, "warn");
    }
  });
  document.querySelectorAll(".grade").forEach((button) => {
    button.addEventListener("click", () => {
      state.grade = button.dataset.grade;
      document.querySelectorAll(".grade").forEach((b) => b.classList.toggle("active", b === button));
      renderPreview();
      renderOperationalDashboard();
    });
  });

  qs("editToggle").addEventListener("click", () => {
    qs("deviceRead").classList.toggle("hidden");
    qs("deviceRead").parentElement.classList.toggle("hidden");
    qs("editForm").classList.toggle("hidden");
  });
  qs("refreshReading").addEventListener("click", refreshDeviceReading);
  qs("homeOpenTests").addEventListener("click", () => qs("openTests").click());
  qs("copyDeviceInfo").addEventListener("click", copyDeviceInfo);

  qs("openTests").addEventListener("click", openTestsPage);
  qs("closeTests").addEventListener("click", closeTestsPanel);
  qs("closeActiveTest").addEventListener("click", stopActiveTest);
  qs("skipActiveTest").addEventListener("click", () => completeActiveTest("pending"));
  qs("failAndNextTest").addEventListener("click", () => completeActiveTest("failed"));
  qs("passAndNextTest").addEventListener("click", () => completeActiveTest("passed"));
  qs("testList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const test = button.closest(".test-row").dataset.test;
    const action = button.dataset.action;
    if (action === "open") return openTest(test);
    state.tests[test] = action === "pass" ? "passed" : action === "fail" ? "failed" : "pending";
    renderTests();
  });
  qs("resetTests").addEventListener("click", () => {
    Object.keys(state.tests).forEach((key) => state.tests[key] = "pending");
    stopActiveTest();
    renderTests();
  });
  qs("copyTestsReport").addEventListener("click", copyTestsReport);
  qs("finishTests").addEventListener("click", async () => {
    if (Object.values(state.tests).some((value) => value === "pending")) return;
    if (testsOnlyMode) {
      const report = testsLabelSummary();
      await copyText(report);
      try { localStorage.setItem("caij:mac-tests-observation", report); } catch (_) {}
    }
    closeTestsPanel();
    setStatus("Testes finalizados e observações atualizadas.", "ok");
  });
  qs("screenColorButtons").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-color]");
    if (button) setScreenTestColor(button.dataset.color);
  });
  qs("closeScreenTest").addEventListener("click", closeScreenTest);

  qs("editForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const info = {};
    fields.forEach((key) => info[key] = formData.get(key) || "");
    if (isWindowsPreview) info.ramDetalhes = formData.get("ramDetalhes") || "";
    setStatus("Salvando dados...", "busy");
    try {
      const data = await api("/api/info", { info });
      applyState(data);
      qs("deviceRead").classList.remove("hidden");
      qs("deviceRead").parentElement.classList.remove("hidden");
      qs("editForm").classList.add("hidden");
      setStatus("Dados atualizados.", "ok");
      scheduleSerialOsLookup();
    } catch (err) {
      setStatus(err.message, "warn");
    }
  });

  qs("syncOs").addEventListener("click", async () => {
    setStatus("Sincronizando rastreador com o servidor...", "busy");
    try {
      const data = await api("/api/sync-os", {});
      applyState(data);
      await refreshOsVerification();
      setStatus("Rastreador sincronizado.", "ok");
    } catch (err) {
      setStatus(err.message, "warn");
    }
  });

  qs("osInput").addEventListener("focus", (event) => event.currentTarget.select());
  qs("osInput").addEventListener("input", scheduleOsIdentification);
  qs("osInput").addEventListener("blur", (event) => {
    const digits = String(event.currentTarget.value || "").replace(/\D/g, "");
    if (digits) event.currentTarget.value = `C${String(Number(digits)).padStart(6, "0")}`;
  });
  qs("createCurrentOs").addEventListener("focus", (event) => event.currentTarget.select());
  qs("createCurrentOs").addEventListener("input", scheduleOsIdentification);
  qs("createCurrentOs").addEventListener("blur", (event) => {
    const digits = String(event.currentTarget.value || "").replace(/\D/g, "");
    event.currentTarget.value = digits
      ? `C${String(Number(digits)).padStart(6, "0")}`
      : qs("osInput").value;
  });
  qs("printOsInput").addEventListener("focus", (event) => event.currentTarget.select());
  qs("printOsInput").addEventListener("change", async (event) => {
    ++serialOsLookupRequest;
    state.manualOsSet = true;
    state.serialOsLookup.status = "idle";
    renderSerialOsLookup();
    const digits = String(event.currentTarget.value || "").replace(/\D/g, "");
    if (!digits) {
      syncPrintOsInput();
      return setStatus("Informe um número de rastreador válido.", "warn");
    }
    const formatted = `C${String(Number(digits)).padStart(6, "0")}`;
    event.currentTarget.value = formatted;
    qs("osInput").value = formatted;
    try {
      await persistEditedOs();
      await refreshOsVerification();
      renderPreview();
      setStatus("Rastreador da etiqueta alterado.", "ok");
    } catch (err) {
      setStatus(err.message, "warn");
    }
  });

  qs("openMenu").addEventListener("click", () => {
    stopActiveTest();
    showAppView("home");
  });
  qs("openLabels").addEventListener("click", async () => {
    showAppView("labels");
    await refreshOsVerification();
  });
  qs("reviewSerialDivergence").addEventListener("click", async () => {
    showAppView("labels");
    setStatus("Confira a serial do equipamento e a serial vinculada ao rastreador.", "busy");
    await refreshOsVerification();
  });
  qs("workflowRead").parentElement.addEventListener("click", (event) => {
    const target = event.target.closest("[data-workflow-action]");
    if (target) runWorkflowAction(target.dataset.workflowAction);
  });
  qs("nextActionButton").addEventListener("click", (event) => runWorkflowAction(event.currentTarget.dataset.workflowAction));
  qs("reprintLast").addEventListener("click", () => {
    showAppView("labels");
    setStatus("Confira a etiqueta antes de reimprimir.", "busy");
  });
  qs("includeOs").addEventListener("change", updatePrintOsAvailability);
  qs("labelEquipmentType").addEventListener("change", async (event) => {
    const equipmentType = event.currentTarget.value;
    state.equipmentType = equipmentType;
    renderPreview();
    try {
      const data = await api("/api/info", { info: state.info, equipmentType });
      applyState(data);
      setStatus(`Etiqueta adaptada para ${event.currentTarget.selectedOptions[0].textContent}.`, "ok");
    } catch (err) {
      setStatus(err.message, "warn");
    }
  });
  qs("read3uToolsLabel").addEventListener("click", async (event) => {
    try {
      const device = await import3uToolsDevice(event.currentTarget);
      populateLabelEditor();
      renderPreview();
      setStatus(`${device.modelo || "Aparelho"} importado do 3uTools.`, "ok");
    } catch (err) {
      setStatus(err.message, "warn");
    }
  });
  qs("toggleLabelEditor").addEventListener("click", () => {
    setLabelEditorOpen(qs("labelEditForm").classList.contains("hidden"));
  });
  qs("cancelLabelEditor").addEventListener("click", () => setLabelEditorOpen(false));
  qs("labelEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const info = {};
    labelFields.forEach((key) => info[key] = String(formData.get(key) || "").trim());
    setStatus("Aplicando dados manuais na etiqueta...", "busy");
    try {
      const data = await api("/api/info", { info, equipmentType: qs("labelEquipmentType").value });
      applyState(data);
      renderPreview();
      setLabelEditorOpen(false);
      setStatus("Dados manuais aplicados na prévia.", "ok");
    } catch (err) {
      setStatus(err.message, "warn");
    }
  });
  qs("obs").addEventListener("input", () => { renderObservationPreviews(); renderOperationalDashboard(); });
  qs("createObservation").addEventListener("input", renderObservationPreviews);
  ["labelServiceChecklist", "createServiceChecklist"].forEach((id) => {
    qs(id).addEventListener("change", () => { renderObservationPreviews(); renderOperationalDashboard(); });
  });
  qs("openCreateOs").addEventListener("click", openCreateOs);
  qs("closeCreateOs").addEventListener("click", closeCreateOs);
  qs("cancelCreateOs").addEventListener("click", closeCreateOs);

  qs("technicianGrid").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.createOs.technician = button.dataset.technician;
      qs("technicianGrid").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
      qs("otherTechnician").classList.toggle("hidden", state.createOs.technician !== "Outro");
      if (state.createOs.technician === "Outro") qs("otherTechnician").focus();
      updateCreateOsState();
      renderObservationPreviews();
    });
  });
  qs("otherTechnician").addEventListener("input", () => { updateCreateOsState(); renderObservationPreviews(); });
  qs("createSerial").addEventListener("input", () => {
    updateCreateOsState();
    scheduleSerialOsLookup();
  });

  qs("searchProducts").addEventListener("click", async () => {
    const term = qs("productSearch").value.trim();
    qs("productResults").innerHTML = "<p>Buscando produtos...</p>";
    try {
      const data = await api("/api/products", { term });
      renderProductResults(data.produtos || []);
    } catch (err) {
      qs("productResults").innerHTML = `<p>${escapeHtml(err.message)}</p>`;
    }
  });
  qs("productSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      qs("searchProducts").click();
    }
  });

  if (isWindowsPreview) {
    qs("refreshOsVerification").addEventListener("click", refreshOsVerification);
    qs("toggleConfigEditor").addEventListener("click", () => {
      qs("configInlineEditor").classList.toggle("hidden");
    });
    qs("applyConfigEditor").addEventListener("click", async () => {
      const info = {
        ...state.info,
        cpu: qs("configCpu").value.trim(),
        disco: normalizeStorage(qs("configDisk").value),
        ram: qs("configRam").value.trim(),
        gpu: qs("configGpu").value.trim(),
      };
      const data = await api("/api/info", { info });
      applyState(data);
      qs("configInlineEditor").classList.add("hidden");
      setStatus("Configuração atualizada para o cadastro do rastreador.", "ok");
    });
    qs("read3uTools").addEventListener("click", async () => {
      const button = qs("read3uTools");
      qs("createOsStatus").textContent = "Consultando o 3uTools deste computador...";
      try {
        const device = await import3uToolsDevice(button);
        qs("createSerial").value = device.serial || "";
        scheduleSerialOsLookup();
        qs("productSearch").value = device.modelo || "iPhone";
        renderCurrentConfig();
        updateCreateOsState();
        qs("createOsStatus").textContent = `${device.modelo} lido. Buscando o produto correspondente...`;
        qs("searchProducts").click();
      } catch (error) {
        qs("createOsStatus").textContent = error.message;
      }
    });
  }

  qs("createOsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (["searching", "choose"].includes(state.serialOsLookup.status) && state.serialOsLookup.serial === currentLookupSerial()) {
      return setStatus("Confira primeiro o rastreador encontrado para esta serial.", "warn");
    }
    const createButton = qs("submitCreateOs");
    if (createButton.disabled) return;
    const technician = state.createOs.technician === "Outro"
      ? qs("otherTechnician").value.trim()
      : state.createOs.technician;
    const body = {
      tecnico: technician,
      serial: qs("createSerial").value.trim(),
      referencia: qs("createReference").value,
      observacao: observationText("createServiceChecklist", "createObservation"),
      produto: state.createOs.product,
      servicos: [],
      info: state.info,
      equipmentType: state.equipmentType,
      device3u: state.device3u,
    };
    const labelContext = labelContextFromCreate(body);
    body.info = labelContext.info;
    body.equipmentType = labelContext.equipmentType;
    if (body.equipmentType !== "Celular") body.device3u = null;
    setButtonBusy(createButton, true, "Criando rastreador...");
    qs("createOsStatus").textContent = "Criando rastreador no Altertag...";
    try {
      const data = await api("/api/create-os", body);
      state.osCreatedInSession = true;
      const preparedState = await api("/api/info", labelContext);
      applyState(preparedState || data.state || {});
      applyGradeFromReference(body.referencia);
      qs("obs").value = qs("createObservation").value.trim();
      const createdServices = new Set(checkedServices("createServiceChecklist"));
      qs("labelServiceChecklist").querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = createdServices.has(input.value);
      });
      renderObservationPreviews();
      renderOperationalDashboard();
      closeCreateOs();
      showOsAlert(data, true);
      setStatus(`${data.osCriada} criada com sucesso.`, "ok");
      void refreshOsVerification();
    } catch (err) {
      updateCreateOsState();
      qs("createOsStatus").textContent = err.message;
    } finally {
      setButtonBusy(createButton, false);
    }
  });

  qs("printBtn").addEventListener("click", async () => {
    if (["searching", "choose"].includes(state.serialOsLookup.status) && state.serialOsLookup.serial === currentLookupSerial()) {
      return setStatus("Escolha o rastreador correto antes de imprimir.", "warn");
    }
    const printButton = qs("printBtn");
    if (printButton.disabled || state.deviceReading !== 'ready') return;
    const printedOs = Number(String(qs("printOsInput").value || "").replace(/\D/g, "") || osNumberFromInput());
    const body = {
      grade: gradeValue(),
      obs: observationText("labelServiceChecklist", "obs", true),
      includeOs: qs("includeOs").checked,
      osNumero: printedOs,
      info: state.info,
      equipmentType: state.equipmentType,
    };
    setButtonBusy(printButton, true, "Imprimindo etiqueta...");
    setPrintProgress("Conferindo dados da etiqueta...", "busy");
    setStatus("Conferindo dados da etiqueta...", "busy");
    try {
      if (!window.CAIJ_OBSERVATION.fitsLabel(body.obs)) {
        throw new Error("A observação excede as 3 linhas da etiqueta. Resuma o texto antes de imprimir.");
      }
      if (["B", "C"].includes(state.grade) && !qs("obs").value.trim()) {
        throw new Error(`Descreva os detalhes ou avarias da Grade ${state.grade} em Observações.`);
      }
      if (body.includeOs) {
        if (!printedOs) throw new Error("Informe um número de rastreador válido.");
        const formatted = `C${String(printedOs).padStart(6, "0")}`;
        qs("printOsInput").value = formatted;
        qs("osInput").value = formatted;
        setPrintProgress("Confirmando número do rastreador...", "busy");
        await persistEditedOs(printedOs);
      }
      setPrintProgress("Aguardando o servidor concluir o QR e confirmar o envio à fila de impressão...", "busy");
      setStatus("Aguardando confirmação do servidor. Não envie outra vez enquanto esta operação estiver em andamento.", "busy");
      const data = await api("/api/print", body);
      saveLastPrint({
        os: body.includeOs ? `C${String(printedOs).padStart(6, "0")}` : "Sem rastreador",
        modelo: state.info.modelo || defaultModelName,
        serial: state.info.serial || "",
        grade: gradeValue(),
        tipo: state.equipmentType,
        horario: new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      });
      if (data.state) applyState(data.state);
      setPrintProgress("Servidor confirmou o envio à fila. Confira se a etiqueta saiu fisicamente.", "ok");
      showAppView("home");
      setStatus(data.syncWarning ? "Etiqueta enviada à fila. A sincronização secundária precisa ser conferida." : "Etiqueta enviada à fila de impressão. Confira a saída física.", data.syncWarning ? "warn" : "ok");
    } catch (err) {
      setPrintProgress(`Impressão não confirmada: ${err.message}`, "warn");
      setStatus(err.message, "warn");
    } finally {
      setButtonBusy(printButton, false);
    }
  });
  qs("checkPrintConnections").addEventListener("click", checkPrintConnections);
  qs("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        qs("fullscreenBtn").textContent = "Tela cheia";
      } else {
        await document.documentElement.requestFullscreen();
        qs("fullscreenBtn").textContent = "Sair da tela cheia";
      }
    } catch (_) {
      setStatus(isWindowsPreview ? "Use F11 para alternar a tela cheia." : "Use Control + Command + F para alternar a tela cheia.", "warn");
    }
  });

  qs("dismissOsAlert").addEventListener("click", closeOsAlert);
  qs("printCreatedOs").addEventListener("click", async () => {
    closeOsAlert();
    showAppView("labels");
    await refreshOsVerification();
    setStatus("Rastreador criado. Confira a prévia e imprima a etiqueta.", "ok");
  });
  qs("osAlert").addEventListener("click", (event) => {
    if (event.target === qs("osAlert")) closeOsAlert();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOsAlert();
  });
}

applyPlatformUi();
wireControls();
renderTests();
updatePrintOsAvailability();
updateSessionClock();
setInterval(updateSessionClock, 30000);
if (window.location.protocol === "file:") qs("brandLogo").src = "../caij-logo.png";
if (testsOnlyMode) {
  document.body.classList.add("tests-only");
  qs("closeTests").textContent = "Voltar ao InfoNotebook";
  showAppView("tests");
} else {
  loadState().then(async () => {
    if (isWindowsPreview) await refreshOsVerification();
    await watchOs();
  });
  setInterval(watchOs, 4000);
}
