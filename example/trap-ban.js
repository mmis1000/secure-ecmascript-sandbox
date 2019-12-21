// @ts-check

import SES from '../lib/sandbox.js'

const remote = /** @type {any} */(window).remote = SES.fastInit(window, (ctx) => {
    ctx.registerTrapHooks({
        apply (target, thisArg, argArray) {
            if (ctx.unwrap(target).value === fetch) {
                return {
                    success: false,
                    value: ctx.toWrapper(new Error('calling not allowed'), ctx.world)
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
        console.error('call it will crash', err)
    }
`)
