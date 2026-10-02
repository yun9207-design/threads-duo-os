// Server credential envelopes. Kept transport-independent for focused tests.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
function key(secret: string, workspaceId: string) {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(secret)) throw Error("Server configuration unavailable");
  return createHmac("sha256", secret).update("threads-token-envelope:v1:" + workspaceId).digest();
}
export function sealThreadsToken(token: string, workspaceId: string, secret: string) {
  if (!token || token.length > 10000 || /\s/.test(token)) throw Error("Invalid credential");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret, workspaceId), iv);
  cipher.setAAD(Buffer.from(workspaceId));
  const value = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), value.toString("base64url")].join(".");
}
export function openThreadsToken(envelope: string, workspaceId: string, secret: string) {
  try {
    const [version, iv, tag, value, extra] = envelope.split(".");
    if (version !== "v1" || extra || !value) throw Error();
    const decipher = createDecipheriv("aes-256-gcm", key(secret, workspaceId), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(workspaceId)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(value, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw Error("Threads credential requires reconnection"); }
}
