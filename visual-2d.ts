/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

@customElement('gdm-live-audio-visuals-2d')
export class GdmLiveAudioVisuals2D extends LitElement {
  private inputAnalyser: Analyser;
  private outputAnalyser: Analyser;

  private _outputNode: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  @property({type: String}) shape: 'orb' | 'bars' = 'orb';
  @property({type: String}) colorScheme: 'default' | 'fire' | 'ocean' = 'default';
  @property({type: Number}) animationSpeed = 0.1;

  private canvas: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D;
  private lastInputAvg = 0;
  private lastOutputAvg = 0;
  private animationFrame = 0;
  private lastBarHeights: { input: number[], output: number[] } = { input: [], output: [] };

  private colorPalettes = {
    default: {
      aura: 'rgba(74, 144, 226, ${alpha})',
      orb: ['#58C3FF', '#005D9A'],
      core: [
          'rgba(255, 255, 255, ${alpha})',
          'rgba(255, 182, 193, ${alpha})',
          'rgba(209, 107, 165, 0)'
      ],
      inputBars: ['#D16BA5', '#E78686', '#FB5F5F'],
      outputBars: ['#3b82f6', '#10b981', '#ef4444'],
    },
    fire: {
      aura: 'rgba(255, 165, 0, ${alpha})',
      orb: ['#FFA500', '#FF4500'],
      core: [
        'rgba(255, 255, 255, ${alpha})',
        'rgba(255, 215, 0, ${alpha})',
        'rgba(255, 69, 0, 0)'
      ],
      inputBars: ['#FF4500', '#FF6347', '#FF7F50'],
      outputBars: ['#FFA500', '#FFD700', '#FFFF00'],
    },
    ocean: {
      aura: 'rgba(0, 191, 255, ${alpha})',
      orb: ['#00BFFF', '#1E90FF'],
      core: [
        'rgba(255, 255, 255, ${alpha})',
        'rgba(173, 216, 230, ${alpha})',
        'rgba(0, 255, 255, 0)'
      ],
      inputBars: ['#20B2AA', '#00CED1', '#48D1CC'],
      outputBars: ['#00BFFF', '#1E90FF', '#4169E1'],
    },
  };

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: -1;
    }
    canvas {
      width: 100%;
      height: 100%;
      position: absolute;
      inset: 0;
      background-color: #100c14;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => this.visualize());
  }
  
  private lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  private getAverage(data: Uint8Array) {
    if (!data || data.length === 0) {
      return 0;
    }
    return data.reduce((acc, v) => acc + v, 0) / data.length;
  }

  private visualize() {
    requestAnimationFrame(() => this.visualize());
    if (!this.canvas || !this.inputAnalyser || !this.outputAnalyser) {
      return;
    }

    this.animationFrame++;

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    switch(this.shape) {
      case 'orb':
        this.visualizeOrb();
        break;
      case 'bars':
        this.visualizeBars();
        break;
    }
  }

  private visualizeOrb() {
    const canvasCtx = this.canvasCtx;
    const WIDTH = this.canvas.width;
    const HEIGHT = this.canvas.height;
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const palette = this.colorPalettes[this.colorScheme];

    const currentInputAvg = this.getAverage(this.inputAnalyser.data);
    const currentOutputAvg = this.getAverage(this.outputAnalyser.data);
    
    // Smooth the values for a more fluid animation
    this.lastInputAvg = this.lerp(this.lastInputAvg, currentInputAvg, this.animationSpeed);
    this.lastOutputAvg = this.lerp(this.lastOutputAvg, currentOutputAvg, this.animationSpeed);
    
    const inputPower = this.lastInputAvg / 255;
    const outputPower = this.lastOutputAvg / 255;

    // Clear canvas
    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    
    // Add a subtle pulse based on animationFrame and animationSpeed
    const overallPower = (inputPower + outputPower) / 2;
    const pulseSpeed = 0.01 + (this.animationSpeed * 0.03);
    const pulseMagnitude = 1 + (overallPower * 2);
    const pulse = Math.sin(this.animationFrame * pulseSpeed) * pulseMagnitude;

    const baseRadius = Math.min(WIDTH, HEIGHT) / 6 + pulse;

    // Outer aura (output)
    const auraRadius = baseRadius + outputPower * baseRadius * 2.5;
    const auraGradient = canvasCtx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, auraRadius
    );
    const auraAlpha = 0.1 + outputPower * 0.3;
    auraGradient.addColorStop(0.2, palette.aura.replace('${alpha}', String(auraAlpha)));
    auraGradient.addColorStop(1, palette.aura.replace('${alpha}', '0'));
    
    canvasCtx.fillStyle = auraGradient;
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, auraRadius, 0, 2 * Math.PI);
    canvasCtx.fill();

    // Main orb (output)
    const orbRadius = baseRadius + outputPower * baseRadius * 0.5;
    const orbGradient = canvasCtx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, orbRadius
    );
    orbGradient.addColorStop(0, palette.orb[0]);
    orbGradient.addColorStop(1, palette.orb[1]);
    
    canvasCtx.fillStyle = orbGradient;
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, orbRadius, 0, 2 * Math.PI);
    canvasCtx.fill();
    
    // Inner core (input)
    const coreRadius = orbRadius * 0.4 + inputPower * orbRadius * 0.5;
    
    // Add subtle rotation to the core
    canvasCtx.save();
    canvasCtx.translate(centerX, centerY);
    const rotationSpeed = (inputPower * 0.005) + 0.0005;
    const rotation = this.animationFrame * rotationSpeed * (this.animationSpeed * 10);
    canvasCtx.rotate(rotation);
    canvasCtx.translate(-centerX, -centerY);

    const coreGradient = canvasCtx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, coreRadius
    );
    const coreAlpha = 0.5 + inputPower * 0.5;
    coreGradient.addColorStop(0, palette.core[0].replace('${alpha}', String(coreAlpha)));
    coreGradient.addColorStop(0.5, palette.core[1].replace('${alpha}', String(coreAlpha)));
    coreGradient.addColorStop(1, palette.core[2]);
    
    canvasCtx.fillStyle = coreGradient;
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, coreRadius, 0, 2 * Math.PI);
    canvasCtx.fill();

    canvasCtx.restore();
  }

  private visualizeBars() {
    const canvasCtx = this.canvasCtx;
    const WIDTH = this.canvas.width;
    const HEIGHT = this.canvas.height;
    const palette = this.colorPalettes[this.colorScheme];

    // Replace clearRect with a semi-transparent fill for a fading/trail effect
    canvasCtx.globalCompositeOperation = 'source-over'; 
    // Slower animation speed creates longer trails (less transparent fill)
    const trailAmount = Math.max(0.05, 0.4 - this.animationSpeed);
    canvasCtx.fillStyle = `rgba(16, 12, 20, ${trailAmount})`;
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    const inputData = this.inputAnalyser.data;
    const outputData = this.outputAnalyser.data;
    const bufferLength = inputData.length;

    // Initialize lastBarHeights if necessary
    if (this.lastBarHeights.input.length !== bufferLength) {
        this.lastBarHeights.input = new Array(bufferLength).fill(0);
        this.lastBarHeights.output = new Array(bufferLength).fill(0);
    }

    const barWidth = WIDTH / bufferLength;
    let x = 0;

    const inputGradient = canvasCtx.createLinearGradient(0, 0, 0, HEIGHT);
    inputGradient.addColorStop(1, palette.inputBars[0]);
    inputGradient.addColorStop(0.5, palette.inputBars[1]);
    inputGradient.addColorStop(0, palette.inputBars[2]);
    canvasCtx.fillStyle = inputGradient;
    
    // Use lerp for smooth bar height transitions
    const lerpFactor = Math.min(1, this.animationSpeed * 2.5);

    for (let i = 0; i < bufferLength; i++) {
        const currentBarHeight = (inputData[i] / 255) * HEIGHT;
        const smoothedHeight = this.lerp(this.lastBarHeights.input[i], currentBarHeight, lerpFactor);
        canvasCtx.fillRect(x, HEIGHT - smoothedHeight, barWidth, smoothedHeight);
        this.lastBarHeights.input[i] = smoothedHeight;
        x += barWidth;
    }

    canvasCtx.globalCompositeOperation = 'lighter';

    const outputGradient = canvasCtx.createLinearGradient(0, 0, 0, HEIGHT);
    outputGradient.addColorStop(1, palette.outputBars[0]);
    outputGradient.addColorStop(0.5, palette.outputBars[1]);
    outputGradient.addColorStop(0, palette.outputBars[2]);
    canvasCtx.fillStyle = outputGradient;

    x = 0;
    for (let i = 0; i < outputData.length; i++) {
        const currentBarHeight = (outputData[i] / 255) * HEIGHT;
        const smoothedHeight = this.lerp(this.lastBarHeights.output[i], currentBarHeight, lerpFactor);
        canvasCtx.fillRect(x, HEIGHT - smoothedHeight, barWidth, smoothedHeight);
        this.lastBarHeights.output[i] = smoothedHeight;
        x += barWidth;
    }
  }

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas');
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
  }

  private handleResize() {
    const rect = this.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvasCtx = this.canvas.getContext('2d');
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-2d': GdmLiveAudioVisuals2D;
  }
}
