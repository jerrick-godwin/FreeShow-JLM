export interface TimedTranscriptSegment {
    sessionId: string
    id: string
    revision: number
    text: string
    final: boolean
    startMs: number
    endMs: number
    language?: string
    confidence?: number
    music?: boolean
}
export interface LivePosition {
    id: string
    text: string
    index: number
    reference?: { book: number; chapter: number; verse: number }
}
export interface LiveDocument {
    id: string
    kind: "song" | "scripture"
    label: string
    aliases?: string[]
    layoutId?: string
    positions: LivePosition[]
    versionId?: string
}
export interface LiveCandidate {
    id: string
    documentId: string
    positionId: string
    kind: "song" | "scripture"
    label: string
    excerpt: string
    confidence: number
    reason: "title" | "lyrics" | "reference" | "verse"
    timestamp: number
}
export interface FollowSession {
    id: string
    state: "following" | "paused" | "stopped"
    documentId: string
    kind: "song" | "scripture"
    label: string
    positionId: string
    outputIds: string[]
    reason?: string
}
export interface CaptionCue {
    sessionId: string
    segmentId: string
    revision: number
    text: string
    final: boolean
    expiresAt: number
    fontFamily?: string
    fontSize?: number
}
export interface LiveOptions {
    enabled?: boolean
    captions?: boolean
    outputIds?: string[]
    captionOutputIds?: string[]
    bibleId?: string
    fontFamily?: string
    fontSize?: number
}
