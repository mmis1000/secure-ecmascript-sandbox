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
        const FResolveDesc = shared.FResolveDesc

        const dropPrototypeRecursive = shared.dropPrototypeRecursive
        const safeGetProp = shared.safeGetProp

        return function createServer<T>(root: T) {
    
            // real object in this world to token
            const realToToken = new FWeakMap<object, Token>()
    
            // token to real object in this world
            const tokenToReal = new FWeakMap<Token, object>()
    
            // token from external world to proxy in this world
            const tokenToProxy = new FWeakMap<Token, object>()
    
            // proxy in this world to token from external
            const proxyToToken = new FWeakMap<object, Token>()
    
     
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
                        return createProxy(token, 'function')
                    case 'object':
                        return createProxy(token, 'object')
                    default:
                        throw new FError('bad type')
                }
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
    
            function toRecord (obj: any, world: World): ValueWrapper {
                const keys = FReflect.ownKeys(obj)
                const target: ValueWrapperRecord = FCreateEmpty({}) as any
                target.type = 'record'
                target.value = FCreateEmpty({})

                for (let key of FBArrayToIterator(keys)) {
                    target.value[key] = toWrapper(obj[key], world)
                }

                return target
            }

            function unwrap (unsafeObj: ValueWrapper): any {
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
                    case 'record': {
                        const result = FCreateEmpty({})
                        const value = safeGetProp(unsafeObj, 'value') as { [key: string]: ValueWrapper}

                        for (let key of FBArrayToIterator(FReflect.ownKeys(value))) {
                            result[key] = unwrap(value[key])
                        }

                        return result
                    }
                    default:
                        throw new FError('bad wrapper')
                }
            }
            

            // this need to be initialized outside of service catch, so it can't throw yet another stack overflow
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
                        console.log(err)
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
                        console.log(err)
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
                        console.log(err)
                        return badPayload
                    }
                },
    
                // TODO: redo with custom resolve
                trap_get: createHandler('get'),
    
                // TODO: redo with custom resolve
                trap_set: createHandler('set'),
    
                // trap_getOwnPropertyDescriptor: createHandler('getOwnPropertyDescriptor'),
                trap_getOwnPropertyDescriptor (tokenW: ValueWrapper, keyW: ValueWrapper) {
                    try {
                        const token = unwrap(tokenW)
                        const key = unwrap(keyW)
    
                        let value: any
                        let success: boolean
                        let wrapped: any
                        // start of zone that user mat throw error
                        try {
                            value = FReflect.getOwnPropertyDescriptor(token, key)
                            success = true
                        } catch (err) {
                            success = false
                            value = err
                        }

                        return dropPrototypeRecursive({
                            success,
                            value: success && typeof value === 'object' ? toRecord(value, currentWorld): toWrapper(value, currentWorld)
                        })
                    } catch (err) {
                        console.log(err)
                        // just don't touch any function because it may cause yet another stack overflow here
                        return badPayload
                    }
                },
    
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
    
            const createProxy = createProxyFactory (
                shared,
                unwrap,
                toWrapper,
                currentWorld,
                proxyToToken,
                tokenToProxy
            )
    
            return currentWorld
        }
    }

    export function createScript (obj: any) {
        const keys = Object.keys(obj)

        let text = `
            var SES;
            ;(function (SES) {
                "use strict";
        `

        for (let key of keys) {
            text += `
                const ${key} = ${obj[key].toString()}
            `
        }

        for (let key of keys) {
            text += `
                SES.${key} = ${key}
            `
        }

        text += `
            }(SES || (SES = {})))

            window.SES = SES
        `

        return text
    }
}