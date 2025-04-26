// main.js - Minimal, robust Electron main process for HostsManager

const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require("electron");
const fs = require("fs");
const path = require("path");

const HOSTS_PATH = '/etc/hosts';

function createWindow() {
  // Safe mode support (optional, can be used by renderer)
  const isSafeMode = process.argv.includes('--safe-mode');

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      devTools: {
        isDevToolsExtension: false,
        htmlFullscreen: false,
      },
    },
  });

  // Pass the safe mode flag to the renderer
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('startup-mode', { safeMode: isSafeMode });
  });

  // Clean up global shortcuts when window is closed
  mainWindow.on('closed', () => {
    globalShortcut.unregisterAll();
  });

  console.log('ispackaged:'  + app.isPackaged);
  // Load the app (dev or prod)
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Hosts file IPC handlers
ipcMain.handle('load-hosts', async () => {
  try {
    const content = fs.readFileSync(HOSTS_PATH, 'utf8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-hosts', async (_event, newContent) => {
  try {
    const tmp = '/tmp/hosts_tmp_' + Date.now();
    fs.writeFileSync(tmp, newContent, 'utf8');
    const { execSync } = require('child_process');
    execSync(`osascript -e 'do shell script "cp ${tmp} ${HOSTS_PATH}" with administrator privileges'`);
    fs.unlinkSync(tmp);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
