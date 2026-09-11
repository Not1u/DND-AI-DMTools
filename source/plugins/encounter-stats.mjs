/**
 * 示例插件 1：遭遇战统计。
 *
 * 演示最小插件形态：导出一个 `ops` 表即可挂到 /dnd5e/api 上，
 * 侧栏 UI 与 AI（DM）都能调用 `ext.encounter.stats`。
 */
export const name = 'encounter-stats'

export const ops = {
  // 统计当前战斗记录里的攻防表现：谁打了多少下、命中几次、造成多少伤害
  'ext.encounter.stats': async (args, api) => {
    const limit = Math.max(1, Math.min(800, Number(args && args.limit) || 400))
    let log = { entries: [], campaign: '', round: 0 }
    try { log = await api.readJson('data/combat-log.json') } catch (e) { return { ok: false, error: '没有战斗记录：' + (e && e.message) } }
    const entries = (log.entries || []).slice(-limit)
    const byActor = {}
    const put = (name) => (byActor[name] = byActor[name] || { actor: name, attacks: 0, hits: 0, misses: 0, crits: 0, damage: 0, healed: 0, moves: 0, feet: 0 })
    for (const e of entries) {
      const who = e.actor || '（未署名）'
      const s = put(who)
      const detail = String(e.detail || '')
      if (e.kind === 'attack') {
        s.attacks++
        if (/命中/.test(detail)) s.hits++
        if (/未中|失手/.test(detail)) s.misses++
        if (/重击|天然\s*20/.test(detail)) s.crits++
      } else if (e.kind === 'damage') {
        const m = /= *(-?\d+)\s*$/.exec(detail)
        if (m) s.damage += Math.max(0, Number(m[1]))
      } else if (e.kind === 'heal') {
        const m = /= *(-?\d+)\s*$/.exec(detail)
        if (m) s.healed += Math.max(0, Number(m[1]))
      } else if (e.kind === 'move') {
        s.moves++
        const m = /移动 *(\d+) *尺/.exec(detail)
        if (m) s.feet += Number(m[1])
      }
    }
    const rows = Object.keys(byActor).map(k => byActor[k]).sort((a, b) => (b.damage + b.healed) - (a.damage + a.healed)).map(r => Object.assign(r, {
      hitRate: r.attacks ? Math.round((r.hits / r.attacks) * 100) + '%' : '—',
      line: r.actor + '：攻击 ' + r.attacks + ' 次（命中 ' + r.hits + '，命中率 ' + (r.attacks ? Math.round((r.hits / r.attacks) * 100) + '%' : '—') + '）｜伤害 ' + r.damage + '｜治疗 ' + r.healed + '｜移动 ' + r.feet + ' 尺',
    }))
    return { ok: true, campaign: log.campaign, round: log.round, sample: entries.length, rows: rows, summary: rows.length ? rows.map(r => r.line).join('\n') : '（记录里还没有攻防数据）' }
  },
}
