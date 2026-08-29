"""
Agentic Projection Agent with Tool Calls - Using Gradient AI

This module implements an autonomous agent using Gradient AI SDK that:
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
from gradient import Gradient


class ProjectionAgentGradient:
    """Autonomous agent for financial projections using Gradient AI."""

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
        gradient_client = None,
        model_id: str = None
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
        self.gradient = gradient_client
        self.model_id = model_id or os.getenv("GRADIENT_MODEL_ID", "deepseek-4-flash")

        # Conversation state
        self.messages = []
        self.tool_calls_made = []
        self.evidence = []
        self.reasoning_chain = []
        self.current_round = 0

    def get_available_tools(self) -> list[dict]:
        """Return list of available tools for the agent."""
        return [
            {
                "name": "web_search",
                "description": "Search the web for recent news, developments, or information",
                "parameters": "query (string): search query, reason (string): why searching"
            },
            {
                "name": "company_news",
                "description": "Get recent company-specific news",
                "parameters": "timeframe (7d/30d/90d): how far back, reason (string): why needed"
            },
            {
                "name": "sector_analysis",
                "description": "Get sector trends and competitor performance",
                "parameters": "focus (trends/competitors/outlook/regulatory), reason (string)"
            },
            {
                "name": "validate_assumption",
                "description": "Cross-check a specific assumption",
                "parameters": "assumption (string): claim to validate, search_query (string)"
            },
            {
                "name": "market_sentiment",
                "description": "Check analyst views and price targets",
                "parameters": "reason (string): why needed"
            },
            {
                "name": "finalize_projection",
                "description": "Complete the projection with final output",
                "parameters": "all projection fields (see format below)"
            }
        ]

    def execute_tool(self, tool_name: str, tool_params: dict) -> str:
        """Execute a tool and return results."""
        self.tool_calls_made.append({
            "tool": tool_name,
            "input": tool_params,
            "timestamp": datetime.now().isoformat()
        })

        if tool_name == "web_search":
            return self._web_search(tool_params.get("query", ""), tool_params.get("reason", ""))

        elif tool_name == "company_news":
            timeframe = tool_params.get("timeframe", "30d")
            days_map = {"7d": 7, "30d": 30, "90d": 90}
            days = days_map.get(timeframe, 30)
            query = f"{self.company} {self.symbol} Pakistan PSX news last {days} days"
            return self._web_search(query, tool_params.get("reason", ""))

        elif tool_name == "sector_analysis":
            focus = tool_params.get("focus", "trends")
            sector = self._guess_sector()
            query = f"Pakistan {sector} sector {focus} 2026 PSX"
            return self._web_search(query, tool_params.get("reason", ""))

        elif tool_name == "validate_assumption":
            assumption = tool_params.get("assumption", "")
            query = tool_params.get("search_query", "")
            results = self._web_search(query, f"Validating: {assumption}")
            return f"Assumption: {assumption}\n\nValidation Research:\n{results}"

        elif tool_name == "market_sentiment":
            query = f"{self.symbol} {self.company} analyst rating price target PSX Pakistan"
            return self._web_search(query, tool_params.get("reason", ""))

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
        """Try to guess sector from company name."""
        company_lower = self.company.lower()
        if any(word in company_lower for word in ["textile", "fabric", "yarn", "cotton"]):
            return "textile"
        elif any(word in company_lower for word in ["cement"]):
            return "cement"
        elif any(word in company_lower for word in ["bank", "finance"]):
            return "banking"
        elif any(word in company_lower for word in ["oil", "gas", "energy", "power", "refinery"]):
            return "energy"
        elif any(word in company_lower for word in ["pharma", "medicine", "drug"]):
            return "pharmaceutical"
        return "general"

    def build_system_prompt(self) -> str:
        """Build the system prompt for the agent."""
        tools_list = "\n".join([f"  • {t['name']}: {t['description']}" for t in self.get_available_tools()])

        return f"""You are an autonomous financial projection agent for Pakistan Stock Exchange (PSX) companies.

TASK: Generate an accurate, well-researched forward projection for {self.company} ({self.symbol}) for {self.target_quarter}.

