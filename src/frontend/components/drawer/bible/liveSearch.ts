import { bookAliases, normalizeBibleSearch } from "../../../../shared/bibleBooks"
import type { Bible } from "../../../../types/Bible"

export interface BibleSearchResult {
    book: number
    chapter: number
    reference: string
    verse: { number: number; text: string }
}
export interface BibleSearchResults {
    kind: "books" | "verses" | "reference" | "invalid"
    books: { number: number; name: string }[]
    verses: BibleSearchResult[]
}

export function searchLocalBible(bible: Bible, query: string, customNames: string[] = [], limit = 100): BibleSearchResults {
    const value = normalizeBibleSearch(query)
    const result: BibleSearchResults = { kind: "verses", books: [], verses: [] }
    if (!value) return result
    // Preserve the drawer's existing multi-chapter reference syntax.
    const segments = value.split(";").map((segment) => segment.trim())
    const firstBook = segments[0].match(/^(.+?)\s+\d/)
    const chapterRange = value.match(/^(.+?)\s+(\d+)\s*[-–]\s*(\d+)$/u)
    if (chapterRange) {
        const start = Number(chapterRange[2]),
            end = Number(chapterRange[3])
        if (!start || end < start || end > 200) return { ...result, kind: "invalid" }
        return searchLocalBible(bible, Array.from({ length: end - start + 1 }, (_, i) => `${chapterRange[1]} ${start + i}`).join(";"), customNames, limit)
    }
    if (segments.length > 1 && firstBook) {
        result.kind = "reference"
        for (const segment of segments) {
            if (!segment) return { ...result, kind: "invalid", verses: [] }
            const query = /^\d+(?:\s*[:.]|$)/.test(segment) ? `${firstBook[1]} ${segment}` : segment
            const match = searchLocalBible(bible, query, customNames, limit)
            if (match.kind !== "reference" || !match.verses.length || (result.verses.length && match.verses[0].book !== result.verses[0].book)) return { ...result, kind: "invalid", verses: [] }
            result.verses.push(...match.verses)
        }
        result.verses = result.verses.filter((verse, i, values) => values.findIndex((other) => other.book === verse.book && other.chapter === verse.chapter && other.verse.number === verse.verse.number) === i)
        return result
    }
    const reference = value.match(/^(.+?)\s+(\d+)(?:\s*[:.,]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/u)
    const name = reference?.[1] || value
    const matches = bible.books.filter((book, i) => bookAliases(book.number, book.name, book.customName, book.abbreviation, customNames[i]).some((a) => a === name || (name.length >= 2 && a.startsWith(name))))
    if (!reference && matches.length) {
        result.kind = "books"
        result.books = matches.map((book) => ({ number: book.number, name: customNames[bible.books.indexOf(book)] || book.customName || book.name }))
        return result
    }
    if (reference) {
        result.kind = "invalid"
        const exact = matches.filter((book) => bookAliases(book.number, book.name, book.customName, book.abbreviation, customNames[bible.books.indexOf(book)]).includes(name))
        const books = exact.length ? exact : matches.length === 1 ? matches : []
        const chapterNumber = Number(reference[2])
        const first = reference[3] ? Number(reference[3]) : undefined
        const last = reference[4] ? Number(reference[4]) : first
        for (const book of books) {
            const chapter = book.chapters.find((c) => c.number === chapterNumber)
            if (!chapter || (first !== undefined && (!first || last! < first || !chapter.verses.some((v) => v.number === first) || !chapter.verses.some((v) => v.number === last)))) continue
            result.kind = "reference"
            for (const verse of chapter.verses) {
                if (first !== undefined && (verse.number < first || verse.number > last!)) continue
                result.verses.push({ book: book.number, chapter: chapter.number, reference: `${book.customName || book.name} ${chapter.number}:${verse.number}`, verse })
            }
        }
        return result
    }
    // Literal text matching: punctuation and markup do not obstruct an otherwise exact phrase.
    if (value.length < 2) return result
    for (const book of bible.books) {
        for (const chapter of book.chapters) {
            for (const verse of chapter.verses) {
                const text = normalizeBibleSearch(verse.text.replace(/<[^>]*>/g, " "))
                if (!text.includes(value)) continue
                result.verses.push({ book: book.number, chapter: chapter.number, reference: `${book.customName || book.name} ${chapter.number}:${verse.number}`, verse })
                if (result.verses.length >= limit) return result
            }
        }
    }
    return result
}
