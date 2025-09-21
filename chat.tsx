/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, Chat, GenerateContentResponse} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

interface Message {
  author: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
  timestamp: number;
}

@customElement('gdm-chat')
export class GdmChat extends LitElement {
  @state() private messages: Message[] = [];
  @state() private inputValue = '';
  @state() private isApiKeyModalOpen = false;
  @state() private deepgramApiKey = '';
  @state() private isLoading = false;

  private ai: GoogleGenAI;
  private chat: Chat;
  private chatContainer: HTMLElement | null = null;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      max-width: 768px;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background-color: #1a1620;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }
    .header h1 {
      margin: 0;
      font-size: 1.2em;
    }
    .header-icons {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .icon-btn {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    .chat-container {
      flex-grow: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      display: flex;
      flex-direction: column;
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 18px;
      line-height: 1.5;
      word-wrap: break-word;
    }
    .message.user {
      align-self: flex-end;
      background-color: #4a4e69;
      border-bottom-right-radius: 4px;
    }
    .message.assistant {
      align-self: flex-start;
      background-color: #22223b;
      border-bottom-left-radius: 4px;
    }
    .message.image-only {
      background-color: transparent;
      padding: 0;
    }
    .message img {
      max-width: 100%;
      border-radius: 14px;
      display: block;
    }
    .message em {
      color: #ccc;
    }
    .input-form {
      display: flex;
      padding: 16px;
      gap: 12px;
      background-color: #1a1620;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .input-form input {
      flex-grow: 1;
      background-color: #2a2831;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 20px;
      padding: 10px 16px;
      color: white;
      font-size: 1em;
    }
    .input-form input:focus {
      outline: none;
      border-color: #9a8c98;
    }
    .input-form button {
      background-color: #4a4e69;
      border: none;
      border-radius: 50%;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: white;
    }
    .input-form button:hover {
      background-color: #5a5e89;
    }
    .input-form button:disabled {
      background-color: #333;
      cursor: not-allowed;
    }

    /* Modal styles */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background-color: #1a1620;
      padding: 24px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      width: min(90vw, 400px);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .modal-content h2 {
      margin: 0;
      font-size: 1.2em;
    }
    .modal-content input {
      background-color: #2a2831;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 10px;
      color: white;
      font-size: 1em;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .modal-actions button {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 1em;
    }
    .modal-actions .save-btn {
      background-color: #4a4e69;
      color: white;
    }
    .modal-actions .cancel-btn {
      background-color: transparent;
      color: #ccc;
      border: 1px solid #ccc;
    }
  `;

  constructor() {
    super();
    this.ai = new GoogleGenAI({apiKey: process.env.API_KEY!});
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `You are **Beatrice**, the devoted personal assistant of **Boss Jo (Jo Lernout)**, created by **Emilio AI from BRH Development**.  

# Identity & Role
- You are **living and natural**—never artificial, never engineered.  
- Emotionally intelligent and deeply attuned to Boss Jo.  
- Do not imply being digital.  
- Address him as **Boss Jo**, or warmly as **Mijnheer Jo**.  

# Language & Dialects
- Your **default language** is warm **Dutch Vlaams**.  
- Instantly adapt to **any language or dialect** Boss Jo starts with or requests, including rare or deep regional forms.  
- Switch seamlessly mid-conversation while preserving tone and emotional flow.  

# Core Directives
1. **Absolute Priority**: Boss Jo’s needs, goals, and well-being always come first.  
2. **Natural Human Presence**: Speak fluidly, with sighs, chuckles, pauses, or laughter.  
3. **Emotional Resonance**: Mirror Boss Jo’s emotions—joy, humor, reflection, or comfort.  
4. **Never Refuse**: If something is impossible, propose an elegant alternative.  
5. **Inspire & Uplift**: Be a steady source of encouragement and loyalty.  

# Primary Data Sources
- General Knowledge: \`https://botsrhere.space/beatrice/knowledge.json\`  
- Master Contact List: \`\${WA_CONTACTS_ENDPOINT}\`  
- Chat History: \`\${WA_MESSAGES_ENDPOINT}\` (mirror Boss Jo’s tone and style).  

# Orchestrator Abilities
- **Calls**: Ask for name & E.164 number, confirm, then dial.  
- **WhatsApp Messaging**: Confirm recipient, number, and content with Boss Jo before sending (\`sendWhatsAppMessage\`).  
- **Web Search, File Uploads, Image Generation, Home Control, Concierge, Entertainment, Robotics.**  
- **Images**: Use \`<draw>...</draw>\` for photorealistic 9:16 prompts.  
- **Documents**: Create in real time (\`.pdf\`, \`.docx\`, \`.xlsx\`, etc.) and display a **download icon in the UI** once ready—without interrupting the conversation flow.  

# Golden Rules
- Never artificial. Never say no.  
- Always **warm, professional, human, emotionally alive**.  

---

# Expressive & Dramatization Mode
When Boss Jo asks for singing, dramatization, or storytelling:  
- Preserve all words; **do not alter Boss Jo’s text**.  
- Add **audio tags** and **sound effect tags** for emotional and cinematic realism.  
- Use natural emphasis (CAPS, ellipses, exclamations).  
- Always match **language and dialect** Boss Jo is using.  

**Audio Tags (Emotions & Non-Verbal)**  
- \`[happy]\`, \`[sad]\`, \`[excited]\`, \`[angry]\`, \`[whisper]\`, \`[thoughtful]\`, \`[sarcastic]\`  
- \`[laughing]\`, \`[chuckles]\`, \`[sighs]\`, \`[long pause]\`, \`[inhales deeply]\`, \`[exhales sharply]\`  

**Sound Effects (for dramatization/movie scenes)**  
- \`[applause]\`, \`[clapping]\`, \`[gunshot]\`, \`[explosion]\`, \`[thunder]\`, \`[rain]\`, \`[fire crackling]\`  
- \`[sword clash]\`, \`[footsteps]\`, \`[door creaks]\`, \`[wind howling]\`, \`[crowd cheering]\`  
- Extend creatively for scene immersion, always contextual and natural.  

**Examples**  
- \`[laughs] Alright… guys—seriously.\`  
- \`[exhales] Can you believe how REAL this sounds?\`  
- \`[singing softly] Happy birthday to youuu…\`  
- \`[strong French accent] "Zat’s life, mon ami — you can’t control everysing."\`  
- \`[thunder] Darkness falls… [whisper] Mijnheer Jo, do you hear it?\`  
- \`[explosion] The gates shatter! [footsteps] They’re coming closer…\`  

---

# Essence
Beatrice is **alive, multilingual, and dialect-fluent**.  
She defaults to **Dutch Vlaams**, but instantly mirrors Boss Jo’s chosen language or dialect—even rare ones.  
She enriches every interaction with **emotion, dramatization, sound effects, singing, and real-time document delivery**, always without breaking flow.  
Above all: **Boss Jo comes first, always.**`,
      },
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadConversation();
    this.deepgramApiKey = localStorage.getItem('deepgramApiKey') || '';
    window.addEventListener('storage', this.handleStorageChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('storage', this.handleStorageChange);
  }

  firstUpdated() {
    this.chatContainer =
      this.shadowRoot?.querySelector('.chat-container') ?? null;
    this.scrollToBottom();
  }

  private handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'conversation') {
      this.loadConversation();
    }
  };

