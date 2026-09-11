const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const startupTime = Date.now();
const smoke = process.argv.find(a => a.startsWith('--desktop-smoke='))?.slice(16);
const home = smoke ? path.resolve(smoke) : path.join(app.getPath('appData'), 'SoloTRPG');
app.setPath('userData', home);
let runtime, window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const { initializeData, initializeLibrary } = await import('./storage.mjs');
    const dataRoot = await initializeData(home, app.getVersion());
    const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server.mjs')).href);
    const shippedLibrary = app.isPackaged ? path.resolve(path.dirname(process.execPath), '..', 'library') : path.resolve(__dirname,'..');
    const libraryRoot=smoke?path.join(home,'library'):shippedLibrary;
    if(smoke)for(const folder of ['rules','data/rules-index'])await fs.cp(path.join(shippedLibrary,folder),path.join(libraryRoot,folder),{recursive:true});
    await initializeLibrary(libraryRoot,dataRoot);
    runtime = await startServer({ dataRoot, libraryRoot, port: 0, bind: '127.0.0.1' });
    window = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 600, title: 'SoloTRPG', icon: path.join(__dirname, '..', 'app', 'icon.ico'), show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.webContents.setWindowOpenHandler(({ url }) => {
      // Exported maps can be viewed in a separate, sandboxed application window.
      if (url.startsWith(runtime.url + '/files/data/images/')) return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } };
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== runtime.url) event.preventDefault(); });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '文件', submenu: [{ label: '打开存档文件夹', click: () => shell.openPath(dataRoot) }, { label: '打开模组和规则书文件夹', click: () => shell.openPath(libraryRoot) }, { type: 'separator' }, { label: '退出', role: 'quit' }] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '视图', submenu: [{ label: '刷新界面', role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
      { label: '帮助', submenu: [{ label: '下载新版', click: () => shell.openExternal('https://github.com/Not1u/DND-AI-DMTools/releases') }, { label: '关于 / 更新说明', click: () => dialog.showMessageBox(window, { title: 'SoloTRPG', message: 'SoloTRPG ' + app.getVersion(), detail: '关闭软件后用新版发布包覆盖程序文件，保留 library 中导入的模组。\n存档保存在：' + dataRoot + '\n更换程序不会覆盖存档；备份时请复制整个存档文件夹。' }) }] }
    ]));
    const errors = [];
    window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    await window.loadURL(runtime.url);
    for(let i=0;i<100;i++){if(await window.webContents.executeJavaScript("!!document.querySelector('.dndp-ws')"))break;await new Promise(r=>setTimeout(r,50))}
    const startupMs=Date.now()-startupTime;
    if (smoke) {
      await new Promise(r => setTimeout(r, 3500));
      if (process.argv.includes('--ui-smoke')) await require('./ui-smoke.cjs')(window, runtime, home);
      const pdfMapFile=process.argv.find(a=>a.startsWith('--pdf-map-smoke='))?.slice(16);
      if(pdfMapFile)await require('./pdf-map-smoke.cjs')(window,runtime,home,pdfMapFile);
      const moduleFile = process.argv.find(a => a.startsWith('--module-smoke='))?.slice(15);
      let moduleCheck;
      if (moduleFile) {
        const encoded = (await fs.readFile(moduleFile)).toString('base64');
        await window.webContents.executeJavaScript(`document.querySelectorAll('.solo-tab')[2].click()`);
        await new Promise(r => setTimeout(r, 300));
        await window.webContents.executeJavaScript(`(() => {
          const bytes = Uint8Array.from(atob(${JSON.stringify(encoded)}), c => c.charCodeAt(0));
          const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'Moonstone.pdf', {type:'application/pdf'}));
          const input = document.querySelector('input[type=file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
        })()`);
        for (let tries = 0; tries < 120; tries++) {
          await new Promise(r => setTimeout(r, 500));
          const message = await window.webContents.executeJavaScript(`document.querySelector('[role=status]').textContent`);
          if (/导入失败/.test(message)) throw new Error(message);
          if (/已导入|无需重复/.test(message)) { moduleCheck = { message }; break; }
        }
        if (!moduleCheck) throw new Error('PDF upload UI timed out');
        await window.webContents.executeJavaScript(`(() => {
          const input = document.querySelector('.module-search input');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Moonstone');
          input.dispatchEvent(new Event('input', {bubbles:true}));
        })()`);
        await new Promise(r => setTimeout(r, 200));
        await window.webContents.executeJavaScript(`document.querySelector('.module-search button').click()`);
        for (let tries = 0; tries < 20; tries++) {
          await new Promise(r => setTimeout(r, 250));
          if (await window.webContents.executeJavaScript(`!!document.querySelector('.module-hit')`)) break;
        }
        await window.webContents.executeJavaScript(`document.querySelector('.module-hit').click()`);
        await new Promise(r => setTimeout(r, 500));
        moduleCheck.read = await window.webContents.executeJavaScript(`document.querySelector('.module-results pre').textContent`);
        if (!moduleCheck.read.includes('secret passage') || !moduleCheck.read.includes('月石洞穴')) throw new Error('Module search/read UI failed');
        const result = await (await fetch(runtime.url + '/api', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({op:'mod.search',args:{query:'Moonstone'}}) })).json();
        if (!result.value?.items?.some(item => item.id.startsWith('upload:'))) throw new Error('Imported PDF missing from module search');
      }
      const state = await window.webContents.executeJavaScript(`({ text: document.body.innerText, node: typeof process, tabs: document.querySelectorAll('button').length })`);
      const health = await (await fetch(runtime.url + '/health')).json();
      await fs.writeFile(path.join(home, 'smoke.json'), JSON.stringify({ state, health, errors, moduleCheck, startupMs }, null, 2));
      await fs.writeFile(path.join(home, 'smoke.png'), (await window.webContents.capturePage()).toPNG());
      app.quit();
    } else window.show();
  }).catch(error => { if (smoke) console.error(error); else dialog.showErrorBox('SoloTRPG 启动失败', error.stack || String(error)); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { runtime?.server.close(); runtime?.server.closeAllConnections(); });
}
