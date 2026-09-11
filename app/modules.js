(function () {
  const h = React.createElement;
  window.SoloModuleLibrary = function ModuleLibrary({ call }) {
    const [uploaded, setUploaded] = React.useState([]);
    const [library, setLibrary] = React.useState([]);
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState('');
    const [query, setQuery] = React.useState('');
    const [hits, setHits] = React.useState([]);
    const [body, setBody] = React.useState('');
    const [selected, setSelected] = React.useState('');
    const reload = async () => {
      const response = await fetch('/api/modules');
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setUploaded(data.items);
      const list = await call('mod.list', {});
      if (!list.ok) throw new Error(list.error);
      setLibrary(list.items);
    };
    React.useEffect(() => { reload().catch(e => setMessage(e.message)); }, []);
    const upload = async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) { setMessage('文件不能超过 50 MB，请先拆分 PDF。'); return; }
      setBusy(true); setMessage('正在导入 ' + file.name + '，提取文字可能需要一些时间…');
      try {
        const response = await fetch('/api/modules?filename=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        const result = await response.json();
        if (!result.ok) throw new Error(result.error);
        await reload();
        setMessage(result.duplicate ? '该文件已导入，无需重复上传。' : '已导入「' + result.name + '」：' + result.count + ' 个文字片段，可立即检索或让 AI 查阅。');
        setHits([]); setBody('');
      } catch (e) { setMessage('导入失败：' + e.message); }
      finally { setBusy(false); }
    };
    const search = async () => {
      if (!query.trim()) return;
      setBusy(true); setBody('');
      try {
        const result = await call('mod.search', { query, module: selected || undefined, limit: 30 });
        if (!result.ok) throw new Error(result.error);
        setHits(result.items); setMessage(result.items.length ? '找到 ' + result.items.length + ' 条结果。' : '未找到匹配内容。');
      } catch (e) { setMessage(e.message); }
      finally { setBusy(false); }
    };
    const read = async id => {
      try { const result = await call('mod.read', { id, chars: 30000 }); if (!result.ok) throw new Error(result.error); setBody(result.title + '\n\n' + result.text); }
      catch (e) { setMessage(e.message); }
    };
    return h('section', { className: 'module-library' },
      h('h2', null, '模组库'),
      h('p', null, '上传自己的冒险模组，导入后即可检索，AI 也能通过模组工具读取内容。'),
      h('label', { className: 'module-upload' }, '上传模组（PDF / TXT / MD / JSON）', h('input', { type: 'file', accept: '.pdf,.txt,.md,.json', disabled: busy, onChange: upload, 'aria-label': '上传模组' })),
      h('p', { className: 'module-note' }, '每个文件最多 50 MB。PDF 提取文字与页码，不导入插图或地图；扫描版需先做 OCR。文件只在本机处理。'),
      h('p', { role: 'status', 'aria-live': 'polite' }, message),
      h('h3', null, '我上传的模组（' + uploaded.length + '）'),
      uploaded.length ? h('ul', null, uploaded.map(item => h('li', { key: item.id }, item.name + ' · ' + item.count + ' 个片段 · ' + new Date(item.importedAt).toLocaleDateString()))) : h('p', null, '尚未上传模组。'),
      h('h3', null, '全部模组（含内置资料）'),
      h('p', { className: 'module-note' }, '内置资料是可检索的文字条目，不保证包含每个模组的完整原书。'),
      h('div', { className: 'module-search' },
        h('select', { value: selected, onChange: e => setSelected(e.target.value), 'aria-label': '选择模组' }, h('option', { value: '' }, '所有模组'), library.map(item => h('option', { key: item.module, value: item.module }, item.module + '（' + item.entries + '）'))),
        h('input', { placeholder: '搜索地点、NPC、剧情关键词', value: query, onChange: e => setQuery(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && !busy) search(); }, 'aria-label': '模组关键词' }),
        h('button', { disabled: busy, onClick: search }, '检索')),
      h('div', { className: 'module-results' }, h('div', null, hits.map(hit => h('button', { key: hit.id, className: 'module-hit', onClick: () => read(hit.id) }, h('strong', null, hit.module + ' · ' + hit.title), h('span', null, hit.snippet)))), h('pre', null, body)));
  };
})();
