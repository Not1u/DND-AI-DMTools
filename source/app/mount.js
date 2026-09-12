/**
 * SoloTRPG 外壳脚本：把 engine/ui-client.latest.txt 这份 UI 源码
 * 用和 DSH 插件完全相同的方式装载（new Function('React','host','styles','console', src)），
 * 再提供一个最小 ctx（registerTab / effect / timer）把它挂成整页应用。
 *
 * 这样：同一份 UI 源码，既能跑在 DSH 侧栏里，也能独立跑在这个壳里。
 */
(function () {
  const boot = document.getElementById('boot')
  const rootEl = document.getElementById('root')

  const host = {
    call: async function (name, args) {
      const res = await fetch('/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: name, args: args === undefined ? null : args }),
      })
      const data = await res.json().catch(() => null)
      if (!data || data.ok !== true) throw new Error((data && data.error) || ('rpc failed: ' + name))
      return data.value
    },
  }

  window.SoloHost=host;
  const changes=new EventSource('/events');let refreshTimer;changes.onmessage=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>window.dispatchEvent(new Event('solo-state')),60)};
  const styles = {
    insert: function (css) {
      const el = document.createElement('style')
      el.setAttribute('data-solo-trpg', '1')
      el.textContent = css
      document.head.appendChild(el)
      return function () { if (el.parentNode) el.parentNode.removeChild(el) }
    },
  }

  const tabs = []
  const ctx = {
    effect: function (fn) { const d = fn(); return function () { if (typeof d === 'function') d() } },
    get: function (name) {
      if (name === 'betterSidebar') {
        return {
          registerTab: function (spec) {
            tabs.push({ id: spec.id, title: spec.title, component: spec.component })
            render()
            return function () { }
          },
        }
      }
      return undefined
    },
    timer: { interval: function (ms, fn) { const t = setInterval(fn, ms); return function () { clearInterval(t) } } },
    logger: console,
  }

  let activeId = null
  let mounted = null
  const h = window.React.createElement

  function render() {
    if (window.__soloMounted) return
    // 首次：把容器画出来；之后交给 React 自己管理
  }

  function preferredId() {
    const ws = tabs.find((t) => /workspace/.test(t.id))
    return (ws || tabs[0] || {}).id || null
  }

  function App() {
    const [cur, setCur] = React.useState(preferredId());
    const [pages,setPages]=React.useState([]);
    React.useEffect(()=>{window.SoloOpenPage=page=>{setPages(old=>old.some(x=>x.id===page.id)?old:[...old,page]);setCur(page.id)};return()=>{delete window.SoloOpenPage}},[]);
    const allTabs=[...tabs,...pages.map(p=>({...p,closable:true,component:()=>p.kind==='detail'?h('div',{className:'solo-detail-page'},h('h1',null,p.title),p.items.map((item,i)=>h('article',{key:i},h('h2',null,item.name),item.meta?h('small',null,item.meta):null,h('p',null,item.desc||'')))):p.kind==='character'?h(window.SoloCharacterPage,{actorId:p.actorId}):h(window.SoloPanelPage,{panel:p.panel})}))];
    React.useEffect(() => { if (window.SoloMotion) window.SoloMotion.updateTabs() }, [cur])
    activeId = cur
    const tab = allTabs.find((t) => t.id === cur) || tabs[0]
    return h('div', { className: 'solo-shell' },
      h('div', { className: 'solo-top' },
        h('span', { className: 'logo' }, '⚔ SoloTRPG'),
        h('span', { className: 'dim' }, '单人跑团 · 5e 引擎'),
        h('div', { className: 'sp' }),
        h('div', { className: 'solo-tabs' }, allTabs.map((t) => h('button', {
          key: t.id, className: 'solo-tab' + (tab && t.id === tab.id ? ' on' : ''), onClick: () => setCur(t.id),
        },t.title,t.closable?h('span',{className:'solo-tab-close',role:'button','aria-label':'关闭 '+t.title,onClick:e=>{e.stopPropagation();setPages(old=>old.filter(p=>p.id!==t.id));if(cur===t.id)setCur(preferredId())}},'×'):null))),
        h('span', { className: 'dim' }, '独立跑团工作台')),
      h('div', { className: 'solo-body' }, tab ? tab.component() : null))
  }

  async function main() {
    let src
    try {
      const r = await fetch('/app/ui-client.js', { cache: 'no-store' })
      src = await r.text()
      window.__soloUI = { bytes: src.length, loadedAt: new Date().toISOString() }
    } catch (e) {
      boot.textContent = '装载 UI 源码失败：' + e.message
      return
    }
    if (!src || src.length < 500) { boot.textContent = 'UI 源码为空（engine/ui-client.latest.txt 缺失？先跑 tools/sync-from-repo.mjs）'; return }
    let plugin
    try {
      const factory = new Function('React', 'host', 'styles', 'console', src)
      plugin = factory(window.React, host, styles, console)
    } catch (e) { boot.textContent = 'UI 源码执行失败：' + e.message; return }
    try {
      plugin.apply(ctx)
      tabs.push({ id: 'modules', title: '模组库 / 上传', component: () => h(window.SoloModuleLibrary, { call: host.call }) })
      tabs.push({ id: 'appearance', title: '外观', component: () => h(window.SoloAppearance, {}) })
      tabs.push({id:'battle',title:'战斗专页',component:()=>h(window.SoloBattlePage,{})});

    } catch (e) { boot.textContent = 'UI 挂载失败：' + e.message; return }
    if (!tabs.length) { boot.textContent = 'UI 没有注册任何页签'; return }
    boot.style.display = 'none'
    window.__soloMounted = true
    window.ReactDOM.createRoot(rootEl).render(React.createElement(App, null))
    console.log('[solo-trpg] UI ready:', src.length, 'bytes, tabs:', tabs.map((t) => t.title).join(','))
  }

  function paintShell(th) {
    try {
      const de = document.documentElement
      if (th && th.accent) de.style.setProperty('--solo-accent', th.accent)
      de.classList.toggle('solo-light', !!(th && th.mode === 'light'))
    } catch (e) { }
  }
  window.addEventListener('solotrpg-theme', function (ev) { paintShell(ev.detail) })
  host.call('theme.get', {}).then(function (r) { if (r && r.ok) paintShell(r.theme) }).catch(function () { })

  main()
})()
