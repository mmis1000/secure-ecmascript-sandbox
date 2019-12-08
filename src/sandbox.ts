import { Command, ValueWrapper, ResponseFailed, World, Token } from './interface'

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
        getOwnPropertyDescriptor: Reflect.getOwnPropertyDescriptor
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

            return runSafe(() => {
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
            })
        }


        const nuzzObject = dropPrototypeRecursive({})
        const nuzzFunction = dropPrototypeRecursive(function () {})

        function toProxy (token: Token, type: 'function' | 'object'): any {
            const fakeTarget = type == 'function' ? nuzzFunction : nuzzObject
            const anotherWorld = safeGetProp(token, 'owner' as 'owner')
            if (!anotherWorld) {
                throw new Error('bad payload')
            }

            const wrapper = {
                type,
                value: token
            } as const

            dropPrototypeRecursive(wrapper)

            const proxy = new Proxy(fakeTarget, {
                get (target, key, receiver) {
                    var res = anotherWorld.trap_get(
                        wrapper, 
                        dropPrototypeRecursive(toWrapper(key, currentWorld)),
                        wrapper
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
         * mask thrown error in proxy code to prevent it from leaking reference and implementation detail
         * @param fn
         */
        function runSafe<T extends (...args: any[]) => any> (fn: T): ReturnType<T> | ResponseFailed {
            dropPrototypeRecursive(fn)

            try {
                return fn()
            } catch (err) {
                console.error(err)

                const response = {
                    success: false,
                    value: {
                        type: 'primitive',
                        value: 'failed'
                    }
                } as const

                dropPrototypeRecursive(response)

                return response
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


        // These shouldn't leak refs
        const currentWorld: World = {
            create (world: World) {
                return unwrap(world.getRoot().value)
            },
            getRoot () {
                return runSafe(() => {
                    return dropPrototypeRecursive({
                        success: true,
                        value: toWrapper(root, currentWorld)
                    })
                })
            },

            trap_get (unsafeTargetW: ValueWrapper, unsafeKeyW: ValueWrapper, unsafeReceiverW: ValueWrapper) {
                return runSafe(() => {
                    const target = unwrap(unsafeTargetW)
                    const key = unwrap(unsafeKeyW)
                    const receiver = unwrap(unsafeReceiverW)

                    return wrapThrow(currentWorld, () => {
                        return dropPrototypeRecursive({
                            success: true,
                            value: toWrapper(FReflect.get(target, key, receiver), currentWorld)
                        })
                    })
                })
            },

            trap_getOwnPropertyDescriptor (unsafeTargetW: ValueWrapper, unsafeKeyW: ValueWrapper) {
                return runSafe(() => {
                    const target = unwrap(unsafeTargetW)
                    const key = unwrap(unsafeKeyW)

                    return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                        return {
                            success: true,
                            value: toWrapper(FReflect.getOwnPropertyDescriptor(target, key), currentWorld)
                        }
                    }))
                })
            },

            trap_ownKeys (unsafeTargetW: ValueWrapper) {
                return runSafe(() => {
                    const target = unwrap(unsafeTargetW)

                    return dropPrototypeRecursive(wrapThrow(currentWorld, () => {
                        return {
                            success: true,
                            value: toWrapper(FReflect.ownKeys(target), currentWorld)
                        }
                    }))
                })
            }
        }

        dropPrototypeRecursive(currentWorld)

        return currentWorld
    }
}