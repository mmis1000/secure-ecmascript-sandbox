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
    
                    FBWeakMapSet(record, unsafeObj, true)
    
                    // burst it no matter it is enumerable or not
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
            
            /**
             * wrap thrown error in this land to another land
             * @param fn
             */
            function wrapThrow<T extends (...args: any[]) => any> (world: World, fn: T): ReturnType<T> | ResponseFailed {
                dropPrototypeRecursive(fn)
    
                try {
                    return fn()
                } catch (err) {
                    const response = {
                        success: false,
                        value: toWrapper(err, world)
                    } as const
    
                    dropPrototypeRecursive(response)
    
                    return response
                }
            }
    
            const badPayload: ResponseFailed = {
                success: false,
                value: {
                    type: 'primitive',
                    value: 'Internal Error'
                }
            }
    
            dropPrototypeRecursive(badPayload)
    
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
                trap_get (unsafeTargetW: ValueWrapper, unsafeKeyW: ValueWrapper, unsafeReceiverW: ValueWrapper) {
                    try {
                        const target = unwrap(unsafeTargetW)
                        const key = unwrap(unsafeKeyW)
                        const receiver = unwrap(unsafeReceiverW)
    
                        return wrapThrow(currentWorld, () => {
                            return dropPrototypeRecursive({
                                success: true,
                                value: toWrapper(FReflect.get(target, key, receiver), currentWorld)
                            })
                        })
                    } catch (err) {
                        return { ...badPayload, err }
                    }
                },
    
                // TODO: redo with custom resolve
                trap_set (targetW, keyW, valueW, receiverW) {
                    try {
                        const target = unwrap(targetW)
                        const key = unwrap(keyW)
                        const value = unwrap(valueW)
                        const receiver = unwrap(receiverW)
    
                        return wrapThrow(currentWorld, () => {
                            return dropPrototypeRecursive({
                                success: true,
                                value: toWrapper(FReflect.set(target, key, value, receiver), currentWorld)
                            })
                        })
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_getOwnPropertyDescriptor (unsafeTargetW: ValueWrapper, unsafeKeyW: ValueWrapper) {
                    try {
                        const target = unwrap(unsafeTargetW)
                        const key = unwrap(unsafeKeyW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.getOwnPropertyDescriptor(target, key), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_ownKeys (unsafeTargetW: ValueWrapper) {
                    try {
                        const target = unwrap(unsafeTargetW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.ownKeys(target), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_apply (targetW: ValueWrapper, thisArgW: ValueWrapper, argArrayW: ValueWrapper) {
                    try {
                        const target = unwrap(targetW)
                        const thisArg = unwrap(thisArgW)
                        const argArray = unwrap(argArrayW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.apply(target, thisArg, argArray), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_construct (targetW: ValueWrapper, argArrayW: ValueWrapper, newTargetW: ValueWrapper) {
                    try {
                        const target = unwrap(targetW)
                        const argArray = unwrap(argArrayW)
                        const newTarget = unwrap(newTargetW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.construct(target, argArray, newTarget), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_getPrototypeOf(targetW: ValueWrapper) {
                    try {
                        const target = unwrap(targetW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.getPrototypeOf(target), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_defineProperty(targetW: ValueWrapper, keyW: ValueWrapper, attributesW: ValueWrapper) {
                    try {
                        const target = unwrap(targetW)
                        const key = unwrap(keyW)
                        const attributes = unwrap(attributesW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.defineProperty(target, key, attributes), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_setPrototypeOf (targetW, prototypeW) {
                    try {
                        const target = unwrap(targetW)
                        const prototype = unwrap(prototypeW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.setPrototypeOf(target, prototype), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_isExtensible (targetW) {
                    try {
                        const target = unwrap(targetW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.isExtensible(target), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_preventExtensions (targetW) {
                    try {
                        const target = unwrap(targetW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.preventExtensions(target), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_has (targetW, keyW) {
                    try {
                        const target = unwrap(targetW)
                        const key = unwrap(keyW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.has(target, key), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                },
    
                trap_deleteProperty (targetW, keyW) {
                    try {
                        const target = unwrap(targetW)
                        const key = unwrap(keyW)
    
                        return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                            return {
                                success: true,
                                value: toWrapper(FReflect.deleteProperty(target, key), currentWorld)
                            }
                        }))
                    } catch (err) {
                        return badPayload
                    }
                }
            }
    
            dropPrototypeRecursive(currentWorld)
    
            return currentWorld
        }
    }
}