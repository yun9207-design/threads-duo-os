import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const env = await readFile(".env.local", "utf8");
const credentials = ["THREADS_APP_SECRET", "THREADS_ACCESS_TOKEN", "THREADS_PUBLISHING_SECRET", "OPENAI_API_KEY"]
  .map((name) => env.match(new RegExp("^" + name + "=(.+)$", "m"))?.[1]?.trim()).filter(Boolean);
const gitOptions = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
const diff = execFileSync("git", ["diff", "--", ".", ":(exclude).env.local"], gitOptions)
  + execFileSync("git", ["diff", "--cached", "--", ".", ":(exclude).env.local"], gitOptions);
for (const credential of credentials) assert.equal(diff.includes(credential), false, "Credential in tracked diff");
assert.equal(execFileSync("git", ["ls-files", ".env.local"], gitOptions).trim(), "");
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = directory + "/" + entry.name;
    if (entry.isDirectory()) await scan(path);
    else if (/\.(js|json|map|html)$/.test(path)) {
      const text = await readFile(path, "utf8");
      for (const credential of credentials) assert.equal(text.includes(credential), false, "Credential in browser build");
      assert.equal(text.includes("THREADS_ACCESS_TOKEN"), false, "Server config in browser build");
      // Accounts intentionally displays the variable NAME in setup guidance.
      // Reject a browser-side environment read, not that harmless label.
      assert.equal(/process\.env(?:\.THREADS_APP_SECRET|\[["']THREADS_APP_SECRET["']\])/.test(text), false, "Meta app secret environment read in browser build");
      assert.equal(text.includes("THREADS_PUBLISHING_SECRET"), false, "Server config in browser build");
      assert.equal(text.includes("OPENAI_API_KEY"), false, "AI server key in browser build");
    }
  }
}
await scan(".next/static");
console.log("PASS: .env.local untracked; configured server credentials absent from tracked diff and browser build.");
