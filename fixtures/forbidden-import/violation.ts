/**
 * DELIBERATE VIOLATION FIXTURE — never delete, never import from product code.
 * Exists solely to prove the forge/forbidden-provider-imports gate fires.
 * If `pnpm verify:boundaries` ever reports fewer than 3 violations here, the
 * boundary has been weakened and CI must fail (QWEN.md §4: no gate weakening).
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const a = require("dashscope");

export const classes = [OpenAI, Anthropic, a];
