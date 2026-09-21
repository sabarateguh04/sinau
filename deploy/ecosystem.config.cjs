// PM2 process file. Usage (di server):
//   npm run install:all && npm run build
//   pm2 start deploy/ecosystem.config.cjs && pm2 save
// Satu proses melayani API + frontend statis di PORT (default 4008).
module.exports = {
  apps: [
    {
      name: 'sinau',
      cwd: __dirname + '/../backend',
      script: 'dist/server.js',
      instances: 1, // job worker in-process: keep 1 instance (or set ENABLE_JOBS=false on extra instances)
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', PORT: 4008 },
      out_file: '../logs/sinau.out.log',
      error_file: '../logs/sinau.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
