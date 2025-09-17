const { Plugin, PluginSettingTab, Setting } = require('obsidian');

module.exports = class AppendToFilePlugin extends Plugin {
  settings = {
    targetFile: 'output.md', // File di default
    regexCondition: '' // Regex di default (vuota significa nessuna condizione)
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
      }
    });

    // Aggiunge la pagina delle impostazioni
    this.addSettingTab(new AppendToFileSettingTab(this.app, this));
  }

  async appendToFile(text) {
    try {
      // Legge il contenuto esistente del file
      const targetFilePath = this.settings.targetFile;
      let fileContent = '';
      if (await this.app.vault.adapter.exists(targetFilePath)) {
        fileContent = await this.app.vault.adapter.read(targetFilePath);
      }

      // Aggiunge il testo selezionato con un separatore
      const newContent = fileContent ? `${fileContent}\n\n${text}` : text;

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
  }
}