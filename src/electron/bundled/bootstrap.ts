import { getStore, _store } from "../data/store"
import { getDataFolderRoot } from "../utils/files"
import { bundledPath } from "./resources"
import { installLibrary } from "./library"

export function ensureBundledLibrary(force = false) {
    // A new installation waits for the operator to choose its data folder or finish setup.
    if (!force && !getStore("SETTINGS").initialized) return false
    if (!_store.SYNCED_SETTINGS) return false
    const settings = getStore("SYNCED_SETTINGS")
    try {
        const installed = installLibrary(bundledPath(), getDataFolderRoot(), { scriptures: settings.scriptures || {}, categories: settings.categories || {} })
        if (!installed.changed) return false
        _store.SYNCED_SETTINGS.set("scriptures", installed.settings.scriptures)
        _store.SYNCED_SETTINGS.set("categories", installed.settings.categories)
        installed.commit?.()
        console.info(`Bundled library: ${installed.songs} new shows, ${installed.bibles} new Bibles`)
        return true
    } catch (error) {
        console.error("Bundled library could not be installed:", error)
        return false
    }
}
