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
    usb: "pending",
    charger: "pending",
    network: "pending",
    hdmi: "pending",
  },
  testChecklist: window.CAIJ_TEST_CHECKLIST.createChecklist({ usbPorts: ["USB 1", "USB 2"] }),
  testSignature: null,
  testSessionSerial: "",
  testRecords: null,
  testRecordsDurable: false,
  testConfirmationSaving: false,
  activeTest: "",
  mediaStream: null,
  audioContext: null,
  toneContext: null,
  audioFrame: 0,
  keyboardHandler: null,
  keyboardPressed: null,
  keyboardCaptureCleanup: null,
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
  camera: "Câmera",
  keyboard: "Teclado",
  audio: "Som",
  screen: "Tela",
  trackpad: "Trackpad",
  usb: "Portas USB",
  charger: "Carregador",
  network: "Rede / Wi-Fi",
  hdmi: "HDMI",
};
const testSequence = ["camera", "keyboard", "audio", "screen", "trackpad", "usb", "charger", "network", "hdmi"];

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
  document.title = "CAIJ InfoNotebook Windows";
  qs("platformName").textContent = "Windows";
  qs("brandKicker").classList.add("hidden");
  qs("serverLine").classList.add("hidden");
  qs("versionBadge").classList.add("hidden");
  qs("devicePanelTitle").textContent = "Informações do Windows";
  qs("testsTitle").textContent = "Central de testes Windows";
  qs("pointingDeviceTitle").textContent = "Mouse / touchpad";
  qs("pointingDeviceDescription").textContent = "Validar movimento, cliques e rolagem.";
  testLabels.trackpad = "Mouse / touchpad";
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
    throw new Error(data.message || "Não foi possível concluir a operação. Confira a conexão com o servidor.");
  }
  return data;
}

function setLoadingContent(element, message, loading = false) {
  if (!element) return;
  const label = document.createElement("span");
  label.textContent = message || "";
  element.replaceChildren(label);
  element.classList.toggle("has-bars-spinner", loading);
  if (loading) {
    const spinner = document.createElement("span");
    spinner.className = "bars-spinner";
    spinner.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 12; index++) {
      const bar = document.createElement("i");
      bar.style.setProperty("--bar-index", index);
      spinner.appendChild(bar);
    }
    element.prepend(spinner);
    element.setAttribute("aria-busy", "true");
  } else {
    element.removeAttribute("aria-busy");
  }
}

function setStatus(message, type = "") {
  const el = qs("statusLine");
  window.clearTimeout(statusTimer);
  el.className = `status-line ${type}`.trim();
  setLoadingContent(el, message, type === "busy");
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
    if (!button.classList.contains("is-busy")) {
      button._idleContent = [...button.childNodes];
      button.dataset.wasDisabled = String(button.disabled);
    }
    setLoadingContent(button, busyLabel, true);
    button.disabled = true;
    button.classList.add("is-busy");
    button.setAttribute("aria-busy", "true");
    return;
  }
  if (button._idleContent) button.replaceChildren(...button._idleContent);
  button.classList.remove("has-bars-spinner");
  button.disabled = button.dataset.wasDisabled === "true";
  button.classList.remove("is-busy");
  button.removeAttribute("aria-busy");
  delete button._idleContent;
  delete button.dataset.wasDisabled;
}

function setPrintProgress(message, phase = "busy") {
  const element = qs("printProgress");
  if (!element) return;
  element.hidden = !message;
  element.className = `print-progress ${phase}`;
  setLoadingContent(element, message, phase === "busy" && Boolean(message));
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
      if (result.detalhe) { const detail = document.createElement("small"); detail.textContent = result.detalhe; item.appendChild(detail); }
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
    if (Array.isArray(saved)) return saved.filter((entry) => entry && typeof entry === "object").slice(0, 100);
  } catch (_) {}
  const legacy = readLastPrint();
  return legacy ? [legacy] : [];
}

function saveLastPrint(data) {
  const entry = { ...data, printedAt: data.printedAt || new Date().toISOString() };
  state.lastPrint = entry;
  state.printHistory = [entry, ...(state.printHistory || [])].slice(0, 100);
  try {
    localStorage.setItem("caij:last-print", JSON.stringify(entry));
    localStorage.setItem("caij:print-history", JSON.stringify(state.printHistory));
  } catch (_) {}
  renderOperationalDashboard();
}

function renderPrintHistory() {
  const allHistory = Array.isArray(state.printHistory) ? state.printHistory : [];
  const query = String(qs("printHistorySearch")?.value || "").trim().toLocaleLowerCase("pt-BR");
  const history = allHistory.map((entry, index) => ({ entry, index })).filter(({ entry }) =>
    !query || [entry.serial, entry.os, entry.modelo, entry.grade].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query)));

  const list = qs("printHistoryList");
  const empty = qs("printHistoryEmpty");
  if (!list || !empty) return;
  qs("printHistoryPanel").classList.toggle("is-empty", allHistory.length === 0);
  qs("printHistoryCount").textContent = query ? `${history.length} de ${allHistory.length} registros` : `${allHistory.length} ${allHistory.length === 1 ? "impressão" : "impressões"}`;
  empty.textContent = allHistory.length ? "Nenhuma etiqueta corresponde à busca." : "Nenhuma etiqueta foi registrada neste navegador. São mantidos os últimos 100 registros.";
  empty.classList.toggle("hidden", history.length > 0);
  list.classList.toggle("hidden", history.length === 0);
  list.innerHTML = history.map(({ entry, index }) => `
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
      <time>${escapeHtml(formatHistoryDate(entry))}</time>
      <button type="button" class="secondary" data-review-print="${index}">Conferir</button>
    </li>
  `).join("");
}

function formatHistoryDate(entry) {
  const date = new Date(entry.printedAt || "");
  return Number.isNaN(date.getTime()) ? (entry.horario || "Data não informada") : date.toLocaleString("pt-BR");
}

