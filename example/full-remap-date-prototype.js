// @ts-check

import SES from '../lib/sandbox.js'

async function main() {
    const remote = /** @type {any} */(window).remote = await SES.fastInit(window, (ctx) => {
        ctx.registerMetaCallback(obj => {
            if (obj === Date.prototype) {
                return {
                    isDatePrototype: true
                }
            } else if (obj instanceof Date) {
                return {
                    isDate: true
                }
            } {
                return {}
            }
        })
    }, (ctx) => {
        const DateProto = Date.prototype
        const mappedDateToOriginalDate = new ctx.shared.FWeakMap()

        ctx.registerCustomProxyInit((token, proxy, originalHandlers, mappedHandlers) => {
            if (token.meta.isDatePrototype) {
                return Date.prototype
            } else if (token.meta.isDate) {
                const altered = ctx.shared.FCreateEmpty({})
                ctx.shared.FReflect.setPrototypeOf(altered, DateProto)
                ctx.shared.FBWeakMapSet(mappedDateToOriginalDate, altered, proxy)
                return altered
            }
        });

        /** @type {any} */(window).postProxyInit = function postProxyInit(datePrototypeDescriptors) {
            const keys = Reflect.ownKeys(datePrototypeDescriptors)

            for (let key of keys) {
                const originalDesc = Reflect.getOwnPropertyDescriptor(Date.prototype, key)
                const remoteDesc = datePrototypeDescriptors[key]

                if ('value' in originalDesc && typeof originalDesc.value === 'function') {
                    // wrap the function

                    const oldMethod = originalDesc.value
                    const remoteMethod = remoteDesc.value
                    const wrapper = new ctx.shared.FProxy(oldMethod, {
                        apply(target, thisArg, args) {
                            if (ctx.shared.FBWeakMapHas(mappedDateToOriginalDate, thisArg)) {
                                return ctx.shared.FReflect.apply(
                                    remoteMethod,
                                    ctx.shared.FBWeakMapGet(mappedDateToOriginalDate, thisArg),
                                    args
                                )
                            } else {
                                return ctx.shared.FReflect.apply(oldMethod, thisArg, args)
                            }
                        }
                    })

                    ctx.shared.FReflect.defineProperty(Date.prototype, key, {
                        ...originalDesc,
                        value: wrapper
                    })
                }
            }

            console.log('remap finished')
        }
    })

    remote.console = console

    const dateDescriptors = {}
    for (let key of Reflect.ownKeys(Date.prototype)) {
        dateDescriptors[key] = Reflect.getOwnPropertyDescriptor(Date.prototype, key)
    }
    remote.postProxyInit(dateDescriptors)

    const mainLandDate = remote.mainLandDate = new Date()

        ;/** @type {any} */(Date.prototype).world = 'test'

    remote.eval(`
        console.log('modified prototype do not exist in the sandbox', mainLandDate.world)

        console.log('call proxied date toISOString', mainLandDate.toISOString())
        const myDate = new Date()
        console.log('call local date toISOString', myDate.toISOString())
        console.log('proxied date and local date has same prototype', myDate.__proto__ === mainLandDate.__proto__)

        Date.prototype.hello = function () {
            return 'current time: ' + this.toString()
        }

        console.log('mainland date is instance of Date', mainLandDate instanceof Date)
        console.log('call method that does not exist on mainland do works', mainLandDate.hello())
    
        console.log("let's alter the mainland date")
        mainLandDate.hacked = true
        console.log("and it behaves like we did", mainLandDate.hacked)
        console.log("and lets do it really bad  by nuke the prototype")

        mainLandDate.__proto__ = null

        debugger

        //# sourceURL=sandbox:/test.js
    `)

    console.log('prototype still exist', mainLandDate.toISOString())
    console.log('modified prototype do not exist outside of sandbox', /** @type {any} */(mainLandDate).hello)
    console.log('And object itself is actually not edited', /** @type {any} */(mainLandDate).hacked)
}
main()