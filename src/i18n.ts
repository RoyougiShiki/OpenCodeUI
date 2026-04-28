import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>

const resources: Record<string, Record<string, Record<string, unknown>>> = {}

for (const path in modules) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/)
  if (!match) continue
  const [, lang, ns] = match
  if (!resources[lang]) resources[lang] = {}
  resources[lang][ns] = modules[path].default ?? modules[path]
}

const allNamespaces = new Set<string>()
for (const path in modules) {
  const match = path.match(/\.\/locales\/[^/]+\/([^/]+)\.json$/)
  if (match) allNamespaces.add(match[1])
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'zh-CN',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: Array.from(allNamespaces),
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
