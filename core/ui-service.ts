// core/ui-service.ts
// Interface-first contract for UI-related operations.

import { Prompt, Context } from './types';
import { IAccessibilityService, AccessibilityService } from './accessibility-service';
import { IBrainButtonService, BrainButtonService } from './brain-button-service';
import { IAIEnhanceService } from './ai-service';
import { EnhancedPromptResult } from './ai-config';
import * as EditorAdapter from './editor-adapter';

/**
 * Describes the data returned when a user successfully saves a prompt via the UI.
 */
export interface SavePromptUIResult {
  name: string;
  description: string;
  template: string; // The actual prompt text
}

/**
 * Describes the data returned when a user successfully saves a context via the UI.
 */
export interface SaveContextUIResult {
  name: string;
  text: string; // The actual context text
}

/**
 * The contract for a decoupled UI service.
 * This service is responsible for all direct DOM manipulation and user interaction
 * for the extension's UI components (modals, toasts, etc.).
 * It acts as a "brick" that can be tested in isolation and communicates
 * with the rest of the application via promises and callbacks.
 */
export interface IUIService {
  // === Core Text Area Interaction ===

  /**
   * Attaches a listener to the main text area for input events.
   * @param callback The function to call when the user types.
   */
  onTextAreaInput(callback: (text: string) => void): void;

  /**
   * Gets the current text content from the text area.
   * @returns The text content.
   */
  getTextAreaValue(): string;

  /**
   * Sets the text content of the text area.
   * @param text The new text to set.
   */
  setTextAreaValue(text: string): void;

  // === Prompt-related UI ===

  /**
   * Displays the prompt selector UI near the text area.
   * @param prompts The list of prompts to display.
   * @param onSelect The callback to execute when a user selects a prompt.
   * @param onDelete Optional callback to execute when a user deletes a prompt.
   */
  showPromptSelector(prompts: Prompt[], onSelect: (selectedPrompt: Prompt) => void, onDelete?: (prompt: Prompt) => void): void;

  /**
   * Hides the prompt selector UI.
   */
  hidePromptSelector(): void;

  /**
   * Displays a modal dialog for saving a new prompt.
   * @param prefillText The text currently in the user's input box, to be used as the prompt's template.
   * @returns A promise that resolves with the completed prompt details if the user saves,
   * or resolves with `null` if the user cancels.
   */
  showSavePromptModal(prefillText: string): Promise<SavePromptUIResult | null>;

  /**
   * Shows a short-lived notification toast on the screen.
   * @param message The text to display.
   */
  showSuccessToast(message: string): void;

  /**
   * Displays a confirmation modal for deleting a prompt or context.
   * @param itemName The name of the item to delete.
   * @param itemType Either 'prompt' or 'context' to customize the message.
   * @returns A promise that resolves to true if the user confirms deletion, false if cancelled.
   */
  showDeleteConfirmationModal(itemName: string, itemType: 'prompt' | 'context'): Promise<boolean>;

  // === Context-related UI ===

  /**
   * Displays the context selector UI near the text area.
   * @param contexts The list of contexts to display.
   * @param onSelect The callback to execute when a user selects a context.
   * @param onDelete Optional callback to execute when a user deletes a context.
   */
  showContextSelector(contexts: Context[], onSelect: (selectedContext: Context) => void, onDelete?: (context: Context) => void): void;

  /**
   * Hides the context selector UI.
   */
  hideContextSelector(): void;

  /**
   * Displays a modal dialog for saving a new context.
   * @param prefillText The text currently selected, to be used as the context's text.
   * @returns A promise that resolves with the completed context details if the user saves,
   * or resolves with `null` if the user cancels.
   */
  showSaveContextModal(prefillText: string): Promise<SaveContextUIResult | null>;

  /**
   * Shows the brain button near selected text.
   * @param position The position to show the brain button.
   * @param onSave The callback to execute when the brain button is clicked.
   */
  showBrainButton(position: { x: number; y: number }, onSave: () => void): void;

  /**
   * Hides the brain button.
   */
  hideBrainButton(): void;

  // === AI Enhancement UI ===

  /**
   * Shows the enhance button near the text area.
   * @param onEnhance The callback to execute when the enhance button is clicked.
   */
  showEnhanceButton(onEnhance: () => void): void;

  /**
   * Hides the enhance button.
   */
  hideEnhanceButton(): void;

  /**
   * Shows a loading state for AI enhancement.
   * @param message Optional loading message.
   */
  showEnhanceLoading(message?: string): void;

  /**
   * Hides the loading state for AI enhancement.
   */
  hideEnhanceLoading(): void;

  /**
   * Shows the enhanced prompt result.
   * @param result The enhanced prompt result.
   * @param onAccept The callback to execute when user accepts the enhancement.
   * @param onReject The callback to execute when user rejects the enhancement.
   */
  showEnhanceResult(result: EnhancedPromptResult, onAccept: () => void, onReject: () => void): void;

  /**
   * Hides the enhanced prompt result.
   */
  hideEnhanceResult(): void;

  /**
   * Shows an error message for AI enhancement.
   * @param error The error message to display.
   */
  showEnhanceError(error: string): void;
}

export class UIService implements IUIService {
  private editableEl: (HTMLElement & { innerText: string }) | null = null;
  private isComposing: boolean = false;
  private accessibilityService: IAccessibilityService;
  private brainButtonService: IBrainButtonService;
  private enhanceButton: HTMLButtonElement | null = null;
  private enhanceLoadingOverlay: HTMLDivElement | null = null;
  private enhanceResultModal: HTMLDivElement | null = null;
  private readonly TEXTAREA_SELECTORS = [
    'textarea',
    'input[type="text"]',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"][aria-multiline="true"]',
    '[contenteditable="true"]',
  ];

