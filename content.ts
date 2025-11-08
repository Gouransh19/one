// content.ts
// Content script: orchestrates the UI and storage services.
import { Message, Prompt, Context } from './core/types';
import { IUIService, UIService } from './core/ui-service';
import { ISelectionService, SelectionService } from './core/selection-service';
import { IConfigService, ConfigService } from './core/config-service';
import { MistralAIEnhanceService } from './core/mistral-ai-service';
import { IAIEnhanceService } from './core/ai-service';
import { EnhancementRequest } from './core/ai-config';

declare const chrome: any;

// Services are now responsible for implementation details.
const configService: IConfigService = new ConfigService();
const selectionService: ISelectionService = new SelectionService();
const ui: IUIService = new UIService();
const aiService: IAIEnhanceService = new MistralAIEnhanceService();

// Track enhance button state
let isEnhanceButtonVisible = false;

// Initialize text selection detection
selectionService.onSelectionChange((hasSelection, selectedText) => {
  if (hasSelection) {
    console.log("CONTENT: Text selected, showing brain button");
    const bounds = selectionService.getSelectionBounds();
    if (bounds) {
      ui.showBrainButton({ x: bounds.x, y: bounds.y }, () => {
        console.log("CONTENT: Brain button clicked, opening save context modal");
        ui.showSaveContextModal(selectedText).then((result) => {
          if (result) {
            console.log("CONTENT: User wants to save context:", result);
            
            // Send save request to background
            chrome.runtime.sendMessage({ 
              type: 'SAVE_CONTEXT_REQUEST', 
              payload: result 
            } as Message, (response: Message) => {
              console.log('CONTENT: Save context response:', response);
              
              if (response?.type === 'SAVE_CONTEXT_RESPONSE') {
                const saveResponse = response as any;
                if (saveResponse.payload?.success) {
                  ui.showSuccessToast('Context saved successfully!');
                } else {
                  console.error('CONTENT: Failed to save context:', saveResponse.payload?.error);
                  ui.showSuccessToast('Failed to save context: ' + (saveResponse.payload?.error || 'Unknown error'));
                }
              }
            });
          } else {
            console.log("CONTENT: User cancelled save context modal.");
          }
        });
      });
    }
  } else {
    console.log("CONTENT: No text selected, hiding brain button");
    ui.hideBrainButton();
  }
});