function openHistoryReview(index) {
  const entry = state.printHistory[index];
  if (!entry) return;
  const info = entry.snapshot?.info;
  const rows = [["Modelo", entry.modelo], ["Serial", entry.serial], ["Rastreador", entry.os], ["Grade", entry.grade], ["Registrada em", formatHistoryDate(entry)], ...(info ? [["CPU", info.cpu], ["RAM", info.ram], ["Disco", info.disco], ["GPU", info.gpu], ["Observações", entry.snapshot.obs]] : [])];
  qs("historyReviewContent").innerHTML = `<dl class="history-review-data">${rows.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value || "Não informado")}</dd></div>`).join("")}</dl>${info ? "" : '<p class="dialog-note">Registro antigo: a configuração completa não foi salva nesta etiqueta.</p>'}`;
  qs("historyReviewDialog").showModal();
}

function editDeviceField(key) {
  if (qs("editForm").classList.contains("hidden")) qs("editToggle").click();
  const input = qs("editForm").elements.namedItem(key);
  input?.focus();
  input?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function renderDeviceReview() {
  const applicable = fields.filter((key) => key !== "bateria" || !["Desktop", "Monitor"].includes(state.equipmentType));
  const missing = applicable.filter((key) => !hasUsefulValue(state.info[key]));
  const panel = qs("deviceReview");
  panel.classList.toggle("hidden", !missing.length || state.deviceReading === "pending");
  panel.innerHTML = missing.length ? `<div><strong>Dados para conferir</strong><span>${missing.map((key) => escapeHtml(labels[key])).join(", ")} ${missing.length === 1 ? "não identificado" : "não identificados"}.</span></div><button type="button" data-edit-device="${missing[0]}">Revisar dados</button>` : "";
  qs("deviceRead").querySelectorAll(".device-spec").forEach((item) => {
    const key = applicable.find((name) => item.classList.contains(`spec-${name}`));
    item.classList.toggle("needs-review", Boolean(key && missing.includes(key)));
  });
}

function renderAppInfo() {
  const info = state.appInfo || {};
  qs("appInstalledVersion").textContent = info.version ? info.version.replace(/-preview$/, "") : "Não informada pelo inicializador";
  const date = new Date(info.versionRecordedAt || "");
  qs("appVersionRecorded").textContent = Number.isNaN(date.getTime()) ? "Data não disponível nesta instalação" : date.toLocaleString("pt-BR");
}

async function checkAppUpdates() {
  const button = qs("checkAppUpdates");
  if (button.disabled) return;
  setButtonBusy(button, true, "Consultando...");
  qs("appUpdateResult").textContent = "Consultando o servidor de atualização...";
  try {
    const data = await api("/api/update-status");
    if (!data.ok || !data.latestVersion) throw new Error(data.message || "O servidor não informou uma versão disponível.");
    qs("appLatestVersion").textContent = String(data.latestVersion);
    const current = String(state.appInfo?.version || "").replace(/-preview$/, "");
    const latest = String(data.latestVersion);
    const comparable = /^\d+(?:\.\d+)+$/.test(current) && /^\d+(?:\.\d+)+$/.test(latest);
    qs("appUpdateResult").textContent = current === latest ? "Esta instalação está na versão disponível no servidor." : !comparable ? "Versão disponível consultada. Não foi possível comparar com a instalação local." : current.localeCompare(latest, undefined, { numeric: true }) < 0 ? "Há uma versão mais recente. Feche e abra o aplicativo pelo executável para executar a atualização." : "A versão local é mais recente que a disponível no servidor.";
  } catch (error) {
    qs("appLatestVersion").textContent = "Consulta não concluída";
    qs("appUpdateResult").textContent = `Não foi possível verificar: ${error.message}. Tente novamente quando o servidor estiver disponível.`;
  } finally {
    qs("appLastChecked").textContent = new Date().toLocaleString("pt-BR");
    setButtonBusy(button, false);
  }
}

function hasUsefulValue(value) {
  const text = String(value || "").trim();
  return Boolean(text && !/^(?:N\/?A|NA|NÃO IDENTIFICAD[AO]|NAO IDENTIFICAD[AO]|UNKNOWN|DESCONHECID[AO]|INDEFINID[AO])$/i.test(text));
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
  const obsRequired = window.CAIJ_OBSERVATION.requiresDetail(state.grade);
  const labelReady = hasUsefulValue(state.info.modelo) && hasUsefulValue(state.info.serial) &&
    (!obsRequired || qs("obs").value.trim()) &&
    window.CAIJ_OBSERVATION.fitsLabel(observationText("labelServiceChecklist", "obs", true));
  const readComplete = infoCount === fields.length;
  const testsComplete = validTestSignature();

  qs("equipmentSummaryText").textContent = `${infoCount} de ${fields.length} informações identificadas`;
  qs("homeTestProgress").textContent = `${testsDone} de ${testValues.length} checklists preenchidos`;
  document.querySelectorAll("[data-home-test]").forEach((row) => {
    const result = state.tests[row.dataset.homeTest] || "pending";
    row.dataset.result = result;
    row.querySelector("strong").textContent = window.CAIJ_TEST_CHECKLIST.resultLabels[result];
    if (row.dataset.homeTest === "trackpad") row.querySelector("span").textContent = isWindowsPreview ? "Mouse / touchpad" : "Trackpad";
  });
  setWorkflowStep("workflowRead", "workflowReadStatus", `${infoCount} de ${fields.length} identificadas`, readComplete ? "complete" : "warning");
  const confirmedWithRemarks = testsComplete && state.testSignature.mode === "REGISTRADO";
  const testsWorkflowText = testsComplete ? confirmedWithRemarks ? "Confirmado com ressalvas" : "Checklist confirmado" : testsFailed ? `${testsFailed} com falha` : `${testsDone} de ${testValues.length} preenchidos`;
  setWorkflowStep("workflowTests", "workflowTestsStatus", testsWorkflowText, testsFailed ? "failed" : testsComplete && !confirmedWithRemarks ? "complete" : "warning");
  setWorkflowStep("workflowOs", "workflowOsStatus", osReady ? `${osLabel} conferido` : osLabel, osReady ? "complete" : "warning");
  setWorkflowStep("workflowLabel", "workflowLabelStatus", labelReady ? "Pronta para revisar" : "Informações pendentes", labelReady ? "complete" : "warning");
  if (isWindowsPreview) {
    qs("workflowReadStatus").textContent = readComplete ? "Concluída" : "Revisar dados";
    qs("workflowTestsStatus").textContent = testsComplete ? testsWorkflowText : testsFailed ? `${testsFailed} com falha` : testsDone === testValues.length ? "Confirmar checklist" : "Preencher checklist";
    qs("workflowOsStatus").textContent = osReady ? "Conferido" : "Conferir";
  }

  const completed = [readComplete, testsComplete, osReady, labelReady].filter(Boolean).length;
  const pendingSteps = 4 - completed;
  qs("workflowOverall").textContent = `${completed} de 4 etapas`;
  qs("workflowOverall").title = pendingSteps ? `${pendingSteps} ${pendingSteps === 1 ? "etapa pendente" : "etapas pendentes"}` : "Fluxo pronto para finalizar";

  let next = { action: "labels", title: "Preparar etiqueta", description: "Confira a prévia antes de imprimir.", button: "Abrir etiquetas" };
  if (!readComplete) next = { action: "edit", title: "Completar informações", description: `${fields.length - infoCount} ${fields.length - infoCount === 1 ? "campo ainda precisa" : "campos ainda precisam"} de revisão.`, button: "Revisar dados" };
  else if (!testsComplete) next = { action: "tests", title: testsFailed ? "Revisar testes" : testsDone === testValues.length ? "Confirmar checklist" : "Executar testes", description: testsFailed ? "Confira os itens reprovados e registre as justificativas." : testsDone === testValues.length ? "O técnico precisa confirmar o relatório." : `${testValues.length - testsDone} ${testValues.length - testsDone === 1 ? "checklist ainda está pendente" : "checklists ainda estão pendentes"}.`, button: "Abrir testes" };
  else if (!osReady) next = { action: "create-os", title: "Revisar rastreador", description: osNumber ? `Confira os dados de ${osLabel} no AlterTag antes de continuar.` : "Selecione ou cadastre o rastreador deste equipamento.", button: "Abrir cadastro" };
  qs("nextActionTitle").textContent = next.title;
  qs("nextActionDescription").textContent = next.description;
  qs("nextActionButton").textContent = next.button;
  qs("nextActionButton").dataset.workflowAction = next.action;

  const alerts = [];
  const serialDivergent = hasSerialDivergence();
  if (!state.environment.internetOnline) alerts.push("Equipamento sem conexão com a internet.");
  if (!state.environment.serverOnline) alerts.push("Conexão com o servidor CAIJ não confirmada. Verifique a conexão antes de cadastrar ou imprimir.");
  if (serialDivergent) alerts.push(`Equipamento: ${state.info.serial || "não informado"} • Rastreador: ${state.osDetail.serial || "não informado"}`);
  if (testsFailed) alerts.push(`${testsFailed} teste${testsFailed > 1 ? "s" : ""} marcado${testsFailed > 1 ? "s" : ""} com falha.`);
  if (state.operationalError) alerts.push(state.operationalError);
  const uniqueAlerts = [...new Set(alerts)];
  qs("operationalAlerts").classList.toggle("hidden", uniqueAlerts.length === 0);
  qs("operationalAlertTitle").textContent = serialDivergent ? "Serial divergente" : "Revisão necessária";
  qs("reviewSerialDivergence").classList.toggle("hidden", !serialDivergent);
  qs("operationalAlertsList").innerHTML = uniqueAlerts.map((alert) => `<li>${escapeHtml(alert)}</li>`).join("");

  const last = state.lastPrint;
  qs("lastPrintValue").textContent = last ? (last.os === "Sem OS" ? "Sem rastreador" : (last.os || "Sem rastreador")) : "Nenhuma etiqueta registrada";
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
  return [...qs(containerId).querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value).filter((id) => id !== "tests" || (validTestSignature() && state.testSignature.mode === "APROVADO"));
}

function currentTestsStatus() {
  const values = Object.values(state.tests);
  if (values.includes("failed")) return "FALHOU";
  return validTestSignature() && state.testSignature.mode === "APROVADO" ? "OK" : "";
}

function observationText(containerId, noteId, label = false) {
  const targetSerial = containerId === "createServiceChecklist" ? qs("createSerial").value.trim() : String(state.info.serial || "").trim();
  const matchingSignature = validTestSignature() && targetSerial === state.testSignature.serial;
  const base = window.CAIJ_OBSERVATION.build({
    ids: checkedServices(containerId).filter((id) => id !== "tests" || matchingSignature),
    note: qs(noteId).value,
    testsStatus: matchingSignature ? currentTestsStatus() : "",
    label,
  });
  if (!label && matchingSignature) {
    return [base, window.CAIJ_TEST_CHECKLIST.buildReport(state.testSignature)].filter(Boolean).join("\n\n");
  }
  return base;
}

function renderObservationPreviews() {
  updateGradeObservationRequirements();
  const labelText = observationText("labelServiceChecklist", "obs", true);
  const labelOutput = qs("labelObservationPreview");
  labelOutput.textContent = labelText || "Nenhum serviço selecionado ou observação preenchida.";
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
  setLoadingContent(qs("osVerificationStatus"), "");
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
  setLoadingContent(qs("osVerificationStatus"), "Consultando o AlterTag...", true);
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
    setLoadingContent(qs("osVerificationStatus"), "Identificando rastreador...", true);
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
  setLoadingContent(qs("deviceModelHeading"), model || (state.deviceReading === "pending" ? "Lendo equipamento..." : "Equipamento não identificado"), state.deviceReading === "pending");
  qs("deviceSerialHeading").textContent = String(state.info.serial || "").trim() || (state.deviceReading === "pending" ? "Leitura em andamento" : "Não identificada");
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
    const windowsFields = ["modelo", "cpu", "disco", "gpu", "ram", "bateria"];
    const spanTwo = new Set(["modelo", "cpu", "gpu"]);
    read.className = "device-specs-wrap";
    read.innerHTML = `
      <div class="device-specs">
        ${windowsFields.map((key, index) => `
          <article class="device-spec spec-${key} ${spanTwo.has(key) ? "wide" : ""} ${key === "bateria" ? "full" : ""}" style="animation-delay:${index * 28}ms">
            <span>${labels[key]}</span>
            <div class="device-spec-value"><strong>${escapeHtml(hasUsefulValue(state.info[key]) ? state.info[key] : "Não identificado")}</strong>${(!hasUsefulValue(state.info[key]) || key === "ram") ? `<button type="button" class="field-review-button" data-edit-device="${key}">${key === "ram" && hasUsefulValue(state.info[key]) ? "Conferir posições / RAM soldada" : "Preencher dado"}</button>` : ""}${key === "ram" && ramDetailLines.length ? `<small class="ram-details">${ramDetailLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</small>` : ""}</div>
          </article>
        `).join("")}
      </div>
    `;
  } else {
    read.className = "device-table-wrap";
  read.innerHTML = `
    <table class="device-table">
      <thead>
        <tr><th>Informação</th><th>Valor detectado</th></tr>
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
  renderDeviceReview();
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
  if (window.CaijQrPreview) window.CaijQrPreview.render(qs("labelPreviewQr"),
    `PREVIA INFOMACHINE\nSerial: ${state.info.serial || "N/A"}\nRastreador: ${qs("includeOs").checked ? formattedOs : "NAO INCLUIDO"}`);
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
  qs("toggleLabelEditor").textContent = open ? "Fechar edição da etiqueta" : "Editar dados da etiqueta";
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
  syncTestEquipment();
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
  qs("serverLine").textContent = `Servidor: ${data.serverUrl || "não configurado"} | ${data.lastServerStatus || "não verificado"}`;
  setEnvironmentStatus(data);
  renderDevice();
  renderCurrentConfig();
  renderOperationalDashboard();
  updateGradeObservationRequirements();
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
    if (visible) setLoadingContent(panel.querySelector(".serial-os-lookup-head > strong"), title, lookup.status === "searching");
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
  internet.lastChild.textContent = internetOnline ? " Internet conectada" : " Sem internet";
  server.classList.toggle("online", serverOnline);
  server.classList.toggle("offline", !serverOnline);
  server.lastChild.textContent = serverOnline ? " Servidor online" : " Servidor não confirmado";
  state.appInfo = { ...state.appInfo, version: data.version || runtime.version || "", versionRecordedAt: data.versionRecordedAt || runtime.versionRecordedAt || "" };
  qs("versionBadge").textContent = state.appInfo.version ? `v${state.appInfo.version}` : "Versão local";
  renderAppInfo();
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
    : "Este rastreador foi criado em outra estação.";
  qs("printCreatedOs").classList.toggle("hidden", !localCreation);
  qs("dismissOsAlert").textContent = localCreation ? "Voltar ao menu" : "Entendido";
  qs("osAlert").classList.remove("hidden");
  (localCreation ? qs("printCreatedOs") : qs("dismissOsAlert")).focus();
}

