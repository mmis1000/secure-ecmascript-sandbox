namespace SES {
    export function makeShared () {
        'use strict';

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

        const SymbolIterator = Symbol.iterator

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
            const value = {
                next,
                [SymbolIterator]: function() { return this }
            }

            return value
        }

        const FConsoleError = console.error

        const shared = {
            FError,
            FCall,
            FApply,
            FBind,
            FMap,
            FWeakMap,
            // FWeakMapHas,
            // FWeakMapSet,
            // FWeakMapGet,
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

            FConsoleError,
        }

        FSetPrototypeOf(shared, null)
        FFreeze(shared)

        return shared
    }
}