import {
    makeShared
} from './sharedFactory'

import {
    API,
    Token,
    Response,
    ValueWrapperRecord,
    ValueWrapperWellKnown,
    ValueWrapper,
    ResponseFailed,
    World,
} from './interface.js'

import {
    createProxyFactoryFactory
} from './proxyFactoryBuilder'

const SES = {
    makeShared,
    createProxyFactoryFactory,
    init,
    createScript,
    fastInit,
    fastInitNode,
    DEV: false
}

// this need to be run before any other script to get properly untainted global
export function init(configureCallback ?: API.ConfigureCallback) {
    'use strict';

    const createProxyFactory = SES.createProxyFactoryFactory(SES)

    // Must not use any global object
    // And using only the frozen object returns from makeShared
    const shared = SES.makeShared()

    // lock down options after this point
    shared.dropPrototypeRecursive(SES as any)

    const FArrayIsArray = shared.FArrayIsArray
    const FError = shared.FError

    const FMap = shared.FMap
    const FBMapSet = shared.FBMapSet
    const FBMapGet = shared.FBMapGet
    const FBMapHas = shared.FBMapHas

    const FWeakMap = shared.FWeakMap

    const FBWeakMapHas = shared.FBWeakMapHas
    const FBWeakMapSet = shared.FBWeakMapSet
    const FBWeakMapGet = shared.FBWeakMapGet

    const FReflect = shared.FReflect

    const FCreateEmpty = shared.FCreateEmpty

    const FBArrayMap = shared.FBArrayMap
    const FBArrayToIterator = shared.FBArrayToIterator

    const dropPrototypeRecursive = shared.dropPrototypeRecursive
    const safeGetProp = shared.safeGetProp

    return function createServer<T>(root: T, options: { fixInternalSlot: boolean} = { fixInternalSlot: false}) {
        const successVal = <T>(v: T) => ({
            success: true as const,
            value: v
        })
        const failVal = <T>(v: T) => ({
            success: false as const,
            value: v
        })
        // real object in this world to token
        const realToToken = new FWeakMap<object, Token>()

        // token to real object in this world
        const tokenToReal = new FWeakMap<Token, object>()

        // token from external world to proxy in this world
        const tokenToProxy = new FWeakMap<Token, object>()

        // proxy in this world to token from external
        const proxyToToken = new FWeakMap<object, Token>()

        // token from external world to proxy in this world
        const tokenToRedirected = new FWeakMap<Token, object>()

        // proxy in this world to token from external
        const redirectedToToken = new FWeakMap<object, Token>()

        // not freezing these until configure complete
        const metaAttachCallBacks: API.IMetaAttach<any>[] = []
        const proxyInitCallbacks: API.ICustomProxyInit[] = []
        const customTraps: Record<string, API.ICustomTrap> = {}
        const unwrapCallBacks: API.UnwrapCallBack[] = []
        const trapHooks: API.TrapHooks[] = []
        const wellKnownValues = new FMap<string | symbol, any>()
        const wellKnownValuesReversed = new FMap<any, string | symbol>()

        FReflect.setPrototypeOf(customTraps, null)

        const registerMetaCallback: API.RegisterMetaCallback = (cb) => {
            metaAttachCallBacks[metaAttachCallBacks.length] = cb
        }
        const registerCustomProxyInit: API.RegisterCustomProxyInit = (cb) => {
            proxyInitCallbacks[proxyInitCallbacks.length] = cb
        }
        const registerCustomTrap: API.RegisterCustomTrap = (str, cb) => {
            if (FReflect.getOwnPropertyDescriptor(customTraps, str)) {
                throw new FError(`trap ${str} already exists`)
            }

            customTraps[str] = (...args) => {
                try {
                    // enforce safety policy
                    const result = cb(...args)
                    dropPrototypeRecursive(result)
                    return result
                } catch (err) {
                    // this shouldn't happen
                    if (SES.DEV) debugger
                    return badPayload
                }
            }
        }
        const registerUnwrapCallback: API.RegisterUnwrapCallback = (cb) => {
            unwrapCallBacks[unwrapCallBacks.length] = cb
        }
        const registerTrapHooks: API.RegisterTrapHooks = (cb) => {
            trapHooks[trapHooks.length] = cb
        }
        const registerWellKnownValue: API.RegisterWellKnownValue = (key, value) => {
            FBMapSet(wellKnownValues, key, value)
            FBMapSet(wellKnownValuesReversed, value, key)
        }

        /**
         * get a safe token that represent this object
         * @param obj 
         */
        function toToken<T extends object>(obj: T, world: World, type: 'function' | 'object'): Token {
            if (redirectedToToken.has(obj)) {
                return redirectedToToken.get(obj)!
            }

            if (proxyToToken.has(obj)) {
                return proxyToToken.get(obj)!
            }

            if (realToToken.has(obj)) {
                return realToToken.get(obj)!
            }

            var token: Token = FCreateEmpty({})

            token.owner = world
            token.type = type

            // wtf?
            // https://tc39.es/ecma262/#sec-isarray
            // https://tc39.es/ecma262/#sec-proxy-revocation-functions

            try {
                token.isArray = FArrayIsArray(obj)
                token.isRevoked = false
            } catch (err) {
                token.isArray = false
                token.isRevoked = true
            }

            let meta = {}

            // hooks: attach metadata
            if (metaAttachCallBacks.length > 0) {
                for (let i = 0; i < metaAttachCallBacks.length; i++) {
                    let res
                    try {
                        res = metaAttachCallBacks[i](obj)
                    } catch (err) {
                        // mock the error
                        debugger
                        throw 'Token creation error'
                    }
                    meta = { ...meta, ...res }
                }
            }
            // hooks end: attach metadata

            token.meta = meta
            token.functionHasNoPrototype = false

            if (type === 'function') {
                const desc = FReflect.getOwnPropertyDescriptor(obj, 'prototype')
                if (desc == null) {
                    token.functionHasNoPrototype = true
                } else if (desc.configurable) {
                    token.functionHasNoPrototype = true
                }
            }

            token.REALLY_DANGEROUS_INVOKE_WITH_RAW_THIS = (self, ...argsWrapped) => {
                try {
                    for (let i = 0; i < trapHooks.length; i++) {
                        var hook = trapHooks[i]
                        if (hook.dangerousApply) {
                            const res = hook.dangerousApply(self, obj, argsWrapped)
                            if (res != null) {
                                return res
                            }
                        }
                    }
                } catch (err) {
                    return failVal(toWrapper(err, currentWorld))
                }

                try {
                    const argsRes = FBArrayMap(argsWrapped, i => unwrap(i))
                    for (let i of FBArrayToIterator(argsRes)) {
                        if (!i.success) {
                            throw new Error('bad input')
                        }
                    }
                    const args = FBArrayMap(argsRes, i => i.value)
                    const res = FReflect.apply(self, obj, args)
                    return successVal(toWrapper(res, currentWorld))
                } catch (err) {
                    return failVal(toWrapper(err, currentWorld))
                }
            }

            dropPrototypeRecursive(token.REALLY_DANGEROUS_INVOKE_WITH_RAW_THIS)

            FBWeakMapSet(realToToken, obj, token)
            FBWeakMapSet(tokenToReal, token, obj)

            return token
        }

        function unwrapToken(token: Token): Response<any, any> {
            if (FBWeakMapHas(tokenToReal, token)) {
                const real = FBWeakMapGet(tokenToReal, token)
                for (let i = 0; i < unwrapCallBacks.length; i++) {
                    try {
                        unwrapCallBacks[i](real)
                    } catch (err) {
                        // return it is allowed because user do allowed to do it
                        return {
                            success: false,
                            value: err
                        }
                    }
                }
                return {
                    success: true,
                    value: real
                }
            }

            if (FBWeakMapHas(tokenToRedirected, token)) {
                return {
                    success: true,
                    value: FBWeakMapGet(tokenToRedirected, token)
                }
            }

            if (FBWeakMapHas(tokenToProxy, token)) {
                return {
                    success: true,
                    value: FBWeakMapGet(tokenToProxy, token)
                }
            }

            // to fake
            const type: string | null = FReflect.get(token, 'type')
            const world: World = FReflect.get(token, 'owner')

            if (world === currentWorld) {
                return {
                    success: true,
                    value: new FError('Unexpected owner of current world')
                }
            }

            switch (type) {
                case 'function':
                    return {
                        success: true,
                        value: createProxy(token)
                    }
                case 'object':
                    return {
                        success: true,
                        value: createProxy(token)
                    }
                default:
                    return {
                        success: true,
                        value: new FError('bad type')
                    }
            }
        }

        function toWrapper(obj: any, world: World): ValueWrapper {
            // skip all following process if the value is `well known`
            if (FBMapHas(wellKnownValuesReversed, obj)) {
                return {
                    type: 'well-known',
                    value: FBMapGet(wellKnownValuesReversed, obj)
                }
            }

            if (obj === null) {
                return {
                    type: 'primitive',
                    value: obj
                }
            }

            switch (typeof obj) {
                case 'bigint':
                case 'boolean':
                case 'number':
                case 'string':
                case 'symbol':
                    return {
                        type: 'primitive',
                        value: obj
                    }
                case 'undefined':
                    return {
                        type: 'primitive',
                        value: undefined // thanks to document.all
                    }
                case 'function':
                    return {
                        type: 'function',
                        value: toToken(obj, world, 'function')
                    }
                case 'object':
                    return {
                        type: 'object',
                        value: toToken(obj, world, 'object')
                    }
                default:
                    throw new FError('how is this possible?')
            }
        }

        function toRecord(obj: any, world: World): ValueWrapper {
            const keys = FReflect.ownKeys(obj)
            const target: ValueWrapperRecord = FCreateEmpty({}) as any
            target.type = 'record'
            target.value = FCreateEmpty({})

            for (let key of FBArrayToIterator(keys)) {
                // symbol bug
                target.value[key as any] = toWrapper(obj[key], world)
            }

            return target
        }

        function unwrap(unsafeObj: ValueWrapper): Response<any, any> {
            switch (safeGetProp(unsafeObj, 'type')) {
                case 'primitive':
                    const value = safeGetProp(unsafeObj, 'value')

                    if (value != null && (typeof value === 'function' || typeof value === 'object')) {
                        return failVal(new FError('bad'))
                    }

                    return successVal(value)
                case 'function':
                case 'object': {
                    const result = unwrapToken(safeGetProp(unsafeObj, 'value') as any)
                    if (result.success) {
                        return successVal(result.value)
                    } else {
                        return failVal(result.value)
                    }
                }
                case 'record': {
                    const result = FCreateEmpty({})
                    const value = safeGetProp(unsafeObj, 'value') as { [key: string]: ValueWrapper }

                    for (let key of FBArrayToIterator(FReflect.ownKeys(value))) {
                        // symbol bug
                        const res = unwrap(value[key as any])
                        if (res.success) {
                            result[key] = res.value
                        } else {
                            return failVal(res.value)
                        }
                    }

                    return successVal(result)
                }

                case 'well-known': {
                    const value = safeGetProp(unsafeObj as ValueWrapperWellKnown, 'value')!
                    const result = FBMapGet(wellKnownValues, value)

                    for (let i = 0; i < unwrapCallBacks.length; i++) {
                        try {
                            unwrapCallBacks[i](result)
                        } catch (err) {
                            // return it is allowed because user do allowed to do it
                            return {
                                success: false,
                                value: err
                            }
                        }
                    }

                    return successVal(result)
                }

                default:
                    return failVal(new FError('bad wrapper'))
            }
        }

        // this need to be initialized outside of service catch, so it can't throw yet another stack overflow
        const badPayload: ResponseFailed<ValueWrapper> = dropPrototypeRecursive({
            success: false,
            value: {
                type: 'primitive',
                value: 'Internal Error'
            }
        })

        type MapToWrapper<T> = {
            [Key in keyof T]: ValueWrapper
        }

        type BeArray<T> = T extends any[] ? T : never

        function createHandler<
            T extends keyof typeof FReflect,
            U extends (typeof FReflect)[T],
            V extends BeArray<MapToWrapper<Parameters<U>>>,
            >(key: T) {
            return function (...args: V) {
                try {
                    for (let i = 0; i < trapHooks.length; i++) {
                        if ((trapHooks[i] as any)[key]) {
                            const fn = (trapHooks[i] as any)[key]
                            const res = fn(...args)
                            if (res != null) {
                                return dropPrototypeRecursive(res)
                            }
                        }
                    }

                    const unwrappedRes: Response<any, any>[] = FBArrayMap(args, (i: ValueWrapper) => unwrap(i))

                    for (let item of FBArrayToIterator(unwrappedRes)) {
                        if (!item.success) {
                            return failPayload(item)
                        }
                    }

                    const unwrapped = FBArrayMap(unwrappedRes, (i: Response<any, any>) => i.value)

                    let value: any
                    let success: boolean

                    // start of zone that user mat throw error
                    try {
                        value = FReflect.apply(FReflect[key], null, unwrapped)
                        success = true
                    } catch (err) {
                        // return this is okay
                        success = false
                        value = err
                    }

                    // end of zone

                    return dropPrototypeRecursive({
                        success,
                        value: toWrapper(value, currentWorld)
                    })
                } catch (err) {
                    // just don't touch any function because it may cause yet another stack overflow here
                    if (SES.DEV) debugger
                    return badPayload
                }
            }
        }

        const failPayload = <T>(arg: ResponseFailed<T>): ResponseFailed<ValueWrapper> => {
            var wrapped = toWrapper(arg.value, currentWorld)
            return {
                success: false,
                value: wrapped
            }
        }

        // These shouldn't leak refs
        const currentWorld: World = {
            create(world: World) {
                let res
                try {
                    res = unwrap(world.getRoot().value)
                } catch (err) {
                    // this shouldn't happen
                    if (SES.DEV) debugger
                    throw new Error('failed create')
                }

                if (res.success) {
                    return res.value
                } else {
                    throw res.value
                }
            },
            getRoot() {
                try {
                    return dropPrototypeRecursive({
                        success: true,
                        value: toWrapper(root, currentWorld)
                    })
                } catch (err) {
                    // this simply shouldn't happen, so we ate it
                    if (SES.DEV) debugger
                    return badPayload
                }
            },
            getCustomTrap (name) {
                return customTraps[name]
            },

            // TODO: redo with custom resolve
            trap_get: createHandler('get'),

            // TODO: redo with custom resolve
            trap_set: createHandler('set'),

            // trap_getOwnPropertyDescriptor: createHandler('getOwnPropertyDescriptor'),
            trap_getOwnPropertyDescriptor(tokenW: ValueWrapper, keyW: ValueWrapper) {
                try {
                    for (let i = 0; i < trapHooks.length; i++) {
                        const fn = trapHooks[i].getOwnPropertyDescriptor
                        if (fn) {
                            const res = fn(tokenW, keyW)
                            if (res != null) {
                                return dropPrototypeRecursive(res)
                            }
                        }
                    }

                    const tokenT = unwrap(tokenW)
                    const keyT = unwrap(keyW)

                    if (!tokenT.success) return failPayload(tokenT)
                    if (!keyT.success) return failPayload(keyT)

                    let value: any
                    let success: boolean
                    // start of zone that user mat throw error
                    try {
                        value = FReflect.getOwnPropertyDescriptor(tokenT.value, keyT.value)
                        success = true
                    } catch (err) {
                        // forward user error
                        success = false
                        value = err
                    }

                    return dropPrototypeRecursive({
                        success,
                        value: success && typeof value === 'object' ? toRecord(value, currentWorld) : toWrapper(value, currentWorld)
                    })
                } catch (err) {
                    // just don't touch any function because it may cause yet another stack overflow here
                    if (SES.DEV) debugger
                    return badPayload
                }
            },

            trap_ownKeys (tokenW: ValueWrapper) {
                try {
                    for (let i = 0; i < trapHooks.length; i++) {
                        const fn = trapHooks[i].ownKeys
                        if (fn) {
                            const res = fn(tokenW)
                            if (res != null) {
                                return dropPrototypeRecursive(res)
                            }
                        }
                    }

                    const token = unwrap(tokenW)
                    if (!token.success) return failPayload(token)

                    let value: any
                    let success: boolean
                    // start of zone that user mat throw error
                    try {
                        value = FReflect.ownKeys(token.value)
                        success = true
                    } catch (err) {
                        // forward user error
                        success = false
                        value = err
                    }

                    return dropPrototypeRecursive({
                        success,
                        value: success ? toRecord(value, currentWorld) : toWrapper(value, currentWorld)
                    })
                } catch (err) {
                    // just don't touch any function because it may cause yet another stack overflow here
                    if (SES.DEV) debugger
                    return badPayload
                }
            },

            trap_apply: createHandler('apply'),

            trap_construct: createHandler('construct'),

            trap_getPrototypeOf: createHandler('getPrototypeOf'),

            trap_defineProperty: createHandler('defineProperty'),

            trap_setPrototypeOf: createHandler('setPrototypeOf'),

            trap_isExtensible: createHandler('isExtensible'),

            trap_preventExtensions: createHandler('preventExtensions'),

            trap_has: createHandler('has'),

            trap_deleteProperty: createHandler('deleteProperty')
        }

        dropPrototypeRecursive(currentWorld)

        const createProxy = createProxyFactory(
            shared,
            unwrap,
            toWrapper,
            toRecord,
            currentWorld,
            proxyToToken,
            tokenToProxy,
            redirectedToToken,
            tokenToRedirected,
            proxyInitCallbacks
        )

        if (configureCallback != null) {
            configureCallback({
                registerMetaCallback,
                registerCustomTrap,
                registerCustomProxyInit,
                registerUnwrapCallback,
                registerTrapHooks,
                registerWellKnownValue,
                shared,
                proxyToToken,
                tokenToProxy,
                tokenToRedirected,
                redirectedToToken,
                realToToken,
                tokenToReal,
                unwrap,
                toWrapper,
                toRecord,
                world: currentWorld
            })
        }

        function wrapMethodAndInvokeThisAsRaw (func: (...any: any[]) => any) {
            var wrapped = new Proxy(func, {
                apply (target, self, args) {
                    if (!FBWeakMapHas(proxyToToken, self) && !FBWeakMapHas(redirectedToToken, self)) {
                        return FReflect.apply(func, self, args)
                    } else {
                        let token!: Token
                        if (FBWeakMapHas(proxyToToken, self)) {
                            token = FBWeakMapGet(proxyToToken, self)
                        } else {
                            token = FBWeakMapGet(redirectedToToken, self)
                        }

                        const wrappedArgs = FBArrayMap(args, (i) => toWrapper(i, currentWorld))

                        try {
                            const res = token.REALLY_DANGEROUS_INVOKE_WITH_RAW_THIS(func, ...FBArrayToIterator(wrappedArgs))
                            

                            if (res.success) {
                                let { success, value } = unwrap(res.value)
                                if (success) {
                                    return value
                                } else {
                                    throw value
                                }
                            } else {
                                let { success, value } = unwrap(res.value)
                                if (success) {
                                    return value
                                } else {
                                    throw value
                                }
                            }
                        } catch (err) {
                            let message = 'internal crash'
                            try {
                                message = err.message
                            } finally {
                                throw new Error(message)
                            }
                        }
                    }
                }
            })

            return wrapped
        }

        if (options.fixInternalSlot) {
            for (let obj of FBArrayToIterator(shared.whitelistedPrototypes)) {
                for (let key of FBArrayToIterator(FReflect.ownKeys(obj))) {
                    if (key === 'constructor') {
                        continue // we should not patch the constructor for obvious reason
                    }

                    const desc = FReflect.getOwnPropertyDescriptor(obj, key)
                    if (!desc) continue

                    FReflect.setPrototypeOf(desc, null)

                    if (FReflect.getOwnPropertyDescriptor(desc, 'value')) {
                        // has value
                        if (typeof desc.value === 'function') {
                            FReflect.defineProperty(obj, key, {
                                ...desc,
                                value: wrapMethodAndInvokeThisAsRaw(desc.value)
                            })
                        }

                    } else {
                        // has getter/setter
                        if (typeof desc.set === 'function') {
                            FReflect.defineProperty(obj, key, {
                                ...desc,
                                set: wrapMethodAndInvokeThisAsRaw(desc.set)
                            })
                        }
                        if (typeof desc.get === 'function') {
                            FReflect.defineProperty(obj, key, {
                                ...desc,
                                get: wrapMethodAndInvokeThisAsRaw(desc.get)
                            })
                        }
                    }
                }
            }
        }

        dropPrototypeRecursive(metaAttachCallBacks)
        dropPrototypeRecursive(proxyInitCallbacks)
        dropPrototypeRecursive(customTraps)
        dropPrototypeRecursive(unwrapCallBacks)
        dropPrototypeRecursive(trapHooks)

        return currentWorld
    }
}

