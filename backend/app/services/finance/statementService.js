import { getLedgerEntries } from "./ledgerService.js";

function escapeCsv(value) {
  if (value == null) return "";
  const text = String(value).replace(/"/g, "\"\"");
  if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
    return `"${text}"`;
  }
  return text;
}

export function buildLedgerCsv(entries = []) {
  const headers = [
    "Transaction ID",
    "Date",
    "Type",
    "Direction",
    "Amount",
    "Status",
    "Payment Mode",
    "Actor Type",
    "Actor ID",
    "Order ID",
    "Reference",
    "Description",
  ];

  const rows = entries.map((entry) => [
    entry.transactionId,
    new Date(entry.createdAt).toISOString(),
    entry.type,
    entry.direction,
    entry.amount,
    entry.status,
    entry.paymentMode || "",
    entry.actorType,
    entry.actorId || "",
    entry.orderId || "",
    entry.reference || "",
    entry.description || "",
  ]);

  const content = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\n");

  return content;
}

export async function exportFinanceStatement(filters = {}) {
  const ledger = await getLedgerEntries({
    ...filters,
    page: 1,
    limit: Math.min(Number(filters.limit) || 1000, 10000),
  });

  return {
    fileName: `finance_statement_${new Date().toISOString().slice(0, 10)}.csv`,
    csv: buildLedgerCsv(ledger.items),
    totalRows: ledger.items.length,
  };
}
