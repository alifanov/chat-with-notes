import {ChatOpenAI} from "langchain/chat_models/openai";
import {HumanChatMessage, SystemChatMessage} from "langchain/schema";

import {Notice, TextComponent} from "obsidian";
import {App, Editor, MarkdownView, Modal, Plugin, PluginSettingTab, Setting} from 'obsidian';


interface MyPluginSettings {
	openAIKey: string;
	model: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	openAIKey: '',
	model: 'gpt-4'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-chat-with-notes',
			name: 'Open chat with notes',
			checkCallback: (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						new ChatModal(this.app, this.settings).open();
					}
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class ChatModal extends Modal {
	messages: object[];

	constructor(app: App, settings) {
		super(app);
		this.chat = new ChatOpenAI({temperature: 0, openAIApiKey: settings.openAIKey});
		this.messages = [];
	}

	onOpen() {
		const modalBody = this.contentEl.createDiv();
		modalBody.addClass('chat-modal')

		const messagesContainer = modalBody.createDiv();
		messagesContainer.addClass('messages-wrapper')

		const showHistory = () => {
			messagesContainer.empty();
			for (const message of this.messages) {
				const messageElement = messagesContainer.createDiv();
				messageElement.addClass(`message-item`)
				messageElement.addClass(`message-item-${message.role}`)
				messageElement.setText(`${message.role}: ${message.content}`);
			}
		}

		showHistory()

		const inputContainer = modalBody.createDiv();
		const input = new TextComponent(inputContainer).inputEl;
		input.addClass('chat-model-text-input')

		const handleSendMessage = async () => {
			const newMessage = input.value.trim();
			this.messages.push({role: 'user', content: newMessage})
			showHistory();
			const response = await this.chat.call([
				new HumanChatMessage(
					newMessage
				),
			]);
			this.messages.push({role: 'ai', content: response.text})
			showHistory();
		};
		const handleInputKeyPress: EventHandler["keydown"] = (event: any) => {
			if (event.key === "Enter") {
				handleSendMessage();
				event.preventDefault();
				input.value = ''
			}
		};

		input.addEventListener("keydown", handleInputKeyPress);
		input.focus();
	}

	onClose() {
		this.contentEl.empty();
	}
}


class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Chat with note settigs'});

		new Setting(containerEl)
			.setName('OpenAI API key')
			.addText(text => text
				.setPlaceholder('Enter your OpenAI API key')
				.setValue(this.plugin.settings.openAIKey)
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.openAIKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Model name')
			.addText(text => text
				.setPlaceholder('Enter model name that you want to use')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));
	}
}
