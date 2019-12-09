import { ValueWrapper, ResponseFailed, World, Token } from './interface'

declare global {
    var sesInit: () => any
}

window.sesInit = () => {
    'use strict';
    // disable caller attack on the stack

    const FCall = Function.prototype.call
    const FApply = Function.prototype.apply
    const FBind = Function.prototype.bind

    const FMap = Map

    const FWeakMap = WeakMap
    const FWeakMapHas = WeakMap.prototype.has
    const FWeakMapSet = WeakMap.prototype.set
    const FWeakMapGet = WeakMap.prototype.get

    const FBWeakMapHas = FCall.bind(FWeakMapHas)
    const FBWeakMapSet = FCall.bind(FWeakMapSet)
    const FBWeakMapGet = FCall.bind(FWeakMapGet)

    const FReflect = {
        ...Reflect,
        construct: Reflect.construct,
        ownKeys: Reflect.ownKeys,
        get: Reflect.get,
        set: Reflect.set,
        getOwnPropertyDescriptor: Reflect.getOwnPropertyDescriptor,
        apply: Reflect.apply,
        getPrototypeOf: Reflect.getPrototypeOf,
        defineProperty: Reflect.defineProperty,
        setPrototypeOf: Reflect.setPrototypeOf,
        isExtensible: Reflect.isExtensible,
        preventExtensions: Reflect.preventExtensions,
        has: Reflect.has,
        deleteProperty: Reflect.deleteProperty
    }
    const FCreateEmpty = Object.create.bind(Object, null)
    const FSetPrototypeOf = Object.setPrototypeOf
    const FGetPrototypeOf = Object.getPrototypeOf

    const FGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor

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
                    throw new Error('PROTOTYPE LEAKING!!!')
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
                console.error('BAD ACTOR', unsafeObj, name)
                throw "This shouldn\'t happen"
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

            realToToken.set(obj, token)
            tokenToReal.set(token, obj)

            return token
        }

        function unwrapToken (token: Token): any {
            if (tokenToReal.has(token)) {
                return tokenToReal.get(token)!
            }

            if (tokenToProxy.has(token)) {
                return tokenToProxy.get(token)!
            }

            // to fake
            const type: string | null = FReflect.get(token, 'type')
            const world: World = FReflect.get(token, 'owner')

            if (world === currentWorld) {
                throw new Error('Unexpected owner of current world')
            }

            switch (type) {
                case 'function':
                    return toProxy(token, 'function')
                case 'object':
                    return toProxy(token, 'object')
                default:
                    throw new Error('bad type')
            }
        }

        function toProxy (token: Token, type: 'function' | 'object'): any {
            const fakeTarget = type === 'object' ? dropPrototypeRecursive({}) : dropPrototypeRecursive(function () {})

            const wrapper = {
                type,
                value: token
            } as const

            dropPrototypeRecursive(wrapper)

            const anotherWorld = safeGetProp(token, 'owner' as 'owner')

            if (!anotherWorld) {
                throw new Error('bad payload')
            }

            const proxy = new Proxy(fakeTarget, {
                get (target, key, receiver) {
                    var res = anotherWorld.trap_get(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(key, currentWorld)),
                        dropPrototypeRecursive(toWrapper(receiver, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                set (target, key, value, receiver) {
                    var res = anotherWorld.trap_set(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(key, currentWorld)),
                        dropPrototypeRecursive(toWrapper(value, currentWorld)),
                        dropPrototypeRecursive(toWrapper(receiver, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
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
                defineProperty (target, key, attributes) {
                    var res = anotherWorld.trap_defineProperty(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(key, currentWorld)),
                        dropPrototypeRecursive(toWrapper(attributes, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                ownKeys (target) {
                    var res = anotherWorld.trap_ownKeys(
                        wrapper
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                apply (target, thisArg, argArray) {
                    var res = anotherWorld.trap_apply(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(thisArg, currentWorld)),
                        dropPrototypeRecursive(toWrapper(argArray, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                construct (target, argArray, newTarget) {
                    var res = anotherWorld.trap_construct(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(argArray, currentWorld)),
                        dropPrototypeRecursive(toWrapper(newTarget, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                getPrototypeOf(target) {
                    var res = anotherWorld.trap_getPrototypeOf(
                        wrapper
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                setPrototypeOf (target, prototype) {
                    var res = anotherWorld.trap_setPrototypeOf(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(prototype, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                isExtensible (target) {
                    var res = anotherWorld.trap_isExtensible(
                        wrapper
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                preventExtensions (target) {
                    var res = anotherWorld.trap_preventExtensions(
                        wrapper
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },

                has (target, key) {
                    var res = anotherWorld.trap_has(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(key, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                },
                deleteProperty (target, key) {
                    var res = anotherWorld.trap_deleteProperty(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(key, currentWorld))
                    )

                    if (res.success) {
                        return unwrap(res.value)
                    } else {
                        throw unwrap(res.value)
                    }
                }
            })

            proxyToToken.set(proxy, token)
            tokenToProxy.set(token, proxy)

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
                    throw new Error('how is this possible?')
            }
        }

        function unwrap (unsafeObj: ValueWrapper) {
            switch (safeGetProp(unsafeObj, 'type')) {
                case 'primitive':
                    const value = safeGetProp(unsafeObj, 'value')

                    if (value != null && (typeof value === 'function' || typeof value === 'object')) {
                        throw new Error('bad')
                    }

                    return value
                case 'function':
                case 'object':
                    return unwrapToken(safeGetProp(unsafeObj, 'value') as any)
                default:
                    throw new Error('bad wrapper')
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
                    return badPayload
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