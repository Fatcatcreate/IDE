const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let isLinting = false;

function lintCode(code = null) {
    if (isLinting) {
        addProblem('Linting is already in progress...', 'info');
        return;
    }

    const codeToLint = code || getEditorContent();
    
    if (!codeToLint.trim()) {
        addProblem('No code to lint.', 'warning');
        return;
    }

    // Switch to problems tab
    switchToTab('problems');
    
    // Clear previous problems
    clearProblems();
    addProblem('Linting Python code...', 'info');
    
    // Update status
    updateStatus('Linting code...', true);
    
    isLinting = true;
    
    // Try different linting approaches
    tryFlake8Linting(codeToLint)
        .then(success => {
            if (!success) {
                return tryPycodestyleLinting(codeToLint);
            }
            return true;
        })
        .then(success => {
            if (!success) {
                return tryBuiltinLinting(codeToLint);
            }
            return true;
        })
        .finally(() => {
            isLinting = false;
            updateStatus('Linting completed');
        });
}

function tryFlake8Linting(code) {
    return new Promise((resolve) => {
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `python_ide_lint_${Date.now()}.py`);
        
        try {
            fs.writeFileSync(tempFile, code);
            
            const flake8Process = spawn('flake8', [
                tempFile,
                '--format=%(path)s:%(row)d:%(col)d: %(code)s %(text)s',
                '--max-line-length=88',
                '--extend-ignore=E203,W503'
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: process.platform === 'win32'
            });
            
            let output = '';
            let errorOutput = '';
            
            flake8Process.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            flake8Process.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            flake8Process.on('close', (code) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.log('Failed to clean up temp file:', e);
                }
                
                if (code === 0) {
                    // No issues found
                    addProblem('No issues found with Flake8.', 'success');
                    resolve(true);
                } else if (output.trim()) {
                    // Parse flake8 output
                    parseFlake8Output(output);
                    resolve(true);
                } else {
                    // Flake8 failed
                    resolve(false);
                }
            });
            
            flake8Process.on('error', (error) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.log('Failed to clean up temp file:', e);
                }
                resolve(false);
            });
            
        } catch (error) {
            resolve(false);
        }
    });
}

function tryPycodestyleLinting(code) {
    return new Promise((resolve) => {
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `python_ide_lint_${Date.now()}.py`);
        
        try {
            fs.writeFileSync(tempFile, code);
            
            const pycodestyleProcess = spawn('pycodestyle', [
                tempFile,
                '--max-line-length=88'
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: process.platform === 'win32'
            });
            
            let output = '';
            
            pycodestyleProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            pycodestyleProcess.on('close', (code) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.log('Failed to clean up temp file:', e);
                }
                
                if (code === 0) {
                    addProblem('No issues found with pycodestyle.', 'success');
                    resolve(true);
                } else if (output.trim()) {
                    parsePycodestyleOutput(output);
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
            
            pycodestyleProcess.on('error', (error) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.log('Failed to clean up temp file:', e);
                }
                resolve(false);
            });
            
        } catch (error) {
            resolve(false);
        }
    });
}

function tryBuiltinLinting(code) {
    return new Promise((resolve) => {
        // Basic Python syntax check
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `python_ide_syntax_${Date.now()}.py`);
        
        try {
            fs.writeFileSync(tempFile, code);
            
            const pythonCmd = getPythonCommand();
            const syntaxProcess = spawn(pythonCmd, ['-m', 'py_compile', tempFile], {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: process.platform === 'win32'
            });
            
            let errorOutput = '';
            
            syntaxProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            syntaxProcess.on('close', (code) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.log('Failed to clean up temp file:', e);
                }
                
                if (code === 0) {
                    addProblem('No syntax errors found.', 'success');
                    performBasicLinting(code);
                } else {
                    parseSyntaxError(errorOutput);
                }
                resolve(true);
            });
            
            syntaxProcess.on('error', (error) => {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch (e) {
                    console.log('Failed to clean up temp file:', e);
                }
                
                addProblem('Failed to check syntax: Python not available', 'error');
                performBasicLinting(code);
                resolve(true);
            });
            
        } catch (error) {
            addProblem('Failed to perform syntax check', 'error');
            performBasicLinting(code);
            resolve(true);
        }
    });
}

