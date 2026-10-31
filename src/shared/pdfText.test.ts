import { expect, it } from "vitest"
import { extractPageText } from "./pdfText"
const item = (str: string, x: number, y: number) => ({ str, width: 80, transform: [1, 0, 0, 1, x, y] })
it("reads PDF text by position and keeps column songs separate", () => {
    const result = extractPageText([item("Right lyrics", 330, 700), item("Left lyrics", 30, 700), item("# Left", 30, 730), item("# Right", 330, 730)], 600)
    expect(result.columns).toBe(true)
    expect(result.text).toBe("# Left\nLeft lyrics\n\n# Right\nRight lyrics")
    expect(extractPageText([item("Second", 30, 700), item("First", 30, 730)], 600).text).toBe("First\nSecond")
})
