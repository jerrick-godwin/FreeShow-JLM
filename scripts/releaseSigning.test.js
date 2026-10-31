const { test } = require("node:test")
const assert = require("node:assert/strict")
const { checkCredentials } = require("./checkSigningCredentials")
test("signed builds fail before building when credentials are absent", () => {
    assert.throws(() => checkCredentials("darwin", {}), /APPLE_TEAM_ID/)
    assert.throws(() => checkCredentials("win32", {}), /CSC_LINK/)
    assert.throws(() => checkCredentials("linux", {}), /native/)
})
test("Mac releases require notarization credentials in addition to a certificate", () => {
    const env = { CSC_LINK: "certificate", CSC_KEY_PASSWORD: "password" }
    assert.doesNotThrow(() => checkCredentials("win32", env))
    assert.throws(() => checkCredentials("darwin", env), /APPLE_ID/)
    assert.doesNotThrow(() => checkCredentials("darwin", { ...env, APPLE_ID: "account", APPLE_APP_SPECIFIC_PASSWORD: "password", APPLE_TEAM_ID: "team" }))
})
