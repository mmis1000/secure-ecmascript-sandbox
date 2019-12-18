// @ts-check
/// <reference path="../src/sandbox.ts" />
/// <reference path="../src/interface.ts" />

{

const remote = /** @type {any} */(window).remote = window.SES.fastInit(window, (ctx) => {
    ctx.registerUnwrapCallback(obj => {
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
        console.error('call it will crash', err)
    }

    try {
        fetch.a
    } catch (err) {
        console.error('access property on it will crash', err)
    }

    try {
        main.fetch2 = fetch
    } catch (err) {
        console.error('assign it on main window will crash', err)
    }
`)

}