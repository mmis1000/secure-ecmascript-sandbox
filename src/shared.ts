namespace SES {
    export function makeShared () {
        'use strict';

        // function/object that prefixed with F (which means the binding is frozen after the return)

        const FError = Error

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

        const FArrayMap = Array.prototype.map
        const FBArrayMap = FCall.bind(FArrayMap)
    
        const FReflect: typeof Reflect = {
            // ...Reflect,
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
            deleteProperty: Reflect.deleteProperty,
            enumerate: Reflect.enumerate
        }
        const FCreateEmpty = Object.create.bind(Object, null)
        const FSetPrototypeOf = Object.setPrototypeOf
        const FGetPrototypeOf = Object.getPrototypeOf
    
        const FGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor

        const FFreeze = Object.freeze
        const FIsFrozen = Object.isFrozen

        const SymbolIterator: (typeof Symbol)['iterator'] = Symbol.iterator

        const FBArrayToIterator = (arr: any[]) => {
            let index = 0
            const next = () => {
                if (index >= arr.length) {
                    return {
                        value: undefined,
                        done: true
                    }
                } else {
                    const result = {
                        value: arr[index],
                        done: false
                    }
                    index++
                    return result
                }
            }
            const value: {
                next: typeof next,
                [Symbol.iterator]: any
            } = {
                next,
                [SymbolIterator]: function() { return this }
            } as any

            return value
        }

        const FConsoleError = console.error

        const FResolveDesc = (obj: any, key: string | number | symbol) => {
            const weak = new FWeakMap()

            let currentTarget = obj

            while (currentTarget && !FBWeakMapHas(weak, currentTarget)) {
                FBWeakMapSet(weak, currentTarget, true)

                const desc = FReflect.getOwnPropertyDescriptor(currentTarget, key)

                if (desc !== undefined) {
                    FSetPrototypeOf(desc ,null)

                    return desc
                }

                currentTarget = FGetPrototypeOf(currentTarget)
            }

            return undefined
        }

        const shared = {
            FError,
            FCall,
            FApply,
            FBind,
            FMap,
            FWeakMap,
            FBWeakMapHas,
            FBWeakMapSet,
            FBWeakMapGet,
            FBArrayMap,
            FBArrayToIterator,
            FReflect,
            FCreateEmpty,
            FSetPrototypeOf,
            FGetPrototypeOf,
            FGetOwnPropertyDescriptor,
            FFreeze,
            FIsFrozen,
            FResolveDesc,
            FConsoleError,
        }

        FSetPrototypeOf(shared, null)
        FFreeze(shared)

        return shared
    }

    export type IShared = ReturnType<typeof makeShared>
}