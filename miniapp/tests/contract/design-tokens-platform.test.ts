/**
 * 设计令牌的平台选择器契约（复审 finding 1 的回归锁）。
 *
 * WXSS 没有文档根选择器，令牌声明里它只允许出现在 H5 构建里。这里不复刻条件编译规则，
 * 而是直接调用 uni-app 构建期处理 .css 用的同一个预处理器：vite-plugin-uni 的
 * uni:pre / uni:pre-css 插件就是拿 @dcloudio/uni-cli-shared 的 preCss 按平台展开源码，
 * 所以本断言与真实产物同源，不是对项目源码形状的猜测。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initPreContext, preCss } from '@dcloudio/uni-cli-shared'

const tokensPath = resolve(process.cwd(), 'src/shared/design/tokens.css')
const tokensSource = readFileSync(tokensPath, 'utf8')

describe('design tokens 的按平台选择器', () => {
  it('mp-weixin 展开结果里不含根选择器，令牌仍挂在 page 上', () => {
    initPreContext('mp-weixin')
    const mpCss = preCss(tokensSource, tokensPath) as string

    expect(mpCss).not.toContain(':root')
    expect(mpCss).toMatch(/(^|\n)page\s*\{/)
    expect(mpCss).toContain('--color-primary: #176b87;')
    expect(mpCss).toContain('--hairline: 1rpx;')
  })

  it('H5 展开结果里根选择器与 page 同时命中', () => {
    initPreContext('h5')
    const h5Css = preCss(tokensSource, tokensPath) as string

    expect(h5Css).toMatch(/:root,\s*\npage\s*\{/)
    expect(h5Css).toContain('--color-primary: #176b87;')
  })
})
