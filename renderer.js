let currentProject = null;
let fileExplorerData = [];
// Add these variables at the top of renderer.js
let contextMenu = null;
let contextMenuTarget = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    setupMenuEventListeners();
    setupTabSwitching();
    initializeTheme();
    console.log('Python IDE initialized');
});

function setupEventListeners() {
    // Toolbar buttons
    document.getElementById('new-file').addEventListener('click', newFile);
    document.getElementById('save-file').addEventListener('click', saveFile);
    document.getElementById('run-code').addEventListener('click', () => runCode());
    document.getElementById('lint-code').addEventListener('click', () => lintCode());
    document.getElementById('clear-output').addEventListener('click', clearOutput);
    document.getElementById('open-folder').addEventListener('click', openFolder);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Window events
    window.addEventListener('beforeunload', handleBeforeUnload);
}

function setupMenuEventListeners() {
    // Menu event listeners from main process (only if electronAPI exists)
    if (window.electronAPI) {
        window.electronAPI.onNewFile(() => newFile());
        window.electronAPI.onSaveFile(() => saveFile());
        window.electronAPI.onSaveAs(() => saveAs());
        window.electronAPI.onRunCode(() => runCode());
        window.electronAPI.onLintCode(() => lintCode());
        window.electronAPI.onFileOpened((event, data) => {
            openFileFromPath(data.path, data.content);
        });
        
        // ADD THIS NEW LISTENER FOR FILE SAVED EVENT
        window.electronAPI.onFileSaved((event, data) => {
            handleFileSaved(data.filePath, data.dirPath);
        });
    }
}

// ADD THIS NEW FUNCTION to handle file saved event
async function handleFileSaved(filePath, dirPath) {
    // Only refresh if the saved file is in the current project directory
    if (currentProject && dirPath.startsWith(currentProject)) {
        // Refresh the file explorer to show the new/updated file
        await refreshFileExplorer();
        updateStatus(`File saved: ${require('path').basename(filePath)}`);
    }
}

// ADD THIS NEW FUNCTION to refresh the file explorer
async function refreshFileExplorer() {
    if (currentProject) {
        await loadFileExplorer(currentProject);
    }
}

function setupTabSwitching() {
    document.getElementById('tab-output').addEventListener('click', () => switchToTab('output'));
    document.getElementById('tab-problems').addEventListener('click', () => switchToTab('problems'));
}

function handleKeyboardShortcuts(event) {
    // Handle keyboard shortcuts that aren't handled by Monaco
    if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
            case 'n':
                event.preventDefault();
                newFile();
                break;
            case 'o':
                event.preventDefault();
                // File opening is handled by main process
                break;
        }
    }
    
    if (event.key === 'F5') {
        event.preventDefault();
        runCode();
    }
}

function handleBeforeUnload(event) {
    if (isModified()) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return event.returnValue;
    }
}

// File operations
function newFile() {
    if (isModified()) {
        const save = confirm('You have unsaved changes. Do you want to save first?');
        if (save) {
            saveFile();
        }
    }
    
    setEditorContent(`# New Python file
# Write your code here

def main():
    print("Hello, World!")

if __name__ == "__main__":
    main()
`);
    
    setCurrentFilePath(null);
    updateStatus('New file created');
    focusEditor();
}

async function saveFile() {
    const currentPath = getCurrentFilePath();
    const content = getEditorContent();
    
    if (!window.electronAPI) {
        // Fallback for non-electron environment
        updateStatus('Save functionality requires Electron environment');
        return;
    }
    
    if (currentPath) {
        // Save to existing file
        const result = await window.electronAPI.saveFile(currentPath, content);
        if (result.success) {
            markAsSaved();
            updateStatus('File saved successfully');
            // File explorer will be refreshed via the 'file-saved' event from main process
        } else {
            updateStatus('Failed to save file: ' + result.error);
        }
    } else {
        // Save as new file
        saveAs();
    }
}

async function saveAs() {
    const content = getEditorContent();
    
    if (!window.electronAPI) {
        // Fallback for non-electron environment
        updateStatus('Save functionality requires Electron environment');
        return;
    }
    
    const result = await window.electronAPI.saveFileAs(content);
    
    if (result.success && !result.canceled) {
        setCurrentFilePath(result.path);
        markAsSaved();
        updateStatus('File saved successfully');
        // File explorer will be refreshed via the 'file-saved' event from main process
    } else if (result.error) {
        updateStatus('Failed to save file: ' + result.error);
    }
}
async function openFolder() {
    if (!window.electronAPI) {
        // Fallback for non-electron environment
        updateStatus('File system access requires Electron environment');
        return;
    }
    
    const result = await window.electronAPI.selectFolder();
    if (result.success) {
        currentProject = result.path;
        await loadFileExplorer(result.path);
        updateStatus(`Opened folder: ${result.path}`);
    }
}

