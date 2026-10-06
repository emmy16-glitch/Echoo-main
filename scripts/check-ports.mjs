import net from 'net';

const firstArg = process.argv[2] || '';
const secondArg = process.argv[3] || '';
const parsedArgPort = Number.parseInt(firstArg, 10);
const port = Number.isFinite(parsedArgPort)
  ? parsedArgPort
  : Number.parseInt(process.env.PORT || '5017', 10);
const label = Number.isFinite(parsedArgPort)
  ? secondArg || 'service'
  : firstArg || 'service';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`check-ports: PORT must be an integer from 1 to 65535. Got: ${process.env.PORT || firstArg}`);
  process.exit(2);
}

const server = net.createServer();

server.once('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`check-ports: port ${port} is already in use - ${label} refuses to start behind another server.`);
    console.error(`check-ports: stop the occupant or rerun with a free port, for example: set PORT=5020 && npm run dev`);
    process.exit(1);
  }

  console.error(`check-ports: could not check port ${port}: ${error?.message || error}`);
  process.exit(1);
});

server.once('listening', () => {
  server.close(() => {
    console.log(`check-ports: port ${port} is free - starting ${label}.`);
    process.exit(0);
  });
});

server.listen(port, '0.0.0.0');
