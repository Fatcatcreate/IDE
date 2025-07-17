const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const pty = require('node-pty');
const os = require('os');

let mainWindow;
global.terminals = {};


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // Add your icon
    show: false
  });

  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-file');
          }
        },
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Python Files', extensions: ['py'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled) {
              const filePath = result.filePaths[0];
              const content = await fs.readFile(filePath, 'utf-8');
              mainWindow.webContents.send('file-opened', { path: filePath, content });
            }
          }
        },
        {
          label: 'Save File',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-save-file');
          }
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            mainWindow.webContents.send('menu-save-as');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Run Python Code',
          accelerator: 'CmdOrCtrl+Enter',
          click: () => {
            mainWindow.webContents.send('menu-run-code');
          }
        },
        {
          label: 'Lint Code',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            mainWindow.webContents.send('menu-lint-code');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers for file operations
ipcMain.handle('save-file', async (event, { path, content }) => {
  try {
    await fs.writeFile(path, content, 'utf-8');
    
    // Notify renderer that file was saved - send the directory path
    const dirPath = require('path').dirname(path);
    mainWindow.webContents.send('file-saved', { filePath: path, dirPath });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-file-as', async (event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      //{ name: 'Python Files', extensions: ['py'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled) {
    try {
      await fs.writeFile(result.filePath, content, 'utf-8');
      
      // Notify renderer that file was saved - send the directory path
      const dirPath = require('path').dirname(result.filePath);
      mainWindow.webContents.send('file-saved', { filePath: result.filePath, dirPath });
      
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    return items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      path: path.join(dirPath, item.name)
    }));
  } catch (error) {
    return [];
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

ipcMain.handle('rename-file', async (event, { oldPath, newName }) => {
  const newPath = path.join(path.dirname(oldPath), newName);
  try {
    await fs.rename(oldPath, newPath);
    return { success: true, newPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    await fs.remove(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});''

// IPC handler for Python execution
ipcMain.handle('run-python', async (event, { code, path: filePath }) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    
    // Create a temporary file if no file path is provided
    let tempFile = null;
    let actualFilePath = filePath;
    
    if (!filePath) {
      tempFile = path.join(__dirname, 'temp_script.py');
      actualFilePath = tempFile;
    }
    
    // Write code to file
    fs.writeFile(actualFilePath, code, 'utf-8', (writeErr) => {
      if (writeErr) {
        resolve({ success: false, error: writeErr.message, exitCode: 1 });
        return;
      }
      
      // Execute Python script
      const pythonProcess = spawn('python3', [actualFilePath], {
        cwd: filePath ? path.dirname(filePath) : __dirname
      });
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pythonProcess.on('close', (code) => {
        // Clean up temp file
        if (tempFile) {
          fs.unlink(tempFile, () => {}); // Ignore errors
        }
        
        resolve({
          success: true,
          stdout: stdout,
          stderr: stderr,
          exitCode: code
        });
      });
      
      pythonProcess.on('error', (error) => {
        // Clean up temp file
        if (tempFile) {
          fs.unlink(tempFile, () => {}); // Ignore errors
        }
        
        resolve({
          success: false,
          error: error.message,
          exitCode: 1
        });
      });
    });
  });
});

// IPC handler for Python linting
ipcMain.handle('lint-python', async (event, { code, path: filePath }) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    
    // Create a temporary file if no file path is provided
    let tempFile = null;
    let actualFilePath = filePath;
    
    if (!filePath) {
      tempFile = path.join(__dirname, 'temp_lint.py');
      actualFilePath = tempFile;
    }
    
    // Write code to file
    fs.writeFile(actualFilePath, code, 'utf-8', (writeErr) => {
      if (writeErr) {
        resolve({ success: false, error: writeErr.message });
        return;
      }
      
      // Try to use pylint first, fallback to pyflakes
      const lintProcess = spawn('python3', ['-m', 'pylint', '--output-format=json', actualFilePath], {
        cwd: filePath ? path.dirname(filePath) : __dirname
      });
      
      lintProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      lintProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      lintProcess.on('close', (code) => {
        // Clean up temp file
        if (tempFile) {
          fs.unlink(tempFile, () => {}); // Ignore errors
        }
        
        try {
          const issues = [];
          if (stdout.trim()) {
            const lintResults = JSON.parse(stdout);
            lintResults.forEach(issue => {
              issues.push({
                type: issue.type,
                line: issue.line,
                column: issue.column,
                message: issue.message,
                severity: issue.type === 'error' ? 'error' : 'warning'
              });
            });
          }
          
          resolve({
            success: true,
            issues: issues
          });
        } catch (parseError) {
          // If pylint fails, try basic syntax check
          const syntaxProcess = spawn('python3', ['-m', 'py_compile', actualFilePath]);
          
          syntaxProcess.on('close', (syntaxCode) => {
            if (syntaxCode === 0) {
              resolve({
                success: true,
                issues: []
              });
            } else {
              resolve({
                success: true,
                issues: [{
                  type: 'syntax',
                  line: 1,
                  column: 1,
                  message: 'Syntax error detected',
                  severity: 'error'
                }]
              });
            }
          });
        }
      });
      
      lintProcess.on('error', (error) => {
        // Clean up temp file
        if (tempFile) {
          fs.unlink(tempFile, () => {}); // Ignore errors
        }
        
        // Fallback to basic syntax check
        const syntaxProcess = spawn('python3', ['-c', `compile(open('${actualFilePath}').read(), '${actualFilePath}', 'exec')`]);
        
        syntaxProcess.on('close', (syntaxCode) => {
          resolve({
            success: true,
            issues: syntaxCode === 0 ? [] : [{
              type: 'syntax',
              line: 1,
              column: 1,
              message: 'Syntax error detected',
              severity: 'error'
            }]
          });
        });
      });
    });
  });
});



// Terminal IPC handlers
ipcMain.handle('spawn-terminal', (event, { cwd }) => {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const args = os.platform() === 'win32' ? [] : ['--login'];
    const terminal = pty.spawn(shell, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd || process.cwd(),
        env: {
            ...process.env,
            PS1: '\\u@\\h:\\w$ '
        }
    });
    
    const terminalId = terminal.pid.toString();
    global.terminals[terminalId] = terminal;
    
    terminal.on('data', (data) => {
        mainWindow.webContents.send('terminal-output', { id: terminalId, data });
    });
    
    terminal.on('exit', (code, signal) => {
        mainWindow.webContents.send('terminal-closed', { id: terminalId, code, signal });
        delete global.terminals[terminalId];
    });
    
    return { success: true, terminalId };
});

ipcMain.handle('terminal-input', (event, { terminalId, input }) => {
    const terminal = global.terminals[terminalId];
    if (terminal) {
        terminal.write(input);
        return { success: true };
    }
    return { success: false, error: 'Terminal not found' };
});

ipcMain.handle('kill-terminal', (event, terminalId) => {
    const terminal = global.terminals[terminalId];
    if (terminal) {
        terminal.kill();
        delete global.terminals[terminalId];
        return { success: true };
    }
    return { success: false, error: 'Terminal not found' };
});

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});