function closeOsAlert() {
  qs("osAlert").classList.add("hidden");
}

async function closeTestsPanel() {
  stopActiveTest();
  if (testsOnlyMode) {
    if (!validTestSignature()) { qs("testConfirmationStatus").textContent = "Confirme o checklist antes de retornar o relatório ao InfoNotebook."; qs("testConfirmationTitle").scrollIntoView({ block: "center" }); return; }
    await copyText(testsReport());
    document.title = "CAIJ_TESTES_CONCLUIDOS";
    qs("closeTests").textContent = "Retornando...";
    qs("closeTests").disabled = true;
    return;
  }
  showAppView("home");
}

function testConfirmationData() {
  const items = state.testChecklist.map((item) => ({ ...item }));
  const mode = items.some((item) => ["failed", "untested"].includes(item.result)) ? "REGISTRADO" : "APROVADO";
  return { technician: qs("testTechnician").value.trim(), serial: String(state.info.serial || (testsOnlyMode ? qs("testEquipmentSerial").value : "") || "").trim(), items, mode, notes: qs("testGeneralNotes").value.trim() };
}

function validTestSignature() {
  return window.CAIJ_TEST_CHECKLIST.signatureMatches(state.testSignature, testConfirmationData());
}

function readTestHistory() {
  if (state.testRecords) return state.testRecords;
  try { const history = JSON.parse(localStorage.getItem("caij:hardware-test-records") || "[]"); return Array.isArray(history) ? history.filter((record) => record && Array.isArray(record.items) && record.serial && record.confirmedAt) : []; }
  catch (_) { return []; }
}

function invalidateTestConfirmation() {
  if (state.testSignature) {
    try { localStorage.removeItem("caij:hardware-test-last-confirmed"); } catch (_) {}
  }
  if (state.testSignature) {
    state.testSignature = null;
    qs("testConfirmationStatus").textContent = "O relatório mudou. Confira os resultados e confirme novamente.";
  }
  qs("testAttestation").checked = false;
  qs("testConfirmationWord").value = "";
  try { localStorage.removeItem("caij:mac-tests-observation"); localStorage.removeItem("caij:hardware-test-current"); } catch (_) {}
}

function syncTestEquipment() {
  const serial = String(state.info.serial || "").trim();
  if (serial !== state.testSessionSerial) {
    invalidateTestConfirmation();
    state.testSessionSerial = serial;
    state.testChecklist = window.CAIJ_TEST_CHECKLIST.createChecklist({ usbPorts: ["USB 1", "USB 2"] });
    state.keyboardPressed = null;
    Object.keys(state.tests).forEach((key) => state.tests[key] = "pending");
    stopActiveTest();
    qs("testGeneralNotes").value = "";
    // Only restore the explicitly confirmed current session for this exact equipment.
    try {
      const record = JSON.parse(localStorage.getItem("caij:hardware-test-last-confirmed") || "null");
      if (record?.serial === serial && window.CAIJ_TEST_CHECKLIST.validateConfirmation(record).ok && window.CAIJ_TEST_CHECKLIST.signatureMatches(record, record)) {
        state.testChecklist = record.items;
        qs("testTechnician").value = record.technician;
        qs("testGeneralNotes").value = record.notes || "";
        state.testSignature = record;
      }
    } catch (_) {}
  }
  qs("testEquipmentSerial").value = serial;
  renderTests();
}

function deriveChecklistResults() {
  for (const test of testSequence) {
    const values = state.testChecklist.filter((item) => item.testId === test).map((item) => item.result);
    state.tests[test] = values.includes("pending") || !values.length ? "pending" : values.includes("failed") ? "failed" : values.includes("untested") ? "untested" : values.every((value) => value === "not_applicable") ? "not_applicable" : "passed";
  }
}

