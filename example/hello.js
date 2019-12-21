// @ts-check

import SES from '../lib/sandbox.js'


const remote = /** @type {any} */(window).remote = SES.fastInit(window)

console.log(remote.document.title)
remote.eval(`window.document.title = 'test2'`)
console.log(remote.document.title)

remote.console = console
remote.main = window
remote.mainDoc = document
remote.eval(`
    const el = mainDoc.createElement('div')
    el.textContent = 123
    mainDoc.body.appendChild(el)

    class Test extends main.HTMLElement {
        constructor () {
            super()
            console.log('hi!')
        }

        connectedCallback() {
            console.log('Custom square element added to page.');
        }
    }

    main.customElements.define('my-test', Test);

    const el2 = new Test
    el2.textContent = 123
    mainDoc.body.appendChild(el2)
    mainDoc.body.appendChild(new Test)
    
    console.log(String(main))
    
    const obj = { err: 1 }

    function getHandler () {
        try {
            console.log(getHandler.caller)
        } catch (err) {
            // the error will be logged and be proxy
            console.log(err)
        }
        throw new Error('happy crash')
    }

    window.badObject = new Proxy(obj, {
        get: getHandler
    })

    function getLimit (depth = 1) {
        try {
            return getLimit(depth + 1)
        } catch (err) {
            return depth
        }
    }
    console.log(getLimit())
    let err
    function exhaust(depth, cb) {
        try {
            if (depth > 0) {
                exhaust(depth - 1, cb)
            } else {
                cb()
            }
        } catch (_err) {
            err =_err
        }
    }
    exhaust(getLimit(), main.fetch)
    console.log(
        err, 
        err instanceof RangeError, 
        typeof InternalError === 'undefined'
            ? 'not support'
            : err instanceof InternalError
        )

    debugger
`)

console.log(Object.keys(remote))

console.log(remote.Array.isArray(new remote.Array()))
console.log(Array.isArray(new remote.Array()))
console.log(remote.Array.isArray(new Array()))

try {
    console.log(remote.badObject.err)
} catch (err) {
    // this will be proxy
    console.log(err)
}