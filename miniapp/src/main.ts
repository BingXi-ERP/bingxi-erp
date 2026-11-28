import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './shared/design/tokens.css'
import './styles/index.scss'

/**
 * uni-app 应用入口：各平台构建都从这里取回应用实例。
 * 全局样式与令牌从这里引入，随全局样式产物一起出包。
 *
 * wot-design-uni 不提供 Vue 插件式安装入口（包出口只导出 composable 与类型），
 * 组件按需经 pages.json 的 easycom 规则解析，业务侧统一只用 shared/ui/wot/* 封装件。
 */
export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  return { app }
}
