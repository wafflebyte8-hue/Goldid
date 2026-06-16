const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(__dirname, 'public/index.html'));
  await sleep(700);
  await win.webContents.executeJavaScript(`document.getElementById('dtApp').scrollIntoView({block:'center'});`);
  await sleep(13500);
  fs.writeFileSync(path.join(__dirname, 'ui-ctx.png'), (await win.webContents.capturePage()).toPNG());
  console.log('done'); app.quit();
});
