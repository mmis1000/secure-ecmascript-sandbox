// @ts-check
/// <reference path="../src/sandbox.ts" />
/// <reference path="../src/interface.ts" />

{

const remote = window.SES.fastInit(window, (
    registerMetaAttachCallback,
    registerCustomTrap,
    registerProxyInitCallback,
    registerUnwrapCallback,
    registerTrapHooks,
    shared,
    proxyToToken,
    tokenToProxy,
    realToToken,
    tokenToReal,
    unwrap,
    toWrapper,
    toRecord
) => {
    registerUnwrapCallback(obj => {
        if (obj === fetch) {
            throw new Error('now allowed')
        }
    })
})

remote.main = window
remote.console = console

remote.eval(`
    const fetch = main.fetch
    console.log('store pointer is fine')

    try {
        fetch()
    } catch (err) {
        console.error('call it will crash')
    }

    try {
        fetch.a
    } catch (err) {
        console.error('access property on it will crash')
    }

    try {
        main.fetch2 = fetch
    } catch (err) {
        console.error('assign it on main window will crash')
    }
`)

}