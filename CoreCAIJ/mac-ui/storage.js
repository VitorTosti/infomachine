(function (root) {
  "use strict";

  function normalize(value) {
    const original = String(value || "").trim();
    if (!original) return "N/A";
    const parts = original.split(/\s*(?:\+|;|\n|\r|,\s*(?=\d|SSD|HDD|HD\b))\s*/).filter(Boolean);
    return parts.map((part) => {
      const size = part.match(/\b(\d+(?:[.,]\d+)?)\s*(TB|GB)\b/i);
      if (!size) return part.trim();
      const amount = Number(size[1].replace(",", "."));
      const unit = size[2].toUpperCase();
      const kind = /\b(?:HDD|HD)\b/i.test(part) ? "HDD"
        : /\bSSD\b|NVME|M\.2/i.test(part) ? "SSD"
        : /\bDISCO\b/i.test(part) ? "Disco" : "";
      const marketed = unit === "GB" && amount >= 900 && amount <= 1100 ? "1TB"
        : unit === "GB" && amount >= 1800 && amount <= 2200 ? "2TB"
        : unit === "GB" && amount >= 235 && amount <= 239 ? "256GB"
        : unit === "GB" && amount >= 473 && amount <= 477 ? "512GB"
        : `${size[1].replace(",", ".")}${unit}`;
      return `${marketed}${kind ? ` ${kind}` : ""}`;
    }).join(" + ");
  }

  root.CAIJ_STORAGE = { normalize };
})(typeof window === "undefined" ? globalThis : window);
