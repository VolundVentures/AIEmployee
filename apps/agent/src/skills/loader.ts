import Anthropic from "@anthropic-ai/sdk";
import { SkillRegistry } from "./registry.js";
import type { Skill } from "./registry.js";

/**
 * Executes skill handlers. In the future, skills could be external
 * MCP tools or dynamically loaded modules. For now, built-in skills
 * are handled inline -- Claude does the actual work through its
 * own capabilities, guided by the tool's structured input.
 */
export class SkillLoader {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * Check if a tool name belongs to a skill (vs core agent tools).
   */
  isSkillTool(toolName: string): boolean {
    return this.registry.getByHandler(toolName) !== undefined;
  }

  /**
   * Execute a skill handler. Built-in skills return structured prompts
   * that Claude will process as part of the tool-use loop.
   */
  async execute(toolName: string, input: Record<string, unknown>): Promise<string> {
    const skill = this.registry.getByHandler(toolName);
    if (!skill) {
      return `Skill not found: ${toolName}. Use find_skill to discover available skills.`;
    }

    switch (toolName) {
      case "summarize_document": {
        const text = input.text as string;
        const style = (input.style as string) || "bullets";
        const preview = text.length > 200 ? text.slice(0, 200) + "..." : text;
        return `[Summarize skill activated]\nText (${text.length} chars): ${preview}\nStyle: ${style}\n\nPlease provide a ${style}-style summary of the above text.`;
      }

      case "draft_message": {
        const to = input.to as string;
        const subject = input.subject as string | undefined;
        const context = input.context as string;
        const tone = (input.tone as string) || "professional";
        return `[Draft message skill activated]\nTo: ${to}\n${subject ? `Subject: ${subject}\n` : ""}Context: ${context}\nTone: ${tone}\n\nPlease draft this message based on the above parameters.`;
      }

      case "analyze_data": {
        const data = input.data as string;
        const question = input.question as string | undefined;
        return `[Data analysis skill activated]\nData:\n${data}\n${question ? `\nQuestion: ${question}` : ""}\n\nPlease analyze this data and provide key insights.`;
      }

      case "generate_report": {
        const topic = input.topic as string;
        const sections = input.sections as string | undefined;
        const audience = input.audience as string | undefined;
        return `[Report generation skill activated]\nTopic: ${topic}\n${sections ? `Sections: ${sections}\n` : ""}${audience ? `Audience: ${audience}\n` : ""}\n\nPlease generate a structured report on this topic.`;
      }

      case "translate_text": {
        const text = input.text as string;
        const targetLang = input.target_language as string;
        const preserveTone = input.preserve_tone as boolean;
        return `[Translation skill activated]\nText: ${text}\nTarget: ${targetLang}\nPreserve tone: ${preserveTone ?? true}\n\nPlease translate the text to ${targetLang}.`;
      }

      default:
        return `Skill handler "${toolName}" exists but has no implementation yet. This skill may need to be updated.`;
    }
  }

  /**
   * Get all skill tool definitions to merge with core agent tools.
   */
  getToolDefinitions(): Anthropic.Tool[] {
    return this.registry.getToolDefinitions().map((def) => ({
      name: def.name,
      description: def.description,
      input_schema: def.input_schema as Anthropic.Tool.InputSchema,
    }));
  }
}