async function loadFileExplorer(folderPath) {
    const explorerElement = document.getElementById('file-explorer');
    explorerElement.innerHTML = '<div class="file-item"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    
    try {
        const items = await window.electronAPI.readDirectory(folderPath);
        fileExplorerData = items;
        renderFileExplorer(items);
    } catch (error) {
        explorerElement.innerHTML = '<div class="file-item"><i class="fas fa-exclamation-triangle"></i> Failed to load folder</div>';
    }
}

function renderFileExplorer(items) {
    const explorerElement = document.getElementById('file-explorer');
    explorerElement.innerHTML = '';
    
    if (items.length === 0) {
        explorerElement.innerHTML = '<div class="file-item"><i class="fas fa-folder-open"></i> Empty folder</div>';
        return;
    }
    
    // Sort items: directories first, then files
    const sortedItems = items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
    
    sortedItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'file-item';
        
        if (item.isDirectory) {
            div.classList.add('folder');
            div.innerHTML = `<i class="fas fa-folder"></i> ${item.name}`;
            div.addEventListener('click', () => loadFileExplorer(item.path));
        } else {
            const isPython = item.name.endsWith('.py');
            if (isPython) {
                div.classList.add('python');
            }
            
            const icon = isPython ? 'fab fa-python' : 'fas fa-file';
            div.innerHTML = `<i class="${icon}"></i> ${item.name}`;
            div.addEventListener('click', () => openFileFromExplorer(item.path));
        }
        
        explorerElement.appendChild(div);
    });
}

async function openFileFromExplorer(filePath) {
    try {
        const result = await window.electronAPI.readFile(filePath);
        if (result.success) {
            openFileFromPath(filePath, result.content);
        } else {
            updateStatus('Failed to open file: ' + result.error);
        }
    } catch (error) {
        updateStatus('Failed to open file: ' + error.message);
    }
}

function openFileFromPath(filePath, content) {
    if (isModified()) {
        const save = confirm('You have unsaved changes. Do you want to save first?');
        if (save) {
            saveFile();
        }
    }
    
    setEditorContent(content);
    setCurrentFilePath(filePath);
    markAsSaved();
    updateStatus(`Opened: ${filePath}`);
    focusEditor();
}

// Code execution and linting
async function runCode(code = null) {
    const codeToRun = code || getEditorContent();
    const currentPath = getCurrentFilePath();
    
    if (!codeToRun.trim()) {
        updateStatus('No code to run');
        return;
    }
    
    if (!window.electronAPI) {
        // Fallback for non-electron environment
        appendToOutput('Python execution requires Electron environment\n', 'error');
        updateStatus('Python execution requires Electron environment');
        return;
    }
    
    // Clear previous output
    clearOutput();
    switchToTab('output');
    
    // Show running status
    updateStatus('Running Python code...');
    appendToOutput('Running Python code...\n', 'info');
    
    try {
        const result = await window.electronAPI.runPython(codeToRun, currentPath);
        
        if (result.stdout) {
            appendToOutput(result.stdout, 'success');
        }
        
        if (result.stderr) {
            appendToOutput(result.stderr, 'error');
        }
        
        if (result.error) {
            appendToOutput(`Error: ${result.error}\n`, 'error');
            updateStatus('Code execution failed');
        } else {
            updateStatus('Code executed successfully');
        }
        
        // Show exit code
        appendToOutput(`\nProcess exited with code: ${result.exitCode}\n`, 'info');
        
    } catch (error) {
        appendToOutput(`Execution error: ${error.message}\n`, 'error');
        updateStatus('Code execution failed');
    }
}

async function lintCode() {
    const code = getEditorContent();
    const currentPath = getCurrentFilePath();
    
    if (!code.trim()) {
        updateStatus('No code to lint');
        return;
    }
    
    if (!window.electronAPI) {
        // Fallback for non-electron environment
        appendToProblems('Linting requires Electron environment\n', 'error');
        updateStatus('Linting requires Electron environment');
        return;
    }
    
    // Clear previous problems
    clearProblems();
    switchToTab('problems');
    
    // Show linting status
    updateStatus('Linting Python code...');
    appendToProblems('Linting Python code...\n', 'info');
    
    try {
        const result = await window.electronAPI.lintPython(code, currentPath);
        
        if (result.success) {
            if (result.issues && result.issues.length > 0) {
                result.issues.forEach(issue => {
                    appendToProblems(`${issue.type}: Line ${issue.line}, Column ${issue.column}: ${issue.message}\n`, issue.severity);
                });
                updateStatus(`Found ${result.issues.length} linting issues`);
            } else {
                appendToProblems('No linting issues found.\n', 'success');
                updateStatus('No linting issues found');
            }
        } else {
            appendToProblems(`Linting error: ${result.error}\n`, 'error');
            updateStatus('Linting failed');
        }
        
    } catch (error) {
        appendToProblems(`Linting error: ${error.message}\n`, 'error');
        updateStatus('Linting failed');
    }
}

