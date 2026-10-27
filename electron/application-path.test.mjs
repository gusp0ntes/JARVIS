import { describe, expect, it } from "vitest";
import paths from "./application-path.cjs";

describe("application paths", () => {
  it("accepts executables and stable packaged IDs such as the new Teams", () => {
    expect(paths.isApplicationPath("C:\\Program Files\\App\\app.EXE")).toBe(true);
    expect(paths.isApplicationPath("\\\\server\\apps\\app.exe")).toBe(true);
    const teams = "shell:AppsFolder\\MSTeams_8wekyb3d8bbwe!MSTeams";
    expect(paths.isApplicationPath(teams)).toBe(true);
    expect(paths.getPackagedApplicationId(teams)).toBe("MSTeams_8wekyb3d8bbwe!MSTeams");
  });

  it("rejects commands, arbitrary shell targets, and malformed app IDs", () => {
    for (const value of [null, "app.exe", "C:\\app.exe\n", "shell:AppsFolder\\", "shell:AppsFolder\\foo!bar; calc", "shell:AppsFolder\\..\\app.exe", "https://example.com/app.exe"]) {
      expect(paths.isApplicationPath(value)).toBe(false);
    }
  });
});
