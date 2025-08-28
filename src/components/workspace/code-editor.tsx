'use client';

import { Editor, BeforeMount } from '@monaco-editor/react';
import { useEffect, useState } from 'react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  filename: string | null;
  disabled?: boolean;
}

export function CodeEditor({ value, onChange, language, filename, disabled = false }: CodeEditorProps) {
  const [themeName, setThemeName] = useState<'sand-light' | 'sand-dark'>('sand-light');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setThemeName(mq.matches ? 'sand-dark' : 'sand-light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const beforeMount: BeforeMount = (monaco) => {
    const common = {
      base: 'vs-dark' as const,
      inherit: true,
      colors: {
        'editor.background': getComputedStyle(document.documentElement).getPropertyValue('--sand-elevated').trim() || '#2b2722',
        'editor.foreground': getComputedStyle(document.documentElement).getPropertyValue('--sand-text').trim() || '#ede6db',
        'editorCursor.foreground': '#c07a4c',
        'editorLineNumber.foreground': '#9b8f84',
        'editor.selectionBackground': '#c07a4c33',
        'editor.lineHighlightBackground': '#00000010',
        'editorWidget.background': '#00000010',
        'editorHoverWidget.background': '#00000010',
        'dropdown.background': '#00000010',
        'list.hoverBackground': '#00000010',
        'input.background': '#00000010',
        'focusBorder': '#c07a4c55',
      },
      rules: [
        { token: 'comment', foreground: '9b8f84' },
        { token: 'string', foreground: 'd89b6a' },
        { token: 'number', foreground: 'c07a4c' },
        { token: 'keyword', foreground: 'c07a4c' },
        { token: 'type', foreground: 'e3b48e' },
        { token: 'delimiter', foreground: 'b8ada1' },
      ],
    };
    monaco.editor.defineTheme('sand-dark', common);
    monaco.editor.defineTheme('sand-light', { ...common, base: 'vs' });
  };
  const handleChange = (value: string | undefined) => {
    onChange(value || '');
  };

  if (!filename) {
    return (
      <div className="h-full flex items-center justify-center bg-elevated/90 backdrop-blur-sm">
        <div className="text-center text-muted bolt-fade-in">
          <div className="text-6xl mb-6 opacity-60">📁</div>
          <h3 className="text-xl font-semibold mb-3 text-fg">No File Selected</h3>
          <p className="text-sm text-muted max-w-md">
            Choose a file from the explorer to start editing, or create a new file to get started with your project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={disabled ? undefined : handleChange}
      theme={themeName}
      beforeMount={beforeMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        bracketPairColorization: { enabled: true },
        readOnly: disabled,
        guides: {
          bracketPairs: true,
          bracketPairsHorizontal: true,
          highlightActiveBracketPair: true,
          indentation: true,
        },
        // Autocomplete is enabled by default in Monaco
        quickSuggestions: disabled ? false : {
          other: true,
          comments: true,
          strings: true,
        },
        acceptSuggestionOnCommitCharacter: !disabled,
        acceptSuggestionOnEnter: disabled ? 'off' : 'on',
        accessibilitySupport: 'off',
        renderLineHighlight: 'line',
        colorDecorators: true,
        contextmenu: !disabled,
        copyWithSyntaxHighlighting: true,
        cursorBlinking: disabled ? 'solid' : 'blink',
        cursorSmoothCaretAnimation: disabled ? 'off' : 'on',
        cursorStyle: 'line',
        dragAndDrop: !disabled,
        emptySelectionClipboard: false,
        foldingHighlight: true,
        formatOnPaste: !disabled,
        formatOnType: !disabled,
        matchBrackets: 'always',
        occurrencesHighlight: 'singleFile',
        overviewRulerBorder: false,
        overviewRulerLanes: 3,
        padding: { top: 12, bottom: 12 },
        parameterHints: { enabled: !disabled },
        quickSuggestionsDelay: 10,
        renderControlCharacters: false,
        renderValidationDecorations: 'on',
        renderWhitespace: 'none',
        scrollbar: {
          vertical: 'visible',
          horizontal: 'visible',
          arrowSize: 11,
          useShadows: true,
          verticalHasArrows: false,
          horizontalHasArrows: false,
          horizontalScrollbarSize: 12,
          verticalScrollbarSize: 12,
          verticalSliderSize: 12,
          horizontalSliderSize: 12,
        },
        selectionHighlight: !disabled,
        smoothScrolling: true,
        snippetSuggestions: disabled ? 'none' : 'top',
      }}
    />
  );
}
