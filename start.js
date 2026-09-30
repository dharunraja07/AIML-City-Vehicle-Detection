const { spawn, execSync } = require('child_process');
const path = require('path');

console.log('===========================================================');
console.log('    🚀 NetraTrack One-Command Master Launcher');
console.log('    BEL SIH-26127: ANPR Trajectory Tracking & Traffic AI');
console.log('===========================================================\n');

// 1. Clean up stale port listeners (5000, 8000, 5173) safely
try {
  console.log('[1/4] Clearing stale port listeners (5000, 8000, 5173)...');
  execSync('powershell -Command "Get-NetTCPConnection -LocalPort 5000,8000,5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Where-Object { $_ -ne $PID } | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', { stdio: 'ignore' });
} catch (e) {
  // Ignore cleanup errors
}

// 2. Seed Database First
try {
  console.log('\n[2/4] Seeding MongoDB Database...');
  execSync('node scripts/seed.js', { cwd: path.join(__dirname, 'server'), stdio: 'inherit' });
} catch (err) {
  console.warn('[Warning] Seed script warning (MongoDB may already be seeded):', err.message);
}

console.log('\n[3/4] Launching All Services Concurrently...\n');

const services = [
  {
    name: 'EXPRESS-SERVER',
    cmd: 'node',
    args: ['server.js'],
    cwd: path.join(__dirname, 'server'),
    color: '\x1b[36m' // Cyan
  },
  {
    name: 'FASTAPI-ML-ENGINE',
    cmd: 'py',
    args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    cwd: path.join(__dirname, 'ml-service'),
    color: '\x1b[35m' // Magenta
  },
  {
    name: 'TRAFFIC-SIMULATOR',
    cmd: 'node',
    args: ['simulator.js'],
    cwd: path.join(__dirname, 'simulator'),
    color: '\x1b[33m' // Yellow
  },
  {
    name: 'REACT-CLIENT',
    cmd: 'npm.cmd',
    args: ['run', 'dev'],
    cwd: path.join(__dirname, 'client'),
    color: '\x1b[32m' // Green
  }
];

const processes = [];

services.forEach(service => {
  console.log(` Starting ${service.name}...`);
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd,
    shell: true
  });

  child.stdout.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line) console.log(`${service.color}[${service.name}]\x1b[0m ${line}`);
    });
  });

  child.stderr.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line) console.error(`${service.color}[${service.name} ERR]\x1b[0m ${line}`);
    });
  });

  child.on('close', code => {
    console.log(`[${service.name}] Process exited with code ${code}`);
  });

  processes.push(child);
});

console.log('\n===========================================================');
console.log(' ✨ ALL SERVICES LIVE AND RUNNING!');
console.log(' 🌐 Production Dashboard:   http://localhost:5000');
console.log(' ⚡ Dev Live-Reload UI:    http://localhost:5173');
console.log(' ⚙️ Express Backend API:    http://localhost:5000/api/health');
console.log(' 🤖 FastAPI ML Service:     http://localhost:8000/docs');
console.log('===========================================================\n');

process.on('SIGINT', () => {
  console.log('\nShutting down all NetraTrack services...');
  processes.forEach(p => p.kill());
  process.exit(0);
});
