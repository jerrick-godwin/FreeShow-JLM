import { get } from "svelte/store"
import { separateLayoutTemplates } from "../../shared/contentLayouts"
import { categories, scriptureSettings, showsCache, styles, templates } from "../stores"

let migrating = false
let installed = false
export function installIndependentLayouts() {
    if (installed) return
    installed = true
    for (const store of [templates, styles, scriptureSettings, showsCache, categories]) store.subscribe(() => ensureIndependentLayouts())
}

export function ensureIndependentLayouts() {
    if (migrating) return
    const songTemplateIds = [
        ...Object.values(get(showsCache))
            .filter((show) => show.reference?.type !== "scripture")
            .map((show) => show.settings?.template),
        ...Object.values(get(categories)).map((category) => category.template)
    ].filter((id): id is string => typeof id === "string" && !!id)

    const result = separateLayoutTemplates(get(templates), get(styles), get(scriptureSettings).template || "scripture", songTemplateIds)
    if (!result.changed) return
    migrating = true
    templates.set(result.templates)
    styles.set(result.styles)
    scriptureSettings.update((settings) => ({ ...settings, template: result.scriptureTemplate }))
    migrating = false
}
