// @ts-check

import { createRealm } from '../lib/browserRealm.js'

async function main () {
    var s = /** @type {any} */(window).remote = await createRealm()
    s.console = console
    const test = new Int8Array(10)
    test[0] = 5
    s.test = test
    s.eval(`
        debugger;
        console.log("hi");
        console.log(test[0]);
        test.__proto__.hello = function () { console.log('first el is ' + this[0]) }
        test[0] = 6
        test.hello()

        const el = document.createElement('div')
        el.textContent = 'hello from iframe'
        document.body.appendChild(el)
    `)
    console.log(s.test[0], s.test.hello)
}

main()