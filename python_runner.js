const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let isRunning = false;
let currentProcess = null;

function runCode(code = null) {
    if (isRunning) {
        addOutput('A process is already running. Please wait or stop the current process.', 'warning');
        return;
    }

    const codeToRun = code || getEditorContent();
    
    if (!codeToRun.trim()) {
        addOutput('No code to run.', 'warning');
        return;
    }

    // Switch to output tab
    switchToTab('output');
    
    // Clear previous output
    addOutput('Running Python code...', 'info');
    addOutput('─'.repeat(50), 'info');
    
    // Update status
    updateStatus('Running...', true);
    
    // Create temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `python_ide_temp_${Date.now()}.py`);
    
    try {
        fs.writeFileSync(tempFile, codeToRun);
        
        // Determine Python command
        const pythonCmd = getPythonCommand();
        
        // Spawn Python process
        currentProcess = spawn(pythonCmd, [tempFile], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        });
        
        isRunning = true;
        
        // Handle stdout
        currentProcess.stdout.on('data', (data) => {
            addOutput(data.toString(), 'success');
        });
        
        // Handle stderr
        currentProcess.stderr.on('data', (data) => {
            addOutput(data.toString(), 'error');
        });
        
        // Handle process completion
        currentProcess.on('close', (code) => {
            isRunning = false;
            currentProcess = null;
            
            // Clean up temp file
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                console.log('Failed to clean up temp file:', e);
            }
            
            addOutput('─'.repeat(50), 'info');
            
            if (code === 0) {
                addOutput(`Process finished with exit code ${code}`, 'success');
                updateStatus('Execution completed successfully');
            } else {
                addOutput(`Process finished with exit code ${code}`, 'error');
                updateStatus('Execution failed');
            }
        });
        
        // Handle process errors
        currentProcess.on('error', (error) => {
            isRunning = false;
            currentProcess = null;
            
            // Clean up temp file
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                console.log('Failed to clean up temp file:', e);
            }
            
            addOutput(`Failed to start Python process: ${error.message}`, 'error');
            
            if (error.code === 'ENOENT') {
                addOutput('Python is not installed or not in PATH.', 'error');
                addOutput('Please install Python and make sure it\'s in your system PATH.', 'error');
            }
            
            updateStatus('Execution failed');
        });
        
        // Set timeout for long-running processes
        setTimeout(() => {
            if (isRunning && currentProcess) {
                addOutput('Process is taking too long. You can stop it manually if needed.', 'warning');
            }
        }, 30000); // 30 seconds
        
    } catch (error) {
        addOutput(`Failed to create temporary file: ${error.message}`, 'error');
        updateStatus('Execution failed');
        isRunning = false;
    }
}

function stopCode() {
    if (isRunning && currentProcess) {
        currentProcess.kill('SIGTERM');
        addOutput('Process stopped by user.', 'warning');
        updateStatus('Process stopped');
        isRunning = false;
        currentProcess = null;
    }
}

function getPythonCommand() {
    // Try different Python commands based on platform
    const commands = process.platform === 'win32' 
        ? ['python', 'python3', 'py'] 
        : ['python3', 'python'];
    
    // For now, return the first command
    // In a real implementation, you might want to test which one works
    return commands[0];
}

function runInteractiveCode(code) {
    if (isRunning) {
        addOutput('A process is already running. Please wait or stop the current process.', 'warning');
        return;
    }

    // Switch to output tab
    switchToTab('output');
    
    // Update status
    updateStatus('Starting interactive Python...', true);
    
    try {
        // Start Python in interactive mode
        const pythonCmd = getPythonCommand();
        currentProcess = spawn(pythonCmd, ['-i'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        });
        
        isRunning = true;
        
        // Send code to Python stdin
        currentProcess.stdin.write(code + '\n');
        
        // Handle stdout
        currentProcess.stdout.on('data', (data) => {
            addOutput(data.toString(), 'success');
        });
        
        // Handle stderr
        currentProcess.stderr.on('data', (data) => {
            addOutput(data.toString(), 'error');
        });
        
        // Handle process completion
        currentProcess.on('close', (code) => {
            isRunning = false;
            currentProcess = null;
            addOutput(`Interactive session ended with code ${code}`, 'info');
            updateStatus('Interactive session ended');
        });
        
        // Handle process errors
        currentProcess.on('error', (error) => {
            isRunning = false;
            currentProcess = null;
            addOutput(`Failed to start interactive Python: ${error.message}`, 'error');
            updateStatus('Failed to start interactive session');
        });
        
    } catch (error) {
        addOutput(`Failed to start interactive Python: ${error.message}`, 'error');
        updateStatus('Failed to start interactive session');
        isRunning = false;
    }
}

function sendInput(input) {
    if (isRunning && currentProcess) {
        currentProcess.stdin.write(input + '\n');
    }
}

function addOutput(text, type = 'info') {
    const outputElement = document.getElementById('panel-output');
    if (outputElement) {
        const lines = text.split('\n');
        lines.forEach(line => {
            if (line.trim() || lines.length === 1) {
                const div = document.createElement('div');
                div.className = `output-line ${type}`;
                div.textContent = line;
                outputElement.appendChild(div);
            }
        });
        
        // Auto-scroll to bottom
        outputElement.scrollTop = outputElement.scrollHeight;
    }
}

function clearOutput() {
    const outputElement = document.getElementById('panel-output');
    if (outputElement) {
        outputElement.innerHTML = '<div class="output-line info">Output cleared.</div>';
    }
}

function updateStatus(message, loading = false) {
    const statusElement = document.getElementById('status-text');
    if (statusElement) {
        statusElement.textContent = message;
    }
    
    // Add loading indicator
    const container = document.querySelector('.container');
    if (container) {
        if (loading) {
            container.classList.add('loading');
        } else {
            container.classList.remove('loading');
        }
    }
}

function switchToTab(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Hide all panels
    document.querySelectorAll('.panel-content').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Show selected tab and panel
    const selectedTab = document.getElementById(`tab-${tabName}`);
    const selectedPanel = document.getElementById(`panel-${tabName}`);
    
    if (selectedTab && selectedPanel) {
        selectedTab.classList.add('active');
        selectedPanel.classList.remove('hidden');
    }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runCode,
        stopCode,
        runInteractiveCode,
        sendInput,
        addOutput,
        clearOutput,
        updateStatus,
        switchToTab
    };
}