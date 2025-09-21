/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {createClient, LiveClient, LiveTranscriptionEvents} from '@deepgram/sdk';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-2d';
import './visual-3d';
import './chat';

interface Message {
  author: 'user' | 'assistant';
  text: string;
  timestamp: number;
}
@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() private transcript = '';
  @state() private isSettingsVisible = false;
  @state() private visualizerShape: 'orb' | 'bars' = 'orb';
  @state() private colorScheme: 'default' | 'fire' | 'ocean' = 'default';
  @state() private animationSpeed = 0.1;
  @state() private visualizerType: '2d' | '3d' = '2d';

  private client: GoogleGenAI;
  private session: Session;
  private deepgram: LiveClient | null = null;
  // FIX: Cast window to `any` to allow access to the vendor-prefixed `webkitAudioContext`.
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  // FIX: Cast window to `any` to allow access to the vendor-prefixed `webkitAudioContext`.
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
    }

    #transcript-container {
      position: absolute;
      bottom: 25vh;
      left: 5vw;
      right: 5vw;
      text-align: center;
      color: rgba(255, 255, 255, 0.9);
      font-size: 1.5em;
      font-weight: 500;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      z-index: 10;
      min-height: 2em;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }

    .chat-toggle-btn,
    .settings-toggle-btn {
      position: absolute;
      top: 16px;
      z-index: 20;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chat-toggle-btn {
      left: 16px;
    }
    .settings-toggle-btn {
      right: 16px;
    }
    .chat-toggle-btn:hover,
    .settings-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .settings-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .settings-modal {
      background: #10141f;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      width: min(90vw, 600px);
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      color: white;
    }
    .settings-header {
      padding: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 1.2em;
      font-weight: bold;
    }
    .settings-header button {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
    }
    .settings-body {
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .settings-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .settings-section h3 {
      margin: 0;
      font-size: 1.1em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 8px;
    }
    .radio-group {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .radio-group label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .slider-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .slider-group input[type="range"] {
      width: 100%;
    }
  `;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData) {
                  const audio = part.inlineData;
                  this.nextStartTime = Math.max(
                    this.nextStartTime,
                    this.outputAudioContext.currentTime,
                  );

                  const audioBuffer = await decodeAudioData(
                    decode(audio.data),
                    this.outputAudioContext,
                    24000,
                    1,
                  );
                  const source =
                    this.outputAudioContext.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(this.outputNode);
                  source.addEventListener('ended', () => {
                    this.sources.delete(source);
                  });

                  source.start(this.nextStartTime);
                  this.nextStartTime =
                    this.nextStartTime + audioBuffer.duration;
                  this.sources.add(source);
                } else if (part.text) {
                  this.handleTextMessage(part.text);
                  this.updateSessionConversation('assistant', part.text, false);
                }
              }
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
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
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}},
            // languageCode: 'en-GB'
          },
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  private getSessionConversation(): Message[] {
    try {
      const stored = sessionStorage.getItem('conversation');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private updateSessionConversation(
    author: 'user' | 'assistant',
    text: string,
    overwriteLast: boolean,
  ) {
    let conversation = this.getSessionConversation();
    if (
      overwriteLast &&
      conversation.length > 0 &&
      conversation[conversation.length - 1].author === author
    ) {
      conversation[conversation.length - 1].text = text;
      conversation[conversation.length - 1].timestamp = Date.now();
    } else {
      conversation.push({author, text, timestamp: Date.now()});
    }
    sessionStorage.setItem('conversation', JSON.stringify(conversation));
  }

  private async sendWhatsAppMessage(
    target: string,
    contentVariables: Record<string, string>,
  ) {
    this.updateStatus(`Sending WhatsApp to ${target}...`);
    console.log(`Attempting to send WhatsApp message to ${target}...`);

    // In a real-world application, this functionality should be handled by a
    // secure backend service to protect your Twilio credentials.
    // WARNING: Storing credentials in source code is a significant security risk.
    const accountSid = 'AC30dc6026fc21cf365f3707ce5dc80885';
    const authToken = '2112fd7137f48e9ec0aabf18ca8569dc';
    const fromNumber = '+14155238886';
    const contentSid = 'YOUR_TWILIO_CONTENT_SID_HERE'; // TODO: Replace with your 'Appointment Reminders' Content SID

    if (
      !accountSid ||
      !authToken ||
      !fromNumber ||
      !contentSid ||
      contentSid === 'YOUR_TWILIO_CONTENT_SID_HERE'
    ) {
      const errorMsg =
        'Twilio is not fully configured. Please add your Content SID in the code.';
      console.error(errorMsg);
      this.updateError(errorMsg);
      setTimeout(() => {
        if (this.error === errorMsg) this.updateError('');
      }, 5000);
      return;
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const body = new URLSearchParams();
    body.append('To', `whatsapp:${target}`);
    body.append('From', `whatsapp:${fromNumber}`);
    body.append('ContentSid', contentSid);
    body.append('ContentVariables', JSON.stringify(contentVariables));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (response.ok) {
        const responseData = await response.json();
        const {status} = responseData;
        const successMsg = `WhatsApp to ${target} is ${status}.`;
        this.updateStatus(successMsg);
        setTimeout(() => {
          if (this.status === successMsg) this.updateStatus('');
        }, 5000);
      } else {
        const errorData = await response.json();
        const errorMsg = `Failed to send WhatsApp: ${errorData.message}`;
        this.updateError(errorMsg);
        setTimeout(() => {
          if (this.error === errorMsg) this.updateError('');
        }, 5000);
      }
    } catch (e) {
      const errorMsg = `Error sending WhatsApp: ${e.message}`;
      this.updateError(errorMsg);
      setTimeout(() => {
        if (this.error === errorMsg) this.updateError('');
      }, 5000);
    }
  }

  private handleTextMessage(text: string) {
    const waRegex = /<wa>(.*?)<\/wa>/s;
    const match = text.match(waRegex);

    if (match && match[1]) {
      try {
        const waData = JSON.parse(match[1]);
        const {target, contentVariables} = waData;
        if (target && contentVariables) {
          this.sendWhatsAppMessage(target, contentVariables);
        }
      } catch (e) {
        console.error('Failed to parse WhatsApp action:', e);
        this.updateError('Failed to parse WhatsApp action');
      }
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();
    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      // Start Deepgram transcription
      const deepgramApiKey = localStorage.getItem('deepgramApiKey');
      if (!deepgramApiKey) {
        this.updateError(
          'Deepgram API Key not set. Go to chat page to set it.',
        );
      } else {
        try {
          const client = createClient(deepgramApiKey);
          this.deepgram = client.listen.live({
            model: 'nova-2',
            smart_format: true,
            language: 'en-US',
            puncuate: true,
          });

          // FIX: Property 'open' does not exist on type 'typeof LiveTranscriptionEvents'. Corrected to 'Open'.
          this.deepgram.on(LiveTranscriptionEvents.Open, () =>
            console.log('Deepgram connection opened.'),
          );
          // FIX: Property 'transcript' does not exist on type 'typeof LiveTranscriptionEvents'. Corrected to 'Transcript'.
          this.deepgram.on(LiveTranscriptionEvents.Transcript, (data) => {
            const text = data.channel.alternatives[0].transcript;
            if (text) {
              this.transcript = text;
              this.updateSessionConversation('user', text, true);
            }
          });
          // FIX: Property 'close' does not exist on type 'typeof LiveTranscriptionEvents'. Corrected to 'Close'.
          this.deepgram.on(LiveTranscriptionEvents.Close, () =>
            console.log('Deepgram connection closed.'),
          );
          // FIX: Property 'error' does not exist on type 'typeof LiveTranscriptionEvents'. Corrected to 'Error'.
          this.deepgram.on(LiveTranscriptionEvents.Error, (e) =>
            console.error('Deepgram error:', e),
          );
        } catch (e) {
          console.error('Failed to connect to Deepgram', e);
          this.updateError('Failed to start transcription.');
        }
      }
      this.updateSessionConversation('user', '', false);

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);
        this.session.sendRealtimeInput({media: createBlob(pcmData)});

        if (this.deepgram?.getReadyState() === 1) {
          // WebSocket.OPEN
          const int16 = new Int16Array(pcmData.length);
          for (let i = 0; i < pcmData.length; i++) {
            int16[i] = pcmData[i] < 0 ? pcmData[i] * 0x8000 : pcmData[i] * 0x7fff;
          }
          this.deepgram.send(int16.buffer);
        }
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording...');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');
    this.isRecording = false;
    this.transcript = '';

    if (this.deepgram) {
      this.deepgram.finish();
      this.deepgram = null;
    }

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Recording stopped.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  private toggleSettings() {
    this.isSettingsVisible = !this.isSettingsVisible;
  }

  render() {
    return html`
      <div>
        <a href="/chat.html" class="chat-toggle-btn" title="Open Chat">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"/>
          </svg>
        </a>
        <button class="settings-toggle-btn" @click=${this.toggleSettings} title="Visualizer Settings">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M480-160q-33 0-56.5-23.5T400-240v-80q-20-4-39.5-11.5T324-348l-68 30q-32 14-64.5-2.5T159-389l-40-68q-14-25-2.5-57T189-582l61-39q-2-9-3-18.5t-1-19.5q0-7 .5-19.5t3-18.5l-61-39q-26-16-37.5-48t-1-57l40-68q14-32 46.5-46.5T256-850l68 30q17-10 36.5-17.5T399-848v-80q0-33 23.5-56.5T480-920q33 0 56.5 23.5T560-840v80q20 4 39.5 11.5T636-732l68-30q32-14 64.5 2.5T801-691l40 68q14 25 2.5 57T806-498l-61 39q2 9 3 18.5t1 19.5q0 7-.5 19.5t-3 18.5l61 39q26 16 37.5 48t1 57l-40 68q-14 32-46.5 46.5T704-190l-68-30q-17 10-36.5 17.5T561-192v80q0 33-23.5 56.5T480-160Zm0-80q13 0 21.5-8.5T510-270v-100q13-4 26-10t25-14l86 38q12 5 23.5-1t14.5-17l40-68q5-12-1-23.5t-17-14.5l-86-56q5-12 8-25.5t3-26.5q0-13-3-26.5t-8-25.5l86-56q12-5 17-14.5t1-23.5l-40-68q-5-12-14.5-17t-23.5-1l-86 38q-12-8-25-14t-26-10v-100q0-13-8.5-21.5T480-840q-13 0-21.5 8.5T450-810v100q-13 4-26 10t-25 14l-86-38q-12-5-23.5 1T275-703l-40 68q-5 12 1 23.5t17 14.5l86 56q-5 12-8 25.5t-3 26.5q0 13 3 26.5t8 25.5l-86 56q-12 5-17 14.5t-1 23.5l40 68q5 12 14.5 17t23.5 1l86-38q12 8 25 14t26 10v100q0 13 8.5 21.5T480-240Zm0-240q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0-120Z"/>
          </svg>
        </button>

        ${this.isSettingsVisible ? html`
          <div class="settings-modal-overlay" @click=${this.toggleSettings}>
            <div class="settings-modal" @click=${(e: Event) => e.stopPropagation()}>
              <div class="settings-header">
                <span>Visualizer Settings</span>
                <button @click=${this.toggleSettings} aria-label="Close settings">&times;</button>
              </div>
              <div class="settings-body">
                <div class="settings-section">
                  <h3 id="visualizer-type-label">Visualizer Type</h3>
                  <div class="radio-group" role="radiogroup" aria-labelledby="visualizer-type-label">
                    <label>
                      <input type="radio" name="visualizerType" value="2d" ?checked=${this.visualizerType === '2d'} @change=${() => this.visualizerType = '2d'}>
                      2D
                    </label>
                    <label>
                      <input type="radio" name="visualizerType" value="3d" ?checked=${this.visualizerType === '3d'} @change=${() => this.visualizerType = '3d'}>
                      3D
                    </label>
                  </div>
                </div>

                ${this.visualizerType === '2d' ? html`
                  <div class="settings-section">
                    <h3 id="shape-label">Shape</h3>
                    <div class="radio-group" role="radiogroup" aria-labelledby="shape-label">
                      <label>
                        <input type="radio" name="shape" value="orb" ?checked=${this.visualizerShape === 'orb'} @change=${() => this.visualizerShape = 'orb'}>
                        Orb
                      </label>
                      <label>
                        <input type="radio" name="shape" value="bars" ?checked=${this.visualizerShape === 'bars'} @change=${() => this.visualizerShape = 'bars'}>
                        Bars
                      </label>
                    </div>
                  </div>
                  <div class="settings-section">
                    <h3 id="color-label">Color Scheme</h3>
                    <div class="radio-group" role="radiogroup" aria-labelledby="color-label">
                      <label>
                        <input type="radio" name="colorScheme" value="default" ?checked=${this.colorScheme === 'default'} @change=${() => this.colorScheme = 'default'}>
                        Default
                      </label>
                      <label>
                        <input type="radio" name="colorScheme" value="fire" ?checked=${this.colorScheme === 'fire'} @change=${() => this.colorScheme = 'fire'}>
                        Fire
                      </label>
                      <label>
                        <input type="radio" name="colorScheme" value="ocean" ?checked=${this.colorScheme === 'ocean'} @change=${() => this.colorScheme = 'ocean'}>
                        Ocean
                      </label>
                    </div>
                  </div>
                  <div class="settings-section">
                    <h3>Animation Speed</h3>
                    <div class="slider-group">
                      <label for="speed-slider">Responsiveness: ${this.animationSpeed.toFixed(2)}</label>
                      <input
                        id="speed-slider"
                        type="range"
                        min="1"
                        max="30"
                        .value=${String(this.animationSpeed * 100)}
                        @input=${(e: Event) => this.animationSpeed = parseFloat((e.target as HTMLInputElement).value) / 100}
                      />
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        ` : ''}

        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}
            title="Reset Session">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}
            title="Start Recording">
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}
            title="Stop Recording">
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>
        
        <div id="transcript-container">${this.transcript}</div>
        <div id="status"> ${this.error || this.status} </div>
        ${this.visualizerType === '2d' ? html`
          <gdm-live-audio-visuals-2d
            .inputNode=${this.inputNode}
            .outputNode=${this.outputNode}
            .shape=${this.visualizerShape}
            .colorScheme=${this.colorScheme}
            .animationSpeed=${this.animationSpeed}
            ></gdm-live-audio-visuals-2d>
        ` : html`
          <gdm-live-audio-visuals-3d
            .inputNode=${this.inputNode}
            .outputNode=${this.outputNode}
          ></gdm-live-audio-visuals-3d>
        `}
      </div>
    `;
  }
}