import * as fs from "fs";
import {ChatOpenAI} from "langchain/chat_models/openai";
import {HumanChatMessage, SystemChatMessage} from 'langchain/schema';
import {CallbackManager} from "langchain/callbacks";
import {Notice, TextComponent} from "obsidian";
import {App, Editor, MarkdownView, Modal, Plugin, PluginSettingTab, Setting} from 'obsidian';
import {OpenAIEmbeddings} from "langchain/embeddings/openai";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";
import {OpenAI} from "langchain/llms/openai";
import {Chroma} from "langchain/vectorstores/chroma";
import {ConversationalRetrievalQAChain} from "langchain/chains";
import {BufferMemory} from "langchain/memory";

interface MyPluginSettings {
	openAIKey: string;
	model: string;
}

const COLLECTION_NAME = 'obsidian-notes';

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

		this.addCommand({
			id: 'reindex-embeddings-from-notes',
			name: 'Reindex embeddings from notes',
			checkCallback: async (checking: boolean) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						console.log('Reindexing...')
						const embeddings = new OpenAIEmbeddings({openAIApiKey: this.settings.openAIKey})
						let vectorStore = new Chroma(embeddings, {collectionName: COLLECTION_NAME})
						const collection = await vectorStore.ensureCollection();
						if (!!collection) {
							await vectorStore.index?.deleteCollection({name: COLLECTION_NAME})
						}
						await vectorStore.index?.createCollection({name: COLLECTION_NAME})

						vectorStore = await Chroma.fromExistingCollection(embeddings, {collectionName: COLLECTION_NAME});

						for (const file of this.app.vault.getMarkdownFiles().slice(0, 10)) {
							const path = `${file.vault.adapter.basePath}/${file.path}`
							const text = fs.readFileSync(path, "utf8");
							const textSplitter = new RecursiveCharacterTextSplitter({chunkSize: 1000});
							const docs = await textSplitter.createDocuments([text]);
							await vectorStore.addDocuments(docs.map((it) => ({...it, metadata: {name: file.name.replace('.md', '')}})));
						}
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
	modalBody: any;
	chat: any;
	messagesContainer: any;
	inputContainer: any;
	input: any;
	chain: any;
	vaultName: string;

	handleLLMNewToken(token: string) {
		this.messages[this.messages.length - 1].content += token;
		this.reloadHistory();
	}

	constructor(app: App, settings: MyPluginSettings) {
		super(app);
		this.vaultName = app.vault.getName();
		this.messages = [];
		const handleNewToken = (token: string) => {
			this.handleLLMNewToken(token)
		}
		const embeddings = new OpenAIEmbeddings({openAIApiKey: settings.openAIKey})
		const vectorStore = new Chroma(embeddings, {collectionName: COLLECTION_NAME});

		this.chat = new ChatOpenAI({
			callbackManager: CallbackManager.fromHandlers({handleLLMNewToken: handleNewToken}),
			streaming: true,
			temperature: 0,
			openAIApiKey: settings.openAIKey,
		});

		this.chain = ConversationalRetrievalQAChain.fromLLM(
			this.chat,
			vectorStore.asRetriever(),
			{
				memory: new BufferMemory({
					memoryKey: "chat_history", // Must be set to "chat_history"
					inputKey: 'question',
					outputKey: 'text'
				}),
				returnSourceDocuments: true,
			}
		);

		this.modalBody = this.contentEl.createDiv();
		this.modalBody.addClass('chat-modal')
		this.messagesContainer = this.modalBody.createDiv();
		this.messagesContainer.addClass('messages-wrapper')

		this.reloadHistory()

		this.inputContainer = this.modalBody.createDiv();
		this.input = new TextComponent(this.inputContainer).inputEl;
		this.input.addClass('chat-model-text-input')

	}

	reloadHistory() {
		this.messagesContainer.empty();
		for (const message of this.messages) {
			const messageElement = this.messagesContainer.createDiv();
			messageElement.addClass(`message-item`)
			messageElement.addClass(`message-item-${message.role}`)
			messageElement.setText(`${message.role}: ${message.content}`);
			if (message.role === 'ai') {
				const responseUsedDocsElement = messageElement.createDiv()
				responseUsedDocsElement.addClass('message-item-used-docs')
				for (const doc of message.usedDocs){
					const usedDocElement = responseUsedDocsElement.createEl('a');
					usedDocElement.addClass('message-item-used-docs-item')
					usedDocElement.addClass('internal-link')

					usedDocElement.setText(doc.metadata.name);
					usedDocElement.setAttribute('href', `obsidian://open?vault=${this.vaultName}&file=${doc.metadata.name}`);
					usedDocElement.addEventListener('click', () => {
						this.close()
					})
				}
			}
		}
	}

	onOpen() {
		const handleSendMessage = async () => {
			const newMessage = this.input.value.trim();
			this.messages.push({role: 'user', content: newMessage})
			this.messages.push({role: 'ai', content: '', usedDocs: []})
			this.reloadHistory();
			const response = await this.chain.call({question: newMessage});
			this.messages[this.messages.length-1].usedDocs = response.sourceDocuments;
			this.reloadHistory();
		};
		const handleInputKeyPress: EventHandler["keydown"] = (event: any) => {
			if (event.key === "Enter") {
				handleSendMessage();
				event.preventDefault();
				this.input.value = ''
			}
		};

		this.input.addEventListener("keydown", handleInputKeyPress);
		this.input.focus();
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
