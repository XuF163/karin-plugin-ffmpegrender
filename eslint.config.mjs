import neostandard from 'neostandard'

const ignores = ['node_modules', 'temp', 'logs', 'data', 'lib']
export default neostandard({ ignores, ts: true })