// Main application logic
ui.onTextAreaInput(text => {
  // Dev log: show incoming text and trailing characters to diagnose trigger detection
  try {
    console.log('CONTENT(dev): onTextAreaInput text=', text?.slice(0,200));
    console.log('CONTENT(dev): trailing chars=', JSON.stringify(text?.slice(-5)));
  } catch (e) {
    console.log('CONTENT(dev): error logging text', e);
  }
  if (text.endsWith('//')) {
    console.log("CONTENT: Detected '//', requesting prompts.");

    // Message the background script to get prompts from storage.
    // In a future step, we could have the content script use the StorageService directly,
    // but this keeps the security boundary clear for now.
    chrome.runtime.sendMessage({ type: 'GET_PROMPTS_REQUEST' } as Message, (response: Message) => {
      console.log('CONTENT: Received response:', response);
      if (response?.type !== 'GET_PROMPTS_RESPONSE' || !('payload' in response)) {
        return;
      }

      const prompts: Prompt[] = (response as any).payload || [];

      // Use the UI service to show the selector
      ui.showPromptSelector(prompts, (selectedPrompt) => {
        // On select, use the UI service to update the text area
        const currentText = ui.getTextAreaValue();
        const newText = currentText.replace(/\/\/$/, selectedPrompt.template);
        ui.setTextAreaValue(newText);
      });
    });
  } else if (text.endsWith('@')) {
    console.log("CONTENT: Detected '@', requesting contexts.");

    // Message the background script to get contexts from storage
    chrome.runtime.sendMessage({ type: 'GET_CONTEXTS_REQUEST' } as Message, (response: Message) => {
      console.log('CONTENT: Received contexts response:', response);
      if (response?.type !== 'GET_CONTEXTS_RESPONSE' || !('payload' in response)) {
        return;
      }

      const contexts: Context[] = (response as any).payload || [];

      // Use the UI service to show the context selector
      ui.showContextSelector(contexts, (selectedContext) => {
        // On select, use the UI service to update the text area
        const currentText = ui.getTextAreaValue();
        const newText = currentText.replace(/@$/, selectedContext.text);
        ui.setTextAreaValue(newText);
      });
    });
  } else if (text.endsWith('+')) {
    console.log("CONTENT: Detected '+', opening save prompt modal.");
    
    // Get the current text without the '+' character
    const promptText = text.slice(0, -1).trim();
    
    if (!promptText) {
      console.log("CONTENT: No text to save, ignoring '+' command.");
      return;
    }

    // Show the save prompt modal
    ui.showSavePromptModal(promptText).then((result) => {
      if (result) {
        console.log("CONTENT: User wants to save prompt:", result);
        
        // Send save request to background
        chrome.runtime.sendMessage({ 
          type: 'SAVE_PROMPT_REQUEST', 
          payload: result 
        } as Message, (response: Message) => {
          console.log('CONTENT: Save response:', response);
          
          if (response?.type === 'SAVE_PROMPT_RESPONSE') {
            const saveResponse = response as any;
            if (saveResponse.payload?.success) {
              ui.showSuccessToast('Prompt saved successfully!');
              // Remove the '+' from the text area
              const currentText = ui.getTextAreaValue();
              const newText = currentText.replace(/\+$/, '');
              ui.setTextAreaValue(newText);
            } else {
              console.error('CONTENT: Failed to save prompt:', saveResponse.payload?.error);
              ui.showSuccessToast('Failed to save prompt: ' + (saveResponse.payload?.error || 'Unknown error'));
            }
          }
        });
      } else {
        console.log("CONTENT: User cancelled save prompt modal.");
        // Remove the '+' from the text area
        const currentText = ui.getTextAreaValue();
        const newText = currentText.replace(/\+$/, '');
        ui.setTextAreaValue(newText);
      }
    });
  } else {
    // If text doesn't end with '//', '@', or '+', ensure the selectors are hidden.
    // The UI service is smart enough to handle this internally, but this is an explicit trigger.
    ui.hidePromptSelector();
    ui.hideContextSelector();
  }

  // Check if we should show/hide enhance button
  checkEnhanceButtonVisibility(text);
});

// Fallback delegated input listener: sometimes editors are dynamic and UIService
// bindings miss the node. This listener reads the current text and runs the same
// trigger logic. Debounced and idempotent to avoid duplicate work.
(function setupDelegatedFallback(){
  let debounceTimer: number | null = null;
  let lastHandled = '';

  const handler = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      try {
        const text = ui.getTextAreaValue();
        if (!text || text === lastHandled) return;
        lastHandled = text;

        // Mirror the trigger detection from above
        if (text.endsWith('//')) {
          console.log("CONTENT(fallback): Detected '//', requesting prompts.");
          chrome.runtime.sendMessage({ type: 'GET_PROMPTS_REQUEST' } as Message, (response: Message) => {
            console.log('CONTENT(fallback): Received response:', response);
            if (response?.type !== 'GET_PROMPTS_RESPONSE' || !('payload' in response)) return;
            const prompts: Prompt[] = (response as any).payload || [];
            ui.showPromptSelector(prompts, (selectedPrompt) => {
              const currentText = ui.getTextAreaValue();
              const newText = currentText.replace(/\/\/$/, selectedPrompt.template);
              ui.setTextAreaValue(newText);
            });
          });
          return;
        }

        if (text.endsWith('@')) {
          console.log("CONTENT(fallback): Detected '@', requesting contexts.");
          chrome.runtime.sendMessage({ type: 'GET_CONTEXTS_REQUEST' } as Message, (response: Message) => {
            console.log('CONTENT(fallback): Received contexts response:', response);
            if (response?.type !== 'GET_CONTEXTS_RESPONSE' || !('payload' in response)) return;
            const contexts: Context[] = (response as any).payload || [];
            ui.showContextSelector(contexts, (selectedContext) => {
              const currentText = ui.getTextAreaValue();
              const newText = currentText.replace(/@$/, selectedContext.text);
              ui.setTextAreaValue(newText);
            });
          });
          return;
        }

        if (text.endsWith('+')) {
          console.log("CONTENT(fallback): Detected '+', opening save prompt modal.");
          const promptText = text.slice(0, -1).trim();
          if (!promptText) return;
          ui.showSavePromptModal(promptText).then((result) => {
            if (result) {
              chrome.runtime.sendMessage({ type: 'SAVE_PROMPT_REQUEST', payload: result } as Message, (response: Message) => {
                console.log('CONTENT(fallback): Save response:', response);
                if (response?.type === 'SAVE_PROMPT_RESPONSE') {
                  const saveResponse = response as any;
                  if (saveResponse.payload?.success) {
                    ui.showSuccessToast('Prompt saved successfully!');
                    const currentText = ui.getTextAreaValue();
                    const newText = currentText.replace(/\+$/, '');
                    ui.setTextAreaValue(newText);
                  } else {
                    ui.showSuccessToast('Failed to save prompt: ' + (saveResponse.payload?.error || 'Unknown error'));
                  }
                }
              });
            } else {
              const currentText = ui.getTextAreaValue();
              const newText = currentText.replace(/\+$/, '');
              ui.setTextAreaValue(newText);
            }
          });
          return;
        }

        // No trigger - ensure UI selectors hidden
        ui.hidePromptSelector();
        ui.hideContextSelector();
      } catch (err) {
        console.warn('CONTENT(fallback): error in delegated handler', err);
      }
    }, 80);
  };

  document.addEventListener('input', handler, true);
})();

