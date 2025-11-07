// core/env-config.ts
// Environment configuration service for secure API key management

import { AIConfig, DEFAULT_AI_CONFIG } from './ai-config';

/**
 * Interface for environment configuration service
 */
export interface IEnvConfigService {
  /**
   * Load AI configuration from environment variables
   * @returns AI configuration object or Promise<AIConfig>
   */
  loadAIConfig(): AIConfig | Promise<AIConfig>;

  /**
   * Check if API key is available
   * @returns True if API key is present
   */
  hasAPIKey(): boolean;

  /**
   * Get API key (for internal use only)
   * @returns API key or empty string if not available
   */
  getAPIKey(): string;

  /**
   * Validate configuration
   * @param config Configuration to validate
   * @returns Validation result with errors if any
   */
  validateConfig(config: AIConfig): { isValid: boolean; errors: string[] };
}

/**
 * Environment configuration service implementation
 * Handles secure loading of environment variables
 */
export class EnvConfigService implements IEnvConfigService {
  private config: AIConfig | null = null;

  loadAIConfig(): AIConfig {
    if (this.config) {
      return this.config;
    }

    // Load from environment variables
    const apiKey = this.getAPIKey();
    
    this.config = {
      ...DEFAULT_AI_CONFIG,
      apiKey,
      model: this.getEnvVar('AI_MODEL', DEFAULT_AI_CONFIG.model),
      maxRetries: this.getEnvNumber('AI_MAX_RETRIES', DEFAULT_AI_CONFIG.maxRetries),
      timeoutMs: this.getEnvNumber('AI_TIMEOUT_MS', DEFAULT_AI_CONFIG.timeoutMs),
      thinkingBudget: this.getEnvNumber('AI_THINKING_BUDGET', DEFAULT_AI_CONFIG.thinkingBudget),
      maxPromptLength: this.getEnvNumber('AI_MAX_PROMPT_LENGTH', DEFAULT_AI_CONFIG.maxPromptLength),
      enableLogging: this.getEnvBoolean('AI_ENABLE_LOGGING', DEFAULT_AI_CONFIG.enableLogging)
    };

    return this.config;
  }

  hasAPIKey(): boolean {
    return this.getAPIKey().length > 0;
  }

  getAPIKey(): string {
    // Try multiple sources for API key
    const sources = [
      () => this.getEnvVar('MISTRAL_API_KEY', 'elgTz8I4T2bSAxX2wUXoFcHTtaxOAFxU'),
      () => this.getEnvVar('MISTRAL_API_KEY', ''),
      () => this.getEnvVar('API_KEY', ''),
      () => this.getEnvVar('GEMINI_API_KEY', 'AIzaSyCtaRiI3DVet0qtvLyLanIHZn6n-dpIw7Q'),
      () => this.getEnvVar('GOOGLE_API_KEY', '')
    ];

    for (const source of sources) {
      const key = source();
      if (key && key.trim().length > 0) {
        return key.trim();
      }
    }

    return '';
  }

  validateConfig(config: AIConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey || config.apiKey.trim().length === 0) {
      errors.push('API key is required');
    }

    if (config.maxRetries < 0 || config.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10');
    }

    if (config.timeoutMs < 1000 || config.timeoutMs > 60000) {
      errors.push('Timeout must be between 1000ms and 60000ms');
    }

    if (config.thinkingBudget < 0 || config.thinkingBudget > 1) {
      errors.push('Thinking budget must be between 0 and 1');
    }

    if (config.maxPromptLength < 100 || config.maxPromptLength > 10000) {
      errors.push('Max prompt length must be between 100 and 10000 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private getEnvVar(key: string, defaultValue: string): string {
    // In Chrome extension context, we can't access process.env directly
    // We'll need to use a different approach for environment variables
    // For now, return default values
    return defaultValue;
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const value = this.getEnvVar(key, defaultValue.toString());
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  private getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = this.getEnvVar(key, defaultValue.toString());
    return value.toLowerCase() === 'true';
  }
}

/**
 * Chrome extension specific environment configuration
 * Uses chrome.storage.local to store configuration
 */
export class ChromeEnvConfigService implements IEnvConfigService {
  private config: AIConfig | null = null;
  private readonly CONFIG_KEY = 'ai_config';

  async loadAIConfig(): Promise<AIConfig> {
    if (this.config) {
      return this.config;
    }

    // Load from chrome storage
    return new Promise<AIConfig>((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        // Fallback to default config if chrome APIs not available
        this.config = { ...DEFAULT_AI_CONFIG };
        resolve(this.config);
        return;
      }

      chrome.storage.local.get([this.CONFIG_KEY], (result) => {
        if (chrome.runtime?.lastError) {
          console.warn('Failed to load AI config from storage:', chrome.runtime.lastError);
          this.config = { ...DEFAULT_AI_CONFIG };
          resolve(this.config);
          return;
        }

        const storedConfig = result[this.CONFIG_KEY];
        if (storedConfig) {
          // Merge stored config with default, but prioritize DEFAULT_AI_CONFIG.apiKey if it's set
          this.config = { 
            ...DEFAULT_AI_CONFIG, 
            ...storedConfig,
            // If DEFAULT_AI_CONFIG has an API key, use it instead of stored one
            apiKey: DEFAULT_AI_CONFIG.apiKey || storedConfig.apiKey
          };
        } else {
          this.config = { ...DEFAULT_AI_CONFIG };
        }

        resolve(this.config!);
      });
    });
  }

  hasAPIKey(): boolean {
    return (this.config?.apiKey?.length ?? 0) > 0;
  }

  getAPIKey(): string {
    return this.config?.apiKey || '';
  }

  validateConfig(config: AIConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey || config.apiKey.trim().length === 0) {
      errors.push('API key is required');
    }

    if (config.maxRetries < 0 || config.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10');
    }

    if (config.timeoutMs < 1000 || config.timeoutMs > 60000) {
      errors.push('Timeout must be between 1000ms and 60000ms');
    }

    if (config.thinkingBudget < 0 || config.thinkingBudget > 1) {
      errors.push('Thinking budget must be between 0 and 1');
    }

    if (config.maxPromptLength < 100 || config.maxPromptLength > 10000) {
      errors.push('Max prompt length must be between 100 and 10000 characters');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Save configuration to chrome storage
   * @param config Configuration to save
   */
  async saveConfig(config: AIConfig): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        reject(new Error('Chrome storage API not available'));
        return;
      }

      chrome.storage.local.set({ [this.CONFIG_KEY]: config }, () => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        this.config = config;
        resolve();
      });
    });
  }
}
