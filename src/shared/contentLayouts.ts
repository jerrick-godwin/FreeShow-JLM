import type { Styles } from "../types/Settings"
import type { Templates } from "../types/Show"

export function contentBackground(style: Styles, scripture: boolean) {
    const override = scripture ? style.bibleBackground : style.songBackground
    return {
        color: override?.color ?? style.background,
        image: override?.image ?? style.backgroundImage
    }
}

// A migrated Bible template is a deep copy so editing nested text styles cannot affect songs.
export function separateLayoutTemplates(templates: Templates, styles: Record<string, Styles>, scriptureTemplate = "scripture", songTemplateIds: string[] = []) {
    const nextTemplates = { ...templates }
    const nextStyles = JSON.parse(JSON.stringify(styles)) as Record<string, Styles>
    const songIds = new Set([
        "default",
        ...songTemplateIds,
        ...Object.values(styles)
            .map((s) => s.template)
            .filter(Boolean)
    ])
    for (const id of songIds) {
        const first = templates[id || ""]?.settings?.firstSlideTemplate
        if (first) songIds.add(first)
    }
    let changed = false
    const copies = new Map<string, string>()
    const isolate = (id: string) => {
        if (!songIds.has(id) || !templates[id]) return id
        if (copies.has(id)) return copies.get(id)!
        let copyId = `${id}_bible_layout`
        let suffix = 1
        while (nextTemplates[copyId]) copyId = `${id}_bible_layout_${suffix++}`
        const copy = JSON.parse(JSON.stringify(templates[id]))
        copy.name = `${copy.name} (Bible Verses)`
        delete copy.isDefault
        nextTemplates[copyId] = copy
        copies.set(id, copyId)
        // Also isolate an explicitly shared first-slide template.
        if (copy.settings?.firstSlideTemplate && copy.settings.firstSlideTemplate !== id) copy.settings.firstSlideTemplate = isolate(copy.settings.firstSlideTemplate)
        else if (copy.settings?.firstSlideTemplate === id) copy.settings.firstSlideTemplate = copyId
        changed = true
        return copyId
    }
    const nextScriptureTemplate = isolate(scriptureTemplate)
    for (const style of Object.values(nextStyles)) {
        for (const key of ["templateScripture", "templateScripture_2", "templateScripture_3", "templateScripture_4"] as const) {
            if (style[key]) style[key] = isolate(style[key]!)
        }
    }
    return { changed, templates: nextTemplates, styles: nextStyles, scriptureTemplate: nextScriptureTemplate }
}
