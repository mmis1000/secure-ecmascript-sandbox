// @ts-check

import SES from '../lib/sandbox.js'


async function main() {
    const remote = /** @type {any} */(window).remote = await SES.fastInit(window, (ctx) => {
        const originalAttachShadow = Element.prototype.attachShadow

        const shadowRootMap = new WeakMap()

        const wrappedAttachShadow = new Proxy(originalAttachShadow, {
            apply (target, thisArg, argArray) {
                try {
                    const res = Reflect.apply(originalAttachShadow, thisArg, argArray)
                    shadowRootMap.set(thisArg, res)
                    return res
                } catch (err) {
                    throw err
                }
            }
        })

        Element.prototype.attachShadow = wrappedAttachShadow

        ctx.registerTrapHooks({
            get(targetWrap, keyWrap, _) {
                const { value: key, success: success1 } = ctx.unwrap(keyWrap)
                const { value: self, success: success2 } = ctx.unwrap(targetWrap)

                if (!success1 || !success2) {
                    return
                }

                if (self instanceof Element) {
                    if (key === 'openOrClosedShadowRoot') {
                        if (shadowRootMap.has(self)) {
                            return {
                                success: true,
                                value: ctx.toWrapper(shadowRootMap.get(self), ctx.world)
                            }
                        }
                    }
                }
            },
            getOwnPropertyDescriptor (targetWrap, keyWrap) {
                const { value: key, success: success1 } = ctx.unwrap(keyWrap)
                const { value: self, success: success2 } = ctx.unwrap(targetWrap)

                if (!success1 || !success2) {
                    return
                }

                if (self instanceof Element) {
                    if (key === 'openOrClosedShadowRoot') {
                        if (shadowRootMap.has(self)) {
                            return {
                                success: true,
                                value: ctx.toRecord({
                                    value: shadowRootMap.get(self)
                                }, ctx.world)
                            }
                        }
                    }
                }
            }
        })
    })

    remote.console = console

    const div = document.createElement('div')
    document.body.appendChild(div)
    const s = div.attachShadow({ mode: 'closed' })

    // @ts-ignore
    console.log(typeof div.openOrClosedShadowRoot, div.openOrClosedShadowRoot)
    remote.div = div

    remote.eval(`
        console.log(typeof div.openOrClosedShadowRoot, div.openOrClosedShadowRoot)
        //# sourceURL=sandbox:/test.js
    `)
}

main()