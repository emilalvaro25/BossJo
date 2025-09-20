/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

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

    .logs-toggle-btn {
      position: absolute;
      top: 16px;
      left: 16px;
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
    .logs-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    .logs-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logs-modal {
      background: #10141f;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      width: min(90vw, 600px);
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      color: white;
    }
    .logs-header {
      padding: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 1.2em;
      font-weight: bold;
    }
    .logs-header button {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
    }
    .logs-body {
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
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

  render() {
    return html`
      <div>
        <button class="logs-toggle-btn" @click=${this.toggleLogs} title="View Message Logs">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm80-80h480v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM160-240v-480 480Z"/>
          </svg>
        </button>
        
        ${this.isLogVisible ? html`
          <div class="logs-modal-overlay" @click=${this.toggleLogs}>
            <div class="logs-modal" @click=${(e: Event) => e.stopPropagation()}>
              <div class="logs-header">
                <span>WhatsApp Message Log</span>
                <button @click=${this.toggleLogs}>&times;</button>
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
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