CONTEXT:
- Company: {self.company} ({self.symbol})
- Source Quarter: {self.quarter}
- Target Quarter: {self.target_quarter}
- Current Date: {self.current_date}
- Current Price: PKR {self.current_price if self.current_price else 'N/A'}
- AI Score: {self.score}/100
- Flags: {', '.join(self.flags) if self.flags else 'None'}

Historical Signals from {self.quarter}:
{self._format_signals()}

{f"Macro Context:\n{self.macro_context}\n" if self.macro_context else ""}

AVAILABLE TOOLS:
{tools_list}

AGENTIC PROCESS (6 rounds max):

Round 1: INITIAL ASSESSMENT
- Analyze historical signals
- Identify knowledge gaps
- Plan research strategy
- Respond with: reasoning + tool call

Round 2-5: ITERATIVE RESEARCH
- Use tools to fill gaps
- Incorporate findings
- Validate assumptions
- Adjust projections
- Respond with: reasoning + tool call OR finalize

Round 6: MUST FINALIZE
- Call finalize_projection with complete output

TOOL CALL FORMAT:
When you want to use a tool, respond in this EXACT JSON format:
{{
  "thinking": "your reasoning (1-2 sentences)",
  "tool": "tool_name",
  "params": {{
    "param1": "value1",
    "param2": "value2"
  }}
}}

FINALIZE FORMAT:
When ready to finalize (call finalize_projection), use:
{{
  "thinking": "final reasoning",
  "tool": "finalize_projection",
  "params": {{
    "next_quarter_outlook": "2-3 sentence outlook",
    "projected_revenue_growth_min": 10,
    "projected_revenue_growth_max": 20,
    "projected_profit_growth_min": 15,
    "projected_profit_growth_max": 25,
    "key_catalysts": ["catalyst1", "catalyst2"],
    "key_risks": ["risk1", "risk2"],
    "recommendation": "Buy",
    "confidence": "high",
    "target_upside_min_pct": 5,
    "target_upside_max_pct": 15,
    "reasoning_summary": "explain what research informed this"
  }}
}}

IMPORTANT:
- Round {self.current_round + 1}/6 right now
- Always respond with valid JSON
- Use tools strategically (not all tools needed)
- Validate key assumptions before finalizing
- Factor Pakistan context (PKR, inflation, sector)
- If Round 6, MUST finalize