function parseFlake8Output(output) {
    const lines = output.trim().split('\n');
    let problemCount = 0;
    
    lines.forEach(line => {
        if (line.trim()) {
            const match = line.match(/^.*?:(\d+):(\d+):\s*([A-Z]\d+)\s*(.*)$/);
            if (match) {
                const [, lineNum, colNum, code, message] = match;
                const severity = code.startsWith('E') ? 'error' : 'warning';
                addProblem(message, severity, parseInt(lineNum), parseInt(colNum), code);
                problemCount++;
            }
        }
    });
    
    if (problemCount === 0) {
        addProblem('No issues found.', 'success');
    } else {
        addProblem(`Found ${problemCount} issue(s).`, 'info');
    }
}

function parsePycodestyleOutput(output) {
    const lines = output.trim().split('\n');
    let problemCount = 0;
    
    lines.forEach(line => {
        if (line.trim()) {
            const match = line.match(/^.*?:(\d+):(\d+):\s*([A-Z]\d+)\s*(.*)$/);
            if (match) {
                const [, lineNum, colNum, code, message] = match;
                addProblem(message, 'warning', parseInt(lineNum), parseInt(colNum), code);
                problemCount++;
            }
        }
    });
    
    if (problemCount === 0) {
        addProblem('No issues found.', 'success');
    } else {
        addProblem(`Found ${problemCount} issue(s).`, 'info');
    }
}

function parseSyntaxError(errorOutput) {
    const lines = errorOutput.trim().split('\n');
    lines.forEach(line => {
        if (line.includes('SyntaxError') || line.includes('IndentationError')) {
            const match = line.match(/line (\d+)/);
            if (match) {
                const lineNum = parseInt(match[1]);
                addProblem(line, 'error', lineNum, 1, 'E999');
            } else {
                addProblem(line, 'error');
            }
        }
    });
}

function performBasicLinting(code) {
    const lines = code.split('\n');
    let issueCount = 0;
    
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        
        // Check for common issues
        if (line.length > 88) {
            addProblem('Line too long (>88 characters)', 'warning', lineNum, 89, 'E501');
            issueCount++;
        }
        
        if (line.includes('\t')) {
            addProblem('Use of tabs instead of spaces', 'error', lineNum, line.indexOf('\t') + 1, 'W191');
            issueCount++;
        }
        
        if (line.endsWith(' ')) {
            addProblem('Trailing whitespace', 'warning', lineNum, line.length, 'W291');
            issueCount++;
        }
        
        // Check for multiple statements on one line
        if (line.includes(';') && !line.trim().startsWith('#')) {
            addProblem('Multiple statements on one line', 'warning', lineNum, line.indexOf(';') + 1, 'E702');
            issueCount++;
        }
    });
    
    if (issueCount === 0) {
        addProblem('Basic linting complete. No major issues found.', 'success');
    } else {
        addProblem(`Basic linting found ${issueCount} issue(s).`, 'info');
    }
}

function addProblem(message, severity = 'info', line = null, column = null, code = null) {
    const problemsElement = document.getElementById('panel-problems');
    if (problemsElement) {
        const div = document.createElement('div');
        div.className = `lint-item ${severity}`;
        
        if (line) {
            div.addEventListener('click', () => {
                goToLine(line);
                if (severity === 'error' || severity === 'warning') {
                    highlightLine(line, severity);
                }
            });
            div.style.cursor = 'pointer';
        }
        
        div.innerHTML = `
            <div class="lint-severity">${severity.toUpperCase()}${code ? ` (${code})` : ''}</div>
            <div class="lint-message">${message}</div>
            ${line ? `<div class="lint-location">Line ${line}${column ? `, Column ${column}` : ''}</div>` : ''}
        `;
        
        problemsElement.appendChild(div);
        
        // Auto-scroll to bottom
        problemsElement.scrollTop = problemsElement.scrollHeight;
    }
}

function clearProblems() {
    const problemsElement = document.getElementById('panel-problems');
    if (problemsElement) {
        problemsElement.innerHTML = '';
    }
}

function getPythonCommand() {
    const commands = process.platform === 'win32' 
        ? ['python', 'python3', 'py'] 
        : ['python3', 'python'];
    
    return commands[0];
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        lintCode,
        addProblem,
        clearProblems
    };
}