import { codeToHtml } from 'shiki'

export async function testShiki() {
  const code = `console.log("hello")\nconsole.log("world")`
  const html = await codeToHtml(code, {
    lang: 'js',
    theme: 'github-dark',
  })
  console.log(html)
}
