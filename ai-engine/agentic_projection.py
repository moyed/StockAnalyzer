"""
Agentic Projection Agent with Tool Calls

This module implements an autonomous agent that:
1. Generates initial projections from historical signals
2. Researches recent developments iteratively
3. Validates assumptions against real-world data
4. Refines projections based on findings
5. Provides evidence trail and reasoning chain
"""

import json
import os
from typing import Any
from datetime import date, datetime
from ddgs import DDGS
import anthropic


class ProjectionAgent:
    """Autonomous agent for financial projections with iterative research."""

    def __init__(
        self,
        company: str,
        symbol: str,
        quarter: str,
        target_quarter: str,
        signals: dict,
        score: int,
        flags: list,
        summary: str,
        current_price: float | None = None,
        macro_context: str | None = None,
        current_date: str | None = None,
        max_rounds: int = 6,
        model: str = "claude-sonnet-4-6"
    ):
        self.company = company
        self.symbol = symbol
        self.quarter = quarter
        self.target_quarter = target_quarter
        self.signals = signals
        self.score = score
        self.flags = flags
        self.summary = summary
        self.current_price = current_price
        self.macro_context = macro_context
        self.current_date = current_date or date.today().isoformat()
        self.max_rounds = max_rounds
        self.model = model

        # Initialize Anthropic client
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not found in environment")
        self.client = anthropic.Anthropic(api_key=api_key)

        # Conversation state
        self.messages = []
        self.tool_calls_made = []
        self.evidence = []
        self.reasoning_chain = []

    def define_tools(self) -> list[dict]:
        """Define tools available to the agent."""
        return [
            {
                "name": "web_search",
                "description": "Search the web for recent news, developments, or information. Use this to find current events, company announcements, sector trends, or verify assumptions. Returns top 5 results with titles, snippets, and URLs.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Specific search query. Be precise and include relevant keywords like company name, sector, year, etc."
                        },
                        "reason": {
                            "type": "string",
                            "description": "Why you're searching - helps track reasoning chain"
                        }
                    },
                    "required": ["query", "reason"]
                }
            },
            {
                "name": "company_news",
                "description": "Get recent company-specific news for the target company. More focused than web_search for company developments. Returns recent headlines and summaries.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "timeframe": {
                            "type": "string",
                            "enum": ["7d", "30d", "90d"],
                            "description": "How far back to look for news"
                        },
                        "reason": {
                            "type": "string",
                            "description": "Why you need company news"
                        }
                    },
                    "required": ["timeframe", "reason"]
                }
            },
            {
                "name": "sector_analysis",
                "description": "Get current sector trends, competitor performance, and industry outlook for the company's sector. Useful for contextualizing company performance against peers.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "focus": {
                            "type": "string",
                            "enum": ["trends", "competitors", "outlook", "regulatory"],
                            "description": "What aspect of sector analysis to focus on"
                        },
                        "reason": {
                            "type": "string",
                            "description": "Why you need sector analysis"
                        }
                    },
                    "required": ["focus", "reason"]
                }
            },
            {
                "name": "validate_assumption",
                "description": "Cross-check a specific assumption or claim against available data. Use this when you've made a projection but want to verify if it's realistic. Returns validation result with supporting evidence.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "assumption": {
                            "type": "string",
                            "description": "The specific assumption to validate (e.g., '40% revenue growth is sustainable')"
                        },
                        "search_query": {
                            "type": "string",
                            "description": "Search query to validate this assumption"
                        }
                    },
                    "required": ["assumption", "search_query"]
                }
            },
            {
                "name": "market_sentiment",
                "description": "Check current market sentiment, analyst views, and price targets for the company. Useful for grounding recommendations in market expectations.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "Why you need market sentiment data"
                        }
                    },
                    "required": ["reason"]
                }
            },
            {
                "name": "finalize_projection",
                "description": "Finalize the projection after sufficient research. Call this when you're confident in your analysis and have validated key assumptions. Returns your final projection in the required JSON format.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "next_quarter_outlook": {
                            "type": "string",
                            "description": "2-3 sentence forward outlook for target quarter"
                        },
                        "projected_revenue_growth_min": {
                            "type": "integer",
                            "description": "Minimum projected revenue growth percentage"
                        },
                        "projected_revenue_growth_max": {
                            "type": "integer",
                            "description": "Maximum projected revenue growth percentage"
                        },
                        "projected_profit_growth_min": {
                            "type": "integer",
                            "description": "Minimum projected profit growth percentage"
                        },
                        "projected_profit_growth_max": {
                            "type": "integer",
                            "description": "Maximum projected profit growth percentage"
                        },
                        "key_catalysts": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of 2-4 key catalysts"
                        },
                        "key_risks": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of 2-4 key risks"
                        },
                        "recommendation": {
                            "type": "string",
                            "enum": ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"],
                            "description": "Investment recommendation"
                        },
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                            "description": "Your confidence level in this projection"
                        },
                        "target_upside_min_pct": {
                            "type": "integer",
                            "description": "Minimum target upside percentage"
                        },
                        "target_upside_max_pct": {
                            "type": "integer",
                            "description": "Maximum target upside percentage"
                        },
                        "reasoning_summary": {
                            "type": "string",
                            "description": "2-3 sentences explaining your reasoning and what research informed your final projection"
                        }
                    },
                    "required": [
                        "next_quarter_outlook",
                        "projected_revenue_growth_min",
                        "projected_revenue_growth_max",
                        "projected_profit_growth_min",
                        "projected_profit_growth_max",
                        "key_catalysts",
                        "key_risks",
                        "recommendation",
                        "confidence",
                        "target_upside_min_pct",
                        "target_upside_max_pct",
                        "reasoning_summary"
                    ]
                }
            }
        ]

    def execute_tool(self, tool_name: str, tool_input: dict) -> str:
        """Execute a tool and return results."""
        self.tool_calls_made.append({
            "tool": tool_name,
            "input": tool_input,
            "timestamp": datetime.now().isoformat()
        })

        if tool_name == "web_search":
            return self._web_search(tool_input["query"], tool_input.get("reason", ""))

        elif tool_name == "company_news":
            timeframe = tool_input["timeframe"]
            days_map = {"7d": 7, "30d": 30, "90d": 90}
            days = days_map.get(timeframe, 30)
            query = f"{self.company} {self.symbol} Pakistan PSX news last {days} days"
            return self._web_search(query, tool_input.get("reason", ""))

        elif tool_name == "sector_analysis":
            focus = tool_input["focus"]
            sector = self._guess_sector()
            query = f"Pakistan {sector} sector {focus} 2026 PSX"
            return self._web_search(query, tool_input.get("reason", ""))

        elif tool_name == "validate_assumption":
            assumption = tool_input["assumption"]
            query = tool_input["search_query"]
            results = self._web_search(query, f"Validating: {assumption}")
            return f"Assumption: {assumption}\n\nValidation Research:\n{results}"

        elif tool_name == "market_sentiment":
            query = f"{self.symbol} {self.company} analyst rating price target PSX Pakistan"
            return self._web_search(query, tool_input.get("reason", ""))

        elif tool_name == "finalize_projection":
            # This tool returns the final projection - handled specially
            return json.dumps(tool_input)

        return "Tool not found"

    def _web_search(self, query: str, reason: str = "") -> str:
        """Execute web search using DuckDuckGo."""
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=5))

            if not results:
                return "No results found."

            self.evidence.append({
                "type": "search",
                "query": query,
                "reason": reason,
                "results_count": len(results)
            })

            lines = []
            for i, r in enumerate(results, 1):
                lines.append(f"{i}. {r.get('title', 'No title')}")
                lines.append(f"   {r.get('body', '')[:300]}")
                if r.get("href"):
                    lines.append(f"   Source: {r['href']}")
                lines.append("")

            return "\n".join(lines)
        except Exception as e:
            return f"Search failed: {e}"

    def _guess_sector(self) -> str:
        """Try to guess sector from company name or return generic."""
        company_lower = self.company.lower()
        if any(word in company_lower for word in ["textile", "fabric", "yarn", "cotton"]):
            return "textile"
        elif any(word in company_lower for word in ["cement"]):
            return "cement"
        elif any(word in company_lower for word in ["bank", "finance"]):
            return "banking"
        elif any(word in company_lower for word in ["oil", "gas", "energy", "power"]):
            return "energy"
        elif any(word in company_lower for word in ["pharma", "medicine", "drug"]):
            return "pharmaceutical"
        return "general"

    def build_system_prompt(self) -> str:
        """Build the system prompt for the agent."""
        return f"""You are an autonomous financial projection agent specializing in Pakistan Stock Exchange (PSX) companies.

Your task is to generate an accurate, well-researched forward projection for {self.company} ({self.symbol}) for {self.target_quarter}.

CONTEXT:
- Company: {self.company} ({self.symbol})
- Source Quarter (historical data): {self.quarter}
- Target Quarter (projection for): {self.target_quarter}
- Current Date: {self.current_date}
- Current Price: PKR {self.current_price if self.current_price else 'N/A'}
- AI Score: {self.score}/100
- Flags: {', '.join(self.flags) if self.flags else 'None'}
- Summary: {self.summary}

HISTORICAL SIGNALS from {self.quarter}:
{self._format_signals()}

{f"MACRO CONTEXT:\n{self.macro_context}\n" if self.macro_context else ""}

AGENTIC PROCESS:
You have access to research tools. Follow this process:

1. INITIAL ASSESSMENT (Round 1)
   - Form initial projection based on historical signals
   - Identify knowledge gaps and assumptions that need validation
   - Plan your research strategy

2. ITERATIVE RESEARCH (Rounds 2-5)
   - Use tools to fill knowledge gaps:
     * company_news: Recent company-specific developments
     * sector_analysis: Industry trends and competitive context
     * market_sentiment: Analyst views and market expectations
     * web_search: Specific questions or validations
   - After each tool use, incorporate findings into your analysis
   - Validate key assumptions that drive your projection
   - Adjust projections based on evidence

3. SELF-CRITIQUE & VALIDATION
   - Use validate_assumption to cross-check critical claims
   - Ask yourself:
     * Is this growth rate realistic given sector conditions?
     * Am I missing recent developments?
     * Do my catalysts/risks reflect current reality?
     * Is my recommendation justified by evidence?

4. FINALIZE (Final Round)
   - When confident (after 4-5 rounds of research), call finalize_projection
   - Ensure your projection integrates all research findings
   - Include a reasoning_summary that explains what research informed your decision

GUIDELINES:
- Be thorough but efficient (aim for 4-6 rounds total)
- Always ground projections in evidence, not speculation
- Validate assumptions for any growth > 30% or upside > 20%
- Factor in Pakistan-specific context (PKR, inflation, political stability, sector regulations)
- Be realistic - PSX companies face macro headwinds
- Your confidence level should reflect research depth and evidence quality

PROJECTION TARGETS:
- Recommendation: Strong Buy (15-30% upside), Buy (5-20%), Hold (-5 to 5%), Sell (-15 to -5%), Strong Sell (-30 to -15%)
- Growth ranges: Give realistic min/max ranges, not point estimates
- Catalysts/risks: Be specific, not generic

Start by analyzing the historical signals and planning your research approach."""

    def _format_signals(self) -> str:
        """Format signals for the prompt."""
        lines = []
        for key, value in self.signals.items():
            lines.append(f"  - {key}: {value}")
        return "\n".join(lines)

    def run(self) -> dict:
        """Run the agentic loop and return final projection."""
        system_prompt = self.build_system_prompt()
        tools = self.define_tools()

        # Initial message
        self.messages.append({
            "role": "user",
            "content": f"Begin your agentic research process for {self.company} ({self.symbol}). Start by assessing the historical signals and planning your research strategy."
        })

        final_projection = None

        for round_num in range(1, self.max_rounds + 1):
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=self.messages,
                    tools=tools,
                )

                # Track reasoning
                self.reasoning_chain.append({
                    "round": round_num,
                    "thinking": self._extract_text_content(response.content)
                })

                # Add assistant response to conversation
                self.messages.append({
                    "role": "assistant",
                    "content": response.content
                })

                # Check stop reason
                if response.stop_reason == "end_turn":
                    # Agent finished without finalizing - this shouldn't happen
                    # Force finalization with current best guess
                    break

                elif response.stop_reason == "tool_use":
                    # Process tool calls
                    tool_results = []

                    for block in response.content:
                        if block.type == "tool_use":
                            tool_name = block.name
                            tool_input = block.input

                            # Execute tool
                            if tool_name == "finalize_projection":
                                # Agent is done - extract final projection
                                final_projection = tool_input
                                final_projection["rounds_completed"] = round_num
                                final_projection["tool_calls_made"] = len(self.tool_calls_made)
                                return self._format_final_output(final_projection)
                            else:
                                # Execute research tool
                                result = self.execute_tool(tool_name, tool_input)
                                tool_results.append({
                                    "type": "tool_result",
                                    "tool_use_id": block.id,
                                    "content": result
                                })

                    # Add tool results to conversation
                    if tool_results:
                        self.messages.append({
                            "role": "user",
                            "content": tool_results
                        })

                elif response.stop_reason == "max_tokens":
                    # Hit token limit - continue
                    self.messages.append({
                        "role": "user",
                        "content": "Continue your analysis (you hit the token limit)."
                    })

            except Exception as e:
                # On error, try to continue or break
                print(f"Error in round {round_num}: {e}")
                if round_num >= 3:
                    # If we've done some research, break and force finalization
                    break
                else:
                    raise

        # If we exit loop without finalization, return error or fallback
        if not final_projection:
            raise RuntimeError(
                f"Agent did not finalize projection after {self.max_rounds} rounds. "
                f"This suggests the agent needs more guidance or hit an error."
            )

    def _extract_text_content(self, content: list) -> str:
        """Extract text content from response blocks."""
        texts = []
        for block in content:
            if hasattr(block, 'text'):
                texts.append(block.text)
        return "\n".join(texts)

    def _format_final_output(self, projection: dict) -> dict:
        """Format final output with metadata."""
        return {
            **projection,
            "metadata": {
                "rounds_completed": projection.pop("rounds_completed", 0),
                "tool_calls_made": projection.pop("tool_calls_made", 0),
                "model": self.model,
                "date_generated": self.current_date,
                "agentic": True
            },
            "evidence_trail": self.evidence,
            "reasoning_chain": [
                {
                    "round": r["round"],
                    "summary": r["thinking"][:500]  # Truncate for response size
                }
                for r in self.reasoning_chain
            ],
            "tool_calls": [
                {
                    "tool": tc["tool"],
                    "reason": tc["input"].get("reason", ""),
                    "timestamp": tc["timestamp"]
                }
                for tc in self.tool_calls_made
            ]
        }
