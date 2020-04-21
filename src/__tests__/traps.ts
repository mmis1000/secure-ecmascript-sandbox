import SES from '../sandbox'

describe('basic', () => {
    const createRoot = SES.init()
    const server = createRoot(null)
    
    const rawRealGlobalExpr = `(0, eval)("'use strict'; this")`

    const { runInNewContext } = require('vm')

    let sandboxGlobal = runInNewContext(rawRealGlobalExpr)

    let fullScript = `
        "use strict";

        const SES = ${SES.createScript(SES)}

        const createRoot = SES.init()
        const server = createRoot(${rawRealGlobalExpr})
        server
    `
    
    /* istanbul ignore next */ if (process.env.NODE_ENV === 'test' && /cov_[a-zA-Z0-9]+/.test(fullScript)) {
        // use prebuilds
        /* istanbul ignore next */
        const preBuild = eval(`
            "use strict";
            const path = require('path')
            const file = require('fs').readFileSync(path.resolve(__dirname, '../__test_only__/dist.js'), { encoding: 'utf8' })
            file
        `)

        fullScript = `
            "use strict";

            const SES = ${preBuild}

            const createRoot = SES.init()
            const server = createRoot(${rawRealGlobalExpr})
            server
        `
    }

    sandboxGlobal.global = sandboxGlobal

    let realm = sandboxGlobal.eval(fullScript)

    const remote = server.create(realm)

    test('set', () => {
        remote.eval(`
            global.obj = {
                set prop2 (val) {
                    this._prop2 = val
                },
                get prop3 () {}
            }
        `)

        remote.obj.prop = 1
        expect(sandboxGlobal.obj.prop).toBe(1)

        remote.obj.prop2 = 2
        expect(sandboxGlobal.obj._prop2).toBe(2)

        expect(() => { remote.obj.prop3 = 3 }).toThrow()

        expect(sandboxGlobal.obj.notExist).toBe(undefined)
    })

    test('get', () => {
        remote.eval(`
            global.objProto = {
                get prop3 () {
                    return 3
                },
                set prop4 (val) {}
            }
            global.obj = {
                __proto__: global.objProto,
                prop: 1,
                get prop2 () {
                    return 2
                }
            }
        `)

        expect(remote.obj.prop).toBe(1)
        expect(remote.obj.prop2).toBe(2)
        expect(remote.obj.prop3).toBe(3)
        expect(remote.obj.prop4).toBe(undefined)
        expect(remote.obj.notExist).toBe(undefined)
    })

    test('has', () => {
        remote.eval('global.obj = ({ prop: 1 })')

        expect('prop' in remote.obj).toBe(true)
        expect('notExist' in remote.obj).toBe(false)
    })

    test('apply', () => {
        remote.eval('global.cb = (i) => i')

        const value = {}
        expect(remote.cb(value)).toBe(value)
    })

    test('construct', () => {
        remote.eval(`
            global.Container = class Container {
                constructor (value) {
                    this.value = value
                }
            }
        `)

        const value = {}
        expect((new remote.Container(value)).value).toBe(value)
    })

    test('defineProperty / getOwnPropertyDescriptor', () => {
        remote.eval('global.obj = ({})')

        const desc: PropertyDescriptor = {
            configurable: false,
            enumerable: true,
            writable: false,
            value: 'value'
        }

        Reflect.defineProperty(remote.obj, 'prop', desc)

        const desc2: PropertyDescriptor = {
            configurable: true,
            enumerable: false,
            get () {},
            set () {},
        }

        Reflect.defineProperty(remote.obj, 'prop2', desc2)

        expect(Reflect.getOwnPropertyDescriptor(remote.obj, 'prop')).toEqual(desc)
        expect(Reflect.getOwnPropertyDescriptor(remote.obj, 'prop2')).toEqual(desc2)
    })

    test('deleteProperty', () => {
        remote.eval('global.obj = { prop: 1}')

        delete remote.obj.prop

        expect(Reflect.getOwnPropertyDescriptor(remote.obj, 'prop')).toBe(undefined)

        remote.eval(`
            global.obj = {}

            const desc = {
                configurable: false,
                enumerable: true,
                writable: false,
                value: 'value'
            }
    
            Reflect.defineProperty(global.obj, 'prop', desc)
        `)

        expect(() => {
            "use strict"
            delete remote.obj.prop
        }).toThrow()
    })


    test('getPrototypeOf', () => {
        remote.eval(`
            global.Clazz = class Clazz {}
            global.obj = new Clazz
        `)

        expect(Reflect.getPrototypeOf(remote.obj)).toBe(remote.Clazz.prototype)
    })

    test('setPrototypeOf', () => {
        remote.eval(`
            global.Clazz = class Clazz {}
            global.obj = new Clazz
        `)

        const newProto = {}
        Reflect.setPrototypeOf(remote.obj, newProto)

        expect(Reflect.getPrototypeOf(remote.obj)).toBe(newProto)
    })

    test('preventExtension/isExtensible', () => {
        remote.eval('global.obj = {}')

        Reflect.preventExtensions(remote.obj)

        expect(() => {
            remote.eval(`
                if (Reflect.isExtensible(obj)) {
                    throw new Error('extensible')
                }
            `)
        }).not.toThrow()


        expect(Reflect.isExtensible(remote.obj)).toBe(false)
    })

    test('ownKeys', () => {
        remote.eval(`
            global.obj = { a: 0, b: 1, [Symbol.for('c')]: 1}
        `)

        expect(Reflect.ownKeys(remote.obj)).toContain('a')
        expect(Reflect.ownKeys(remote.obj)).toContain('b')
        expect(Reflect.ownKeys(remote.obj)).toContain(Symbol.for('c'))
    })
});