export function createScript(obj: any) {
    const keys = Object.keys(obj)

    let text = `
        (function (SES) {
            "use strict";
    `

    for (let key of keys) {
        text += `
            const ${key} = ${Reflect.apply(
                typeof obj[key] === 'function'
                    ? Function.prototype.toString
                    : typeof obj[key] === 'boolean'
                        ? Boolean.prototype.toString
                        : Object.prototype.toString
                , 
                obj[key], 
                []
            )}
        `
    }

    for (let key of keys) {
        text += `
            SES.${key} = ${key}
        `
    }

    text += `            
            return SES
        })({})
    `

    return text
}

/* istanbul ignore next */ export async function fastInit(
    root: any,
    configureCallback ?: API.ConfigureCallback,
    remoteConfigureCallback ?: API.ConfigureCallback | string,
    remoteRootExpr = "globalThis",
    options: { fixInternalSlot: boolean} = { fixInternalSlot: false}
) {
    let iframe = document.createElement('iframe')

    iframe.src = 'about:blank'
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    iframe.style.display = 'none'

    document.body.append(iframe)

    await Promise.race([
        new Promise(resolve => iframe.onload = resolve),
        new Promise(resolve => setTimeout(resolve, 100))
    ])

    const createRoot = init(configureCallback)
    const server = createRoot(root, options)

    let realm = (iframe.contentWindow as any).eval(`
        "use strict";

        const SES = ${createScript(SES)}

        const createRoot = SES.init(${remoteConfigureCallback ? remoteConfigureCallback.toString() : ''})
        const server = createRoot(${remoteRootExpr}, ${JSON.stringify(options)})
        server

        //# sourceURL=sandbox-service:/SES.js
    `)

    delete (iframe.contentWindow as any).opener

    const remote = server.create(realm)

    if (SES.DEV) {
        console.error('iframe is not detached in DEV mode')
    } else {
        // say good bye to the iframe, even ourself can't access the `real` sandbox object after this point
        iframe.remove()
    }

    return remote
}

