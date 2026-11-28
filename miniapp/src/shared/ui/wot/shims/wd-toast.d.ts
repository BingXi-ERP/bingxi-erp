/**
 * wot-design-uni 的 composable 类型补位（仅类型，不参与运行时解析）。
 *
 * 为什么需要它：wot-design-uni 以 uni_modules 形式发布，包里只有 .ts 源码，没有 .d.ts。
 * 直接 import 'wot-design-uni/components/wd-toast' 会把它的实现源码
 * （components/common/util.ts 等）拉进本项目的类型检查图，而它的写法不满足本项目
 * tsconfig 的 noUncheckedIndexedAccess，vue-tsc 会在 node_modules 里报 10 条错，
 * typecheck 门就红了。放宽自己源码的严格度去迁就第三方包不是可接受的解法。
 *
 * 这里通过 tsconfig.paths 把该 specifier 指到本文件，返回类型仍然引用它自己的 types 模块，
 * 所以返回值的方法面还跟着上游 types.ts。但要如实承认代价：本文件的 useToast 是我们手抄的声明，
 * vue-tsc 因此不再校验真实模块是否导出这个名字、签名是否还是 (selector: string = '') => Toast，
 * 上游一旦改名或改签名，类型检查不会红，只有运行时才会炸。
 * 这条盲区由 tests/contract/wot-runtime-api.test.ts 补：它在 CI 里直接 import 真实模块
 * （vitest 不读 tsconfig.paths，解析到的就是 node_modules 里的 .ts 源码），断言 useToast 是函数
 * 且返回封装件真正调用的那批方法。上游发布 .d.ts 或我们有生成声明的方案后，删掉本 shim 与对应 paths。
 * 构建期由 Vite 解析到真实模块，行为不受影响。
 */
import type { Toast } from 'wot-design-uni/components/wd-toast/types'

export declare function useToast(selector?: string): Toast
