// @ts-check

import { createRealm } from '../lib/browserRealm.js'

async function main () {
    var sandboxEval = /** @type {any} */(window).remoteEval = await createRealm()
    var sandbox = /** @type {any} */(window).remote = sandboxEval('new Proxy(window, {})')
    sandbox.console = console
    const test = new Int8Array(10)
    test[0] = 5
    sandbox.test = test

    const wait = sandboxEval(`
        debugger;
        console.log("hi");
        console.log(test[0]);
        test.__proto__.hello = function () { console.log('first el is ' + this[0]) }
        test[0] = 6
        test.hello()

        const el = document.createElement('div')
        el.textContent = 'hello from iframe'
        document.body.appendChild(el)

        async function runVue () {
            const { default: Vue } = await import('https://cdnjs.cloudflare.com/ajax/libs/vue/2.6.10/vue.esm.browser.js')
            window.app = new Vue({
                el: '#app',
                data: {
                    message: 'Hello Vue.js!',
                    list: []
                },
                methods: {
                    add () { this.list.push({ id: Date.now(), value: Date.now().toString() }) },
                    remove () { this.list.pop() }
                }
            })
        }

        (function (cb) {
            runVue().then(cb)
        })
    `)

    //the await on returned promise not work in outer realm because we did not remap the promise method in outer realm
    wait(() => {
        sandbox.app.list.push({ id: 'outSide', value: 'objectFromOutSide' })
    
        console.log(sandbox.test[0], sandbox.test.hello)
    })
}

main()