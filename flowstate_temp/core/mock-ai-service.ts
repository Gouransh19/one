// core/mock-ai-service.ts
// Mock implementation of AI enhancement service for testing

import { 
  IAIEnhanceService, 
  AIError, 
  createAIError,
  validateEnhancementRequest,
  formatEnhancementPrompt
} from './ai-service';
import { 
  AIConfig, 
  AIServiceStatus, 
  EnhancedPromptResult, 
  EnhancementRequest,
  DEFAULT_AI_CONFIG
} from './ai-config';

/**
 * Mock AI Enhancement Service for testing
 * Provides predictable responses for unit tests
 */
export class MockAIEnhanceService implements IAIEnhanceService {
  private config: AIConfig;
  private status: AIServiceStatus;
  private shouldFail = false;
  private failError: AIError | null = null;
  private responseDelay = 0;

  constructor(initialConfig?: Partial<AIConfig>) {
    this.config = { ...DEFAULT_AI_CONFIG, ...initialConfig };
    this.status = {
      isConnected: true,
      requestCount: 0,
      lastRequestTime: undefined,
      averageResponseTime: undefined
    };
  }

  async enhancePrompt(request: EnhancementRequest): Promise<EnhancedPromptResult> {
    const startTime = Date.now();

    // Simulate response delay
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    // Validate request
    const validationError = validateEnhancementRequest(request, this.config);
    if (validationError) {
      throw createAIError('INVALID_INPUT', validationError);
    }

    // Check if service should fail
    if (this.shouldFail && this.failError) {
      throw this.failError;
    }

    // Generate mock response
    const result = this.generateMockResponse(request, startTime);
    
    // Update metrics
    this.updateMetrics(startTime);
    
    return result;
  }

  async isAvailable(): Promise<boolean> {
    return this.status.isConnected && !this.shouldFail;
  }

  getServiceStatus(): AIServiceStatus {
    return { ...this.status };
  }

  async testConnection(): Promise<boolean> {
    if (this.shouldFail) {
      this.status.isConnected = false;
      this.status.lastError = this.failError?.message || 'Connection test failed';
      return false;
    }

    this.status.isConnected = true;
    this.status.lastError = undefined;
    return true;
  }

  resetMetrics(): void {
    this.status = {
      isConnected: this.status.isConnected,
      requestCount: 0,
      lastRequestTime: undefined,
      averageResponseTime: undefined
    };
  }

  updateConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  cleanup(): void {
    this.status.isConnected = false;
  }

  // Test helper methods
  setShouldFail(shouldFail: boolean, error?: AIError): void {
    this.shouldFail = shouldFail;
    this.failError = error || createAIError('API_ERROR', 'Mock service failure');
  }

  setResponseDelay(delay: number): void {
    this.responseDelay = delay;
  }

  private generateMockResponse(request: EnhancementRequest, startTime: number): EnhancedPromptResult {
    const originalPrompt = request.prompt;
    
    // Generate mock enhanced prompt
    let enhancedPrompt = originalPrompt;
    const improvements: string[] = [];

    // Add mock improvements based on prompt content
    if (originalPrompt.length < 50) {
      enhancedPrompt = `${originalPrompt}\n\nPlease provide more specific details and context to make this prompt more effective.`;
      improvements.push('Added request for more specific details');
    }

    if (!originalPrompt.includes('please') && !originalPrompt.includes('can you')) {
      enhancedPrompt = `Please ${enhancedPrompt.toLowerCase()}`;
      improvements.push('Added polite request format');
    }

    if (!originalPrompt.includes('?')) {
      enhancedPrompt += '?';
      improvements.push('Added question format for better engagement');
    }

    // Add context-specific improvements
    if (request.context) {
      enhancedPrompt = `Given the context: "${request.context}"\n\n${enhancedPrompt}`;
      improvements.push('Incorporated provided context');
    }

    if (request.style) {
      enhancedPrompt = `[${request.style} style] ${enhancedPrompt}`;
      improvements.push(`Applied ${request.style} writing style`);
    }

    if (request.focus && request.focus.length > 0) {
      enhancedPrompt = `Focus on: ${request.focus.join(', ')}\n\n${enhancedPrompt}`;
      improvements.push(`Added focus areas: ${request.focus.join(', ')}`);
    }

    // Ensure the original prompt is still contained in the enhanced version
    if (!enhancedPrompt.includes(originalPrompt)) {
      enhancedPrompt = `${originalPrompt}\n\nEnhanced: ${enhancedPrompt}`;
      improvements.push('Preserved original prompt structure');
    }

    // Calculate mock confidence based on improvements
    const confidence = Math.min(95, 60 + (improvements.length * 10));

    return {
      originalPrompt,
      enhancedPrompt,
      improvements,
      confidence,
      processingTime: Date.now() - startTime,
      model: this.config.model
    };
  }

  private updateMetrics(startTime: number): void {
    this.status.requestCount++;
    this.status.lastRequestTime = Date.now();
    
    const responseTime = Date.now() - startTime;
    
    if (this.status.averageResponseTime === undefined) {
      this.status.averageResponseTime = responseTime;
    } else {
      this.status.averageResponseTime = (this.status.averageResponseTime + responseTime) / 2;
    }
  }
}