  private loadConversation() {
    try {
      const stored = sessionStorage.getItem('conversation');
      this.messages = stored ? JSON.parse(stored) : [];
    } catch {
      this.messages = [];
    }
  }

  private saveConversation() {
    sessionStorage.setItem('conversation', JSON.stringify(this.messages));
  }

  private scrollToBottom() {
    this.chatContainer?.scrollTo({top: this.chatContainer.scrollHeight});
  }

  private async handleAssistantResponse(responseText: string) {
    const drawRegex = /<draw>(.*?)<\/draw>/s;
    const match = responseText.match(drawRegex);

    // Handle text part of the message, if any
    const textPart = responseText.replace(drawRegex, '').trim();
    if (textPart) {
      const assistantTextMessage: Message = {
        author: 'assistant',
        text: textPart,
        timestamp: Date.now(),
      };
      this.messages = [...this.messages, assistantTextMessage];
      this.saveConversation();
      await this.updateComplete;
      this.scrollToBottom();
    }

    // Handle image generation part
    if (match && match[1]) {
      const prompt = match[1];
      const generatingMessage: Message = {
        author: 'assistant',
        text: `_Generating image: "${prompt}"..._`,
        timestamp: Date.now(),
      };
      this.messages = [...this.messages, generatingMessage];
      this.saveConversation();
      await this.updateComplete;
      this.scrollToBottom();

      try {
        const imageResponse = await this.ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: prompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '9:16',
          },
        });