function renderHardwareChecklist() {
  const test = state.activeTest;
  qs("hardwareChecklistItems").innerHTML = state.testChecklist.filter((item) => item.testId === test).map((item) => {
    const exception = ["failed", "untested"].includes(item.result);
    const identity = item.id.startsWith("usb.port-") ? `<label>Identificação da porta<input data-check-label="${item.id}" maxlength="80" value="${escapeHtml(item.label)}" aria-label="Nome da porta ${escapeHtml(item.label)}"></label>` : `<span class="hardware-check-label">${escapeHtml(item.label)}</span>`;
    const resultButton = (result, text) => `<button type="button" class="check-result-button check-result-${result}" data-check-result="${item.id}" data-check-value="${result}" aria-pressed="${item.result === result}">${text || escapeHtml(window.CAIJ_TEST_CHECKLIST.resultLabels[result])}</button>`;
    const choices = `<fieldset class="check-result-options"><legend>Resultado: ${escapeHtml(item.label)}</legend><div class="check-result-main">${resultButton("passed", '<span aria-hidden="true">✓</span> Aprovado')}${resultButton("failed", '<span aria-hidden="true">×</span> Reprovado')}</div><div class="check-result-exceptions">${resultButton("not_applicable")}${resultButton("untested")}${resultButton("pending", "Limpar")}</div></fieldset>`;
    const requiresEvidence = ["audio.speakers", "trackpad.movement", "trackpad.buttons"].includes(item.id);
    const evidenceView = requiresEvidence ? `<p>Evidência: ${escapeHtml(item.evidence?.detail || "aguardando detecção")}</p><button type="button" data-evidence-manual="${item.id}">Confirmar manualmente com justificativa</button>` : "";
    return `<article class="hardware-check-item" data-result="${item.result}">${identity}${evidenceView}${choices}<label class="hardware-check-note" for="note-${item.id}">${exception ? "Justificativa obrigatória" : "Detalhe da verificação (opcional)"}<input id="note-${item.id}" data-check-note="${item.id}" maxlength="500" value="${escapeHtml(item.notes)}"${exception ? " required" : ""} placeholder="Descreva o comportamento observado ou o motivo da exceção"></label></article>`;
  }).join("");
  qs("usbPortTools").classList.toggle("hidden", test !== "usb");
  qs("hardwareChecklistStatus").textContent = ["usb", "charger", "network", "hdmi"].includes(test)
    ? "Conecte o acessório e verifique o funcionamento. Registre manualmente o resultado de cada item; esta etapa não faz detecção automática." : "Registre o resultado de cada item e use os botões acima para avançar.";
}

function renderTestConfirmation() {
  const data = testConfirmationData();
  const validation = window.CAIJ_TEST_CHECKLIST.validateConfirmation(data);
  const signed = validTestSignature();
  qs("testConfirmationInstruction").textContent = data.mode === "REGISTRADO"
    ? "Há item reprovado ou não testado. Digite REGISTRADO para confirmar o relatório com essas ressalvas."
    : "Digite APROVADO para confirmar os itens aplicáveis. Os itens marcados Não se aplica continuarão identificados no relatório.";
  qs("testConfirmationWord").placeholder = data.mode;
  qs("confirmHardwareTests").disabled = state.testConfirmationSaving || !validation.ok || !qs("testAttestation").checked || qs("testConfirmationWord").value !== data.mode || signed;
  if (signed) qs("testConfirmationStatus").textContent = `Confirmado por ${state.testSignature.technician} em ${new Date(state.testSignature.confirmedAt).toLocaleString("pt-BR")}. ${state.testRecordsDurable ? "Relatório salvo neste computador." : "Disponível nesta sessão. Copie o relatório antes de fechar."} O relatório será incluído na observação ao cadastrar o rastreador desta serial.`;
  else if (!validation.ok) qs("testConfirmationStatus").textContent = validation.errors[0];
  else qs("testConfirmationStatus").textContent = "Checklist preenchido. Revise os resultados, marque a declaração e digite a palavra indicada para confirmar.";
  qs("testConfirmationHistory").innerHTML = readTestHistory().slice(0, 20).map((record, index) => `<li><button type="button" class="secondary" data-copy-test-record="${index}">${escapeHtml(record.serial)} · ${escapeHtml(record.technician)} · ${escapeHtml(record.mode)} · ${escapeHtml(new Date(record.confirmedAt).toLocaleString("pt-BR"))} — copiar relatório</button></li>`).join("") || "<li>Nenhum relatório local confirmado.</li>";
}

async function loadTestRecords() {
  if (testsOnlyMode && window.location.protocol === "file:") return;
  try {
    const data = await api("/api/test-records");
    if (data.ok && Array.isArray(data.records)) { state.testRecords = data.records.filter((record) => record && Array.isArray(record.items) && record.serial && record.confirmedAt).sort((a, b) => String(b.confirmedAt).localeCompare(String(a.confirmedAt))); state.testRecordsDurable = true; renderTestConfirmation(); }
  } catch (_) { /* The standalone browser can still return a confirmed report to the native app. */ }
}

async function confirmHardwareTests() {
  if (state.testConfirmationSaving) return;
  const data = testConfirmationData();
  const validation = window.CAIJ_TEST_CHECKLIST.validateConfirmation(data);
  if (!validation.ok || !qs("testAttestation").checked || qs("testConfirmationWord").value !== data.mode) {
    qs("testConfirmationStatus").textContent = validation.errors[0] || "Marque a declaração e digite a palavra exatamente como indicada.";
    return;
  }
  const record = { ...data, confirmedAt: new Date().toISOString(), fingerprint: window.CAIJ_TEST_CHECKLIST.fingerprint(data) };
  const history = [record, ...readTestHistory()].slice(0, 100);
  state.testConfirmationSaving = true;
  qs("confirmHardwareTests").disabled = true;
  let durable = false;
  if (!(testsOnlyMode && window.location.protocol === "file:")) {
    try {
      const saved = await api("/api/test-records", record);
      if (!saved.ok || !saved.record) throw new Error(saved.message || "Não foi possível gravar o relatório local.");
      durable = true;
    } catch (error) {
      state.testConfirmationSaving = false;
      qs("testConfirmationStatus").textContent = `A confirmação não foi salva: ${error.message}. Tente novamente.`;
      renderTestConfirmation();
      qs("testConfirmationStatus").textContent = `A confirmação não foi salva: ${error.message}. Tente novamente.`;
      return;
    }
  }
  try {
    localStorage.setItem("caij:hardware-test-records", JSON.stringify(history));
    localStorage.setItem("caij:hardware-test-last-confirmed", JSON.stringify(record));
    localStorage.setItem("caij:mac-tests-observation", window.CAIJ_TEST_CHECKLIST.buildReport(record));
  } catch (_) {
    if (!durable) { state.testConfirmationSaving = false; qs("testConfirmationStatus").textContent = "Não foi possível salvar o registro nesta sessão. Libere armazenamento e tente novamente."; return; }
  }
  state.testConfirmationSaving = false;
  state.testRecords = history;
  state.testRecordsDurable = durable;
  state.testSignature = record;
  renderTests();
}

function testsOverall() {
  const values = Object.values(state.tests);
  return values.includes("failed") ? "FALHOU" : values.includes("pending") ? "PENDENTE" : !validTestSignature() ? "AGUARDANDO CONFIRMAÇÃO" : values.includes("untested") ? "COM RESSALVAS" : "OK";
}

function testsReport() {
  if (validTestSignature()) return window.CAIJ_TEST_CHECKLIST.buildReport(state.testSignature);
  return window.CAIJ_TEST_CHECKLIST.buildReport(testConfirmationData());
}

function testsLabelSummary() {
  return `TESTES: ${testsOverall()}`;
}

function syncCompletedTestsToRecord(pending) {
  const confirmed = validTestSignature();
  const approved = confirmed && state.testSignature.mode === "APROVADO";
  document.querySelectorAll('#labelServiceChecklist input[value="tests"], #createServiceChecklist input[value="tests"]').forEach((input) => {
    input.checked = approved;
    input.disabled = true;
    input.title = approved ? "Aprovação confirmada pelo técnico no checklist." : "Preencha o checklist e confirme o relatório para registrar aprovação.";
  });
  if (pending > 0 || !confirmed) {
    qs("finishTests").classList.add("hidden");
    qs("testsActionStatus").textContent = "Aguardando checklist e confirmação do técnico.";
    renderObservationPreviews();
    return;
  }
  qs("finishTests").classList.remove("hidden");
  qs("testsActionStatus").textContent = "Relatório confirmado. Ele será enviado ao AlterTag ao cadastrar o rastreador desta serial.";
  renderObservationPreviews();
}

