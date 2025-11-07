// core/gemini-ai-service.ts
// Black box implementation of Gemini AI enhancement service

import { GoogleGenerativeAI } from '@google/generative-ai';
import { 
  IAIEnhanceService, 
  AIError, 
  createAIError, 
  isRetryableError,
  validateEnhancementRequest,
  formatEnhancementPrompt
} from './ai-service';
import { 
  AIConfig, 
  AIServiceStatus, 
  EnhancedPromptResult, 
  EnhancementRequest, 
  EnhancementResponse,
  DEFAULT_AI_CONFIG
} from './ai-config';
import { ChromeEnvConfigService } from './env-config';

/**
 * Gemini AI Enhancement Service Implementation
 * This is a black box service that handles all AI operations
 */
export class GeminiAIEnhanceService implements IAIEnhanceService {
  private config: AIConfig;
  private status: AIServiceStatus;
  private genAI: GoogleGenerativeAI | null = null;
  private envConfigService: ChromeEnvConfigService;
  private isInitialized = false;

  constructor(initialConfig?: Partial<AIConfig>) {
    this.config = { ...DEFAULT_AI_CONFIG, ...initialConfig };
    this.status = {
      isConnected: false,
      requestCount: 0,
      lastRequestTime: undefined,
      averageResponseTime: undefined
    };
    this.envConfigService = new ChromeEnvConfigService();
  }

  async enhancePrompt(request: EnhancementRequest): Promise<EnhancedPromptResult> {
    const startTime = Date.now();
    
    try {
      // Validate request
      const validationError = validateEnhancementRequest(request, this.config);
      if (validationError) {
        throw createAIError('INVALID_INPUT', validationError);
      }

      // Ensure service is initialized
      await this.ensureInitialized();

      // Format the prompt for enhancement
      const formattedPrompt = formatEnhancementPrompt(request);

      // Make API call with retry logic
      const response = await this.callWithRetry(async () => {
        const model = this.genAI!.getGenerativeModel({ 
          model: this.config.model,
          generationConfig: {
            // Note: thinkingConfig is not available in this version
          }
        });
        return await model.generateContent(formattedPrompt);
      });

      // Parse response
      const result = this.parseEnhancementResponse(response, request.prompt, startTime);
      
      // Update metrics
      this.updateMetrics(startTime);
      
      return result;

    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return this.status.isConnected;
    } catch {
      return false;
    }
  }

  getServiceStatus(): AIServiceStatus {
    return { ...this.status };
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      
      // Make a simple test request
      const model = this.genAI!.getGenerativeModel({ model: this.config.model });
      const testResponse = await model.generateContent('Test connection');

      this.status.isConnected = true;
      this.status.lastError = undefined;
      return true;

    } catch (error) {
      this.status.isConnected = false;
      this.status.lastError = error instanceof Error ? error.message : 'Connection test failed';
      return false;
    }
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
    this.isInitialized = false; // Force re-initialization
  }

  getConfig(): AIConfig {
    return { ...this.config };
  }

  cleanup(): void {
    this.genAI = null;
    this.isInitialized = false;
    this.status.isConnected = false;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.genAI) {
      return;
    }

    // Load configuration from environment
    const envConfig = await this.envConfigService.loadAIConfig();
    this.config = { ...this.config, ...envConfig };

    // Validate configuration
    const validation = this.envConfigService.validateConfig(this.config);
    if (!validation.isValid) {
      throw createAIError('API_KEY_MISSING', `Configuration invalid: ${validation.errors.join(', ')}`);
    }

    // Initialize Gemini client
    try {
      this.genAI = new GoogleGenerativeAI(this.config.apiKey);

      this.isInitialized = true;
      this.status.isConnected = true;
      this.status.lastError = undefined;

    } catch (error) {
      this.isInitialized = false;
      this.status.isConnected = false;
      this.status.lastError = error instanceof Error ? error.message : 'Failed to initialize Gemini client';
      throw createAIError('API_ERROR', 'Failed to initialize Gemini client', error);
    }
  }

  private async callWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.withTimeout(operation(), this.config.timeoutMs);
      } catch (error) {
        lastError = error as Error;
        
        if (this.config.enableLogging) {
          console.log(`GeminiAIEnhanceService: Attempt ${attempt}/${this.config.maxRetries} failed:`, error);
        }

        // Check if error is retryable
        if (error instanceof Error && 'code' in error) {
          const aiError = error as AIError;
          if (!isRetryableError(aiError) || attempt === this.config.maxRetries) {
            throw error;
          }
        }

        // Wait before retry
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(createAIError('TIMEOUT', `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }

  private parseEnhancementResponse(response: any, originalPrompt: string, startTime: number): EnhancedPromptResult {
    try {
      const responseText = response.response?.text() || '';
      
      // Parse the response to extract enhanced prompt and improvements
      const lines = responseText.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
      
      let enhancedPrompt = '';
      let improvements: string[] = [];
      let confidence = 85; // Default confidence

      // Look for enhanced prompt (usually the first substantial text)
      for (const line of lines) {
        if (line.length > 50 && !line.toLowerCase().includes('improvement') && !line.toLowerCase().includes('confidence')) {
          enhancedPrompt = line;
          break;
        }
      }

      // Look for improvements list
      const improvementLines = lines.filter((line: string) => 
        line.startsWith('-') || 
        line.startsWith('•') || 
        line.startsWith('*') ||
        line.match(/^\d+\./)
      );
      
      if (improvementLines.length > 0) {
        improvements = improvementLines.map((line: string) => 
          line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '').trim()
        );
      }

      // Look for confidence score
      const confidenceMatch = responseText.match(/confidence[:\s]*(\d+)/i);
      if (confidenceMatch) {
        confidence = Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10)));
      }

      // Fallback: if no enhanced prompt found, use original
      if (!enhancedPrompt) {
        enhancedPrompt = originalPrompt;
        improvements = ['No specific improvements identified'];
        confidence = 50;
      }

      return {
        originalPrompt,
        enhancedPrompt,
        improvements,
        confidence,
        processingTime: Date.now() - startTime,
        model: this.config.model
      };

    } catch (error) {
      // Fallback response if parsing fails
      return {
        originalPrompt,
        enhancedPrompt: originalPrompt,
        improvements: ['Failed to parse AI response'],
        confidence: 0,
        processingTime: Date.now() - startTime,
        model: this.config.model
      };
    }
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
