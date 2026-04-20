import dotenv from "dotenv";

dotenv.config();

if (!process.env.APP_ROLE) {
  process.env.APP_ROLE = "worker";
}

await import("./index.js");
