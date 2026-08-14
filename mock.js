// Three local endpoints for testing, so the project has no external
// dependencies. Run with: node mock.js
const http = require('http');

const make = (port, handler) => http.createServer(handler).listen(port,
    () => console.log(`mock listening on ${port}`));

make(9001, (req, res) => { res.writeHead(200); res.end(JSON.stringify({ status: 'ok' })); });
make(9002, (req, res) => { res.writeHead(200); res.end(JSON.stringify({ status: 'ok' })); });
// Third one fails, to demonstrate the DEGRADED path and the 503.
make(9003, (req, res) => { res.writeHead(503); res.end(JSON.stringify({ status: 'error' })); });
