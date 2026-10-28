(function (root) {
  function normalizeSerial(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function canReuseSerialLookup(serial, lookup) {
    return normalizeSerial(serial).length >= 4 &&
      normalizeSerial(serial) === normalizeSerial(lookup?.serial) &&
      ["searching", "choose", "selected", "none"].includes(lookup?.status);
  }

  function shouldFlagSerialDivergence(machineSerial, osSerial, manualOsSet, osCreatedInSession, lookupStatus) {
    if (!manualOsSet && !osCreatedInSession && lookupStatus !== "selected") return false;
    const machine = normalizeSerial(machineSerial);
    const order = normalizeSerial(osSerial);
    return Boolean(machine && machine !== "NA" && order && order !== "NA" && machine !== order);
  }

  function intelCpuModel(value) {
    const match = String(value || "").match(/\bi([3579])[-\s]?(\d{4,5})([A-Z]{0,3}\d{0,2})\b/i);
    return match ? `i${match[1]}-${match[2]}${match[3].toUpperCase()}` : "";
  }

  function decideSerialOs(serial, matches, manualOsSet, pendingCreatedOs, currentOs) {
    const target = normalizeSerial(serial);
    if (target.length < 4 || ["NONE", "UNKNOWN", "XXXXXX"].includes(target) || Number(pendingCreatedOs) > 0) {
      return { kind: "skip", orders: [] };
    }
    const seen = new Set();
    const orders = (Array.isArray(matches) ? matches : [])
      .filter((order) => normalizeSerial(order.garantia || order.serial) === target)
      .filter((order) => {
        const number = Number(order.numero);
        if (!Number.isInteger(number) || number < 1 || seen.has(number)) return false;
        seen.add(number);
        return true;
      })
      .sort((left, right) => Number(right.numero) - Number(left.numero));
    if (!orders.length) return { kind: "none", orders: [] };
    if (orders.length === 1 && Number(orders[0].numero) === Number(currentOs)) return { kind: "already", orders };
    return { kind: orders.length === 1 && !manualOsSet ? "select" : "choose", orders };
  }
  const api = { decideSerialOs, canReuseSerialLookup, shouldFlagSerialDivergence, intelCpuModel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CAIJ_SERIAL_OS = api;
})(typeof window !== "undefined" ? window : globalThis);
