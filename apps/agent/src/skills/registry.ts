import { readFileSync, existsSync, writeFileSync } from "fs";

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "community" | "custom";
  /** The tool definition for Claude API */
  toolDefinition: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  };
  /** Handler function name to look up in the loader */
  handler: string;
  installedAt: Date;
}

const SKILLS_FILE = "./journeyman_skills.json";

function loadSkills(): Skill[] {
  if (existsSync(SKILLS_FILE)) {
    try {
      return JSON.parse(readFileSync(SKILLS_FILE, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

function saveSkills(skills: Skill[]) {
  writeFileSync(SKILLS_FILE, JSON.stringify(skills, null, 2));
}

/**
 * Registry of installed skills. Skills are additional capabilities
 * that can be discovered and installed at runtime.
 */
export class SkillRegistry {
  private skills: Skill[];

  constructor() {
    this.skills = loadSkills();
    if (this.skills.length === 0) {
      this.seedBuiltinSkills();
    }
  }

  private seedBuiltinSkills() {
    const builtins: Skill[] = [
      {
        id: "builtin-summarize",
        name: "Summarize Document",
        description: "Summarize a long text, article, or document into key points",
        source: "builtin",
        handler: "summarize_document",
        toolDefinition: {
          name: "summarize_document",
          description: "Summarize a long text into concise key points. Use when asked to summarize articles, documents, or long messages.",
          input_schema: {
            type: "object",
            properties: {
              text: { type: "string", description: "The text to summarize" },
              style: {
                type: "string",
                enum: ["bullets", "paragraph", "executive"],
                description: "Summary style: bullet points, paragraph, or executive summary",
              },
            },
            required: ["text"],
          },
        },
        installedAt: new Date(),
      },
      {
        id: "builtin-draft-email",
        name: "Draft Email/Message",
        description: "Draft a professional email or message based on context and instructions",
        source: "builtin",
        handler: "draft_message",
        toolDefinition: {
          name: "draft_message",
          description: "Draft a professional email or WhatsApp message. Use when asked to write, compose, or draft communications.",
          input_schema: {
            type: "object",
            properties: {
              to: { type: "string", description: "Recipient name or description" },
              subject: { type: "string", description: "Subject or topic of the message" },
              context: { type: "string", description: "Background context and what the message should convey" },
              tone: {
                type: "string",
                enum: ["formal", "friendly", "urgent", "casual"],
                description: "Tone of the message",
              },
            },
            required: ["to", "context"],
          },
        },
        installedAt: new Date(),
      },
      {
        id: "builtin-analyze-data",
        name: "Analyze Data",
        description: "Analyze structured data, find patterns, and generate insights",
        source: "builtin",
        handler: "analyze_data",
        toolDefinition: {
          name: "analyze_data",
          description: "Analyze structured data (CSV, tables, lists) to find patterns and insights. Use when asked to analyze, compare, or find trends.",
          input_schema: {
            type: "object",
            properties: {
              data: { type: "string", description: "The data to analyze (CSV, table, or structured text)" },
              question: { type: "string", description: "Specific question to answer about the data" },
            },
            required: ["data"],
          },
        },
        installedAt: new Date(),
      },
      {
        id: "builtin-generate-report",
        name: "Generate Report",
        description: "Generate a structured report on a topic with sections and findings",
        source: "builtin",
        handler: "generate_report",
        toolDefinition: {
          name: "generate_report",
          description: "Generate a structured report with sections, findings, and recommendations. Use when asked to create reports, analyses, or comprehensive overviews.",
          input_schema: {
            type: "object",
            properties: {
              topic: { type: "string", description: "The topic or subject of the report" },
              sections: {
                type: "string",
                description: "Comma-separated list of sections to include (optional)",
              },
              audience: { type: "string", description: "Who will read this report" },
            },
            required: ["topic"],
          },
        },
        installedAt: new Date(),
      },
      {
        id: "builtin-translate",
        name: "Translate Text",
        description: "Translate text between languages (Arabic/English focus)",
        source: "builtin",
        handler: "translate_text",
        toolDefinition: {
          name: "translate_text",
          description: "Translate text between languages. Optimized for Arabic-English translation. Use when asked to translate messages, documents, or content.",
          input_schema: {
            type: "object",
            properties: {
              text: { type: "string", description: "The text to translate" },
              target_language: { type: "string", description: "Target language (e.g., 'Arabic', 'English', 'French')" },
              preserve_tone: {
                type: "boolean",
                description: "Whether to preserve the original tone and formality level",
              },
            },
            required: ["text", "target_language"],
          },
        },
        installedAt: new Date(),
      },
    ];

    this.skills = builtins;
    saveSkills(this.skills);
  }

  getAll(): Skill[] {
    return this.skills;
  }

  getById(id: string): Skill | undefined {
    return this.skills.find((s) => s.id === id);
  }

  getByHandler(handler: string): Skill | undefined {
    return this.skills.find((s) => s.handler === handler);
  }

  /** Get tool definitions for all installed skills (to pass to Claude) */
  getToolDefinitions(): Skill["toolDefinition"][] {
    return this.skills.map((s) => s.toolDefinition);
  }

  search(query: string): Skill[] {
    const q = query.toLowerCase();
    return this.skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.handler.toLowerCase().includes(q)
    );
  }

  install(skill: Omit<Skill, "installedAt">): Skill {
    const existing = this.skills.find((s) => s.id === skill.id);
    if (existing) return existing;

    const full: Skill = { ...skill, installedAt: new Date() };
    this.skills.push(full);
    saveSkills(this.skills);
    console.log(`[Skills] Installed: ${skill.name}`);
    return full;
  }

  uninstall(id: string): boolean {
    const idx = this.skills.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    this.skills.splice(idx, 1);
    saveSkills(this.skills);
    return true;
  }

  formatList(): string {
    if (this.skills.length === 0) return "No skills installed.";
    return this.skills
      .map((s) => `- *${s.name}* (${s.source}): ${s.description}`)
      .join("\n");
  }
}
