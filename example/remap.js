// @ts-check

import SES from '../lib/sandbox.js'

const remote = /** @type {any} */(window).remote = SES.fastInit(window, (ctx) => {
    ctx.registerMetaCallback(obj => {
        if (obj === Array) {
            return {
                isArray: true
            }
        } if (obj === Object.prototype) {
            return {
                isRoot: true
            }
        } else {
            return {}
        }
    })
}, (ctx) => {
    ctx.registerCustomProxyInit(token => {
        if (token.meta.isArray) {
            return Array
        } else if (token.meta.isRoot) {
            return Object.prototype
        }
    })
})

remote.console = console
remote.main = window
remote.eval(`
    console.log('running in remote: main.Array === Array is', main.Array === Array)

    Object.prototype.foo = 'test'
    console.log('showing distorted prototype: ', main.foo)

    debugger
`)
console.log('showing non-distorted prototype: ', /** @type {any} */(window).foo)

console.log('running in local: Array === remote.Array is', Array === remote.Array)