export function fastInitNode(root: any, configureCallback ?: API.ConfigureCallback, remoteConfigureCallback ?: API.ConfigureCallback | string) {
    const createRoot = init(configureCallback)
    const server = createRoot(root)

    const rawRealGlobalExpr = `(0, eval)("'use strict'; this")`

    let script = createScript(SES)

    let fullScript = `
        "use strict";

        const SES = ${script}

        const createRoot = SES.init(${remoteConfigureCallback ? remoteConfigureCallback.toString() : ''})
        const server = createRoot(${rawRealGlobalExpr})
        server
    `

    /* istanbul ignore next */ if (process.env.NODE_ENV === 'test' && /cov_[a-zA-Z0-9]+/.test(fullScript)) {
        // use prebuilds
        /* istanbul ignore next */
        const preBuild = eval(`
            "use strict";
            const path = require('path')
            const file = require('fs').readFileSync(path.resolve(__dirname, './__test_only__/dist.js'), { encoding: 'utf8' })
            file
        `)

        fullScript = `
            "use strict";

            const SES = ${preBuild}

            const createRoot = SES.init(${remoteConfigureCallback ? remoteConfigureCallback.toString() : ''})
            const server = createRoot(${rawRealGlobalExpr})
            server
        `
    }

    const { runInNewContext } = require('vm')

    let sandboxGlobal = runInNewContext(rawRealGlobalExpr)

    let realm = sandboxGlobal.eval(fullScript)

    sandboxGlobal = null // throw the reference away

    const remote = server.create(realm)

    return remote
}

export default SES