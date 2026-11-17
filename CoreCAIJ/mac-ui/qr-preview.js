/* Local SVG preview; QR encoding is provided by the bundled qrcode 1.5.4 (MIT). */
(function (root) {
  "use strict";
  const ns = "http://www.w3.org/2000/svg";

  function render(host, value) {
    if (!host || !root.CaijQrEncoder) return;
    if (host.dataset.qrValue === value) return;
    const qr = root.CaijQrEncoder.create(value, { errorCorrectionLevel: "M" });
    const count = qr.modules.size;
    const margin = 4;
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", count + margin * 2);
    svg.setAttribute("height", count + margin * 2);
    svg.setAttribute("viewBox", `0 0 ${count + margin * 2} ${count + margin * 2}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR de demonstração da etiqueta. O link da ficha é gerado ao imprimir.");

    function shape(tag, attrs) {
      const element = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([key, item]) => element.setAttribute(key, item));
      svg.appendChild(element);
    }
    shape("rect", { width: count + margin * 2, height: count + margin * 2, fill: "#fff" });
    const finders = [[0, 0], [0, count - 7], [count - 7, 0]];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        const finder = finders.some(([r, c]) => row >= r && row < r + 7 && col >= c && col < c + 7);
        if (!finder && qr.modules.get(row, col)) {
          shape("rect", { x: col + margin, y: row + margin, width: 1, height: 1, rx: 0.22, fill: "#111" });
        }
      }
    }
    finders.forEach(([row, col]) => {
      [[0, 7, "#111", 1], [1, 5, "#fff", 0.6], [2, 3, "#111", 0.35]].forEach(([inset, size, fill, rx]) => {
        shape("rect", { x: col + margin + inset, y: row + margin + inset, width: size, height: size, fill, rx });
      });
    });
    host.replaceChildren(svg);
    host.dataset.qrValue = value;
  }

  root.CaijQrPreview = { render };
})(window);
