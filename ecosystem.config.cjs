module.exports = {
  apps: [
    {
      name: 'mav-assistant',
      script: 'server.mjs',
      cwd: 'C:\\Workspace\\Active\\maverick-assistant',
      interpreter: 'node',
      watch: false,
      autorestart: true,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
        PORT: '3012',
        MCC_URL: 'http://localhost:3011',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      windowsHide: true,
    }
  ]
};
