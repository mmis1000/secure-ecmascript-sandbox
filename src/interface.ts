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

export type ValueWrapper = ValueWrapperPrimitive | ValueWrapperFunction | ValueWrapperObject

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
    type: 'function' | 'object'
}

export interface World {
    create(world: World) :any
    getRoot(): Response

    trap_get (token: ValueWrapper, key: ValueWrapper, receiverToken: ValueWrapper): Response
    trap_getOwnPropertyDescriptor (token: ValueWrapper, key: ValueWrapper): Response
    trap_ownKeys (token: ValueWrapper): Response
}