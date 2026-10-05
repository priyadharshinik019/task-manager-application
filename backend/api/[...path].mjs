import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleRequest } = require('../server.js');

function createNodeRequest(request, url) {
  const body = request.body
    ? Readable.fromWeb(request.body)
    : Readable.from([]);

  body.method = request.method;
  body.url = `${url.pathname.replace(/^\/api(?=\/|$)/, '') || '/'}${url.search}`;
  body.headers = Object.fromEntries(request.headers);

  return body;
}

function createNodeResponse() {
  let statusCode = 200;
  let headers = new Headers();
  let resolveResponse;

  const completed = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  return {
    completed,
    response: {
      headersSent: false,
      setHeader(name, value) {
        headers.set(name, value);
      },
      writeHead(status, responseHeaders = {}) {
        statusCode = status;
        for (const [name, value] of Object.entries(responseHeaders)) {
          headers.set(name, value);
        }
        this.headersSent = true;
      },
      end(body = '') {
        this.headersSent = true;
        resolveResponse(new Response(
          statusCode === 204 || statusCode === 304 ? null : body,
          { status: statusCode, headers }
        ));
      }
    }
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const nodeRequest = createNodeRequest(request, url);
    const nodeResponse = createNodeResponse();

    handleRequest(nodeRequest, nodeResponse.response);
    return nodeResponse.completed;
  }
};
