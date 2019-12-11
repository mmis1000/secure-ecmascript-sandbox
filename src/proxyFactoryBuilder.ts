namespace SES {
    export function createProxyFactory(
        shared: ReturnType<typeof SES.makeShared>,
        unwrap: Iunwrap,
        toWrapper: ItoWrapper,
        currentWorld: World,
        proxyToToken: WeakMap<object, Token>,
        tokenToProxy: WeakMap<Token, object>
    ) {
        'use strict';
        // disable caller attack on the stack

        // Must not use any global object
        // And using only the frozen object returns from makeShared

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
        const FResolveDesc = shared.FResolveDesc

        const dropPrototypeRecursive = shared.dropPrototypeRecursive
        const safeGetProp = shared.safeGetProp


        return function createProxy(token: Token, type: 'function' | 'object'): any {
            const fakeTarget = type === 'object' ? {} : function () { }

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

            function freezeFakeIfNecessary() {
                if (FReflect.isExtensible(fakeTarget)) {
                    // it is already freezed, isn't it?
                    return
                }

                if (createHandler('trap_preventExtensions')(fakeTarget)) {
                    // update proto
                    FReflect.setPrototypeOf(fakeTarget, createHandler('trap_getPrototypeOf')(fakeTarget))

                    // update property
                    var keys = createHandler('trap_ownKeys')(fakeTarget)
                    var getOwnDesc = createHandler('trap_getOwnPropertyDescriptor')

                    for (let i = 0; i < keys.length; i++) {
                        const desc = getOwnDesc(fakeTarget, i)
                        FReflect.defineProperty(fakeTarget, keys[i], desc)
                    }

                    FReflect.preventExtensions(fakeTarget)
                }
            }

            // @ts-ignore
            const proxy = new Proxy(fakeTarget, {
                get(target, key, receiver) {
                    if (FReflect.getOwnPropertyDescriptor(proxy, key)) {
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
                    } else {
                        var desc = FResolveDesc(FReflect.getPrototypeOf(proxy), key)

                        if (!desc) {
                            return undefined
                        }

                        if ('value' in desc) {
                            return desc.value
                        } else if (desc.get) {
                            return FReflect.apply(desc.get, receiver, [])
                        } else {
                            return undefined
                        }
                    }
                },
                set(target, key, value, receiver) {
                    const desc = FResolveDesc(proxy, key)

                    if (desc === undefined || 'value' in desc) {
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
                    } else if (desc.set) {
                        return Reflect.apply(desc.set, receiver, [value])
                    } else {
                        return false
                    }
                },
                // this need to be specially handled
                getOwnPropertyDescriptor(target, key) {
                    var res = anotherWorld.trap_getOwnPropertyDescriptor(
                        wrapper,
                        dropPrototypeRecursive(toWrapper(key, currentWorld))
                    )

                    if (res.success) {
                        var unwrapped = unwrap(res.value)

                        if (unwrapped === undefined) {
                            return
                        }

                        // use [[get]] to access remote descriptor instead
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
                getPrototypeOf(...args) {
                    const res = createHandler('trap_getPrototypeOf')(...args)
                    Reflect.setPrototypeOf(fakeTarget, res)
                    return res
                },
                setPrototypeOf: createHandler('trap_setPrototypeOf'),
                // this will crash if not handled correctly, so it also need to be specially handled
                isExtensible(target) {
                    var res = anotherWorld.trap_isExtensible(
                        wrapper
                    )

                    if (res.success) {
                        var extensible = unwrap(res.value)

                        if (!extensible) {
                            freezeFakeIfNecessary()
                        }

                        return extensible
                    } else {
                        throw unwrap(res.value)
                    }
                },
                preventExtensions: createHandler('trap_preventExtensions'),
                has(target, key) {
                    const desc = FResolveDesc(proxy, key)
                    return desc === undefined
                },
                deleteProperty: createHandler('trap_deleteProperty'),
            })

            FBWeakMapSet(proxyToToken, proxy, token)
            FBWeakMapSet(tokenToProxy, token, proxy)

            return proxy
        }
    }
}