import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./ensure-google-service-plist.sh", import.meta.url));

describe("ensure-google-service-plist.sh", () => {
  it("fails the archive when GoogleService-Info.plist is missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haulz-plist-"));
    const result = spawnSync("sh", [script], {
      env: {
        ...process.env,
        SRCROOT: path.join(tmp, "missing-src"),
        BUILT_PRODUCTS_DIR: path.join(tmp, "out"),
        WRAPPER_NAME: "App.app",
      },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/GoogleService-Info\.plist/);
  });

  it("copies the plist into the app bundle when the file exists", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "haulz-plist-"));
    const srcRoot = path.join(tmp, "src");
    const appDir = path.join(srcRoot, "App");
    const outDir = path.join(tmp, "out");
    const wrapper = path.join(outDir, "App.app");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "GoogleService-Info.plist"), "<plist></plist>\n");
    const result = spawnSync("sh", [script], {
      env: {
        ...process.env,
        SRCROOT: srcRoot,
        BUILT_PRODUCTS_DIR: outDir,
        WRAPPER_NAME: "App.app",
      },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(fs.existsSync(path.join(wrapper, "GoogleService-Info.plist"))).toBe(true);
  });
});
