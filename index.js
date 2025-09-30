import {
    extension_settings,
    saveSettingsDebounced
} from "../../../extensions.js";
import {
    eventSource,
    event_types
} from "../../../../script.js";
import {
    callPopup
} from "../../../../popup.js";

const extensionName = "Custom-Prompt-Injector";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false,
    prompts: [],
    selectedPromptId: null,
    position: 'system',
    depth: 1,
};

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}
Object.assign(extension_settings[extensionName], { ...defaultSettings, ...extension_settings[extensionName] });
const settings = extension_settings[extensionName];

class PromptManager {
    constructor() {
        this.updateUI();
    }

    async addPrompt() {
        const title = await callPopup('Enter a title for the new prompt:', 'input');
        if (!title || !title.trim()) return;

        const newPrompt = {
            id: Date.now().toString(),
            title: title.trim(),
            content: `This is a new prompt for "${title.trim()}". Edit me!`,
        };

        settings.prompts.push(newPrompt);
        settings.selectedPromptId = newPrompt.id;
        this.saveAndReload();
    }

    async editPrompt() {
        const prompt = this.getSelectedPrompt();
        if (!prompt) {
            toastr.warning('No prompt selected to edit.');
            return;
        }

        const newTitle = await callPopup('Enter the new title:', 'input', prompt.title);
        if (newTitle && newTitle.trim()) {
            prompt.title = newTitle.trim();
            this.saveAndReload();
        }
    }

    async deletePrompt() {
        const prompt = this.getSelectedPrompt();
        if (!prompt) {
            toastr.warning('No prompt selected to delete.');
            return;
        }

        const confirm = await callPopup(`Are you sure you want to delete the prompt "${prompt.title}"?`, 'confirm');
        if (!confirm) return;

        settings.prompts = settings.prompts.filter(p => p.id !== prompt.id);

        if (settings.selectedPromptId === prompt.id) {
            settings.selectedPromptId = settings.prompts.length > 0 ? settings.prompts[0].id : null;
        }
        this.saveAndReload();
    }

    getSelectedPrompt() {
        if (!settings.selectedPromptId) return null;
        return settings.prompts.find(p => p.id === settings.selectedPromptId);
    }

    updateUI() {
        const presetsSelect = $('#prompt-injector-presets');
        const contentTextarea = $('#prompt-injector-content');
        if (!presetsSelect.length) return;

        presetsSelect.empty();

        if (settings.prompts.length === 0) {
            presetsSelect.append('<option value="">No presets available</option>');
            contentTextarea.val('').prop('disabled', true);
        } else {
            settings.prompts.forEach(prompt => {
                const option = new Option(prompt.title, prompt.id);
                presetsSelect.append(option);
            });

            const selectedExists = settings.prompts.some(p => p.id === settings.selectedPromptId);
            if (!selectedExists) {
                settings.selectedPromptId = settings.prompts[0]?.id || null;
            }

            presetsSelect.val(settings.selectedPromptId);
            contentTextarea.prop('disabled', false);

            const selectedPrompt = this.getSelectedPrompt();
            contentTextarea.val(selectedPrompt ? selectedPrompt.content : '');
        }
    }
    
    saveAndReload() {
        saveSettingsDebounced();
        this.updateUI();
    }
}

let promptManager;

function updateUiFromSettings() {
    $('#prompt-injector-enabled').prop('checked', settings.enabled);
    $('#prompt-injector-position').val(settings.position);
    $('#prompt-injector-depth').val(settings.depth);

    if (promptManager) {
        promptManager.updateUI();
    }
}

function onChatCompletionPromptReady(eventData) {
    if (!settings.enabled) return;

    const selectedPrompt = promptManager?.getSelectedPrompt();
    if (!selectedPrompt || !selectedPrompt.content.trim()) return;

    const { content } = selectedPrompt;
    const { depth, position } = settings;
    const role = position;
    
    const injection = { role, content };

    if (depth === 0) {
        eventData.chat.push(injection);
    } else {
        const insertIndex = Math.max(0, eventData.chat.length - depth);
        eventData.chat.splice(insertIndex, 0, injection);
    }
}

$(async function() {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);

    promptManager = new PromptManager();

    $('#prompt-injector-enabled').on('change', function() {
        settings.enabled = $(this).is(':checked');
        saveSettingsDebounced();
    });
    $('#prompt-injector-position').on('change', function() {
        settings.position = $(this).val();
        saveSettingsDebounced();
    });
    $('#prompt-injector-depth').on('input', function() {
        settings.depth = parseInt($(this).val()) || 0;
        saveSettingsDebounced();
    });
    $('#prompt-injector-presets').on('change', function() {
        settings.selectedPromptId = $(this).val();
        saveSettingsDebounced();
        promptManager.updateUI();
    });
    $('#prompt-injector-content').on('input', function() {
        const prompt = promptManager.getSelectedPrompt();
        if (prompt) {
            prompt.content = $(this).val();
            saveSettingsDebounced();
        }
    });

    $('#prompt-injector-add').on('click', () => promptManager.addPrompt());
    $('#prompt-injector-edit').on('click', () => promptManager.editPrompt());
    $('#prompt-injector-delete').on('click', () => promptManager.deletePrompt());

    updateUiFromSettings();

    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
});