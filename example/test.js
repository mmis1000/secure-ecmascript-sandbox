// @ts-check

import { createRealm } from '../lib/browserRealm.js'

var s = createRealm()
s.console = console
s.test = new Int8Array(10)
s.eval('debugger; console.log("hi")')