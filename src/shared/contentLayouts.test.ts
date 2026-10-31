import { describe, expect, it } from "vitest"
import { contentBackground, separateLayoutTemplates } from "./contentLayouts"
import type { Templates } from "../types/Show"

describe("content layouts", () => {
    it("retains legacy backgrounds and isolates explicit overrides including an empty image", () => {
        const style = { name: "Output", background: "black", backgroundImage: "shared.jpg", songBackground: { color: "blue" }, bibleBackground: { image: "" } }
        expect(contentBackground(style, false)).toEqual({ color: "blue", image: "shared.jpg" })
        expect(contentBackground(style, true)).toEqual({ color: "black", image: "" })
    })
    it("deep-copies shared scripture templates and first-slide templates without changing songs", () => {
        const templates: Templates = { default: { name: "Shared", color: null, category: null, items: [{ style: "font-size:40px" }], settings: { firstSlideTemplate: "default" } } }
        const styles = { output: { name: "Out", template: "default", templateScripture: "default", templateScripture_2: "default" } }
        const result = separateLayoutTemplates(templates, styles, "default")
        const bibleId = result.scriptureTemplate
        expect(result.changed).toBe(true)
        expect(result.styles.output.template).toBe("default")
        expect(result.styles.output.templateScripture_2).toBe(bibleId)
        expect(result.templates[bibleId].settings?.firstSlideTemplate).toBe(bibleId)
        result.templates[bibleId].items[0].style = "changed"
        expect(templates.default.items[0].style).toBe("font-size:40px")
        expect(separateLayoutTemplates(result.templates, result.styles, bibleId).changed).toBe(false)
    })
    it("preserves distinct templates and avoids overwriting an existing migrated name", () => {
        const template = { name: "Template", color: null, category: null, items: [] }
        const result = separateLayoutTemplates({ default: template, default_bible_layout: template }, {}, "default")
        expect(result.scriptureTemplate).toBe("default_bible_layout_1")
        expect(separateLayoutTemplates({ scripture: template, default: template }, {}, "scripture").changed).toBe(false)
    })
})
