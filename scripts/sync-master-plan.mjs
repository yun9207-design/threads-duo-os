import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The existing root document remains the source of truth. Copy its bytes unchanged.
const source = fileURLToPath(new URL("../MASTER_PLAN.html", import.meta.url));
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const destination = fileURLToPath(
  new URL("../public/MASTER_PLAN.html", import.meta.url),
);

await mkdir(publicDirectory, { recursive: true });
await copyFile(source, destination);
console.log("MASTER_PLAN.html copied to public/MASTER_PLAN.html.");
