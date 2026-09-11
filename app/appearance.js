(function () {
  const h = React.createElement;
  let current = null, timer, revision = 0, saving = Promise.resolve();
  function commit(theme) {
    current = theme;
    window.SoloTheme.apply(theme);
    const rev = ++revision;
    clearTimeout(timer);
    window.dispatchEvent(new CustomEvent('solo-theme-save', { detail: '正在保存外观…' }));
    timer = setTimeout(() => {
      saving = saving.catch(() => {}).then(async () => {
        const response = await fetch('/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'theme.set', args: { theme } }) });
        const data = await response.json();
        if (!data.ok || !data.value?.saved) throw new Error(data.error || data.value?.saveError || '无法保存');
        if (rev === revision) window.dispatchEvent(new CustomEvent('solo-theme-save', { detail: '外观已保存，下次打开会保留。' }));
      }).catch(error => window.dispatchEvent(new CustomEvent('solo-theme-save', { detail: '保存失败：' + error.message + '，请重新调整后重试。' })));
    }, 240);
  }
  function ColorField({ label, value, fallback, onChange }) {
    const [draft, setDraft] = React.useState(value || '');
    React.useEffect(() => setDraft(value || ''), [value]);
    const valid = /^#[0-9a-f]{6}$/i.test(draft);
    return h('div', { className: 'appearance-color' }, h('label', null, label),
      h('div', { className: 'appearance-color-inputs' },
        h('input', { type: 'color', value: value || fallback, 'aria-label': label, onChange: e => onChange(e.target.value) }),
        h('input', { type: 'text', value: draft, placeholder: '自动配色', maxLength: 7, spellCheck: false, 'aria-label': label + ' Hex', 'aria-invalid': !!draft && !valid, onChange: e => { const next = e.target.value; setDraft(next); if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next); if (!next) onChange(null); }, onBlur: () => { if (draft && !valid) setDraft(value || ''); } }),
        h('button', { type: 'button', onClick: () => onChange(null), 'aria-label': label + '自动配色' }, '自动')));
  }
  window.SoloAppearance = function Appearance({ embedded }) {
    const api = window.SoloTheme;
    const [theme, setTheme] = React.useState(() => current || api.normalize({}));
    const latest = React.useRef(theme);
    const [status, setStatus] = React.useState('颜色实时预览，自动保存。');
    React.useEffect(() => {
      let alive = true;
      const sync = e => { current = api.normalize(e.detail); latest.current = current; setTheme(current); };
      const notify = e => setStatus(e.detail);
      window.addEventListener('solotrpg-theme', sync);
      window.addEventListener('solo-theme-save', notify);
      if (!current) fetch('/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'theme.get', args: {} }) }).then(r => r.json()).then(data => {
        if (alive && !current && data.value?.theme) api.apply(data.value.theme);
      }).catch(() => { if (alive) setStatus('外观读取失败，请稍后重试。'); });
      return () => { alive = false; window.removeEventListener('solotrpg-theme', sync); window.removeEventListener('solo-theme-save', notify); };
    }, []);
    const change = patch => { const next = api.normalize(Object.assign({}, latest.current, patch)); latest.current = next; setTheme(next); commit(next); };
    const resetColors = { background: null, surface: null, text: null, muted: null, onAccent: null };
    return h('section', { className: 'appearance-page' + (embedded ? ' embedded' : '') },
      h('div', { className: 'appearance-heading' }, h('span', { className: 'eyebrow' }, 'MAKE IT YOURS'), h('h1', null, '让冒险，有你的色彩。'), h('p', null, '柔和的光影，清晰的文字，每一次点击都有回应。')),
      h('div', { className: 'appearance-layout' },
        h('div', { className: 'appearance-controls' },
          h('h2', null, '主题与氛围'),
          h('div', { className: 'appearance-presets' }, api.presets.map(p => h('button', { key: p.name, className: theme.name === p.name ? 'selected' : '', onClick: () => change({ ...resetColors, name: p.name, accent: p.accent }) }, h('i', { style: { background: p.accent } }), p.label))),
          h('div', { className: 'appearance-segment' }, ['dark', 'light'].map(mode => h('button', { key: mode, className: theme.mode === mode ? 'selected' : '', onClick: () => change({ ...resetColors, mode }) }, mode === 'dark' ? '深空 · 深色' : '晨光 · 浅色'))),
          h('h2', null, '自由配色'), h('p', { className: 'appearance-hint' }, '使用取色器或输入 #RRGGBB。选择主题或明暗模式会恢复自动配色。'),
          h('div', { className: 'appearance-colors' }, [ ['accent', '强调色', '#5aa0ff'], ['background', '背景色', theme.mode === 'dark' ? '#101521' : '#eef2f8'], ['surface', '面板色', theme.mode === 'dark' ? '#1d2330' : '#ffffff'], ['text', '正文颜色', theme.mode === 'dark' ? '#edf2fc' : '#1d2638'], ['muted', '辅助文字颜色', theme.mode === 'dark' ? '#aab7cc' : '#596477'], ['onAccent', '按钮文字颜色', '#ffffff'] ].map(([key, label, fallback]) => h(ColorField, { key, label, value: theme[key], fallback, onChange: value => change({ [key]: key === 'accent' && !value ? '#5aa0ff' : value }) }))),
          h('h2', null, '动态效果'), h('div', { className: 'appearance-segment' }, [['full', '灵动'], ['reduced', '减少动效']].map(([motion, label]) => h('button', { key: motion, className: theme.motion === motion ? 'selected' : '', onClick: () => change({ motion }) }, label))),
          h('p', { className: 'appearance-hint' }, '同时尊重系统“减少动态效果”偏好。'),
          h('p', { role: 'status', className: 'appearance-status' }, status),
          h('button', { className: 'appearance-reset', onClick: () => change({ ...resetColors, name: 'azure', mode: 'dark', accent: '#5aa0ff', motion: 'full' }) }, '恢复默认外观')),
        h('aside', { className: 'appearance-preview' }, h('div', { className: 'preview-orb', 'aria-hidden': true }), h('span', { className: 'eyebrow' }, 'LIVE PREVIEW'), h('h2', null, '下一段传奇，\n从这里开始。'), h('p', null, '正文与辅助文字各自独立。自由选择你喜欢的背景，让长时间跑团也轻松。'), h('div', { className: 'preview-stats' }, h('span', null, h('b', null, '20'), '灵感时刻'), h('span', null, h('b', null, '∞'), '冒险可能')),
          h('button', { className: 'preview-action', onClick: e => { if (theme.motion !== 'reduced' && !matchMedia('(prefers-reduced-motion: reduce)').matches) e.currentTarget.animate([{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 360 }); } }, '感受一下点击反馈'),
          h('div', { className: 'preview-detail' }, h('b', null, '清晰的详情浮层'), h('p', null, '详情使用实色底与独立的高对比文字，长内容可以滚动阅读。')))));
  };
})();
