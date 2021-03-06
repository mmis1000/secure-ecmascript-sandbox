import {
    IShared
} from './sharedFactory'

import {
    IUnwrap,
    IToWrapper,
    IToRecord,
    World,
    Token,
    API
} from './interface'

export function createProxyFactoryFactory (SES: { DEV: boolean }) {
    return function createProxyFactory(
        shared: IShared,
        unwrap: IUnwrap,
        toWrapper: IToWrapper,
        toRecord: IToRecord,
        currentWorld: World,
        proxyToToken: WeakMap<object, Token>,
        tokenToProxy: WeakMap<Token, object>,
        redirectedToToken: WeakMap<object, Token>,
        tokenToRedirected: WeakMap<Token, object>,
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
    
        const FBWeakMapSet = shared.FBWeakMapSet
    
        const FReflect = shared.FReflect
    
        const FBArrayMap = shared.FBArrayMap
        const FResolveDesc = shared.FResolveDesc
    
        const dropPrototypeRecursive = shared.dropPrototypeRecursive
        const safeGetProp = shared.safeGetProp
    
    
        return function createProxy(token: Token): any {
            const type = safeGetProp(token, 'type' as 'type')
    
            if (type !== 'function' && type !== 'object') {
                throw new FError('bad payload')
            }
    
            const isPrototypeLess = safeGetProp(token, 'functionHasNoPrototype' as 'functionHasNoPrototype')
    
            if (typeof isPrototypeLess !== 'boolean') {
                throw new FError('bad payload')
            }
    
            const isRevoked = safeGetProp(token, 'isRevoked' as 'isRevoked')
    
            if (typeof isRevoked !== 'boolean') {
                throw new FError('bad payload')
            }
    
            const isArray = safeGetProp(token, 'isArray' as 'isArray')
    
            if (typeof isArray !== 'boolean') {
                throw new FError('bad payload')
            }
    
            const anotherWorld = safeGetProp(token, 'owner' as 'owner')
    
            if (!anotherWorld) {
                throw new FError('bad payload')
            }
    
            const fakeTarget = 
                type === 'object'
                    ? isArray
                        ? []
                        : {}
                    : isPrototypeLess 
                        ? () => {} 
                        : function () {}
    
            const wrapper = {
                type,
                value: token
            } as const
    
            dropPrototypeRecursive(wrapper)
    
    
            function createHandler<T extends keyof World>(key: T, mapper: (typeof toWrapper | typeof toRecord)[] | null = null) {
                return function handle(target: any, ...args: any[]) {
                    try {
                        let argsMapped
    
                        if (mapper == null) {
                            argsMapped = FBArrayMap(args, (i: any) => dropPrototypeRecursive(toWrapper(i, currentWorld)))
                        } else {
                            argsMapped = []
    
                            const length = args.length > mapper.length ? mapper.length : args.length
    
                            for (let i = 0; i < length; i++) {
                                argsMapped[i] = dropPrototypeRecursive(mapper[i](args[i], currentWorld))
                            }
                        }
    
                        var res = (anotherWorld![key] as any)(
                            wrapper,
                            ...shared.FBArrayToIterator(argsMapped)
                        )
                    } catch (err) {
                        if (SES.DEV) debugger
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
                if (!FReflect.isExtensible(fakeTarget)) {
                    // it is already freezed, isn't it?
                    return
                }
    
                // update proto
                FReflect.setPrototypeOf(fakeTarget, createHandler('trap_getPrototypeOf')(fakeTarget))
    
                // update property
                var keys = createHandler('trap_ownKeys')(fakeTarget)
                var getOwnDesc = createHandler('trap_getOwnPropertyDescriptor')
    
                for (let i = 0; i < keys.length; i++) {
                    const desc = getOwnDesc(fakeTarget, keys[i])
                    FReflect.defineProperty(fakeTarget, keys[i], desc)
                }
    
                FReflect.preventExtensions(fakeTarget)
            }
    
            const defaultHandlers: Omit<Required<ProxyHandler<any>>, 'enumerate'> = {
                get: createHandler('trap_get'),
                set: createHandler('trap_set'),
                has: createHandler('trap_has'),
                getOwnPropertyDescriptor: createHandler('trap_getOwnPropertyDescriptor'),
                defineProperty: createHandler('trap_defineProperty', [toWrapper, toRecord]),
                deleteProperty: createHandler('trap_deleteProperty'),
                getPrototypeOf: createHandler('trap_getPrototypeOf'),
                setPrototypeOf: createHandler('trap_setPrototypeOf'),
                isExtensible: createHandler('trap_isExtensible'),
                preventExtensions: createHandler('trap_preventExtensions'),
                ownKeys: createHandler('trap_ownKeys'),
                apply: createHandler('trap_apply', [toWrapper, toRecord]),
                construct: createHandler('trap_construct', [toRecord, toWrapper])
            }
    
            const preMappedHandlers: Omit<Required<ProxyHandler<any>>, 'enumerate'> = {
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
                        Reflect.apply(desc.set, receiver, [value])
                        return true
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
                // this need to be specially handled
                defineProperty(target, key, desc) {
                    const success = defaultHandlers.defineProperty(target, key, desc)
    
                    // satisfy the invariant limit if define is successful and descriptor is not configurable
                    if (success && !desc.configurable) {
                        Reflect.defineProperty(fakeTarget, key, desc)
                    }
    
                    return success
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
                    return desc !== undefined
                },
                // this will crash if not handled correctly, so it also need to be specially handled
                preventExtensions(target) {
                    const success = defaultHandlers.preventExtensions(target)
                    
                    if (success) {
                        freezeFakeIfNecessary()
                    }
    
                    return success
                }
            }
    
            let proxy = new FProxy(fakeTarget, preMappedHandlers)

            // replace it with revoked version if it is revoked
            if (isRevoked) {
                const { proxy: badProxy , revoke } = shared.FProxyRevocable(fakeTarget, preMappedHandlers)
                revoke()
                proxy = badProxy
            }

            let res
    
            for (let i = 0; i < proxyInitCallbacks.length; i++) {
                res = proxyInitCallbacks[i](token, proxy, defaultHandlers, preMappedHandlers)
    
                if (res != null) {
                    break
                }
            }
    
            FBWeakMapSet(proxyToToken, proxy, token)
            FBWeakMapSet(tokenToProxy, token, proxy)
    
            // distort it
            if (res != null) {
                FBWeakMapSet(tokenToRedirected, token, res)
                FBWeakMapSet(redirectedToToken, res, token)
            }
    
            return res != null ? res : proxy
        }
    }
}