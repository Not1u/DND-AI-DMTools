/**
 * 示例插件 2：规则速查 - 组合核心 op + 自定义 op。
 *
 * 演示 setup(api) 形态：可以在 setup 里做初始化，并返回额外的 ops。
 * 这里的 op 会用 api.call 反过来调用核心 op（rules.search / rules.read），
 * 说明插件既能自己实现，也能当"壳"去编排已有能力。
 */
export const name = 'rule-lookup'

export const setup = (api) => ({
  // 一步到位：给关键词，直接返回最匹配条目的正文（截断），省去两次调用
  'ext.rule.lookup': async (args) => {
    const q = String((args && args.query) || '').trim()
    if (!q) return { ok: false, error: '需要 query，例如 {"query":"擒抱 挣脱"}' }
    const limit = Math.max(1, Math.min(10, Number(args && args.limit) || 3))
    const max = Math.max(200, Math.min(4000, Number(args && args.chars) || 1200))
    const found = await api.call('rules.search', { query: q, limit: limit })
    if (!found || found.ok === false) return { ok: false, error: (found && found.error) || '检索失败' }
    const hits = found.items || found.hits || found.sections || found.results || []
    if (!hits.length) return { ok: true, query: q, count: 0, items: [], summary: '没有命中：' + q }
    const items = []
    for (const h of hits.slice(0, limit)) {
      const id = h.id || h.ref || h.key
      let text = h.snippet || h.text || ''
      if (id) {
        try {
          const full = await api.call('rules.read', { id: id })
          const ent = full && (full.entry || full)
          if (ent && (ent.text || ent.content)) text = String(ent.text || ent.content)
        } catch (e) { }
      }
      items.push({ id: id, title: h.title || h.name || id, book: h.book || '', text: text.slice(0, max) })
    }
    return { ok: true, query: q, count: items.length, items: items, summary: items.map(x => '【' + (x.book ? x.book + ' ' : '') + x.title + '】' + x.text.slice(0, 160) + '…').join('\n\n') }
  },
})
