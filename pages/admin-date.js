(function initializeAdminDate(globalObject) {
  const TOKYO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  function formatParts(parts) {
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  function formatTokyoDateInput(value) {
    const date = value?.toDate?.() ?? value;
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? formatParts(TOKYO_DATE_FORMATTER.formatToParts(date))
      : "";
  }

  function addUtcMonths(dateText, months) {
    const [year, month, day] = dateText.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
  }

  function defaultTokyoContractDates(now = new Date()) {
    const start = formatTokyoDateInput(now);
    return {
      start,
      end: addUtcMonths(start, 1),
    };
  }

  const api = {
    formatTokyoDateInput,
    defaultTokyoContractDates,
  };

  globalObject.NoxAdminDate = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
