import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ initialized: false, set: vi.fn(), commit: vi.fn(), install: vi.fn() }))
vi.mock("../data/store", () => ({ getStore: (id: string) => (id === "SETTINGS" ? { initialized: state.initialized } : { scriptures: {}, categories: {} }), _store: { SYNCED_SETTINGS: { set: state.set } } }))
vi.mock("../utils/files", () => ({ getDataFolderRoot: () => "/chosen-library" }))
vi.mock("./resources", () => ({ bundledPath: () => "/bundled" }))
vi.mock("./library", () => ({ installLibrary: state.install }))
import { ensureBundledLibrary } from "./bootstrap"
beforeEach(() => {
    vi.clearAllMocks()
    state.initialized = false
    state.install.mockReturnValue({ changed: true, songs: 1, bibles: 3, settings: { scriptures: { offline: { name: "Offline" } }, categories: {} }, commit: state.commit })
})
it("waits for an explicit folder choice or setup completion on a new installation", () => {
    expect(ensureBundledLibrary()).toBe(false)
    expect(state.install).not.toHaveBeenCalled()
})
it("installs into the explicitly chosen folder and commits only after saving settings", () => {
    expect(ensureBundledLibrary(true)).toBe(true)
    expect(state.install).toHaveBeenCalledWith("/bundled", "/chosen-library", { scriptures: {}, categories: {} })
    expect(state.set).toHaveBeenCalledTimes(2)
    expect(state.commit).toHaveBeenCalledOnce()
    expect(state.set.mock.invocationCallOrder[1]).toBeLessThan(state.commit.mock.invocationCallOrder[0])
})
it("adds the bundle on startup for an initialized installation", () => {
    state.initialized = true
    expect(ensureBundledLibrary()).toBe(true)
})
