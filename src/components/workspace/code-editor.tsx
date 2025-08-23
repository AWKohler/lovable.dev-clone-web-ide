'use client';

import { Editor } from '@monaco-editor/react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  filename: string | null;
}

export function CodeEditor({ value, onChange, language, filename }: CodeEditorProps) {
  const handleChange = (value: string | undefined) => {
    onChange(value || '');
  };

  if (!filename) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900/95 backdrop-blur-sm">
        <div className="text-center text-slate-400 bolt-fade-in">
          <div className="text-6xl mb-6 opacity-60">📁</div>
          <h3 className="text-xl font-semibold mb-3 text-slate-300">No File Selected</h3>
          <p className="text-sm text-slate-500 max-w-md">
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
      onChange={handleChange}
      theme="vs-dark"
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
        guides: {
          bracketPairs: true,
          bracketPairsHorizontal: true,
          highlightActiveBracketPair: true,
          indentation: true,
        },
        suggest: {
          enabled: true,
        },
        quickSuggestions: {
          other: true,
          comments: true,
          strings: true,
        },
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: 'on',
        accessibilitySupport: 'off',
        renderLineHighlight: 'line',
        colorDecorators: true,
        contextmenu: true,
        copyWithSyntaxHighlighting: true,
        cursorBlinking: 'blink',
        cursorSmoothCaretAnimation: 'on',
        cursorStyle: 'line',
        dragAndDrop: true,
        emptySelectionClipboard: false,
        foldingHighlight: true,
        formatOnPaste: true,
        formatOnType: true,
        matchBrackets: 'always',
        occurrencesHighlight: true,
        overviewRulerBorder: false,
        overviewRulerLanes: 3,
        padding: { top: 12, bottom: 12 },
        parameterHints: { enabled: true },
        quickSuggestionsDelay: 10,
        renderControlCharacters: false,
        renderIndentGuides: true,
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
        selectionHighlight: true,
        smoothScrolling: true,
        snippetSuggestions: 'top',
      }}
    />
  );
}