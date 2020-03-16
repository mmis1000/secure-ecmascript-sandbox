// @ts-check

import SES from '../lib/sandbox.js'
// force dev mode or it will not work because es import is disabled when iframe detached
SES.DEV = true
import { createRealm } from '../lib/browserRealm.js'

async function main () {
    var sandboxEval = /** @type {any} */(window).remoteEval = await createRealm()
    var sandbox = /** @type {any} */(window).remote = sandboxEval('new Proxy(window, {})')
    sandbox.console = console
    const test = new Int8Array(10)
    test[0] = 5
    sandbox.test = test

    const app = await sandboxEval(`
        console.log("hi");
        console.log(test[0]);
        test.__proto__.hello = function () { console.log('first el is ' + this[0]) }
        test[0] = 6
        test.hello()

        async function runVue () {
            const { default: Vue } = await import('${location.protocol}//${location.host}/${location.pathname.replace(/\/[^\/]+$/, '/')}/assets/vue.js')
            const { default: Vuetify } = await import('${location.protocol}//${location.host}/${location.pathname.replace(/\/[^\/]+$/, '/')}/assets/vuetify.js')

            Vue.use(Vuetify)

            return new Vue({
                el: '#app',
                data: {
                    message: 'Hello Vue.js!',
                    list: []
                },
                methods: {
                    add () { this.list.push({ id: Date.now(), value: Date.now().toString() }) },
                    remove () { this.list.pop() }
                },
                vuetify: new Vuetify({})
            })
        }

        runVue()
        
        //# sourceURL=sandbox:/test.js
    `)

    app.list.push({ id: 'outSide', value: 'objectFromOutSide' })

    console.log(sandbox.test[0], sandbox.test.hello)

    {
        var remote = sandboxEval('(function (cb) {return cb()})')
        var local = function () { return 1}
        console.profile()
        console.time()
        var a = 0
        for (let i = 0; i < 10000; i++) {
        a += remote(local)
        }
        console.log(a)
        console.timeEnd()
        //  workaround firefox bug
        setTimeout(() => {console.profileEnd()})
    }
}

main()