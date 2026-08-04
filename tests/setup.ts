import { config } from "dotenv";

config();

if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    "DATABASE_URL_TEST is not set. Tests run against a dedicated Neon branch, " +
      "never against the production DATABASE_URL - see .env.example."
  );
}

// Every test (unit + the spawned integration server) must use the test
// branch. Overriding DATABASE_URL here, before any test file imports
// lib/prisma, is what keeps this suite from ever touching production data.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
