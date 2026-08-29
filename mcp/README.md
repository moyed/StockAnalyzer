# StockAnalyzer MCP Server

MCP (Model Context Protocol) server that exposes the PSX StockAnalyzer platform
as tools for AI assistants to answer customer queries about Pakistan Stock Exchange companies.

## Tools

| Tool | Description |
|------|-------------|
| `search_companies` | Search by name/symbol with filters for sector, Sharia, defaulters |
| `get_company` | Full details — filings, scores, signals, price |
| `get_company_filings` | Quarterly filing history with AI analysis |
| `get_company_projection` | Forward-looking AI projection (outlook, recommendation, targets) |
| `get_company_news` | Latest news with sentiment and AI summaries |
| `get_company_price_history` | Historical OHLCV price data |
| `get_sector_stats` | Sector-level averages, top companies, defaulter counts |
| `list_sectors` | All PSX sectors available in the platform |
| `get_top_companies` | Highest-scored companies, filterable by sector/Sharia |
| `get_market_briefing` | Daily AI-generated market briefing |
| `compare_companies` | Side-by-side comparison of up to 5 companies |

## Resources

- `psx://sectors` — full sector list
- `psx://company/{symbol}` — quick company summary

## Prompts

- `analyze_stock(symbol)` — comprehensive single-stock analysis workflow
- `sector_comparison(sector)` — sector-level analysis workflow

## Setup

```bash
cd mcp

# 1. Create a Python virtualenv
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure
cp .env.example .env
# Edit .env — set API_BASE_URL and API_TOKEN

# Generate an API token from the Laravel shell:
# docker compose exec api php artisan tinker
# >>> User::first()->createToken('mcp-server')->plainTextToken

# 4. Run (stdio transport — for Claude Desktop / Claude Code)
python server.py
```

## Integration with Claude Code / Claude Desktop

Add to your MCP configuration (`~/.claude/settings.json` or Claude Desktop config):

```json
{
  "mcpServers": {
    "stockanalyzer": {
      "command": "python",
      "args": ["/path/to/StockAnalyzer/mcp/server.py"],
      "env": {
        "API_BASE_URL": "http://localhost:8000/api",
        "API_TOKEN": "your-token"
      }
    }
  }
}
```

Or with `uv` (no venv needed):

```json
{
  "mcpServers": {
    "stockanalyzer": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/StockAnalyzer/mcp", "server.py"],
      "env": {
        "API_BASE_URL": "http://localhost:8000/api",
        "API_TOKEN": "your-token"
      }
    }
  }
}
```

## Docker

The server can be added to `docker-compose.yml` as a sidecar:

```yaml
  mcp:
    build:
      context: ./mcp
      dockerfile: Dockerfile
    environment:
      API_BASE_URL: http://api:8000/api
      API_TOKEN: ${MCP_API_TOKEN}
    stdin_open: true
    tty: true
```
