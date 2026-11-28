import { zhCN } from './zh-CN'

export type MessageDictionary = {
  [Section in keyof typeof zhCN]: {
    [Leaf in keyof (typeof zhCN)[Section]]: string
  }
}
export type MessageLocale = keyof typeof dictionaries

export const dictionaries = {
  'zh-CN': zhCN,
} as const satisfies Record<string, MessageDictionary>

type MessageSection = keyof MessageDictionary
export type MessageKey = {
  [S in MessageSection]: `${S}.${Extract<keyof MessageDictionary[S], string>}`
}[MessageSection]

export function createTranslator(locale: MessageLocale) {
  const dictionary: MessageDictionary = dictionaries[locale]

  return function translate(key: MessageKey): string {
    const [section, leaf] = key.split('.') as [MessageSection, string]
    const messages = dictionary[section] as Record<string, string>
    const value = messages[leaf]
    if (value === undefined) throw new Error(`Missing message: ${key}`)
    return value
  }
}

export const t = createTranslator('zh-CN')
