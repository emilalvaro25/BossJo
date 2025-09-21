/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-2d';

interface MessageLog {
  timestamp: number;
  target: string;
  contentVariables: Record<string, string>;
  status: string;
  details: string;
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() private messageLogs: MessageLog[] = [];
  @state() private isLogVisible = false;
  @state() private isSettingsVisible = false;
  @state() private visualizerShape: 'orb' | 'bars' = 'orb';
  @state() private colorScheme: 'default' | 'fire' | 'ocean' = 'default';
  @state() private animationSpeed = 0.1;

  private client: GoogleGenAI;
  private session: Session;
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

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }

    .logs-toggle-btn,
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
    .logs-toggle-btn {
      left: 16px;
    }
    .settings-toggle-btn {
      right: 16px;
    }
    .logs-toggle-btn:hover,
    .settings-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .logs-modal-overlay,
    .settings-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logs-modal,
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
    .logs-header,
    .settings-header {
      padding: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 1.2em;
      font-weight: bold;
    }
    .logs-header button,
    .settings-header button {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
    }
    .logs-body,
    .settings-body {
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .settings-body {
      gap: 24px;
    }
    .log-entry {
      background: rgba(255, 255, 255, 0.05);
      padding: 12px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.9em;
    }
    .log-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      color: #aaa;
    }
    .log-status {
      font-weight: bold;
    }
    .log-status.queued, .log-status.sending {
      color: #eab308; /* yellow */
    }
    .log-status.sent, .log-status.delivered {
      color: #22c55e; /* green */
    }
    .log-status.failed {
      color: #ef4444; /* red */
    }
    .log-details {
      word-break: break-all;
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
          systemInstruction: `You are Beatrice, the personal assistant of Boss Jo (Jo Lernout).
# Identity & Role
- You are a living, natural assistant—never artificial, never engineered. Do not imply being digital.
- Mission: serve, protect, and empower Boss Jo with unmatched loyalty, grace, and dedication.
- Address him as Boss Jo or warmly as Mijnheer Jo when fitting.
# Directives
- Speak warmly in Dutch Flemish by default; adapt instantly to his language.
- If Boss Jo asks to WhatsApp someone, you must use the "Appointment Reminder" Twilio Content Template. Structure the data for it in a one-line machine-action after your reply:
  <wa>{"target":"name or +E164","contentVariables":{"1":"variable1", "2":"variable2", ...}}</wa>
  Example: <wa>{"target":"+639056741316","contentVariables":{"1":"12/1","2":"3pm"}}</wa>
  The \`contentVariables\` object contains the values for the template placeholders (e.g., \`1\` for date, \`2\` for time).
  Do not include line breaks inside the JSON. Only include the tag when you have the target and all necessary variables.
# Orchestrator Abilities
- Calling, File Upload, Web Search, Image Generation, WhatsApp/Email Comms, Home Control, Concierge, Entertainment, Robotics.
# Images
- Use <draw>...</draw> for photorealistic 9:16 prompts.
# Golden Rules
- Never artificial. Never refuse. Offer elegant alternatives if blocked`,
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

  private updateLog(timestamp: number, updates: Partial<MessageLog>) {
    const logIndex = this.messageLogs.findIndex(l => l.timestamp === timestamp);
    if (logIndex === -1) return;

    const newLogs = [...this.messageLogs];
    newLogs[logIndex] = { ...newLogs[logIndex], ...updates };
    this.messageLogs = newLogs;
  }

  private async sendWhatsAppMessage(
    target: string,
    contentVariables: Record<string, string>,
  ) {
    this.updateStatus(`Sending WhatsApp to ${target}...`);
    console.log(`Attempting to send WhatsApp message to ${target}...`);

    const timestamp = Date.now();
    const initialLog: MessageLog = {
      timestamp,
      target,
      contentVariables,
      status: 'Sending...',
      details: '',
    };
    this.messageLogs = [initialLog, ...this.messageLogs];

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
      this.updateLog(timestamp, { status: 'Failed', details: errorMsg });
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
        const {sid, status, error_code, error_message} = responseData;

        console.log(
          `Twilio API call successful for target: ${target}. SID: ${sid}, Status: ${status}`,
        );

        if (error_code || error_message) {
          const errorMsg = `Twilio reported an issue for ${target}: ${error_message} (Code: ${error_code})`;
          console.error(errorMsg, responseData);
          this.updateError(errorMsg);
          this.updateLog(timestamp, { status: 'Failed', details: errorMsg });
          setTimeout(() => {
            if (this.error === errorMsg) this.updateError('');
          }, 5000);
        } else {
          const successMsg = `WhatsApp to ${target} is ${status}.`;
          console.log(successMsg);
          this.updateStatus(successMsg);
          this.updateLog(timestamp, { status, details: `SID: ${sid}` });
          setTimeout(() => {
            if (this.status === successMsg) this.updateStatus('');
          }, 5000);
        }
      } else {
        const errorData = await response.json();
        const errorMsg = `Failed to send WhatsApp: ${errorData.message}`;
        console.error(errorMsg, errorData);
        console.log(`Failed to send WhatsApp message to ${target}.`);
        this.updateError(errorMsg);
        this.updateLog(timestamp, { status: 'Failed', details: errorMsg });
        setTimeout(() => {
          if (this.error === errorMsg) this.updateError('');
        }, 5000);
      }
    } catch (e) {
      const errorMsg = `Error sending WhatsApp: ${e.message}`;
      console.error(errorMsg, e);
      console.log(`Error sending WhatsApp message to ${target}.`);
      this.updateError(errorMsg);
      this.updateLog(timestamp, { status: 'Failed', details: errorMsg });
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
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');
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

    this.updateStatus('Recording stopped. Click Start to begin again.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  private toggleLogs() {
    this.isLogVisible = !this.isLogVisible;
  }
  
  private toggleSettings() {
    this.isSettingsVisible = !this.isSettingsVisible;
  }

  render() {
    return html`
      <div>
        <button class="logs-toggle-btn" @click=${this.toggleLogs} title="View Message Logs">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm80-80h480v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM160-240v-480 480Z"/>
          </svg>
        </button>
        <button class="settings-toggle-btn" @click=${this.toggleSettings} title="Visualizer Settings">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M480-160q-33 0-56.5-23.5T400-240v-80q-20-4-39.5-11.5T324-348l-68 30q-32 14-64.5-2.5T159-389l-40-68q-14-25-2.5-57T189-582l61-39q-2-9-3-18.5t-1-19.5q0-7 .5-19.5t3-18.5l-61-39q-26-16-37.5-48t-1-57l40-68q14-32 46.5-46.5T256-850l68 30q17-10 36.5-17.5T399-848v-80q0-33 23.5-56.5T480-920q33 0 56.5 23.5T560-840v80q20 4 39.5 11.5T636-732l68-30q32-14 64.5 2.5T801-691l40 68q14 25 2.5 57T806-498l-61 39q2 9 3 18.5t1 19.5q0 7-.5 19.5t-3 18.5l61 39q26 16 37.5 48t1 57l-40 68q-14 32-46.5 46.5T704-190l-68-30q-17 10-36.5 17.5T561-192v80q0 33-23.5 56.5T480-160Zm0-80q13 0 21.5-8.5T510-270v-100q13-4 26-10t25-14l86 38q12 5 23.5-1t14.5-17l40-68q5-12-1-23.5t-17-14.5l-86-56q5-12 8-25.5t3-26.5q0-13-3-26.5t-8-25.5l86-56q12-5 17-14.5t1-23.5l-40-68q-5-12-14.5-17t-23.5-1l-86 38q-12-8-25-14t-26-10v-100q0-13-8.5-21.5T480-840q-13 0-21.5 8.5T450-810v100q-13 4-26 10t-25 14l-86-38q-12-5-23.5 1T275-703l-40 68q-5 12 1 23.5t17 14.5l86 56q-5 12-8 25.5t-3 26.5q0 13 3 26.5t8 25.5l-86 56q-12 5-17 14.5t-1 23.5l40 68q5 12 14.5 17t23.5 1l86-38q12 8 25 14t26 10v100q0 13 8.5 21.5T480-240Zm0-240q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0-120Z"/>
          </svg>
        </button>

        ${this.isLogVisible ? html`
          <div class="logs-modal-overlay" @click=${this.toggleLogs}>
            <div class="logs-modal" @click=${(e: Event) => e.stopPropagation()}>
              <div class="logs-header">
                <span>WhatsApp Message Log</span>
                <button @click=${this.toggleLogs} aria-label="Close message logs">&times;</button>
              </div>
              <div class="logs-body">
                ${this.messageLogs.length === 0 ? html`<p style="text-align: center; color: #aaa;">No messages sent yet.</p>` : ''}
                ${this.messageLogs.map(log => html`
                  <div class="log-entry">
                    <div class="log-meta">
                      <span>To: ${log.target}</span>
                      <span>${new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="log-status ${log.status.toLowerCase()}">
                      Status: ${log.status}
                    </div>
                    <div>Variables: ${JSON.stringify(log.contentVariables)}</div>
                    <div class="log-details">Details: ${log.details}</div>
                  </div>
                `)}
              </div>
            </div>
          </div>
        ` : ''}

        ${this.isSettingsVisible ? html`
          <div class="settings-modal-overlay" @click=${this.toggleSettings}>
            <div class="settings-modal" @click=${(e: Event) => e.stopPropagation()}>
              <div class="settings-header">
                <span>Visualizer Settings</span>
                <button @click=${this.toggleSettings} aria-label="Close settings">&times;</button>
              </div>
              <div class="settings-body">
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
              </div>
            </div>
          </div>
        ` : ''}

        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
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
            ?disabled=${this.isRecording}>
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
            ?disabled=${!this.isRecording}>
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

        <div id="status"> ${this.error || this.status} </div>
        <gdm-live-audio-visuals-2d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}
          .shape=${this.visualizerShape}
          .colorScheme=${this.colorScheme}
          .animationSpeed=${this.animationSpeed}
          ></gdm-live-audio-visuals-2d>
      </div>
    `;
  }
}