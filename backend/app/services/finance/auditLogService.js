import FinanceAuditLog from "../../models/financeAuditLog.js";

export async function createFinanceAuditLog(
  {
    action,
    actorType = "ADMIN",
    actorId = null,
    orderId = null,
    payoutId = null,
    metadata = {},
    note = "",
  },
  { session } = {},
) {
  const options = session ? { session } : {};
  const log = await FinanceAuditLog.create(
    [
      {
        action,
        actorType,
        actorId,
        orderId,
        payoutId,
        metadata,
        note,
      },
    ],
    options,
  );
  return log[0];
}
