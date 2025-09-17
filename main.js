const { Plugin, PluginSettingTab, Setting } = require('obsidian');

module.exports = class AppendToFilePlugin extends Plugin {
  settings = {
    targetFile: 'output.md', // File di default
    regexCondition: '', // Regex di default (vuota significa nessuna condizione)
    prepend: false, // Default: append (false)
    headerMarker: '' // Marker per l'inserimento (vuoto significa prepend al top o append)
  };

  // State tracking for Ctrl+A behavior
  lastSelectionState = {
    isParagraphSelected: false,
    lastParagraphRange: null,
    lastEditor: null
  };

  async onload() {
    // Carica le impostazioni salvate
    await this.loadSettings();

    // Registra il comando nella Command Palette
    this.addCommand({
      id: 'append-selected-text',
      name: 'Append selected text to file and delete',
      editorCallback: (editor, view) => {
        // Ottiene il testo selezionato
        const selectedText = editor.getSelection();
        if (!selectedText) {
          new Notice('No text selected!');
          return;
        }

        // Verifica la condizione regex, se presente
        if (this.settings.regexCondition) {
          try {
            const regex = new RegExp(this.settings.regexCondition);
            if (!regex.test(selectedText)) {
              new Notice('Selected text does not match the regex condition!');
              return;
            }
          } catch (error) {
            new Notice(`Invalid regex: ${error.message}`);
            return;
          }
        }

        // Ottiene il file corrente
        const activeFile = view.file;
        const fileLink = activeFile ? `[[${activeFile.basename}]]` : '[[Unknown File]]';

        // Formatta il timestamp
        const now = new Date();
        const date = now.toISOString().split('T')[0]; // e.g., 2025-08-30
        const time = now.toISOString().slice(11, 16); // e.g., 08:04

        // Formatta il testo con i metadati
        const textWithMetadata = `<sub>${fileLink} | ${date} | ${time}:</sub>\n${selectedText}`;

        // Aggiunge il testo al file specificato
        this.appendToFile(textWithMetadata);

        // Elimina il testo selezionato dall'editor
        editor.replaceSelection('');
        
        // Reset selection state after any action
        this.resetSelectionState();
      }
    });

    // Add custom Ctrl+A command
    this.addCommand({
      id: 'custom-select-all',
      name: 'Custom Select All (Paragraph first, then all)',
      hotkeys: [{ modifiers: ['Mod'], key: 'a' }],
      editorCallback: (editor, view) => {
        this.handleCustomSelectAll(editor);
      }
    });

    // Register event listeners to reset selection state
    this.registerDomEvent(document, 'click', () => {
      this.resetSelectionState();
    });

    this.registerDomEvent(document, 'keydown', (evt) => {
      // Reset on any key except Ctrl+A
      if (!(evt.ctrlKey && evt.key === 'a') && !(evt.metaKey && evt.key === 'a')) {
        this.resetSelectionState();
      }
    });

    // Aggiunge la pagina delle impostazioni
    this.addSettingTab(new AppendToFileSettingTab(this.app, this));
  }

  handleCustomSelectAll(editor) {
    const currentCursor = editor.getCursor();
    const currentSelection = editor.getSelection();
    
    // Check if we're in the same editor and have a paragraph selected
    if (this.lastSelectionState.isParagraphSelected && 
        this.lastSelectionState.lastEditor === editor &&
        this.isCurrentSelectionSameParagraph(editor)) {
      // Second press: select all
      editor.setSelection({line: 0, ch: 0}, {line: editor.lastLine(), ch: editor.getLine(editor.lastLine()).length});
      this.resetSelectionState();
    } else {
      // First press: select current paragraph
      this.selectCurrentParagraph(editor);
    }
  }

  selectCurrentParagraph(editor) {
    const cursor = editor.getCursor();
    const totalLines = editor.lineCount();
    
    // Find paragraph boundaries
    let startLine = cursor.line;
    let endLine = cursor.line;
    
    // Find start of paragraph (go up until empty line or start of document)
    while (startLine > 0) {
      const prevLine = editor.getLine(startLine - 1).trim();
      if (prevLine === '') {
        break;
      }
      startLine--;
    }
    
    // Find end of paragraph (go down until empty line or end of document)
    while (endLine < totalLines - 1) {
      const nextLine = editor.getLine(endLine + 1).trim();
      if (nextLine === '') {
        break;
      }
      endLine++;
    }
    
    // Handle case where current line is empty
    const currentLineText = editor.getLine(cursor.line).trim();
    if (currentLineText === '') {
      // If on empty line, select just that line
      startLine = cursor.line;
      endLine = cursor.line;
    }
    
    // Set selection
    const startPos = {line: startLine, ch: 0};
    const endPos = {line: endLine, ch: editor.getLine(endLine).length};
    
    editor.setSelection(startPos, endPos);
    
    // Update state
    this.lastSelectionState.isParagraphSelected = true;
    this.lastSelectionState.lastParagraphRange = {startLine, endLine};
    this.lastSelectionState.lastEditor = editor;
  }

  isCurrentSelectionSameParagraph(editor) {
    if (!this.lastSelectionState.lastParagraphRange) {
      return false;
    }
    
    const selection = editor.getSelection();
    if (!selection) {
      return false;
    }
    
    const selectionStart = editor.getCursor('from');
    const selectionEnd = editor.getCursor('to');
    const lastRange = this.lastSelectionState.lastParagraphRange;
    
    return selectionStart.line === lastRange.startLine &&
           selectionStart.ch === 0 &&
           selectionEnd.line === lastRange.endLine &&
           selectionEnd.ch === editor.getLine(lastRange.endLine).length;
  }

  resetSelectionState() {
    this.lastSelectionState.isParagraphSelected = false;
    this.lastSelectionState.lastParagraphRange = null;
    this.lastSelectionState.lastEditor = null;
  }

  async appendToFile(text) {
    try {
      // Legge il contenuto esistente del file
      const targetFilePath = this.settings.targetFile;
      let fileContent = '';
      if (await this.app.vault.adapter.exists(targetFilePath)) {
        fileContent = await this.app.vault.adapter.read(targetFilePath);
      }

      let newContent;
      if (!this.settings.prepend) {
        // Modalità append: aggiunge in fondo
        newContent = fileContent ? `${fileContent}\n\n${text}` : text;
      } else {
        // Modalità prepend: inserisce dopo il marker o all'inizio
        if (fileContent) {
          const lines = fileContent.split('\n');
          let insertIndex = -1;
          if (this.settings.headerMarker) {
            insertIndex = lines.findIndex(line => line.trim() === this.settings.headerMarker.trim());
          }
          if (insertIndex !== -1) {
            // Inserisce dopo il marker
            const headerLines = lines.slice(0, insertIndex + 1);
            const restLines = lines.slice(insertIndex + 1);
            const entryLines = text.split('\n');
            newContent = [...headerLines, ...entryLines, '', ...restLines].join('\n').trim();
          } else {
            // Se marker non trovato o non impostato, prepend all'inizio
            newContent = `${text}\n\n${fileContent}`.trim();
          }
        } else {
          newContent = text;
        }
      }

      // Scrive il nuovo contenuto nel file
      await this.app.vault.adapter.write(targetFilePath, newContent);
      new Notice(`Text appended to ${targetFilePath} and deleted from editor`);
    } catch (error) {
      new Notice(`Error appending to file: ${error.message}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, this.settings, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
};

// Classe per la pagina delle impostazioni
class AppendToFileSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Target file path')
      .setDesc('Enter the path of the file where selected text will be appended (e.g., notes/output.md).')
      .addText(text => text
        .setPlaceholder('e.g., notes/output.md')
        .setValue(this.plugin.settings.targetFile)
        .onChange(async (value) => {
          this.plugin.settings.targetFile = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Regex condition')
      .setDesc('Enter a regex to filter the selected text (e.g., "\\w{5,}" for text with 5+ characters). Leave empty to disable.')
      .addText(text => text
        .setPlaceholder('e.g., \\w{5,}')
        .setValue(this.plugin.settings.regexCondition)
        .onChange(async (value) => {
          this.plugin.settings.regexCondition = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Prepend new entries')
      .setDesc('If enabled, new entries will be added at the top (after the header marker if set). If disabled, append to the bottom.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.prepend)
        .onChange(async (value) => {
          this.plugin.settings.prepend = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Header marker')
      .setDesc('Enter a unique string that marks the end of the fixed header (e.g., "---" or "## Entries"). New entries will be inserted after this line when prepend is enabled. Leave empty to prepend to the very top.')
      .addText(text => text
        .setPlaceholder('e.g., ---')
        .setValue(this.plugin.settings.headerMarker)
        .onChange(async (value) => {
          this.plugin.settings.headerMarker = value;
          await this.plugin.saveSettings();
        }));
  }
}