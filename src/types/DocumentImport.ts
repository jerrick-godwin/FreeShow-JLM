import type { Bible } from "./Bible"

export type ImportTarget = "songs" | "bible"
export type ImportLanguage = "eng" | "sin" | "tam"
export interface ExtractedDocument {
    name: string
    text: string
    extension: string
    warnings: string[]
}
export interface ImportCandidate {
    id: string
    title: string
    text: string
    source: string
    warnings: string[]
    metadata?: Record<string, string>
    bible?: Bible
}
export interface DocumentImportJob {
    id: string
    state: "running" | "complete" | "cancelled" | "failed"
    progress: number
    message: string
    documents: ExtractedDocument[]
    errors: string[]
}
export type ImportColumns = Partial<Record<"title" | "lyrics" | "book" | "chapter" | "verse" | "text", number>>
