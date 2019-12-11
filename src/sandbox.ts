namespace SES {
    // this need to be run before any other script to get properly untainted global
    export function init () {
        'use strict';
        // disable caller attack on the stack

        // Must not use any global object
        // And using only the frozen object returns from makeShared
        const shared = makeShared()

        const FError = shared.FError

        const FCall = shared.FCall
        const FApply = shared.FApply
        const FBind = shared.FBind
    
        const FMap = shared.FMap
    
        const FWeakMap = shared.FWeakMap
    
        const FBWeakMapHas = shared.FBWeakMapHas
        const FBWeakMapSet = shared.FBWeakMapSet
        const FBWeakMapGet = shared.FBWeakMapGet
    
        const FReflect = shared.FReflect

        const FCreateEmpty = shared.FCreateEmpty
        const FSetPrototypeOf = shared.FSetPrototypeOf
        const FGetPrototypeOf = shared.FGetPrototypeOf
    
        const FGetOwnPropertyDescriptor = shared.FGetOwnPropertyDescriptor
    
        const FBArrayMap = shared.FBArrayMap
        const FBArrayToIterator = shared.FBArrayToIterator

        return function createServer<T>(root: T) {
            /**
             * Clear all prototype prop from the whole object
             */
            const dropPrototypeRecursive = <T extends object>(unsafeObj: T, record = FReflect.construct(FWeakMap, [])) => {
                if (FBWeakMapHas(record, unsafeObj)) {
                    return unsafeObj
                }
    
                if (unsafeObj != null && (typeof unsafeObj === 'function' || typeof unsafeObj === 'object')) {
                    FSetPrototypeOf(unsafeObj, null)
    
                    if (FGetPrototypeOf(unsafeObj) !== null) {
                        throw new FError('PROTOTYPE LEAKING!!!')
                    }

                    shared.FFreeze(unsafeObj)

                    if (!shared.FIsFrozen) {
                        throw new FError('tainted object!!!')
                    }

                    // the object may use timing attack to by pass get prototype check
                    // because it is not frozen at that time
                    if (FGetPrototypeOf(unsafeObj) !== null) {
                        throw new FError('PROTOTYPE LEAKING!!!')
                    }
    
                    FBWeakMapSet(record, unsafeObj, true)
    
                    // burst it no matter it is enumerable or not
                    // nothing should ever leak
                    var keys = FReflect.ownKeys(/** @type {any} */(unsafeObj))
    
                    for (let i = 0; i < keys.length; i++) {
                        dropPrototypeRecursive((unsafeObj as any)[keys[i]], record)
                    }
                }
    
                return unsafeObj
            }
    
            // real object in this world to token
            const realToToken = new FWeakMap<object, Token>()
    
            // token to real object in this world
            const tokenToReal = new FWeakMap<Token, object>()
    
            // token from external world to proxy in this world
            const tokenToProxy = new FWeakMap<Token, object>()
    
            // proxy in this world to token from external
            const proxyToToken = new FWeakMap<object, Token>()
    
            /**
             * get prop without trigger the getter
             * @param unsafeObj 
             * @param name 
             */
            const safeGetProp = <T extends object, U extends keyof T>(unsafeObj: T, name: U): T[U] | null => {
                if (unsafeObj == null || (typeof unsafeObj !== 'object' && typeof unsafeObj !== 'function')) {
                    return null
                }
    
                try {
                    const unsafeDesc = FGetOwnPropertyDescriptor(unsafeObj, name)
                    const valueDesc = FGetOwnPropertyDescriptor(unsafeDesc, 'value')
    
                    if (valueDesc == null) {
                        throw "value desk does not exist"
                    }
    
                    return 'value' in valueDesc ? valueDesc.value :　null
                } catch (err) {
                    shared.FConsoleError('BAD ACTOR', unsafeObj, name)
                    throw 'This shouldn\'t happen'
                }
            }
    
            // prevent arguments.caller
            dropPrototypeRecursive(safeGetProp)
     
            /**
             * get a safe token that represent this object
             * @param obj 
             */
            function toToken<T extends object>(obj: T, world: World, type: 'function' | 'object'): Token {
                if (proxyToToken.has(obj)) {
                    return proxyToToken.get(obj)!
                }
    
                if (realToToken.has(obj)) {
                    return realToToken.get(obj)!
                }
    
                var token: Token = FCreateEmpty({})
    
                token.owner = world
                token.type = type
    
                FBWeakMapSet(realToToken, obj, token)
                FBWeakMapSet(tokenToReal, token, obj)
    
                return token
            }
    
            function unwrapToken (token: Token): any {
                if (FBWeakMapHas(tokenToReal, token)) {
                    return FBWeakMapGet(tokenToReal, token)
                }
    
                if (FBWeakMapHas(tokenToProxy, token)) {
                    return FBWeakMapGet(tokenToProxy, token)
                }
    
                // to fake
                const type: string | null = FReflect.get(token, 'type')
                const world: World = FReflect.get(token, 'owner')
    
                if (world === currentWorld) {
                    throw new FError('Unexpected owner of current world')
                }
    
                switch (type) {
                    case 'function':
                        return toProxy(token, 'function')
                    case 'object':
                        return toProxy(token, 'object')
                    default:
                        throw new FError('bad type')
                }
            }
    
            function toProxy (token: Token, type: 'function' | 'object'): any {
                const fakeTarget = type === 'object' ? {} : function () {}
    
                const wrapper = {
                    type,
                    value: token
                } as const
    
                dropPrototypeRecursive(wrapper)
    
                const anotherWorld = safeGetProp(token, 'owner' as 'owner')
    
                if (!anotherWorld) {
                    throw new FError('bad payload')
                }
    

                function createHandler<T extends keyof World>(key: T) {
                    return function handle(target: any, ...args: any[]) {
                        var res = (anotherWorld![key] as any)(
                            wrapper,
                            ...(shared.FBArrayToIterator(FBArrayMap(args, (i: any) => dropPrototypeRecursive(toWrapper(i, currentWorld)))) as any)
                        )
    
                        if (res.success) {
                            return unwrap(res.value)
                        } else {
                            throw unwrap(res.value)
                        }
                    }
                }

                const proxy = new Proxy(fakeTarget, {
                    // TODO: custom resolve
                    get: createHandler('trap_get'),
                    // TODO: custom resolve
                    set: createHandler('trap_set'),
                    // this need to be specially handled
                    getOwnPropertyDescriptor (target, key) {
                        var res = anotherWorld.trap_getOwnPropertyDescriptor(
                            wrapper,
                            dropPrototypeRecursive(toWrapper(key, currentWorld))
                        )
    
                        if (res.success) {
                            var unwrapped = unwrap(res.value)
                            if (!unwrapped.configurable) {
                                // TODO: is doing this really safe?
                                // browser don't like you to fake configurable
                                FReflect.defineProperty(fakeTarget, key, unwrapped)
                            }
                            return unwrapped
                        } else {
                            throw unwrap(res.value)
                        }
                    },
                    defineProperty: createHandler('trap_defineProperty'),
                    ownKeys: createHandler('trap_ownKeys'),
                    apply: createHandler('trap_apply'),
                    construct: createHandler('trap_construct'),
                    getPrototypeOf: createHandler('trap_getPrototypeOf'),
                    setPrototypeOf: createHandler('trap_setPrototypeOf'),
                    // this will crash if not handled correctly, so it also need to be specially handled
                    isExtensible (target) {
                        var res = anotherWorld.trap_isExtensible(
                            wrapper
                        )
    
                        if (res.success) {
                            var extensible = unwrap(res.value)

                            if (!extensible) {
                                shared.FFreeze(fakeTarget)
                            }

                            return extensible
                        } else {
                            throw unwrap(res.value)
                        }
                    },
                    preventExtensions: createHandler('trap_preventExtensions'),
                    has: createHandler('trap_has'),
                    deleteProperty: createHandler('trap_deleteProperty'),
                })

                FBWeakMapSet(proxyToToken, proxy, token)
                FBWeakMapSet(tokenToProxy, token, proxy)
    
                return proxy
            }
    
            function toWrapper (obj: any, world: World): ValueWrapper {
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
                    case 'undefined':
                        return {
                            type: 'primitive',
                            value: obj
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
    
            function unwrap (unsafeObj: ValueWrapper) {
                switch (safeGetProp(unsafeObj, 'type')) {
                    case 'primitive':
                        const value = safeGetProp(unsafeObj, 'value')
    
                        if (value != null && (typeof value === 'function' || typeof value === 'object')) {
                            throw new FError('bad')
                        }
    
                        return value
                    case 'function':
                    case 'object':
                        return unwrapToken(safeGetProp(unsafeObj, 'value') as any)
                    default:
                        throw new FError('bad wrapper')
                }
            }
            

            // this need to be initialized out side of service catch, so it can't throw yet another overflow
            const badPayload: ResponseFailed = dropPrototypeRecursive({
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
            > (key: T) {
                return function (...args: V) {
                    try {
                        const unwrapped = FBArrayMap(args, (i: ValueWrapper) => unwrap(i))
    
                        let value: any
                        let success: boolean

                        // start of zone that user mat throw error
                        try {
                            value = FReflect.apply(FReflect[key], null, unwrapped)
                            success = true
                        } catch (err) {
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
                        return badPayload
                    }
                }
            }

            // These shouldn't leak refs
            const currentWorld: World = {
                create (world: World) {
                    try {
                        return unwrap(world.getRoot().value)
                    } catch (err) {
                        return badPayload
                    }
                },
                getRoot () {
                    try {
                        return dropPrototypeRecursive({
                            success: true,
                            value: toWrapper(root, currentWorld)
                        })
                    } catch (err) {
                        return badPayload
                    }
                },
    
                // TODO: redo with custom resolve
                trap_get: createHandler('get'),
    
                // TODO: redo with custom resolve
                trap_set: createHandler('set'),
    
                trap_getOwnPropertyDescriptor: createHandler('getOwnPropertyDescriptor'),
    
                trap_ownKeys: createHandler('ownKeys'),
    
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
    
            return currentWorld
        }
    }
}