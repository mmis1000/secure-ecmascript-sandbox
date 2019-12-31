import { API, ValueWrapper, Response, Token, ProxyHandlers, ResponseFailed } from "./interface"
import * as SES from "./sandbox"

export const createRealm = async () => {
    type KeyValueList = (string | [string, any])[]

    let ESGlobal!: KeyValueList

    let documentMeta!: {
        descriptors: any,
        prototype: any,
        isExtensible: boolean
    }

    const preservedKeys = new Set()
    /**
     * original prototype to preserved prototype descriptors
     */
    const preservedServerMeta = new WeakMap<any, {
        descriptors: any,
        prototype: any,
        isExtensible: boolean
    }>()

    let isShadowTarget: any

    const createBrowserRealmServer: API.ConfigureCallback = function (ctx) {

        isShadowTarget = (v: any) => ctx.proxyToToken.has(v) || ctx.redirectedToToken.has(v)

        // If it is class, remap it
        // If the class has prototype, remap it
        // If it is function, remap it
        // Ban all traps except prototype that need to be remapped
    
    
        ESGlobal = [
            // *** 18.1 Value Properties of the Global Object
            'Infinity',
            'NaN',
            'undefined',
        
            // *** 18.2 Function Properties of the Global Object
            'eval', // dangerous
            'isFinite',
            'isNaN',
            'parseFloat',
            'parseInt',
            'decodeURI',
            'decodeURIComponent',
            'encodeURI',
            'encodeURIComponent',
        
            // *** 18.3 Constructor Properties of the Global Object
            'Array',
            'ArrayBuffer',
            'Boolean',
            'DataView',
            'Date', // Unstable
            'Error', // Unstable
            'EvalError',
            'Float32Array',
            'Float64Array',
            'Function', // dangerous

            ['TypedArray', Reflect.getPrototypeOf(Int8Array)],

            'Int8Array',
            'Int16Array',
            'Int32Array',

            'Map',
            'Number',
            'Object',
            'Promise', // Unstable
            'Proxy', // Unstable
            'RangeError',
            'ReferenceError',
            'RegExp', // Unstable
            'Set',
            'SharedArrayBuffer',
            'String',
            'Symbol',
            'SyntaxError',
            'TypeError',

            'Uint8Array',
            'Uint8ClampedArray',
            'Uint16Array',
            'Uint32Array',

            'URIError',
            'WeakMap',
            'WeakSet',
        
            // *** 18.4 Other Properties of the Global Object
            'Atomics',
            'JSON',
            'Math',
            'Reflect',
        
            // *** Annex B
            'escape',
            'unescape',
        
            // *** ECMA-402
            'Intl', // Unstable
    
            ['GeneratorFunction', (function * () {}).constructor],
            ['AsyncFunction', (async function () {}).constructor],
            ['ArrayIteratorPrototype', Reflect.getPrototypeOf([].values())],
        ]
    
        // various of class that has special prototype method which needs internal slot support
        const allowPrototypeMethods: KeyValueList = [
            'ArrayBuffer',
            'DataView',
            'Date', // Unstable
            'Map',

            ['TypedArray', Reflect.getPrototypeOf(Int8Array)],

            'Int8Array',
            'Int16Array',
            'Int32Array',

            'RegExp', // Unstable
            'Set',
            'SharedArrayBuffer',

            'Uint8Array',
            'Uint8ClampedArray',
            'Uint16Array',
            'Uint32Array',

            'WeakMap',
            'WeakSet',
    
            // from mdn
            ['Intl.Collator', Intl.Collator],
            ['Intl.DateTimeFormat', Intl.DateTimeFormat],
            ['Intl.ListFormat', (Intl as any).ListFormat],
            ['Intl.Locale', (Intl as any).Locale],
            ['Intl.NumberFormat', Intl.NumberFormat],
            ['Intl.PluralRules', Intl.PluralRules],
            ['Intl.RelativeTimeFormat', (Intl as any).RelativeTimeFormat],
    
            ['GeneratorFunction', (function * () {}).constructor],
            ['AsyncFunction', (async function () {}).constructor],
        ]
    
        const allowOnlyCalled = new Set()
        const banned = new Set()
        const idToObject = new Map()
        const objectToId = new Map()
    
        const banAndMap = (key: string, value: any) => {
            if ((typeof value === 'object' || typeof value === 'function') && value != null) {
                banned.add(value)
                idToObject.set(key, value)
                objectToId.set(value, key)
            }
        }
    
        const ban = (value: any) => {
            if ((typeof value === 'object' || typeof value === 'function') && value != null) {
                banned.add(value)
            }
        }
    
        const allowOnlyCallIfFunction = (fn: any) => {
            if (typeof fn === 'function' && !banned.has(fn)) {
                allowOnlyCalled.add(fn)
            }
        }
    
        const getMeta = (obj: any) => {
            const descriptors = Object.create(null)
    
            for (let propertyKey of Reflect.ownKeys(obj)) {
                const desc = Reflect.getOwnPropertyDescriptor(obj, propertyKey)!
                descriptors[propertyKey] = desc
    
                allowOnlyCallIfFunction(desc.value)
                allowOnlyCallIfFunction(desc.get)
                allowOnlyCallIfFunction(desc.set)
            }
    
            const prototype = Reflect.getPrototypeOf(obj)
            const isExtensible = Reflect.isExtensible(obj)
    
            return {
                descriptors,
                prototype,
                isExtensible
            }
        }
    
        // remap es global
        for (let item of ESGlobal) {
            let key: string
            let value: any
            if (typeof item === 'string') {
                key = item
                value = (globalThis as any)[key]
            } else {
                key = item[0]
                value = item[1]
            }
    
            if (value != null && (typeof value === 'object' || typeof value === 'function')) {
                banAndMap(key, value)
    
                for (let propertyKey of Reflect.ownKeys(value)) {
                    if (propertyKey === 'prototype') {
                        banAndMap(key + '.' + propertyKey, value.prototype)
                    } else {
                        ban(value[propertyKey])
                    }
                }
            }
        }
    
        // preserve prototype methods only when required
        for (let item of allowPrototypeMethods) {
            let key: string
            let value: any
            if (typeof item === 'string') {
                key = item
                value = (globalThis as any)[key]
            } else {
                key = item[0]
                value = item[1]
            }
    
            if (value != null && (typeof value === 'object' || typeof value === 'function')) {
                if (value.prototype) {
                    preservedKeys.add(value.prototype)

                    const descriptors = Object.create(null)
    
                    for (let propertyKey of Reflect.ownKeys(value.prototype)) {
                        const desc = Reflect.getOwnPropertyDescriptor(value.prototype, propertyKey)!
                        descriptors[propertyKey] = desc
    
                        allowOnlyCallIfFunction(desc.value)
                        allowOnlyCallIfFunction(desc.get)
                        allowOnlyCallIfFunction(desc.set)
                    }
    
                    const prototype = Reflect.getPrototypeOf(value)
                    const isExtensible = Reflect.isExtensible(value)
    
                    preservedServerMeta.set(value.prototype, getMeta(value.prototype))
                }
            }
        }
    
        // anything other
        const mapped = new WeakSet([...banned, ...allowOnlyCalled] as any)
    
        const map = (value: any, key = '') => {
            if (value == null || (typeof value !== 'function' && typeof value !== 'object')) {
                return
            }
    
            if (mapped.has(value)) {
                return
            }
    
            mapped.add(value)
    
            const meta = getMeta(value)
    
            preservedServerMeta.set(value, meta)
    
            map(Reflect.getPrototypeOf(value))
    
            for (let key of Reflect.ownKeys(value)) {
                var desc = Reflect.getOwnPropertyDescriptor(value, key)!
    
                map(desc.value)
                map(desc.get)
                map(desc.set)
            }
        }
    
        map(window)

    
        const TypedArray = Reflect.getPrototypeOf(Uint8Array)
        function allowDirectPass (obj: any) {
            return obj instanceof (TypedArray as any) || Array.isArray(obj) // don't care, just pass the array
        }

        // specially handle document
        idToObject.set('document', document)
        objectToId.set(document, 'document')
        documentMeta = getMeta(document)

        // specially handle window
        idToObject.set('window', window)
        objectToId.set(window, 'window')
    
        console.log(preservedServerMeta, allowOnlyCalled, banned, idToObject, objectToId)
    
        for (let [id, value] of idToObject) {
            ctx.registerWellKnownValue(id, value)
        }
    
        const accessTokenMap = new WeakMap<any, {
            descriptors: any,
            prototype: any,
            isExtensible: boolean
        }>()
    
        ctx.registerMetaCallback((obj) => {
            if (!mapped.has(obj)) {
                if (!allowDirectPass(obj)) {
                    map(obj)
                }
    
                mapped.add(obj)
            }
    
            if (preservedServerMeta.has(obj)) {
                const token = Object.create(null)
                accessTokenMap.set(token, preservedServerMeta.get(obj)!)

                mapped.add(token);

                const vWrapper = ctx.toWrapper(token, ctx.world)
    
                return {
                    remapToken: vWrapper
                }
            }
        })
    
        ctx.registerUnwrapCallback((val) => {
            if (banned.has(val)) {
                // debugger
                // throw new Error('forbidden')
            }
        })
    
        const failIfBannedOrCallOnly = (token: ValueWrapper): undefined | ResponseFailed<ValueWrapper> => {
            const unwrapResult = ctx.unwrap(token)
    
            if (unwrapResult.success) {
                if (banned.has(unwrapResult.value) || allowOnlyCalled.has(unwrapResult.value)) {
                    debugger
                    return {
                        success: false,
                        value: ctx.toWrapper(new Error('not allowed'), ctx.world)
                    }
                }
            }
        }
    
        const failIfBanned = (token: ValueWrapper): undefined | ResponseFailed<ValueWrapper> => {
            const unwrapResult = ctx.unwrap(token)
    
            if (unwrapResult.success) {
                if (banned.has(unwrapResult.value)) {
                    debugger
                    return {
                        success: false,
                        value: ctx.toWrapper(new Error('not allowed'), ctx.world)
                    }
                }
            }
        }
    
        ctx.registerTrapHooks({
            apply: failIfBanned,
            construct: failIfBannedOrCallOnly,
    
            set: failIfBannedOrCallOnly,
            get: failIfBannedOrCallOnly,
            has: failIfBannedOrCallOnly,
            deleteProperty: failIfBannedOrCallOnly,
            ownKeys: failIfBannedOrCallOnly,
    
            defineProperty: failIfBannedOrCallOnly,
            getOwnPropertyDescriptor: failIfBannedOrCallOnly,
    
            preventExtensions: failIfBannedOrCallOnly,
            isExtensible: failIfBannedOrCallOnly,
    
            getPrototypeOf: failIfBannedOrCallOnly,
            setPrototypeOf: failIfBannedOrCallOnly,
        })
    
        ctx.registerCustomTrap('getDesc', function (tokenWrapper, keyWrapper) {
            const { success: success1, value: token } = ctx.unwrap(tokenWrapper)
            const { success: success2, value: key } = ctx.unwrap(keyWrapper)
    
            if (!success1 || !success2 || !accessTokenMap.has(token)) {
                debugger
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            if (key in accessTokenMap.get(token)!.descriptors) {
                return {
                    success: true,
                    value: ctx.toRecord(accessTokenMap.get(token)!.descriptors[key], ctx.world)
                }
            } else {
                return {
                    success: true,
                    value: ctx.toWrapper(undefined, ctx.world)
                }
            }
        })
    
        ctx.registerCustomTrap('getOwnKeys', function (tokenWrapper) {
            const { success: success1, value: token } = ctx.unwrap(tokenWrapper)
    
            if (!success1 || !accessTokenMap.has(token)) {
                debugger
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            return {
                success: true,
                value: ctx.toRecord(Reflect.ownKeys(accessTokenMap.get(token)!.descriptors), ctx.world)
            }
        })
    
        ctx.registerCustomTrap('getProto', function (tokenWrapper) {
            const { success: success1, value: token } = ctx.unwrap(tokenWrapper)
    
            if (!success1 || !accessTokenMap.has(token)) {
                debugger
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            return {
                success: true,
                value: ctx.toWrapper(accessTokenMap.get(token)!.prototype, ctx.world)
            }
        })
    
        ctx.registerCustomTrap('getIsExt', function (tokenWrapper) {
            const { success: success1, value: token } = ctx.unwrap(tokenWrapper)
    
            if (!success1 || !accessTokenMap.has(token)) {
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            return {
                success: true,
                value: ctx.toWrapper(accessTokenMap.get(token)!.isExtensible, ctx.world)
            }
        })
    }

    const createBrowserRealmClient: API.ConfigureCallback = function (ctx) {
        const WeakMapHas = WeakMap.prototype.has;
        (window as any).isShadowTarget = (v: any) => Reflect.apply(WeakMapHas, ctx.proxyToToken, [v]) || Reflect.apply(WeakMapHas,ctx.redirectedToToken, [v])

        // If it is class, remap it
        // If the class has prototype, remap it
        // If it is function, remap it
        // Ban all traps except prototype that need to be remapped
    
        type KeyValueList = (string | [string, any])[]
    
        const ESGlobal: KeyValueList = [
            // *** 18.1 Value Properties of the Global Object
            'Infinity',
            'NaN',
            'undefined',
        
            // *** 18.2 Function Properties of the Global Object
            'eval', // dangerous
            'isFinite',
            'isNaN',
            'parseFloat',
            'parseInt',
            'decodeURI',
            'decodeURIComponent',
            'encodeURI',
            'encodeURIComponent',
        
            // *** 18.3 Constructor Properties of the Global Object
            'Array',
            'ArrayBuffer',
            'Boolean',
            'DataView',
            'Date', // Unstable
            'Error', // Unstable
            'EvalError',
            'Float32Array',
            'Float64Array',
            'Function', // dangerous

            ['TypedArray', Reflect.getPrototypeOf(Int8Array)],

            'Int8Array',
            'Int16Array',
            'Int32Array',

            'Map',
            'Number',
            'Object',
            'Promise', // Unstable
            'Proxy', // Unstable
            'RangeError',
            'ReferenceError',
            'RegExp', // Unstable
            'Set',
            'SharedArrayBuffer',
            'String',
            'Symbol',
            'SyntaxError',
            'TypeError',

            'Uint8Array',
            'Uint8ClampedArray',
            'Uint16Array',
            'Uint32Array',

            'URIError',
            'WeakMap',
            'WeakSet',
        
            // *** 18.4 Other Properties of the Global Object
            'Atomics',
            'JSON',
            'Math',
            'Reflect',
        
            // *** Annex B
            'escape',
            'unescape',
        
            // *** ECMA-402
            'Intl', // Unstable
    
            ['GeneratorFunction', (function * () {}).constructor],
            ['AsyncFunction', (async function () {}).constructor],
            ['ArrayIteratorPrototype', Reflect.getPrototypeOf([].values())],
        ]
    
        // various of class that has special prototype method which needs internal slot support
        const allowPrototypeMethods: KeyValueList = [
            'ArrayBuffer',
            'DataView',
            'Date', // Unstable
            'Map',

            ['TypedArray', Reflect.getPrototypeOf(Int8Array)],

            'Int8Array',
            'Int16Array',
            'Int32Array',

            'RegExp', // Unstable
            'Set',
            'SharedArrayBuffer',

            'Uint8Array',
            'Uint8ClampedArray',
            'Uint16Array',
            'Uint32Array',

            'WeakMap',
            'WeakSet',
    
            // from mdn
            ['Intl.Collator', Intl.Collator],
            ['Intl.DateTimeFormat', Intl.DateTimeFormat],
            ['Intl.ListFormat', (Intl as any).ListFormat],
            ['Intl.Locale', (Intl as any).Locale],
            ['Intl.NumberFormat', Intl.NumberFormat],
            ['Intl.PluralRules', Intl.PluralRules],
            ['Intl.RelativeTimeFormat', (Intl as any).RelativeTimeFormat],
    
            ['GeneratorFunction', (function * () {}).constructor],
            ['AsyncFunction', (async function () {}).constructor],
        ]
    
    
        /**
         * original prototype to preserved prototype descriptors
         */
        const preservedMeta = new WeakMap<any, {
            descriptors: any,
            prototype: any,
            isExtensible: boolean
        }>()
    
        const allowOnlyCalled = new Set()
        const banned = new Set()
        const idToObject = new Map()
        const objectToId = new Map()
    
        const banAndMap = (key: string, value: any) => {
            if ((typeof value === 'object' || typeof value === 'function') && value != null) {
                banned.add(value)
                idToObject.set(key, value)
                objectToId.set(value, key)
            }
        }
    
        const ban = (value: any) => {
            if ((typeof value === 'object' || typeof value === 'function') && value != null) {
                banned.add(value)
            }
        }
    
        const allowOnlyCallIfFunction = (fn: any) => {
            if (typeof fn === 'function' && !banned.has(fn)) {
                allowOnlyCalled.add(fn)
            }
        }
    
        const getMeta = (obj: any) => {
            const descriptors = Object.create(null)
    
            for (let propertyKey of Reflect.ownKeys(obj)) {
                const desc = Reflect.getOwnPropertyDescriptor(obj, propertyKey)!
                descriptors[propertyKey] = desc
    
                allowOnlyCallIfFunction(desc.value)
                allowOnlyCallIfFunction(desc.get)
                allowOnlyCallIfFunction(desc.set)
            }
    
            const prototype = Reflect.getPrototypeOf(obj)
            const isExtensible = Reflect.isExtensible(obj)
    
            return {
                descriptors,
                prototype,
                isExtensible
            }
        }
    
        // remap es global
        for (let item of ESGlobal) {
            let key: string
            let value: any
            if (typeof item === 'string') {
                key = item
                value = (globalThis as any)[key]
            } else {
                key = item[0]
                value = item[1]
            }
    
            if (value != null && (typeof value === 'object' || typeof value === 'function')) {
                banAndMap(key, value)
    
                for (let propertyKey of Reflect.ownKeys(value)) {
                    if (propertyKey === 'prototype') {
                        banAndMap(key + '.' + propertyKey, value.prototype)
                    } else {
                        ban(value[propertyKey])
                    }
                }
            }
        }
    
        // preserve prototype methods only when required
        for (let item of allowPrototypeMethods) {
            let key: string
            let value: any
            if (typeof item === 'string') {
                key = item
                value = (globalThis as any)[key]
            } else {
                key = item[0]
                value = item[1]
            }
    
            if (value != null && (typeof value === 'object' || typeof value === 'function')) {
                if (value.prototype) {
                    const descriptors = Object.create(null)
    
                    for (let propertyKey of Reflect.ownKeys(value.prototype)) {
                        const desc = Reflect.getOwnPropertyDescriptor(value.prototype, propertyKey)!
                        descriptors[propertyKey] = desc
    
                        allowOnlyCallIfFunction(desc.value)
                        allowOnlyCallIfFunction(desc.get)
                        allowOnlyCallIfFunction(desc.set)
                    }
    
                    const prototype = Reflect.getPrototypeOf(value)
                    const isExtensible = Reflect.isExtensible(value)
    
                    preservedMeta.set(value.prototype, getMeta(value.prototype))
                }
            }
        }

        // specially handle document
        idToObject.set('document', document)
        objectToId.set(document, 'document')

        // specially handle window
        idToObject.set('window', window)
        objectToId.set(window, 'window')
    
        console.log(preservedMeta, allowOnlyCalled, banned, idToObject, objectToId)
    
        for (let [id, value] of idToObject) {
            ctx.registerWellKnownValue(id, value)
        }

        ctx.registerUnwrapCallback((val) => {
            if (banned.has(val)) {
                // throw new Error('forbidden')
            }
        })

        const failIfBannedOrCallOnly = (token: ValueWrapper): undefined | ResponseFailed<ValueWrapper> => {
            const unwrapResult = ctx.unwrap(token)
    
            if (unwrapResult.success) {
                if (banned.has(unwrapResult.value) || allowOnlyCalled.has(unwrapResult.value)) {
                    debugger
                    return {
                        success: false,
                        value: ctx.toWrapper(new Error('not allowed'), ctx.world)
                    }
                }
            }
        }
    
        const failIfBanned = (token: ValueWrapper): undefined | ResponseFailed<ValueWrapper> => {
            const unwrapResult = ctx.unwrap(token)
    
            if (unwrapResult.success) {
                if (banned.has(unwrapResult.value)) {
                    debugger
                    return {
                        success: false,
                        value: ctx.toWrapper(new Error('not allowed'), ctx.world)
                    }
                }
            }
        }
    
        ctx.registerTrapHooks({
            apply: failIfBanned,
            construct: failIfBannedOrCallOnly,
    
            set: failIfBannedOrCallOnly,
            get: failIfBannedOrCallOnly,
            has: failIfBannedOrCallOnly,
            deleteProperty: failIfBannedOrCallOnly,
            ownKeys: failIfBannedOrCallOnly,
    
            defineProperty: failIfBannedOrCallOnly,
            getOwnPropertyDescriptor: failIfBannedOrCallOnly,
    
            preventExtensions: failIfBannedOrCallOnly,
            isExtensible: failIfBannedOrCallOnly,
    
            getPrototypeOf: failIfBannedOrCallOnly,
            setPrototypeOf: failIfBannedOrCallOnly,
        })

        ctx.registerCustomProxyInit((
            token: Token,
            originalProxy: any,
            originalHandlers: ProxyHandlers,
            preMappedHandlers: ProxyHandlers
        ) => {
            if (!token.meta.remapToken) return
            const remapToken = ctx.unwrap(token.meta.remapToken).value

            const fakeTarget = token.type === 'object' ? Object.create(null) : Object.setPrototypeOf(function () {}, null)

            let prototypeInitialized = false
            let fullInitialized = false
            const keyRecord = Object.create(null)

            const callUnwrapped = (fn: any, ...args: any[]) => {
                return ctx.unwrap(
                    fn(
                        ...args.map(i => ctx.toWrapper(i, ctx.world))
                    ).value
                ).value
            }

            const initPrototypeIfRequired = () => {
                if (prototypeInitialized) return

                const proto = callUnwrapped(token.owner.getCustomTrap('getProto'), remapToken)

                Reflect.setPrototypeOf(fakeTarget, proto)

                prototypeInitialized = true
            }

            const initKeyIfRequired = (key: string | symbol) => {
                if (fullInitialized || key in keyRecord) return

                initPrototypeIfRequired()

                keyRecord[key] = true

                const desc = callUnwrapped(token.owner.getCustomTrap('getDesc'), remapToken, key)

                if (desc != null) {
                    Reflect.defineProperty(
                        fakeTarget,
                        key,
                        callUnwrapped(token.owner.getCustomTrap('getDesc'), remapToken, key)
                    )
                }
            }

            const initFull = () => {
                if (fullInitialized) return

                const keys = callUnwrapped(token.owner.getCustomTrap('getOwnKeys'), remapToken)

                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i]

                    initKeyIfRequired(keys[i])
                }

                initPrototypeIfRequired()

                if (callUnwrapped(token.owner.getCustomTrap('getIsExt'), remapToken)) {
                    Reflect.preventExtensions(fakeTarget)
                }

                fullInitialized = true
            }

            const createLazyPropHandler = (fn: any) => {
                return (target: any, key: string | symbol, ...args: any) => {
                    initKeyIfRequired(key)
                    return fn(target, key, ...args)
                }
            }

            const createLazyHandler = (fn: any) => {
                return (target: any, ...args: any) => {
                    initFull()
                    return fn(target, ...args)
                }
            }

            const proxy = new Proxy(fakeTarget, {
                get: createLazyPropHandler(Reflect.get),
                set: createLazyPropHandler(Reflect.set),
                has: createLazyPropHandler(Reflect.has),
                getOwnPropertyDescriptor: createLazyPropHandler(Reflect.getOwnPropertyDescriptor),
                deleteProperty: createLazyPropHandler(Reflect.deleteProperty),

                getPrototypeOf: createLazyHandler(Reflect.getPrototypeOf),
                setPrototypeOf: createLazyHandler(Reflect.setPrototypeOf),
                ownKeys: createLazyHandler(Reflect.ownKeys),

                apply: preMappedHandlers.apply,
                construct: preMappedHandlers.construct,

                preventExtensions: createLazyHandler(Reflect.preventExtensions),
                isExtensible: createLazyHandler(Reflect.isExtensible),
            })

            return proxy
        })
    }

    const sandboxEval = await SES.fastInit(null, createBrowserRealmServer, createBrowserRealmClient, 'new Proxy(eval, {})')
    const sandbox = sandboxEval('new Proxy(window, {})')

    const receiver = sandboxEval(`
        'use strict';

        const isShadowTarget = window.isShadowTarget;
        delete window.isShadowTarget;

        (${((proto: any, descriptors: any) => {
            for (let key of Reflect.ownKeys(descriptors)) {
                const original = Reflect.getOwnPropertyDescriptor(proto, key)!

                const shadow = descriptors[key]
                const remap = (fn: any, shadowFn: any) => {
                    if (typeof fn !== 'function') return fn

                    const proxy = new Proxy(fn, {
                        apply (target, thisArg, args) {
                            if (isShadowTarget(thisArg)) {
                                return Reflect.apply(shadowFn, thisArg, args)
                            } else {
                                return Reflect.apply(fn, thisArg, args)
                            }
                        }
                    })

                    return proxy
                }

                let remappedDesc

                // debugger
                if ('value' in original) {
                    remappedDesc = {
                        ...original,
                        value: original.value && remap(original.value, shadow.value)
                    }
                } else {
                    remappedDesc = {
                        ...original,
                        get: original.get && remap(original.get, shadow.get),
                        set: original.set && remap(original.set, shadow.set)
                    }
                }

                Reflect.defineProperty(proto, key, remappedDesc)
            }
        }).toString()})
    `)

    for (let key of preservedKeys) {
        receiver(key, preservedServerMeta.get(key)!.descriptors)
    }

    const documentReceiver = sandboxEval(`
        'use strict';

        (${((descriptors: any, proto: any) => {
            for (let key of Reflect.ownKeys(descriptors)) {
                const shadow = descriptors[key]
                if (shadow.configurable) {
                    Reflect.defineProperty(window.document, key, shadow)
                }
            }

            Reflect.setPrototypeOf(window.document, proto)
        }).toString()})
    `)

    documentReceiver(documentMeta.descriptors, documentMeta.prototype)

    const preservedWindowKeys: any[] = []

    for (let item of ESGlobal) {
        if (typeof item === 'string') {
            preservedWindowKeys.push(item)
        }
    }

    // window -> window prototype -> constructor
    Reflect.defineProperty(sandbox.Window.prototype, 'constructor', Reflect.getOwnPropertyDescriptor(Window.prototype, 'constructor')!)

    // window -> window prototype -> window properties -> event target prototype
    for (let key of Reflect.ownKeys(EventTarget.prototype)) {
        Reflect.defineProperty(sandbox.EventTarget.prototype, key, Reflect.getOwnPropertyDescriptor(EventTarget.prototype, key)!)
    }

    // everything other
    for (let key of Reflect.ownKeys(window)) {
        if (key !== 'eval' && !preservedWindowKeys.includes(key) && Reflect.getOwnPropertyDescriptor(window, key)!.configurable) {
            // try {
                Reflect.defineProperty(sandbox, key, Reflect.getOwnPropertyDescriptor(window, key)!)
            // } catch (err) {}
        }
    }

    return sandboxEval
}