function renderTests() {
  deriveChecklistResults();
  if (state.testSignature && !validTestSignature()) invalidateTestConfirmation();
  const values = Object.values(state.tests);
  const passed = values.filter((value) => value === "passed").length;
  const failed = values.filter((value) => value === "failed").length;
  const pending = values.filter((value) => value === "pending").length;
  const done = values.length - pending;
  const completion = Math.round((done / values.length) * 100);
  qs("testsPassed").textContent = passed;
  qs("testsFailed").textContent = failed;
  qs("testsPending").textContent = pending;
  qs("testsCompletion").textContent = `${done} de ${values.length} checklists preenchidos`;
  qs("testsProgress").style.width = `${completion}%`;
  qs("testsReport").textContent = `${done} de ${values.length} checklists preenchidos`;
  qs("testsReportDetails").innerHTML = Object.entries(state.tests).map(([key, result]) =>
    `<li data-result="${result}"><span>${escapeHtml(testLabels[key])}</span><strong>${escapeHtml(window.CAIJ_TEST_CHECKLIST.resultLabels[result])}</strong></li>`
  ).join("");
  qs("testList").querySelectorAll(".test-row").forEach((row) => {
    const status = state.tests[row.dataset.test];
    const previousStatus = row.dataset.renderedStatus || "";
    row.classList.remove("passed", "failed", "not_applicable", "untested");
    if (status !== "pending") row.classList.add(status);
    row.dataset.renderedStatus = status;
    if (previousStatus && previousStatus !== status) {
      row.classList.remove("status-changed");
      void row.offsetWidth;
      row.classList.add("status-changed");
    }
    row.querySelector(".test-state").textContent = window.CAIJ_TEST_CHECKLIST.resultLabels[status];
    row.querySelectorAll("button[data-action]").forEach((button) => {
      const selected = (button.dataset.action === "pass" && status === "passed") || (button.dataset.action === "fail" && status === "failed");
      button.classList.toggle("selected", selected);
      if (button.dataset.action === "pass" || button.dataset.action === "fail") button.setAttribute("aria-pressed", String(selected));
    });
  });
  syncCompletedTestsToRecord(pending);
  renderTestConfirmation();
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
  state.keyboardCaptureCleanup?.();
  state.keyboardCaptureCleanup = null;
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
  qs("passAndNextTest").textContent = isLastTest ? "Aprovado e revisar" : "Aprovado e próximo";
  qs("failAndNextTest").textContent = isLastTest ? "Reprovado e revisar" : "Reprovado e próximo";
  const remaining = testSequence.slice(currentIndex + 1).filter((test) => state.tests[test] === "pending").length;
  qs("testSequenceRemaining").textContent = remaining ? `${remaining} ${remaining === 1 ? "teste pendente a seguir" : "testes pendentes a seguir"}` : isLastTest ? "Última etapa da sequência" : "Nenhum teste pendente a seguir";
  qs("testSequenceList").innerHTML = testSequence.map((test, index) => {
    const result = state.tests[test];
    const current = test === state.activeTest;
    const status = current ? "Em andamento" : result !== "pending" ? window.CAIJ_TEST_CHECKLIST.resultLabels[result] : index < currentIndex ? "Pendente" : "A seguir";
    return `<li data-result="${result}"${current ? ' aria-current="step"' : ""}><button type="button" data-sequence-test="${test}"><span class="sequence-position" aria-hidden="true">${index + 1}</span><span class="sequence-copy"><strong>${escapeHtml(testLabels[test])}</strong><span>${status}</span></span></button></li>`;
  }).join("");
}

async function completeActiveTest(result) {
  const currentTest = state.activeTest;
  const currentIndex = testSequence.indexOf(currentTest);
  if (currentIndex < 0) return;
  const items = state.testChecklist.filter((item) => item.testId === currentTest);
  const missingDetail = items.some((item) => ["failed", "untested"].includes(item.result) && !item.notes.trim());
  if (result !== "pending" && (items.some((item) => item.result === "pending") || missingDetail || (result === "passed" && items.some((item) => ["failed", "untested"].includes(item.result))) || (result === "failed" && !items.some((item) => item.result === "failed")))) {
    closeScreenTest();
    qs("hardwareChecklistStatus").textContent = "Registre cada resultado e justifique as exceções no checklist. Se um item não foi verificado, marque Não testado. Use Pular etapa apenas para avançar sem concluir este teste.";
    qs("hardwareChecklist").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
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
    return Promise.reject(new Error("Abra o InfoNotebook pelo inicializador deste computador para usar a câmera e o microfone."));
  }
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia;
  if (legacy) {
    return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
  }
  return Promise.reject(new Error("Abra o InfoNotebook pelo inicializador para usar a câmera e o microfone."));
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
      setStatus("Abrindo os testes neste computador...", "ok");
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
  qs("activeTestBody").innerHTML = `<div class="test-permission-error"><strong>Não foi possível iniciar o teste.</strong><span>${escapeHtml(message)}</span><small>${escapeHtml(permissionHelp)}</small></div>`;
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
    qs("activeTestBody").innerHTML = '<div class="camera-permission-idle"><span aria-hidden="true">○</span><div><strong>Câmera não ativada</strong><small>Encerre este teste e escolha Abrir teste para autorizar a câmera.</small></div></div>';
    return;
  }
  qs("activeTestBody").innerHTML = '<div class="camera-stage"><video id="cameraPreview" autoplay muted playsinline></video><span>Imagem ao vivo</span></div>';
  try {
    state.mediaStream = await requestUserMediaWithStartupRetry({ video: true, audio: false });
    qs("cameraPreview").srcObject = state.mediaStream;
  } catch (err) {
    testError(err.message || "Não foi possível ativar a câmera. Confira a permissão e tente novamente.");
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
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (physicalKeys[event.code]) return physicalKeys[event.code];
  const aliases = { " ": "SPACE", ESCAPE: "ESC", CMD: "META", OS: "META", DEAD: "'" };
  return aliases[String(event.key || "").toUpperCase()] || String(event.key || "").toUpperCase();
}

