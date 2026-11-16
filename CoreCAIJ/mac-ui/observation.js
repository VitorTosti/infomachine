(function (root) {
  "use strict";

  const services = Object.freeze([
    { id: "system", text: "Sistema instalado" },
    { id: "cleaning", text: "Limpeza interna" },
    { id: "tests", text: "Testes aprovados" },
  ]);

  function selectedServices(ids) {
    const selected = new Set(Array.isArray(ids) ? ids : []);
    return services.filter((service) => selected.has(service.id)).map((service) => service.text);
  }

  function build({ ids = [], note = "", testsStatus = "", label = false } = {}) {
    const status = String(testsStatus || "").toUpperCase();
    const chosen = selectedServices(ids).filter((service) => status !== "FALHOU" || service !== "Testes aprovados");
    if (status === "FALHOU") chosen.push("Testes: falhou");
    else if (status === "OK" && !chosen.includes("Testes aprovados")) chosen.push("Testes: OK");
    const detail = String(note || "").trim();
    const parts = [];
    if (chosen.length) parts.push(`${label ? "Serviços" : "Serviços realizados"}: ${chosen.join("; ")}`);
    if (detail) parts.push(`${label ? "Obs." : "Observações"}: ${detail}`);
    return parts.join(label ? ". " : "\n");
  }

  function fitsLabel(text) {
    let remaining = String(text || "").replace(/\s+/g, " ").trim();
    if (remaining.length > 180) return false;
    let lines = 0;
    while (remaining && lines < 3) {
      lines += 1;
      if (remaining.length <= 69) return true;
      let breakAt = remaining.lastIndexOf(" ", 69);
      if (breakAt < Math.floor(69 * 0.55)) breakAt = 69;
      remaining = remaining.slice(breakAt).trim();
    }
    return !remaining;
  }

  function gradeCode(value) {
    const normalized = String(value || "").trim().toUpperCase().replace(/^GRADE\s+/, "");
    if (/^T(?:\s*-\s*TRIAGEM)?$/.test(normalized)) return "T";
    if (/^C(?:\s*-\s*PINTURA\s*[123])?$/.test(normalized)) return "C";
    return /^(?:A|B|C|D|RMA)$/.test(normalized) ? normalized : "";
  }

  function requiresDetail(value) {
    return ["B", "C", "D"].includes(gradeCode(value));
  }

  function validateGradeDetail(value, detail) {
    return gradeCode(value) !== "D" || Boolean(String(detail || "").trim())
      ? ""
      : "Descreva o detalhe da máquina em Observações para a Grade D.";
  }

  function includeGradeDetail(value, observation, detail, label = false) {
    const text = String(observation || "").trim();
    const note = String(detail || "").trim();
    if (gradeCode(value) !== "D" || !note || text.includes(note)) return text;
    return [text, `${label ? "Obs." : "Observações"}: ${note}`].filter(Boolean).join(label ? ". " : "\n");
  }

  const api = Object.freeze({ services, build, fitsLabel, gradeCode, requiresDetail, validateGradeDetail, includeGradeDetail });
  root.CAIJ_OBSERVATION = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
