(function (root) {
  "use strict";

  const results = Object.freeze(["passed", "failed", "not_applicable", "untested", "pending"]);
  const resultLabels = Object.freeze({ passed: "Aprovado", failed: "Reprovado", not_applicable: "Não se aplica", untested: "Não testado", pending: "Pendente" });
  const definitions = [
    ["camera", "Câmera", [["image", "Imagem nítida e estável"], ["capture", "Vídeo ao vivo sem travamentos ou interrupções"]]],
    ["keyboard", "Teclado", [["keys", "Todas as teclas foram verificadas"]]],
    ["audio", "Som", [["speakers", "Alto-falantes sem distorção"]]],
    ["screen", "Tela", [["pixels", "Sem pontos luminosos"], ["artifacts", "Sem linhas ou manchas"]]],
    ["trackpad", "Touchpad", [["movement", "Touchpad funcionando normalmente, sem travamentos"], ["buttons", "Cliques do touchpad funcionando"]]],
    ["usb", "Portas USB", [["inventory", "Conferi e listei todas as portas USB presentes"]]],
    ["charger", "Carregador", [["connectors", "Todos os conectores de carregamento foram testados?"], ["firmness", "Os conectores de carregamento estão firmes, sem folga?"]]],
    ["network", "Rede", [["ethernet", "Ethernet: conexão e acesso à rede"], ["wifi", "Wi-Fi: conexão e acesso à rede"]]],
    ["hdmi", "HDMI", [["detection", "HDMI funcionando"], ["image", "Imagem estável no HDMI"]]],
  ];
  const catalog = Object.freeze(definitions.map(([id, label, entries]) => Object.freeze({
    id, label, items: Object.freeze(entries.map(([key, text]) => Object.freeze({ id: `${id}.${key}`, testId: id, label: text }))),
  })));

  function createChecklist({ usbPorts = 2 } = {}) {
    let ports;
    if (Array.isArray(usbPorts)) {
      if (usbPorts.length > 32) throw new RangeError("Informe no máximo 32 portas USB.");
      ports = usbPorts.map((port, index) => typeof port === "object" && port !== null
        ? { id: String(port.id || `usb.port-${index + 1}`), label: String(port.label || port.name || `Porta USB ${index + 1}`) }
        : { id: `usb.port-${index + 1}`, label: String(port || `Porta USB ${index + 1}`) });
    } else {
      const count = Number(usbPorts);
      if (!Number.isInteger(count) || count < 0 || count > 32) throw new RangeError("Quantidade de portas USB deve ser um inteiro entre 0 e 32.");
      ports = Array.from({ length: count }, (_, index) => ({ id: `usb.port-${index + 1}`, label: `Porta USB ${index + 1}` }));
    }
    const items = catalog.flatMap((test) => test.id === "usb"
      ? [...test.items.map((item) => ({ ...item, result: "pending", notes: "" })), ...ports.map((port) => ({ ...port, testId: "usb", result: "pending", notes: "" }))]
      : test.items.map((item) => ({ ...item, result: "pending", notes: "" })));
    if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Os identificadores dos itens devem ser únicos.");
    return items;
  }

  function summarize(items = []) {
    const counts = Object.fromEntries(results.map((result) => [result, 0]));
    for (const item of items) if (results.includes(item.result)) counts[item.result] += 1;
    return { total: items.length, ...counts, decided: counts.passed + counts.failed + counts.not_applicable + counts.untested };
  }

  function validateConfirmation({ technician = "", serial = "", items = [], mode = "APROVADO" } = {}) {
    const errors = [];
    if (!String(technician).trim()) errors.push("Informe o nome do técnico responsável.");
    if (!String(serial).trim()) errors.push("Informe o número de série do equipamento.");
    if (!["APROVADO", "REGISTRADO"].includes(mode)) errors.push("Use APROVADO para aprovar os itens aplicáveis ou REGISTRADO para registrar ressalvas.");
    if (!Array.isArray(items) || !items.length) return { ok: false, errors: [...errors, "Inclua os itens da verificação."], summary: summarize() };
    const ids = new Set();
    const expectedGroups = new Map(catalog.flatMap((test) => test.items.map((item) => [item.id, test.id])));
    const validGroups = new Set(catalog.map((test) => test.id));
    let usbPortCount = 0;
    for (const item of items) {
      if (!item || typeof item !== "object") { errors.push("Item de verificação inválido."); continue; }
      if (!item.id || ids.has(item.id)) errors.push("Há itens sem identificador ou com identificador repetido.");
      ids.add(item.id);
      if (!String(item.label || "").trim()) errors.push("Informe o nome de cada item ou porta USB.");
      if (!validGroups.has(item.testId)) errors.push(`Grupo de teste inválido: ${item.label || item.id}.`);
      const expectedGroup = expectedGroups.get(item.id);
      if (expectedGroup && expectedGroup !== item.testId) errors.push(`O item ${item.id} pertence ao grupo ${expectedGroup}.`);
      if (!expectedGroup) {
        if (item.testId !== "usb" || !/^usb\.port-[1-9]\d*$/.test(String(item.id))) errors.push(`Critério desconhecido: ${item.id}.`);
        else usbPortCount += 1;
      }
      if (!results.includes(item.result)) errors.push(`Resultado inválido: ${item.label || item.id}.`);
      if (["failed", "untested"].includes(item.result) && !String(item.notes || "").trim()) errors.push(`Justifique o resultado de ${item.label || item.id}.`);
    }
    if (usbPortCount > 32) errors.push("Informe no máximo 32 portas USB.");
    const available = new Set(items.filter(Boolean).map((item) => item.id));
    if (catalog.some((test) => test.items.some((item) => !available.has(item.id)))) errors.push("O checklist está incompleto. Reabra os testes e confira os itens de cada etapa.");
    const summary = summarize(items.filter((item) => item && typeof item === "object"));
    if (summary.pending) errors.push("Preencha o resultado de todos os itens. Use Não testado quando a verificação não tiver sido realizada.");
    if (mode === "APROVADO" && (summary.failed || summary.untested)) errors.push("Há item reprovado ou não testado. Use REGISTRADO para confirmar o relatório com ressalvas.");
    if (mode === "APROVADO" && !summary.passed) errors.push("Uma aprovação exige ao menos um item aprovado.");
    return { ok: errors.length === 0, errors, summary };
  }

  function stable(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }

  // The exact canonical snapshot is the fingerprint: no hash collisions or cryptographic claims.
  function snapshot(data = {}) {
    return stable({ technician: data.technician, serial: data.serial, items: data.items, mode: data.mode || "APROVADO", notes: data.notes });
  }
  function fingerprint(data) { return snapshot(data); }
  function signatureMatches(signature, data) {
    return Boolean(signature && typeof signature.fingerprint === "string" && signature.fingerprint === fingerprint(data));
  }

  function buildReport(data = {}) {
    const validation = validateConfirmation(data);
    const technician = String(data.technician || "").trim();
    const serial = String(data.serial || "").trim();
    const mode = data.mode || "APROVADO";
    const confirmed = validation.ok && Number.isFinite(Date.parse(data.confirmedAt || "")) && signatureMatches(data, data);
    const lines = ["RELATÓRIO DE TESTES DE HARDWARE", `Situação: ${confirmed ? mode : "NÃO CONFIRMADO"}`, `Técnico responsável: ${technician || "Não informado"}`, `Serial: ${serial || "Não informada"}`];
    if (confirmed) lines.push(`Confirmação: ${String(data.confirmedAt)}`);
    for (const test of catalog) {
      const items = Array.isArray(data.items) ? data.items.filter((item) => item && item.testId === test.id) : [];
      lines.push("", test.label);
      if (!items.length) lines.push(test.id === "usb" ? "- Nenhuma porta USB configurada." : "- Itens não informados.");
      for (const item of items) {
        lines.push(`- ${item.label || item.id}: ${resultLabels[item.result] || "Resultado inválido"}`);
        if (String(item.notes || "").trim()) lines.push(`  Observação: ${String(item.notes).trim()}`);
      }
    }
    if (String(data.notes || "").trim()) lines.push("", `Observações gerais: ${String(data.notes).trim()}`);
    const summary = validation.summary;
    lines.push("", `Resumo: ${summary.passed} aprovados; ${summary.failed} reprovados; ${summary.not_applicable} não se aplicam; ${summary.untested} não testados; ${summary.pending} pendentes.`);
    if (!validation.ok) lines.push(`Pendências de confirmação: ${validation.errors.join(" ")}`);
    else if (!confirmed) lines.push("Aguardando confirmação do técnico. Preencher o checklist não confirma o relatório.");
    if (summary.not_applicable) lines.push("Itens marcados Não se aplica foram excluídos da verificação; não representam funções testadas ou aprovadas.");
    // Native consumers use this exact final line to reject truncated reports.
    lines.push("Confirmação local do técnico; o envio ao rastreador depende do cadastro ou da integração correspondente.");
    return lines.join("\n");
  }

  function buildRecordReport(data = {}) {
    if (validateConfirmation(data).ok) return buildReport(data);
    const intact = signatureMatches(data, data) && Number.isFinite(Date.parse(data.confirmedAt || ""));
    const lines = ["HISTÓRICO DE TESTES DE HARDWARE", "Registro de uma versão anterior do checklist. Não confirma os testes atuais.",
      `Situação registrada: ${intact && ["APROVADO", "REGISTRADO"].includes(data.mode) ? data.mode : "NÃO CONFIRMADO"}`,
      `Técnico responsável: ${String(data.technician || "Não informado")}`, `Serial: ${String(data.serial || "Não informada")}`];
    if (intact) lines.push(`Confirmação registrada: ${String(data.confirmedAt)}`);
    for (const item of Array.isArray(data.items) ? data.items : []) {
      lines.push(`- ${item.label || item.id}: ${resultLabels[item.result] || "Resultado inválido"}`);
      if (String(item.notes || "").trim()) lines.push(`  Observação: ${String(item.notes).trim()}`);
    }
    if (String(data.notes || "").trim()) lines.push(`Observações gerais: ${String(data.notes).trim()}`);
    return lines.join("\n");
  }

  const api = Object.freeze({ catalog, results, resultLabels, createChecklist, summarize, validateConfirmation, buildReport, buildRecordReport, snapshot, fingerprint, signatureMatches });
  root.CAIJ_TEST_CHECKLIST = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
