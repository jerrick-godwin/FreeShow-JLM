import type { Show, Slide } from "../../../types/Show"
import type { LiveDocument, LivePosition } from "../../../types/ai/Live"
import { bookAliases } from "../../../shared/bibleBooks"
import { normalizeNumbers } from "../scripture/numbers"

// Keep styled spans contiguous within a line, but separate lines and textboxes.
export function lyricSlideText(slide: Pick<Slide, "items">): string {
    return (slide.items || [])
        .filter((item) => !item.type || item.type === "text")
        .map((item) => (item.lines || []).map((line) => (line.text || []).map((span) => span.value || "").join("")).join("\n"))
        .join("\n")
}

// Build the same parent/child slide order without opening or mutating presentation caches.
export function songPositions(show: Show, layoutId: string): LivePosition[] {
    const positions: LivePosition[] = []
    let index = 0
    const add = (id: string, disabled = false) => {
        const slide = show.slides?.[id]
        if (!slide) return
        const position = index++
        const text = lyricSlideText(slide)
        if (text.trim() && !disabled) positions.push({ id: `${id}:${position}`, index: position, text })
    }
    for (const reference of show.layouts?.[layoutId]?.slides || []) {
        const slide = show.slides?.[reference.id]
        if (!slide) continue
        add(reference.id, reference.disabled)
        for (const child of (slide.children || []).flat()) add(child, reference.children?.[child]?.disabled)
    }
    return positions
}

export function liveTokens(text: string): string[] {
    return text
        .normalize("NFC")
        .toLocaleLowerCase()
        .replace(/<[^>]*>/g, " ")
        .replace(/&(?:amp|lt|gt|quot|nbsp);/g, " ")
        .replace(/[^\p{L}\p{M}\p{N}\u200c\u200d]+/gu, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
}
const common = new Set("a an the and of to in is it i you we he she they for on with at that this my your our as be have was are".split(" "))
const important = (tokens: string[]) => tokens.filter((word) => !common.has(word))

export interface PositionMatch {
    document: LiveDocument
    position: LivePosition
    score: number
    words: number
}
function orderedCoverage(query: string[], text: string[]): number {
    let previous = new Uint16Array(text.length + 1)
    for (const word of query) {
        const row = new Uint16Array(text.length + 1)
        for (let j = 1; j <= text.length; j++) row[j] = word === text[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], row[j - 1])
        previous = row
    }
    return previous[text.length] / Math.max(1, Math.min(query.length, text.length))
}
export function textMatch(query: string[], target: string[]): { score: number; words: number } {
    if (!query.length || !target.length) return { score: 0, words: 0 }
    // The end of a recognition segment describes the newest position.
    let best = { score: 0, words: 0 }
    for (const size of [8, 16, 32, 48]) {
        const tail = query.slice(-Math.min(size, Math.max(4, target.length)))
        const meaningful = [...new Set(important(tail))]
        const targetSet = new Set(target)
        const matched = meaningful.filter((word) => targetSet.has(word)).length
        const coverage = matched / Math.max(1, meaningful.length)
        const order = orderedCoverage(tail, target)
        const score = coverage * 0.6 + order * 0.4
        if (matched >= 3 && score > best.score) best = { score, words: matched }
    }
    return best
}

export class LiveIndex {
    readonly documents = new Map<string, LiveDocument>()
    private postings = new Map<string, Set<string>>()
    private positions = new Map<string, { document: LiveDocument; position: LivePosition; tokens: string[] }>()
    add(document: LiveDocument) {
        this.remove(document.id)
        this.documents.set(document.id, document)
        for (const position of document.positions) {
            const key = `${document.id}\u0000${position.id}`
            const tokens = liveTokens(position.text).slice(0, 160)
            this.positions.set(key, { document, position, tokens })
            for (const word of new Set(important(tokens))) {
                if (!this.postings.has(word)) this.postings.set(word, new Set())
                this.postings.get(word)!.add(key)
            }
        }
    }
    remove(id: string) {
        const old = this.documents.get(id)
        if (!old) return
        for (const position of old.positions) {
            const key = `${id}\u0000${position.id}`
            const entry = this.positions.get(key)
            for (const word of new Set(important(entry?.tokens || []))) {
                const posting = this.postings.get(word)
                posting?.delete(key)
                if (!posting?.size) this.postings.delete(word)
            }
            this.positions.delete(key)
        }
        this.documents.delete(id)
    }
    match(text: string, documentId?: string): PositionMatch[] {
        const query = liveTokens(text).slice(-48)
        const words = [...new Set(important(query))].filter((word) => this.postings.has(word)).sort((a, b) => this.postings.get(a)!.size - this.postings.get(b)!.size)
        const keys = new Set<string>()
        for (const word of words.slice(0, 8))
            for (const key of this.postings.get(word)!) {
                if (documentId && !key.startsWith(documentId + "\u0000")) continue
                keys.add(key)
                if (keys.size >= 1500) break
            }
        return [...keys]
            .map((key) => {
                const entry = this.positions.get(key)!
                return { document: entry.document, position: entry.position, ...textMatch(query, entry.tokens) }
            })
            .filter((match) => match.words >= 3 && match.score >= 0.78)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
    }
    titles(text: string): LiveDocument[] {
        const query = " " + liveTokens(text).join(" ") + " "
        const cue = /\b(sing|singing|song|hymn)\b|பாடல்|பாடுவோம்|ගීතිකාව|ගයමු/iu.test(text)
        return [...this.documents.values()]
            .filter(
                (document) =>
                    document.kind === "song" &&
                    [document.label, ...(document.aliases || [])].some((alias) => {
                        const tokens = liveTokens(alias)
                        if (!tokens.length || (tokens.length < 2 && (!cue || tokens[0].length < 5))) return false
                        return query.includes(" " + tokens.join(" ") + " ")
                    })
            )
            .slice(0, 5)
    }
}

export function spokenReference(text: string, books: { number: number; name: string; customName?: string; abbreviation?: string }[]): { book: number; chapter: number; verse: number } | null {
    const normalized = normalizeNumbers(text.normalize("NFC")).toLocaleLowerCase()
    for (const book of books) {
        for (const alias of bookAliases(book.number, book.name, book.customName, book.abbreviation).sort((a, b) => b.length - a.length)) {
            const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            const expression = new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}])${escaped}\\s+(?:(?:chapter|அதிகாரம்|පරිච්ඡේදය)\\s+)?(\\d+)\\s*(?::|\\.|(?:verses?|வசனம்|පදය|වසනය)\\s+|\\s+)(\\d+)(?!\\d)`, "iu")
            const match = normalized.match(expression)
            if (match) return { book: book.number, chapter: Number(match[1]), verse: Number(match[2]) }
        }
    }
    return null
}
