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

    let realm = sandboxGlobal.eval(fullScript)

    const remote = server.create(realm)
    remote.global = remote


    test('the sandboxed version and the original sandbox global are not the same', () => {
        expect(remote).not.toBe(sandboxGlobal)
    })

    test('the sandboxed version and the original sandbox global has same keys', () => {
        expect(Reflect.ownKeys(remote).length).toBe(Reflect.ownKeys(sandboxGlobal).length)
    })

    test('the sandboxed Error is instance of sandboxed Function', () => {
        expect(remote.Error).toBeInstanceOf(remote.Function)
    })

    test('the sandboxed Error is not instance of original Function', () => {
        expect(remote.Error).not.toBeInstanceOf(sandboxGlobal.Function)
    })

    test('primitive are simply send to the sandbox', () => {
        remote.foo = '1'
        expect(remote.foo).toBe(sandboxGlobal.foo)
        expect(sandboxGlobal.foo).toBe('1')
    })

    test('objects are wrapped forcibly when go through the membrane', () => {
        remote.bar = {}
        expect(remote.bar).not.toBe(sandboxGlobal.bar)
    })

    test('thrown error is wrapped when passing through the membrane', () => {
        try {
            remote.eval(`
                throw new Error()
            `)
        } catch (err) {
            expect(err).toBeInstanceOf(remote.Error)
        }
    })

    test('topology is preserved when passing through the membrane although their identity are not equal', () => {
        remote.eval(`
            global.obj = {}
            global.obj.a = global.obj
        `)

        expect(remote.obj).toBe(remote.obj.a)
        expect(sandboxGlobal.obj).toBe(sandboxGlobal.obj.a)
        expect(remote.obj).not.toBe(sandboxGlobal.obj)
    })

    test('you should be able to retrieve original object from the proxied sandbox if you set on it', () => {
        const obj2 = {}
        remote.obj2 = obj2

        expect(obj2).toBe(remote.obj2)

        expect(sandboxGlobal.obj2).not.toBeUndefined()
        expect(sandboxGlobal.obj2).not.toBe(obj2)
    })

    test('forward frozen', () => {
        remote.eval(`
            global.obj3 = { a: 1 }
            Object.freeze(global.obj3)
        `)
        expect(Object.isFrozen(remote.obj3)).toBe(true)
    })

    test('proxied array is array', () => {
        remote.eval(`
            global.obj4 = []
        `)

        expect(Array.isArray(remote.obj4)).toBe(true)
    })

    test('revoked proxy is revoked', () => {
        remote.eval(`
            const { proxy, revoke } = Proxy.revocable({}, {})
            revoke()

            global.obj5 = proxy
        `)

        expect(() => {
            Array.isArray(remote.obj5)
        }).toThrow()
    })
});