import dotenv from "dotenv";

dotenv.config();

// Force worker role for this entrypoint. Prefer PROCESS_ROLE (canonical) while
// still allowing legacy APP_ROLE to exist in hosting dashboards.
process.env.PROCESS_ROLE = "worker";

await import("./index.js");
