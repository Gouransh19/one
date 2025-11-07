// core/ai-config.ts
// Configuration interface for AI enhancement service

/**
 * Configuration for AI enhancement service
 */
export interface AIConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
  thinkingBudget: number;
  maxPromptLength: number;
  enableLogging: boolean;
}

/**
 * Default AI configuration
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  apiKey: 'elgTz8I4T2bSAxX2wUXoFcHTtaxOAFxU',
  model: 'mistral-large-latest',
  maxRetries: 3,
  timeoutMs: 10000,
  thinkingBudget: 0, // Disable thinking for speed
  maxPromptLength: 4000,
  enableLogging: false
};

/**
 * AI service status information
 */
export interface AIServiceStatus {
  isConnected: boolean;
  lastError?: string;
  requestCount: number;
  lastRequestTime?: number;
  averageResponseTime?: number;
}

/**
 * Enhanced prompt result from AI service
 */
export interface EnhancedPromptResult {
  originalPrompt: string;
  enhancedPrompt: string;
  improvements: string[];
  confidence: number;
  processingTime: number;
  model: string;
}

/**
 * AI enhancement request parameters
 */
export interface EnhancementRequest {
  prompt: string;
  context?: string;
  style?: 'professional' | 'casual' | 'technical' | 'creative';
  length?: 'short' | 'medium' | 'long';
  focus?: string[];
}

/**
 * AI enhancement response
 */
export interface EnhancementResponse {
  success: boolean;
  result?: EnhancedPromptResult;
  error?: string;
  retryAfter?: number;
}