  constructor(accessibilityService?: IAccessibilityService, brainButtonService?: IBrainButtonService) {
    this.accessibilityService = accessibilityService || new AccessibilityService();
    this.brainButtonService = brainButtonService || new BrainButtonService();
    this.findEditable();
    // Dev log: report which editable was found
    try {
      const tag = this.editableEl ? (this.editableEl.tagName || '').toUpperCase() : 'NONE';
      console.log('UIService (dev): editable detected ->', tag, this.editableEl);
    } catch (e) {
      console.log('UIService (dev): error while logging editable', e);
    }
    if (!this.editableEl) {
      console.warn('UIService: Editable input not found on init; observing DOM.');
      const mo = new MutationObserver(() => {
        if (this.findEditable()) {
          console.log('UIService: Found editable input via MutationObserver.');
          // Dev log: report which editable was found by MutationObserver
          try {
            const tag = this.editableEl ? (this.editableEl.tagName || '').toUpperCase() : 'NONE';
            console.log('UIService (dev): editable found via MO ->', tag, this.editableEl);
          } catch (e) {
            console.log('UIService (dev): error while logging editable via MO', e);
          }
          mo.disconnect();
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }

    // Track IME composition state so we don't trigger while composing
    document.addEventListener('compositionstart', () => { this.isComposing = true; }, true);
    document.addEventListener('compositionend', () => { this.isComposing = false; }, true);
  }

  // === Private DOM Helpers ===

  private findEditable(): boolean {
    for (const sel of this.TEXTAREA_SELECTORS) {
      const el = document.querySelector(sel) as (HTMLElement & { innerText: string }) | null;
      if (el) {
        this.editableEl = el;
        return true;
      }
    }
    return false;
  }

  private createOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    // Use fixed positioning so overlays aren't clipped by container stacking contexts
    overlay.style.position = 'fixed';
    overlay.style.background = '#1a1a1a';
    overlay.style.color = 'white'; // Added for dark theme text visibility
    overlay.style.border = '1px solid #000000ff';
    overlay.style.padding = '8px';
    overlay.style.zIndex = '999999';
    overlay.style.maxHeight = '200px';
    overlay.style.overflow = 'auto';
    overlay.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.45)';
    overlay.style.borderRadius = '8px';
    overlay.id = 'spine-prompt-overlay'; // Use a constant for the ID
    return overlay;
  }

  // === IUIService Implementation ===

  onTextAreaInput(callback: (text: string) => void): void {
    const attachToElement = (el: HTMLElement | null) => {
      if (!el) return;
      try {
        el.addEventListener('input', () => {
          try {
            callback(this.getTextAreaValue());
          } catch (e) {
            console.warn('UIService: error in onTextAreaInput callback', e);
          }
        });
      } catch (e) {
        // ignore
      }
    };

    if (!this.editableEl) {
      // If the element isn't found immediately, wait for the mutation observer.
      const mo = new MutationObserver(() => {
        if (this.findEditable()) {
          attachToElement(this.editableEl as HTMLElement);
          mo.disconnect();
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } else {
      attachToElement(this.editableEl as HTMLElement);
    }

    // Fallback: delegated listener on document to handle dynamically replaced nodes
    // This ensures we still get input events if the editor node is swapped after initialization.
    const delegatedHandler = (e: Event) => {
      try {
        if (this.isComposing) return; // ignore input events during IME composition
        // Dev log
        try { console.log('UIService (dev): delegated input event from', (e.target as any)?.tagName || e.target); } catch (e) {}
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // If we already have an editableEl, only pass through events from it.
        if (this.editableEl && (target === this.editableEl || this.editableEl.contains(target))) {
          callback(this.getTextAreaValue());
          return;
        }

        // Otherwise, check if the event target matches one of our selectors
        for (const sel of this.TEXTAREA_SELECTORS) {
          try {
            if (target.matches && target.matches(sel)) {
              // Update editableEl reference so future direct listeners attach
              this.editableEl = target as (HTMLElement & { innerText: string });
              callback(this.getTextAreaValue());
              return;
            }
          } catch (err) {
            // ignore invalid selector match errors
          }
        }
      } catch (err) {
        // swallow errors to avoid breaking page
      }
    };

    document.addEventListener('input', delegatedHandler, true);
  }

  getTextAreaValue(): string {
    try {
      return EditorAdapter.getText(this.editableEl);
    } catch (e) {
      return this.editableEl ? (this.editableEl.innerText || '') : '';
    }
  }

  setTextAreaValue(text: string): void {
    try {
      EditorAdapter.setText(this.editableEl, text);
    } catch (e) {
      if (!this.editableEl) return;
      this.editableEl.innerText = text;
      try { this.editableEl.dispatchEvent(new InputEvent('input', { bubbles: true } as any)); } catch (e) {}
    }
  }

  showPromptSelector(prompts: Prompt[], onSelect: (selectedPrompt: Prompt) => void, onDelete?: (prompt: Prompt) => void): void {
    this.hidePromptSelector(); // Ensure no old selector exists

    // If editableEl hasn't been discovered yet (dynamic pages), fall back to the active element.
    if (!this.editableEl) {
      const fallback = document.activeElement as (HTMLElement & { innerText?: string }) | null;
      if (fallback && (fallback.tagName === 'TEXTAREA' || fallback.tagName === 'INPUT' || fallback.matches && (fallback.matches('[contenteditable]') || fallback.matches('textarea') || fallback.matches('input')))) {
        this.editableEl = fallback as (HTMLElement & { innerText: string });
        console.log('UIService (dev): falling back to activeElement as editableEl', this.editableEl);
      } else {
        console.warn('UIService: editable element not found and no suitable fallback; showing overlay positioned at top-right');
      }
    }

    const overlay = this.createOverlay();
    
    // Add accessibility attributes
    overlay.setAttribute('role', 'listbox');
    overlay.setAttribute('aria-label', 'Prompt selector');
    overlay.setAttribute('aria-expanded', 'true');

    if (prompts.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No prompts available.';
      empty.setAttribute('role', 'status');
      empty.setAttribute('aria-live', 'polite');
      overlay.appendChild(empty);
    }

    prompts.forEach((p, index) => {
      // Create container for prompt item (flex layout: name left, delete right)
      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'space-between';
      container.style.position = 'relative';
      container.style.margin = '4px 0';
      container.style.borderRadius = '4px';
      container.style.border = '1px solid transparent';
      container.style.cursor = 'pointer';
      
      // Create prompt button (left side - takes remaining space)
      const btn = document.createElement('button');
      btn.textContent = p.name;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-label', `${p.name}: ${p.description || 'No description'}`);
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', index === 0 ? '0' : '-1'); // First item is focusable
      
      // Enhanced styling for accessibility
      btn.style.display = 'flex';
      btn.style.flex = '1';
      btn.style.textAlign = 'left';
      btn.style.padding = '8px 12px';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.backgroundColor = 'transparent';
      btn.style.color = 'white';
      btn.style.cursor = 'pointer';
      btn.style.outline = 'none';
      
      // Create delete button (right side - initially hidden)
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '−';
      deleteBtn.setAttribute('aria-label', `Delete ${p.name}`);
      deleteBtn.setAttribute('title', 'Delete prompt');
      deleteBtn.style.position = 'absolute';
      deleteBtn.style.right = '4px';
      deleteBtn.style.width = '20px';
      deleteBtn.style.height = '20px';
      deleteBtn.style.display = 'flex';
      deleteBtn.style.alignItems = 'center';
      deleteBtn.style.justifyContent = 'center';
      deleteBtn.style.border = '1px solid #444';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.style.backgroundColor = 'transparent';
      deleteBtn.style.color = '#888';
      deleteBtn.style.fontSize = '14px';
      deleteBtn.style.fontWeight = 'bold';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.opacity = '0';
      deleteBtn.style.transition = 'opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease';
      deleteBtn.style.outline = 'none';
      deleteBtn.style.zIndex = '10';
      
      // Show delete button on hover
      container.addEventListener('mouseenter', () => {
        if (onDelete) {
          deleteBtn.style.opacity = '1';
        }
      });
      
      container.addEventListener('mouseleave', () => {
        deleteBtn.style.opacity = '0';
      });
      
      // Delete button hover styles
      deleteBtn.addEventListener('mouseenter', () => {
        deleteBtn.style.backgroundColor = '#2a2a2a';
        deleteBtn.style.borderColor = '#666';
        deleteBtn.style.color = '#ff4444';
      });
      
      deleteBtn.addEventListener('mouseleave', () => {
        deleteBtn.style.backgroundColor = 'transparent';
        deleteBtn.style.borderColor = '#444';
        deleteBtn.style.color = '#888';
      });
      
      // Delete button click handler
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (!onDelete) return;
        
        const confirmed = await this.showDeleteConfirmationModal(p.name, 'prompt');
        if (confirmed) {
          onDelete(p);
        }
      });
      
      // Focus styles for container
      btn.addEventListener('focus', () => {
        container.style.backgroundColor = '#333';
        container.style.borderColor = '#555';
        btn.setAttribute('aria-selected', 'true');
        // Remove selection from other items
        overlay.querySelectorAll('[role="option"]').forEach(otherBtn => {
          if (otherBtn !== btn) {
            otherBtn.setAttribute('aria-selected', 'false');
            const otherContainer = otherBtn.closest('div[style*="display: flex"]') as HTMLElement;
            if (otherContainer) {
              otherContainer.style.backgroundColor = 'transparent';
              otherContainer.style.borderColor = 'transparent';
            }
          }
        });
      });
      
      btn.addEventListener('blur', () => {
        container.style.backgroundColor = 'transparent';
        container.style.borderColor = 'transparent';
      });
      
      // Prompt selection click handler
      btn.addEventListener('click', () => {
        onSelect(p);
        this.hidePromptSelector();
      });
      
      // Append elements to container
      container.appendChild(btn);
      if (onDelete) {
        container.appendChild(deleteBtn);
      }
      overlay.appendChild(container);
    });

    // Position the overlay
  this.positionOverlay(overlay);

    // Append to documentElement to avoid clipping inside shadow DOMs or scrollable containers.
    try {
      document.documentElement.appendChild(overlay);
    } catch (e) {
      document.body.appendChild(overlay);
    }
    console.log('UIService (dev): prompt selector appended', overlay);

    // Set up accessibility service
    this.accessibilityService.storeCurrentFocus();
    this.accessibilityService.setupKeyboardNavigation(overlay);
    this.accessibilityService.handleEscapeKey(overlay, () => {
      this.hidePromptSelector();
    });

    // Handle resize and scroll
    this.accessibilityService.handleResize(overlay, () => {
      this.positionOverlay(overlay);
    });
    this.accessibilityService.handleScroll(overlay, () => {
      this.positionOverlay(overlay);
    });

    // Focus first item
    this.accessibilityService.focusFirstElement(overlay);

    // Announce to screen readers
    this.accessibilityService.announceToScreenReader({
      message: `Prompt selector opened with ${prompts.length} prompts. Use arrow keys to navigate, Enter to select, or Escape to close.`,
      priority: 'polite'
    });

    // Add click outside to close
    const onClick = (e: MouseEvent) => {
      if (e.target && overlay.contains(e.target as Node)) return; // Click was inside
      if (e.target !== this.editableEl) {
        this.hidePromptSelector();
        document.removeEventListener('click', onClick);
      }
    };
    document.addEventListener('click', onClick, { capture: true });
  }

  hidePromptSelector(): void {
    const existing = document.getElementById('spine-prompt-overlay');
    if (existing && existing.parentElement) {
      // Clean up accessibility service
      this.accessibilityService.cleanup(existing);
      
      // Restore focus
      this.accessibilityService.restoreFocus();
      
      // Remove from DOM
      existing.parentElement.removeChild(existing);
      
      // Announce to screen readers
      this.accessibilityService.announceToScreenReader({
        message: 'Prompt selector closed',
        priority: 'polite'
      });
    }
  }

  private positionOverlay(overlay: HTMLElement): void {
    if (!this.editableEl) return;

    const rect = this.editableEl.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    
    // Calculate position
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 6;
    
    // Check if overlay fits in viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Adjust horizontal position if needed
    if (left + overlayRect.width > viewportWidth) {
      left = viewportWidth - overlayRect.width - 10;
    }
    
    // Adjust vertical position if needed
    if (top + overlayRect.height > viewportHeight + window.scrollY) {
      top = rect.top + window.scrollY - overlayRect.height - 6;
    }
    
    // Ensure minimum margins
    left = Math.max(10, left);
    top = Math.max(10, top);
    
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
  }

  showSavePromptModal(prefillText: string): Promise<SavePromptUIResult | null> {
    const modalId = 'prompt-save-modal';
    if (document.getElementById(modalId)) {
      return Promise.resolve(null);
    }

    return new Promise<SavePromptUIResult | null>((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.id = modalId;
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      overlay.style.zIndex = '999999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      // Create modal content
      const modal = document.createElement('div');
      modal.style.backgroundColor = '#1a1a1a';
      modal.style.padding = '24px';
      modal.style.borderRadius = '8px';
      modal.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
      modal.style.minWidth = '400px';
      modal.style.maxWidth = '600px';
      modal.style.border = '1px solid #333';

      modal.innerHTML = `
        <h2 id="modal-title" style="margin: 0 0 16px 0; color: white;">Save Prompt</h2>
        <div style="margin-bottom: 16px;">
          <label for="prompt-name" style="display: block; margin-bottom: 4px; font-weight: 500; color: white;">Name:</label>
          <input type="text" id="prompt-name" aria-describedby="name-help" placeholder="Enter prompt name" required style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; font-size: 14px; background-color: #2a2a2a; color: white;">
          <div id="name-help" style="font-size: 12px; color: #ccc; margin-top: 4px;">A short, descriptive name for your prompt</div>
        </div>
        <div style="margin-bottom: 16px;">
          <label for="prompt-description" style="display: block; margin-bottom: 4px; font-weight: 500; color: white;">Description:</label>
          <input type="text" id="prompt-description" aria-describedby="description-help" placeholder="Enter description (optional)" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; font-size: 14px; background-color: #2a2a2a; color: white;">
          <div id="description-help" style="font-size: 12px; color: #ccc; margin-top: 4px;">Optional description to help you remember what this prompt does</div>
        </div>
        <div style="margin-bottom: 16px;">
          <label for="prompt-template" style="display: block; margin-bottom: 4px; font-weight: 500; color: white;">Template:</label>
          <textarea id="prompt-template" readonly aria-describedby="template-help" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; font-size: 14px; min-height: 80px; resize: vertical; background-color: #2a2a2a; color: white;">${prefillText}</textarea>
          <div id="template-help" style="font-size: 12px; color: #ccc; margin-top: 4px;">The prompt template that will be inserted when selected</div>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="cancel-btn" aria-describedby="cancel-help" style="padding: 8px 16px; border: 1px solid #555; background: #2a2a2a; color: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="save-btn" aria-describedby="save-help" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Save</button>
        </div>
        <div id="cancel-help" style="display: none;">Close the modal without saving</div>
        <div id="save-help" style="display: none;">Save the prompt and close the modal</div>
      `;

      // Add accessibility attributes to modal
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'modal-title');
      modal.setAttribute('aria-modal', 'true');
      overlay.setAttribute('role', 'presentation');

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Event handlers
      const cleanup = () => {
        // Clean up accessibility service
        this.accessibilityService.cleanup(modal);
        
        // Restore focus
        this.accessibilityService.restoreFocus();
        
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      };

      const handleSave = () => {
        const name = (modal.querySelector('#prompt-name') as HTMLInputElement).value.trim();
        const description = (modal.querySelector('#prompt-description') as HTMLInputElement).value.trim();
        
        if (!name) {
          // Announce validation error
          this.accessibilityService.announceToScreenReader({
            message: 'Please enter a name for the prompt',
            priority: 'assertive'
          });
          
          // Focus the name input and highlight it
          const nameInput = modal.querySelector('#prompt-name') as HTMLInputElement;
          nameInput.focus();
          nameInput.style.borderColor = '#dc3545';
          nameInput.style.borderWidth = '2px';
          
          // Clear the error styling after a delay
          setTimeout(() => {
            nameInput.style.borderColor = '#ddd';
            nameInput.style.borderWidth = '1px';
          }, 3000);
          
          return;
        }

        // Announce successful save
        this.accessibilityService.announceToScreenReader({
          message: `Prompt "${name}" saved successfully`,
          priority: 'polite'
        });

        cleanup();
        resolve({
          name,
          description,
          template: prefillText
        });
      };

      const handleCancel = () => {
        // Announce cancellation
        this.accessibilityService.announceToScreenReader({
          message: 'Save prompt cancelled',
          priority: 'polite'
        });

        cleanup();
        resolve(null);
      };

      // Set up accessibility service after handlers are defined
      this.accessibilityService.storeCurrentFocus();
      this.accessibilityService.setupKeyboardNavigation(modal);
      this.accessibilityService.handleEscapeKey(modal, handleCancel);

      // Focus the name input
      const nameInput = modal.querySelector('#prompt-name') as HTMLInputElement;
      nameInput.focus();

      // Announce modal opening
      this.accessibilityService.announceToScreenReader({
        message: 'Save prompt modal opened. Fill in the name and description, then press Save or Cancel.',
        priority: 'assertive'
      });

      // Add event listeners
      modal.querySelector('#save-btn')?.addEventListener('click', handleSave);
      modal.querySelector('#cancel-btn')?.addEventListener('click', handleCancel);
      
      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });

      // Close on Escape key
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', handleKeydown);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      // Enter key to save
      const handleEnter = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          handleSave();
        }
      };
      document.addEventListener('keydown', handleEnter);
    });
  }

  showSuccessToast(message: string): void {
    // Remove any existing toast
    const existingToast = document.getElementById('spine-success-toast');
    if (existingToast && existingToast.parentElement) {
      existingToast.parentElement.removeChild(existingToast);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'spine-success-toast';
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.backgroundColor = '#28a745';
    toast.style.color = 'white';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '4px';
    toast.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    toast.style.zIndex = '999999';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.maxWidth = '300px';
    toast.style.wordWrap = 'break-word';

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 3000);
  }

  showDeleteConfirmationModal(itemName: string, itemType: 'prompt' | 'context'): Promise<boolean> {
    const modalId = 'delete-confirmation-modal';
    if (document.getElementById(modalId)) {
      return Promise.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.id = modalId;
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      overlay.style.zIndex = '999999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      // Create modal content
      const modal = document.createElement('div');
      modal.style.backgroundColor = '#1a1a1a';
      modal.style.padding = '24px';
      modal.style.borderRadius = '8px';
      modal.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
      modal.style.minWidth = '400px';
      modal.style.maxWidth = '500px';
      modal.style.border = '1px solid #333';

      const itemTypeLabel = itemType === 'prompt' ? 'prompt' : 'context';
      const itemTypeCapitalized = itemType === 'prompt' ? 'Prompt' : 'Context';

      modal.innerHTML = `
        <h2 id="delete-modal-title" style="margin: 0 0 16px 0; color: white; font-size: 20px; font-weight: 600;">Delete ${itemTypeCapitalized}?</h2>
        <p style="margin: 0 0 24px 0; color: #ccc; font-size: 14px; line-height: 1.5;">
          Are you sure you want to delete "<strong style="color: white;">${itemName}</strong>"?
        </p>
        <p style="margin: 0 0 24px 0; color: #888; font-size: 13px; line-height: 1.4;">
          This action cannot be undone.
        </p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button id="delete-cancel-btn" aria-describedby="delete-cancel-help" style="padding: 10px 20px; border: 1px solid #555; background: #2a2a2a; color: white; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background-color 0.15s ease;">No</button>
          <button id="delete-confirm-btn" aria-describedby="delete-confirm-help" style="padding: 10px 20px; border: none; background: #dc3545; color: white; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background-color 0.15s ease;">Yes</button>
        </div>
        <div id="delete-cancel-help" style="display: none;">Cancel deletion and return to selector</div>
        <div id="delete-confirm-help" style="display: none;">Confirm deletion of ${itemTypeLabel}</div>
      `;

      // Add accessibility attributes to modal
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'delete-modal-title');
      modal.setAttribute('aria-modal', 'true');
      overlay.setAttribute('role', 'presentation');

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Event handlers
      const cleanup = () => {
        // Clean up accessibility service
        this.accessibilityService.cleanup(modal);
        
        // Restore focus
        this.accessibilityService.restoreFocus();
        
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      };

      const handleConfirm = () => {
        // Announce confirmation
        this.accessibilityService.announceToScreenReader({
          message: `${itemTypeCapitalized} "${itemName}" will be deleted`,
          priority: 'polite'
        });

        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        // Announce cancellation
        this.accessibilityService.announceToScreenReader({
          message: 'Deletion cancelled',
          priority: 'polite'
        });

        cleanup();
        resolve(false);
      };

      // Set up accessibility service
      this.accessibilityService.storeCurrentFocus();
      this.accessibilityService.setupKeyboardNavigation(modal);
      this.accessibilityService.handleEscapeKey(modal, handleCancel);

      // Focus the cancel button (safer default)
      const cancelBtn = modal.querySelector('#delete-cancel-btn') as HTMLButtonElement;
      cancelBtn.focus();

      // Hover effects for buttons
      const confirmBtn = modal.querySelector('#delete-confirm-btn') as HTMLButtonElement;
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.backgroundColor = '#c82333';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.backgroundColor = '#dc3545';
      });

      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.backgroundColor = '#333';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.backgroundColor = '#2a2a2a';
      });

      // Announce modal opening
      this.accessibilityService.announceToScreenReader({
        message: `Delete ${itemTypeLabel} confirmation dialog opened. Press Tab to navigate, Enter to confirm, or Escape to cancel.`,
        priority: 'assertive'
      });

      // Add event listeners
      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      
      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });

      // Close on Escape key (already handled by accessibility service, but adding explicit handler)
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', handleKeydown);
        }
      };
      document.addEventListener('keydown', handleKeydown);
    });
  }

  // === Context-related UI Implementation ===

  showContextSelector(contexts: Context[], onSelect: (selectedContext: Context) => void, onDelete?: (context: Context) => void): void {
    this.hideContextSelector(); // Ensure no old selector exists
    if (!this.editableEl) return;

    const overlay = this.createContextOverlay();
    
    // Add accessibility attributes
    overlay.setAttribute('role', 'listbox');
    overlay.setAttribute('aria-label', 'Context selector');
    overlay.setAttribute('aria-expanded', 'true');

    if (contexts.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No contexts available.';
      empty.setAttribute('role', 'status');
      empty.setAttribute('aria-live', 'polite');
      overlay.appendChild(empty);
    }

    contexts.forEach((c, index) => {
      // Create container for context item (flex layout: name left, delete right)
      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'space-between';
      container.style.position = 'relative';
      container.style.margin = '4px 0';
      container.style.borderRadius = '4px';
      container.style.border = '1px solid transparent';
      container.style.cursor = 'pointer';
      
      // Create context button (left side - takes remaining space)
      const btn = document.createElement('button');
      btn.textContent = c.name;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-label', `${c.name}: ${c.text.substring(0, 50)}${c.text.length > 50 ? '...' : ''}`);
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', index === 0 ? '0' : '-1');
      
      // Enhanced styling for accessibility
      btn.style.display = 'flex';
      btn.style.flex = '1';
      btn.style.textAlign = 'left';
      btn.style.padding = '8px 12px';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.backgroundColor = 'transparent';
      btn.style.color = 'white';
      btn.style.cursor = 'pointer';
      btn.style.outline = 'none';
      
      // Create delete button (right side - initially hidden)
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '−';
      deleteBtn.setAttribute('aria-label', `Delete ${c.name}`);
      deleteBtn.setAttribute('title', 'Delete context');
      deleteBtn.style.position = 'absolute';
      deleteBtn.style.right = '4px';
      deleteBtn.style.width = '20px';
      deleteBtn.style.height = '20px';
      deleteBtn.style.display = 'flex';
      deleteBtn.style.alignItems = 'center';
      deleteBtn.style.justifyContent = 'center';
      deleteBtn.style.border = '1px solid #444';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.style.backgroundColor = 'transparent';
      deleteBtn.style.color = '#888';
      deleteBtn.style.fontSize = '14px';
      deleteBtn.style.fontWeight = 'bold';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.opacity = '0';
      deleteBtn.style.transition = 'opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease';
      deleteBtn.style.outline = 'none';
      deleteBtn.style.zIndex = '10';
      
      // Show delete button on hover
      container.addEventListener('mouseenter', () => {
        if (onDelete) {
          deleteBtn.style.opacity = '1';
        }
      });
      
      container.addEventListener('mouseleave', () => {
        deleteBtn.style.opacity = '0';
      });
      
      // Delete button hover styles
      deleteBtn.addEventListener('mouseenter', () => {
        deleteBtn.style.backgroundColor = '#2a2a2a';
        deleteBtn.style.borderColor = '#666';
        deleteBtn.style.color = '#ff4444';
      });
      
      deleteBtn.addEventListener('mouseleave', () => {
        deleteBtn.style.backgroundColor = 'transparent';
        deleteBtn.style.borderColor = '#444';
        deleteBtn.style.color = '#888';
      });
      
      // Delete button click handler
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (!onDelete) return;
        
        const confirmed = await this.showDeleteConfirmationModal(c.name, 'context');
        if (confirmed) {
          onDelete(c);
        }
      });
      
      // Focus styles for container
      btn.addEventListener('focus', () => {
        container.style.backgroundColor = '#333';
        container.style.borderColor = '#555';
        btn.setAttribute('aria-selected', 'true');
        // Remove selection from other items
        overlay.querySelectorAll('[role="option"]').forEach(otherBtn => {
          if (otherBtn !== btn) {
            otherBtn.setAttribute('aria-selected', 'false');
            const otherContainer = otherBtn.closest('div[style*="display: flex"]') as HTMLElement;
            if (otherContainer) {
              otherContainer.style.backgroundColor = 'transparent';
              otherContainer.style.borderColor = 'transparent';
            }
          }
        });
      });
      
      btn.addEventListener('blur', () => {
        container.style.backgroundColor = 'transparent';
        container.style.borderColor = 'transparent';
      });
      
      // Context selection click handler
      btn.addEventListener('click', () => {
        onSelect(c);
        this.hideContextSelector();
      });
      
      // Append elements to container
      container.appendChild(btn);
      if (onDelete) {
        container.appendChild(deleteBtn);
      }
      overlay.appendChild(container);
    });

    // Position the overlay
    this.positionOverlay(overlay);

    // Append to documentElement to avoid clipping inside shadow DOMs or scrollable containers.
    try {
      document.documentElement.appendChild(overlay);
    } catch (e) {
      document.body.appendChild(overlay);
    }
    console.log('UIService (dev): context selector appended', overlay);

    // Set up accessibility service
    this.accessibilityService.storeCurrentFocus();
    this.accessibilityService.setupKeyboardNavigation(overlay);
    this.accessibilityService.handleEscapeKey(overlay, () => {
      this.hideContextSelector();
    });

    // Handle resize and scroll
    this.accessibilityService.handleResize(overlay, () => {
      this.positionOverlay(overlay);
    });
    this.accessibilityService.handleScroll(overlay, () => {
      this.positionOverlay(overlay);
    });

    // Focus first item
    this.accessibilityService.focusFirstElement(overlay);

    // Announce to screen readers
    this.accessibilityService.announceToScreenReader({
      message: `Context selector opened with ${contexts.length} contexts. Use arrow keys to navigate, Enter to select, or Escape to close.`,
      priority: 'polite'
    });

    // Add click outside to close
    const onClick = (e: MouseEvent) => {
      if (e.target && overlay.contains(e.target as Node)) return; // Click was inside
      if (e.target !== this.editableEl) {
        this.hideContextSelector();
        document.removeEventListener('click', onClick);
      }
    };
    document.addEventListener('click', onClick, { capture: true });
  }

  hideContextSelector(): void {
    const existing = document.getElementById('spine-context-overlay');
    if (existing && existing.parentElement) {
      // Clean up accessibility service
      this.accessibilityService.cleanup(existing);
      
      // Restore focus
      this.accessibilityService.restoreFocus();
      
      // Remove from DOM
      existing.parentElement.removeChild(existing);
      
      // Announce to screen readers
      this.accessibilityService.announceToScreenReader({
        message: 'Context selector closed',
        priority: 'polite'
      });
    }
  }

  showSaveContextModal(prefillText: string): Promise<SaveContextUIResult | null> {
    const modalId = 'context-save-modal';
    if (document.getElementById(modalId)) {
      return Promise.resolve(null);
    }

    return new Promise<SaveContextUIResult | null>((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.id = modalId;
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      overlay.style.zIndex = '999999';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      // Create modal content
      const modal = document.createElement('div');
      modal.style.backgroundColor = '#1a1a1a';
      modal.style.padding = '24px';
      modal.style.borderRadius = '8px';
      modal.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4)';
      modal.style.minWidth = '400px';
      modal.style.maxWidth = '600px';
      modal.style.border = '1px solid #333';

      modal.innerHTML = `
        <h2 id="context-modal-title" style="margin: 0 0 16px 0; color: white;">Save Context</h2>
        <div style="margin-bottom: 16px;">
          <label for="context-name" style="display: block; margin-bottom: 4px; font-weight: 500; color: white;">Name:</label>
          <input type="text" id="context-name" aria-describedby="context-name-help" placeholder="Enter context name" required style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; font-size: 14px; background-color: #2a2a2a; color: white;">
          <div id="context-name-help" style="font-size: 12px; color: #ccc; margin-top: 4px;">A short, descriptive name for your context</div>
        </div>
        <div style="margin-bottom: 16px;">
          <label for="context-text" style="display: block; margin-bottom: 4px; font-weight: 500; color: white;">Text:</label>
          <textarea id="context-text" readonly aria-describedby="context-text-help" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; font-size: 14px; min-height: 120px; resize: vertical; background-color: #2a2a2a; color: white;">${prefillText}</textarea>
          <div id="context-text-help" style="font-size: 12px; color: #ccc; margin-top: 4px;">The context text that will be inserted when selected</div>
        </div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button id="context-cancel-btn" aria-describedby="context-cancel-help" style="padding: 8px 16px; border: 1px solid #555; background: #2a2a2a; color: white; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button id="context-save-btn" aria-describedby="context-save-help" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">Save</button>
        </div>
        <div id="context-cancel-help" style="display: none;">Close the modal without saving</div>
        <div id="context-save-help" style="display: none;">Save the context and close the modal</div>
      `;

      // Add accessibility attributes to modal
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'context-modal-title');
      modal.setAttribute('aria-modal', 'true');
      overlay.setAttribute('role', 'presentation');

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // Event handlers
      const cleanup = () => {
        // Clean up accessibility service
        this.accessibilityService.cleanup(modal);
        
        // Restore focus
        this.accessibilityService.restoreFocus();
        
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      };

      const handleSave = () => {
        const name = (modal.querySelector('#context-name') as HTMLInputElement).value.trim();
        
        if (!name) {
          // Announce validation error
          this.accessibilityService.announceToScreenReader({
            message: 'Please enter a name for the context',
            priority: 'assertive'
          });
          
          // Focus the name input and highlight it
          const nameInput = modal.querySelector('#context-name') as HTMLInputElement;
          nameInput.focus();
          nameInput.style.borderColor = '#dc3545';
          nameInput.style.borderWidth = '2px';
          
          // Clear the error styling after a delay
          setTimeout(() => {
            nameInput.style.borderColor = '#ddd';
            nameInput.style.borderWidth = '1px';
          }, 3000);
          
          return;
        }

        // Announce successful save
        this.accessibilityService.announceToScreenReader({
          message: `Context "${name}" saved successfully`,
          priority: 'polite'
        });

        cleanup();
        resolve({
          name,
          text: prefillText
        });
      };

      const handleCancel = () => {
        // Announce cancellation
        this.accessibilityService.announceToScreenReader({
          message: 'Save context cancelled',
          priority: 'polite'
        });

        cleanup();
        resolve(null);
      };

      // Set up accessibility service after handlers are defined
      this.accessibilityService.storeCurrentFocus();
      this.accessibilityService.setupKeyboardNavigation(modal);
      this.accessibilityService.handleEscapeKey(modal, handleCancel);

      // Focus the name input
      const nameInput = modal.querySelector('#context-name') as HTMLInputElement;
      nameInput.focus();

      // Announce modal opening
      this.accessibilityService.announceToScreenReader({
        message: 'Save context modal opened. Fill in the name, then press Save or Cancel.',
        priority: 'assertive'
      });

      // Add event listeners
      modal.querySelector('#context-save-btn')?.addEventListener('click', handleSave);
      modal.querySelector('#context-cancel-btn')?.addEventListener('click', handleCancel);
      
      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });

      // Close on Escape key
      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', handleKeydown);
        }
      };
      document.addEventListener('keydown', handleKeydown);

      // Enter key to save
      const handleEnter = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          handleSave();
        }
      };
      document.addEventListener('keydown', handleEnter);
    });
  }

  showBrainButton(position: { x: number; y: number }, onSave: () => void): void {
    this.brainButtonService.show(position, onSave);
  }

  hideBrainButton(): void {
    this.brainButtonService.hide();
  }

  private createContextOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.background = '#1a1a1a';
    overlay.style.color = 'white'; // Added for dark theme text visibility
    overlay.style.border = '1px solid #333';
    overlay.style.padding = '8px';
    overlay.style.zIndex = '999999';
    overlay.style.maxHeight = '200px';
    overlay.style.overflow = 'auto';
    overlay.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
    overlay.style.borderRadius = '8px';
    overlay.id = 'spine-context-overlay';
    return overlay;
  }

  // === AI Enhancement UI Implementation ===

  showEnhanceButton(onEnhance: () => void): void {
    this.hideEnhanceButton(); // Remove existing button if any

    if (!this.editableEl) return;

    this.enhanceButton = this.createEnhanceButton(onEnhance);
    this.positionEnhanceButton();
    this.addEnhanceButtonEventListeners();
    document.body.appendChild(this.enhanceButton);

    // Announce to screen readers
    this.accessibilityService.announceToScreenReader({
      message: 'Enhance button appeared. Click to improve your prompt with AI.',
      priority: 'polite'
    });
  }

  hideEnhanceButton(): void {
    if (this.enhanceButton && this.enhanceButton.parentElement) {
      this.removeEnhanceButtonEventListeners();
      this.enhanceButton.parentElement.removeChild(this.enhanceButton);
    }
    this.enhanceButton = null;
  }

  showEnhanceLoading(message: string = 'Enhancing your prompt...'): void {
    this.hideEnhanceLoading(); // Remove existing loading if any

    this.enhanceLoadingOverlay = document.createElement('div');
    this.enhanceLoadingOverlay.id = 'spine-enhance-loading';
    this.enhanceLoadingOverlay.style.position = 'fixed';
    this.enhanceLoadingOverlay.style.top = '0';
    this.enhanceLoadingOverlay.style.left = '0';
    this.enhanceLoadingOverlay.style.width = '100%';
    this.enhanceLoadingOverlay.style.height = '100%';
    this.enhanceLoadingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.enhanceLoadingOverlay.style.zIndex = '999999';
    this.enhanceLoadingOverlay.style.display = 'flex';
    this.enhanceLoadingOverlay.style.alignItems = 'center';
    this.enhanceLoadingOverlay.style.justifyContent = 'center';

    const loadingContent = document.createElement('div');
    loadingContent.style.backgroundColor = 'white';
    loadingContent.style.padding = '24px';
    loadingContent.style.borderRadius = '8px';
    loadingContent.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
    loadingContent.style.textAlign = 'center';
    loadingContent.style.minWidth = '300px';

    loadingContent.innerHTML = `
      <div style="margin-bottom: 16px;">
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
      <div style="font-size: 16px; color: #333; margin-bottom: 8px;">${message}</div>
      <div style="font-size: 14px; color: #666;">This may take a few seconds...</div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    this.enhanceLoadingOverlay.appendChild(loadingContent);
    document.body.appendChild(this.enhanceLoadingOverlay);

    // Announce to screen readers
    this.accessibilityService.announceToScreenReader({
      message: message,
      priority: 'assertive'
    });
  }

  hideEnhanceLoading(): void {
    if (this.enhanceLoadingOverlay && this.enhanceLoadingOverlay.parentElement) {
      this.enhanceLoadingOverlay.parentElement.removeChild(this.enhanceLoadingOverlay);
    }
    this.enhanceLoadingOverlay = null;
  }

  showEnhanceResult(result: EnhancedPromptResult, onAccept: () => void, onReject: () => void): void {
    this.hideEnhanceResult(); // Remove existing result if any

    this.enhanceResultModal = document.createElement('div');
    this.enhanceResultModal.id = 'spine-enhance-result';
    this.enhanceResultModal.style.position = 'fixed';
    this.enhanceResultModal.style.top = '0';
    this.enhanceResultModal.style.left = '0';
    this.enhanceResultModal.style.width = '100%';
    this.enhanceResultModal.style.height = '100%';
    this.enhanceResultModal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.enhanceResultModal.style.zIndex = '999999';
    this.enhanceResultModal.style.display = 'flex';
    this.enhanceResultModal.style.alignItems = 'center';
    this.enhanceResultModal.style.justifyContent = 'center';

    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.padding = '24px';
    modalContent.style.borderRadius = '8px';
    modalContent.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
    modalContent.style.minWidth = '500px';
    modalContent.style.maxWidth = '800px';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';

    modalContent.innerHTML = `
      <h2 id="enhance-result-title" style="margin: 0 0 16px 0; color: #333;">Enhanced Prompt</h2>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #555;">Original Prompt:</label>
        <div id="original-prompt" style="background-color: #f8f9fa; padding: 12px; border-radius: 4px; border: 1px solid #e9ecef; font-family: monospace; white-space: pre-wrap; margin-bottom: 16px;">${result.originalPrompt}</div>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #555;">Enhanced Prompt:</label>
        <div id="enhanced-prompt" style="background-color: #e8f5e8; padding: 12px; border-radius: 4px; border: 1px solid #c3e6c3; font-family: monospace; white-space: pre-wrap; margin-bottom: 16px;">${result.enhancedPrompt}</div>
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #555;">Improvements Made:</label>
        <ul id="improvements-list" style="margin: 0; padding-left: 20px; color: #666;">
          ${result.improvements.map((improvement: string) => `<li style="margin-bottom: 4px;">${improvement}</li>`).join('')}
        </ul>
      </div>
      <div style="margin-bottom: 20px; padding: 12px; background-color: #f0f8ff; border-radius: 4px; border-left: 4px solid #007bff;">
        <div style="font-size: 14px; color: #666;">
          <strong>Confidence:</strong> ${result.confidence}% | 
          <strong>Processing Time:</strong> ${result.processingTime}ms | 
          <strong>Model:</strong> ${result.model}
        </div>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="reject-enhancement" style="padding: 10px 20px; border: 1px solid #dc3545; background: white; color: #dc3545; border-radius: 4px; cursor: pointer; font-size: 14px;">Reject</button>
        <button id="accept-enhancement" style="padding: 10px 20px; border: none; background: #28a745; color: white; border-radius: 4px; cursor: pointer; font-size: 14px;">Accept Enhancement</button>
      </div>
    `;

    // Add accessibility attributes
    modalContent.setAttribute('role', 'dialog');
    modalContent.setAttribute('aria-labelledby', 'enhance-result-title');
    modalContent.setAttribute('aria-modal', 'true');

    this.enhanceResultModal.appendChild(modalContent);
    document.body.appendChild(this.enhanceResultModal);

    // Set up event listeners
    const acceptBtn = modalContent.querySelector('#accept-enhancement') as HTMLButtonElement;
    const rejectBtn = modalContent.querySelector('#reject-enhancement') as HTMLButtonElement;

    const cleanup = () => {
      if (this.enhanceResultModal && this.enhanceResultModal.parentElement) {
        this.enhanceResultModal.parentElement.removeChild(this.enhanceResultModal);
      }
      this.enhanceResultModal = null;
    };

    acceptBtn.addEventListener('click', () => {
      onAccept();
      cleanup();
    });

    rejectBtn.addEventListener('click', () => {
      onReject();
      cleanup();
    });

    // Close on overlay click
    this.enhanceResultModal.addEventListener('click', (e) => {
      if (e.target === this.enhanceResultModal) {
        onReject();
        cleanup();
      }
    });

    // Close on Escape key
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onReject();
        cleanup();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);

    // Set up accessibility
    this.accessibilityService.storeCurrentFocus();
    this.accessibilityService.setupKeyboardNavigation(modalContent);
    this.accessibilityService.handleEscapeKey(modalContent, () => {
      onReject();
      cleanup();
    });

    // Focus first button
    acceptBtn.focus();

    // Announce to screen readers
    this.accessibilityService.announceToScreenReader({
      message: `Enhanced prompt ready. Confidence: ${result.confidence}%. Press Enter to accept or Escape to reject.`,
      priority: 'assertive'
    });
  }

  hideEnhanceResult(): void {
    if (this.enhanceResultModal && this.enhanceResultModal.parentElement) {
      this.enhanceResultModal.parentElement.removeChild(this.enhanceResultModal);
    }
    this.enhanceResultModal = null;
  }

  showEnhanceError(error: string): void {
    // Remove any existing error toasts
    const existingError = document.getElementById('spine-enhance-error');
    if (existingError && existingError.parentElement) {
      existingError.parentElement.removeChild(existingError);
    }

    // Create error toast
    const errorToast = document.createElement('div');
    errorToast.id = 'spine-enhance-error';
    errorToast.textContent = `Enhancement failed: ${error}`;
    errorToast.style.position = 'fixed';
    errorToast.style.top = '20px';
    errorToast.style.right = '20px';
    errorToast.style.backgroundColor = '#dc3545';
    errorToast.style.color = 'white';
    errorToast.style.padding = '12px 16px';
    errorToast.style.borderRadius = '4px';
    errorToast.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    errorToast.style.zIndex = '999999';
    errorToast.style.fontSize = '14px';
    errorToast.style.fontWeight = '500';
    errorToast.style.maxWidth = '300px';
    errorToast.style.wordWrap = 'break-word';

    document.body.appendChild(errorToast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorToast.parentElement) {
        errorToast.parentElement.removeChild(errorToast);
      }
    }, 5000);

    // Announce to screen readers
    this.accessibilityService.announceToScreenReader({
      message: `Enhancement failed: ${error}`,
      priority: 'assertive'
    });
  }

  private createEnhanceButton(onEnhance: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = 'spine-enhance-button';
    button.innerHTML = '✨ Enhance';
    button.setAttribute('aria-label', 'Enhance prompt with AI');
    button.setAttribute('title', 'Enhance prompt with AI');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');

    // Styling
    button.style.position = 'absolute';
    button.style.padding = '8px 16px';
    button.style.backgroundColor = '#007bff';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.fontSize = '14px';
    button.style.fontWeight = '500';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    button.style.zIndex = '999999';
    button.style.transition = 'all 0.2s ease';
    button.style.outline = 'none';

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#0056b3';
      button.style.transform = 'translateY(-1px)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#007bff';
      button.style.transform = 'translateY(0)';
    });

    // Click handler
    button.addEventListener('click', onEnhance);

    // Keyboard handler
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnhance();
      }
    });

    return button;
  }

  private positionEnhanceButton(): void {
    if (!this.enhanceButton || !this.editableEl) return;

    const rect = this.editableEl.getBoundingClientRect();
    const buttonRect = this.enhanceButton.getBoundingClientRect();
    
    // Position button to the right of the text area
    let left = rect.right + window.scrollX + 10;
    let top = rect.top + window.scrollY + (rect.height - buttonRect.height) / 2;
    
    // Ensure button stays within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left + buttonRect.width > viewportWidth) {
      left = rect.left + window.scrollX - buttonRect.width - 10;
    }
    
    if (top + buttonRect.height > viewportHeight + window.scrollY) {
      top = viewportHeight + window.scrollY - buttonRect.height - 10;
    }
    
    if (top < window.scrollY + 10) {
      top = window.scrollY + 10;
    }
    
    this.enhanceButton.style.left = `${left}px`;
    this.enhanceButton.style.top = `${top}px`;
  }

  private addEnhanceButtonEventListeners(): void {
    if (!this.enhanceButton) return;

    // Handle window resize and scroll
    const handleResize = () => this.positionEnhanceButton();
    const handleScroll = () => this.positionEnhanceButton();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Store cleanup function
    (this.enhanceButton as any)._cleanup = () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }

  private removeEnhanceButtonEventListeners(): void {
    if (this.enhanceButton && (this.enhanceButton as any)._cleanup) {
      (this.enhanceButton as any)._cleanup();
    }
  }
}