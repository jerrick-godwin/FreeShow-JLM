import { afterEach, expect, it, vi } from "vitest"
import { join } from "node:path"
import { APP_NAME } from "../shared/branding"

afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.doUnmock("electron")
    vi.doUnmock("node:fs")
})
async function boot(existing: string[], explicitProfile = false, testProfile = false) {
    vi.resetModules()
    vi.stubEnv("FS_MOCK_STORE_PATH", testProfile ? "/test-profile" : "")
    const app = { commandLine: { hasSwitch: () => explicitProfile }, getPath: () => "/profiles", setPath: vi.fn(), setName: vi.fn() }
    vi.doMock("electron", () => ({ app }))
    vi.doMock("node:fs", () => ({ existsSync: (file: string) => existing.includes(file) }))
    await import("./branding")
    expect(app.setName).toHaveBeenCalledWith(APP_NAME)
    return app
}
it("preserves existing operator settings after the application is renamed", async () => {
    const legacy = join("/profiles", "FreeShow")
    const app = await boot([join(legacy, "config.json")])
    expect(app.setPath).toHaveBeenCalledWith("userData", legacy)
})
it("keeps a newer ministry profile when both profiles exist", async () => {
    const app = await boot([join("/profiles", APP_NAME, "config.json"), join("/profiles", "FreeShow", "config.json")])
    expect(app.setPath).not.toHaveBeenCalled()
})
it("respects explicit command-line and temporary test profiles", async () => {
    const files = [join("/profiles", "FreeShow", "config.json")]
    expect((await boot(files, true)).setPath).not.toHaveBeenCalled()
    expect((await boot(files, false, true)).setPath).not.toHaveBeenCalled()
})
