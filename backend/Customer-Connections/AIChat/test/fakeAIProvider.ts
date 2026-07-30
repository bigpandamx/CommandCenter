import type { AICompletionResult, AIProvider } from "../src/aiProvider.js";
import type { ChatRole } from "../src/types.js";

export class FakeAIProvider implements AIProvider {
  calls: { role: ChatRole; content: string }[][] = [];
  nextResponse: AICompletionResult = { content: "This is a fake response.", tokensUsed: 42, model: "fake-model" };
  shouldThrow: Error | null = null;

  async complete(messages: { role: ChatRole; content: string }[]): Promise<AICompletionResult> {
    this.calls.push(messages);
    if (this.shouldThrow) throw this.shouldThrow;
    return this.nextResponse;
  }
}