// Check if enhance button should be visible
function checkEnhanceButtonVisibility(text: string): void {
  const shouldShow = isLLMChatInterface() && text.trim().length > 10;
  
  if (shouldShow && !isEnhanceButtonVisible) {
    console.log("CONTENT: Showing enhance button");
    ui.showEnhanceButton(() => {
      console.log("CONTENT: Enhance button clicked");
      handleEnhancePrompt(text);
    });
    isEnhanceButtonVisible = true;
  } else if (!shouldShow && isEnhanceButtonVisible) {
    console.log("CONTENT: Hiding enhance button");
    ui.hideEnhanceButton();
    isEnhanceButtonVisible = false;
  }
}

// Check if we're in an LLM chat interface
function isLLMChatInterface(): boolean {
  const hostname = window.location.hostname.toLowerCase();
  
  // Common LLM chat interfaces
  const llmSites = [
    'chatgpt.com',
    'claude.ai',
    'aistudio.google.com',
    'gemini.google.com',
    'perplexity.ai',
    'poe.com',
    'character.ai',
    'you.com'
  
  ];
  
  return llmSites.some(site => hostname.includes(site));
}

// Handle prompt enhancement
async function handleEnhancePrompt(text: string): Promise<void> {
  try {
    // Check if AI service is available
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      ui.showEnhanceError('AI service is not available. Please check your API key configuration.');
      return;
    }

    // Show loading state
    ui.showEnhanceLoading('Enhancing your prompt with AI...');

    // Create enhancement request
    const request: EnhancementRequest = {
      prompt: text.trim(),
      style: 'professional',
      length: 'medium'
    };

    // Call AI service
    const result = await aiService.enhancePrompt(request);

    // Hide loading state
    ui.hideEnhanceLoading();

    // Show result modal
    ui.showEnhanceResult(result, 
      () => {
        // User accepted enhancement
        console.log("CONTENT: User accepted enhancement");
        ui.setTextAreaValue(result.enhancedPrompt);
        ui.showSuccessToast('Prompt enhanced successfully!');
      },
      () => {
        // User rejected enhancement
        console.log("CONTENT: User rejected enhancement");
      }
    );

  } catch (error) {
    console.error("CONTENT: Enhancement failed:", error);
    
    // Hide loading state
    ui.hideEnhanceLoading();
    
    // Show error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    ui.showEnhanceError(errorMessage);
  }
}