// Output and problems management
function clearOutput() {
    const outputElement = document.getElementById('panel-output');
    if (outputElement) {
        outputElement.innerHTML = '<div class="output-line info">Output cleared.</div>';
    }
}

function clearProblems() {
    const problemsElement = document.getElementById('panel-problems');
    if (problemsElement) {
        problemsElement.innerHTML = '<div class="output-line info">No problems detected.</div>';
    }
}

function appendToOutput(text, type = 'info') {
    const outputElement = document.getElementById('panel-output');
    if (outputElement) {
        const line = document.createElement('div');
        line.className = `output-line ${type}`;
        line.textContent = text;
        outputElement.appendChild(line);
        outputElement.scrollTop = outputElement.scrollHeight;
    }
}

function appendToProblems(text, type = 'info') {
    const problemsElement = document.getElementById('panel-problems');
    if (problemsElement) {
        const line = document.createElement('div');
        line.className = `output-line ${type}`;
        line.textContent = text;
        problemsElement.appendChild(line);
        problemsElement.scrollTop = problemsElement.scrollHeight;
    }
}

function switchToTab(tabName) {
    // Hide all panels
    document.getElementById('panel-output').classList.add('hidden');
    document.getElementById('panel-problems').classList.add('hidden');
    
    // Remove active class from all tabs
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected panel and activate tab
    document.getElementById(`panel-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// Editor interface functions
function getEditorContent() {
    return window.editorAPI ? window.editorAPI.getContent() : '';
}

function setEditorContent(content) {
    if (window.editorAPI) {
        window.editorAPI.setContent(content);
    }
}

function getCurrentFilePath() {
    return window.editorAPI ? window.editorAPI.getCurrentPath() : null;
}

function setCurrentFilePath(path) {
    if (window.editorAPI) {
        window.editorAPI.setCurrentPath(path);
    }
}

function isModified() {
    return window.editorAPI ? window.editorAPI.isModified() : false;
}

function markAsSaved() {
    if (window.editorAPI) {
        window.editorAPI.markAsSaved();
    }
}

function focusEditor() {
    if (window.editorAPI) {
        window.editorAPI.focus();
    }
}

// Status bar updates
function updateStatus(message) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) {
        statusElement.textContent = message;
        
        // Auto-clear status after 5 seconds
        setTimeout(() => {
            if (statusElement.textContent === message) {
                statusElement.textContent = 'Ready';
            }
        }, 5000);
    }
}

// Terminal functionality
function showTerminal() {
    const terminalPanel = document.getElementById('terminal-panel');
    if (terminalPanel) {
        terminalPanel.style.display = 'block';
    }
}

function hideTerminal() {
    const terminalPanel = document.getElementById('terminal-panel');
    if (terminalPanel) {
        terminalPanel.style.display = 'none';
    }
}

function toggleTerminal() {
    const terminalPanel = document.getElementById('terminal-panel');
    if (terminalPanel) {
        terminalPanel.style.display = terminalPanel.style.display === 'none' ? 'block' : 'none';
    }
}

// Search functionality
function searchInFiles(query) {
    if (!currentProject || !query.trim()) {
        return;
    }
    
    // This would implement file search functionality
    // For now, just update status
    updateStatus(`Searching for: ${query}`);
}

// Theme management
function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    body.setAttribute('data-theme', newTheme);
    
    // Update Monaco editor theme if available
    if (window.editorAPI && window.editorAPI.setTheme) {
        window.editorAPI.setTheme(newTheme);
    }
    
    // Save theme preference (removed localStorage usage)
    updateStatus(`Switched to ${newTheme} theme`);
}

// Initialize theme on startup
function initializeTheme() {
    const defaultTheme = 'dark';
    document.body.setAttribute('data-theme', defaultTheme);
    
    // Set editor theme after it's initialized
    setTimeout(() => {
        if (window.editorAPI && window.editorAPI.setTheme) {
            window.editorAPI.setTheme(defaultTheme);
        }
    }, 1000);
}

// Export functions for use in other modules
window.rendererAPI = {
    newFile,
    saveFile,
    saveAs,
    runCode,
    lintCode,
    clearOutput,
    clearProblems,
    switchToTab,
    toggleTerminal,
    toggleTheme,
    updateStatus,
    openFolder,
    searchInFiles
};