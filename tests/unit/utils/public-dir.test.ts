import { join } from "node:path";
import { resolvePublicDir } from "../../../src/static/public-dir.js";

describe("resolvePublicDir", () => {
  it("resolves public assets from the process working directory", () => {
    expect(resolvePublicDir("/app")).toBe(join("/app", "public"));
  });
});
