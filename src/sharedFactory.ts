export let DEV = false

export const flags = {
    DEV: false
}

const SES = {
    get DEV () {
        return flags.DEV
    },

    set DEV (value) {
        flags.DEV = value
    }
}

export function makeShared() {
    'use strict';

    // function/object that prefixed with F (which means the binding is frozen after the return)
    const FProxy = Proxy
    const FError = Error

    const FCall = Function.prototype.call

    const FMap = Map
    const FMapHas = Map.prototype.has
    const FMapSet = Map.prototype.set
    const FMapGet = Map.prototype.get

    const FWeakMap = WeakMap
    const FWeakMapHas = WeakMap.prototype.has
    const FWeakMapSet = WeakMap.prototype.set
    const FWeakMapGet = WeakMap.prototype.get


    const FBWeakMapHas: (self: WeakMap<any, any>, ...args: any[]) => any = FCall.bind(FWeakMapHas)
    const FBWeakMapSet: (self: WeakMap<any, any>, ...args: any[]) => any = FCall.bind(FWeakMapSet)
    const FBWeakMapGet: (self: WeakMap<any, any>, ...args: any[]) => any = FCall.bind(FWeakMapGet)

    const FBMapHas: (self: Map<any, any>, ...args: any[]) => any = FCall.bind(FMapHas)
    const FBMapSet: (self: Map<any, any>, ...args: any[]) => any = FCall.bind(FMapSet)
    const FBMapGet: (self: Map<any, any>, ...args: any[]) => any = FCall.bind(FMapGet)


    const FSet = Set
    const FSetHas = Set.prototype.has
    const FSetAdd = Set.prototype.add
    const FSetDelete = Set.prototype.delete

    const FWeakSet = WeakSet
    const FWeakSetHas = WeakSet.prototype.has
    const FWeakSetAdd = WeakSet.prototype.add
    const FWeakSetDelete = WeakSet.prototype.delete

    const FBSetHas: (self: Set<any>, ...args: any[]) => any = FCall.bind(FSetHas)
    const FBSetAdd: (self: Set<any>, ...args: any[]) => any  = FCall.bind(FSetAdd)
    const FBSetDelete: (self: Set<any>, ...args: any[]) => any  = FCall.bind(FSetDelete)

    const FBWeakSetHas: (self: WeakSet<any>, ...args: any[]) => any = FCall.bind(FWeakSetHas)
    const FBWeakSetAdd: (self: WeakSet<any>, ...args: any[]) => any  = FCall.bind(FWeakSetAdd)
    const FBWeakSetDelete: (self: WeakSet<any>, ...args: any[]) => any  = FCall.bind(FWeakSetDelete)

    const FArrayMap = Array.prototype.map
    const FBArrayMap: <T, U>(arg: T[], cb: (v: T, i: number) => U)=>U[] = FCall.bind(FArrayMap) as any

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

    const FBArrayToIterator: <T>(arr: T[])=> Iterable<T> = (arr: any[]) => {
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
            [SymbolIterator]: function () { return this }
        } as any

        return value
    }

    const FSetValues = Set.prototype.values
    const FSetIteratorNext = (FReflect.getPrototypeOf((new Set).values()) as any).next 
    const FBSetToIterator = (set: Set<any>) => {
        const iterator = FReflect.apply(FSetValues, set, [])

        const next = () => FReflect.apply(FSetIteratorNext, iterator, [])

        const value: {
            next: typeof next,
            [Symbol.iterator]: any
        } = {
            next,
            [SymbolIterator]: function () { return this }
        } as any

        return value
    }

    const FConsoleError = console.error

    /**
     * Using the getOwnPropertyDescriptor and FGetPrototypeOf
     * @param obj any
     * @param key object key
     */
    const FResolveDesc = (obj: any, key: string | number | symbol) => {
        const weak = new FWeakMap()

        let currentTarget = obj

        while (currentTarget && !FBWeakMapHas(weak, currentTarget)) {
            FBWeakMapSet(weak, currentTarget, true)

            const desc = FReflect.getOwnPropertyDescriptor(currentTarget, key)

            if (desc !== undefined) {
                FSetPrototypeOf(desc, null)

                return desc
            }

            currentTarget = FGetPrototypeOf(currentTarget)
        }

        return undefined
    }

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

            FFreeze(unsafeObj)

            if (!FIsFrozen) {
                throw new FError('tainted object!!!')
            }

            // the object may use timing attack to bypass get prototype check
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

            return 'value' in valueDesc ? valueDesc.value : null
        } catch (err) {
            FConsoleError('BAD ACTOR', unsafeObj, name)
            throw 'This shouldn\'t happen'
        }
    }

    const FNodeNodeNameGetter = typeof Node != 'undefined'
        ? FReflect.getOwnPropertyDescriptor(Node.prototype, 'nodeName')!.get!
        : () => {}

    // Test whether given object is a dom node or not
    const getNodeName = (obj: any) => {
        try {
            return FReflect.apply(FNodeNodeNameGetter, obj, [])
        } catch (err) {
            return null
        }
    }

    // prevent arguments.caller
    dropPrototypeRecursive(safeGetProp)

    /** 
     * expose `this` to getter/setter on these prototypes should be safe, 
     * because they only use internal slot of 'this'
     * input/output still need to be wrapped
     */
    const whitelistedPrototypes: any[] = [
        Date.prototype,

        Promise.prototype,

        Map.prototype,
        Set.prototype,

        WeakMap.prototype,
        WeakSet.prototype,

        ArrayBuffer.prototype,

        (Reflect.getPrototypeOf(Int8Array) as any).prototype, // TypedArray

        Int8Array.prototype,
        Int16Array.prototype,
        Int32Array.prototype,

        Uint8Array.prototype,
        Uint8ClampedArray.prototype,
        Uint16Array.prototype,
        Uint32Array.prototype,

        DataView.prototype,

        RegExp.prototype,

        FReflect.getPrototypeOf(FReflect.getPrototypeOf((function * () {})())), // generator prototype
        FReflect.getPrototypeOf(new Map().values()), // map iterator
        FReflect.getPrototypeOf(new Set().values()), // set iterator
    ]

    if (typeof SharedArrayBuffer !== 'undefined') {
        whitelistedPrototypes[whitelistedPrototypes.length] = SharedArrayBuffer.prototype
    }

    const shared = {
        FProxy,
        FError,

        FMap,
        FBMapHas,
        FBMapGet,
        FBMapSet,

        FWeakMap,
        FBWeakMapHas,
        FBWeakMapSet,
        FBWeakMapGet,

        FSet,
        FBSetHas,
        FBSetAdd,
        FBSetDelete,

        FWeakSet,
        FBWeakSetHas,
        FBWeakSetAdd,
        FBWeakSetDelete,

        FBArrayMap,
        FBArrayToIterator,
        FBSetToIterator,
        FReflect,
        FCreateEmpty,
        FFreeze,
        FIsFrozen,
        FResolveDesc,
        FConsoleError,
        dropPrototypeRecursive,
        safeGetProp,
        getNodeName,
        whitelistedPrototypes
    }

    FSetPrototypeOf(shared, null)
    FFreeze(shared)

    return shared
}

export type IShared = ReturnType<typeof makeShared>
