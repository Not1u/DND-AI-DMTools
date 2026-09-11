// tools/migrate-gear.mjs — 迁移：把旧格式 armor/weapons 字段同步进 inventory 与显式 equipment
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'characters')
const srd = JSON.parse(fs.readFileSync(path.join(ROOT, 'rules', 'dnd5e-srd.json'), 'utf8'))
const armorName = { unarmored: '无甲', leather: '皮甲', studdedLeather: '镶钉皮甲', hide: '生皮甲', chainShirt: '锁子衫', scaleMail: '鳞甲', breastplate: '胸甲', halfPlate: '半身板甲', ringMail: '环甲', chainMail: '链甲', splint: '条板甲', plate: '全身板甲' }

for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.json'))) {
  const file = path.join(DIR, f)
  const pc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const inv = Array.isArray(pc.inventory) ? pc.inventory.slice() : []
  const eq = pc.equipment || { armor: null, shield: null, mainHand: null, offHand: null, worn: [] }
  const added = []
  const has = (key) => inv.some(x => x.key === key)
  const push = (item) => { if (!has(item.key)) { inv.push(item); added.push(item.name) } }

  if (pc.armor && pc.armor.key) {
    const ad = srd.armor[pc.armor.key] || {}
    push({ key: pc.armor.key, name: armorName[pc.armor.key] || pc.armor.key, qty: 1, cat: 'armor', kind: 'armor' })
    if (!eq.armor) eq.armor = { key: pc.armor.key, name: armorName[pc.armor.key] || pc.armor.key, base: ad.base, dexCap: (ad.dexCap === undefined ? null : ad.dexCap), category: ad.category || 'light', magicBonus: 0 }
  }
  if (pc.armor && pc.armor.shield) {
    const sb = Number(srd.armor.shieldBonus) || 2
    push({ key: 'shield', name: '盾牌', qty: 1, cat: 'shield', kind: 'shield', acBonus: sb })
    if (!eq.shield) eq.shield = { key: 'shield', name: '盾牌', acBonus: sb, magicBonus: 0 }
  }
  ;(pc.weapons || []).forEach((w, i) => {
    const wd = srd.weapons[w] || {}
    push({ key: w, name: wd.name || w, qty: 1, cat: 'weapon', kind: 'weapon', damage: wd.damage || '', dmgType: wd.dmgType || '', props: wd.props || [] })
    const entry = { key: w, name: wd.name || w, damage: wd.damage || '1d4', dmgType: wd.dmgType || '', props: wd.props || [], magicBonus: 0 }
    if (i === 0 && !eq.mainHand) eq.mainHand = entry
    else if (i === 1 && !eq.offHand) eq.offHand = entry
  })

  pc.inventory = inv
  pc.equipment = eq
  pc.meta = pc.meta || {}
  pc.meta.updatedAt = new Date().toISOString()
  fs.writeFileSync(file, JSON.stringify(pc, null, 2), 'utf8')
  console.log(f + ' | 新增物品: ' + (added.join('、') || '(none)') + ' | 背包=' + inv.length + ' | 装备: 护甲=' + (eq.armor ? eq.armor.name : '无') + ' 盾=' + (eq.shield ? eq.shield.name : '无') + ' 主手=' + (eq.mainHand ? eq.mainHand.name : '无') + ' 副手=' + (eq.offHand ? eq.offHand.name : '无'))
}
