import dotenv from "dotenv";

dotenv.config();

// Force scheduler role for this entrypoint. Prefer PROCESS_ROLE (canonical) while
// still allowing legacy APP_ROLE to exist in hosting dashboards.
process.env.PROCESS_ROLE = "scheduler";

await import("./index.js");
