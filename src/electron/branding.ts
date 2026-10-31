import { app } from "electron"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { APP_NAME } from "../shared/branding"

// Keep existing operator settings when upgrading the renamed ministry edition.
// Explicit test/command-line profiles always take precedence.
if (!process.env.FS_MOCK_STORE_PATH && !app.commandLine.hasSwitch("user-data-dir")) {
    const legacy = ["FreeShow", "freeshow"].map((name) => join(app.getPath("appData"), name))
    const current = join(app.getPath("appData"), APP_NAME)
    const existing = !existsSync(join(current, "config.json")) && legacy.find((folder) => existsSync(join(folder, "config.json")))
    if (existing) app.setPath("userData", existing)
}
app.setName(APP_NAME)
