const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  onFileSaved: (callback) => {
        ipcRenderer.on('file-saved', callback);
    },
    
  // File operations
  saveFile: (path, content) => ipcRenderer.invoke('save-file', { path, content }),
  saveFileAs: (content) => ipcRenderer.invoke('save-file-as', content),
  readDirectory: (path) => ipcRenderer.invoke('read-directory', path),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('rename-file', { oldPath, newName }),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  
  
  // Python operations
  runPython: (code, path) => ipcRenderer.invoke('run-python', { code, path }),
  lintPython: (code, path) => ipcRenderer.invoke('lint-python', { code, path }),
  
  // Menu event listeners
  onNewFile: (callback) => ipcRenderer.on('menu-new-file', callback),
  onSaveFile: (callback) => ipcRenderer.on('menu-save-file', callback),
  onSaveAs: (callback) => ipcRenderer.on('menu-save-as', callback),
  onRunCode: (callback) => ipcRenderer.on('menu-run-code', callback),
  onLintCode: (callback) => ipcRenderer.on('menu-lint-code', callback),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});