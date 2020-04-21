import SES from '../sandbox'
import fs from 'fs'
import path from 'path'

fs.writeFileSync(path.resolve(__dirname, './dist.js'), SES.createScript(SES))