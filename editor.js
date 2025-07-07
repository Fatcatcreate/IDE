let editor;
let currentFilePath = null;
let isFileModified = false;

function initializeEditor() {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
    
    require(['vs/editor/editor.main'], function () {
        // Configure Monaco Editor
        monaco.editor.defineTheme('pythonIdeTheme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6A9955' },
                { token: 'keyword', foreground: '569CD6' },
                { token: 'string', foreground: 'CE9178' },
                { token: 'number', foreground: 'B5CEA8' },
                { token: 'operator', foreground: 'D4D4D4' },
                { token: 'identifier', foreground: '9CDCFE' },
                { token: 'type', foreground: '4EC9B0' },
            ],
            colors: {
                'editor.background': '#1E1E1E',
                'editor.foreground': '#D4D4D4',
                'editor.lineHighlightBackground': '#2D2D30',
                'editor.selectionBackground': '#264F78',
                'editor.inactiveSelectionBackground': '#3A3D41',
                'editorCursor.foreground': '#AEAFAD',
                'editorWhitespace.foreground': '#404040',
                'editorLineNumber.foreground': '#858585',
                'editorLineNumber.activeForeground': '#C6C6C6',
                'editorIndentGuide.background': '#404040',
                'editorIndentGuide.activeBackground': '#707070',
                'editorRuler.foreground': '#5A5A5A',
                'editorBracketMatch.background': '#0064001a',
                'editorBracketMatch.border': '#888888',
                'editorOverviewRuler.background': '#25252580',
                'editorOverviewRuler.border': '#7f7f7f4d',
                'editorGutter.background': '#1E1E1E',
                'editorError.foreground': '#F44747',
                'editorWarning.foreground': '#FF8C00',
                'editorInfo.foreground': '#75BEFF',
                'editorHint.foreground': '#EEEEEEB3'
            }
        });

        // Create the editor
        editor = monaco.editor.create(document.getElementById('editor'), {
            value: `# Welcome to Python IDE
# Write your Python code here

def hello_world():
    print("Hello, World!")
    return "Success"

if __name__ == "__main__":
    result = hello_world()
    print(f"Function returned: {result}")
`,
            language: 'python',
            theme: 'pythonIdeTheme',
            automaticLayout: true,
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            readOnly: false,
            minimap: {
                enabled: true
            },
            wordWrap: 'on',
            tabSize: 4,
            insertSpaces: true,
            detectIndentation: true,
            folding: true,
            foldingStrategy: 'indentation',
            showFoldingControls: 'always',
            bracketMatching: 'always',
            autoClosingBrackets: 'always',
            autoClosingQuotes: 'always',
            autoIndent: 'advanced',
            formatOnPaste: true,
            formatOnType: true,
            renderLineHighlight: 'all',
            renderWhitespace: 'selection',
            rulers: [80, 120],
            cursorBlinking: 'blink',
            cursorSmoothCaretAnimation: true,
            smoothScrolling: true,
            mouseWheelScrollSensitivity: 1,
            fastScrollSensitivity: 5,
            scrollbar: {
                useShadows: false,
                verticalHasArrows: false,
                horizontalHasArrows: false,
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
            }
        });

        // Add event listeners
        setupEditorEventListeners();
        
        // Update cursor position
        updateCursorPosition();
        
        console.log('Monaco Editor initialized successfully');
    });
}

function setupEditorEventListeners() {
    // Track content changes
    editor.onDidChangeModelContent(() => {
        isFileModified = true;
        updateFileStatus();
    });

    // Track cursor position changes
    editor.onDidChangeCursorPosition(() => {
        updateCursorPosition();
    });

    // Add keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveFile();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {
        runCode();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL, () => {
        lintCode();
    });

    // Add context menu actions
    editor.addAction({
        id: 'run-selection',
        label: 'Run Selection',
        contextMenuGroupId: 'execution',
        contextMenuOrder: 1.5,
        run: function(ed) {
            const selection = ed.getSelection();
            const selectedText = ed.getModel().getValueInRange(selection);
            if (selectedText.trim()) {
                runCode(selectedText);
            }
        }
    });

    editor.addAction({
        id: 'comment-line',
        label: 'Comment Line',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash
        ],
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.5,
        run: function(ed) {
            const selection = ed.getSelection();
            const lineNumber = selection.startLineNumber;
            const line = ed.getModel().getLineContent(lineNumber);
            
            if (line.trimStart().startsWith('#')) {
                // Remove comment
                const newLine = line.replace(/^\s*#\s?/, '');
                ed.executeEdits('', [{
                    range: new monaco.Range(lineNumber, 1, lineNumber, line.length + 1),
                    text: newLine
                }]);
            } else {
                // Add comment
                const leadingSpaces = line.match(/^\s*/)[0];
                const newLine = leadingSpaces + '# ' + line.trimStart();
                ed.executeEdits('', [{
                    range: new monaco.Range(lineNumber, 1, lineNumber, line.length + 1),
                    text: newLine
                }]);
            }
        }
    });
}

function updateCursorPosition() {
    const position = editor.getPosition();
    const cursorElement = document.getElementById('cursor-position');
    if (cursorElement && position) {
        cursorElement.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
    }
}

function updateFileStatus() {
    const fileElement = document.getElementById('current-file');
    if (fileElement) {
        const fileName = currentFilePath ? currentFilePath.split('/').pop() : 'untitled.py';
        fileElement.textContent = fileName + (isFileModified ? ' •' : '');
    }
}

function getEditorContent() {
    return editor ? editor.getValue() : '';
}

function setEditorContent(content) {
    if (editor) {
        editor.setValue(content);
        isFileModified = false;
        updateFileStatus();
    }
}

function setCurrentFilePath(path) {
    currentFilePath = path;
    isFileModified = false;
    updateFileStatus();
}

function getCurrentFilePath() {
    return currentFilePath;
}

function isModified() {
    return isFileModified;
}

function markAsSaved() {
    isFileModified = false;
    updateFileStatus();
}

function focusEditor() {
    if (editor) {
        editor.focus();
    }
}

function insertText(text) {
    if (editor) {
        const selection = editor.getSelection();
        const range = new monaco.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn
        );
        editor.executeEdits('', [{ range: range, text: text }]);
    }
}

function goToLine(lineNumber) {
    if (editor) {
        editor.setPosition({ lineNumber: lineNumber, column: 1 });
        editor.revealLineInCenter(lineNumber);
        editor.focus();
    }
}

function highlightLine(lineNumber, type = 'error') {
    if (editor) {
        const decorations = editor.deltaDecorations([], [
            {
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: {
                    isWholeLine: true,
                    className: type === 'error' ? 'editor-line-error' : 'editor-line-warning',
                    glyphMarginClassName: type === 'error' ? 'editor-glyph-error' : 'editor-glyph-warning'
                }
            }
        ]);
        
        // Clear decoration after 3 seconds
        setTimeout(() => {
            if (editor) {
                editor.deltaDecorations(decorations, []);
            }
        }, 3000);
    }
}

function clearDecorations() {
    if (editor) {
        editor.deltaDecorations(editor.getModel().getAllDecorations(), []);
    }
}

// Initialize editor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeEditor();
});