function listenForMouseButtons(target, onButton, allowedButtons = [0, 1, 2]) {
  let lastButton = -1;
  let lastTime = 0;
  let lastPhysicalRight = 0;
  const record = (event, button) => {
    if (!allowedButtons.includes(button)) return;
    if (event.type === "click" && event.detail === 0) return;
    if (event.type === "contextmenu" && Date.now() - lastPhysicalRight > 500) return;
    if ((event.type === "pointerdown" || event.type === "mousedown") && button === 2) lastPhysicalRight = Date.now();
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
  state.keyboardCaptureCleanup?.();
  state.keyboardCaptureCleanup = null;
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
  qs("activeTestBody").innerHTML = `<div class="keyboard-progress"><div><span>Teclas reconhecidas</span><small>${keyboardHelp}</small>${isWindowsPreview ? '<small id="keyboardLastEvent" aria-live="polite">Última tecla: aguardando</small><small id="keyboardLastPointer" aria-live="polite">Último clique: aguardando</small>' : ""}</div><strong id="keyboardCount">0 / ${totalKeys}</strong></div><div class="keyboard-capture-controls"><button type="button" class="secondary" id="focusKeyboardCapture">Focar área do teclado</button><p id="keyboardCaptureStatus" role="status"></p></div>${keyboardMarkup}`;
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
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
    const control = event.target?.closest?.('button, a, [role="button"]');
    const manualConfirm = event.target?.dataset?.manualConfirm === "true";
    if (control && (event.key === "Tab" || (!manualConfirm && ["Enter", " "].includes(event.key)))) return;
    if (manualConfirm && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.type === "keydown" && !event.repeat) confirmKey(event.target.dataset.key);
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
        if (key === "ESC") qs("focusKeyboardCapture")?.focus({ preventScroll: true });
      }
    }
  };
  qs("activeTestBody").querySelectorAll('kbd[data-manual-confirm="true"]').forEach((item) => {
    item.addEventListener("click", () => confirmKey(item.dataset.key));
  });
  const keyboardMap = qs("activeTestBody").querySelector(".keyboard-map");
  keyboardMap.tabIndex = 0;
  keyboardMap.setAttribute("aria-label", isWindowsPreview ? "Área de teste do teclado Windows" : "Área de teste do teclado Mac");
  keyboardMap.setAttribute("aria-describedby", "keyboardCaptureStatus");
  const captureStatus = () => {
    const message = !document.hasFocus() ? "Janela sem foco. Volte ao aplicativo para continuar; o progresso foi mantido."
      : document.activeElement?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]') ? "Captura pausada durante a edição. Clique em Focar área do teclado para continuar o teste."
      : "Captura ativa. Clique no mapa para testar Tab, Enter e espaço. Pressione Esc para voltar aos controles. Fn e atalhos do sistema podem exigir conferência manual.";
    qs("keyboardCaptureStatus").textContent = message;
  };
  const focusMap = () => { keyboardMap.focus({ preventScroll: true }); captureStatus(); };
  const clearActiveKeys = () => {
    keyboardMap.querySelectorAll(".active-key").forEach((key) => { key.classList.remove("active-key"); key.classList.toggle("pressed", pressed.has(key.dataset.key)); });
    captureStatus();
  };
  const onFocusIn = () => {
    if (document.activeElement?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) clearActiveKeys();
    else captureStatus();
  };
  const onVisibilityChange = () => { if (document.hidden) clearActiveKeys(); else captureStatus(); };
  const onMapClick = (event) => { if (!event.target.closest('[data-manual-confirm="true"]')) focusMap(); };
  qs("focusKeyboardCapture").addEventListener("click", focusMap);
  keyboardMap.addEventListener("click", onMapClick);
  window.addEventListener("blur", clearActiveKeys);
  window.addEventListener("focus", captureStatus);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("visibilitychange", onVisibilityChange);
  state.keyboardCaptureCleanup = () => {
    window.removeEventListener("blur", clearActiveKeys);
    window.removeEventListener("focus", captureStatus);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
  const touchpadButtons = keyboardMap?.querySelector(".windows-touchpad");
  if (keyboardMap && touchpadButtons) {
    state.mouseButtonCleanup = listenForMouseButtons(keyboardMap, (button, event) => {
      if (event.target?.closest?.("kbd")) return;
      touchpadButtons.querySelector(`[data-mouse-button="${button}"]`)?.classList.add("pressed");
    qs("keyboardLastPointer").textContent = `Último clique: ${["esquerdo", "do meio", "direito"][button]} detectado`;
    });
  }
  document.addEventListener("keydown", state.keyboardHandler, true);
  document.addEventListener("keyup", state.keyboardHandler, true);
  focusMap();
}

function refreshKeyboardLayoutForDevice() {
  if (!isWindowsPreview || state.activeTest !== "keyboard" || !state.keyboardHandler) return;
  const isE14Keyboard = /\bE14\b/i.test(state.info?.modelo || "");
  if (isE14Keyboard !== state.keyboardLayoutE14) openKeyboardTest();
}

async function playTestTone(volume = 50, pan = 0) {
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
  const panner = context.createStereoPanner();
  panner.pan.value = pan;
  oscillator.connect(gain).connect(panner).connect(context.destination);
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
    qs("micStatus").textContent = "Microfone ativo. Fale e observe o nível no medidor.";
  } catch (err) {
    testError(err.message || "Não foi possível ativar o microfone. Confira a permissão e tente novamente.");
  }
}

