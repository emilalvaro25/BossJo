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

    // Smooth out the audio power values
    const currentInputAvg = this.getAverage(this.inputAnalyser.data);
    const currentOutputAvg = this.getAverage(this.outputAnalyser.data);
    
    this.lastInputAvg = this.lerp(this.lastInputAvg, currentInputAvg, this.animationSpeed);
    this.lastOutputAvg = this.lerp(this.lastOutputAvg, currentOutputAvg, this.animationSpeed);
    
    const inputPower = this.lastInputAvg / 255;
    const outputPower = this.lastOutputAvg / 255;

    // Clear canvas
    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    
    // Define a fixed radius for the orb's circumference
    const orbRadius = Math.min(WIDTH, HEIGHT) / 4.5;

    // --- Main Orb Background ---
    const orbGradient = canvasCtx.createRadialGradient(
      centerX, centerY, orbRadius * 0.5,
      centerX, centerY, orbRadius
    );
    orbGradient.addColorStop(0, palette.orb[0]);
    orbGradient.addColorStop(1, palette.orb[1]);
    
    canvasCtx.fillStyle = orbGradient;
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, orbRadius, 0, 2 * Math.PI);
    canvasCtx.fill();

    // --- Internal Animation (reacts to output/assistant) ---
    canvasCtx.save();
    // Clip all subsequent drawing to within the orb's circumference
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, orbRadius, 0, 2 * Math.PI);
    canvasCtx.clip();

    // Draw internal energy waves
    const numWaves = 5;
    const waveBaseOpacity = 0.1;
    const waveOpacityRange = 0.4;

    for (let i = 0; i < numWaves; i++) {
        canvasCtx.beginPath();
        const waveProgress = (i + 1) / numWaves;
        const waveSpeed = this.animationFrame * (0.005 + waveProgress * 0.005);
        
        const yOffset = Math.sin(waveSpeed + i) * orbRadius * 0.2;
        const waveAmplitude = orbRadius * 0.5 * outputPower;
        const waveStart = centerY - orbRadius + (waveProgress * orbRadius * 2) + yOffset;
        
        const waveGradient = canvasCtx.createLinearGradient(centerX - orbRadius, 0, centerX + orbRadius, 0);
        waveGradient.addColorStop(0, 'transparent');
        waveGradient.addColorStop(0.5, palette.core[0].replace('${alpha}', String(waveBaseOpacity + outputPower * waveOpacityRange)));
        waveGradient.addColorStop(1, 'transparent');
        
        canvasCtx.strokeStyle = waveGradient;
        canvasCtx.lineWidth = 1 + waveAmplitude;
        
        canvasCtx.moveTo(centerX - orbRadius, waveStart);
        canvasCtx.bezierCurveTo(
            centerX - orbRadius * 0.3, waveStart - waveAmplitude,
            centerX + orbRadius * 0.3, waveStart + waveAmplitude,
            centerX + orbRadius, waveStart
        );
        canvasCtx.stroke();
    }
    canvasCtx.restore(); // End clipping

    // --- Core Animation (reacts to input/user) ---
    const coreRadius = orbRadius * 0.2 + inputPower * orbRadius * 0.6;
    
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
    const coreAlpha = 0.6 + inputPower * 0.4;
    coreGradient.addColorStop(0, palette.core[0].replace('${alpha}', String(coreAlpha)));
    coreGradient.addColorStop(0.5, palette.core[1].replace('${alpha}', String(coreAlpha * 0.8)));
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

    canvasCtx.globalCompositeOperation = 'source-over'; 
    const trailAmount = Math.max(0.05, 0.4 - this.animationSpeed);
    canvasCtx.fillStyle = `rgba(16, 12, 20, ${trailAmount})`;
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    const inputData = this.inputAnalyser.data;
    const outputData = this.outputAnalyser.data;
    const bufferLength = inputData.length;

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
