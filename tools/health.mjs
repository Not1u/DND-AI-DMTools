const U = 'http://127.0.0.1:4620'
const api = async (op, args) => (await fetch(U + '/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, args: args === undefined ? null : args }) })).json()
const out = []

// 1) 页面与资源
for (const p of ['/', '/app/mount.js', '/app/app.css', '/app/vendor/react.js', '/app/ui-client.js']) {
  const r = await fetch(U + p)
  const body = await r.text()
  out.push('GET ' + p.padEnd(22) + ' -> ' + r.status + '  ' + r.headers.get('content-type') + '  ' + body.length + ' B')
}

// 2) 核心能力
let r
r = await api('party.list', {})
out.push('party.list     -> ' + r.ok + ' | ' + r.value.items.map(i => i.name + ' ' + i.cls + ' HP' + i.hp + '/' + i.max).join(' / '))
r = await api('tools.list', {})
out.push('tools.list     -> core ops ' + r.value.count + ' ' + JSON.stringify(r.value.groups))
r = await api('rules.stats', {})
out.push('rules.stats    -> ' + r.value.total + ' 条 / ' + r.value.books.length + ' 本书')
r = await api('rules.search', { query: '擒抱 挣脱', limit: 2 })
out.push('rules.search   -> ' + r.value.items.map(h => h.id + ' ' + h.title).join(' | '))
r = await api('mod.statblock', { title: '地精控灵师' })
out.push('mod.statblock  -> ' + r.value.summary + ' 六维 ' + JSON.stringify(r.value.abilities))
r = await api('map.get', {})
out.push('map.get        -> ' + r.value.name + ' ' + r.value.w + 'x' + r.value.h + ' 单位 ' + r.value.tokens.length)
r = await api('log.list', { limit: 1 })
out.push('log.list       -> ' + r.value.total + ' 条，轮次 R' + r.value.round)

// 3) 插件（独立运行下也应可用）
r = await api('ext.list', {})
out.push('ext.list       -> plugins ' + r.value.plugins.length + ' / pluginOps ' + r.value.pluginOps.length)
r = await api('ext.encounter.stats', {})
out.push('ext.encounter.stats -> ' + (r.value.ok ? String(r.value.summary).split('\n')[0] : r.value.error))
r = await api('ext.rule.lookup', { query: '借机攻击', chars: 200 })
out.push('ext.rule.lookup -> ' + (r.value.ok ? (r.value.count + ' 条: ' + ((r.value.items[0] || {}).title) + ' | ' + String(((r.value.items[0] || {}).text) || '').slice(0, 40)) : r.value.error))
r = await api('ext.image.map', {})
out.push('ext.image.map  -> ' + (r.value.ok ? r.value.summary : r.value.error))

// 4) 写操作（改了要能落盘）：加临时状态再恢复
r = await api('pc.apply', { id: 'pc-brolin-anvil', conditions: { add: [{ key: 'prone', note: '自检' }] } })
out.push('pc.apply (写)  -> ' + r.value.summary + ' saved=' + r.value.saved)
r = await api('pc.apply', { id: 'pc-brolin-anvil', conditions: { remove: ['prone'] } })
out.push('pc.apply (还原)-> ' + r.value.summary)

console.log(out.join('\n'))
