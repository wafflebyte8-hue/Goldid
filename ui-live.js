const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const waitMs = Number(process.argv[2]||6000), out = process.argv[3]||'ui-live.png', w = Number(process.argv[4]||920);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: w, height: 1000, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, 'public/index.html'));
  await sleep(700);
  await win.webContents.executeJavaScript(`document.getElementById('dtApp').scrollIntoView({block:'center'});`);
  await sleep(waitMs);
  fs.writeFileSync(path.join(__dirname, out), (await win.webContents.capturePage()).toPNG());
  console.log('captured', waitMs);
  app.quit();
});