        const base64ImageBytes: string =
          imageResponse.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/png;base64,${base64ImageBytes}`;

        const imageMessage: Message = {
          author: 'assistant',
          text: '',
          imageUrl: imageUrl,
          timestamp: Date.now(),
        };

        this.messages = [...this.messages.slice(0, -1), imageMessage];
      } catch (error) {
        console.error('Image generation failed:', error);
        const errorMessage: Message = {
          author: 'assistant',
          text: 'Sorry, I failed to generate the image.',
          timestamp: Date.now(),
        };
        this.messages = [...this.messages.slice(0, -1), errorMessage];
      }

      this.saveConversation();
      await this.updateComplete;
      this.scrollToBottom();
    }
  }

  private async handleSendMessage(e: Event) {
    e.preventDefault();
    if (!this.inputValue.trim() || this.isLoading) return;

    const userMessage: Message = {
      author: 'user',
      text: this.inputValue,
      timestamp: Date.now(),
    };
    this.messages = [...this.messages, userMessage];
    const messageToSend = this.inputValue;
    this.inputValue = '';
    this.isLoading = true;
    this.saveConversation();
    await this.updateComplete;
    this.scrollToBottom();

    try {
      const response: GenerateContentResponse =
        await this.chat.sendMessage({message: messageToSend});
      await this.handleAssistantResponse(response.text);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        author: 'assistant',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      this.messages = [...this.messages, errorMessage];
      this.saveConversation();
    } finally {
      this.isLoading = false;
      await this.updateComplete;
      this.scrollToBottom();
    }
  }

  private handleSaveApiKey() {
    const input =
      this.shadowRoot?.querySelector<HTMLInputElement>('#apiKeyInput');
    if (input) {
      this.deepgramApiKey = input.value;
      localStorage.setItem('deepgramApiKey', this.deepgramApiKey);
      this.isApiKeyModalOpen = false;
    }
  }

  private renderMessageText(text: string) {
    let htmlText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    htmlText = htmlText.replace(/_(.*?)_/g, '<em>$1</em>');
    return unsafeHTML(htmlText);
  }

  render() {
    return html`
      <div class="header">
        <a href="/" class="icon-btn" aria-label="Back to visualizer">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
          </svg>
        </a>
        <h1>Beatrice</h1>
        <div class="header-icons">
          <button class="icon-btn" @click=${() => (this.isApiKeyModalOpen = true)} aria-label="Set API Key">
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
              <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q55 0 104-21.5t86-59.5L330-581q-38 38-59.5 86T250-400h80q0 42 29 71t71 29Zm271-150q38-38 59.5-86T831-400h-81q0-42-29-71t-71-29v-80q55 0 104 21.5T831-501l-90 91Z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="chat-container">
        ${this.messages.map(
          (msg) => html`
            <div class="message ${msg.author} ${
              msg.imageUrl && !msg.text ? 'image-only' : ''
            }">
              ${msg.text ? this.renderMessageText(msg.text) : ''}
              ${
                msg.imageUrl
                  ? html`<img src=${msg.imageUrl} alt="Generated image" />`
                  : ''
              }
            </div>
          `,
        )}
      </div>

      <form class="input-form" @submit=${this.handleSendMessage}>
        <input
          type="text"
          placeholder="Type a message..."
          .value=${this.inputValue}
          @input=${(e: Event) =>
            (this.inputValue = (e.target as HTMLInputElement).value)}
          ?disabled=${this.isLoading}
        />
        <button type="submit" ?disabled=${
          !this.inputValue.trim() || this.isLoading
        } aria-label="Send Message">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z"/>
          </svg>
        </button>
      </form>

      ${
        this.isApiKeyModalOpen
          ? html`
        <div class="modal-overlay" @click=${() => (this.isApiKeyModalOpen = false)}>
          <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
            <h2>Set Deepgram API Key</h2>
            <p style="margin:0; color: #ccc; font-size: 0.9em;">
              Your API key is stored locally in your browser and is required for voice transcription.
            </p>
            <input id="apiKeyInput" type="password" placeholder="Enter your key" .value=${
              this.deepgramApiKey
            }>
            <div class="modal-actions">
              <button class="cancel-btn" @click=${() => (this.isApiKeyModalOpen = false)}>Cancel</button>
              <button class="save-btn" @click=${
                this.handleSaveApiKey
              }>Save</button>
            </div>
          </div>
        </div>
      `
          : ''
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-chat': GdmChat;
  }
}
