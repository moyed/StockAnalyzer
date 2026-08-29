module.exports = {
  apps: [
    // Frontend - Next.js
    {
      name: 'frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },

    // API - Laravel
    {
      name: 'api',
      cwd: './api',
      script: 'php',
      args: 'artisan serve --host=0.0.0.0 --port=8000',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },

    // AI Engine - FastAPI
    {
      name: 'ai-engine',
      cwd: './ai-engine',
      script: 'venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8003 --workers 10',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },

    // Queue Workers - rescan-priority pool
    {
      name: 'queue-worker',
      cwd: './api',
      script: 'php',
      args: 'artisan queue:work --queue=rescan,default --sleep=3 --tries=3 --timeout=300',
      interpreter: 'none',
      instances: 7,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      // Give queue:work up to the job --timeout (300s) to finish its current
      // job on SIGINT before pm2 force-kills it, so jobs aren't re-queued.
      kill_timeout: 310000,
    },

    // Queue Workers - default-only pool, so default jobs progress even
    // while the rescan queue is busy
    {
      name: 'queue-worker-default',
      cwd: './api',
      script: 'php',
      args: 'artisan queue:work --queue=default --sleep=3 --tries=3 --timeout=300',
      interpreter: 'none',
      instances: 3,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      kill_timeout: 310000,
    },

    // Scheduled Tasks Worker (for cron jobs)
    {
      name: 'scheduler',
      cwd: './api',
      script: 'php',
      args: 'artisan schedule:work',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
    },
  ],
};
