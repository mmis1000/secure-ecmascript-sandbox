// @ts-check

import SES from '../lib/sandbox.js'

async function main() {
    const remote = /** @type {any} */(window).remote = await SES.fastInit(window, (ctx) => {
        const innerHTMLSetter = ctx.shared.FReflect.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set

        ctx.registerTrapHooks({
            set(target, key, value, receiver) {
                if (
                    ctx.shared.getNodeName(ctx.unwrap(receiver).value) !== null
                ) {
                    return {
                        success: false,
                        value: ctx.toWrapper(new Error('calling set directly on dom element not allowed'), ctx.world)
                    }
                }
            },
            apply(target, thisArg, argArray) {
                if (ctx.unwrap(target).value === innerHTMLSetter) {
                    const htmlStr = String(ctx.unwrap(argArray).value[0])
                    const thisUnwrapped = ctx.unwrap(thisArg).value

                    let res
                    let success
                    try {
                        res = ctx.shared.FReflect.apply(innerHTMLSetter, thisUnwrapped, [htmlStr.replace(/foo/g, 'bar')])
                        success = true
                    } catch (err) {
                        res = err
                        success = false
                    }

                    return {
                        success,
                        value: ctx.toWrapper(res, ctx.world)
                    }
                }
            }
        })
    })

    remote.main = window
    remote.console = console

    remote.eval(`
    const el = main.document.createElement('div')
    el.innerHTML = 'I am foo'
    main.document.body.append(el)

    const innerHTMLSetter = Reflect.getOwnPropertyDescriptor(main.Element.prototype, 'innerHTML').set
    const el2 = main.document.createElement('div')
    Reflect.apply(innerHTMLSetter, el2, ['I am foo too'])
    main.document.body.append(el2)
`)
}
main()
