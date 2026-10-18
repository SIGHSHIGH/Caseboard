// 由 grammar/caseboard.grammar 生成 src/dsl/generated/caseboard.parser.ts。
// 生成物提交进仓库：构建与测试都不依赖 codegen（本机沙箱里没有可用的 lezer CLI）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { buildParserFile } from '@lezer/generator'

const root = resolve(import.meta.dirname, '..')
const grammarPath = resolve(root, 'grammar/caseboard.grammar')
const outPath = resolve(root, 'src/dsl/generated/caseboard.parser.ts')

const source = readFileSync(grammarPath, 'utf8')
const { parser } = buildParserFile(source, {
  fileName: 'caseboard.grammar',
  typeScript: true,
  moduleStyle: 'es',
  includeNames: true,
  exportName: 'parser',
})

mkdirSync(dirname(outPath), { recursive: true })
const banner = '// 本文件由 scripts/build-grammar.mjs 从 grammar/caseboard.grammar 生成，请勿手改。\n// 改语法后运行：node scripts/build-grammar.mjs\n\n'
writeFileSync(outPath, banner + parser, 'utf8')
console.log('生成 ' + outPath + '（' + parser.length + ' 字节）')
