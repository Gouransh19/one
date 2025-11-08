// core/ai-service.ts
// Interface-first contract for AI enhancement service

import { AIConfig, AIServiceStatus, EnhancedPromptResult, EnhancementRequest, EnhancementResponse } from './ai-config';

/**
 * Interface for AI enhancement service
 * This is a black box service that handles all AI-related operations
 */
export interface IAIEnhanceService {
  /**
   * Enhance a prompt using AI
   * @param request The enhancement request
   * @returns Promise that resolves with enhanced prompt result
   */
  enhancePrompt(request: EnhancementRequest): Promise<EnhancedPromptResult>;

  /**
   * Check if the AI service is available and ready
   * @returns Promise that resolves with availability status
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get current service status and metrics
   * @returns Current service status
   */
  getServiceStatus(): AIServiceStatus;

  /**
   * Test the AI service connection
   * @returns Promise that resolves with connection status
   */
  testConnection(): Promise<boolean>;

  /**
   * Reset service metrics and error state
   */
  resetMetrics(): void;

  /**
   * Update service configuration
   * @param config New configuration
   */
  updateConfig(config: Partial<AIConfig>): void;

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): AIConfig;

  /**
   * Clean up resources and connections
   */
  cleanup(): void;
}

/**
 * Interface for AI service error handling
 */
export interface AIError extends Error {
  code: 'API_KEY_MISSING' | 'API_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'RATE_LIMIT' | 'INVALID_INPUT' | 'SERVICE_UNAVAILABLE';
  retryAfter?: number;
  originalError?: any;
}

/**
 * Utility function to create AI errors
 */
export const createAIError = (
  code: AIError['code'],
  message: string,
  originalError?: any,
  retryAfter?: number
): AIError => {
  const error = new Error(message) as AIError;
  error.code = code;
  error.originalError = originalError;
  error.retryAfter = retryAfter;
  return error;
};

/**
 * Utility function to check if error is retryable
 */
export const isRetryableError = (error: AIError): boolean => {
  const retryableCodes: AIError['code'][] = [
    'API_ERROR',
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMIT',
    'SERVICE_UNAVAILABLE'
  ];
  return retryableCodes.includes(error.code);
};

/**
 * Utility function to validate enhancement request
 */
export const validateEnhancementRequest = (request: EnhancementRequest, config: AIConfig): string | null => {
  if (typeof request.prompt !== 'string') {
    return 'Prompt is required and must be a string';
  }

  if (!request.prompt || request.prompt.trim().length === 0) {
    return 'Prompt cannot be empty';
  }

  if (request.prompt.length > config.maxPromptLength) {
    return `Prompt exceeds maximum length of ${config.maxPromptLength} characters`;
  }

  if (request.context && request.context.length > config.maxPromptLength) {
    return `Context exceeds maximum length of ${config.maxPromptLength} characters`;
  }

  return null;
};

/**
 * Utility function to format prompt for AI enhancement
 */
export const formatEnhancementPrompt = (request: EnhancementRequest): string => {
  let prompt = `Please enhance the following prompt to make it more effective, clear, and actionable:\n\n`;
  
  if (request.context) {
    prompt += `Context: ${request.context}\n\n`;
  }
  
  prompt += `Original Prompt: ${request.prompt}\n\n`;
  
  if (request.style) {
    prompt += `Style: ${request.style}\n`;
  }
  
  if (request.length) {
    prompt += `Length: ${request.length}\n`;
  }
  
  if (request.focus && request.focus.length > 0) {
    prompt += `Focus areas: ${request.focus.join(', ')}\n`;
  }
  
  prompt += `\nPlease provide:\n1. An enhanced version of the prompt\n2. A list of specific improvements made\n3. A confidence score (0-100) for the enhancement quality`;
  
  return prompt;
};
