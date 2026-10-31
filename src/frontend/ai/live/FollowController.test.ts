import { describe, expect, it, vi } from "vitest"
import { FollowController } from "./FollowController"
import type { LiveDocument, TimedTranscriptSegment } from "../../../types/ai/Live"
const texts = ["Amazing grace how sweet the sound", "That saved a wretch like me", "Holy holy Lord God Almighty", "Praise forever heaven and earth", "Holy holy Lord God Almighty"]
const document: LiveDocument = { id: "song:one", kind: "song", label: "Test song", positions: texts.map((text, index) => ({ text, index, id: String(index) })) }
const event = (id: number, text: string, final = true): TimedTranscriptSegment => ({ sessionId: "audio", id: String(id), revision: 1, final, text, startMs: id * 1000, endMs: id * 1000 + 500 })
function harness() {
    const presented: string[] = []
    let allowed = true
    const changed = vi.fn()
    const controller = new FollowController({
        allowed: () => allowed,
        publish: async (_document, position, _session, current) => {
            if (current()) presented.push(position.id)
        },
        changed,
        error: vi.fn()
    })
    return { controller, presented, lock: () => (allowed = false), unlock: () => (allowed = true) }
}
describe("confirmed live following", () => {
    it("starts only on acceptance, follows stable adjacent lyrics and ignores interim revisions", async () => {
        const { controller, presented } = harness()
        await controller.ingest(event(1, texts[1]))
        expect(presented).toEqual([])
        await controller.start(document, "0", ["main"])
        await controller.ingest(event(2, texts[1], false))
        expect(presented).toEqual(["0"])
        await controller.ingest(event(2, texts[1]))
        expect(presented).toEqual(["0", "1"])
        await controller.ingest(event(2, texts[1]))
        expect(presented).toHaveLength(2)
    })
    it("requires repeated evidence for skipped/backward positions and holds ambiguous choruses", async () => {
        const { controller, presented } = harness()
        await controller.start(document, "0", ["main"])
        await controller.ingest(event(1, texts[3]))
        expect(presented).toEqual(["0"])
        await controller.ingest(event(2, texts[3]))
        expect(presented).toEqual(["0", "3"])
        await controller.ingest(event(3, texts[4]))
        expect(presented).toEqual(["0", "3", "4"])
        await controller.ingest(event(4, texts[4]))
        expect(presented).toHaveLength(3)
        await controller.ingest(event(5, texts[0]))
        expect(presented).toHaveLength(3)
        await controller.ingest(event(6, texts[0]))
        expect(presented.at(-1)).toBe("0")
    })
    it("does not publish while paused, locked, stopped, or on unrelated speech", async () => {
        const { controller, presented, lock, unlock } = harness()
        await controller.start(document, "0", ["main"])
        controller.pause()
        await controller.ingest(event(1, texts[1]))
        expect(presented).toEqual(["0"])
        controller.resume()
        lock()
        await controller.ingest(event(2, texts[1]))
        expect(controller.session?.state).toBe("paused")
        unlock()
        await controller.ingest(event(3, texts[1]))
        expect(presented).toEqual(["0"])
        controller.resume()
        await controller.ingest(event(4, "Would someone please open the door"))
        expect(presented).toEqual(["0"])
        controller.stop()
        await controller.ingest(event(5, texts[1]))
        expect(presented).toEqual(["0"])
    })
    it("cancels an in-flight render on manual pause or a new acceptance", async () => {
        let finish: (() => void) | undefined
        const presented: string[] = []
        const controller = new FollowController({
            allowed: () => true,
            publish: async (_document, position, _session, current) => {
                await new Promise<void>((resolve) => (finish = resolve))
                if (current()) presented.push(position.id)
            },
            changed: vi.fn(),
            error: vi.fn()
        })
        const starting = controller.start(document, "0", ["main"])
        controller.pause("Manual navigation")
        finish!()
        await starting
        expect(presented).toEqual([])
    })
    it("waits for fresh evidence before restoring the current position after manual navigation", async () => {
        const { controller, presented } = harness()
        await controller.start(document, "0", ["main"])
        controller.pause()
        controller.resume()
        expect(presented).toEqual(["0"])
        await controller.ingest(event(1, texts[0]))
        expect(presented).toEqual(["0", "0"])
    })
    it("accepts explicit verse progression only within the pinned passage", async () => {
        const { controller, presented } = harness()
        await controller.start({ ...document, kind: "scripture" }, "0", ["main"])
        await controller.ingest(event(1, "verse four"), "3")
        expect(presented).toEqual(["0", "3"])
        await controller.ingest(event(2, "another book"), "not-in-this-chapter")
        expect(presented).toHaveLength(2)
    })
})
