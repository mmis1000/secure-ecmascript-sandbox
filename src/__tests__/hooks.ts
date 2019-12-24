import SES from '../sandbox'

describe('hooks', () => {
    describe('ban dereference', () => {
        let fail = false
        const secretFunction = () => {
            fail = true
        }

        const remote = SES.fastInitNode(null, (ctx) => {
            ctx.registerUnwrapCallback(obj => {
                if (obj === secretFunction) {
                    throw new Error('now allowed')
                }
            })
        })

        remote.secretFunction = secretFunction
        
        test('call do throw', () => {
            expect(() => {
                remote.eval(`secretFunction()`)
            }).toThrow()
        })

        test('real function is not actually called', () => {
            expect(fail).toBe(false)
        })

        test('get do throw', () => {
            expect(() => {
                remote.eval(`secretFunction.a`)
            }).toThrow()
        })
        
        test('set do throw', () => {
            expect(() => {
                remote.eval(`secretFunction.a = 1`)
            }).toThrow()
        })
    })

    describe('ban trap', () => {
        let fail = false
        const secretFunction = () => {
            fail = true
        }

        const remote = SES.fastInitNode(null, (ctx) => {
            ctx.registerTrapHooks({
                apply (target, thisArg, argArray) {
                    if (ctx.unwrap(target).value === secretFunction) {
                        return {
                            success: false,
                            value: ctx.toWrapper(new Error('calling not allowed'), ctx.world)
                        }
                    }
                }
            })
        })

        remote.secretFunction = secretFunction
        
        test('call do throw', () => {
            expect(() => {
                remote.eval(`secretFunction()`)
            }).toThrow()
        })

        test('real function is not actually called', () => {
            expect(fail).toBe(false)
        })
        
        test('other trap still works', () => {
            expect(() => {
                remote.eval(`secretFunction.a`)
            }).not.toThrow()
            
            expect(() => {
                remote.eval(`secretFunction.a = 1`)
            }).not.toThrow()
        })

        test('property was successfully set on object', () => {
            expect((secretFunction as any).a).toBe(1)
        })
    })

    describe('forge trap result', () => {
        let fail = false
        const secretFunction = () => {
            fail = true
            return 'secret'
        }

        const remote = SES.fastInitNode(null, (ctx) => {
            ctx.registerTrapHooks({
                apply (target, thisArg, argArray) {
                    if (ctx.unwrap(target).value === secretFunction) {
                        return {
                            success: true,
                            value: ctx.toWrapper('censored', ctx.world)
                        }
                    }
                }
            })
        })

        remote.secretFunction = secretFunction
        
        test('result was successfully forged', () => {
            expect(remote.eval(`secretFunction()`)).toBe('censored')
        })
        
        test('real function is not actually called', () => {
            expect(fail).toBe(false)
        })
    })

    describe('remap reference (combine token meta and custom proxy init)', () => {
        const remote = SES.fastInitNode(null, (ctx) => {
            ctx.registerMetaCallback(obj => {
                if (obj === Array) {
                    return {
                        isArray: true
                    }
                } else {
                    return {}
                }
            })
        }, (ctx) => {
            ctx.registerCustomProxyInit(token => {
                if (token.meta.isArray) {
                    return Array
                }
            })
        })

        remote.main = { Array }

        test('Reference is remapped as you expect', () => {
            expect(() => {
                remote.eval(
                    `
                        if (typeof main.Array !== 'function') {
                            throw new Error('not function')
                        }

                        if (main.Array !== Array) {
                            throw new Error('no equal')
                        }
                    `
                )
            }).not.toThrow()
        })
    })
})