/**
 * shared/ui/wot 的公共类型。
 * 业务侧只依赖这些项目自己的形状，组件库换型时不需要全仓改调用点。
 */

/** 下拉与选择器的一条可选项：value 落库，label 展示。 */
export interface WSelectOption {
  value: string | number
  label: string
}
