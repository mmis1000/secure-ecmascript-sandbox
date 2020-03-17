// @ts-check

import SES from '../lib/sandbox.js'

async function main() {
    const remote = /** @type {any} */(window).remote = await SES.fastInit(window, (ctx) => {
        ctx.registerWellKnownValue('Array', Array)
        ctx.registerWellKnownValue('Object.prototype', Object.prototype)
    }, (ctx) => {
        ctx.registerWellKnownValue('Array', Array)
        ctx.registerWellKnownValue('Object.prototype', Object.prototype)
    })

    remote.console = console
    remote.main = window
    remote.eval(`
    console.log('running in remote: main.Array === Array is', main.Array === Array)

    Object.prototype.foo = 'test'
    console.log('showing distorted prototype: ', main.foo)

    debugger

    //# sourceURL=sandbox:/test.js
`)
    console.log('showing non-distorted prototype: ', /** @type {any} */(window).foo)

    console.log('running in local: Array === remote.Array is', Array === remote.Array)
}

main()
