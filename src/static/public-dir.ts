import { join } from "node:path";

export function resolvePublicDir(cwd = process.cwd()) {
  return join(cwd, "public");
}
