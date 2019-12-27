// @ts-check

import { createRealm } from '../lib/browserRealm.js'

var s = createRealm()
s.console = console
s.eval('console.log("hi"); debugger')