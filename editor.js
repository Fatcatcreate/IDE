// Monaco Editor Setup
let editor;
let currentFilePath = null;
let isContentModified = false;

// Initialize Monaco Editor
function initializeEditor() {
    // Load Monaco Editor from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.js';
    script.onload = () => {
        setupMonaco();
    };
    document.head.appendChild(script);
}

function setupMonaco() {
    require.config({ 
        paths: { 
            vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' 
        } 
    });
    
    require(['vs/editor/editor.main'], function() {
        // Create the editor
        editor = monaco.editor.create(document.getElementById('editor'), {
            value: `# Welcome to Python IDE
# Write your Python code here
# Press New terminal in the Terminal tab to start terminal
# You can resize the panel sizes by dragging the borders

def main():
    print("Hello, World!")
    
    # Example: Variables and data types
    name = "Python"
    version = 3.11
    is_awesome = True
    
    print(f"Language: {name}")
    print(f"Version: {version}")
    print(f"Is awesome? {is_awesome}")
    
    # Example: Lists and loops
    fruits = ["apple", "banana", "orange"]
    for fruit in fruits:
        print(f"I like {fruit}")

if __name__ == "__main__":
    main()
`,
            language: 'python',
            theme: 'vs-dark',
            fontSize: 14,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderWhitespace: 'boundary',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            mouseWheelZoom: true
        });
        
        // Setup editor event listeners
        setupEditorEventListeners();
        
        // Setup keyboard shortcuts
        setupKeyboardShortcuts();
        
        // Expose editor API to global scope
        exposeEditorAPI();
        
        console.log('Monaco Editor initialized successfully');
    });
}

function setupEditorEventListeners() {
    // Track content changes
    editor.onDidChangeModelContent(() => {
        isContentModified = true;
        updateTitle();
    });
    
    // Handle cursor position changes
    editor.onDidChangeCursorPosition((e) => {
        updateCursorPosition(e.position);
    });
    
    // Handle selection changes
    editor.onDidChangeCursorSelection((e) => {
        updateSelectionInfo(e.selection);
    });
}

function setupKeyboardShortcuts() {
    // Add custom keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (window.rendererAPI) {
            window.rendererAPI.saveFile();
        }
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, () => {
        if (window.rendererAPI) {
            window.rendererAPI.newFile();
        }
    });
    
    editor.addCommand(monaco.KeyCode.F5, () => {
        if (window.rendererAPI) {
            window.rendererAPI.runCode();
        }
    });
    
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL, () => {
        if (window.rendererAPI) {
            window.rendererAPI.lintCode();
        }
    });
}

function exposeEditorAPI() {
    // Expose editor functions to global scope
    window.editorAPI = {
        getContent: () => editor.getValue(),
        setContent: (content) => {
            editor.setValue(content);
            isContentModified = false;
            updateTitle();
        },
        getCurrentPath: () => currentFilePath,
        setCurrentPath: (path) => {
            currentFilePath = path;
            updateTitle();
        },
        isModified: () => isContentModified,
        markAsSaved: () => {
            isContentModified = false;
            updateTitle();
        },
        focus: () => editor.focus(),
        setTheme: (theme) => {
            const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';
            monaco.editor.setTheme(monacoTheme);
        },
        insertText: (text) => {
            const position = editor.getPosition();
            editor.executeEdits('', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: text
            }]);
        },
        getSelectedText: () => {
            const selection = editor.getSelection();
            return editor.getModel().getValueInRange(selection);
        },
        replaceSelection: (text) => {
            const selection = editor.getSelection();
            editor.executeEdits('', [{
                range: selection,
                text: text
            }]);
        },
        gotoLine: (lineNumber) => {
            editor.setPosition({ lineNumber: lineNumber, column: 1 });
            editor.revealLine(lineNumber);
        },
        find: (text) => {
            editor.getAction('actions.find').run();
        },
        replace: () => {
            editor.getAction('editor.action.startFindReplaceAction').run();
        },
        formatDocument: () => {
            editor.getAction('editor.action.formatDocument').run();
        },
        toggleComment: () => {
            editor.getAction('editor.action.commentLine').run();
        },
        undo: () => {
            editor.getAction('undo').run();
        },
        redo: () => {
            editor.getAction('redo').run();
        },
        selectAll: () => {
            editor.getAction('editor.action.selectAll').run();
        }
    };
}

function updateTitle() {
    const filename = currentFilePath ? 
        currentFilePath.split('/').pop().split('\\').pop() : 
        'Untitled';
    const modified = isContentModified ? ' •' : '';
    document.title = `${filename}${modified} - Python IDE`;
    
    // Update status bar if it exists
    updateFileStatus();
}

function updateCursorPosition(position) {
    const statusLine = document.getElementById('status-line');
    const statusColumn = document.getElementById('status-column');
    
    if (statusLine && statusColumn) {
        statusLine.textContent = position.lineNumber;
        statusColumn.textContent = position.column;
    }
}

function updateSelectionInfo(selection) {
    const statusSelection = document.getElementById('status-selection');
    
    if (statusSelection) {
        if (selection.isEmpty()) {
            statusSelection.textContent = '';
        } else {
            const selectedText = editor.getModel().getValueInRange(selection);
            const lines = selectedText.split('\n').length;
            const chars = selectedText.length;
            statusSelection.textContent = `(${lines} lines, ${chars} chars selected)`;
        }
    }
}

function updateFileStatus() {
    const statusFile = document.getElementById('status-file');
    if (statusFile) {
        const filename = currentFilePath ? 
            currentFilePath.split('/').pop().split('\\').pop() : 
            'Untitled';
        const modified = isContentModified ? ' •' : '';
        statusFile.textContent = `${filename}${modified}`;
    }
}

// Auto-save functionality
function startAutoSave() {
    setInterval(() => {
        if (isContentModified && currentFilePath && window.electronAPI) {
            window.electronAPI.saveFile(currentFilePath, editor.getValue())
                .then(result => {
                    if (result.success) {
                        isContentModified = false;
                        updateTitle();
                        console.log('Auto-saved');
                    }
                })
                .catch(error => {
                    console.error('Auto-save failed:', error);
                });
        }
    }, 30000); // Auto-save every 30 seconds
}

// Language features
function setupLanguageFeatures() {
    // Add Python snippets
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: (model, position) => {
            const suggestions = [
                {
                    label: 'def',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'def ${1:function_name}(${2:parameters}):\n    ${3:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Function definition'
                },
                {
                    label: 'class',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'class ${1:ClassName}:\n    def __init__(self${2:, parameters}):\n        ${3:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Class definition'
                },
                {
                    label: 'if',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'if ${1:condition}:\n    ${2:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'If statement'
                },
                {
                    label: 'for',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'for ${1:item} in ${2:iterable}:\n    ${3:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'For loop'
                },
                {
                    label: 'while',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'while ${1:condition}:\n    ${2:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'While loop'
                },
                {
                    label: 'try',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:e}:\n    ${4:pass}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Try-except block'
                },
                {
                    label: 'main',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: 'if __name__ == "__main__":\n    ${1:main()}',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    documentation: 'Main guard'
                }
            ];
            
            return { suggestions: suggestions };
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
    
    // Start auto-save after a delay
    setTimeout(() => {
        startAutoSave();
        setupLanguageFeatures();
    }, 2000);
});

// Handle window resize
window.addEventListener('resize', () => {
    if (editor) {
        editor.layout();
    }
});

// Export for global access
window.editorModule = {
    initializeEditor,
    setupLanguageFeatures,
    startAutoSave
};