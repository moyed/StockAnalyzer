#!/bin/bash

# StockAnalyzer Service Management Script
PROJECT_DIR="/Users/ansari/Projects/AI Projects/StockAnalyzer"

case "$1" in
  start)
    echo "🚀 Starting all StockAnalyzer services..."
    cd "$PROJECT_DIR"
    pm2 start ecosystem.config.js
    echo "✅ All services started!"
    pm2 status
    ;;

  stop)
    echo "🛑 Stopping all StockAnalyzer services..."
    pm2 stop all
    echo "✅ All services stopped!"
    ;;

  restart)
    echo "🔄 Restarting all StockAnalyzer services..."
    pm2 restart all
    echo "✅ All services restarted!"
    pm2 status
    ;;

  status)
    echo "📊 StockAnalyzer Services Status:"
    pm2 status
    echo ""
    echo "🔍 Health Checks:"
    echo -n "API (port 8000): "
    curl -s http://localhost:8000/api/health | jq -r '.status' 2>/dev/null || echo "OFFLINE"
    echo -n "AI Engine (port 8003): "
    curl -s http://localhost:8003/health | jq -r '.status' 2>/dev/null || echo "OFFLINE"
    echo -n "Frontend (port 3000): "
    curl -s http://localhost:3000 > /dev/null 2>&1 && echo "OK" || echo "OFFLINE"
    ;;

  logs)
    if [ -z "$2" ]; then
      echo "📝 Showing all logs (Ctrl+C to exit)..."
      pm2 logs
    else
      echo "📝 Showing logs for $2..."
      pm2 logs "$2"
    fi
    ;;

  monitor)
    echo "📈 Opening PM2 monitoring dashboard..."
    pm2 monit
    ;;

  setup-startup)
    echo "🔧 Setting up auto-startup on system boot..."
    echo "Please run this command manually:"
    echo ""
    echo "sudo env PATH=\$PATH:/opt/homebrew/Cellar/node/26.3.0/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u ansari --hp /Users/ansari"
    echo ""
    echo "Then run: pm2 save"
    ;;

  urls)
    echo "🌐 Application URLs:"
    echo "   Frontend:   http://localhost:3000"
    echo "   API:        http://localhost:8000"
    echo "   AI Engine:  http://localhost:8003"
    echo "   API Health: http://localhost:8000/api/health"
    ;;

  test-queue)
    echo "🧪 Testing queue processing..."
    echo "Getting auth token..."
    TOKEN=$(curl -s -X POST http://localhost:8000/api/login \
      -H "Content-Type: application/json" \
      -d '{"email":"demo@stockanalyzer.com","password":"password"}' | jq -r '.token')

    if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
      echo "❌ Failed to get auth token"
      exit 1
    fi

    echo "✓ Authenticated"
    echo ""
    echo "Triggering test rescan for company $2..."
    COMPANY_ID=${2:-634}

    RESULT=$(curl -s -X POST "http://localhost:8000/api/companies/$COMPANY_ID/rescan" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json")

    echo "$RESULT" | jq '.'
    echo ""
    echo "📊 Queue status:"
    curl -s http://localhost:8000/api/health | jq '.checks.queue'
    ;;

  queue-status)
    echo "📊 Detailed Queue Status"
    echo "======================="
    echo ""
    curl -s http://localhost:8000/api/health | jq '.checks.queue'
    echo ""
    echo "Active Queue Workers:"
    pm2 list | grep queue-worker
    ;;

  *)
    echo "📘 StockAnalyzer Service Manager"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|logs|monitor|setup-startup|urls|test-queue|queue-status}"
    echo ""
    echo "Commands:"
    echo "  start              - Start all services"
    echo "  stop               - Stop all services"
    echo "  restart            - Restart all services"
    echo "  status             - Show service status and health checks"
    echo "  logs [service]     - Show logs (all or specific service)"
    echo "  monitor            - Open PM2 monitoring dashboard"
    echo "  setup-startup      - Show command to enable auto-startup"
    echo "  urls               - Show application URLs"
    echo "  test-queue [id]    - Test queue by rescanning a company (default: 634)"
    echo "  queue-status       - Show detailed queue status"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 logs frontend"
    echo "  $0 test-queue 60"
    echo "  $0 queue-status"
    exit 1
    ;;
esac
