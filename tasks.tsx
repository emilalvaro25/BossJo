/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {map} from 'lit/directives/map.js';

interface Task {
  id: number;
  title: string;
  description: string;
  dueDate: string;
}

@customElement('gdm-tasks')
export class GdmTasks extends LitElement {
  @state() private tasks: Task[] = [];
  @state() private isModalOpen = false;
  @state() private currentTask: Partial<Task> | null = null;

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
    .tasks-container {
      flex-grow: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .task-item {
      background-color: #22223b;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-left: 4px solid #4a4e69;
    }
    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .task-title {
      font-weight: bold;
      font-size: 1.1em;
      word-break: break-word;
    }
    .task-actions button {
      background: none;
      border: none;
      color: #9a8c98;
      cursor: pointer;
      padding: 4px;
    }
    .task-actions button:hover {
      color: white;
    }
    .task-description {
      color: #c9c4d4;
      font-size: 0.95em;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .task-footer {
      font-size: 0.8em;
      color: #9a8c98;
      text-align: right;
    }
    .no-tasks {
      text-align: center;
      color: #9a8c98;
      margin-top: 40px;
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
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .form-group label {
      color: #c9c4d4;
      font-size: 0.9em;
    }
    .form-group input,
    .form-group textarea {
      background-color: #2a2831;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 10px;
      color: white;
      font-size: 1em;
      font-family: inherit;
    }
    .form-group textarea {
      resize: vertical;
      min-height: 80px;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 8px;
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
    .modal-actions .save-btn:disabled {
        background-color: #333;
        cursor: not-allowed;
    }
    .modal-actions .cancel-btn {
      background-color: transparent;
      color: #ccc;
    }
  `;

  constructor() {
    super();
    this.loadTasks();
  }

  private loadTasks() {
    const storedTasks = localStorage.getItem('gdm-tasks');
    if (storedTasks) {
      this.tasks = JSON.parse(storedTasks);
    }
  }

  private saveTasks() {
    localStorage.setItem('gdm-tasks', JSON.stringify(this.tasks));
  }

  private openModal(task: Task | null = null) {
    this.currentTask = task ? {...task} : { title: '', description: '', dueDate: '' };
    this.isModalOpen = true;
  }

  private closeModal() {
    this.isModalOpen = false;
    this.currentTask = null;
  }

  private handleTaskSubmit(e: Event) {
    e.preventDefault();
    if (!this.currentTask || !this.currentTask.title || !this.currentTask.dueDate) return;

    if (this.currentTask && 'id' in this.currentTask) {
      this.tasks = this.tasks.map(t =>
        t.id === this.currentTask!.id ? { ...this.currentTask as Task } : t
      );
    } else {
      const newTask: Task = {
        id: Date.now(),
        title: this.currentTask.title,
        description: this.currentTask.description || '',
        dueDate: this.currentTask.dueDate,
      };
      this.tasks = [...this.tasks, newTask].sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }
    
    this.saveTasks();
    this.closeModal();
  }
  
  private deleteTask(taskId: number) {
    if (confirm('Are you sure you want to delete this task?')) {
      this.tasks = this.tasks.filter(t => t.id !== taskId);
      this.saveTasks();
    }
  }

  private handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (this.currentTask) {
      this.currentTask = { ...this.currentTask, [target.name]: target.value };
    }
  }

  render() {
    return html`
      <div class="header">
        <a href="/" class="icon-btn" aria-label="Back to visualizer">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M400-80 0-480l400-400 56 57-343 343 343 343-56 57Z"/>
          </svg>
        </a>
        <h1>Task Manager</h1>
        <button class="icon-btn" @click=${() => this.openModal()} aria-label="Add new task">
          <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">
            <path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>
          </svg>
        </button>
      </div>

      <div class="tasks-container">
        ${this.tasks.length === 0
          ? html`<div class="no-tasks">No tasks yet. Add one to get started!</div>`
          : map(this.tasks, (task) => html`
              <div class="task-item">
                <div class="task-header">
                  <span class="task-title">${task.title}</span>
                  <div class="task-actions">
                    <button @click=${() => this.openModal(task)} aria-label="Edit task">
                      <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>
                    </button>
                    <button @click=${() => this.deleteTask(task.id)} aria-label="Delete task">
                      <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
                    </button>
                  </div>
                </div>
                ${task.description ? html`<p class="task-description">${task.description}</p>` : ''}
                <div class="task-footer">Due: ${task.dueDate}</div>
              </div>
            `)
        }
      </div>

      ${this.isModalOpen ? html`
        <div class="modal-overlay" @click=${this.closeModal}>
          <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
            <h2>${this.currentTask && 'id' in this.currentTask ? 'Edit Task' : 'Add Task'}</h2>
            <form @submit=${this.handleTaskSubmit}>
              <div class="form-group">
                <label for="title">Title</label>
                <input id="title" name="title" type="text" .value=${this.currentTask?.title || ''} @input=${this.handleInputChange} required>
              </div>
              <div class="form-group">
                <label for="description">Description</label>
                <textarea id="description" name="description" .value=${this.currentTask?.description || ''} @input=${this.handleInputChange}></textarea>
              </div>
              <div class="form-group">
                <label for="dueDate">Due Date</label>
                <input id="dueDate" name="dueDate" type="date" .value=${this.currentTask?.dueDate || ''} @input=${this.handleInputChange} required>
              </div>
              <div class="modal-actions">
                <button type="button" class="cancel-btn" @click=${this.closeModal}>Cancel</button>
                <button type="submit" class="save-btn" ?disabled=${!this.currentTask?.title || !this.currentTask?.dueDate}>Save</button>
              </div>
            </form>
          </div>
        </div>
      ` : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-tasks': GdmTasks;
  }
}