function openAudioTest() {
  const speaker = state.testChecklist.find((item) => item.id === "audio.speakers");
  const played = new Set(speaker?.evidence?.source === "auto" ? ["esquerdo", "direito"] : []);
  qs("activeTestBody").innerHTML = `<div class="audio-stage">
    <section class="audio-card" aria-label="Teste dos alto-falantes">
      <div class="audio-card-head"><div><span>01 · SAÍDA DE SOM</span><h4>Ouça o tom de teste</h4><p>Ajuste o volume deste teste e confirme os alto-falantes.</p></div><div class="audio-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>
      <div class="audio-volume-control"><button type="button" id="volumeDown" aria-label="Diminuir volume do teste">−</button><input id="testVolume" type="range" min="0" max="100" step="10" value="50" aria-label="Volume do tom de teste"><button type="button" id="volumeUp" aria-label="Aumentar volume do teste">+</button><output id="testVolumeValue" for="testVolume">50%</output></div>
      <button type="button" class="audio-play" id="playToneLeft">Reproduzir lado esquerdo</button><button type="button" class="audio-play" id="playToneRight">Reproduzir lado direito</button><p id="toneStatus" aria-live="polite">Reproduza o tom nos dois lados e confirme o que ouviu no checklist.</p>
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
  const playSide = async (side, pan) => {
    const button = qs(pan < 0 ? "playToneLeft" : "playToneRight");
    button.disabled = true;
    button.closest(".audio-card").classList.add("playing");
    try {
      if (Number(volume.value) <= 0) throw new Error("Aumente o volume do teste antes de reproduzir o tom.");
      await playTestTone(Number(volume.value), pan);
      played.add(side);
      qs("toneStatus").textContent = played.size === 2 ? "Tom reproduzido nos lados esquerdo e direito. Confirme o que ouviu no checklist." : `Tom reproduzido no lado ${side}. Teste o outro lado.`;
      if (played.size === 2 && speaker) {
        speaker.evidence = { source: "auto", detail: "Tom reproduzido nos lados esquerdo e direito", at: new Date().toISOString() };
        invalidateTestConfirmation();
        renderHardwareChecklist();
      }
    }
    catch (err) { testError(err.message || "Não foi possível reproduzir o som."); }
    finally { button.disabled = false; button.closest(".audio-card")?.classList.remove("playing"); }
  };
  qs("playToneLeft").addEventListener("click", () => playSide("esquerdo", -1));
  qs("playToneRight").addEventListener("click", () => playSide("direito", 1));
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
  qs("activeTestBody").innerHTML = '<div class="trackpad-stats" aria-label="Leituras do mouse"><span><small>Movimento</small><strong id="trackMoves">0</strong></span><span><small>Clique esquerdo</small><strong id="trackLeft">0</strong></span><span><small>Clique do meio</small><strong id="trackMiddle">0</strong></span><span><small>Clique direito</small><strong id="trackRight">0</strong></span><span><small>Rolagem</small><strong id="trackScrolls">0</strong></span></div><div class="trackpad-zone" id="trackpadZone"><i id="trackPointer"></i><div class="trackpad-guide" aria-hidden="true"><span>ÁREA DE TESTE</span><strong>Explore toda a superfície</strong><small>Mova o ponteiro, clique e role dentro desta área.</small><div class="trackpad-gesture-guide"><span>1 · Clique esquerdo</span><span>2 · Clique do meio</span><span>3 · Clique direito</span><span>4 · Rolagem</span></div></div></div><p id="trackLastPointer" aria-live="polite">Último clique: aguardando. Clique em qualquer ponto da área deste teste.</p>';
  const zone = qs("trackpadZone");
  const pointer = qs("trackPointer");
  let moves = 0;
  let scrolls = 0;
  const clicks = [0, 0, 0];
  const clickIds = ["trackLeft", "trackMiddle", "trackRight"];
  const recordEvidence = (id, detail) => {
    const item = state.testChecklist.find((entry) => entry.id === id);
    if (!item || item.evidence?.source === "auto") return;
    invalidateTestConfirmation();
    item.evidence = { source: "auto", detail, at: new Date().toISOString() };
    renderHardwareChecklist();
    renderTests();
  };
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
    if (moves >= 20) recordEvidence("trackpad.movement", `${moves} movimentos detectados na área de teste`);
  });
  state.mouseButtonCleanup = listenForMouseButtons(qs("activeTestBody"), (button) => {
    updateMetric(clickIds[button], ++clicks[button]);
    qs("trackLastPointer").textContent = `Último clique: ${["esquerdo", "do meio", "direito"][button]} detectado`;
    if (clicks[0] && clicks[2]) recordEvidence("trackpad.buttons", `Cliques detectados: esquerdo ${clicks[0]}, direito ${clicks[2]}`);
  });
  zone.addEventListener("wheel", (event) => { event.preventDefault(); updateMetric("trackScrolls", ++scrolls); }, { passive: false });
}

async function openTest(test) {
  stopActiveTest();
  state.activeTest = test;
  qs("testWorkspace").classList.remove("hidden");
  qs("activeTestTitle").textContent = testLabels[test];
  const helps = {
    camera: "Autorize a câmera e confira a nitidez, o enquadramento e a estabilidade da imagem.",
    keyboard: isWindowsPreview
      ? "Pressione todas as teclas. Em alguns notebooks, use Fn + F1, Fn + F2 etc. para testar as teclas de função."
      : "Pressione as teclas. No Mac, use Fn + F1, Fn + F2 etc. para testar as teclas de função.",
    audio: "Ouça o tom de teste e confira se os alto-falantes funcionam sem distorção.",
    screen: "Alterne entre branco e preto. Confira se há pontos luminosos, linhas ou manchas na tela.",
    trackpad: isWindowsPreview
      ? "Mova o mouse ou use toda a superfície do touchpad, clique e faça rolagem."
      : "Use toda a superfície do trackpad, clique e faça rolagem.",
  };
  qs("activeTestHelp").textContent = helps[test] || "Conecte o acessório, faça a verificação física e registre cada resultado no checklist.";
  renderHardwareChecklist();
  renderActiveTestNavigation();
  if (test === "camera") await openCameraTest();
  if (test === "keyboard") openKeyboardTest();
  if (test === "audio") openAudioTest();
  if (test === "screen") openScreenTest();
  if (test === "trackpad") openTrackpadTest();
  if (["usb", "charger", "network", "hdmi"].includes(test)) qs("activeTestBody").innerHTML = `<div class="connector-test-guide"><strong>${escapeHtml(testLabels[test])}</strong><p>${escapeHtml({ usb: "Use um dispositivo USB conhecido em cada porta. Confira reconhecimento e uso; diferencie USB-A, USB-C e posição. Adicione todas as portas da máquina abaixo.", charger: "Teste cada conector de carregamento disponível no equipamento. Confira se todos funcionam e se os encaixes estão firmes, sem folga.", network: "Teste Ethernet e Wi-Fi separadamente. Anote conexão, acesso à rede local e à internet. A falta de internet deve ser diferenciada de defeito no adaptador.", hdmi: "Conecte um cabo HDMI e confira se a saída funciona e mantém a imagem estável. Anote eventual falha ou adaptador utilizado." }[test])}</p></div>`;
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
  qs("testsActionStatus").textContent = "Relatório completo copiado.";
  setStatus("Relatório dos testes copiado.", "ok");
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
  state.grade = window.CAIJ_OBSERVATION.gradeCode(normalized) || "A";
  document.querySelectorAll(".grade").forEach((button) => {
    button.classList.toggle("active", button.dataset.grade === state.grade);
  });
  updateGradeObservationRequirements();
}

function updateGradeObservationRequirements() {
  const createD = window.CAIJ_OBSERVATION.gradeCode(qs("createReference").value) === "D";
  qs("createObservation").required = createD;
  qs("createObservationRequirement").textContent = createD
    ? "Obrigatório para Grade D: descreva o detalhe da máquina."
    : "Opcional";
  qs("obs").required = window.CAIJ_OBSERVATION.requiresDetail(state.grade);
  qs("labelObservationRequirement").textContent = state.grade === "D"
    ? "Obrigatório para Grade D: descreva o detalhe da máquina."
    : "Detalhes e avarias obrigatórios para grades B, C e D";
  if (qs("printBtn").getAttribute("aria-busy") !== "true") {
    qs("printBtn").disabled = state.deviceReading !== "ready" || Boolean(window.CAIJ_OBSERVATION.validateGradeDetail(state.grade, qs("obs").value));
  }
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
  qs("createConfirmSummary").textContent = state.createOs.product ? `${productLabel(state.createOs.product)} · Serial: ${qs("createSerial").value.trim() || "não informada"} · ${qs("createReference").value}` : "Selecione o produto e confira a serial antes de cadastrar.";
  const gradeError = window.CAIJ_OBSERVATION.validateGradeDetail(qs("createReference").value, qs("createObservation").value);
  const ready = state.deviceReading === 'ready' && Boolean(technician && state.createOs.product && qs("createSerial").value.trim()) && !gradeError;
  qs("submitCreateOs").disabled = !ready;
  qs("createOsStatus").textContent = gradeError || (state.createOs.product
    ? `Selecionado: ${productLabel(state.createOs.product)}`
    : "Selecione o técnico e o produto.");
  updateGradeObservationRequirements();
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
  qs("printHistorySearch").addEventListener("input", renderPrintHistory);
  qs("printHistoryList").addEventListener("click", (event) => { const button = event.target.closest("[data-review-print]"); if (button) openHistoryReview(Number(button.dataset.reviewPrint)); });
  qs("closeHistoryReview").addEventListener("click", () => qs("historyReviewDialog").close());
  qs("historyGoLabels").addEventListener("click", () => { qs("historyReviewDialog").close(); showAppView("labels"); setStatus("Confira a etiqueta atual com os dados do histórico antes de imprimir.", "warn"); });
  qs("deviceReview").addEventListener("click", (event) => { const button = event.target.closest("[data-edit-device]"); if (button) editDeviceField(button.dataset.editDevice); });
  qs("deviceRead").addEventListener("click", (event) => { const button = event.target.closest("[data-edit-device]"); if (button) editDeviceField(button.dataset.editDevice === "ram" ? "ramDetalhes" : button.dataset.editDevice); });
  qs("openAppInfo").addEventListener("click", () => { renderAppInfo(); qs("appInfoDialog").showModal(); });
  qs("closeAppInfo").addEventListener("click", () => qs("appInfoDialog").close());
  qs("checkAppUpdates").addEventListener("click", checkAppUpdates);
  qs("labelPreviewZoom").addEventListener("change", (event) => { document.querySelector(".thermal-label-stage").style.setProperty("--label-preview-width", `${Number(event.target.value) * 100}%`); });

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
      updateGradeObservationRequirements();
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
  qs("testSequenceList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sequence-test]");
    const test = button?.dataset.sequenceTest;
    if (!testSequence.includes(test) || test === state.activeTest) return;
    closeScreenTest();
    openTest(test);
  });
  qs("testList").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const test = button.closest(".test-row").dataset.test;
    const action = button.dataset.action;
    if (action === "open") return openTest(test);
    if (action === "pass" || action === "fail") return openTest(test);
    invalidateTestConfirmation();
    if (test === "keyboard") { state.keyboardPressed = null; if (state.activeTest === "keyboard") openKeyboardTest(); }
    state.testChecklist.filter((item) => item.testId === test).forEach((item) => { item.result = "pending"; item.notes = ""; delete item.evidence; });
    if (state.activeTest === test) renderHardwareChecklist();
    renderTests();
  });
  qs("resetTests").addEventListener("click", () => {
    state.keyboardPressed = null;
    invalidateTestConfirmation();
    state.testChecklist.forEach((item) => { item.result = "pending"; item.notes = ""; delete item.evidence; });
    qs("testGeneralNotes").value = "";
    Object.keys(state.tests).forEach((key) => state.tests[key] = "pending");
    stopActiveTest();
    renderTests();
  });
  qs("copyTestsReport").addEventListener("click", copyTestsReport);
  qs("finishTests").addEventListener("click", async () => {
    if (!validTestSignature()) return;
    if (testsOnlyMode) {
      const report = testsReport();
      await copyText(report);
      try { localStorage.setItem("caij:mac-tests-observation", report); } catch (_) {}
    }
    closeTestsPanel();
    setStatus("Relatório confirmado e disponível para o cadastro do rastreador.", "ok");
  });
  qs("hardwareChecklistItems").addEventListener("click", (event) => {
    const manualId = event.target.closest("[data-evidence-manual]")?.dataset.evidenceManual;
    if (manualId) {
      const item = state.testChecklist.find((entry) => entry.id === manualId);
      if (!item) return;
      const reason = window.prompt(`Por que a detecção automática de ${item.label} falhou? Descreva como verificou o funcionamento.`)?.trim();
      if (!reason) { qs("hardwareChecklistStatus").textContent = "A confirmação manual exige justificativa."; return; }
      invalidateTestConfirmation(); item.evidence = { source: "manual", detail: reason, at: new Date().toISOString() }; renderHardwareChecklist(); renderTests();
      return;
    }
    const target = event.target.closest("button[data-check-result]");
    if (!target) return;
    const id = target.dataset.checkResult;
    const item = state.testChecklist.find((entry) => entry.id === id);
    const result = target.dataset.checkValue;
    if (!item || !window.CAIJ_TEST_CHECKLIST.results.includes(result) || item.result === result) return;
    if (["audio.speakers", "trackpad.movement", "trackpad.buttons"].includes(id) && result === "passed" && !item.evidence) { qs("hardwareChecklistStatus").textContent = "Registre a detecção ou confirme manualmente com justificativa antes de aprovar."; return; }
    invalidateTestConfirmation();
    item.result = result;
    renderTests();
    renderHardwareChecklist();
    [...qs("hardwareChecklistItems").querySelectorAll("button[data-check-result]")].find((button) => button.dataset.checkResult === id && button.dataset.checkValue === result)?.focus({ preventScroll: true });
    renderActiveTestNavigation();
  });
  qs("hardwareChecklistItems").addEventListener("input", (event) => {
    const item = state.testChecklist.find((entry) => entry.id === (event.target.dataset.checkNote || event.target.dataset.checkLabel));
    if (!item) return;
    if (event.target.dataset.checkLabel) item.label = event.target.value;
    else item.notes = event.target.value;
    invalidateTestConfirmation();
    renderTests();
  });
  qs("addUsbPort").addEventListener("click", () => {
    const name = qs("usbPortName").value.trim();
    if (!name || state.testChecklist.filter((item) => item.testId === "usb").length >= 33) { qs("hardwareChecklistStatus").textContent = "Informe um nome para a porta (limite de 32 portas)."; return; }
    invalidateTestConfirmation();
    const ports = state.testChecklist.filter((item) => item.testId === "usb" && item.id !== "usb.inventory");
    state.testChecklist.push({ id: `usb.port-${ports.length + 1}`, testId: "usb", label: name, result: "pending", notes: "" });
    state.testChecklist.find((item) => item.id === "usb.inventory").result = "pending";
    qs("usbPortName").value = "";
    renderHardwareChecklist(); renderTests(); renderActiveTestNavigation();
  });
  for (const id of ["testTechnician", "testGeneralNotes", "testEquipmentSerial"]) qs(id).addEventListener("input", () => { invalidateTestConfirmation(); renderTests(); });
  for (const id of ["testAttestation", "testConfirmationWord"]) qs(id).addEventListener("input", renderTestConfirmation);
  qs("confirmHardwareTests").addEventListener("click", confirmHardwareTests);
  qs("testConfirmationHistory").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-test-record]");
    if (!button) return;
    const record = readTestHistory()[Number(button.dataset.copyTestRecord)];
    if (record) { await copyText(window.CAIJ_TEST_CHECKLIST.buildRecordReport(record)); qs("testConfirmationStatus").textContent = "Relatório histórico copiado. A conferência atual não foi alterada."; }
  });
  qs("screenColorButtons").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-color]");
    if (button) setScreenTestColor(button.dataset.color);
  });
  qs("closeScreenTest").addEventListener("click", closeScreenTest);
  qs("failScreenAndNext").addEventListener("click", () => completeActiveTest("failed"));
  qs("passScreenAndNext").addEventListener("click", () => completeActiveTest("passed"));

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
    setStatus("Confira a serial do equipamento e a serial vinculada ao rastreador.");
    await refreshOsVerification();
  });
  qs("workflowRead").parentElement.addEventListener("click", (event) => {
    const target = event.target.closest("[data-workflow-action]");
    if (target) runWorkflowAction(target.dataset.workflowAction);
  });
  qs("nextActionButton").addEventListener("click", (event) => runWorkflowAction(event.currentTarget.dataset.workflowAction));
  qs("reprintLast").addEventListener("click", () => openHistoryReview(0));
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
  qs("createObservation").addEventListener("input", () => { renderObservationPreviews(); updateCreateOsState(); });
  qs("createReference").addEventListener("change", () => { updateCreateOsState(); renderObservationPreviews(); });
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
    const button = qs("searchProducts");
    if (button.disabled) return;
    const term = qs("productSearch").value.trim();
    qs("productResults").innerHTML = "<p>Buscando produtos...</p>";
    setLoadingContent(qs("productResults").firstElementChild, "Buscando produtos...", true);
    setButtonBusy(button, true, "Buscando...");
    try {
      const data = await api("/api/products", { term });
      renderProductResults(data.produtos || []);
    } catch (err) {
      qs("productResults").innerHTML = `<p>${escapeHtml(err.message)}</p>`;
    } finally {
      setButtonBusy(button, false);
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
    const gradeError = window.CAIJ_OBSERVATION.validateGradeDetail(qs("createReference").value, qs("createObservation").value);
    if (gradeError) { qs("createOsStatus").textContent = gradeError; qs("createObservation").focus(); return; }
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
      detalheGrade: qs("createObservation").value.trim(),
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
    setLoadingContent(qs("createOsStatus"), "Criando rastreador no AlterTag...", true);
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
      setStatus(`Rastreador ${data.osCriada} criado com sucesso.`, "ok");
      void refreshOsVerification();
    } catch (err) {
      updateCreateOsState();
      qs("createOsStatus").textContent = err.message;
    } finally {
      setButtonBusy(createButton, false);
      qs("createOsStatus").classList.remove("has-bars-spinner");
      qs("createOsStatus").removeAttribute("aria-busy");
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
      detalheGrade: qs("obs").value.trim(),
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
        throw new Error("A observação ultrapassa o espaço da etiqueta: até 180 caracteres e 3 linhas. Resuma o texto antes de imprimir.");
      }
      if (window.CAIJ_OBSERVATION.requiresDetail(state.grade) && !qs("obs").value.trim()) {
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
        modelo: body.info.modelo || defaultModelName,
        serial: body.info.serial || "",
        grade: body.grade,
        snapshot: { info: { ...body.info }, obs: body.obs, detalheGrade: body.detalheGrade, includeOs: body.includeOs, osNumero: printedOs },
        tipo: body.equipmentType,
        horario: new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      });
      if (data.state) applyState(data.state);
      setPrintProgress("Servidor confirmou o envio à fila. Confira se a etiqueta saiu fisicamente.", "ok");
      showAppView("home");
      setStatus(data.syncWarning ? "Etiqueta enviada à fila de impressão. Confira a sincronização dos dados do rastreador." : "Etiqueta enviada à fila de impressão. Confira a saída física.", data.syncWarning ? "warn" : "ok");
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

function initializeAnimatedGradient() {
  const headers = [...document.querySelectorAll(".hero-strip, .page-intro")];
  headers.forEach((header) => {
    if (header.querySelector(":scope > .animated-gradient")) return;
    header.classList.add("has-animated-gradient");
    const gradient = document.createElement("div");
    gradient.className = "animated-gradient";
    gradient.setAttribute("aria-hidden", "true");
    header.appendChild(gradient);
  });
  window.CaijAnimatedGradient?.mount(headers);
}

function initializeTestChecklistUi() {
  const list = qs("testList");
  for (const [index, test] of testSequence.entries()) {
    if (list.querySelector(`[data-test="${test}"]`)) continue;
    list.insertAdjacentHTML("beforeend", `<article class="test-row" data-test="${test}"><div class="test-identity"><span class="test-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(testLabels[test])}</h3><p>Verificação física com checklist detalhado.</p></div></div><strong class="test-state">Pendente</strong><div class="test-actions"><button type="button" data-action="open">Abrir teste</button><button type="button" data-action="clear">Limpar</button></div></article>`);
  }
  list.querySelectorAll('[data-action="pass"], [data-action="fail"]').forEach((button) => button.remove());
  qs("testEquipmentSerial").readOnly = !testsOnlyMode;
  try { localStorage.removeItem("caij:mac-tests-observation"); } catch (_) {}
}

initializeTestChecklistUi();
applyPlatformUi();
initializeAnimatedGradient();
wireControls();
renderTests();
void loadTestRecords();
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
