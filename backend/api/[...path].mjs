import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleRequest } = require('../server.js');

export default function handler(req, res) {
  req.url = req.url.replace(/^\/api(?=\/|$)/, '') || '/';
  return handleRequest(req, res);
}
