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

    export interface World {
        create(world: World): any
        getRoot(): Response
        getCustomTrap: API.getCustomTrap

        trap_get(token: ValueWrapper, key: ValueWrapper, receiverToken: ValueWrapper): Response
        trap_set(target: ValueWrapper, key: ValueWrapper, value: ValueWrapper, receiver: ValueWrapper): Response
        trap_getOwnPropertyDescriptor(token: ValueWrapper, key: ValueWrapper): Response
        trap_defineProperty(target: ValueWrapper, key: ValueWrapper, attributes: ValueWrapper): Response
        trap_ownKeys(token: ValueWrapper): Response
        trap_apply(target: ValueWrapper, thisArg: ValueWrapper, argArray: ValueWrapper): Response
        trap_construct(target: ValueWrapper, argArray: ValueWrapper, newTarget: ValueWrapper): Response
        trap_getPrototypeOf(target: ValueWrapper): Response
        trap_setPrototypeOf(target: ValueWrapper, prototype: ValueWrapper): Response

        trap_isExtensible(target: ValueWrapper): Response
        trap_preventExtensions(target: ValueWrapper): Response
        trap_has(target: ValueWrapper, key: ValueWrapper): Response
        trap_deleteProperty(target: ValueWrapper, key: ValueWrapper): Response
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

        export interface RegisterMetaCallBack {
            (callback: IMetaAttach<any>): void
        }

        export interface RegisterCustomTrap {
            (trapName: string, callback: ICustomTrap): void
        }

        export interface RegisterCustomProxyInit {
            (callback: ICustomProxyInit): void
        }

        export interface getCustomTrap {
            (name: string): ICustomTrap
        }

        export interface ConfigureCallback {
            (
                registerMetaCallBack: RegisterMetaCallBack,
                registerCustomTrap: RegisterCustomTrap,
                registerCustomProxyInit: RegisterCustomProxyInit,
                shared: ReturnType<typeof makeShared>,
                proxyToToken: WeakMap<object, Token>,
                tokenToProxy: WeakMap<Token, object>,
                realToToken: WeakMap<any, Token>,
                tokenToReal: WeakMap<Token, any>,
                unwrap: IUnwrap,
                toWrapper: IToWrapper,
                toRecord: IToRecord
            ): void
        }
    }
}