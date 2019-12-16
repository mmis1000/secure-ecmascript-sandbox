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
    toRecord,
    currentWorld
) => {
    registerTrapHooks({
        apply (target, thisArg, argArray) {
            if (unwrap(target) === fetch) {
                return {
                    success: false,
                    value: toWrapper(new Error('calling not allowed'), currentWorld)
                }
            }
        }
    })
})

remote.main = window
remote.console = console

remote.eval(`
    const fetch = main.fetch
    console.log('store pointer is fine')

    fetch.a = 1
    console.log('set property on it is fine')

    fetch.a
    console.log('access property on it is fine', fetch.a)

    main.fetch2 = fetch
    console.log('set it on main window is fine')


    try {
        fetch()
    } catch (err) {
        console.error('call it will crash')
    }
`)

}