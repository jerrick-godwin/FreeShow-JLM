import { app } from "electron"
import path from "path"

// Large, read-only assets live outside app.asar in installed desktop builds.
export function bundledPath(...parts: string[]) {
    return path.join(app.isPackaged ? path.join(process.resourcesPath, "bundled") : path.join(app.getAppPath(), "resources", "bundled"), ...parts)
}
