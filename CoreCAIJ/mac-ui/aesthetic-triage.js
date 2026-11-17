(function (root) {
  "use strict";

  const rulesVersion = "aesthetic-v1";
  const parts = Object.freeze([
    ["lid", "Tampa superior"], ["bezel", "Moldura da tela"], ["display", "Tela (superfície)"],
    ["deck", "Teclado e apoio de mãos"], ["bottom", "Base inferior"], ["hinges", "Dobradiças"],
    ["ports", "Portas e conectores"], ["missing", "Peças ausentes"],
  ].map(([id, label]) => Object.freeze({ id, label })));
  const conditions = Object.freeze([
    ["perfect", "Perfeito", "Sem marcas visíveis"], ["light", "Marcas leves", "Marcas discretas"],
    ["visible", "Marcas visíveis", "Desgaste evidente"], ["damage", "Dano", "Quebra ou avaria"],
  ]);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const clamp = (number) => Math.max(0, Math.min(1, number));

  function createRecord() {
    return { rulesVersion, parts: parts.map(({ id }) => ({ id, status: "", marks: [], note: "" })), gradeOverride: "", overrideReason: "" };
  }

  function validate(record) {
    const errors = [];
    if (!record || record.rulesVersion !== rulesVersion) errors.push("Versão de regras estéticas desconhecida.");
    const entries = Array.isArray(record?.parts) ? record.parts : [];
    if (entries.length && entries.every((item) => item.status === "not_applicable")) errors.push("Avalie ao menos uma peça aplicável.");
    for (const { id, label } of parts) {
      const entry = entries.find((item) => item?.id === id);
      if (!entry || ![...conditions.map(([value]) => value), "not_applicable"].includes(entry.status)) {
        errors.push(`Avalie ${label}.`); continue;
      }
      if (!["perfect", "not_applicable"].includes(entry.status) && !entry.marks?.length) errors.push(`Marque o local observado em ${label}.`);
      for (const mark of entry.marks || []) if (!Number.isFinite(mark.x) || !Number.isFinite(mark.y) || mark.x < 0 || mark.x > 1 || mark.y < 0 || mark.y > 1) errors.push(`Marcação inválida em ${label}.`);
    }
    if (record?.gradeOverride && !/^[ABCD]$/.test(record.gradeOverride)) errors.push("Grade escolhida inválida.");
    const suggested = gradeFor(entries);
    if (record?.gradeOverride && record.gradeOverride !== suggested.grade && !String(record.overrideReason || "").trim()) errors.push("Justifique a alteração da grade sugerida.");
    return { ok: errors.length === 0, errors };
  }

  function gradeFor(entries) {
    if (!entries.length) return { grade: "", reason: "Nenhuma peça aplicável foi avaliada" };
    const damage = entries.find((item) => item.status === "damage");
    const visible = entries.find((item) => item.status === "visible");
    const light = entries.filter((item) => item.status === "light");
    const label = (id) => parts.find((part) => part.id === id)?.label.toLowerCase() || id;
    if (damage) return { grade: "D", reason: `${label(damage.id)} com dano` };
    if (visible) return { grade: "C", reason: `${label(visible.id)} com marcas visíveis` };
    if (light.length >= 4) return { grade: "C", reason: `${light.length} peças com marcas leves` };
    if (light.length >= 2) return { grade: "B", reason: `${light.length} peças com marcas leves` };
    return { grade: "A", reason: light.length ? `${label(light[0].id)} com uma marca leve` : "peças avaliadas sem marcas" };
  }

  function evaluate(record) {
    const validation = validate({ ...record, gradeOverride: "", overrideReason: "" });
    if (!validation.ok) return { grade: "", reason: validation.errors[0], complete: false, validation };
    const entries = record.parts.filter((item) => item.status !== "not_applicable");
    const suggestion = gradeFor(entries);
    return { ...suggestion, complete: Boolean(suggestion.grade) };
  }

  function buildReport(record) {
    const result = evaluate(record);
    const validation = validate(record);
    const lines = ["AVALIAÇÃO ESTÉTICA", `Versão da regra: ${record?.rulesVersion || "desconhecida"}`, `Grade sugerida: ${result.grade || "PENDENTE"}${result.grade ? ` — ${result.reason}` : ""}`];
    for (const part of parts) {
      const entry = record?.parts?.find((item) => item.id === part.id);
      const status = conditions.find(([value]) => value === entry?.status)?.[1] || (entry?.status === "not_applicable" ? "Não se aplica" : "Pendente");
      lines.push(`- ${part.label}: ${status}`);
      if (entry?.marks?.length) lines.push(`  Locais marcados: ${entry.marks.map((mark) => `${Math.round(mark.x * 100)}% × ${Math.round(mark.y * 100)}%`).join("; ")}`);
      if (entry?.note?.trim()) lines.push(`  Observação: ${entry.note.trim()}`);
    }
    lines.push(`Grade confirmada: ${validation.ok ? (record.gradeOverride || result.grade) : "PENDENTE"}`);
    if (record?.gradeOverride && record.gradeOverride !== result.grade) lines.push(`Justificativa da alteração: ${record.overrideReason || "PENDENTE"}`);
    if (!validation.ok) lines.push(`Pendências: ${validation.errors.join(" ")}`);
    return lines.join("\n");
  }

  function mount(container, record = createRecord(), onChange = () => {}) {
    if (!container) throw new Error("Informe o elemento da avaliação estética.");
    const source = record && Array.isArray(record.parts) ? record : createRecord();
    let active = 0;
    const changed = () => { onChange(source); draw(); };
    const draw = () => {
      const item = source.parts[active], part = parts[active], result = evaluate(source);
      const progress = source.parts.filter((entry) => entry.status).length;
      container.innerHTML = `<section class="aesthetic-shell" aria-labelledby="aestheticTitle">
        <header class="aesthetic-head"><div><h3 id="aestheticTitle">Avaliação estética</h3><p>Inspecione cada peça e marque no desenho os detalhes encontrados.</p></div><strong>${progress} de ${parts.length} peças</strong><button type="button" id="closeAestheticTriage">Voltar aos testes</button></header>
        <nav class="aesthetic-steps" aria-label="Peças do equipamento">${parts.map((entry, index) => `<button type="button" data-aesthetic-step="${index}" aria-current="${index === active ? "step" : "false"}" class="${source.parts[index].status ? "done" : ""}">${index + 1}. ${escape(entry.label)}</button>`).join("")}</nav>
        <div class="aesthetic-body"><div class="aesthetic-illustration"><div class="aesthetic-diagram aesthetic-${part.id}" role="button" tabindex="0" aria-label="Marcar local do detalhe em ${escape(part.label)}">${(item.marks || []).map((mark, index) => `<span class="aesthetic-mark" style="left:${clamp(mark.x) * 100}%;top:${clamp(mark.y) * 100}%" aria-label="Marcação ${index + 1}">${index + 1}</span>`).join("")}</div><small>Desenho de referência. Clique para marcar a posição do detalhe; Enter marca o centro.</small></div>
        <div class="aesthetic-form"><span class="aesthetic-index">Peça ${active + 1} de ${parts.length}</span><h4>${escape(part.label)}</h4><p>Em que estado está esta parte?</p><div class="aesthetic-choices">${conditions.map(([value, title, subtitle]) => `<button type="button" data-aesthetic-status="${value}" aria-pressed="${item.status === value}"><span class="aesthetic-sample aesthetic-sample-${value}" aria-hidden="true"></span><strong>${title}</strong><small>${subtitle}</small></button>`).join("")}</div><button type="button" class="aesthetic-na" data-aesthetic-status="not_applicable" aria-pressed="${item.status === "not_applicable"}">Não se aplica a esta máquina</button>
        ${!["", "perfect", "not_applicable"].includes(item.status) ? `<label>Observação (opcional)<textarea id="aestheticNote" maxlength="500" rows="2" placeholder="Descreva o detalhe observado">${escape(item.note)}</textarea></label><div class="aesthetic-mark-list">${item.marks.length ? item.marks.map((mark, index) => `<button type="button" data-remove-mark="${index}">Remover marca ${index + 1}</button>`).join("") : "Marque pelo menos um local no desenho."}</div>` : ""}</div></div>
        <footer class="aesthetic-footer"><button type="button" data-aesthetic-back ${active === 0 ? "disabled" : ""}>Anterior</button><span>${escape(result.complete ? `Grade sugerida ${result.grade}: ${result.reason}` : result.reason)}</span><button type="button" data-aesthetic-next ${active === parts.length - 1 ? "disabled" : ""}>Próxima peça</button></footer>
        <section class="aesthetic-verdict"><h4>Veredito estético</h4><p>${result.complete ? `Grade sugerida: ${result.grade} — ${escape(result.reason)}.` : "Complete as oito etapas e marque os detalhes para gerar a sugestão."}</p><label>Grade confirmada<select id="aestheticGrade"><option value="">Usar sugestão</option>${["A", "B", "C", "D"].map((grade) => `<option value="${grade}" ${source.gradeOverride === grade ? "selected" : ""}>Grade ${grade}</option>`).join("")}</select></label>${source.gradeOverride && source.gradeOverride !== result.grade ? `<label>Motivo da alteração<textarea id="aestheticReason" required maxlength="500" rows="2">${escape(source.overrideReason)}</textarea></label>` : ""}<p role="status">${source.gradeOverride && !source.overrideReason.trim() ? "Explique a alteração antes de confirmar a triagem." : ""}</p></section>
      </section>`;
      container.querySelectorAll("[data-aesthetic-step]").forEach((button) => button.addEventListener("click", () => { active = Number(button.dataset.aestheticStep); draw(); }));
      container.querySelectorAll("[data-aesthetic-status]").forEach((button) => button.addEventListener("click", () => { item.status = button.dataset.aestheticStatus; if (["perfect", "not_applicable"].includes(item.status)) item.marks = []; changed(); }));
      const diagram = container.querySelector(".aesthetic-diagram");
      const mark = (x, y) => { if (!["", "perfect", "not_applicable"].includes(item.status)) { item.marks.push({ x: clamp(x), y: clamp(y) }); changed(); } };
      diagram.addEventListener("click", (event) => { const bounds = diagram.getBoundingClientRect(); mark((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height); });
      diagram.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); mark(.5, .5); } });
      container.querySelectorAll("[data-remove-mark]").forEach((button) => button.addEventListener("click", () => { item.marks.splice(Number(button.dataset.removeMark), 1); changed(); }));
      container.querySelector("#aestheticNote")?.addEventListener("change", (event) => { item.note = event.target.value; onChange(source); });
      container.querySelector("#aestheticGrade").addEventListener("change", (event) => { source.gradeOverride = event.target.value === result.grade ? "" : event.target.value; source.overrideReason = ""; changed(); });
      container.querySelector("#aestheticReason")?.addEventListener("change", (event) => { source.overrideReason = event.target.value; onChange(source); });
      container.querySelector("[data-aesthetic-back]").addEventListener("click", () => { active--; draw(); });
      container.querySelector("[data-aesthetic-next]").addEventListener("click", () => { active++; draw(); });
    };
    draw();
    return { getRecord: () => source, showPart: (index) => { if (index >= 0 && index < parts.length) { active = index; draw(); } }, refresh: draw };
  }

  root.CAIJ_AESTHETIC_TRIAGE = Object.freeze({ parts, conditions, rulesVersion, createRecord, validate, evaluate, buildReport, mount });
  if (typeof module !== "undefined" && module.exports) module.exports = root.CAIJ_AESTHETIC_TRIAGE;
})(typeof window === "undefined" ? globalThis : window);
