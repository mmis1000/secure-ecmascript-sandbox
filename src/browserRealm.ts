import { API, ValueWrapper, Response, Token, ProxyHandlers, ResponseFailed } from "./interface"
import * as SES from "./sandbox"

type KeyValueList = (string | [string, any])[]

const getESGlobal = (): KeyValueList => {
    return [
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
}

const getSharedInit = (
    isShadowTargetContainer: {
        value?: {(v: any): boolean}
    },
    documentMetaContainer: {
        value ?: {
            descriptors: any,
            prototype: any,
            isExtensible: boolean
        }
    },

    ESGlobal: KeyValueList,

    idToObject: Map<any, any>,
    objectToId: Map<any, any>,

    allowOnlyCalled: Set<unknown>,
    banned: Set<unknown>,

    preservedMeta: WeakMap<any, {
        descriptors: any,
        prototype: any,
        isExtensible: boolean
    }>,
) => {
    return (ctx: Parameters<API.ConfigureCallback>[0]) => {
        const FBArrayToIterator = ctx.shared.FBArrayToIterator
        const FReflect = ctx.shared.FReflect
        const FBWeakMapHas = ctx.shared.FBWeakMapHas
        const FBWeakMapSet = ctx.shared.FBWeakMapSet
        const FBMapSet = ctx.shared.FBMapSet
        const FBSetAdd = ctx.shared.FBSetAdd
        const FBSetHas = ctx.shared.FBSetHas
        const FError = ctx.shared.FError
        const FCreateEmpty = ctx.shared.FCreateEmpty

        isShadowTargetContainer.value = (v: any) => FBWeakMapHas(ctx.proxyToToken, v) || FBWeakMapHas(ctx.redirectedToToken, v)

        const banAndMap = (key: string, value: any) => {
            if ((typeof value === 'object' || typeof value === 'function') && value != null) {
                FBSetAdd(banned, value)
                FBMapSet(idToObject, key, value)
                FBMapSet(objectToId, value, key)
            }
        }
    
        const ban = (value: any) => {
            if ((typeof value === 'object' || typeof value === 'function') && value != null) {
                FBSetAdd(banned, value)
            }
        }
    
        const allowOnlyCallIfFunction = (fn: any) => {
            if (typeof fn === 'function' && !banned.has(fn)) {
                FBSetAdd(allowOnlyCalled, fn)
            }
        }
    
        const getMeta = (obj: any) => {
            const descriptors = FCreateEmpty({})
    
            for (let propertyKey of FReflect.ownKeys(obj)) {
                const desc = FReflect.getOwnPropertyDescriptor(obj, propertyKey)!
                descriptors[propertyKey] = desc
    
                allowOnlyCallIfFunction(desc.value)
                allowOnlyCallIfFunction(desc.get)
                allowOnlyCallIfFunction(desc.set)
            }
    
            const prototype = FReflect.getPrototypeOf(obj)
            const isExtensible = FReflect.isExtensible(obj)
    
            return {
                descriptors,
                prototype,
                isExtensible
            }
        }
    
        // remap es global
        for (let item of FBArrayToIterator(ESGlobal)) {
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
    
                for (let propertyKey of FReflect.ownKeys(value)) {
                    if (propertyKey === 'prototype') {
                        banAndMap(key + '.' + propertyKey, value.prototype)
                    } else {
                        ban(value[propertyKey])
                    }
                }
            }
        }

        // specially handle document
        FBMapSet(idToObject, 'document', document)
        FBMapSet(objectToId, document, 'document')
        documentMetaContainer.value = getMeta(document)

        // specially handle window
        FBMapSet(idToObject, 'window', window)
        FBMapSet(objectToId, window, 'window')

        // specially handle Window prototype
        FBMapSet(idToObject, 'Window.prototype', Window.prototype)
        FBMapSet(objectToId, Window.prototype, 'Window.prototype')

        // specially handle Window properties
        FBMapSet(idToObject, 'WindowProperties', FReflect.getPrototypeOf(Window.prototype))
        FBMapSet(objectToId, FReflect.getPrototypeOf(Window.prototype), 'WindowProperties')

        // specially handle event target prototype
        FBMapSet(idToObject, 'EventTarget.prototype', EventTarget.prototype)
        FBMapSet(objectToId, EventTarget.prototype, 'EventTarget.prototype')

        for (let [id, value] of idToObject) {
            ctx.registerWellKnownValue(id, value)
        }

        ctx.registerUnwrapCallback((val) => {
            if (FBSetHas(banned, val)) {
                // debugger
                // throw new Error('forbidden')
            }
        })
    
        const failIfBannedOrCallOnly = (token: ValueWrapper): undefined | ResponseFailed<ValueWrapper> => {
            const unwrapResult = ctx.unwrap(token)
    
            if (unwrapResult.success) {
                if (FBSetHas(banned, unwrapResult.value) || FBSetHas(allowOnlyCalled, unwrapResult.value)) {
                    return {
                        success: false,
                        value: ctx.toWrapper(new FError('not allowed'), ctx.world)
                    }
                }
            }
        }
    
        const failIfBanned = (token: ValueWrapper): undefined | ResponseFailed<ValueWrapper> => {
            const unwrapResult = ctx.unwrap(token)
    
            if (unwrapResult.success) {
                if (FBSetHas(banned, unwrapResult.value)) {
                    return {
                        success: false,
                        value: ctx.toWrapper(new FError('not allowed'), ctx.world)
                    }
                }
            }
        }
    
        ctx.registerTrapHooks({
            apply: failIfBanned,
            construct: failIfBanned,
    
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
    
    }
}

const getServerInit = (
    isShadowTargetContainer: {
        value?: {(v: any): boolean}
    },

    documentMetaContainer: {
        value ?: {
            descriptors: any,
            prototype: any,
            isExtensible: boolean
        }
    },


    ESGlobal: KeyValueList,

    idToObject: Map<any, any>,
    objectToId: Map<any, any>,

    allowOnlyCalled: Set<unknown>,
    banned: Set<unknown>,

    preservedMeta: WeakMap<any, {
        descriptors: any,
        prototype: any,
        isExtensible: boolean
    }>
) => {
    return (ctx: Parameters<API.ConfigureCallback>[0]) => {
        const FBArrayToIterator = ctx.shared.FBArrayToIterator
        const FBSetToIterator = ctx.shared.FBSetToIterator
        const FReflect = ctx.shared.FReflect
        const FBWeakMapHas = ctx.shared.FBWeakMapHas
        const FBWeakMapSet = ctx.shared.FBWeakMapSet
        const FBWeakMapGet = ctx.shared.FBWeakMapGet
        const FBSetAdd = ctx.shared.FBSetAdd
        const FBSetHas = ctx.shared.FBSetHas
        const FBWeakSetAdd = ctx.shared.FBWeakSetAdd
        const FBWeakSetHas = ctx.shared.FBWeakSetHas
        const FWeakMap = ctx.shared.FWeakMap
        const FWeakSet = ctx.shared.FWeakSet
        const FCreateEmpty = ctx.shared.FCreateEmpty

        const allowOnlyCallIfFunction = (fn: any) => {
            if (typeof fn === 'function' && !FBSetHas(banned, fn)) {
                FBSetAdd(allowOnlyCalled, fn)
            }
        }
    
        const getMeta = (obj: any) => {
            const descriptors = FCreateEmpty({})
    
            for (let propertyKey of FBArrayToIterator(FReflect.ownKeys(obj))) {
                const desc = FReflect.getOwnPropertyDescriptor(obj, propertyKey)!
                descriptors[propertyKey] = desc
    
                allowOnlyCallIfFunction(desc.value)
                allowOnlyCallIfFunction(desc.get)
                allowOnlyCallIfFunction(desc.set)
            }
    
            const prototype = FReflect.getPrototypeOf(obj)
            const isExtensible = FReflect.isExtensible(obj)
    
            return {
                descriptors,
                prototype,
                isExtensible
            }
        }

        // anything other
        const mapped = new FWeakSet(FBArrayToIterator([...FBSetToIterator(banned), ...FBSetToIterator(allowOnlyCalled)]))
    
        const map = (value: any, key = '') => {
            if (value == null || (typeof value !== 'function' && typeof value !== 'object')) {
                return
            }
    
            if (FBWeakSetHas(mapped, value)) {
                return
            }
    
            FBWeakSetAdd(mapped, value)
    
            const meta = getMeta(value)
    
            FBWeakMapSet(preservedMeta, value, meta)
    
            map(FReflect.getPrototypeOf(value))
    
            for (let key of FReflect.ownKeys(value)) {
                var desc = FReflect.getOwnPropertyDescriptor(value, key)!
    
                map(desc.value)
                map(desc.get)
                map(desc.set)
            }
        }
    
        map(window)

    
        const NodeList = window.NodeList
        const HTMLCollection = window.HTMLCollection
        const CSSStyleDeclaration = window.CSSStyleDeclaration
        const NamedNodeMap = window.NamedNodeMap
        const DOMTokenList = window.DOMTokenList
        const CharacterData = window.CharacterData
        const TypedArray = FReflect.getPrototypeOf(Uint8Array)

        function allowDirectPass (obj: any) {
            return obj instanceof (TypedArray as any)
                || obj instanceof NodeList
                || obj instanceof HTMLCollection
                || obj instanceof CSSStyleDeclaration
                || obj instanceof NamedNodeMap
                || obj instanceof DOMTokenList
                || obj instanceof CharacterData
                || Array.isArray(obj) // don't care, just pass the array
        }

        const accessTokenMap = new FWeakMap<any, {
            descriptors: any,
            prototype: any,
            isExtensible: boolean
        }>()
    
        ctx.registerMetaCallback((obj) => {
            if (!FBWeakSetHas(mapped, obj)) {
                if (!allowDirectPass(obj)) {
                    map(obj)
                }
    
                FBWeakSetAdd(mapped, obj)
            }
    
            if (FBWeakMapHas(preservedMeta, obj)) {
                const token = FCreateEmpty({})
                FBWeakMapSet(accessTokenMap, token, FBWeakMapGet(preservedMeta, obj)!)

                FBWeakSetAdd(mapped, token);

                const vWrapper = ctx.toWrapper(token, ctx.world)
    
                return {
                    remapToken: vWrapper
                }
            }
        })

        ctx.registerCustomTrap('getDesc', function (tokenWrapper, keyWrapper) {
            const { success: success1, value: token } = ctx.unwrap(tokenWrapper)
            const { success: success2, value: key } = ctx.unwrap(keyWrapper)
    
            if (!success1 || !success2 || !accessTokenMap.has(token)) {
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            if (key in FBWeakMapGet(accessTokenMap, token)!.descriptors) {
                return {
                    success: true,
                    value: ctx.toRecord(FBWeakMapGet(accessTokenMap, token)!.descriptors[key], ctx.world)
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
    
            if (!success1 || !FBWeakMapHas(accessTokenMap, token)) {
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            return {
                success: true,
                value: ctx.toRecord(Reflect.ownKeys(FBWeakMapGet(accessTokenMap, token)!.descriptors), ctx.world)
            }
        })
    
        ctx.registerCustomTrap('getProto', function (tokenWrapper) {
            const { success: success1, value: token } = ctx.unwrap(tokenWrapper)
    
            if (!success1 || !FBWeakMapHas(accessTokenMap, token)) {
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            return {
                success: true,
                value: ctx.toWrapper(FBWeakMapGet(accessTokenMap, token)!.prototype, ctx.world)
            }
        })
    
        ctx.registerCustomTrap('getIsExt', function (tokenWrapper) {
            const { success: success1, value: token } = ctx.unwrap(tokenWrapper)
    
            if (!success1 || !FBWeakMapHas(accessTokenMap, token)) {
                return {
                    success: false,
                    value: ctx.toWrapper('wtf', ctx.world)
                }
            }
    
            return {
                success: true,
                value: ctx.toWrapper(FBWeakMapGet(accessTokenMap, token)!.isExtensible, ctx.world)
            }
        })
    }
}

const getClientInit = (
    isShadowTargetContainer: {
        value?: {(v: any): boolean}
    },

    documentMetaContainer: {
        value ?: {
            descriptors: any,
            prototype: any,
            isExtensible: boolean
        }
    },


    ESGlobal: KeyValueList,

    idToObject: Map<any, any>,
    objectToId: Map<any, any>,

    allowOnlyCalled: Set<unknown>,
    banned: Set<unknown>,

    preservedMeta: WeakMap<any, {
        descriptors: any,
        prototype: any,
        isExtensible: boolean
    }>
) => {
    return (ctx: Parameters<API.ConfigureCallback>[0]) => {
        const FBArrayToIterator = ctx.shared.FBArrayToIterator
        const FBArrayMap = ctx.shared.FBArrayMap
        const FReflect = ctx.shared.FReflect
        const FCreateEmpty = ctx.shared.FCreateEmpty

        ctx.registerCustomProxyInit((
            token: Token,
            originalProxy: any,
            originalHandlers: ProxyHandlers,
            preMappedHandlers: ProxyHandlers
        ) => {
            if (!token.meta.remapToken) return
            const remapToken = ctx.unwrap(token.meta.remapToken).value

            const fakeTarget = token.type === 'object' ? FCreateEmpty({}) : function () {}

            FReflect.setPrototypeOf(fakeTarget, null)

            let prototypeInitialized = false
            let fullInitialized = false
            const keyRecord = FCreateEmpty({})

            const callUnwrapped = (fn: any, ...args: any[]) => {
                return ctx.unwrap(
                    fn(
                        ...FBArrayToIterator(FBArrayMap(args, (i: any) => ctx.toWrapper(i, ctx.world)))
                    ).value
                ).value
            }

            const initPrototypeIfRequired = () => {
                if (prototypeInitialized) return

                const proto = callUnwrapped(token.owner.getCustomTrap('getProto'), remapToken)

                FReflect.setPrototypeOf(fakeTarget, proto)

                prototypeInitialized = true
            }

            const initKeyIfRequired = (key: string | symbol) => {
                if (fullInitialized || key in keyRecord) return

                initPrototypeIfRequired()

                keyRecord[key] = true

                const desc = callUnwrapped(token.owner.getCustomTrap('getDesc'), remapToken, key)

                if (desc != null) {
                    FReflect.defineProperty(
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

                if (!callUnwrapped(token.owner.getCustomTrap('getIsExt'), remapToken)) {
                    FReflect.preventExtensions(fakeTarget)
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
                get: createLazyPropHandler(FReflect.get),
                set: createLazyPropHandler(FReflect.set),
                has: createLazyPropHandler(FReflect.has),
                getOwnPropertyDescriptor: createLazyPropHandler(FReflect.getOwnPropertyDescriptor),
                deleteProperty: createLazyPropHandler(FReflect.deleteProperty),
                defineProperty: createLazyPropHandler(FReflect.defineProperty),

                getPrototypeOf: createLazyHandler(FReflect.getPrototypeOf),
                setPrototypeOf: createLazyHandler(FReflect.setPrototypeOf),
                ownKeys: createLazyHandler(FReflect.ownKeys),

                apply: preMappedHandlers.apply,
                construct: preMappedHandlers.construct,

                preventExtensions: createLazyHandler(FReflect.preventExtensions),
                isExtensible: createLazyHandler(FReflect.isExtensible),
            })

            return proxy
        })
    }
}

export const createRealm = async () => {

    let ESGlobal!: KeyValueList

    let documentMeta!: {
        descriptors: any,
        prototype: any,
        isExtensible: boolean
    }

    /**
     * original prototype to preserved prototype descriptors
     */
    const preservedMeta = new WeakMap<any, {
        descriptors: any,
        prototype: any,
        isExtensible: boolean
    }>()

    let isShadowTarget: any

    // because we can't get the direct reference to well known value either, we use `new Proxy` to bypass it
    const sandboxEval = await SES.fastInit(null, 
        (() => {
            ESGlobal = getESGlobal()

            const isShadowTargetContainer: any = {}
            const documentMetaContainer: any = {}
            const idToObject = new Map()
            const objectToId = new Map()
            const allowOnlyCalled = new Set()
            const banned = new Set()
            // const preservedMeta = new WeakMap()

            const sharedInit = getSharedInit(
                isShadowTargetContainer,
                documentMetaContainer,
                ESGlobal,
                idToObject,
                objectToId,
                allowOnlyCalled,
                banned,
                preservedMeta
            )

            const serverInit = getServerInit(
                isShadowTargetContainer,
                documentMetaContainer,
                ESGlobal,
                idToObject,
                objectToId,
                allowOnlyCalled,
                banned,
                preservedMeta
            )

            return (ctx: Parameters<API.ConfigureCallback>[0]) => {
                sharedInit(ctx);
                serverInit(ctx);
                isShadowTarget = isShadowTargetContainer.value;
                documentMeta = documentMetaContainer.value;
            }
        })(),
        `
        (() => {
            const ESGlobal = (${getESGlobal.toString()})()

            const isShadowTargetContainer = {}
            const documentMetaContainer = {}
            const idToObject = new Map()
            const objectToId = new Map()
            const allowOnlyCalled = new Set()
            const banned = new Set()
            const preservedMeta = new WeakMap()

            const sharedInit = (${getSharedInit.toString()})(
                isShadowTargetContainer,
                documentMetaContainer,
                ESGlobal,
                idToObject,
                objectToId,
                allowOnlyCalled,
                banned,
                preservedMeta
            )

            const clientInit = (${getClientInit.toString()})(
                isShadowTargetContainer,
                documentMetaContainer,
                ESGlobal,
                idToObject,
                objectToId,
                allowOnlyCalled,
                banned,
                preservedMeta
            )

            return (ctx) => {
                sharedInit(ctx)
                clientInit(ctx)
                window.isShadowTarget = isShadowTargetContainer.value
            }
        })()
        `,
        'new Proxy(eval, {})',
        { fixInternalSlot: true }
    )
    const sandbox = sandboxEval('new Proxy(window, {})')

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

    const sandboxWindowPrototype = sandboxEval('new Proxy(Window.prototype, {})')
    // window -> window prototype -> constructor
    Reflect.defineProperty(sandboxWindowPrototype, 'constructor', Reflect.getOwnPropertyDescriptor(Window.prototype, 'constructor')!)

    const sandboxEventTargetPrototype = sandboxEval('new Proxy(EventTarget.prototype, {})')
    // window -> window prototype -> window properties -> event target prototype
    for (let key of Reflect.ownKeys(EventTarget.prototype)) {
        Reflect.defineProperty(sandboxEventTargetPrototype, key, Reflect.getOwnPropertyDescriptor(EventTarget.prototype, key)!)
    }

    // everything other
    for (let key of Reflect.ownKeys(window)) {
        // Don't remove configurable check!!!, define location on window cause chrome to navigation even it is not configurable
        if (key !== 'eval' && !preservedWindowKeys.includes(key) && Reflect.getOwnPropertyDescriptor(window, key)!.configurable) {
            Reflect.defineProperty(sandbox, key, Reflect.getOwnPropertyDescriptor(window, key)!)
        }
    }

    return sandboxEval
}