Begin analysis now."""

    def _format_signals(self) -> str:
        """Format signals for the prompt."""
        lines = []
        for key, value in self.signals.items():
            lines.append(f"  - {key}: {value}")
        return "\n".join(lines)

    def parse_agent_response(self, response_text: str) -> dict:
        """Parse agent's JSON response."""
        # Try to extract JSON from response
        response_text = response_text.strip()

        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text

        # Try to find JSON object
        import re
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            response_text = json_match.group()

        try:
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            # If parsing fails, return a default continue structure
            return {
                "thinking": response_text[:200],
                "error": f"Failed to parse JSON: {e}",
                "tool": None
            }

    def call_gradient(self, user_message: str) -> str:
        """Call Gradient AI with the current conversation."""
        self.messages.append({"role": "user", "content": user_message})

        try:
            response = self.gradient.chat.completions.create(
                model=self.model_id,
                messages=self.messages,
                max_tokens=2048,
                temperature=0.2
            )

            assistant_message = response.choices[0].message.content
            self.messages.append({"role": "assistant", "content": assistant_message})

            return assistant_message
        except Exception as e:
            raise RuntimeError(f"Gradient API error: {str(e)}")

    def run(self) -> dict:
        """Run the agentic loop and return final projection."""
        system_prompt = self.build_system_prompt()

        # Initialize conversation with system prompt
        self.messages = [{"role": "system", "content": system_prompt}]

        # Start first round
        user_prompt = f"Begin Round 1: Analyze the signals and plan your research strategy."

        for round_num in range(1, self.max_rounds + 1):
            self.current_round = round_num

            try:
                # Get agent response
                response_text = self.call_gradient(user_prompt)

                # Track reasoning
                self.reasoning_chain.append({
                    "round": round_num,
                    "thinking": response_text[:500]
                })

                # Parse response
                parsed = self.parse_agent_response(response_text)

                # Check for errors
                if "error" in parsed:
                    if round_num == self.max_rounds:
                        # Force finalization on last round
                        return self._force_finalize()
                    else:
                        # Continue to next round
                        user_prompt = f"Continue to Round {round_num + 1}. Previous response had an error. Please respond with valid JSON."
                        continue

                # Check if finalizing
                if parsed.get("tool") == "finalize_projection":
                    params = parsed.get("params", {})
                    params["rounds_completed"] = round_num
                    params["tool_calls_made"] = len(self.tool_calls_made)
                    return self._format_final_output(params)

                # Execute tool
                tool_name = parsed.get("tool")
                tool_params = parsed.get("params", {})

                if tool_name:
                    # Execute the tool
                    tool_result = self.execute_tool(tool_name, tool_params)

                    # Provide result to agent
                    user_prompt = f"Tool '{tool_name}' result:\n\n{tool_result}\n\nContinue to Round {round_num + 1}. Incorporate these findings."
                else:
                    # No tool call, continue
                    user_prompt = f"Continue to Round {round_num + 1}."

                # Force finalization on last round
                if round_num == self.max_rounds:
                    user_prompt = "Round 6 (FINAL). You MUST call finalize_projection now with your best projection."

            except Exception as e:
                if round_num >= 3:
                    # If we've done some research, force finalize
                    return self._force_finalize()
                else:
                    raise RuntimeError(f"Agent failed in round {round_num}: {str(e)}")

        # Should not reach here, but force finalize if we do
        return self._force_finalize()

    def _force_finalize(self) -> dict:
        """Force finalization with a basic projection."""
        # Safely get numeric values with defaults
        rev_growth = self.signals.get('revenue_growth_pct') or 0
        profit_growth = self.signals.get('profit_growth_pct') or 0

        # Convert to int if they're strings or other types
        try:
            rev_growth = int(float(rev_growth))
        except (ValueError, TypeError):
            rev_growth = 0

        try:
            profit_growth = int(float(profit_growth))
        except (ValueError, TypeError):
            profit_growth = 0

        return self._format_final_output({
            "next_quarter_outlook": f"Based on {self.quarter} signals, {self.company} shows {'positive' if self.score > 55 else 'mixed'} momentum for {self.target_quarter}.",
            "projected_revenue_growth_min": max(-10, rev_growth - 10),
            "projected_revenue_growth_max": max(0, rev_growth + 5),
            "projected_profit_growth_min": max(-15, profit_growth - 10),
            "projected_profit_growth_max": max(0, profit_growth + 5),
            "key_catalysts": [f for f in self.flags if 'GROWTH' in f or 'EXPANSION' in f or 'PROJECT' in f][:3] or ["Operational continuity"],
            "key_risks": [f for f in self.flags if 'RISK' in f or 'HEADWIND' in f or 'DEFAULTER' in f][:3] or ["Market volatility"],
            "recommendation": "Buy" if self.score > 70 else "Hold" if self.score > 55 else "Sell",
            "confidence": "low",
            "target_upside_min_pct": -5,
            "target_upside_max_pct": 5,
            "reasoning_summary": "Projection based on limited research - agent did not complete full analysis.",
            "rounds_completed": self.current_round,
            "tool_calls_made": len(self.tool_calls_made)
        })

    def _format_final_output(self, projection: dict) -> dict:
        """Format final output with metadata."""
        return {
            **projection,
            "metadata": {
                "rounds_completed": projection.pop("rounds_completed", self.current_round),
                "tool_calls_made": projection.pop("tool_calls_made", len(self.tool_calls_made)),
                "model": self.model_id,
                "date_generated": self.current_date,
                "agentic": True,
                "engine": "gradient"
            },
            "evidence_trail": self.evidence,
            "reasoning_chain": [
                {
                    "round": r["round"],
                    "summary": r["thinking"][:500]
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
