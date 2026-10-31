export interface PdfTextItem {
    str: string
    width: number
    transform: number[]
    hasEOL?: boolean
}

// Use coordinates rather than producer stream order. Suspected columns require review.
export function extractPageText(items: PdfTextItem[], pageWidth: number): { text: string; columns: boolean } {
    const rows: { y: number; items: PdfTextItem[] }[] = []
    for (const item of items) {
        if (!item.str.trim()) continue
        let row = rows.find((r) => Math.abs(r.y - item.transform[5]) < 3)
        if (!row) {
            row = { y: item.transform[5], items: [] }
            rows.push(row)
        }
        row.items.push(item)
    }
    rows.sort((a, b) => b.y - a.y)
    rows.forEach((row) => row.items.sort((a, b) => a.transform[4] - b.transform[4]))
    const splits: { row: number; x: number }[] = []
    rows.forEach((row, index) =>
        row.items.forEach((item, i) => {
            const next = row.items[i + 1]
            if (!next) return
            const end = item.transform[4] + item.width
            if (next.transform[4] - end > pageWidth * 0.08 && end < pageWidth * 0.65 && next.transform[4] > pageWidth * 0.45) splits.push({ row: index, x: (end + next.transform[4]) / 2 })
        })
    )
    const line = (values: PdfTextItem[]) => values.map((item) => item.str).join(" ")
    if (new Set(splits.map((split) => split.row)).size < 2) return { text: rows.map((row) => line(row.items)).join("\n"), columns: false }
    const boundary = splits.reduce((sum, split) => sum + split.x, 0) / splits.length
    const first = Math.min(...splits.map((split) => split.row)),
        last = Math.max(...splits.map((split) => split.row))
    const middle = rows.slice(first, last + 1)
    const left = middle.map((row) => line(row.items.filter((item) => item.transform[4] < boundary))).filter(Boolean)
    const right = middle.map((row) => line(row.items.filter((item) => item.transform[4] >= boundary))).filter(Boolean)
    return { text: [...rows.slice(0, first).map((row) => line(row.items)), ...left, "", ...right, ...rows.slice(last + 1).map((row) => line(row.items))].join("\n"), columns: true }
}
