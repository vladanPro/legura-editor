import { createPilotServer } from '../tests/pilot-server.mjs';

const server = createPilotServer();
server.listen(3947, '127.0.0.1', () => {
  console.log('Editor pilot: http://127.0.0.1:3947/examples/richtext.html');
});
