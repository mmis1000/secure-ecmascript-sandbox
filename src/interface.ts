namespace SES {
    interface CommandGetRoot {
        type: "GetRoot"
    }

    export type Command = CommandGetRoot

    interface ValueWrapperPrimitive {
        type: 'primitive',
        value: undefined | null | string | number | bigint | boolean | symbol
    }
    interface ValueWrapperFunction {
        type: 'function',
        value: Token
    }
    interface ValueWrapperObject {
        type: 'object',
        value: Token
    }

    export interface ValueWrapperRecord {
        type: 'record',
        value: {
            [key: string]: ValueWrapper
        }
    }

    export type ValueWrapper = ValueWrapperPrimitive | ValueWrapperFunction | ValueWrapperObject | ValueWrapperRecord

    export interface ResponseFailed {
        success: false,
        value: ValueWrapper

    }

    export interface Response {
        success: boolean,
        value: ValueWrapper
    }

    export interface Token {
        owner: World,
        type: 'function' | 'object',
        meta: Record<string, any>
    }

    type ProxyHandlers = Omit<Required<ProxyHandler<any>>, 'enumerate'>

    type MapToValueWrapperList<T> = {
        [K in keyof T]-?: ValueWrapper
    }

    type BeArray<T> = T extends any[] ? T : never

    type Unshift<T extends any[], U> = ((arg: U, ...args: T) => void) extends ((...args: infer X) => void) ? X : never

    type MapToHook<T extends { [key: string]: (...args: any[])=>any}> = {
        [K in keyof T]: (...args: BeArray<MapToValueWrapperList<Parameters<T[K]>>>) => Response
    }

    type Traps = MapToHook<ProxyHandlers>

    export interface World {
        create(world: World): any
        getRoot(): Response
        getCustomTrap: API.getCustomTrap

        trap_get: Traps['get']
        trap_set: Traps['set']
        trap_getOwnPropertyDescriptor: Traps['getOwnPropertyDescriptor']
        trap_defineProperty: Traps['defineProperty']
        trap_ownKeys: Traps['ownKeys']
        trap_apply: Traps['apply']
        trap_construct: Traps['construct']
        trap_getPrototypeOf: Traps['getPrototypeOf']
        trap_setPrototypeOf: Traps['setPrototypeOf']

        trap_isExtensible: Traps['isExtensible']
        trap_preventExtensions: Traps['preventExtensions']
        trap_has: Traps['has']
        trap_deleteProperty: Traps['deleteProperty']
    }

    export interface IInit {
        (conf ?: API.ConfigureCallback): <T>(root: T) => World
    }

    export interface IToToken<T extends object> {
        (obj: T, world: World, type: 'function' | 'object'): Token
    }
    export interface IUnwrapToken {
        (token: Token): any
    }
    export interface IToWrapper {
        (obj: any, world: World): ValueWrapper
    }
    export interface IToRecord {
        (obj: any, world: World): ValueWrapper
    }
    
    export interface IUnwrap {
        (unsafeObj: ValueWrapper): any
    }

    export namespace API {
        /**
         * Hooks allow attaching data before token send to another world
         *
         * This was called on the side that own the real object and
         * called when any object type is converted to token.  
         * Returned value will be merged onto the meta field of token
         *
         * @side real
         * @returns A dict that contains literal or prototype-less value
         */
        export interface IMetaAttach<T extends object> {
            (obj: any): T
        }

        /**
         * The custom trap used only for plugin communication
         *
         * @side real
         * @returns Any custom response
         */
        export interface ICustomTrap {
            (...args: ValueWrapper[]): Response
        }

        export type ConstructorParameters<T> = T extends { new (...args: infer U): any } ? U : never

        /**
         * Hooks allow replacing the to proxy result if necessary
         * The token => value relationship WILL be distorted after returning
         * Using the proxy in side MAY cause problem due to half initialized state
         * @side shadow
         * @returns Any custom response
         */
        export interface ICustomProxyInit {
            (token: Token, originalProxy: any, originalHandlers: ConstructorParameters<typeof Proxy>[1]): any
        }

        /**
         * Hooks allow host to deny using given real value by throwing error
         *
         * @side real
         */
        export interface UnwrapCallBack {
            (realValue: any): void
        }

        /**
         * Hooks allow host to replace certain hook response
         *
         * @side real
         * @returns Any custom response or undefined to just do nothing
         */
        export type TrapHooks = {
            [K in keyof Traps]+?: (...args: BeArray<Parameters<Traps[K]>>) => (Response | undefined)
        }

        export interface RegisterMetaCallback {
            (callback: IMetaAttach<any>): void
        }

        export interface RegisterCustomTrap {
            (trapName: string, callback: ICustomTrap): void
        }

        export interface RegisterCustomProxyInit {
            (callback: ICustomProxyInit): void
        }

        export interface RegisterUnwrapCallback {
            (callback: UnwrapCallBack): void
        }

        export interface RegisterTrapHooks {
            (callback: TrapHooks): void
        }

        export interface getCustomTrap {
            (name: string): ICustomTrap
        }

        export interface ConfigureCallback {
            (
                registerMetaCallBack: RegisterMetaCallback,
                registerCustomTrap: RegisterCustomTrap,
                registerCustomProxyInit: RegisterCustomProxyInit,
                registerUnwrapCallBack: RegisterUnwrapCallback,
                registerTrapHooks: RegisterTrapHooks,
                shared: ReturnType<typeof makeShared>,
                proxyToToken: WeakMap<object, Token>,
                tokenToProxy: WeakMap<Token, object>,
                realToToken: WeakMap<any, Token>,
                tokenToReal: WeakMap<Token, any>,
                unwrap: IUnwrap,
                toWrapper: IToWrapper,
                toRecord: IToRecord,
                world: World
            ): void
        }
    }
}