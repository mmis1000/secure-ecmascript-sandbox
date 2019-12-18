namespace SES {
    export function createProxyFactory(
        shared: ReturnType<typeof SES.makeShared>,
        unwrap: IUnwrap,
        toWrapper: IToWrapper,
        currentWorld: World,
        proxyToToken: WeakMap<object, Token>,
        tokenToProxy: WeakMap<Token, object>,
        proxyInitCallbacks: API.ICustomProxyInit[]
    ) {
        'use strict';

        const successVal = <T>(v: T) => ({
            success: true as const,
            value: v
        })
        const failVal = <T>(v: T) => ({
            success: false as const,
            value: v
        })
        // disable caller attack on the stack

        // Must not use any global object
        // And using only the frozen object returns from makeShared
        const FProxy = shared.FProxy
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
                    try {
                        var res = (anotherWorld![key] as any)(
                            wrapper,
                            ...(shared.FBArrayToIterator(FBArrayMap(args, (i: any) => dropPrototypeRecursive(toWrapper(i, currentWorld)))) as any)
                        )
                    } catch (err) {
                        if (DEV) debugger
                        throw 'potential unsafe overflow'
                    }

                    let success = res.success
                    let result = unwrap(res.value)

                    success = success && result.success

                    if (success) {
                        return result.value
                    } else {
                        throw result.value
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

            const defaultHandlers: Omit<Required<ProxyHandler<any>>, 'enumerate'> = {
                get: createHandler('trap_get'),
                set: createHandler('trap_set'),
                has: createHandler('trap_has'),
                getOwnPropertyDescriptor: createHandler('trap_getOwnPropertyDescriptor'),
                defineProperty: createHandler('trap_defineProperty'),
                deleteProperty: createHandler('trap_deleteProperty'),
                getPrototypeOf: createHandler('trap_getPrototypeOf'),
                setPrototypeOf: createHandler('trap_setPrototypeOf'),
                isExtensible: createHandler('trap_isExtensible'),
                preventExtensions: createHandler('trap_preventExtensions'),
                ownKeys: createHandler('trap_ownKeys'),
                apply: createHandler('trap_apply'),
                construct: createHandler('trap_construct')
            }

            // @ts-ignore
            const proxy = new FProxy(fakeTarget, {
                ...defaultHandlers,
                get(target, key, receiver) {
                    if (defaultHandlers.getOwnPropertyDescriptor(target, key)) {
                        return defaultHandlers.get(target, key, receiver)
                    } else {
                        var desc = FResolveDesc(defaultHandlers.getPrototypeOf(fakeTarget), key)

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
                        return defaultHandlers.set(target, key, value, receiver)
                    } else if (desc.set) {
                        return Reflect.apply(desc.set, receiver, [value])
                    } else {
                        return false
                    }
                },
                // this need to be specially handled
                getOwnPropertyDescriptor(target, key) {
                    try {
                        var res = defaultHandlers.getOwnPropertyDescriptor(
                            target,
                            key
                        )

                        if (res === undefined) {
                            return
                        }

                        if (!res.configurable) {
                            // TODO: is doing this really safe?
                            // browser don't like you to fake configurable
                            FReflect.defineProperty(fakeTarget, key, res)
                        }

                        return res
                    } catch (err) {
                        throw err
                    }
                },
                // this will crash if not handled correctly, so it also need to be specially handled
                isExtensible(target) {
                    const extensible = defaultHandlers.isExtensible(target)
                    
                    if (!extensible) {
                        freezeFakeIfNecessary()
                    }

                    return extensible
                },
                has(target, key) {
                    const desc = FResolveDesc(proxy, key)
                    return desc === undefined
                },
            })

            let res

            for (let i = 0; i < proxyInitCallbacks.length; i++) {
                res = proxyInitCallbacks[i](token, proxy, defaultHandlers)

                if (res != null) {
                    break
                }
            }

            FBWeakMapSet(proxyToToken, proxy, token)
            FBWeakMapSet(tokenToProxy, token, proxy)

            // distort it
            if (res != null) {
                FBWeakMapSet(tokenToProxy, token, res)
            }

            return res != null ? res : proxy
        }
    }
}